// Ejecutor (PC 1): lleva el guion al relé del PC 2, sigue por dónde va la antena y, al llegar cada momento,
// lanza las acciones que no son de cámara (repeticiones en OBS) y lleva el overlay de Gokudō: de base, el
// línea por línea siempre puesto; en los ratos que decide el cerebro, la gráfica de oro o la ficha de quien va en racha.
// La cámara la mueve el relé en local: le llega el guion por adelantado y un corte de red no se nota.
import { EventEmitter } from 'node:events';
import { pedirJSON } from '../comun/http.js';
import { juntar } from './cerebro.js';
import { cabeceras } from '../comun/puente.js';
import { segundosAtras } from './obs.js';

export class Ejecutor extends EventEmitter {
  // sala: puente por internet (comun/sala.js). Sin sala se habla con el relé por HTTP (misma red o mismo PC).
  constructor({ opciones, cerebro, explorador, buzon = null, obs = null, tenka = null, sala = null }) {
    super();
    this.o = opciones;
    this.cerebro = cerebro;
    this.explorador = explorador;
    this.buzon = buzon;
    this.obs = obs;
    this.tenka = tenka;
    // Con rele.ip "auto" la IP del PC 2 llega del puente (ponerRele) cuando se anuncia en la red
    this.urlRele = opciones.rele.ip && opciones.rele.ip !== 'auto' ? `http://${opciones.rele.ip}:${opciones.rele.puerto}` : null;
    this.cabeceras = cabeceras(opciones.clave);
    this.sala = sala;
    this.estadoSala = null;      // último estado que mandó el PC 2 por la sala
    sala?.on('mensaje', d => { if (d.tipo === 'estado') this.estadoSala = { ...d, llegada: Date.now() }; });
    this.antena = null;          // último estado del relé
    this.releConectado = false;
    this.manual = false;
    this.congelados = [];        // planos ya fijos (la antena está a punto de llegar o ya pasó)
    this.guion = [];
    this.hechas = new Set();
    this.clips = new Map();      // jugada → ruta del clip guardado en OBS
    this.estadoJugadas = new Map();
    this.temporizador = null;
    this.ultimoEnvio = 0;
    this.cambios = true;
    this.overlayPuesto = null;   // lo último que se mandó al overlay de Gokudō (firma)
    this.overlayMandando = false;
    this.partida = null;         // id de la partida (el PC 2 lo usa para no mezclar los clips de una partida con otra)
    this.resumenLista = null;    // resumen en vídeo: [{ jugada, desde, hasta }] al ver el final (lo hace el agente)
    // Si el panel de Gokudō se reconecta, se le vuelve a decir qué tiene que enseñar
    tenka?.on?.('conexion', v => { if (v) this.overlayPuesto = null; });
  }

  arrancar() {
    const vuelta = async () => {
      await this.paso().catch(e => this.emit('aviso', e.message));
      this.temporizador = setTimeout(vuelta, 500);
    };
    vuelta();
  }

  parar() { clearTimeout(this.temporizador); }

  // Partida nueva: cerebro y buzón nuevos, y se olvida el guion anterior
  reiniciar(cerebro, buzon, partida = null) {
    this.cerebro = cerebro;
    this.buzon = buzon;
    this.partida = partida;
    this.resumenLista = null;
    this.congelados = [];
    this.guion = [];
    this.hechas.clear();
    this.clips.clear();
    this.estadoJugadas.clear();
    this.vistas = new Set();
    this.tFin = null;
    this.cambios = true;
    this.overlayPuesto = null;
  }

  // Botón de empezar el directo: lo hace el relé del PC 2, que es donde está OBS
  async emision(orden, quien = 'persona') {
    if (!this.releConectado) throw new Error('El PC 2 no está conectado: abre «Realizador PC2» en el PC de emisión');
    await this.mandar('emision', { accion: orden.accion, modo: orden.modo });
    this.apuntar(quien, `emisión: ${orden.accion}`, { modo: orden.modo });
  }

  // Botón del resumen en vídeo (lanzar | cancelar | repetir): lo hace el PC 2, que es donde está OBS
  async resumen(accion, quien = 'persona') {
    if (!['lanzar', 'cancelar', 'repetir'].includes(accion)) throw new Error(`Orden del resumen desconocida: ${accion}`);
    if (!this.releConectado) throw new Error('El PC 2 no está conectado: abre «Realizador PC2» en el PC de emisión');
    await this.mandar('resumen', { accion });
    this.apuntar(quien, `resumen: ${accion}`, {});
  }

  // Lista del resumen en vídeo para el PC 2 (va con el guion)
  ponerResumen(lista) {
    this.resumenLista = Array.isArray(lista) ? lista : null;
    this.cambios = true;
    this.apuntar('realizador', 'resumen en vídeo', { jugadas: this.resumenLista?.length ?? 0, lista: (this.resumenLista || []).map(x => x.jugada).join(', ') });
  }

  hayCambios() { this.cambios = true; }

  ponerRele(ip, puerto) {
    this.urlRele = `http://${ip}:${puerto}`;
    this.cambios = true;
  }

  tAntena() {
    if (!this.antena || this.antena.tAntena === null || this.antena.tAntena === undefined) return null;
    if (this.antena.pausado) return this.antena.tAntena;
    return this.antena.tAntena + (Date.now() - this.antena.recibido) / 1000;
  }

  async paso() {
    // 1. Por dónde va la antena
    try {
      const e = await this.pedirEstado();
      this.antena = { ...e, recibido: Date.now() };
      if (!this.releConectado) { this.releConectado = true; this.emit('rele', true); this.cambios = true; }
    } catch {
      if (this.releConectado) { this.releConectado = false; this.emit('rele', false); }
    }
    const tA = this.tAntena();
    const tD = this.explorador.ahora();

    // 2. Rehacer el guion y mandarlo al relé (si hay cambios, y cada 3 s para que sepa que seguimos aquí)
    if (tD !== null && (this.cambios || Date.now() - this.ultimoEnvio > 3000)) {
      this.cambios = false;
      const desde = tA === null ? 0 : tA + this.o.reglas.congelarSegundos;
      this.congelados = this.guion.filter(p => p.inicio < desde).map(p => (p.fin === null || p.fin > desde ? { ...p, fin: desde } : p));
      const nuevos = this.cerebro.planificar(desde, this.explorador.conocido?.() ?? tD);
      // Lo ya fijado y lo nuevo se cosen: si el corte cae en mitad de un plano, sigue siendo un solo plano
      this.guion = juntar([...this.congelados, ...nuevos]).filter(p => tA === null || p.fin === null || p.fin > tA - 60);
      // Las acciones solo se deciden con lo que se sabe de verdad: tras el final no hay «calma» que valga
      const acciones = this.cerebro.planificarAcciones(tA ?? 0, this.explorador.conocido?.() ?? tD);
      for (const a of acciones) this.apuntar('realizador', 'programa', { accion: a.tipo, t: a.t, jugada: a.jugada || null });
      if (this.releConectado) {
        try {
          await this.mandar('guion', {
            planos: this.manual ? [] : this.guion.filter(p => tA === null || p.fin === null || p.fin > tA), tDirecto: tD, manual: this.manual,
            obs: this.obs ? [] : this.accionesObs(tA),
            // Segundo en que acabó la partida (o null): el PC 2 pasa a la escena final al llegar ahí
            tFin: this.tFin ?? null,
            enPartida: Boolean(this.explorador.enPartida),
            partida: this.partida,
            // Resumen en vídeo (al ver el final): el PC 2 lo emite cuando la emisión pasa a Casters
            resumen: this.resumenLista,
          });
          this.ultimoEnvio = Date.now();
        } catch (e) { this.emit('aviso', `No se pudo mandar el guion al PC 2: ${e.message}`); }
      }
      this.emit('guion', this.guion);
    }

    if (tA === null) return;

    // 3. Acciones que tocan ahora (sin OBS aquí, las de OBS las hace el PC 2 con su lista)
    for (const j of this.cerebro.jugadas) {
      if (this.obs && j.repetir && !this.clips.has(j.id) && tA >= j.fin + 1 && tA < j.fin + 30) {
        this.clips.set(j.id, null);
        this.guardarClip(j, tA);
      }
    }
    for (const a of this.cerebro.acciones) {
      if (this.hechas.has(a.id) || a.t > tA) continue;
      this.hechas.add(a.id);
      if (tA - a.t > 10) { this.apuntar('realizador', 'salta', { accion: a.tipo, motivo: 'llegó tarde', t: a.t }); continue; }
      if (this.manual) { this.apuntar('realizador', 'salta', { accion: a.tipo, motivo: 'control manual', t: a.t }); continue; }
      this.lanzar(a).catch(e => this.emit('aviso', `${a.tipo}: ${e.message}`));
    }

    // 4. Overlay de Gokudō
    this.overlay(tA).catch(e => this.emit('aviso', `overlay: ${e.message}`));

    // 5. Cada jugada a su carpeta del buzón
    this.repartir(tA, tD);
  }

  // Qué tiene que enseñar el overlay de Gokudō con la antena en tA: lo que toque del cerebro (gráfica de oro,
  // ficha) o, si no, el línea por línea. Nada antes de la partida ni después del final.
  overlayEn(tA) {
    const ov = this.o.reglas.overlay || {};
    if (tA === null || tA < (ov.baseDesdeSegundo ?? 0)) return null;
    if (Number.isFinite(this.tFin) && tA >= this.tFin) return { tipo: null };
    const a = this.cerebro.acciones.find(x => (x.tipo === 'oro' || x.tipo === 'ficha') && x.t <= tA && tA < x.t + x.segundos);
    if (a?.tipo === 'oro') return { tipo: 'oro', id: a.id };
    if (a?.tipo === 'ficha') return { tipo: 'ficha', id: a.id, campeon: a.campeon, jugador: a.jugador, lado: a.equipo };
    return ov.base === null || ov.base === '' ? { tipo: null } : { tipo: ov.base || 'lineas' };
  }

  // Solo se manda cuando cambia (así el panel de Gokudō puede tocarlo a mano entre medias)
  async overlay(tA) {
    if (!this.tenka?.listo || this.overlayMandando) return;
    if (this.manual) return;  // con el control tomado, el overlay tampoco se toca
    const quiero = this.overlayEn(tA);
    if (!quiero) return;
    const firma = JSON.stringify(quiero);
    if (firma === this.overlayPuesto) return;
    this.overlayMandando = true;
    try {
      const { id, ...datos } = quiero;
      // segundos 0: se queda puesto hasta que se mande otra cosa (el ejecutor lo cambia en su momento)
      await this.tenka.accion('grafico', { ...datos, segundos: 0 });
      this.overlayPuesto = firma;
      this.apuntar('realizador', 'overlay', { grafico: quiero.tipo || 'nada', ...(quiero.campeon ? { campeon: quiero.campeon } : {}), t: tA });
      if (id) this.emit('accion', this.cerebro.acciones.find(x => x.id === id));
    } catch (e) {
      // Una ficha que el panel no encuentra (otro nombre de campeón) no bloquea: se sigue con el resto
      this.overlayPuesto = firma;
      this.apuntar('realizador', 'salta', { accion: `overlay ${quiero.tipo}`, motivo: e.message });
    } finally { this.overlayMandando = false; }
  }

  // El clip acaba más o menos en el segundo de antena en que se guarda (tA)
  async guardarClip(j, tA) {
    if (!this.obs?.listo) return;
    try {
      const ruta = await this.obs.guardarRepeticion();
      this.clips.set(j.id, { ruta, t: tA });
      this.apuntar('realizador', 'guarda clip', { jugada: j.id, ruta });
    } catch (e) { this.emit('aviso', `Clip de ${j.id}: ${e.message}`); }
  }

  // Lo que el PC 2 tiene que hacer en su OBS y cuándo (segundo de antena): guardar el búfer al acabar cada
  // jugada que se repite o entra en el resumen y lanzar las repeticiones. Así no hace falta llegar a su OBS desde aquí.
  // Con el final ya visto, nada se guarda después del final: la antena se queda parada ahí.
  accionesObs(tA) {
    const lista = [];
    const colchon = this.o.reglas.repeticion.colchon ?? 0;
    const tope = Number.isFinite(this.tFin) ? this.tFin - 1 : Infinity;
    const red = x => Math.round(x * 100) / 100;
    for (const j of this.cerebro.jugadas) {
      if ((j.repetir || j.resumen) && (tA === null || j.fin + 30 > tA)) lista.push({ id: `guardar-${j.id}`, tipo: 'guardar', t: red(Math.min(j.fin + 1, tope)), jugada: j.id });
    }
    // Sin jugada que acabe la partida, el resumen termina con el nexo: un clip más justo al final
    const nexo = this.resumenLista?.find(x => x.jugada === 'nexo');
    if (nexo && (tA === null || nexo.hasta + 30 > tA)) lista.push({ id: 'guardar-nexo', tipo: 'guardar', t: red(tope), jugada: 'nexo' });
    for (const a of this.cerebro.acciones) {
      if (a.tipo === 'repeticion' && (tA === null || a.t + 10 > tA)) lista.push({ ...a, colchon });
    }
    return lista;
  }

  pedirEstado() {
    if (this.sala) {
      const e = this.estadoSala;
      if (!this.sala.companero || !e || Date.now() - e.llegada > 5000) return Promise.reject(new Error('El PC 2 no está en la sala'));
      return Promise.resolve(e);
    }
    if (!this.urlRele) return Promise.reject(new Error('PC 2 aún sin encontrar'));
    return pedirJSON(`${this.urlRele}/estado`, { tiempoMs: 1500, cabeceras: this.cabeceras });
  }

  async mandar(tipo, cuerpo) {
    if (this.sala) {
      // La orden va dentro de «orden»: su propio tipo (seguir, general) no puede pisar el del mensaje
      const mensaje = tipo === 'orden' ? { tipo, orden: cuerpo } : { tipo, ...cuerpo };
      if (!this.sala.enviar(mensaje)) throw new Error('sin conexión con la sala');
      return;
    }
    await pedirJSON(`${this.urlRele}/${tipo}`, { metodo: 'POST', cuerpo, cabeceras: this.cabeceras });
  }

  async lanzar(a) {
    if (a.tipo === 'repeticion' && !this.obs) {
      this.apuntar('realizador', 'repeticion', { jugada: a.jugada, t: a.t, en: 'OBS del PC 2' });
      this.emit('accion', a);
      return;
    }
    if (a.tipo === 'repeticion') {
      const clip = this.clips.get(a.jugada);
      if (!this.obs?.listo || !clip?.ruta) { this.apuntar('realizador', 'salta', { accion: 'repeticion', motivo: 'sin OBS o sin clip', jugada: a.jugada }); return; }
      const o = this.o.obs;
      // Se repite el final de la jugada (el remate), no el principio: los últimos «segundos» antes de su fin.
      // El colchón adelanta el arranque por si OBS guardó el clip un poco más tarde de lo calculado.
      const datos = { ruta: clip.ruta, fuente: o.fuenteRepeticion, escena: o.escenaRepeticion, escenaJuego: o.escenaJuego, segundosAtras: segundosAtras(a, clip, this.o.reglas.repeticion.colchon), segundos: a.segundos, g: o.repeticion };
      if (this.obs.repeticionCompleta) await this.obs.repeticionCompleta(datos);
      else {
        await this.obs.lanzarRepeticion(datos);
        setTimeout(() => this.obs.escena(o.escenaJuego).catch(() => {}), a.segundos * 1000).unref?.();
      }
      this.apuntar('realizador', 'repeticion', { jugada: a.jugada, t: a.t });
    } else if (a.tipo === 'oro' || a.tipo === 'ficha') {
      return;  // el overlay lo lleva overlay() según el segundo de antena
    }
    this.emit('accion', a);
  }

  repartir(tA, tD) {
    const enGuion = new Set(this.guion.filter(p => p.jugada).map(p => p.jugada));
    for (const j of this.cerebro.jugadas) {
      let estado;
      if (tA >= j.fin) estado = this.historial(j.id) ? 'emitidos' : 'descartadas';
      else if (tA >= j.inicio && this.enAntena(j.id, tA)) estado = 'en-curso';
      else if (enGuion.has(j.id)) estado = 'guion';
      else estado = 'pendientes';
      if (this.estadoJugadas.get(j.id) === estado) continue;
      this.estadoJugadas.set(j.id, estado);
      if (estado === 'emitidos' || estado === 'descartadas') this.apuntar('realizador', estado === 'emitidos' ? 'emitida' : 'descartada', { jugada: j.id, tipo: j.tipo });
      this.buzon?.poner(estado, { ...j, estado, tDirecto: tD, tAntena: tA });
      this.emit('jugada', { id: j.id, estado });
    }
  }

  historial(id) { return this.guion.some(p => p.jugada === id) || this.congelados.some(p => p.jugada === id) || this.vistas?.has(id); }

  enAntena(id, tA) {
    const p = this.guion.find(x => x.inicio <= tA && (x.fin === null || x.fin > tA));
    if (p?.jugada === id) { (this.vistas ||= new Set()).add(id); return true; }
    return false;
  }

  planoActual() {
    const tA = this.tAntena();
    if (tA === null) return null;
    return this.guion.find(p => p.inicio <= tA && (p.fin === null || p.fin > tA)) || null;
  }

  // Tomar o devolver el control: el cerebro sigue planificando y apuntando, pero no manda nada
  async ponerManual(activo, quien = 'persona') {
    this.manual = Boolean(activo);
    this.cambios = true;
    this.apuntar(quien, this.manual ? 'toma el control' : 'devuelve el control', { tAntena: this.tAntena() });
  }

  async ordenManual(orden, quien = 'persona') {
    if (!this.releConectado) throw new Error('El relé del PC 2 no responde');
    if (!this.manual) await this.ponerManual(true, quien);
    await this.mandar('orden', orden);
    this.apuntar(quien, 'orden', { orden, tAntena: this.tAntena() });
  }

  apuntar(quien, que, datos) {
    const linea = this.buzon ? this.buzon.apuntar(quien, que, datos) : { hora: new Date().toISOString(), quien, que, ...datos };
    this.emit('registro', linea);
  }
}
