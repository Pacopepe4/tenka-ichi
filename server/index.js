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
import { cargarTierlist, vistaTierlist, ponerTier } from './tierlist.js';
import { cargarAjustes } from './ajustes.js';
import { cargarGacha, catalogo, probabilidades, abrirSobre, darAlta, darSobres, estadoUsuario, buscarUsuario, resumenGacha,
  PESOS, CARTAS_POR_SOBRE, SOBRES_INICIALES } from './gacha.js';
import { cargarCanal, conectarCanal, cambiarCoste, sondear, sondearSiHaceFalta, estadoCanal, SCOPE_CANAL } from './canal.js';
import { firmar, verificar, leerCookies, ponerCookie } from './sesion.js';
import { twitchActivo, urlAutorizar, canjearCodigo, usuarioDeToken, usuarioPorNombre, CANAL } from './twitch.js';
import crypto from 'node:crypto';

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
    case 'tier':
      ponerTier(d.tipo, d.id, d.tier || null);
      return { ok: true, tierlist: vistaTierlist() };
    case 'gachaEstado':
      return { ok: true, gacha: estadoGachaPanel() };
    case 'twitchCanal': {
      if (!twitchActivo()) return { ok: false, error: 'Falta configurar la app de Twitch en Render (TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET y SESION_SECRETO)' };
      return { ok: true, url: `/auth/canal?t=${encodeURIComponent(firmar({ canal: true }, 300))}` };
    }
    case 'gachaCoste':
      await cambiarCoste(d.coste);
      return { ok: true, gacha: estadoGachaPanel() };
    case 'gachaSondear':
      await sondear();
      return { ok: true, gacha: estadoGachaPanel() };
    case 'gachaRegalar': {
      const cantidad = Math.round(Number(d.cantidad));
      if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 20) return { ok: false, error: 'La cantidad tiene que estar entre 1 y 20 sobres' };
      let u = buscarUsuario(d.usuario);
      if (!u && twitchActivo()) {
        const t = await usuarioPorNombre(d.usuario).catch(() => null);
        if (t) u = { id: t.id, nombre: t.display_name };
      }
      if (!u) return { ok: false, error: `No encuentro a «${d.usuario}»: tiene que haber entrado en el gachapon o existir en Twitch` };
      await darSobres({ id: u.id, nombre: u.nombre }, cantidad, 'regalo', d.motivo || 'Regalo del staff');
      return { ok: true, nombre: u.nombre, gacha: estadoGachaPanel() };
    }
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

// ---------- gachapon y sesiones de Twitch ----------
const EN_RENDER = Boolean(process.env.RENDER);
const loginActivo = () => twitchActivo() || !EN_RENDER; // en local se puede entrar sin Twitch para probar
const origen = req => `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
const usuarioDeSesion = req => verificar(leerCookies(req).tk_sesion);

function estadoGachaPanel() {
  return { login: twitchActivo(), canal: estadoCanal(), resumen: resumenGacha(), probabilidades: probabilidades() };
}

function infoGacha(u) {
  const c = estadoCanal();
  return {
    activo: loginActivo(), twitch: twitchActivo(), canal: CANAL,
    cartasPorSobre: CARTAS_POR_SOBRE, sobresIniciales: SOBRES_INICIALES, pesos: PESOS,
    probabilidades: probabilidades(),
    catalogo: catalogo().map(({ peso, ...carta }) => carta),
    recompensa: c.conectado && c.recompensa ? { titulo: c.titulo, coste: c.coste } : null,
    usuario: u ? { nombre: u.nombre, avatar: u.avatar || null, ...estadoUsuario(u.id) } : null,
  };
}

function json(res, datos, codigo = 200) {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(datos));
  return true;
}

function redirigir(res, destino) {
  res.writeHead(302, { Location: destino });
  res.end();
  return true;
}

// Página mínima para contar el resultado de conectar el canal
function paginaAviso(res, titulo, texto, codigo = 200) {
  res.writeHead(codigo, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${titulo}</title>
<link rel="stylesheet" href="/marca.css"><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:var(--sumi);color:var(--washi);font-family:var(--gothic);padding:24px">
<main style="max-width:32em"><h1 style="font-family:var(--mincho);font-weight:800">${titulo}</h1><p style="color:var(--hai);font-size:18px">${texto}</p><p><a href="/panel/" style="color:var(--washi)">Volver al panel</a></p></main></body></html>`);
  return true;
}

async function rutasTwitch(req, res, url) {
  const p = url.pathname;

  if (p === '/auth/twitch') {
    if (!loginActivo()) return paginaAviso(res, 'Muy pronto', 'El inicio de sesión con Twitch aún no está configurado.', 503);
    if (!twitchActivo()) return redirigir(res, '/auth/prueba');
    const state = crypto.randomBytes(16).toString('hex');
    const volver = url.searchParams.get('volver')?.startsWith('/') ? url.searchParams.get('volver') : '/gachapon/';
    ponerCookie(res, 'tk_oauth', firmar({ state, tipo: 'login', volver }, 600), 600, req);
    return redirigir(res, urlAutorizar({ redirect: `${origen(req)}/auth/twitch/callback`, state }));
  }

  if (p === '/auth/canal') {
    if (!verificar(url.searchParams.get('t'))?.canal) return paginaAviso(res, 'Enlace caducado', 'Vuelve a pulsar «Conectar el canal de Twitch» en el panel.', 403);
    const state = crypto.randomBytes(16).toString('hex');
    ponerCookie(res, 'tk_oauth', firmar({ state, tipo: 'canal' }, 600), 600, req);
    return redirigir(res, urlAutorizar({ redirect: `${origen(req)}/auth/twitch/callback`, state, scope: SCOPE_CANAL }));
  }

  if (p === '/auth/twitch/callback') {
    const guardado = verificar(leerCookies(req).tk_oauth);
    ponerCookie(res, 'tk_oauth', '', 0, req);
    if (!guardado || guardado.state !== url.searchParams.get('state')) return paginaAviso(res, 'No se pudo entrar', 'La petición a Twitch caducó o no es válida. Vuelve a intentarlo.', 400);
    if (url.searchParams.get('error')) return redirigir(res, guardado.tipo === 'canal' ? '/panel/' : guardado.volver || '/gachapon/');
    try {
      const t = await canjearCodigo(url.searchParams.get('code'), `${origen(req)}/auth/twitch/callback`);
      const u = await usuarioDeToken(t.access_token);
      if (guardado.tipo === 'canal') {
        await conectarCanal(t, u);
        const c = estadoCanal();
        return paginaAviso(res, 'Canal conectado', c.error ? `El canal ${u.display_name} está conectado, pero: ${c.error}` : `La recompensa «${c.titulo}» ya está en el canal de ${u.display_name}, a ${c.coste} puntos. Ya puedes cerrar esta pestaña.`);
      }
      const sesion = { id: u.id, nombre: u.display_name, avatar: u.profile_image_url };
      await darAlta(sesion);
      ponerCookie(res, 'tk_sesion', firmar(sesion, 30 * 86400), 30 * 86400, req);
      return redirigir(res, guardado.volver || '/gachapon/');
    } catch (e) {
      console.error(e);
      return paginaAviso(res, 'No se pudo entrar', e.message, 500);
    }
  }

  // Solo en local: entrar sin Twitch para probar el gachapon
  if (p === '/auth/prueba' && !EN_RENDER) {
    const nombre = (url.searchParams.get('nombre') || 'Probador').slice(0, 25);
    const sesion = { id: `prueba-${nombre.toLowerCase()}`, nombre, avatar: null };
    await darAlta(sesion);
    ponerCookie(res, 'tk_sesion', firmar(sesion, 86400), 86400, req);
    return redirigir(res, '/gachapon/');
  }

  if (p === '/auth/salir' && req.method === 'POST') {
    ponerCookie(res, 'tk_sesion', '', 0, req);
    return json(res, { ok: true });
  }

  if (p === '/api/gacha') {
    const u = usuarioDeSesion(req);
    if (u) sondearSiHaceFalta();
    return json(res, infoGacha(u));
  }

  if (p === '/api/gacha/abrir' && req.method === 'POST') {
    const u = usuarioDeSesion(req);
    if (!u) return json(res, { ok: false, error: 'Entra con tu cuenta de Twitch para abrir sobres' }, 401);
    try {
      const sobre = await abrirSobre(u);
      return json(res, { ok: true, sobre, usuario: { nombre: u.nombre, avatar: u.avatar || null, ...estadoUsuario(u.id) } });
    } catch (e) {
      return json(res, { ok: false, error: e.message }, 400);
    }
  }

  if (p === '/api/tierlist') return json(res, vistaTierlist());
  return false;
}

// ---------- servidor HTTP estático ----------
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm' };

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const rutaTwitch = url.pathname.startsWith('/auth/') || url.pathname.startsWith('/api/gacha') || url.pathname === '/api/tierlist';
  if (rutaTwitch && await rutasTwitch(req, res, url)) return;
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

await Promise.all([cargar(), cargarPlantillas(), cargarCalendario(), cargarAjustes()]);
await Promise.all([cargarTierlist(), cargarGacha()]);
await cargarCanal().catch(e => console.error('Canal de Twitch:', e.message));
estado.hoja = estadoHoja();
servidor.listen(PUERTO, () => {
  console.log(`TENKA ICHI Draft en http://localhost:${PUERTO}`);
  console.log(`  Panel:   http://localhost:${PUERTO}/panel/`);
  console.log(`  Overlay: http://localhost:${PUERTO}/overlay/`);
});
