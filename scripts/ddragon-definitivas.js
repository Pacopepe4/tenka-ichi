// Descarga de Data Dragon (Riot) el icono de la definitiva (la R) de cada campeón de campeones.json, para el línea por
// línea y la ficha del marcador de partida. Aparte de ddragon.js para no volver a bajar campeones y objetos por esto.
// Cada icono se guarda con el id del campeón (definitiva/Ahri.png), no con el nombre del hechizo de Riot, para que el
// overlay no tenga que saber cómo se llama la R de cada uno. Solo baja los que faltan.
// Uso: npm run ddragon-definitivas  (después de npm run ddragon, si entra un campeón nuevo)
// Los campeones de varias formas (Nidalee, Elise, Jayce, Gnar, Kled…) llevan la R que da Data Dragon: la del cambio de forma
import { mkdir, writeFile, readFile, access, rename, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destino = path.join(raiz, 'public', 'ddragon', 'definitiva');
const CDN = 'https://ddragon.leagueoflegends.com';

async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
const existe = ruta => access(ruta).then(() => true, () => false);

// Riot los da en 64×64 a color completo (unos 6 kB). Con ffmpeg instalado, se pasan a PNG de paleta de 256 colores, sin
// tramado: el mismo tamaño y a la vista igual, en unos 4 kB (las 170 y pico, por debajo de 1 MB). Sin ffmpeg, se quedan
// como vienen
const hayFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
async function guardar(buffer, ruta) {
  if (!hayFfmpeg) return writeFile(ruta, buffer);
  const crudo = ruta.replace(/\.png$/, '.descarga.png');
  await writeFile(crudo, buffer);
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', crudo, '-filter_complex',
    'split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=none', '-compression_level', '100', ruta]);
  if (r.status === 0) await unlink(crudo); else await rename(crudo, ruta);
}

// La misma versión que los campeones que ya hay, para que los iconos casen con ellos
const { version, campeones } = JSON.parse(await readFile(path.join(raiz, 'public', 'ddragon', 'campeones.json'), 'utf8'));
console.log(`Versión de Data Dragon: ${version} (la de campeones.json), ${campeones.length} campeones`);
await mkdir(destino, { recursive: true });

const faltan = [];
for (const c of campeones) if (!(await existe(path.join(destino, `${c.id}.png`)))) faltan.push(c.id);
if (!faltan.length) { console.log('Listo: no falta ninguna definitiva.'); process.exit(0); }

// Un solo JSON con los hechizos de todos (championFull) en lugar de uno por campeón
const { data } = await json(`${CDN}/cdn/${version}/data/en_US/championFull.json`);
let nuevas = 0, fallos = 0;
for (const id of faltan) {
  try {
    const r = data[id]?.spells?.[3];
    if (!r?.image?.full) throw new Error(`${id} no tiene R en championFull.json`);
    const url = `${CDN}/cdn/${version}/img/spell/${r.image.full}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    await guardar(Buffer.from(await res.arrayBuffer()), path.join(destino, `${id}.png`));
    nuevas++;
  } catch (e) { fallos++; console.warn('Fallo:', e.message); }
}
console.log(`Listo: ${nuevas} definitivas nuevas, ${fallos} fallos.`);
if (fallos) process.exitCode = 1;
