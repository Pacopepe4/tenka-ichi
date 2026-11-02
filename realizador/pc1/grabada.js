// Modo partida grabada: todo en un solo PC, con una repetición (.rofl) abierta en el cliente de LoL.
//
//   npm run grabada
//
// 1. Exploración: el realizador pone la repetición al principio, la pasa deprisa (x8 por defecto) y se apunta
//    todos los sucesos, como haría el PC 1 en directo. Ese rato no toques la repetición.
// 2. Realización: vuelve al principio, deja la repetición en pausa a x1 y arranca el relé en este mismo PC.
//    Le das al play (o la mueves, la pausas o la aceleras cuando quieras): la cámara sigue el guion según el
//    segundo de la repetición, y como el guion ya está entero, se sabe todo lo que va a pasar.
// El guion completo queda en la carpeta de la partida (guion.json): jugadas, planos y acciones.
import { EventEmitter } from 'node:events';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cargarOpciones, mezclar } from '../comun/opciones.js';
import { pedirJSON } from '../comun/http.js';
import { Explorador } from './explorador.js';
import { arrancarAgente } from './agente.js';
import { crearRele } from '../pc2/rele.js';

const esperar = ms => new Promise(r => setTimeout(r, ms));

// Opciones del modo grabada: relé en este PC, sin margen y sin tocar el reloj de la repetición
export function opcionesGrabada(o) {
  const g = { velocidadExploracion: 8, desde: 0, reproducirAlAcabar: false, cadaMs: 250, ...(o.grabada || {}) };
  return mezclar(o, {
    grabada: g,
    margenSegundos: 0,
    rele: { ip: '127.0.0.1', controlarReloj: false, replayApi: o.rele.replayApi || o.explorador.liveClientData },
  });
}

// Hace de explorador para el agente: primero explora la repetición deprisa y luego dice que ya se sabe todo
export class ExploradorGrabado extends EventEmitter {
  constructor(o, { log = console.log } = {}) {
    super();
    this.o = o;
    this.g = o.grabada;
    this.log = log;
    this.api = o.rele.replayApi.replace(/\/$/, '');
    this.interno = new Explorador(mezclar(o, { explorador: { cadaMs: this.g.cadaMs } }));
    this.fase = 'esperando';  // esperando | explorando | lista
    this.longitud = null;
    this.parado = false;
    for (const nombre of ['evento', 'jugadores', 'conexion', 'liveEvents', 'partida']) {
      this.interno.on(nombre, d => { if (this.fase !== 'lista') this.emit(nombre, d); });
    }
    // El fin que ve el explorador interno no cuenta: aquí la partida acaba cuando la repetición llega al final
    this.interno.on('fin', () => {});
  }

  get jugadores() { return this.interno.jugadores; }
  buscar(n) { return this.interno.buscar(n); }
  ahora() { return this.fase === 'lista' ? this.longitud : this.interno.ahora(); }
  conocido() { return this.fase === 'lista' ? this.longitud : this.interno.conocido(); }

  playback(cuerpo) {
    return cuerpo
      ? pedirJSON(`${this.api}/replay/playback`, { metodo: 'POST', cuerpo, tiempoMs: 2000 })
      : pedirJSON(`${this.api}/replay/playback`, { tiempoMs: 2000 });
  }

  arrancar() { this.explorar().catch(e => this.emit('aviso', `Modo grabada: ${e.message}`)); }

  parar() { this.parado = true; this.interno.parar(); }

  async explorar() {
    // 1. Esperar a que haya una repetición abierta
    let pb = null, avisado = false;
    while (!this.parado) {
      try { pb = await this.playback(); } catch { pb = null; }
      if (pb && Number(pb.length) > 0) break;
      if (!avisado) { this.log('Esperando una repetición abierta en el cliente de LoL (con EnableReplayApi=1)...'); avisado = true; }
      this.emit('conexion', false);
      await esperar(2000);
    }
    if (this.parado) return;
    this.longitud = pb.length;
    const g = this.g;

    // 2. Al principio y deprisa
    this.fase = 'explorando';
    await this.playback({ paused: true, time: g.desde, speed: g.velocidadExploracion });
    await esperar(1500);
    await this.playback({ paused: false, speed: g.velocidadExploracion });
    this.log(`Explorando la repetición (${minutos(this.longitud)}) a x${g.velocidadExploracion}: no la toques hasta que acabe`);
    this.interno.arrancar();

    let ultimoAviso = 0, quieta = 0, anterior = null;
    while (!this.parado) {
      await esperar(500);
      try { pb = await this.playback(); } catch { continue; }
      this.longitud = pb.length || this.longitud;
      this.interno.velocidad = pb.paused ? 0 : (pb.speed || 1);
      this.emit('progreso', { t: pb.time, longitud: this.longitud });
      if (Date.now() - ultimoAviso > 15000) { ultimoAviso = Date.now(); this.log(`  explorado ${minutos(pb.time)} de ${minutos(this.longitud)}`); }
      if (pb.time >= this.longitud - 1) break;
      // Si alguien la pausa o se queda atascada, se le vuelve a dar
      quieta = anterior !== null && Math.abs(pb.time - anterior) < 0.05 ? quieta + 1 : 0;
      anterior = pb.time;
      if (quieta >= 6) { quieta = 0; await this.playback({ paused: false, speed: g.velocidadExploracion }).catch(() => {}); }
    }
    if (this.parado) return;

    // 3. Un momento para los últimos sucesos, y lista
    await esperar(Math.max(1500, this.g.cadaMs * 4));
    this.interno.parar();
    this.fase = 'lista';
    this.interno.velocidad = 1;
    await this.playback({ paused: true, time: g.desde, speed: 1 });
    if (g.reproducirAlAcabar) { await esperar(1000); await this.playback({ paused: false }); }
    this.emit('conexion', true);
    this.emit('lista', { longitud: this.longitud });
  }
}

const minutos = s => `${Math.floor((s || 0) / 60)}:${String(Math.floor((s || 0) % 60)).padStart(2, '0')}`;

export function arrancarGrabada(base, { log = console.log, registrarRele = log } = {}) {
  const o = opcionesGrabada(base);
  const explorador = new ExploradorGrabado(o, { log });
  const agente = arrancarAgente(o, { log, explorador });
  explorador.on('aviso', t => agente.ejecutor.emit('aviso', t));
  let rele = null;

  explorador.on('lista', ({ longitud }) => {
    const c = agente.cerebro;
    const planos = c.planificar(0);
    c.planificarAcciones(0, longitud);
    const carpeta = agente.ejecutor.buzon?.carpeta;
    if (carpeta) {
      writeFileSync(join(carpeta, 'guion.json'), JSON.stringify({
        longitud, jugadores: explorador.jugadores, jugadas: c.jugadas, planos, acciones: c.acciones,
      }, null, 2));
    }
    log(`Exploración hecha: ${c.jugadas.length} jugadas, ${planos.filter(p => p.tipo === 'seguir').length} planos con cámara, ${c.acciones.length} acciones.${carpeta ? ` Guion en ${join(carpeta, 'guion.json')}` : ''}`);
    rele = crearRele(o, { registrar: registrarRele, obs: false });
    rele.estado.ultimoContacto = Date.now();  // el agente le manda el guion enseguida: que no empiece en degradado
    rele.arrancar();
    agente.ejecutor.hayCambios();
    log(o.grabada.reproducirAlAcabar ? 'Repetición en marcha desde el principio: el realizador lleva la cámara.' : 'Listo. Dale al play en la repetición: el realizador lleva la cámara.');
  });

  // El agente ya arranca el explorador
  return {
    agente,
    explorador,
    get rele() { return rele; },
    parar() { explorador.parar(); rele?.parar(); agente.parar(); },
  };
}

// Arrancado directamente (npm run grabada)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const g = arrancarGrabada(cargarOpciones());
  let saliendo = false;
  const salir = () => {
    if (saliendo) return;
    saliendo = true;
    g.parar();
    process.exit(0);
  };
  process.on('SIGINT', salir);
  process.on('SIGTERM', salir);
}
