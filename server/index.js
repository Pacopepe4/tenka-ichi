// Servidor de TENKA ICHI Draft: sirve el overlay y el panel, mantiene el estado del
// enfrentamiento y lo reparte en directo por WebSocket a todas las pantallas abiertas.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { conectar, codigoDeEnlace, destinoDeSlot } from './draftcore.js';
import { cargar, guardarPartida, todas } from './registro.js';
import { competicion } from './competicion.js';
import { cargarCalendario, calendarioActual, temporadaSimulada, sortearCalendario } from './calendario.js';
import { statsCampeon, statsLiga } from './stats.js';
import { CLANES, ROLES } from './clanes.js';
import { cargarPlantillas, plantilla, guardarPlantilla, refrescarPlantillas } from './plantillas.js';
import { estadoHoja } from './sheets.js';

// Clanes con su plantilla actual (lema, descripción, jugadores) para las páginas
const clanesConPlantilla = () => CLANES.map(c => ({ ...c, ...plantilla(c.id) }));

const PUERTO = Number(process.env.PORT) || 3000;
const CLAVE = process.env.PANEL_CLAVE || 'tenkaichi';
const PUBLICO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const vacio = () => ({ azul: Array(5).fill(null), rojo: Array(5).fill(null) });

const estado = {
  config: { jornada: 'Jornada 1', fase: 'Fase de liga', formato: 'bo1', serie: 1, partida: 1 },
  equipos: {
    azul: { clan: 'NONAME', jugadores: Array(5).fill('') },
    rojo: { clan: 'NONAME', jugadores: Array(5).fill('') },
  },
  fuente: { enlace: '', codigo: null, conectado: false, error: null },
  draft: { turno: 0, activo: null, hover: null, tiempo: null, bans: vacio(), picks: vacio() },
  fearless: [],
  resultados: [],
  // Cámaras del overlay: cuántas se ven (0-4) y qué es cada una
  // tipo: 'caster', 'azul' o 'rojo' (sigue al clan de ese lado) o el id de un clan
  camaras: { cantidad: 0, lista: Array.from({ length: 4 }, () => ({ tipo: 'caster', nombre: '', detalle: '' })) },
  aviso: null,
  hoja: { configurada: false, ok: false, error: null, cuenta: null },
};

// ---------- reparto en directo ----------
const clientes = new Set();
function emitir() {
  const msg = JSON.stringify({ tipo: 'estado', estado });
  for (const ws of clientes) if (ws.readyState === 1) ws.send(msg);
}

// ---------- avisos de pick/ban con estadísticas ----------
let idAviso = 0;
function avisar(tipo, lado, indice, campeon) {
  const eq = estado.equipos[lado];
  const stats = statsCampeon(campeon, { clan: eq.clan, jugador: tipo === 'pick' ? eq.jugadores[indice] : null });
  estado.aviso = { id: ++idAviso, tipo, lado, indice, campeon, rol: tipo === 'pick' ? ROLES[indice] : null,
    jugador: tipo === 'pick' ? eq.jugadores[indice] : null, clan: eq.clan, stats };
}

function detectarNuevos(antes, despues) {
  for (const tipo of ['picks', 'bans']) for (const lado of ['azul', 'rojo']) {
    despues[tipo][lado].forEach((c, i) => {
      if (c && c !== antes[tipo][lado][i]) avisar(tipo === 'picks' ? 'pick' : 'ban', lado, i, c);
    });
  }
}

// ---------- DraftCore ----------
let conexion = null;
function conectarDraftCore(enlace) {
  if (conexion) conexion.cerrar();
  const codigo = codigoDeEnlace(enlace);
  estado.fuente = { enlace, codigo, conectado: false, error: codigo ? null : 'Enlace no válido' };
  if (!codigo) return;
  conexion = conectar(codigo, {
    alEstado: e => { Object.assign(estado.fuente, e); emitir(); },
    alDraft: t => {
      const antes = { picks: estado.draft.picks, bans: estado.draft.bans };
      estado.draft = { ...estado.draft, turno: t.turno, activo: destinoDeSlot(t.slot), hover: t.hover, bans: t.bans, picks: t.picks };
      detectarNuevos(antes, t);
      emitir();
    },
    alHover: h => { estado.draft.hover = h; emitir(); },
    alTiempo: t => { estado.draft.tiempo = t.segundos; emitir(); },
  });
}

// ---------- acciones del panel ----------
async function accion(nombre, d = {}) {
  switch (nombre) {
    case 'config':
      Object.assign(estado.config, d);
      break;
    case 'equipo': {
      const eq = estado.equipos[d.lado];
      if (d.clan) eq.clan = d.clan;
      if (Array.isArray(d.jugadores)) eq.jugadores = d.jugadores.slice(0, 5).map(j => String(j || ''));
      break;
    }
    case 'conectar':
      conectarDraftCore(d.enlace);
      break;
    case 'desconectar':
      if (conexion) conexion.cerrar();
      conexion = null;
      estado.fuente = { ...estado.fuente, conectado: false, error: null };
      break;
    case 'corregir': {
      // corrección manual de un slot: { tipo: 'picks'|'bans', lado, indice, campeon }
      const lista = estado.draft[d.tipo]?.[d.lado];
      if (!lista) break;
      const antes = lista[d.indice];
      lista[d.indice] = d.campeon || null;
      if (d.campeon && d.campeon !== antes) avisar(d.tipo === 'picks' ? 'pick' : 'ban', d.lado, d.indice, d.campeon);
      break;
    }
    case 'invertir': {
      const { azul, rojo } = estado.equipos;
      estado.equipos = { azul: rojo, rojo: azul };
      break;
    }
    case 'ganador': {
      // registra la partida y, en fearless, bloquea sus campeones para la siguiente
      const p = {
        fecha: new Date().toISOString().slice(0, 10),
        jornada: estado.config.jornada, fase: estado.config.fase,
        serie: `${estado.config.jornada} · ${estado.equipos.azul.clan} vs ${estado.equipos.rojo.clan}`,
        partida: estado.config.partida,
        clanAzul: estado.equipos.azul.clan, clanRojo: estado.equipos.rojo.clan,
        ganador: d.lado,
        picks: structuredClone(estado.draft.picks), bans: structuredClone(estado.draft.bans),
        jugadores: { azul: [...estado.equipos.azul.jugadores], rojo: [...estado.equipos.rojo.jugadores] },
      };
      let r;
      try { r = await guardarPartida(p); }
      finally { estado.hoja = estadoHoja(); }
      estado.resultados.push({ partida: p.partida, ganador: d.lado, clan: d.lado === 'azul' ? p.clanAzul : p.clanRojo });
      if (estado.config.formato === 'bo3f') {
        for (const lado of ['azul', 'rojo']) estado.fearless.push(...p.picks[lado].filter(Boolean));
      }
      return { ok: true, enHoja: r.enHoja };
    }
    case 'siguiente':
      estado.config.partida += 1;
      estado.draft = { turno: 0, activo: null, hover: null, tiempo: null, bans: vacio(), picks: vacio() };
      estado.aviso = null;
      break;
    case 'nuevaSerie':
      estado.config.partida = 1;
      estado.fearless = [];
      estado.resultados = [];
      estado.draft = { turno: 0, activo: null, hover: null, tiempo: null, bans: vacio(), picks: vacio() };
      estado.aviso = null;
      break;
    case 'camaras': {
      const n = Number(d.cantidad);
      if (Number.isInteger(n) && n >= 0 && n <= 4) estado.camaras.cantidad = n;
      if (Array.isArray(d.lista)) estado.camaras.lista = estado.camaras.lista.map((c, i) => {
        const x = d.lista[i] || {};
        return { tipo: String(x.tipo || c.tipo), nombre: String(x.nombre ?? c.nombre).slice(0, 40), detalle: String(x.detalle ?? c.detalle).slice(0, 60) };
      });
      break;
    }
    case 'plantilla':
      await guardarPlantilla(d.clan, d);
      break;
    case 'sortear': {
      const cal = await sortearCalendario(d.participantes || [], d.semilla);
      return { ok: true, semilla: cal.semilla };
    }
    case 'probarHoja':
      await cargar().catch(() => {});
      estado.hoja = estadoHoja();
      return { ok: estado.hoja.ok, error: estado.hoja.ok ? null : (estado.hoja.error || 'Google Sheets no está configurado') };
    case 'limpiarAviso':
      estado.aviso = null;
      break;
    default:
      return { ok: false, error: `Acción desconocida: ${nombre}` };
  }
  return { ok: true };
}

// ---------- servidor HTTP estático ----------
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2' };

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/clanes') {
    await refrescarPlantillas();
    res.writeHead(200, { 'Content-Type': TIPOS['.json'], 'Cache-Control': 'no-cache' });
    return res.end(JSON.stringify({ clanes: clanesConPlantilla(), roles: ROLES }));
  }
  const sim = url.searchParams.has('simulacion') ? temporadaSimulada() : null;
  if (url.pathname === '/api/liga') {
    res.writeHead(200, { 'Content-Type': TIPOS['.json'], 'Cache-Control': 'no-cache' });
    return res.end(JSON.stringify(sim ? { ...statsLiga({ partidas: sim.partidas }), simulacion: true } : statsLiga()));
  }
  if (url.pathname === '/api/competicion') {
    res.writeHead(200, { 'Content-Type': TIPOS['.json'], 'Cache-Control': 'no-cache' });
    const datos = sim ? competicion(sim.calendario, sim.partidas) : competicion(calendarioActual(), todas());
    return res.end(JSON.stringify({ ...datos, simulacion: Boolean(sim) }));
  }
  if (url.pathname === '/api/diagnostico') {
    res.writeHead(200, { 'Content-Type': TIPOS['.json'], 'Cache-Control': 'no-cache' });
    return res.end(JSON.stringify({ hoja: estadoHoja() }));
  }
  if (url.pathname === '/salud') { res.writeHead(200); return res.end('ok'); }
  let ruta = decodeURIComponent(url.pathname);
  if (ruta.endsWith('/')) ruta += 'index.html';
  const archivo = path.join(PUBLICO, path.normalize(ruta));
  if (!archivo.startsWith(PUBLICO)) { res.writeHead(403); return res.end(); }
  try {
    const s = await stat(archivo);
    if (s.isDirectory()) { res.writeHead(302, { Location: `${url.pathname}/` }); return res.end(); }
    const cacheable = /\/(ddragon|logos|marca)\//.test(ruta);
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream',
      'Cache-Control': cacheable ? 'public, max-age=86400' : 'no-cache' });
    res.end(await readFile(archivo));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
  }
});

const wss = new WebSocketServer({ server: servidor, path: '/ws' });
wss.on('connection', ws => {
  clientes.add(ws);
  ws.send(JSON.stringify({ tipo: 'estado', estado }));
  ws.on('close', () => clientes.delete(ws));
  ws.on('message', async raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (m.tipo !== 'accion') return;
    if (m.clave !== CLAVE) return ws.send(JSON.stringify({ tipo: 'respuesta', id: m.id, ok: false, error: 'Contraseña incorrecta' }));
    try {
      const r = await accion(m.accion, m.datos);
      ws.send(JSON.stringify({ tipo: 'respuesta', id: m.id, ...r }));
      emitir();
    } catch (e) {
      console.error(e);
      ws.send(JSON.stringify({ tipo: 'respuesta', id: m.id, ok: false, error: e.message }));
    }
  });
});

// Mantiene vivas las conexiones (Render corta las que están inactivas)
setInterval(() => { for (const ws of clientes) if (ws.readyState === 1) ws.ping(); }, 25000);

await Promise.all([cargar(), cargarPlantillas(), cargarCalendario()]);
estado.hoja = estadoHoja();
servidor.listen(PUERTO, () => {
  console.log(`TENKA ICHI Draft en http://localhost:${PUERTO}`);
  console.log(`  Panel:   http://localhost:${PUERTO}/panel/`);
  console.log(`  Overlay: http://localhost:${PUERTO}/overlay/`);
});
