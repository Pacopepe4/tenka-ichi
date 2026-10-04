// Qué enseña el overlay (draft, postdraft, partida y final), la pantalla final y el estado del panel, que tiene que
// sobrevivir a un reinicio de la web. Primero las piezas sueltas y después la web entera con datos temporales.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { vistaAutomatica, clavePartida, fotoFinal, fotoFinalDelDraft, completarFinal } from '../server/vista.js';
import { fotoEstado, restaurarEstado } from '../server/estado-guardado.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLAVE = 'clave-de-prueba';
const PICKS = { azul: ['Aatrox', 'LeeSin', 'Ahri', 'Jinx', 'Thresh'], rojo: ['Jax', 'Viego', 'Syndra', 'Kaisa', 'Nautilus'] };

const estadoBase = () => ({
  config: { jornada: 'Jornada 1', fase: 'Fase de liga', formato: 'bo1', serie: 1, partida: 1 },
  equipos: { azul: { clan: 'KAIJU', jugadores: ['A1', 'A2', 'A3', 'A4', 'A5'] }, rojo: { clan: 'TORA', jugadores: ['R1', 'R2', 'R3', 'R4', 'R5'] } },
  fuente: { enlace: '', codigo: null, conectado: false, error: null },
  draft: { turno: 0, activo: null, hover: null, tiempo: null, bans: { azul: Array(5).fill(null), rojo: Array(5).fill(null) }, picks: structuredClone(PICKS) },
  fearless: [], resultados: [], camaras: { cantidad: 0, lista: Array.from({ length: 4 }, () => ({ tipo: 'caster', nombre: '', detalle: '' })) },
  partidaVisible: true, vistaOverlay: 'draft', vista: { forzada: null, enPartida: false }, final: null,
  buscarPartida: { activa: false, alAcabarDraft: true }, avisosPropios: false, jornadaAuto: { cerrar: true, premios: [3, 2, 1] },
});

const jugador = (nombre, campeon, k) => ({ nombre, campeon, nivel: 15, k, d: 2, a: 5, cs: 200, oro: 11000, vision: 30, objetos: [3031, null, null, null, null, null, 3340] });
const resumen = (extra = {}) => ({
  numero: 7, activo: true, prueba: false, terminada: false, tiempo: 1830.4, historiaIncompleta: false,
  azul: { kills: 12, oro: 55000, torres: 7, inhibidores: 1, dragones: ['infernal', 'nube'], alma: null, ancestrales: 0, larvas: 3, heraldos: 1, barones: 1 },
  rojo: { kills: 8, oro: 48000, torres: 2, inhibidores: 0, dragones: ['oceano'], alma: null, ancestrales: 0, larvas: 3, heraldos: 0, barones: 0 },
  lineas: ['TOP', 'JUNGLA', 'MEDIO', 'ADC', 'SUPPORT'].map((rol, i) => ({ rol, azul: jugador(`Cuenta A${i}`, PICKS.azul[i], i), rojo: jugador(`Cuenta R${i}`, PICKS.rojo[i], 1) })),
  ...extra,
});

test('la vista automática: la partida manda, después la pantalla final, el postdraft y el draft', () => {
  assert.equal(vistaAutomatica({ enPartida: true, hayFinal: true, draftListo: true }), 'partida');
  assert.equal(vistaAutomatica({ enPartida: false, hayFinal: true, draftListo: true }), 'final');
  assert.equal(vistaAutomatica({ enPartida: false, hayFinal: false, draftListo: true }), 'postdraft');
  assert.equal(vistaAutomatica({ enPartida: false, hayFinal: false, draftListo: false }), 'draft');
});

test('la pantalla final sale de la partida, con los nombres del panel, y conserva lo que pone el panel', () => {
  const e = estadoBase();
  const f = fotoFinal(resumen(), e);
  assert.equal(f.clave, clavePartida(e));
  assert.equal(f.duracion, 1830);
  assert.equal(f.conMarcador, true);
  assert.deepEqual(f.equipos.azul, { clan: 'KAIJU', kills: 12, oro: 55000, torres: 7, inhibidores: 1, dragones: ['infernal', 'nube'], alma: null, ancestrales: 0, larvas: 3, heraldos: 1, barones: 1 });
  assert.equal(f.lineas[3].azul.nombre, 'A4', 'el nombre del panel, no el de la cuenta');
  assert.equal(f.lineas[3].azul.campeon, 'Jinx');
  assert.equal(f.ganador, null);

  // El staff marca el ganador y guarda las estadísticas: MVP, daño y puntos. Otro paquete de la misma partida no lo borra
  e.resultados.push({ partida: 1, ganador: 'azul', clan: 'KAIJU' });
  const conDatos = completarFinal({ ...f, ganador: 'azul' }, e, { mvp: 'azul-3', filas: [{ lado: 'azul', indice: 3, dano: '31200', k: 99 }], puntos: [{ id: 'KAIJU-ADC', puntos: 41.5 }] });
  assert.equal(conDatos.mvp, 'azul-3');
  assert.deepEqual(conDatos.extras['azul-3'], { dano: 31200, puntos: 41.5 });
  assert.deepEqual(conDatos.extras['rojo-0'], { dano: null, puntos: null });
  assert.equal(conDatos.lineas[3].azul.k, 3, 'con marcador, el KDA es el del marcador');
  const otra = fotoFinal(resumen({ tiempo: 1840 }), e, conDatos);
  assert.equal(otra.mvp, 'azul-3');
  assert.equal(otra.ganador, 'azul');
  // Una partida distinta empieza de cero (pero ya sabe quién ganó la que hay en el panel)
  const nueva = fotoFinal(resumen({ numero: 8 }), e, conDatos);
  assert.equal(nueva.mvp, null);
  assert.equal(nueva.ganador, 'azul');
});

test('sin marcador, la pantalla final sale del draft y de lo que apunta el staff', () => {
  const e = estadoBase();
  const f = fotoFinalDelDraft(e);
  assert.equal(f.conMarcador, false);
  assert.equal(f.lineas[0].rojo.campeon, 'Jax');
  assert.equal(f.lineas[0].rojo.nombre, 'R1');
  assert.equal(f.lineas[0].rojo.k, null);
  const filas = [{ lado: 'azul', indice: 0, k: 4, d: 1, a: 7, cs: 210, vision: 18, dano: 20100 }, { lado: 'azul', indice: 1, k: 2, d: 0, a: 9 }];
  const c = completarFinal(f, e, { filas, mvp: 'no-vale', puntos: [] });
  assert.equal(c.mvp, null);
  assert.equal(c.lineas[0].azul.k, 4);
  assert.equal(c.lineas[0].azul.cs, 210);
  assert.equal(c.equipos.azul.kills, 6);
  assert.equal(c.equipos.rojo.kills, null, 'sin ningún dato, no se inventa un cero');
  // Si ya había una del marcador, se queda esa
  const conMarcador = fotoFinal(resumen(), e);
  assert.equal(fotoFinalDelDraft(e, conMarcador), conMarcador);
});

test('el estado guardado vuelve tal cual; la búsqueda y la vista forzada, solo si es reciente', () => {
  const e = estadoBase();
  Object.assign(e, { vista: { forzada: 'partida', enPartida: true }, buscarPartida: { activa: true, alAcabarDraft: false }, avisosPropios: true,
    fearless: ['Ahri'], resultados: [{ partida: 1, ganador: 'azul', clan: 'KAIJU' }], jornadaAuto: { cerrar: false, premios: [5, 2, 3] } });
  e.camaras.cantidad = 2;
  e.fuente.enlace = 'https://lol.draftcore.net/draft/ABC123';
  const guardado = fotoEstado(e, { draftcore: true });

  const nuevo = Object.assign(estadoBase(), { equipos: { azul: { clan: 'NONAME', jugadores: Array(5).fill('') }, rojo: { clan: 'NONAME', jugadores: Array(5).fill('') } } });
  nuevo.draft.picks = { azul: Array(5).fill(null), rojo: Array(5).fill(null) };
  const r = restaurarEstado(nuevo, JSON.stringify({ cuando: 1000, ...guardado }), 2000);
  assert.deepEqual(r, { restaurado: true, reciente: true, enlace: 'https://lol.draftcore.net/draft/ABC123' });
  assert.equal(nuevo.equipos.azul.clan, 'KAIJU');
  assert.deepEqual(nuevo.draft.picks, PICKS);
  assert.equal(nuevo.camaras.cantidad, 2);
  assert.deepEqual(nuevo.vista, { forzada: 'partida', enPartida: true });
  assert.deepEqual(nuevo.buscarPartida, { activa: true, alAcabarDraft: false });
  assert.deepEqual(nuevo.jornadaAuto, { cerrar: false, premios: [5, 2, 3] });
  assert.deepEqual(nuevo.fearless, ['Ahri']);

  // Guardado hace un día: vuelven el enfrentamiento y el draft, pero no la búsqueda ni la vista forzada
  const viejo = estadoBase();
  const r2 = restaurarEstado(viejo, JSON.stringify({ cuando: 1000, ...guardado }), 1000 + 24 * 3600 * 1000);
  assert.equal(r2.reciente, false);
  assert.deepEqual(viejo.vista, { forzada: null, enPartida: false });
  assert.equal(viejo.buscarPartida.activa, false);
  assert.equal(viejo.buscarPartida.alAcabarDraft, false);

  // Sin DraftCore pedido no se guarda el enlace, y lo que no se entiende no rompe nada
  assert.equal(fotoEstado(e).enlace, '');
  assert.deepEqual(restaurarEstado(estadoBase(), '{mal'), { restaurado: false, enlace: '' });
  const raro = estadoBase();
  restaurarEstado(raro, JSON.stringify({ cuando: Date.now(), equipos: { azul: { clan: 5 } }, draft: { picks: { azul: [1] } }, camaras: { cantidad: 9 }, vista: { forzada: 'inventada' } }));
  assert.equal(raro.equipos.azul.clan, 'KAIJU');
  assert.deepEqual(raro.draft.picks, PICKS);
  assert.equal(raro.vista.forzada, null);
});

// ---------- la web entera ----------
let carpeta, web, urlWeb;
const esperar = ms => new Promise(r => setTimeout(r, ms));

async function arrancarWeb() {
  const puerto = 4100 + Math.floor(Math.random() * 90);
  urlWeb = `http://127.0.0.1:${puerto}`;
  const entorno = { ...process.env };
  for (const k of Object.keys(entorno)) if (/^(GOOGLE_|TWITCH_|DISCORD_|RENDER)/.test(k)) delete entorno[k];
  web = spawn(process.execPath, ['server/index.js'], {
    cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...entorno, PORT: String(puerto), PANEL_CLAVE: CLAVE, SESION_SECRETO: 'secreto-de-las-pruebas', ESPERA_VISTA_MS: '250',
      CARPETA_DATOS: carpeta, ARCHIVO_PLANTILLAS: path.join(carpeta, 'plantillas.json'),
      ARCHIVO_BOOSTS: path.join(carpeta, 'boosts.json'), ARCHIVO_CAMPEONES: path.join(carpeta, 'campeones.json') },
  });
  web.stderr.on('data', d => { if (process.env.VER_WEB) process.stderr.write(d); });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${urlWeb}/salud`)).ok) return; } catch {}
    await esperar(200);
  }
  throw new Error('La web no arranca');
}
async function pararWeb() {
  if (!web) return;
  const fin = new Promise(r => web.once('exit', r));
  web.kill();
  await fin;
  web = null;
}

// Una conexión como la de un overlay: guarda lo último que llega y deja mandar acciones del panel
async function conectar() {
  const ws = new WebSocket(`${urlWeb.replace('http', 'ws')}/ws`);
  const c = { ws, estado: null, partida: null, version: null, id: 0, esperas: new Map() };
  ws.on('message', m => {
    const x = JSON.parse(m);
    if (x.tipo === 'hola') c.version = x.version;
    if (x.tipo === 'estado') { c.estado = x.estado; c.alEstado?.(); }
    if (x.tipo === 'partida') c.partida = x.partida;
    if (x.tipo === 'respuesta') { c.esperas.get(x.id)?.(x); c.esperas.delete(x.id); }
  });
  await new Promise((ok, mal) => { ws.on('open', ok); ws.on('error', mal); });
  // La web contesta a la acción y después reparte el estado: se espera a los dos
  c.accion = (accion, datos = {}) => new Promise(ok => {
    const id = ++c.id;
    // (si la acción falla no hay reparto: se sigue al momento)
    c.esperas.set(id, r => {
      if (!r.ok) return ok(r);
      const fin = () => { c.alEstado = null; clearTimeout(reloj); ok(r); };
      const reloj = setTimeout(fin, 1000);
      c.alEstado = fin;
    });
    ws.send(JSON.stringify({ tipo: 'accion', id, accion, datos, clave: CLAVE }));
  });
  // Espera a que el estado cumpla algo (lo comprueba con cada mensaje que llega)
  c.hasta = async (condicion, texto, ms = 5000) => {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
      if (c.estado && condicion(c.estado)) return c.estado;
      await esperar(40);
    }
    assert.fail(`No ha llegado: ${texto} (vista ${c.estado?.vistaOverlay})`);
  };
  await c.hasta(() => true, 'el primer estado');
  return c;
}

before(async () => {
  carpeta = await mkdtemp(path.join(os.tmpdir(), 'tenka-vista-'));
  await writeFile(path.join(carpeta, 'plantillas.json'), await readFile(path.join(RAIZ, 'data-proyecto', 'plantillas.json')));
  await writeFile(path.join(carpeta, 'boosts.json'), '[]');
  await writeFile(path.join(carpeta, 'campeones.json'), '{}');
  await arrancarWeb();
});
after(async () => {
  await pararWeb();
  await rm(carpeta, { recursive: true, force: true });
});

test('el overlay pasa solo de draft a postdraft, partida y final, y el panel puede forzar cualquiera', async () => {
  const c = await conectar();
  assert.ok(c.version, 'al conectarse llega la versión de la web');
  assert.equal(c.estado.vistaOverlay, 'draft');
  await c.accion('config', { jornada: 'Jornada 3', fase: 'Fase de liga', formato: 'bo1', partida: 1 });
  await c.accion('equipo', { lado: 'azul', clan: 'KAIJU', jugadores: ['A1', 'A2', 'A3', 'A4', 'A5'] });
  await c.accion('equipo', { lado: 'rojo', clan: 'TORA', jugadores: ['R1', 'R2', 'R3', 'R4', 'R5'] });

  // El draft se completa: el último pick se queda un momento y luego sale el postdraft
  for (const lado of ['azul', 'rojo']) for (let i = 0; i < 5; i++) await c.accion('corregir', { tipo: 'picks', lado, indice: i, campeon: PICKS[lado][i] });
  assert.equal(c.estado.vistaOverlay, 'draft', 'recién completado sigue el draft');
  assert.equal(c.estado.buscarPartida.activa, true, 'y el puente se pone a buscar la partida');
  assert.equal(c.estado.fantasy.cerrado, true, 'al empezar el draft se cierran las alineaciones');
  await c.hasta(e => e.vistaOverlay === 'postdraft', 'el postdraft');

  // Empieza la partida (de prueba): el marcador. Al pararla queda la pantalla final con sus datos
  await c.accion('partidaPrueba', { activa: true });
  await c.hasta(e => e.vistaOverlay === 'partida', 'la partida');
  await esperar(1200);
  await c.accion('partidaPrueba', { activa: false });
  const e = await c.hasta(x => x.vistaOverlay === 'final', 'la pantalla final');
  assert.equal(e.final.prueba, true);
  assert.equal(e.final.equipos.azul.clan, 'KAIJU');
  assert.equal(e.final.lineas[2].azul.campeon, 'Ahri');
  assert.equal(e.final.lineas[2].azul.nombre, 'A3');

  // Las alineaciones se cierran solas una vez por partida: si el staff las abre, otro pick no las vuelve a cerrar
  await c.accion('fantasyCerrar', { cerrado: false });
  await c.accion('corregir', { tipo: 'bans', lado: 'rojo', indice: 4, campeon: 'Teemo' });
  assert.equal(c.estado.fantasy.cerrado, false);

  // El panel fuerza una vista y la suelta
  await c.accion('vistaOverlay', { vista: 'draft' });
  assert.equal(c.estado.vistaOverlay, 'draft');
  assert.equal(c.estado.vista.forzada, 'draft');
  await c.accion('vistaOverlay', { vista: 'auto' });
  assert.equal(c.estado.vistaOverlay, 'final');
  await c.accion('finalQuitar');
  assert.equal(c.estado.vistaOverlay, 'postdraft');

  // El ganador y las estadísticas dejan una pantalla final aunque no haya marcador
  assert.equal((await c.accion('ganador', { lado: 'rojo' })).ok, true);
  assert.equal(c.estado.vistaOverlay, 'final');
  assert.equal(c.estado.final.ganador, 'rojo');
  assert.equal(c.estado.final.conMarcador, false);
  const r = await c.accion('fantasyEstadisticas', { mvp: 'rojo-2', filas: [{ lado: 'rojo', indice: 2, k: 9, d: 1, a: 4, dano: 28000 }] });
  assert.equal(r.ok, true);
  assert.equal(c.estado.final.mvp, 'rojo-2');
  assert.equal(c.estado.final.ganador, 'rojo');
  assert.equal(c.estado.final.lineas[2].rojo.k, 9);
  assert.equal(c.estado.final.extras['rojo-2'].dano, 28000);
  assert.ok(c.estado.final.extras['rojo-2'].puntos > 0);

  // Siguiente partida: draft vacío y vuelta al draft
  await c.accion('siguiente');
  assert.equal(c.estado.vistaOverlay, 'draft');
  assert.equal(c.estado.final, null);
  assert.equal(c.estado.config.partida, 2);
  c.ws.close();
});

test('si la web se reinicia, vuelve con lo que el panel tenía puesto', async () => {
  const c = await conectar();
  for (const lado of ['azul', 'rojo']) for (let i = 0; i < 5; i++) await c.accion('corregir', { tipo: 'picks', lado, indice: i, campeon: PICKS[lado][i] });
  await c.accion('corregir', { tipo: 'bans', lado: 'azul', indice: 0, campeon: 'Yasuo' });
  await c.accion('camaras', { cantidad: 2 });
  await c.accion('vistaOverlay', { vista: 'partida' });
  await c.accion('jornadaAuto', { cerrar: false, premios: [3, 2, 3] });
  const version = c.version;
  c.ws.close();
  await esperar(3600);   // el guardado espera unos segundos para juntar cambios
  await pararWeb();
  await arrancarWeb();

  const d = await conectar();
  assert.notEqual(d.version, version, 'en local, cada arranque es una versión nueva: los overlays se recargan');
  assert.equal(d.estado.config.jornada, 'Jornada 3');
  assert.equal(d.estado.config.partida, 2);
  assert.equal(d.estado.equipos.azul.clan, 'KAIJU');
  assert.deepEqual(d.estado.equipos.rojo.jugadores, ['R1', 'R2', 'R3', 'R4', 'R5']);
  assert.deepEqual(d.estado.draft.picks, PICKS);
  assert.equal(d.estado.draft.bans.azul[0], 'Yasuo');
  assert.equal(d.estado.camaras.cantidad, 2);
  assert.equal(d.estado.vista.forzada, 'partida');
  assert.equal(d.estado.vistaOverlay, 'partida');
  assert.equal(d.estado.buscarPartida.activa, true);
  assert.deepEqual([d.estado.jornadaAuto.cerrar, d.estado.jornadaAuto.premios], [false, [3, 2, 3]]);
  // Sin la vista forzada, un draft que ya estaba completo va directo al postdraft
  await d.accion('vistaOverlay', { vista: 'auto' });
  assert.equal(d.estado.vistaOverlay, 'postdraft');
  d.ws.close();
});

test('los archivos se validan con su huella: si no han cambiado, no se vuelven a bajar', async () => {
  const r = await fetch(`${urlWeb}/marca.css`);
  const etag = r.headers.get('etag');
  assert.ok(etag);
  assert.equal(r.headers.get('cache-control'), 'no-cache');
  const otra = await fetch(`${urlWeb}/marca.css`, { headers: { 'If-None-Match': etag } });
  assert.equal(otra.status, 304);
  const logo = await fetch(`${urlWeb}/logos/KAIJU.png`);
  assert.match(logo.headers.get('cache-control'), /max-age=86400/);
  await logo.arrayBuffer();
});

// ---------- la partida que manda el puente ----------
// Paquetes como los del puente (Live Client Data API), con la contraseña del panel
const puente = cuerpo => fetch(`${urlWeb}/api/partida`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Clave': CLAVE },
  body: JSON.stringify({ version: 4, ...cuerpo }) }).then(r => r.json());
const POSICIONES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
const jugadoresDelCliente = () => ['azul', 'rojo'].flatMap(lado => POSICIONES.map((position, i) => ({
  riotIdGameName: `${lado}${i}`, summonerName: `${lado}${i}`, team: lado === 'azul' ? 'ORDER' : 'CHAOS', position, level: 14, items: [],
  championName: PICKS[lado][i], rawChampionName: `game_character_displayname_${PICKS[lado][i]}`,
  scores: { kills: lado === 'azul' ? 3 : 1, deaths: 2, assists: 4, creepScore: 150, wardScore: 20 } })));
const paquete = (gameTime, eventos) => puente({ juego: { gameTime }, jugadores: jugadoresDelCliente(), eventosData: { Events: eventos }, desde: 0 });
const inicio = { EventID: 0, EventName: 'GameStart', EventTime: 0 };

test('con el puente: la partida pone el marcador, su fin deja la pantalla final y «Siguiente partida» pasa página', async () => {
  const c = await conectar();
  await c.accion('vistaOverlay', { vista: 'auto' });
  await puente({ sinPartida: true, espera: true });
  assert.equal(c.estado.vistaOverlay, 'postdraft');

  // Empieza la partida: el marcador
  await paquete(100, [inicio]);
  await c.hasta(e => e.vistaOverlay === 'partida', 'el marcador al empezar la partida');
  assert.equal(c.estado.vista.enPartida, true);

  // Termina: la pantalla final queda guardada al momento y sale tras la espera, aunque el cliente siga abierto
  await paquete(1500, [inicio, { EventID: 1, EventName: 'GameEnd', EventTime: 1499, Result: 'Win' }]);
  const e = await c.hasta(x => x.vistaOverlay === 'final', 'la pantalla final tras el fin de la partida');
  assert.equal(e.final.conMarcador, true);
  assert.equal(e.final.prueba, false);
  assert.equal(e.final.duracion, 1500);
  assert.deepEqual([e.final.equipos.azul.kills, e.final.equipos.rojo.kills], [15, 5]);
  assert.equal(e.final.lineas[0].azul.campeon, 'Aatrox');
  assert.equal(e.final.lineas[0].azul.nombre, 'A1', 'el nombre del panel, no el de la cuenta');
  await paquete(1501, [inicio, { EventID: 1, EventName: 'GameEnd', EventTime: 1499, Result: 'Win' }]);
  assert.equal(c.estado.vistaOverlay, 'final', 'los paquetes de después del fin no la quitan');

  // Siguiente partida: vuelta al draft, y la partida vieja (el cliente sigue abierto) no vuelve a dejar su final
  await c.accion('siguiente');
  assert.equal(c.estado.vistaOverlay, 'draft');
  await paquete(1502, [inicio, { EventID: 1, EventName: 'GameEnd', EventTime: 1499, Result: 'Win' }]);
  await esperar(400);
  assert.equal(c.estado.final, null);
  assert.equal(c.estado.vistaOverlay, 'draft');

  // Otra partida (el reloj vuelve atrás). El cliente no da el fin a los espectadores: cuando el puente dice que ya no
  // hay partida, también sale la pantalla final
  await paquete(60, [inicio]);
  await c.hasta(x => x.vistaOverlay === 'partida', 'el marcador de la segunda partida');
  await paquete(900, [inicio]);
  await puente({ sinPartida: true, espera: true });
  const f = await c.hasta(x => x.vistaOverlay === 'final', 'la pantalla final al cerrarse el cliente');
  assert.equal(f.final.duracion, 900);
  assert.equal(f.vista.enPartida, false);
  c.ws.close();
});

test('si el puente se cae en plena partida, el overlay sigue en la partida y no salta a la pantalla final', async () => {
  const c = await conectar();
  await c.accion('siguiente');
  await paquete(30, [inicio]);
  await c.hasta(e => e.vistaOverlay === 'partida', 'el marcador');
  // Más de 20 s sin saber nada del puente: la partida se da por parada, pero no por terminada
  await esperar(24000);
  assert.equal(c.partida.activo, false);
  assert.equal(c.partida.puente.conectado, false);
  assert.equal(c.estado.vistaOverlay, 'partida');
  assert.equal(c.estado.final, null);
  // Vuelve el puente y sigue la partida: no ha pasado nada
  await paquete(52, [inicio]);
  assert.equal(c.estado.vistaOverlay, 'partida');
  c.ws.close();
});
