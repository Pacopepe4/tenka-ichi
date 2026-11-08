// Captura de datos (fase 1): apunta todo lo que da el cliente de LoL, sin decidir nada, para ver qué llega
// de verdad. Sirve igual con una repetición (.rofl abierta en el cliente), un espectador o una partida en directo.
//
//   npm run capturar                      cada segundo; foto completa (allgamedata) cada 5 s
//   npm run capturar -- --cada 0.5 --foto 10 --carpeta D:\capturas
//
// Deja en capturas/<fecha-hora>/:
//   primeras/          la primera respuesta de cada dirección, entera y legible (incluido el mapa de la API)
//   sucesos.jsonl      cada suceso nuevo de la Live Client Data, con el reloj de partida y el de la repetición
//   liveevents.jsonl   todo lo que manda LiveEvents (dragones, Barón...), tal cual
//   ritmo.jsonl        una línea por vuelta: reloj de partida, playback de la Replay API y fallos
//   fotos.jsonl        allgamedata completo cada pocos segundos (oro, objetos, nivel, posición en el marcador...)
//   camara.jsonl       el estado de la cámara (/replay/render) cada vez que cambia
//   resumen.md         qué funciona y qué no, para las casillas «Por comprobar» del README
// Se cierra con Ctrl+C (el resumen se rehace cada 15 s por si se corta de golpe).
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import net from 'node:net';
import { pathToFileURL } from 'node:url';
import { cargarOpciones, RAIZ } from '../comun/opciones.js';
import { pedirJSON } from '../comun/http.js';
import { cortarObjetos } from '../pc1/explorador.js';

// Lo que se pide una sola vez (o hasta que conteste) y se guarda entero en primeras/
const UNA_VEZ = [
  ['mapa-api-v3', '/swagger/v3/openapi.json'],
  ['mapa-api-v2', '/swagger/v2/swagger.json'],
  ['allgamedata', '/liveclientdata/allgamedata'],
  ['playerlist', '/liveclientdata/playerlist'],
  ['activeplayer', '/liveclientdata/activeplayer'],
  ['eventdata', '/liveclientdata/eventdata'],
  ['gamestats', '/liveclientdata/gamestats'],
  ['replay-game', '/replay/game'],
  ['replay-playback', '/replay/playback'],
  ['replay-render', '/replay/render'],
  ['replay-recording', '/replay/recording'],
  ['replay-sequence', '/replay/sequence'],
];

export function crearCaptura(o, { carpeta, cadaMs = 1000, fotoMs = 5000, log = console.log } = {}) {
  const api = o.explorador.liveClientData.replace(/\/$/, '');
  const replay = (o.rele.replayApi || o.explorador.liveClientData).replace(/\/$/, '');
  const dir = carpeta || join(o.registro.raiz || RAIZ, 'capturas', new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'));
  mkdirSync(join(dir, 'primeras'), { recursive: true });
  const linea = (archivo, datos) => appendFileSync(join(dir, archivo), JSON.stringify({ hora: new Date().toISOString(), ...datos }) + '\n');

  const e = {
    arranque: Date.now(),
    vueltas: 0,
    direcciones: {},          // ruta → { ok, fallos, ultimoError, ultimoCodigo }
    primeras: new Set(),
    siguienteId: 0,
    sucesos: {},              // EventName → cuántos
    liveEvents: { conectado: false, alguna: false, objetos: 0, tipos: {} },
    gameTime: { primero: null, ultimo: null },
    playback: { primero: null, ultimo: null, longitudes: new Set(), velocidades: new Set(), pausas: 0 },
    diferencias: [],          // playback.time − gameTime
    jugadores: [],
    ultimaCamara: null,
    ultimaFoto: 0,
    modo: null,               // de la allgamedata/gamestats
  };

  const base = ruta => (ruta.startsWith('/replay') ? replay : api);
  async function pedir(ruta, tiempoMs = 2000) {
    // Una fila por dirección, sin la parte de ?eventID=...
    const d = (e.direcciones[ruta.replace(/\?.*/, '')] ||= { ok: 0, fallos: 0, ultimoError: null });
    try {
      const r = await pedirJSON(`${base(ruta)}${ruta}`, { tiempoMs });
      d.ok++;
      return r;
    } catch (err) {
      d.fallos++;
      d.ultimoError = err.message;
      return undefined;
    }
  }

  async function primeras() {
    for (const [nombre, ruta] of UNA_VEZ) {
      if (e.primeras.has(nombre)) continue;
      const r = await pedir(ruta, 4000);
      if (r === undefined) continue;
      e.primeras.add(nombre);
      writeFileSync(join(dir, 'primeras', `${nombre}.json`), typeof r === 'string' ? r : JSON.stringify(r, null, 2));
    }
  }

  async function vuelta() {
    e.vueltas++;
    if (e.vueltas === 1 || e.vueltas % 10 === 0) await primeras();
    const [stats, pb] = await Promise.all([pedir('/liveclientdata/gamestats'), pedir('/replay/playback')]);
    const t = Number(stats?.gameTime);
    if (Number.isFinite(t)) {
      e.gameTime.primero ??= t;
      e.gameTime.ultimo = t;
      e.modo = stats.gameMode || e.modo;
    }
    if (pb && typeof pb === 'object') {
      e.playback.primero ??= pb;
      if (e.playback.ultimo && !e.playback.ultimo.paused && pb.paused) e.playback.pausas++;
      e.playback.ultimo = pb;
      if (Number.isFinite(pb.length)) e.playback.longitudes.add(Math.round(pb.length));
      if (Number.isFinite(pb.speed)) e.playback.velocidades.add(pb.speed);
      if (Number.isFinite(t) && Number.isFinite(pb.time)) e.diferencias.push(pb.time - t);
      if (e.diferencias.length > 5000) e.diferencias.splice(0, 1000);
    }
    const fallos = Object.entries(e.direcciones).filter(([, d]) => d.ultimoError && d.ok === 0).map(([r]) => r);
    linea('ritmo.jsonl', { gameTime: Number.isFinite(t) ? t : null, playback: pb ?? null, sinRespuesta: fallos });

    // Sucesos nuevos de la Live Client Data
    const ev = await pedir(`/liveclientdata/eventdata?eventID=${e.siguienteId}`);
    for (const s of ev?.Events || []) {
      const id = Number(s.EventID);
      if (Number.isFinite(id) && id < e.siguienteId) continue;
      e.siguienteId = Math.max(e.siguienteId, (Number.isFinite(id) ? id : e.siguienteId) + 1);
      e.sucesos[s.EventName] = (e.sucesos[s.EventName] || 0) + 1;
      linea('sucesos.jsonl', { gameTime: Number.isFinite(t) ? t : null, tRepeticion: pb?.time ?? null, suceso: s });
    }
    if (ev?.Events?.length) log(`  ${ev.Events.length} suceso(s) nuevo(s): ${ev.Events.map(s => `${s.EventName}@${Number(s.EventTime).toFixed(0)}s`).join(', ')}`);

    // Cámara: solo cuando cambia
    const cam = await pedir('/replay/render');
    if (cam && typeof cam === 'object') {
      const texto = JSON.stringify(cam);
      if (texto !== e.ultimaCamara) { e.ultimaCamara = texto; linea('camara.jsonl', { tRepeticion: pb?.time ?? null, render: cam }); }
    }

    // Foto completa
    if (Date.now() - e.ultimaFoto >= fotoMs) {
      const todo = await pedir('/liveclientdata/allgamedata', 4000);
      if (todo && typeof todo === 'object') {
        e.ultimaFoto = Date.now();
        linea('fotos.jsonl', { gameTime: Number.isFinite(t) ? t : null, tRepeticion: pb?.time ?? null, datos: todo });
        if (Array.isArray(todo.allPlayers) && todo.allPlayers.length) {
          e.jugadores = todo.allPlayers.map(j => ({ jugador: j.riotId || j.summonerName, campeon: j.championName, equipo: j.team, posicion: j.position }));
        }
      }
    }
  }

  // ---- LiveEvents: todo tal cual ----
  let socket = null, resto = '', reintento = null, parado = false;
  function conectarLE() {
    if (!o.explorador.liveEventsPuerto || parado) return;
    const s = net.connect({ port: o.explorador.liveEventsPuerto, host: '127.0.0.1' });
    socket = s;
    s.on('connect', () => { e.liveEvents.conectado = true; e.liveEvents.alguna = true; log('  LiveEvents conectado'); });
    s.on('data', d => {
      const { objetos, resto: r } = cortarObjetos(resto + d.toString('utf8'));
      resto = r.slice(-100000);
      for (const ob of objetos) {
        e.liveEvents.objetos++;
        const tipo = ob.eventname || ob.eventName || ob.EventName || '?';
        e.liveEvents.tipos[tipo] = (e.liveEvents.tipos[tipo] || 0) + 1;
        linea('liveevents.jsonl', { gameTime: e.gameTime.ultimo, tRepeticion: e.playback.ultimo?.time ?? null, objeto: ob });
        log(`  LiveEvents: ${tipo}`);
      }
    });
    s.on('error', () => {});
    s.on('close', () => {
      e.liveEvents.conectado = false;
      if (!parado) reintento = setTimeout(conectarLE, 5000);
    });
  }

  function resumen() {
    const r = [];
    const seg = s => (s === null || s === undefined ? '—' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);
    const pb = e.playback;
    const longitudes = [...pb.longitudes];
    const creceLength = longitudes.length > 1 && Math.max(...longitudes) - Math.min(...longitudes) > 5;
    const avance = e.gameTime.primero !== null ? e.gameTime.ultimo - e.gameTime.primero : null;
    const dif = e.diferencias.length ? e.diferencias.reduce((a, b) => a + b, 0) / e.diferencias.length : null;
    const sinReplay = !pb.ultimo;
    let tipo = 'sin datos';
    if (pb.ultimo) tipo = creceLength ? 'directo o espectador (la longitud crece)' : 'repetición grabada (longitud fija)';
    else if (e.gameTime.ultimo !== null) tipo = 'partida sin Replay API (directo jugando, o falta EnableReplayApi=1)';

    r.push('# Resumen de la captura', '');
    r.push(`- Carpeta: \`${dir}\``);
    r.push(`- Duración de la captura: ${seg((Date.now() - e.arranque) / 1000)} (${e.vueltas} vueltas)`);
    r.push(`- Qué parece: **${tipo}**${e.modo ? ` · modo ${e.modo}` : ''}`);
    r.push(`- Reloj de partida: de ${seg(e.gameTime.primero)} a ${seg(e.gameTime.ultimo)}${avance !== null ? ` (avanzó ${avance.toFixed(0)} s)` : ''}`);
    if (!sinReplay) {
      r.push(`- Replay API: tiempo ${seg(pb.ultimo.time)} de ${seg(pb.ultimo.length)} · longitudes vistas: ${longitudes.slice(0, 6).join(', ')}${longitudes.length > 6 ? '…' : ''} s · velocidades: ${[...pb.velocidades].join(', ')} · pausas vistas: ${pb.pausas}`);
      if (dif !== null) r.push(`- Diferencia media playback.time − gameTime: ${dif.toFixed(2)} s (cerca de 0 = los dos relojes son el mismo)`);
    }
    r.push('', '## Direcciones', '', '| Dirección | Bien | Fallos | Último error |', '|---|---|---|---|');
    for (const [ruta, d] of Object.entries(e.direcciones).sort()) {
      r.push(`| \`${ruta}\` | ${d.ok} | ${d.fallos} | ${d.ok ? '' : (d.ultimoError || '').replace(/\|/g, '/').slice(0, 120)} |`);
    }
    r.push('', '## Sucesos de la Live Client Data', '');
    const suc = Object.entries(e.sucesos).sort((a, b) => b[1] - a[1]);
    r.push(suc.length ? suc.map(([n, c]) => `- ${n}: ${c}`).join('\n') : '- Ninguno');
    r.push('', '## LiveEvents', '');
    r.push(`- ${e.liveEvents.alguna ? 'Conectó' : '**No conectó**'} en el puerto ${o.explorador.liveEventsPuerto} · ${e.liveEvents.objetos} objetos`);
    for (const [n, c] of Object.entries(e.liveEvents.tipos).sort((a, b) => b[1] - a[1])) r.push(`  - ${n}: ${c}`);
    r.push('', '## Jugadores', '');
    r.push(e.jugadores.length ? e.jugadores.map(j => `- ${j.equipo} · ${j.posicion || '?'} · ${j.campeon} · ${j.jugador}`).join('\n') : '- Sin plantilla');
    r.push('', '## Para las casillas del README', '');
    r.push(`- Replay API responde: ${sinReplay ? 'no' : 'sí'}${!sinReplay ? ` · la longitud ${creceLength ? 'crece con la partida' : 'no crece (repetición, o captura corta)'}` : ''}`);
    r.push(`- LiveEvents: ${e.liveEvents.alguna ? (e.liveEvents.objetos ? 'funciona y manda datos' : 'conecta, pero no ha mandado nada') : 'no conecta (¿falta LiveEvents.ini o Riot la quitó?)'}`);
    r.push(`- Dragones/Barón por la Live Client Data: ${['DragonKill', 'BaronKill', 'HeraldKill', 'HordeKill'].some(n => e.sucesos[n]) ? 'sí llegan' : 'no han llegado'}`);
    writeFileSync(join(dir, 'resumen.md'), r.join('\n') + '\n');
    return r.join('\n');
  }

  let temporizador = null, temporizadorResumen = null;
  return {
    carpeta: dir,
    estado: e,
    resumen,
    arrancar() {
      log(`Capturando en ${dir}`);
      log(`Live Client Data: ${api} · Replay API: ${replay} · LiveEvents: ${o.explorador.liveEventsPuerto}`);
      const bucle = async () => {
        try { await vuelta(); } catch (err) { log(`  fallo: ${err.message}`); }
        if (!parado) temporizador = setTimeout(bucle, cadaMs);
      };
      bucle();
      conectarLE();
      temporizadorResumen = setInterval(resumen, 15000);
    },
    parar() {
      parado = true;
      clearTimeout(temporizador);
      clearTimeout(reintento);
      clearInterval(temporizadorResumen);
      socket?.destroy();
      return resumen();
    },
  };
}

function argumento(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

// Arrancado directamente (npm run capturar)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const captura = crearCaptura(cargarOpciones(), {
    carpeta: argumento('carpeta'),
    cadaMs: (Number(argumento('cada')) || 1) * 1000,
    fotoMs: (Number(argumento('foto')) || 5) * 1000,
  });
  captura.arrancar();
  let saliendo = false;
  const salir = () => {
    if (saliendo) return;
    saliendo = true;
    console.log('\n' + captura.parar());
    process.exit(0);
  };
  process.on('SIGINT', salir);
  process.on('SIGTERM', salir);
}
