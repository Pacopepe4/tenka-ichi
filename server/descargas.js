// Descargas de la guía para el PC de emisión y el de realización, cada una en un .zip:
//  - puente-tenka-ichi.zip: solo el puente del marcador (puente/).
//  - realizador-pc2.zip: el PC de emisión. El realizador (relé, OBS) y, en puente/, el puente del marcador: con
//    INSTALAR-PC2.bat la contraseña del panel sirve para los dos y el acceso directo «Realizador PC2» lo abre todo.
//  - realizador-pc1.zip: el PC que mira la partida 2 minutos antes y decide la realización (agente y su panel).
// El realizador viene del repositorio Pacopepe4/realizador, copiado en realizador/ (scripts/traer-realizador.js).
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearZip } from './zip.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CARPETA_PUENTE = path.join(RAIZ, 'puente');
export const CARPETA_REALIZADOR = path.join(RAIZ, 'realizador');
export const ARCHIVOS_PUENTE = ['Abrir el puente.bat', 'puente-tenka-ichi.ps1', 'LEEME.txt'];  // clave.txt nunca va dentro

// Lo que es de cada PC o de una sola instalación no se reparte nunca
const FUERA = new Set(['opciones.local.json', 'clave.txt', 'node_modules', 'partidas', 'capturas', '.git']);

// Archivos de Windows: saltos de línea CRLF, venga el repositorio como venga (un .bat con LF puede fallar)
const WINDOWS = new Set(['.bat', '.cmd', '.ps1', '.txt']);

async function archivo(ruta, nombre) {
  const datos = await readFile(ruta);
  const crlf = WINDOWS.has(path.extname(ruta).toLowerCase());
  return {
    nombre,
    datos: crlf ? Buffer.from(datos.toString('utf8').replace(/\r?\n/g, '\r\n'), 'utf8') : datos,
    fecha: (await stat(ruta)).mtime,
  };
}

async function recorrer(carpeta, prefijo = '') {
  const r = [];
  for (const e of (await readdir(carpeta, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (FUERA.has(e.name)) continue;
    const ruta = path.join(carpeta, e.name);
    if (e.isDirectory()) r.push(...await recorrer(ruta, `${prefijo}${e.name}/`));
    else if (e.isFile()) r.push({ ruta, nombre: `${prefijo}${e.name}` });
  }
  return r;
}

const puente = (prefijo = '') => ARCHIVOS_PUENTE.map(n => ({ ruta: path.join(CARPETA_PUENTE, n), nombre: `${prefijo}${n}` }));

async function realizador(papel, { carpetaRealizador = CARPETA_REALIZADOR } = {}) {
  const otro = papel === 'pc1' ? 'INSTALAR-PC2.bat' : 'INSTALAR-PC1.bat';
  const lista = (await recorrer(carpetaRealizador)).filter(a => a.nombre !== otro);
  return papel === 'pc2' ? [...lista, ...puente('puente/')] : lista;
}

export const DESCARGAS = {
  'puente-tenka-ichi.zip': () => puente(),
  'realizador-pc1.zip': o => realizador('pc1', o),
  'realizador-pc2.zip': o => realizador('pc2', o),
};

// Lista de { nombre, datos, fecha } de una descarga, o null si no existe
export async function archivosDescarga(nombre, opciones) {
  const lista = await DESCARGAS[nombre]?.(opciones);
  return lista ? Promise.all(lista.map(a => archivo(a.ruta, a.nombre))) : null;
}

const hechos = new Map();
// El .zip de una descarga (se prepara una vez por arranque del servidor), o null si no existe
export async function zipDescarga(nombre) {
  if (!DESCARGAS[nombre]) return null;
  if (!hechos.has(nombre)) hechos.set(nombre, archivosDescarga(nombre).then(crearZip));
  try {
    return await hechos.get(nombre);
  } catch (e) {
    hechos.delete(nombre);
    throw e;
  }
}
