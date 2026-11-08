// Gachapon de Tenka Ichi. Tres clases de carta:
// - Jugador: los jugadores de la liga, con la rareza de su tier en la tier list (S, A, B, C y D).
// - BOOST: personajes de fuera de los clanes, de tier S+, S, A o B (data-proyecto/cartas-boost.json).
// - LEGACY: los jugadores del equipo Legacy (data-proyecto/cartas-legacy.json). No están entre las cuatro cartas del
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
export const CARTAS_POR_SOBRE = 4;      // desde el 08/11/2026, cuatro (antes tres)
export const SOBRES_INICIALES = 3;
export const REPETIDAS_POR_SOBRE = 5;   // cartas repetidas que hay que fundir para llevarse un sobre
// Garantía de rareza (08/11/2026): tras GARANTIA_A sobres seguidos sin ninguna A o mejor, el siguiente trae una A segura;
// tras GARANTIA_S sin ninguna S o mejor, una S segura. La carta segura es una que aún no tienes: si ya tienes todas las
// de esa tier, baja a la anterior (S → A → B…), para que la colección se pueda terminar
export const GARANTIA_A = 5;
export const GARANTIA_S = 10;
export const MAXIMO_TIRADAS = 50;       // sobres que se abren de una vez con «todos»
// Fusión por tiers: REPETIDAS_POR_MEJORA repetidas de la misma tier se cambian por una carta al azar de la tier siguiente
export const REPETIDAS_POR_MEJORA = 3;
export const TIER_SIGUIENTE = { D: 'C', C: 'B', B: 'A', A: 'S' };
// Carta conmemorativa: quien acaba una temporada con CARTAS_CONMEMORATIVA cartas distintas (de jugador, BOOST o LEGACY)
// se lleva la de esa temporada, y la conserva en las siguientes
export const CARTAS_CONMEMORATIVA = 30;
const RANGO = { 'S+': 0, S: 1, A: 2, B: 3, C: 4, D: 5 };
const esAoMejor = t => t in RANGO && RANGO[t] <= RANGO.A;
const esSoMejor = t => t in RANGO && RANGO[t] <= RANGO.S;

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARCHIVO_BOOSTS = process.env.ARCHIVO_BOOSTS
  ? path.resolve(process.env.ARCHIVO_BOOSTS) : path.join(RAIZ, 'data-proyecto', 'cartas-boost.json');
// Dibujos de las cartas y marcos; las pruebas y la vista previa usan otra carpeta con CARPETA_CARTAS
export const CARPETA_ARTE = process.env.CARPETA_CARTAS ? path.resolve(process.env.CARPETA_CARTAS) : path.join(RAIZ, 'public', 'cartas');

const ARCHIVO = archivoDeTemporada('gacha');
const PESTANA = pestanaDeTemporada('Gachapon');
const CABECERA = ['Fecha', 'ID de usuario', 'Usuario', 'Tipo', 'Detalle', 'Cantidad', 'Rareza'];

// «apoyo»: los sobres por suscribirse, regalar suscripciones o mandar kicks en Kick (server/kick-bot.js);
// «familia»: el sobre del premio por juntar una familia entera
const TIPOS_CON_SOBRES = new Set(['alta', 'regalo', 'canje', 'premio', 'codigo', 'fundido', 'apoyo', 'familia']);
// Los que llevan en el detalle el aviso que los dio: se apuntan para no darlos dos veces
const UNA_VEZ = new Set(['canje', 'apoyo']);
// Movimientos que dan una carta: «carta» (la de un sobre), «mejora» (la de fundir por tiers) y «premio-carta» (las
// estéticas: el jefe de una familia completa y la conmemorativa de una temporada). Solo las de los sobres cuentan
// para la garantía
let registro = [];
const usuarios = new Map();
const canjes = new Set();
const usosCodigo = new Map();   // código de directo → cuántas personas lo han canjeado
// Twitch o Kick vinculado: id de Twitch (o «kick-» y el id de Kick) → id de la cuenta del gachapon. Lo que le llegue a
// ese id (los canjes de puntos del canal, un regalo por su nombre de Twitch) cuenta para la cuenta vinculada
const vinculos = new Map();
let sinGuardar = [];

function aplicar(e) {
  if (e.tipo === 'temporada') return;   // la marca del estreno de la temporada (estrenarTemporada): no es de nadie
  const id = vinculos.get(String(e.id)) || e.id;
  let u = usuarios.get(id);
  if (!u) { u = { id, nombre: e.usuario, sobres: 0, abiertos: 0, cartas: new Map(), codigos: new Set(), twitch: null, kick: null, sinA: 0, sinS: 0, familias: new Set() }; usuarios.set(id, u); }
  // El nombre es el de la cuenta: un canje llega con el nombre de Twitch y no lo pisa
  if (e.usuario && id === e.id) u.nombre = e.usuario;
  if (e.tipo === 'vinculo') vincular(u, e.detalle);
  const n = Number(e.cantidad) || 0;
  if (e.tipo === 'alta') u.alta = true;
  // Sobres que entran: de bienvenida, regalados, canjeados con puntos del canal, premios de jornada, códigos de
  // directo y los que salen de fundir repetidas
  if (TIPOS_CON_SOBRES.has(e.tipo)) u.sobres += n;
  if (UNA_VEZ.has(e.tipo)) canjes.add(e.detalle);
  if (e.tipo === 'codigo') { u.codigos.add(e.detalle); usosCodigo.set(e.detalle, (usosCodigo.get(e.detalle) || 0) + 1); }
  // Cada sobre abierto suma uno a las rachas sin A y sin S; una carta del sobre de esa tier o mejor la corta
  if (e.tipo === 'apertura') { u.sobres -= 1; u.abiertos += 1; u.sinA += 1; u.sinS += 1; }
  if (e.tipo === 'carta' || e.tipo === 'mejora' || e.tipo === 'premio-carta') u.cartas.set(e.detalle, (u.cartas.get(e.detalle) || 0) + 1);
  if (e.tipo === 'carta' && esAoMejor(e.rareza)) u.sinA = 0;
  if (e.tipo === 'carta' && esSoMejor(e.rareza)) u.sinS = 0;
  if (e.tipo === 'familia') u.familias.add(e.detalle);
  // Una carta fundida: la cantidad va en negativo. La última copia nunca se funde, pero por si acaso se quita del mapa
  if (e.tipo === 'fusion') {
    const quedan = (u.cartas.get(e.detalle) || 0) + n;
    if (quedan > 0) u.cartas.set(e.detalle, quedan); else u.cartas.delete(e.detalle);
  }
}

// Un vínculo con Twitch («tw:id:nombre» en el detalle) o con Kick («kk:id:nombre») o, sin id, su retirada (el detalle
// vacío, que es como se apuntó siempre la de Twitch, o «kk:» la de Kick). Una cuenta lleva un solo Twitch y un solo
// Kick, y cada uno va a una sola cuenta: manda el último vínculo. Si ese Twitch o Kick ya tenía sobres o cartas a su
// nombre (canjes de antes de vincularse), se juntan con los de la cuenta
const PLATAFORMAS = { tw: { campo: 'twitch', clave: id => id }, kk: { campo: 'kick', clave: id => `kick-${id}` } };
function vincular(u, detalle) {
  const d = String(detalle || '');
  const { campo, clave } = PLATAFORMAS[d.startsWith('kk:') ? 'kk' : 'tw'];
  const [externo, login = ''] = d.replace(/^(tw|kk):/, '').split(':');
  if (u[campo]) vinculos.delete(clave(u[campo].id));
  u[campo] = null;
  const suId = externo && clave(externo);
  if (!externo || suId === String(u.id)) return;
  const otra = usuarios.get(vinculos.get(suId));
  if (otra) otra[campo] = null;
  const suya = usuarios.get(suId);
  if (suya) {
    u.sobres += suya.sobres;
    u.abiertos += suya.abiertos;
    for (const [carta, n] of suya.cartas) u.cartas.set(carta, (u.cartas.get(carta) || 0) + n);
    for (const codigo of suya.codigos) u.codigos.add(codigo);
    for (const familia of suya.familias) u.familias.add(familia);
    usuarios.delete(suId);
  }
  vinculos.set(suId, u.id);
  u[campo] = { id: externo, login };
}

// El detalle de un vínculo empieza por letras para que la hoja no lo tome por una hora (hay nombres de Twitch que son números)
const detalleVinculo = (t, prefijo = 'tw') => `${prefijo}:${t.id}:${t.login || ''}`;

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
// normalmente: quedan fuera del sorteo de las cartas del sobre y, en una parte muy pequeña de los sobres (PROBABILIDAD_LEGACY),
// sale una de regalo como carta extra. No sirven en el fantasy (ni se alinean ni dan bonus): son de colección. Se pintan
// como las S+ «full art», con «LEGACY» en el sello y solo su título debajo del nombre.
// data-proyecto/cartas-legacy.json: [{ "id": "LEGACY-NOMBRE", "nombre": "…", "subtitulo": "…", "clan": "AMATERATSU", "activa": true }]
// Una LEGACY no existe hasta que tiene su dibujo vertical (public/cartas/fullart/ID.webp): nunca sale con el splash de
// Riot. En cuanto se sube el dibujo, entra sola. LEGACY_SIN_DIBUJO=1 las deja salir sin él (lo usa la demo).
export const TIER_LEGACY = 'LEGACY';
const LEGACY_SIN_DIBUJO = /^(1|si|sí|true)$/i.test(process.env.LEGACY_SIN_DIBUJO || '');
const probabilidadDe = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? 0.05 : Math.max(0, Math.min(1, Number(v))));
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

// ---------- cartas de premio: los jefes y las conmemorativas ----------
// Puramente estéticas, como las LEGACY: no entran en ningún sorteo (pesan 0), no se alinean, no se funden y no cuentan
// para el álbum ni para la conmemorativa.
// - JEFE-<CLAN>: el oyabun de cada familia (las siete, Shinigami incluida). Se lleva una vez por temporada, con un sobre,
//   quien junta todas las cartas de la familia (sus cinco jugadores; las de Shinigami, sus LEGACY). Mientras no tenga su
//   dibujo (public/cartas/fullart/JEFE-<CLAN>.webp) lleva el personaje de la familia de la portada (/personajes/).
// - TEMPORADA-T<n>: la de la temporada n. Se da al estrenar la n+1 a quien acabó la n con CARTAS_CONMEMORATIVA cartas
//   distintas, y se arrastra a las temporadas siguientes. Mientras no tenga dibujo, el sol de Gokudō en neón.
export const TIER_JEFE = 'JEFE', TIER_TEMPORADA = 'TEMPORADA';
const nombreFamilia = c => c.nombre.toUpperCase();
function cartasDePremio() {
  const jefes = CLANES.filter(c => !c.invitado).map(c => ({ id: `JEFE-${c.id}`, nombre: nombreFamilia(c), tier: TIER_JEFE,
    subtitulo: `Oyabun de ${c.nombre}`, clan: c.id, rol: null, tipo: 'jefe', bonus: null }));
  const conmemorativas = Array.from({ length: Math.max(0, TEMPORADA - 1) }, (_, i) => ({ id: `TEMPORADA-T${i + 1}`, nombre: `TEMPORADA ${i + 1}`,
    tier: TIER_TEMPORADA, subtitulo: `${CARTAS_CONMEMORATIVA} cartas en la temporada ${i + 1}`, clan: null, rol: null, tipo: 'temporada', temporada: i + 1, bonus: null }));
  return [...jefes, ...conmemorativas];
}
const ESTETICAS = new Set(['legacy', 'jefe', 'temporada']);
export const esEstetica = c => ESTETICAS.has(c.tipo);
// Las que cuentan para el álbum y la conmemorativa: jugadores, BOOST y LEGACY
const deColeccion = c => c.tipo === 'jugador' || c.tipo === 'boost' || c.tipo === 'legacy';

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
// Marcos de cada clase y tier en public/cartas/marcos/jugador/ y boost/ (TIER.webp; la S+ es SP). Salen de
// diseno/marcos/. Mientras no estén, la carta
// lleva el splash de su campeón, si no la imagen de su clan (o el sol partido si es BOOST), y el marco dibujado con CSS.
// Carta «full art»: si además hay un dibujo vertical (1000×1400) en public/cartas/fullart/ID.webp, la carta se pinta
// con él a carta completa en vez de con el marco (lo llevan las BOOST S+). El cuadrado sigue haciendo falta: es el
// que usan las imágenes de compartir.
// La dirección lleva la fecha del archivo: se puede guardar en caché y, si cambia el dibujo, cambia la dirección.
const EXTENSIONES = ['.webp', '.png', '.jpg', '.jpeg'];
let artes = new Map(), completas = new Map(), marcos = { jugador: new Map(), boost: new Map() }, reversos = new Map();

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
  const [a, full, jugador, boost] = await Promise.all([indiceImagenes(CARPETA_ARTE, '/cartas/'),
    indiceImagenes(path.join(CARPETA_ARTE, 'fullart'), '/cartas/fullart/'),
    indiceImagenes(path.join(carpeta, 'jugador'), '/cartas/marcos/jugador/'), indiceImagenes(path.join(carpeta, 'boost'), '/cartas/marcos/boost/')]);
  artes = a;
  completas = full;
  marcos = { jugador, boost };
  reversos = await indiceImagenes(path.join(CARPETA_ARTE, 'reversos'), '/cartas/reversos/');
}
// Si se añaden dibujos o cartas BOOST con la web encendida, aparecen en un minuto
setInterval(() => cargarCartas().catch(() => {}), 60000).unref();

// Clave de la tier para archivos y CSS: la S+ es SP
export const claveTier = t => (t === 'S+' ? 'SP' : t);
const splashDe = c => (c.campeon && splashes.has(`${c.campeon.id}.jpg`) ? `/ddragon/splash/${c.campeon.id}.jpg` : null);
const arteProvisional = c => (c.tipo === 'jefe' ? `/personajes/${c.clan}.jpg` : c.tipo === 'temporada' ? '/marca/gokudo-neon.png' : null);
const arteDe = c => artes.get(c.id) || splashDe(c) || arteProvisional(c) || (c.clan ? `/clanes/${c.clan}.jpg` : '/marca/gokudo-cuadro.png');
const marcoDe = c => marcos[c.tipo]?.get(claveTier(c.tier)) || null;
// Los reversos (08/11/2026): un coche del color de la familia de la carta, uno por familia (id del clan), BOOST y
// TEMPORADA, en public/cartas/reversos/<CLAVE>.webp. El que falte lo pinta la página (public/gachapon/reverso.js).
// Antes había un reverso igual para todas (marcos/reverso.webp), con el emblema de Koryu Budo: ya no se usa
export const reversosCartas = () => Object.fromEntries(reversos);

// ---------- cartas y probabilidades ----------
export function catalogo() {
  const jugadores = vistaTierlist().jugadores.filter(j => j.nombre && j.tier).map(j => ({ ...j, tipo: 'jugador' }));
  // Cada carta pesa en el sorteo la parte de su tier repartida entre las cartas de esa tier
  const deTier = new Map();
  for (const c of [...boosts, ...jugadores]) deTier.set(c.tier, (deTier.get(c.tier) || 0) + 1);
  // Las LEGACY pesan 0: no entran en el sorteo de las cartas del sobre. Y solo cuentan las que ya tienen su dibujo.
  // Los jefes y las conmemorativas, tampoco (son premios), y existen aunque aún no tengan dibujo
  return [...legacy.filter(c => LEGACY_SIN_DIBUJO || completas.has(c.id)), ...boosts, ...jugadores, ...cartasDePremio()].map(c => ({ ...c, campeon: campeones.get(c.id) || null }))
    .map(c => ({ ...c, arte: arteDe(c), fullart: completas.get(c.id) || null, marco: marcoDe(c), peso: esEstetica(c) ? 0 : (PESOS[c.tier] || 0) / deTier.get(c.tier) }));
}
// Las cartas del álbum: jugadores, BOOST y LEGACY (los jefes y las conmemorativas son premios aparte)
export const cartasDeColeccion = (cat = catalogo()) => cat.filter(deColeccion);

// Probabilidad de que una carta cualquiera del sobre sea de cada tier
export function probabilidades(cat = catalogo()) {
  const total = cat.reduce((s, c) => s + c.peso, 0);
  return Object.fromEntries(TIERS_CARTA.map(t => [t, total ? cat.filter(c => c.tier === t).reduce((s, c) => s + c.peso, 0) / total : 0]));
}

// Los sobres se abren cuando todos los jugadores con nombre en su plantilla tienen tier (y por tanto carta). Con la tier
// list a medias, los sobres de todos saldrían de unos pocos clanes y de las BOOST (S+ y S)
export const faltanTiers = () => vistaTierlist().jugadores.filter(j => j.nombre && !j.tier).map(j => j.id);
export const sobresListos = (cat = catalogo()) => cat.some(c => c.tipo === 'jugador') && !faltanTiers().length;
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

// La carta extra: en una parte muy pequeña de los sobres sale, además de las del sobre, una LEGACY al azar
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
  if (UNA_VEZ.has(tipo) && canjes.has(detalle)) return;
  await registrar([{ fecha: ahora(), id: u.id, usuario: u.nombre, tipo, detalle, cantidad }]);
});

// La carta segura de la garantía: una que aún no tienes (ni ha salido ya en este sobre) de las tiers pedidas; si ya las
// tienes todas, de la tier de debajo, y así hasta la D. Si no te falta ninguna, una cualquiera de las tiers pedidas
const ORDEN_TIERS = ['S+', 'S', 'A', 'B', 'C', 'D'];
export function cartaSegura(normales, tiers, mias, enElSobre = new Set()) {
  const libre = c => !enElSobre.has(c.id) && c.peso > 0;
  const peor = Math.max(...tiers.map(t => RANGO[t]));
  for (const nivel of [tiers, ...ORDEN_TIERS.slice(peor + 1).map(t => [t])]) {
    const faltan = normales.filter(c => nivel.includes(c.tier) && libre(c) && !mias.get(c.id));
    if (faltan.length) return sacarCarta(faltan);
  }
  const cualquiera = normales.filter(c => tiers.includes(c.tier) && libre(c));
  return cualquiera.length ? sacarCarta(cualquiera) : null;
}

// Si toca la garantía y el sobre no la trae ya, la carta segura sustituye a la peor del sobre.
// Devuelve { cual: 'S' | 'A', segura } o null
function aplicarGarantia(cartas, normales, mias, racha) {
  const cambiar = (tiers, cual) => {
    const segura = cartaSegura(normales, tiers, mias, new Set(cartas.map(c => c.id)));
    if (!segura) return null;
    let peor = 0;
    cartas.forEach((c, i) => { if (RANGO[c.tier] >= RANGO[cartas[peor].tier]) peor = i; });
    cartas[peor] = segura;
    return { cual, segura };
  };
  if (racha.sinS >= GARANTIA_S && !cartas.some(c => esSoMejor(c.tier))) return cambiar(['S+', 'S'], 'S');
  if (racha.sinA >= GARANTIA_A && !cartas.some(c => esAoMejor(c.tier))) return cambiar(['A'], 'A');
  return null;
}

// Las cartas de cada familia: sus jugadores (las de Shinigami, sus LEGACY)
const cartasDeFamilia = (cat, clan) => cat.filter(c => c.clan === clan && (c.tipo === 'jugador' || c.tipo === 'legacy'));
// Premio por familia completa: la primera vez en la temporada que alguien tiene todas las cartas de una familia, se
// lleva un sobre y la carta de su jefe. mias y familias son lo de esta operación (se van actualizando)
function premiosDeFamilia(cat, mias, familias, apunte) {
  const premios = [], eventos = [];
  for (const clan of CLANES.filter(c => !c.invitado).map(c => c.id)) {
    const suyas = cartasDeFamilia(cat, clan);
    if (familias.has(clan) || !suyas.length || !suyas.every(c => mias.get(c.id))) continue;
    familias.add(clan);
    eventos.push(apunte({ tipo: 'familia', detalle: clan, cantidad: 1 }));
    const jefe = cat.find(c => c.id === `JEFE-${clan}`);
    let carta = null;
    if (jefe) {
      eventos.push(apunte({ tipo: 'premio-carta', detalle: jefe.id, cantidad: 1, rareza: jefe.tier }));
      mias.set(jefe.id, (mias.get(jefe.id) || 0) + 1);
      carta = sinPeso({ ...jefe, nueva: mias.get(jefe.id) === 1, copias: mias.get(jefe.id), extra: true });
    }
    premios.push({ tipo: 'familia', clan, sobres: 1, carta });
  }
  return { premios, eventos };
}

const sinPeso = ({ peso, ...c }) => c;
// Apunta una carta ganada en mias y la devuelve con «nueva» (no la tenías) y «copias» (las que tienes ahora)
const ganada = (mias, c, mas = {}) => { mias.set(c.id, (mias.get(c.id) || 0) + 1); return sinPeso({ ...c, ...mas, nueva: mias.get(c.id) === 1, copias: mias.get(c.id) }); };

// Abrir varios sobres de una vez (o uno): cada uno con su sorteo, su garantía y sus premios, en orden, y todo apuntado en
// una sola escritura. cuantas: un número o «todos» (los que tenga, hasta MAXIMO_TIRADAS). Los sobres que se ganan por el
// camino (premio de familia) no se abren en la misma tanda.
// Devuelve [{ cartas: [carta con nueva, copias, extra (la LEGACY de regalo) y garantia], garantia: 'S'|'A'|null,
//   premios: [{ tipo: 'familia', clan, sobres: 1, carta }] }]
export const abrirSobres = (u, cuantas = 1) => enCola(async () => {
  const yo = usuarios.get(u.id);
  if (!yo || yo.sobres < 1) throw new Error('No te quedan tiradas');
  const cat = catalogo(), normales = cat.filter(c => !esEstetica(c)), legados = cat.filter(c => c.tipo === 'legacy');
  if (!sobresListos(cat)) throw new Error('La tragaperras se abre cuando estén las cartas de los jugadores: el staff tiene que poner su tier');
  const n = cuantas === 'todos' ? Math.min(yo.sobres, MAXIMO_TIRADAS) : Math.round(Number(cuantas));
  if (!Number.isInteger(n) || n < 1 || n > MAXIMO_TIRADAS) throw new Error(`Se puede tirar de 1 a ${MAXIMO_TIRADAS} veces de una vez`);
  if (n > yo.sobres) throw new Error(yo.sobres === 1 ? 'Solo te queda 1 tirada' : `Solo te quedan ${yo.sobres} tiradas`);
  const fecha = ahora(), apunte = e => ({ fecha, id: u.id, usuario: u.nombre, cantidad: 0, ...e });
  const mias = new Map(yo.cartas), familias = new Set(yo.familias), racha = { sinA: yo.sinA, sinS: yo.sinS };
  const eventos = [], tiradas = [];
  for (let i = 0; i < n; i++) {
    const cartas = sacarSobre(normales);
    const g = aplicarGarantia(cartas, normales, mias, racha), garantia = g?.cual || null;
    racha.sinA = cartas.some(c => esAoMejor(c.tier)) ? 0 : racha.sinA + 1;
    racha.sinS = cartas.some(c => esSoMejor(c.tier)) ? 0 : racha.sinS + 1;
    const regalo = sacarLegacy(legados);
    eventos.push(apunte({ tipo: 'apertura', detalle: crypto.randomUUID().slice(0, 8), cantidad: -1 }),
      ...cartas.map(c => apunte({ tipo: 'carta', detalle: c.id, cantidad: 1, rareza: c.tier })),
      ...(regalo ? [apunte({ tipo: 'carta', detalle: regalo.id, cantidad: 1, rareza: regalo.tier })] : []));
    // La carta segura se marca para que la página la enseñe
    const salidas = [...cartas.map(c => ganada(mias, c, g && c === g.segura ? { garantia } : {})), ...(regalo ? [ganada(mias, regalo, { extra: true })] : [])];
    const familia = premiosDeFamilia(cat, mias, familias, apunte);
    eventos.push(...familia.eventos);
    tiradas.push({ cartas: salidas, garantia, premios: familia.premios });
  }
  await registrar(eventos);
  return tiradas;
});

// Un sobre, como siempre: sus cartas, con la LEGACY de regalo y el jefe de una familia completa al final
export const abrirSobre = u => abrirSobres(u, 1).then(([t]) => [...t.cartas, ...t.premios.map(p => p.carta).filter(Boolean)]);

// Racha de cada uno para la página: cuántos sobres lleva sin A y sin S, y cuándo le toca la segura
export function garantiaDe(id) {
  const u = usuarios.get(id);
  return { sinA: u?.sinA || 0, sinS: u?.sinS || 0, umbralA: GARANTIA_A, umbralS: GARANTIA_S };
}

export const canjeProcesado = id => canjes.has(id);

// ---------- temporada nueva ----------
// Al estrenar una temporada todos empiezan de cero, con los sobres de bienvenida: quien ya había entrado en la anterior
// conserva su cuenta (no tiene que registrarse otra vez) y su Twitch y su Kick vinculados, y no arrastra ni cartas, ni sobres, ni
// historial. Lo único que se arrastra son las cartas conmemorativas: las que ya tenía y, si acabó la anterior con
// CARTAS_CONMEMORATIVA cartas distintas (de jugador, BOOST o LEGACY), la de esa temporada. El registro de la temporada anterior no se toca: se queda como estaba, en su pestaña o en su archivo.
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
    const coleccion = new Set(cartasDeColeccion().map(c => c.id)), suya = `TEMPORADA-T${TEMPORADA - 1}`;
    const conmemorativas = u => {
      const tiene = [...u.cartas.keys()];
      const ya = tiene.filter(id => id.startsWith('TEMPORADA-T'));
      const distintas = tiene.filter(id => coleccion.has(id)).length;
      return [...new Set([...ya, ...(distintas >= CARTAS_CONMEMORATIVA ? [suya] : [])])];
    };
    const cuentas = [...usuarios.values()].filter(u => u.alta).map(u => ({ id: u.id, nombre: u.nombre, twitch: u.twitch, kick: u.kick, conmemorativas: conmemorativas(u) }));
    reconstruir();
    const fecha = ahora(), tiene = id => usuarios.get(id);
    const eventos = [{ fecha, id: 'tenka-ichi', usuario: 'Tenka Ichi', tipo: 'temporada', detalle: `T${TEMPORADA}`, cantidad: cuentas.length },
      ...cuentas.flatMap(c => [
        ...(tiene(c.id)?.alta ? [] : [{ fecha, id: c.id, usuario: c.nombre, tipo: 'alta', detalle: '', cantidad: SOBRES_INICIALES }]),
        ...(c.twitch && !tiene(c.id)?.twitch ? [{ fecha, id: c.id, usuario: c.nombre, tipo: 'vinculo', detalle: detalleVinculo(c.twitch), cantidad: 0 }] : []),
        ...(c.kick && !tiene(c.id)?.kick ? [{ fecha, id: c.id, usuario: c.nombre, tipo: 'vinculo', detalle: detalleVinculo(c.kick, 'kk'), cantidad: 0 }] : []),
        ...c.conmemorativas.filter(id => !tiene(c.id)?.cartas.has(id))
          .map(id => ({ fecha, id: c.id, usuario: c.nombre, tipo: 'premio-carta', detalle: id, cantidad: 1, rareza: TIER_TEMPORADA }))])];
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

// ---------- Kick vinculado ----------
// Lo mismo con Kick, para la recompensa «Omamori» de sus puntos del canal. kick: { id, login } de quien ha autorizado
export const vincularKick = (u, kick) => enCola(async () => {
  const id = String(kick?.id || '');
  if (!id) throw new Error('Kick no ha dicho de quién es la cuenta');
  if (usuarios.get(u.id)?.kick?.id === id) return false;
  await registrar([{ fecha: ahora(), id: u.id, usuario: u.nombre, tipo: 'vinculo', detalle: detalleVinculo({ id, login: kick.login }, 'kk'), cantidad: 0 }]);
  return true;
});

export const desvincularKick = u => enCola(async () => {
  if (!usuarios.get(u.id)?.kick) return false;
  await registrar([{ fecha: ahora(), id: u.id, usuario: u.nombre, tipo: 'vinculo', detalle: 'kk:', cantidad: 0 }]);
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

// ---------- fusión por tiers ----------
// Cada REPETIDAS_POR_MEJORA repetidas de la misma tier (de jugador o BOOST, de D a A) se cambian por una carta al azar de
// la tier siguiente (TIER_SIGUIENTE), con el sorteo de siempre dentro de esa tier. pedidas: { idDeCarta: copias }.
// Como al fundir por sobres, de cada carta se queda al menos una copia, o las que diga minimo(id). La carta que sale
// puede completar una familia: entonces llega también su premio. No cuenta para la garantía (no es de un sobre)
export const fundirPorTier = (u, pedidas, minimo = () => 1) => enCola(async () => {
  const yo = usuarios.get(u.id);
  if (!yo) throw new Error('No tienes cartas que fundir');
  const cat = catalogo(), porId = new Map(cat.map(c => [c.id, c]));
  const lista = Object.entries(pedidas || {}).map(([id, n]) => [id, Math.round(Number(n))]).filter(([, n]) => n > 0);
  const total = lista.reduce((s, [, n]) => s + n, 0);
  if (!total) throw new Error('Elige las cartas repetidas que quieres mejorar');
  const tiers = new Set(lista.map(([id]) => porId.get(id)?.tier));
  const tier = [...tiers][0];
  if (tiers.size !== 1 || lista.some(([id]) => esEstetica(porId.get(id) || { tipo: 'legacy' }))) throw new Error('Para mejorar, las cartas tienen que ser de jugador o BOOST y todas de la misma tier');
  if (!TIER_SIGUIENTE[tier]) throw new Error(tier === 'S' || tier === 'S+' ? 'Las S y las S+ no se mejoran: ya son lo más alto' : 'Esas cartas no se pueden mejorar');
  if (total % REPETIDAS_POR_MEJORA) throw new Error(`Se mejoran de ${REPETIDAS_POR_MEJORA} en ${REPETIDAS_POR_MEJORA}: llevas ${total}`);
  for (const [id, n] of lista) {
    if ((yo.cartas.get(id) || 0) - n < Math.max(1, minimo(id))) throw new Error('Solo se pueden fundir las copias que te sobran de cada carta');
  }
  const destino = cat.filter(c => !esEstetica(c) && c.tier === TIER_SIGUIENTE[tier] && c.peso > 0);
  if (!destino.length) throw new Error(`Todavía no hay cartas de tier ${TIER_SIGUIENTE[tier]}`);
  const fecha = ahora(), apunte = e => ({ fecha, id: u.id, usuario: u.nombre, cantidad: 0, ...e });
  const mias = new Map(yo.cartas), familias = new Set(yo.familias);
  for (const [id, n] of lista) mias.set(id, mias.get(id) - n);
  const eventos = lista.map(([id, n]) => apunte({ tipo: 'fusion', detalle: id, cantidad: -n, rareza: tier }));
  const cartas = [];
  for (let i = 0; i < total / REPETIDAS_POR_MEJORA; i++) {
    const c = sacarCarta(destino);
    eventos.push(apunte({ tipo: 'mejora', detalle: c.id, cantidad: 1, rareza: c.tier }));
    cartas.push(ganada(mias, c));
  }
  const familia = premiosDeFamilia(cat, mias, familias, apunte);
  await registrar([...eventos, ...familia.eventos]);
  return { cartas, premios: familia.premios, fundidas: total };
});

export function estadoUsuario(id) {
  const u = usuarios.get(id);
  if (!u) return { sobres: 0, abiertos: 0, cartas: [], twitch: null, kick: null, familias: [], garantia: garantiaDe(id) };
  return { sobres: u.sobres, abiertos: u.abiertos, cartas: [...u.cartas].map(([carta, cantidad]) => ({ id: carta, cantidad })),
    twitch: u.twitch ? { login: u.twitch.login } : null, kick: u.kick ? { login: u.kick.login } : null,
    familias: [...u.familias], garantia: garantiaDe(id) };
}

// Lo de una cuenta de Kick (por su id de Kick), para los comandos del chat: la cuenta del gachapon a la que está vinculada
// o, si no la ha vinculado, los sobres que tiene guardados a su nombre esperando
export function cuentaDeKick(userId) {
  const clave = `kick-${userId}`;
  const cuenta = usuarios.get(vinculos.get(clave));
  if (cuenta) return { vinculada: true, id: cuenta.id, nombre: cuenta.nombre, sobres: cuenta.sobres, cartas: [...cuenta.cartas.values()].reduce((a, n) => a + n, 0) };
  return { vinculada: false, id: null, sobres: usuarios.get(clave)?.sobres || 0 };
}

export function buscarUsuario(nombre) {
  const n = String(nombre).trim().toLowerCase();
  return [...usuarios.values()].find(u => u.nombre?.toLowerCase() === n) || null;
}

export function resumenGacha() {
  let abiertos = 0, sobres = 0;
  for (const u of usuarios.values()) { abiertos += u.abiertos; sobres += u.sobres; }
  const cat = catalogo();
  const con = campo => [...usuarios.values()].filter(u => u[campo]).length;
  return { coleccionistas: usuarios.size, sobresAbiertos: abiertos, sobresSinAbrir: sobres, conTwitch: con('twitch'), conKick: con('kick'),
    cartas: cat.filter(c => !esEstetica(c)).length, legacy: cat.filter(c => c.tipo === 'legacy').length, listos: sobresListos(cat),
    faltanTiers: faltanTiers() };
}
