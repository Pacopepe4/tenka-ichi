// Gachapon de Tenka Ichi. Tres clases de carta:
// - Jugador: los jugadores de la liga, con la rareza de su tier en la tier list (S, A, B, C y D).
// - BOOST: personajes de fuera de los clanes, de tier S+, S, A o B (data-proyecto/cartas-boost.json).
// - LEGACY: los jugadores del equipo Legacy (data-proyecto/cartas-legacy.json). No están entre las tres cartas del
//   sobre: de vez en cuando un sobre trae, además, una LEGACY de regalo. Son de colección: no sirven en el fantasy.
// Cada tier tiene su parte del sorteo (PESOS): cuanto mejor es, más difícil es que salga.
// Todo se guarda como un registro de movimientos (altas, canjes, regalos, aperturas y cartas) en la
// pestaña «Gachapon» de Google Sheets; el estado de cada coleccionista se reconstruye leyéndolo. Cada temporada tiene
// su registro («Gachapon», «GachaponT2»…, server/datos.js).
import crypto from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vistaTierlist } from './tierlist.js';
import { CLANES } from './clanes.js';
import { hojaActiva, asegurarPestana, leer, anadir } from './sheets.js';
import { TEMPORADA, pestanaDeTemporada, archivoDeTemporada } from './datos.js';

export const TIERS_CARTA = ['S+', 'S', 'A', 'B', 'C', 'D'];
export const TIERS_BOOST = ['S+', 'S', 'A', 'B'];
// La parte del sorteo de cada tier, en tanto por ciento de las cartas que salen: casi todo es de las tiers bajas y una S
// o una S+ es difícil de ver (entre las dos, 3 de cada 200 cartas). La parte de una tier se la reparten por igual sus
// cartas, sean de Jugador o BOOST, así que no depende de cuántas haya en cada tier; si una tier no tiene ninguna
// carta, su parte se reparte entre las demás en proporción. La página enseña las probabilidades que salen de verdad
export const PESOS = { 'S+': 0.3, S: 1.2, A: 6.5, B: 22, C: 30, D: 40 };
export const CARTAS_POR_SOBRE = 3;
export const SOBRES_INICIALES = 3;
export const REPETIDAS_POR_SOBRE = 5;   // cartas repetidas que hay que fundir para llevarse un sobre

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARCHIVO_BOOSTS = process.env.ARCHIVO_BOOSTS
  ? path.resolve(process.env.ARCHIVO_BOOSTS) : path.join(RAIZ, 'data-proyecto', 'cartas-boost.json');
// Dibujos de las cartas y marcos; las pruebas y la vista previa usan otra carpeta con CARPETA_CARTAS
export const CARPETA_ARTE = process.env.CARPETA_CARTAS ? path.resolve(process.env.CARPETA_CARTAS) : path.join(RAIZ, 'public', 'cartas');

const ARCHIVO = archivoDeTemporada('gacha');
const PESTANA = pestanaDeTemporada('Gachapon');
const CABECERA = ['Fecha', 'ID de usuario', 'Usuario', 'Tipo', 'Detalle', 'Cantidad', 'Rareza'];

const TIPOS_CON_SOBRES = new Set(['alta', 'regalo', 'canje', 'premio', 'codigo', 'fundido']);
let registro = [];
const usuarios = new Map();
const canjes = new Set();
const usosCodigo = new Map();   // código de directo → cuántas personas lo han canjeado
// Twitch vinculado: id de Twitch → id de la cuenta del gachapon. Lo que le llegue a ese id de Twitch (los canjes de
// puntos del canal, un regalo por su nombre de Twitch) cuenta para la cuenta vinculada
const vinculos = new Map();
let sinGuardar = [];

function aplicar(e) {
  if (e.tipo === 'temporada') return;   // la marca del estreno de la temporada (estrenarTemporada): no es de nadie
  const id = vinculos.get(String(e.id)) || e.id;
  let u = usuarios.get(id);
  if (!u) { u = { id, nombre: e.usuario, sobres: 0, abiertos: 0, cartas: new Map(), codigos: new Set(), twitch: null }; usuarios.set(id, u); }
  // El nombre es el de la cuenta: un canje llega con el nombre de Twitch y no lo pisa
  if (e.usuario && id === e.id) u.nombre = e.usuario;
  if (e.tipo === 'vinculo') vincular(u, e.detalle);
  const n = Number(e.cantidad) || 0;
  if (e.tipo === 'alta') u.alta = true;
  // Sobres que entran: de bienvenida, regalados, canjeados con puntos del canal, premios de jornada, códigos de
  // directo y los que salen de fundir repetidas
  if (TIPOS_CON_SOBRES.has(e.tipo)) u.sobres += n;
  if (e.tipo === 'canje') canjes.add(e.detalle);
  if (e.tipo === 'codigo') { u.codigos.add(e.detalle); usosCodigo.set(e.detalle, (usosCodigo.get(e.detalle) || 0) + 1); }
  if (e.tipo === 'apertura') { u.sobres -= 1; u.abiertos += 1; }
  if (e.tipo === 'carta') u.cartas.set(e.detalle, (u.cartas.get(e.detalle) || 0) + 1);
  // Una carta fundida: la cantidad va en negativo. La última copia nunca se funde, pero por si acaso se quita del mapa
  if (e.tipo === 'fusion') {
    const quedan = (u.cartas.get(e.detalle) || 0) + n;
    if (quedan > 0) u.cartas.set(e.detalle, quedan); else u.cartas.delete(e.detalle);
  }
}

// Un vínculo con Twitch («tw:id:nombre» en el detalle) o, con el detalle vacío, su retirada. Una cuenta lleva un solo
// Twitch y un Twitch va a una sola cuenta: manda el último vínculo. Si ese Twitch ya tenía sobres o cartas a su
// nombre (canjes de antes de vincularse), se juntan con los de la cuenta
function vincular(u, detalle) {
  const [twitch, login = ''] = String(detalle || '').replace(/^tw:/, '').split(':');
  if (u.twitch) vinculos.delete(u.twitch.id);
  u.twitch = null;
  if (!twitch || twitch === String(u.id)) return;
  const otra = usuarios.get(vinculos.get(twitch));
  if (otra) otra.twitch = null;
  const suya = usuarios.get(twitch);
  if (suya) {
    u.sobres += suya.sobres;
    u.abiertos += suya.abiertos;
    for (const [carta, n] of suya.cartas) u.cartas.set(carta, (u.cartas.get(carta) || 0) + n);
    for (const codigo of suya.codigos) u.codigos.add(codigo);
    usuarios.delete(twitch);
  }
  vinculos.set(twitch, u.id);
  u.twitch = { id: twitch, login };
}

// El detalle de un vínculo empieza por letras para que la hoja no lo tome por una hora (hay nombres de Twitch que son números)
const detalleVinculo = t => `tw:${t.id}:${t.login || ''}`;

const aFila = e => [e.fecha, e.id, e.usuario || '', e.tipo, e.detalle || '', e.cantidad ?? 0, e.rareza || ''];
const deFila = f => ({ fecha: f[0], id: f[1], usuario: f[2], tipo: f[3], detalle: f[4], cantidad: Number(f[5]) || 0, rareza: f[6] || '' });

// Rehace el estado de cada coleccionista leyendo un registro (el de esta temporada, si no se dice otro)
function reconstruir(eventos = registro) {
  usuarios.clear(); canjes.clear(); usosCodigo.clear(); vinculos.clear();
  eventos.forEach(aplicar);
}

// El registro de una temporada, tal como está guardado
async function leerRegistro(temporada = TEMPORADA) {
  if (hojaActiva()) {
    const pestana = pestanaDeTemporada('Gachapon', temporada);
    await asegurarPestana(pestana, CABECERA);
    return (await leer(pestana)).slice(1).filter(f => f[1]).map(deFila);
  }
  // En local, que aún no haya archivo es empezar de cero
  return JSON.parse(await readFile(archivoDeTemporada('gacha', temporada), 'utf8').catch(e => { if (e.code === 'ENOENT') return '[]'; throw e; }));
}

export async function cargarGacha() {
  try { registro = await leerRegistro(); }
  catch (e) {
    console.error('No se pudo leer el gachapon:', e.message);
    registro = [];
  }
  reconstruir();
  await cargarCartas();
}

async function guardar(eventos) {
  if (hojaActiva()) {
    const filas = [...sinGuardar, ...eventos].map(aFila);
    try { await anadir(PESTANA, filas); sinGuardar = []; }
    catch (e) { sinGuardar.push(...eventos); console.error('Gachapon sin guardar en Sheets, se reintenta:', e.message); }
  } else {
    await mkdir(path.dirname(ARCHIVO), { recursive: true });
    await writeFile(ARCHIVO, JSON.stringify(registro));
  }
}
// Si Google Sheets falló, se reintenta cada 30 s con lo pendiente
setInterval(() => { if (sinGuardar.length) guardar([]).catch(() => {}); }, 30000).unref();

async function registrar(eventos) {
  for (const e of eventos) { registro.push(e); aplicar(e); }
  await guardar(eventos);
}

// Una operación detrás de otra, para que nadie abra dos veces el mismo sobre
let cola = Promise.resolve();
const enCola = fn => { const p = cola.then(fn); cola = p.catch(() => {}); return p; };
const ahora = () => new Date().toISOString();

// ---------- cartas BOOST, arte y marcos ----------
// Personajes de fuera de los clanes. No tienen clan ni rol, así que no ocupan un hueco de rol en el fantasy: se vinculan
// a uno de los jugadores alineados (server/fantasy.js).
// data-proyecto/cartas-boost.json: [{ "id": "BOOST-NOMBRE", "nombre": "…", "tier": "S+", "subtitulo": "…", "activa": true,
//   "multiplicador": 3, "condicion": "dano" }]
// El multiplicador se aplica a los puntos si en la partida cumple la condición (sin condición válida no hay bonus)
export const CONDICIONES_BOOST = {
  dano: { texto: 'el que más daño hace', corto: 'más daño' },
  participacion: { texto: 'el que más participación en asesinatos tiene', corto: 'más participación' },
  'dano-torres': { texto: 'el que más daño hace a torres', corto: 'más daño a torres' },
  cs: { texto: 'el que más CS tiene', corto: 'más CS' },
  asistencias: { texto: 'el que más asistencias tiene', corto: 'más asistencias' },
};
// etiqueta cabe en la carta; texto es la frase entera
function bonusBoost(e) {
  const multiplicador = Number(e.multiplicador), c = CONDICIONES_BOOST[e.condicion];
  return multiplicador > 1 && c
    ? { multiplicador, condicion: e.condicion, etiqueta: `×${multiplicador} · ${c.corto}`, texto: `×${multiplicador} si es ${c.texto} de la partida` }
    : null;
}

// ---------- cartas LEGACY ----------
// Los jugadores del equipo Legacy (el que está apartado de la competición, server/clanes.js). No son de las que salen
// normalmente: quedan fuera del sorteo de las tres cartas y, en una parte muy pequeña de los sobres (PROBABILIDAD_LEGACY),
// sale una de regalo como carta extra. No sirven en el fantasy (ni se alinean ni dan bonus): son de colección. Se pintan
// como las S+ «full art», con «LEGACY» en el sello y solo su título debajo del nombre.
// data-proyecto/cartas-legacy.json: [{ "id": "LEGACY-NOMBRE", "nombre": "…", "subtitulo": "…", "clan": "AMATERATSU", "activa": true }]
// Una LEGACY no existe hasta que tiene su dibujo vertical (public/cartas/fullart/ID.webp): nunca sale con el splash de
// Riot. En cuanto se sube el dibujo, entra sola. LEGACY_SIN_DIBUJO=1 las deja salir sin él (lo usa la demo).
export const TIER_LEGACY = 'LEGACY';
const LEGACY_SIN_DIBUJO = /^(1|si|sí|true)$/i.test(process.env.LEGACY_SIN_DIBUJO || '');
const probabilidadDe = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? 0.03 : Math.max(0, Math.min(1, Number(v))));
export const PROBABILIDAD_LEGACY = probabilidadDe(process.env.PROBABILIDAD_LEGACY);   // parte de los sobres que traen una LEGACY de regalo
const ARCHIVO_LEGACY = process.env.ARCHIVO_LEGACY
  ? path.resolve(process.env.ARCHIVO_LEGACY) : path.join(RAIZ, 'data-proyecto', 'cartas-legacy.json');
let legacy = [];
async function cargarLegacy() {
  let lista = [];
  try { lista = JSON.parse(await readFile(ARCHIVO_LEGACY, 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') console.error('No se pudieron leer las cartas LEGACY:', e.message); }
  const ocupados = new Set([...vistaTierlist().jugadores.map(j => j.id), ...boosts.map(b => b.id)]);
  legacy = (Array.isArray(lista) ? lista : [])
    .filter(e => e?.id && e?.nombre && e.activa !== false)
    .map(e => ({ id: String(e.id).trim().toUpperCase().replace(/[^A-Z0-9-]+/g, '-'), nombre: String(e.nombre), tier: TIER_LEGACY,
      subtitulo: e.subtitulo ? String(e.subtitulo) : 'Legacy', clan: CLANES.some(c => c.id === e.clan && c.legacy) ? e.clan : null,
      rol: null, tipo: 'legacy', bonus: null }))
    .filter((e, i, todas) => !ocupados.has(e.id) && todas.findIndex(x => x.id === e.id) === i);
}

let boosts = [];
async function cargarBoosts() {
  let lista = [];
  try { lista = JSON.parse(await readFile(ARCHIVO_BOOSTS, 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') console.error('No se pudieron leer las cartas BOOST:', e.message); }
  const deJugador = new Set(vistaTierlist().jugadores.map(j => j.id));
  boosts = (Array.isArray(lista) ? lista : [])
    .filter(e => e?.id && e?.nombre && TIERS_BOOST.includes(e.tier) && e.activa !== false)
    .map(e => ({ id: String(e.id).trim().toUpperCase().replace(/[^A-Z0-9-]+/g, '-'), nombre: String(e.nombre), tier: e.tier,
      subtitulo: e.subtitulo ? String(e.subtitulo) : 'Boost', clan: null, rol: null, tipo: 'boost', bonus: bonusBoost(e) }))
    .filter((e, i, todas) => !deJugador.has(e.id) && todas.findIndex(x => x.id === e.id) === i);
}

// Campeón de cada carta (jugadores y BOOST), con el id de Data Dragon: { "KAIJU-TOP": "Rumble", "BOOST-SONS": "Sejuani" }
// data-proyecto/campeones-cartas.json. Su splash es el fondo de la carta mientras no tenga un dibujo propio; el nombre
// no se escribe en la carta. Un id que Data Dragon no conoce se descarta con un aviso.
const ARCHIVO_CAMPEONES = process.env.ARCHIVO_CAMPEONES
  ? path.resolve(process.env.ARCHIVO_CAMPEONES) : path.join(RAIZ, 'data-proyecto', 'campeones-cartas.json');
let campeones = new Map(), splashes = new Set();
const campeonesAvisados = new Set();
async function cargarCampeones() {
  let lista = {}, nombres = new Map();
  try { lista = JSON.parse(await readFile(ARCHIVO_CAMPEONES, 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') console.error('No se pudieron leer los campeones de las cartas:', e.message); }
  try {
    const { campeones: todos } = JSON.parse(await readFile(path.join(RAIZ, 'public', 'ddragon', 'campeones.json'), 'utf8'));
    nombres = new Map(todos.map(c => [c.id, c.nombre]));
  } catch (e) { console.error('No se pudo leer la lista de campeones de Data Dragon:', e.message); }
  splashes = new Set(await readdir(path.join(RAIZ, 'public', 'ddragon', 'splash')).catch(() => []));
  campeones = new Map();
  for (const [carta, id] of Object.entries(lista)) {
    if (nombres.has(id)) campeones.set(carta.trim().toUpperCase(), { id, nombre: nombres.get(id) });
    else if (nombres.size && !campeonesAvisados.has(carta)) { campeonesAvisados.add(carta); console.error(`Campeón desconocido en ${carta}: ${id}`); }
  }
}

// Arte propio de cada carta en public/cartas/ID.webp|png|jpg (p. ej. KAIJU-TOP.png o BOOST-NOMBRE.png).
// Marcos de cada clase y tier en public/cartas/marcos/jugador/ y boost/ (TIER.webp; la S+ es SP) y el reverso,
// igual para todas, en public/cartas/marcos/reverso.webp. Salen de diseno/marcos/. Mientras no estén, la carta
// lleva el splash de su campeón, si no la imagen de su clan (o el sol partido si es BOOST), y el marco dibujado con CSS.
// Carta «full art»: si además hay un dibujo vertical (1000×1400) en public/cartas/fullart/ID.webp, la carta se pinta
// con él a carta completa en vez de con el marco (lo llevan las BOOST S+). El cuadrado sigue haciendo falta: es el
// que usan las imágenes de compartir.
// La dirección lleva la fecha del archivo: se puede guardar en caché y, si cambia el dibujo, cambia la dirección.
const EXTENSIONES = ['.webp', '.png', '.jpg', '.jpeg'];
let artes = new Map(), completas = new Map(), marcos = { jugador: new Map(), boost: new Map() }, reverso = null;

async function indiceImagenes(carpeta, prefijo) {
  let archivos = [];
  try { archivos = await readdir(carpeta); } catch { return new Map(); }
  const indice = new Map();
  for (const ext of EXTENSIONES) for (const f of archivos) {
    if (path.extname(f).toLowerCase() !== ext) continue;
    const id = path.basename(f, path.extname(f)).toUpperCase();
    if (indice.has(id)) continue;
    try { indice.set(id, `${prefijo}${encodeURIComponent(f)}?v=${Math.round((await stat(path.join(carpeta, f))).mtimeMs).toString(36)}`); }
    catch {}
  }
  return indice;
}

async function cargarCartas() {
  await Promise.all([cargarBoosts(), cargarCampeones()]);
  await cargarLegacy();
  const carpeta = path.join(CARPETA_ARTE, 'marcos');
  const [a, full, jugador, boost, sueltos] = await Promise.all([indiceImagenes(CARPETA_ARTE, '/cartas/'),
    indiceImagenes(path.join(CARPETA_ARTE, 'fullart'), '/cartas/fullart/'),
    indiceImagenes(path.join(carpeta, 'jugador'), '/cartas/marcos/jugador/'), indiceImagenes(path.join(carpeta, 'boost'), '/cartas/marcos/boost/'),
    indiceImagenes(carpeta, '/cartas/marcos/')]);
  artes = a;
  completas = full;
  marcos = { jugador, boost };
  reverso = sueltos.get('REVERSO') || null;
}
// Si se añaden dibujos o cartas BOOST con la web encendida, aparecen en un minuto
setInterval(() => cargarCartas().catch(() => {}), 60000).unref();

// Clave de la tier para archivos y CSS: la S+ es SP
export const claveTier = t => (t === 'S+' ? 'SP' : t);
const splashDe = c => (c.campeon && splashes.has(`${c.campeon.id}.jpg`) ? `/ddragon/splash/${c.campeon.id}.jpg` : null);
const arteDe = c => artes.get(c.id) || splashDe(c) || (c.clan ? `/clanes/${c.clan}.jpg` : '/marca/sol-partido.jpg');
const marcoDe = c => marcos[c.tipo]?.get(claveTier(c.tier)) || null;
// El reverso es el mismo para todas las cartas: al abrir el sobre no se sabe qué ha tocado hasta darle la vuelta
export const reversoCarta = () => reverso;

// ---------- cartas y probabilidades ----------
export function catalogo() {
  const jugadores = vistaTierlist().jugadores.filter(j => j.nombre && j.tier).map(j => ({ ...j, tipo: 'jugador' }));
  // Cada carta pesa en el sorteo la parte de su tier repartida entre las cartas de esa tier
  const deTier = new Map();
  for (const c of [...boosts, ...jugadores]) deTier.set(c.tier, (deTier.get(c.tier) || 0) + 1);
  // Las LEGACY pesan 0: no entran en el sorteo de las tres cartas del sobre. Y solo cuentan las que ya tienen su dibujo
  return [...legacy.filter(c => LEGACY_SIN_DIBUJO || completas.has(c.id)), ...boosts, ...jugadores].map(c => ({ ...c, campeon: campeones.get(c.id) || null }))
    .map(c => ({ ...c, arte: arteDe(c), fullart: completas.get(c.id) || null, marco: marcoDe(c), peso: c.tipo === 'legacy' ? 0 : (PESOS[c.tier] || 0) / deTier.get(c.tier) }));
}

// Probabilidad de que una carta cualquiera del sobre sea de cada tier
export function probabilidades(cat = catalogo()) {
  const total = cat.reduce((s, c) => s + c.peso, 0);
  return Object.fromEntries(TIERS_CARTA.map(t => [t, total ? cat.filter(c => c.tier === t).reduce((s, c) => s + c.peso, 0) / total : 0]));
}

// Los sobres se abren cuando hay cartas de Jugador: solo con las BOOST (S+ y S), todas las cartas saldrían de las mejores
export const sobresListos = (cat = catalogo()) => cat.some(c => c.tipo === 'jugador');
// El reparto tal como está pensado, con cartas en todas las tiers: lo que se enseña mientras los sobres no se abren
export function reparto() {
  const total = Object.values(PESOS).reduce((s, x) => s + x, 0);
  return Object.fromEntries(TIERS_CARTA.map(t => [t, PESOS[t] / total]));
}

// Sorteo por pesos, que tienen decimales: un número aleatorio seguro entre 0 y el peso total
const MAXIMO_AZAR = 2 ** 48 - 1;
export function sacarCarta(cat) {
  const total = cat.reduce((s, c) => s + c.peso, 0);
  let r = crypto.randomInt(MAXIMO_AZAR) / MAXIMO_AZAR * total;
  for (const c of cat) if ((r -= c.peso) < 0) return c;
  return cat[cat.length - 1];
}

// Las cartas de un sobre: ninguna se repite dentro del mismo sobre (salvo que haya menos cartas distintas que huecos)
export function sacarSobre(cat, cuantas = CARTAS_POR_SOBRE) {
  const quedan = [...cat], cartas = [];
  while (cartas.length < cuantas && cat.length) {
    const c = sacarCarta(quedan.length ? quedan : cat);
    cartas.push(c);
    const i = quedan.indexOf(c);
    if (i >= 0) quedan.splice(i, 1);
  }
  return cartas;
}

// La carta extra: en una parte muy pequeña de los sobres sale, además de las tres, una LEGACY al azar
const azarSeguro = () => crypto.randomInt(MAXIMO_AZAR) / MAXIMO_AZAR;
export function sacarLegacy(especiales, probabilidad = PROBABILIDAD_LEGACY, azar = azarSeguro) {
  if (!especiales.length || !(azar() < probabilidad)) return null;
  return especiales[Math.min(especiales.length - 1, Math.floor(azar() * especiales.length))];
}

// ---------- operaciones ----------
// Los sobres de bienvenida se dan una vez, aunque antes le hayan regalado sobres o haya canjeado puntos
export const darAlta = u => enCola(async () => {
  if (usuarios.get(u.id)?.alta) return false;
  await registrar([{ fecha: ahora(), id: u.id, usuario: u.nombre, tipo: 'alta', cantidad: SOBRES_INICIALES }]);
  return true;
});

export const darSobres = (u, cantidad, tipo, detalle = '') => enCola(async () => {
  if (tipo === 'canje' && canjes.has(detalle)) return;
  await registrar([{ fecha: ahora(), id: u.id, usuario: u.nombre, tipo, detalle, cantidad }]);
});

export const abrirSobre = u => enCola(async () => {
  const yo = usuarios.get(u.id);
  if (!yo || yo.sobres < 1) throw new Error('No te quedan sobres');
  const cat = catalogo(), normales = cat.filter(c => c.tipo !== 'legacy');
  if (!sobresListos(cat)) throw new Error('Los sobres se abren cuando estén las cartas de los jugadores: el staff tiene que poner su tier');
  const cartas = sacarSobre(normales);
  const regalo = sacarLegacy(cat.filter(c => c.tipo === 'legacy'));
  if (regalo) cartas.push({ ...regalo, extra: true });
  const fecha = ahora(), sobre = crypto.randomUUID().slice(0, 8);
  await registrar([
    { fecha, id: u.id, usuario: u.nombre, tipo: 'apertura', detalle: sobre, cantidad: -1 },
    ...cartas.map(c => ({ fecha, id: u.id, usuario: u.nombre, tipo: 'carta', detalle: c.id, cantidad: 1, rareza: c.tier })),
  ]);
  return cartas.map(({ peso, ...c }) => c);
});

export const canjeProcesado = id => canjes.has(id);

// ---------- temporada nueva ----------
// Al estrenar una temporada todos empiezan de cero, con los sobres de bienvenida: quien ya había entrado en la anterior
// conserva su cuenta (no tiene que registrarse otra vez) y su Twitch vinculado, y no arrastra ni cartas, ni sobres, ni
// historial. El registro de la temporada anterior no se toca: se queda como estaba, en su pestaña o en su archivo.
// Se hace una sola vez: queda apuntado en el registro nuevo con un movimiento «temporada», que va en la misma escritura
// que las altas. Devuelve { cuentas } o null si ya estaba estrenada (o si es la primera, que no tiene anterior)
const marcaDeEstreno = () => registro.find(e => e.tipo === 'temporada') || null;
let errorDeEstreno = null;
export const estrenarTemporada = () => enCola(async () => {
  if (TEMPORADA <= 1 || marcaDeEstreno()) return null;
  try {
    if (sinGuardar.length) throw new Error('Hay movimientos del gachapon sin guardar en la hoja');
    // Con el registro de esta temporada recién leído: si no se puede leer, no se sabe si ya está estrenada y no se hace nada
    registro = await leerRegistro();
    reconstruir();
    if (marcaDeEstreno()) { errorDeEstreno = null; return null; }
    // Las cuentas de la temporada anterior salen de leer su registro igual que se lee el de esta
    reconstruir(await leerRegistro(TEMPORADA - 1));
    const cuentas = [...usuarios.values()].filter(u => u.alta).map(u => ({ id: u.id, nombre: u.nombre, twitch: u.twitch }));
    reconstruir();
    const fecha = ahora(), tiene = id => usuarios.get(id);
    const eventos = [{ fecha, id: 'tenka-ichi', usuario: 'Tenka Ichi', tipo: 'temporada', detalle: `T${TEMPORADA}`, cantidad: cuentas.length },
      ...cuentas.flatMap(c => [
        ...(tiene(c.id)?.alta ? [] : [{ fecha, id: c.id, usuario: c.nombre, tipo: 'alta', detalle: '', cantidad: SOBRES_INICIALES }]),
        ...(c.twitch && !tiene(c.id)?.twitch ? [{ fecha, id: c.id, usuario: c.nombre, tipo: 'vinculo', detalle: detalleVinculo(c.twitch), cantidad: 0 }] : [])])];
    if (hojaActiva()) {
      // Todo en una sola escritura. Después manda lo que haya quedado en la hoja: puede haberse escrito aunque la
      // respuesta no llegara, y repetirlo daría los sobres dos veces
      const fallo = await anadir(PESTANA, eventos.map(aFila)).then(() => null, e => e);
      registro = await leerRegistro().catch(e => { throw fallo || e; });
      reconstruir();
      if (!marcaDeEstreno()) throw fallo || new Error('El estreno no ha quedado apuntado en la hoja');
    } else {
      registro.push(...eventos);
      reconstruir();
      await mkdir(path.dirname(ARCHIVO), { recursive: true });
      await writeFile(ARCHIVO, JSON.stringify(registro));
    }
    errorDeEstreno = null;
    return { cuentas: cuentas.length };
  } catch (e) {
    errorDeEstreno = e.message;
    throw e;
  }
});

// Para la web y el panel: qué temporada es, cuándo se estrenó y con cuántas cuentas, y por qué no si no se ha podido
export function estadoTemporada() {
  const marca = marcaDeEstreno();
  return { numero: TEMPORADA, estreno: marca && { fecha: marca.fecha, cuentas: marca.cantidad },
    pendiente: TEMPORADA > 1 && !marca, error: marca ? null : errorDeEstreno };
}

// ---------- Twitch vinculado ----------
// Quien entra con su cuenta de siempre (Discord) vincula su Twitch y, desde entonces, los sobres de sus canjes de
// puntos del canal le llegan a esa misma colección. twitch: { id, login } de quien ha autorizado en Twitch
export const vincularTwitch = (u, twitch) => enCola(async () => {
  const id = String(twitch?.id || '');
  if (!id) throw new Error('Twitch no ha dicho de quién es la cuenta');
  if (usuarios.get(u.id)?.twitch?.id === id) return false;
  await registrar([{ fecha: ahora(), id: u.id, usuario: u.nombre, tipo: 'vinculo', detalle: detalleVinculo({ id, login: twitch.login }), cantidad: 0 }]);
  return true;
});

export const desvincularTwitch = u => enCola(async () => {
  if (!usuarios.get(u.id)?.twitch) return false;
  await registrar([{ fecha: ahora(), id: u.id, usuario: u.nombre, tipo: 'vinculo', detalle: '', cantidad: 0 }]);
  return true;
});

// ---------- códigos de directo ----------
// Cada persona canjea un código una sola vez; cuántas lo han canjeado sale del registro
export const usosDeCodigo = codigo => usosCodigo.get(codigo) || 0;
export const canjeoCodigo = (id, codigo) => Boolean(usuarios.get(id)?.codigos.has(codigo));
export const darSobresDeCodigo = (u, codigo, cantidad, maximo = 0) => enCola(async () => {
  if (usuarios.get(u.id)?.codigos.has(codigo)) throw new Error('Ya has canjeado este código');
  if (maximo && usosDeCodigo(codigo) >= maximo) throw new Error('Este código ya se ha agotado');
  await registrar([{ fecha: ahora(), id: u.id, usuario: u.nombre, tipo: 'codigo', detalle: codigo, cantidad }]);
});

// ---------- fundir repetidas ----------
// Cada REPETIDAS_POR_SOBRE cartas repetidas se cambian por un sobre. pedidas: { idDeCarta: cuántas copias }.
// De cada carta se queda al menos una copia, o las que diga minimo(id) (las BOOST que estén en la alineación)
export const fundirRepetidas = (u, pedidas, minimo = () => 1) => enCola(async () => {
  const yo = usuarios.get(u.id);
  if (!yo) throw new Error('No tienes cartas que fundir');
  const lista = Object.entries(pedidas || {}).map(([id, n]) => [id, Math.round(Number(n))]).filter(([, n]) => n > 0);
  const total = lista.reduce((s, [, n]) => s + n, 0);
  if (!total) throw new Error('Elige las cartas repetidas que quieres fundir');
  if (total % REPETIDAS_POR_SOBRE) throw new Error(`Hay que fundir las cartas de ${REPETIDAS_POR_SOBRE} en ${REPETIDAS_POR_SOBRE}: llevas ${total}`);
  const tiers = new Map(catalogo().map(c => [c.id, c.tier]));
  for (const [id, n] of lista) {
    const tengo = yo.cartas.get(id) || 0;
    if (tengo - n < Math.max(1, minimo(id))) throw new Error('Solo se pueden fundir las copias que te sobran de cada carta');
  }
  const fecha = ahora(), sobres = total / REPETIDAS_POR_SOBRE;
  await registrar([
    ...lista.map(([id, n]) => ({ fecha, id: u.id, usuario: u.nombre, tipo: 'fusion', detalle: id, cantidad: -n, rareza: tiers.get(id) || '' })),
    { fecha, id: u.id, usuario: u.nombre, tipo: 'fundido', detalle: `${total} cartas`, cantidad: sobres },
  ]);
  return { sobres, cartas: total };
});

export function estadoUsuario(id) {
  const u = usuarios.get(id);
  if (!u) return { sobres: 0, abiertos: 0, cartas: [], twitch: null };
  return { sobres: u.sobres, abiertos: u.abiertos, cartas: [...u.cartas].map(([carta, cantidad]) => ({ id: carta, cantidad })),
    twitch: u.twitch ? { login: u.twitch.login } : null };
}

export function buscarUsuario(nombre) {
  const n = String(nombre).trim().toLowerCase();
  return [...usuarios.values()].find(u => u.nombre?.toLowerCase() === n) || null;
}

export function resumenGacha() {
  let abiertos = 0, sobres = 0;
  for (const u of usuarios.values()) { abiertos += u.abiertos; sobres += u.sobres; }
  const cat = catalogo();
  return { coleccionistas: usuarios.size, sobresAbiertos: abiertos, sobresSinAbrir: sobres, conTwitch: vinculos.size,
    cartas: cat.filter(c => c.tipo !== 'legacy').length, legacy: cat.filter(c => c.tipo === 'legacy').length, listos: sobresListos(cat) };
}
