// Descarga de Data Dragon (Riot) la lista de campeones, sus iconos y sus splash.
// Uso: npm run ddragon  (volver a lanzarlo en cada parche)
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

async function existe(ruta) {
  try { await access(ruta); return true; } catch { return false; }
}

async function bajar(url, ruta) {
  if (await existe(ruta)) return false;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  await writeFile(ruta, Buffer.from(await r.arrayBuffer()));
  return true;
}

const [version] = await json(`${CDN}/api/versions.json`);
console.log(`Versión de Data Dragon: ${version}`);
const es = await json(`${CDN}/cdn/${version}/data/es_ES/champion.json`);

await mkdir(path.join(destino, 'icono'), { recursive: true });
await mkdir(path.join(destino, 'splash'), { recursive: true });

// Lista compacta que usan el servidor y las páginas
const campeones = Object.values(es.data)
  .map(c => ({ id: c.id, key: Number(c.key), nombre: c.name, titulo: c.title, tags: c.tags }))
  .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
await writeFile(path.join(destino, 'campeones.json'), JSON.stringify({ version, campeones }, null, 1));

const tareas = campeones.flatMap(c => [
  [`${CDN}/cdn/${version}/img/champion/${c.id}.png`, path.join(destino, 'icono', `${c.id}.png`)],
  [`${CDN}/cdn/img/champion/splash/${c.id}_0.jpg`, path.join(destino, 'splash', `${c.id}.jpg`)],
]);

let hechas = 0, nuevas = 0, fallos = 0;
async function trabajador() {
  while (tareas.length) {
    const [url, ruta] = tareas.shift();
    try { if (await bajar(url, ruta)) nuevas++; } catch (e) { fallos++; console.warn('Fallo:', e.message); }
    if (++hechas % 50 === 0) console.log(`${hechas} archivos revisados…`);
  }
}
await Promise.all(Array.from({ length: 8 }, trabajador));
console.log(`Listo: ${campeones.length} campeones, ${nuevas} archivos nuevos, ${fallos} fallos.`);
