// Códigos de directo: el staff crea un código desde el panel, sale en el overlay y quien lo escribe en /gachapon/
// se lleva sobres. No depende de Twitch ni de ser afiliado: solo hay que estar viendo el directo.
// Un código vale un rato, una vez por persona y, si se quiere, para un número máximo de personas. Solo hay uno a la
// vez; se guarda en los ajustes para que no se pierda si la web se reinicia, y los canjes, en el registro del gachapon.
import crypto from 'node:crypto';
import { ajuste, guardarAjustes, releerAjuste } from './ajustes.js';
import { darSobresDeCodigo, usosDeCodigo, canjeoCodigo } from './gacha.js';

const CLAVE = 'codigo_directo';
// Sin letras ni números que se confundan al leerlos en pantalla (0 y O, 1 e I, 5 y S, 2 y Z, 8 y B)
const LETRAS = 'ACDEFGHJKLMNPQRTUVWXY34679';
const LARGO = 6;
const limpiar = t => String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

let actual;   // { texto, sobres, caduca (ms), maximo, visible } o null
function leer() {
  if (actual !== undefined) return actual;
  try { actual = JSON.parse(ajuste(CLAVE) || 'null'); } catch { actual = null; }
  return actual;
}
const guardar = c => { actual = c; return guardarAjustes({ [CLAVE]: c ? JSON.stringify(c) : null }); };
const vivo = c => Boolean(c) && c.caduca > Date.now() && !(c.maximo && usosDeCodigo(c.texto) >= c.maximo);

export async function crearCodigo({ sobres = 1, minutos = 10, maximo = 0, visible = true } = {}) {
  const numero = (v, minimo, tope, defecto) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Math.max(minimo, Math.min(tope, Math.round(Number(v)))) : defecto);
  const texto = Array.from({ length: LARGO }, () => LETRAS[crypto.randomInt(LETRAS.length)]).join('');
  await guardar({ texto, sobres: numero(sobres, 1, 5, 1), caduca: Date.now() + numero(minutos, 1, 180, 10) * 60000,
    maximo: numero(maximo, 0, 100000, 0), visible: Boolean(visible) });
  return estadoCodigo();
}

export async function cerrarCodigo() {
  if (leer()) await guardar(null);
}

export async function mostrarCodigo(visible) {
  const c = leer();
  if (!c) throw new Error('No hay ningún código en marcha');
  await guardar({ ...c, visible: Boolean(visible) });
  return estadoCodigo();
}

// Para el panel: el código en marcha con sus canjes (o nada)
export function estadoCodigo() {
  const c = leer();
  if (!c) return null;
  return { ...c, canjes: usosDeCodigo(c.texto), vivo: vivo(c) };
}

// Para el overlay: solo lo que se enseña en pantalla, y solo mientras vale
export function codigoEnPantalla() {
  const c = leer();
  return vivo(c) && c.visible ? { texto: c.texto, sobres: c.sobres, caduca: c.caduca } : null;
}

// Para que nadie pruebe códigos al azar: 8 intentos fallidos cada 10 minutos por persona
const fallos = new Map();
const VENTANA_MS = 10 * 60000, INTENTOS = 8;
function demasiadosFallos(id) {
  const recientes = (fallos.get(id) || []).filter(t => Date.now() - t < VENTANA_MS);
  // Sin fallos recientes no se guarda nada: la lista no crece con cada persona que alguna vez canjeó un código
  if (recientes.length) fallos.set(id, recientes); else fallos.delete(id);
  return recientes.length >= INTENTOS;
}

// El código que hay ahora en la hoja (o en el archivo), por si lo ha creado otra instancia de la web
async function codigoGuardado() {
  try { return JSON.parse(await releerAjuste(CLAVE) || 'null'); } catch { return null; }
}

export async function canjearCodigo(u, texto) {
  if (demasiadosFallos(u.id)) throw new Error('Demasiados intentos: espera unos minutos antes de probar otro código');
  let c = leer();
  const escrito = limpiar(texto);
  if (!escrito) throw new Error('Escribe el código que sale en el directo');
  // Si no es el que esta instancia tiene en memoria, antes de decir que no vale se mira el de la hoja. Pasó en el directo
  // del 15/11/2026: hubo despliegues en pleno directo y, mientras Render tenía las dos versiones vivas, el panel y el
  // overlay seguían en la vieja (por websocket) y creaban ahí el código, pero los canjes entraban por la nueva, que no
  // lo conocía: todos salían «no vale». Si el de la hoja es más nuevo, pasa a ser el de esta instancia
  if (!c || escrito !== c.texto) {
    const guardado = await codigoGuardado();
    if (guardado?.texto === escrito) {
      if (!c || guardado.caduca > c.caduca) await guardar(guardado);
      c = guardado;
    }
  }
  if (!c || escrito !== c.texto) {
    fallos.set(u.id, [...(fallos.get(u.id) || []), Date.now()]);
    throw new Error('Ese código no vale: revisa que esté bien escrito');
  }
  if (c.caduca <= Date.now()) throw new Error('Ese código ya ha caducado');
  if (canjeoCodigo(u.id, c.texto)) throw new Error('Ya has canjeado este código');
  await darSobresDeCodigo(u, c.texto, c.sobres, c.maximo);
  return { sobres: c.sobres };
}
