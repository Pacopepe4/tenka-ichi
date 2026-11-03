// Descarga de Data Dragon (Riot) los iconos de los hechizos de invocador y de las piedras angulares de las runas, para el
// línea por línea del marcador de partida. Aparte de ddragon.js para no volver a bajar campeones y objetos por esto.
// Uso: npm run ddragon-sums  (los hechizos y las runas casi nunca cambian: solo hace falta si Riot añade alguno)
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destino = path.join(raiz, 'public', 'ddragon');
const CDN = 'https://ddragon.leagueoflegends.com';

async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
const existe = ruta => access(ruta).then(() => true, () => false);

async function bajar(url, ruta) {
  if (await existe(ruta)) return false;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  await writeFile(ruta, Buffer.from(await r.arrayBuffer()));
  return true;
}

const [version] = await json(`${CDN}/api/versions.json`);
console.log(`Versión de Data Dragon: ${version}`);
await mkdir(path.join(destino, 'hechizo'), { recursive: true });
await mkdir(path.join(destino, 'runa'), { recursive: true });

// Los de la Grieta del Invocador (modo CLASSIC), sin las variantes de otros modos
const hechizos = Object.values((await json(`${CDN}/cdn/${version}/data/es_ES/summoner.json`)).data)
  .filter(h => h.modes.includes('CLASSIC') && !/_Jade$/.test(h.id));
// La piedra angular de cada árbol de runas es la primera del primer hueco; el cliente da su id numérico
const piedras = (await json(`${CDN}/cdn/${version}/data/es_ES/runesReforged.json`)).flatMap(a => a.slots[0].runes);

const tareas = [
  ...hechizos.map(h => [`${CDN}/cdn/${version}/img/spell/${h.image.full}`, path.join(destino, 'hechizo', `${h.id}.png`)]),
  ...piedras.map(r => [`${CDN}/cdn/img/${r.icon}`, path.join(destino, 'runa', `${r.id}.png`)]),
];
let nuevas = 0, fallos = 0;
for (const [url, ruta] of tareas) {
  try { if (await bajar(url, ruta)) nuevas++; } catch (e) { fallos++; console.warn('Fallo:', e.message); }
}
console.log(`Listo: ${hechizos.length} hechizos y ${piedras.length} piedras angulares, ${nuevas} archivos nuevos, ${fallos} fallos.`);
