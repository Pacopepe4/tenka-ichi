// Explorador (PC 1): sigue la partida lo más cerca posible del directo y cuenta lo que pasa.
// Dos fuentes, las dos oficiales del cliente:
//  - Live Client Data API (https://127.0.0.1:2999/liveclientdata/...): jugadores, reloj y sucesos
//    (asesinatos, torres, inhibidores, multikills...). Es lo mismo que lee el puente de Gokudō.
//  - LiveEvents (TCP 34243, solo en modo espectador): dragones, Barón, heraldo y larvas, que la Live Client
//    Data no da a los espectadores. Riot pudo quitarla en algún parche: si no conecta, se sigue sin ella.
import { EventEmitter } from 'node:events';
import net from 'node:net';
import { pedirJSON } from '../comun/http.js';

// Equipos tal como los da el cliente
const EQUIPOS = { ORDER: 'azul', CHAOS: 'rojo' };

// Sucesos de LiveEvents que nos interesan, con el nombre que usa la Live Client Data para lo mismo
const LIVE_EVENTS = [
  [/dragonsoul/i, 'DragonSoul'],
  [/dragon/i, 'DragonKill'],
  [/worm|baron/i, 'BaronKill'],
  [/riftherald|herald/i, 'HeraldKill'],
  [/horde|voidgrub/i, 'HordeKill'],
  [/atakhan/i, 'AtakhanKill'],
];

// Quiénes juegan (para saber si una partida es la misma que acaba de terminar)
const firma = lista => (Array.isArray(lista) ? lista.map(j => j.riotId || j.riotIdGameName || j.summonerName || '').sort().join('|') : '');

export class Explorador extends EventEmitter {
  constructor(opciones) {
    super();
    this.url = opciones.explorador.liveClientData.replace(/\/$/, '');
    this.cadaMs = opciones.explorador.cadaMs;
    // Un fallo suelto de lectura no acaba la partida: hace falta este rato seguido sin datos
    this.finTrasMs = (opciones.explorador.finTrasSegundos ?? 10) * 1000;
    this.ultimaLectura = 0;
    this.puertoLE = opciones.explorador.liveEventsPuerto;
    this.siguienteId = 0;
    this.jugadores = [];
    this.porNombre = new Map();
    this.tiempo = null;           // { t: segundos de partida, hora: Date.now() de cuando se leyó }
    this.enPartida = false;
    this.temporizador = null;
    this.socket = null;
    this.restoLE = '';
    this.vistos = new Set();
    // Ritmo del reloj de partida: 1 en directo; en una repetición acelerada, su velocidad (la pone el modo grabada)
    this.velocidad = 1;
  }

  arrancar() {
    const vuelta = async () => {
      try {
        await this.leer();
        this.ultimaLectura = Date.now();
      } catch (e) { this.lecturaFallida(e); }
      this.temporizador = setTimeout(vuelta, this.cadaMs);
    };
    vuelta();
    this.conectarLiveEvents();
  }

  parar() {
    clearTimeout(this.temporizador);
    this.socket?.destroy();
    this.socket = null;
  }

  // Segundos de partida ahora mismo, contando lo que ha pasado desde la última lectura
  ahora() {
    if (!this.tiempo) return null;
    // Acabada la partida, el reloj se queda en su último segundo
    if (!this.enPartida) return this.tiempo.t;
    return this.tiempo.t + (Date.now() - this.tiempo.hora) / 1000 * this.velocidad;
  }

  async leer() {
    const stats = await pedirJSON(`${this.url}/liveclientdata/gamestats`, { tiempoMs: 2000 });
    const t = Number(stats?.gameTime) || 0;
    // Si el reloj vuelve muy atrás sin haber perdido la conexión, es otra partida
    if (this.enPartida && this.tiempo && t < this.tiempo.t - 30) this.sinPartida(new Error('el reloj de partida ha vuelto atrás'));
    if (!this.enPartida) {
      // Tras acabar una partida, el cliente puede seguir dando datos de esa misma partida (pantalla final, o el
      // espectador repitiendo el final): no es una partida nueva si son los mismos jugadores y no empieza de 0
      if (this.terminada) {
        const lista = await pedirJSON(`${this.url}/liveclientdata/playerlist`, { tiempoMs: 2000 }).catch(() => null);
        if (t >= 60 && firma(lista) === this.terminada.firma) { this.emit('conexion', false); return; }
        this.terminada = null;
      }
      this.enPartida = true;
      this.siguienteId = 0;
      this.vistos.clear();
      // Plantilla nueva en cada partida, aunque se entre con la partida empezada
      this.jugadores = [];
      this.porNombre.clear();
      this.emit('partida', { inicio: new Date().toISOString(), modo: stats?.gameMode, mapa: stats?.mapName });
    }
    this.tiempo = { t, hora: Date.now() };
    this.emit('conexion', true);
    this.emit('tiempo', this.tiempo.t);

    if (!this.jugadores.length || this.tiempo.t < 5) {
      const lista = await pedirJSON(`${this.url}/liveclientdata/playerlist`, { tiempoMs: 2000 });
      if (Array.isArray(lista) && lista.length) this.ponerJugadores(lista);
    }

    const datos = await pedirJSON(`${this.url}/liveclientdata/eventdata?eventID=${this.siguienteId}`, { tiempoMs: 2000 });
    for (const ev of datos?.Events || []) {
      this.siguienteId = Math.max(this.siguienteId, (Number(ev.EventID) || 0) + 1);
      // Fin de la partida (explota el nexo): se acaba aquí aunque el cliente siga respondiendo
      if (ev.EventName === 'GameEnd') {
        const tf = Number(ev.EventTime);
        if (Number.isFinite(tf)) this.tiempo = { t: tf, hora: Date.now() };
        this.sinPartida(null, 'fin de la partida');
        return;
      }
      const normal = this.normalizar(ev, 'lcd');
      if (normal) this.emitirEvento(normal);
    }
  }

  // Hasta dónde se sabe de verdad lo que ha pasado: el reloj extrapolado mientras lleguen datos,
  // y el último segundo leído si el cliente ha dejado de responder (por ejemplo, al acabar la partida)
  conocido() {
    if (!this.tiempo) return null;
    if (this.enPartida && Date.now() - this.tiempo.hora < 3000) return this.ahora();
    return this.tiempo.t;
  }

  lecturaFallida(error) {
    if (this.enPartida && Date.now() - this.ultimaLectura < this.finTrasMs) {
      this.emit('conexion', false);
      return;
    }
    this.sinPartida(error);
  }

  sinPartida(error, motivo) {
    if (this.enPartida) {
      this.enPartida = false;
      this.terminada = { firma: firma(this.jugadoresCliente), t: this.tiempo?.t ?? null };
      this.emit('fin', { motivo: motivo || error?.message || 'sin datos del cliente', t: this.tiempo?.t ?? null });
    }
    this.emit('conexion', false);
  }

  ponerJugadores(lista) {
    this.jugadoresCliente = lista;
    this.jugadores = lista.map(j => ({
      jugador: j.riotIdGameName || (j.riotId || '').split('#')[0] || j.summonerName,
      campeon: j.championName,
      equipo: EQUIPOS[j.team] || j.team,
      posicion: j.position || '',
      // Castigo (Smite): así se sabe quién es el jungla aunque el juego no dé la posición (pasa en espectador)
      castigo: [j.summonerSpells?.summonerSpellOne, j.summonerSpells?.summonerSpellTwo]
        .some(s => /SummonerSmite|Smite|Castigo/i.test(`${s?.rawDisplayName || ''} ${s?.displayName || ''}`)),
      nombres: [j.riotIdGameName, j.riotId, j.summonerName, (j.riotId || '').split('#')[0]].filter(Boolean),
    }));
    this.porNombre.clear();
    for (const j of this.jugadores) {
      for (const n of [...j.nombres, j.campeon]) this.porNombre.set(String(n).toLowerCase(), j);
    }
    this.emit('jugadores', this.jugadores);
    this.emit('conexion', true);
  }

  buscar(nombre) {
    if (!nombre) return null;
    return this.porNombre.get(String(nombre).toLowerCase()) || null;
  }

  quien(nombre) {
    const j = this.buscar(nombre);
    return j ? { jugador: j.jugador, campeon: j.campeon, equipo: j.equipo } : null;
  }

  // Pasa un suceso del cliente a nuestro formato: tipo, momento y campeones implicados
  normalizar(ev, fuente) {
    const nombre = ev.EventName;
    const t = Number(ev.EventTime);
    if (!nombre || !Number.isFinite(t)) return null;
    const asesino = this.quien(ev.KillerName);
    const victima = this.quien(ev.VictimName);
    const ayudas = (ev.Assisters || []).map(a => this.quien(a)).filter(Boolean);
    const implicados = [asesino, victima, ...ayudas].filter(Boolean);
    return {
      id: `${fuente}-${ev.EventID ?? Math.round(t * 1000)}`,
      fuente,
      nombre,
      t,
      asesino,
      victima,
      ayudas,
      implicados,
      detalle: {
        ...(ev.DragonType ? { dragon: ev.DragonType } : {}),
        ...(ev.Stolen ? { robado: String(ev.Stolen) === 'True' } : {}),
        ...(ev.TurretKilled ? { torre: ev.TurretKilled } : {}),
        ...(ev.InhibKilled ? { inhibidor: ev.InhibKilled } : {}),
        ...(ev.KillStreak ? { racha: ev.KillStreak } : {}),
        ...(ev.AcingTeam ? { equipo: EQUIPOS[ev.AcingTeam] || ev.AcingTeam } : {}),
      },
    };
  }

  emitirEvento(e) {
    // El mismo objetivo puede llegar por las dos fuentes: cuenta una vez
    const clave = `${e.nombre}@${Math.round(e.t / 3)}`;
    if (e.nombre !== 'ChampionKill' && this.vistos.has(clave)) return;
    this.vistos.add(clave);
    this.emit('evento', e);
  }

  // ---------- LiveEvents ----------
  conectarLiveEvents() {
    if (!this.puertoLE) return;
    const s = net.connect({ port: this.puertoLE, host: '127.0.0.1' });
    this.socket = s;
    s.on('connect', () => this.emit('liveEvents', true));
    s.on('data', d => this.datosLiveEvents(d.toString('utf8')));
    const reintentar = () => {
      this.emit('liveEvents', false);
      if (this.socket === s) setTimeout(() => { if (this.socket === s) this.conectarLiveEvents(); }, 10000);
    };
    s.on('error', () => {});
    s.on('close', reintentar);
  }

  // LiveEvents manda objetos JSON seguidos, sin separador: se cortan contando llaves
  datosLiveEvents(texto) {
    const { objetos, resto } = cortarObjetos(this.restoLE + texto);
    this.restoLE = resto.slice(-100000);
    for (const o of objetos) {
      const tipo = o.eventname || o.eventName || o.EventName || '';
      const par = LIVE_EVENTS.find(([re]) => re.test(tipo));
      if (!par) continue;
      const t = this.ahora();
      if (t === null) continue;
      const asesino = this.quien(o.sourceName || o.source || o.KillerName);
      this.emitirEvento({
        id: `le-${tipo}-${Math.round(t * 10)}`,
        fuente: 'le',
        nombre: par[1],
        t,
        asesino,
        victima: null,
        ayudas: [],
        implicados: [asesino].filter(Boolean),
        detalle: { original: tipo },
      });
    }
  }
}

export function cortarObjetos(texto) {
  const objetos = [];
  let nivel = 0, inicio = -1, enCadena = false, escape = false, ultimo = 0;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enCadena) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') enCadena = false;
      continue;
    }
    if (c === '"') enCadena = true;
    else if (c === '{') { if (nivel === 0) inicio = i; nivel++; }
    else if (c === '}' && nivel > 0) {
      nivel--;
      if (nivel === 0) {
        try { objetos.push(JSON.parse(texto.slice(inicio, i + 1))); } catch { /* trozo roto: se ignora */ }
        ultimo = i + 1;
      }
    }
  }
  return { objetos, resto: nivel > 0 ? texto.slice(inicio) : texto.slice(ultimo).trim() };
}
