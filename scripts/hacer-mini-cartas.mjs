// Iconos de las cartas (public/cartas/mini/<ID>.webp, 256×256): los usa el postdraft del overlay, donde la carta entera
// no se ve a ese tamaño. Salen del dibujo cuadrado de cada carta (public/cartas/<ID>.webp); las que solo tienen el
// vertical a carta completa (jefes, conmemorativas), de un recorte cuadrado de su parte de arriba.
//   node scripts/hacer-mini-cartas.mjs            hace los que faltan o están más viejos que su dibujo
//   node scripts/hacer-mini-cartas.mjs --todas    los rehace todos
// Necesita ffmpeg: el del PATH o el de la variable FFMPEG. En la web no hace falta: los iconos van en el repositorio,
// y si falta alguno el overlay usa el dibujo grande.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CARTAS = path.join(RAIZ, 'public', 'cartas');
const MINI = path.join(CARTAS, 'mini');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const todas = process.argv.includes('--todas');
mkdirSync(MINI, { recursive: true });

const ids = f => path.basename(f, path.extname(f)).toUpperCase();
const cuadradas = readdirSync(CARTAS).filter(f => f.toLowerCase().endsWith('.webp'));
const completas = existsSync(path.join(CARTAS, 'fullart')) ? readdirSync(path.join(CARTAS, 'fullart')).filter(f => f.toLowerCase().endsWith('.webp')) : [];
const trabajos = [
  ...cuadradas.map(f => ({ id: ids(f), origen: path.join(CARTAS, f), filtro: 'scale=256:256:flags=lanczos' })),
  // Sin cuadrado: el recorte cuadrado de arriba del vertical (1000×1400), donde va la cara
  ...completas.filter(f => !cuadradas.some(c => ids(c) === ids(f)))
    .map(f => ({ id: ids(f), origen: path.join(CARTAS, 'fullart', f), filtro: 'crop=iw:iw:0:ih*0.06,scale=256:256:flags=lanczos' })),
];

let hechos = 0;
for (const t of trabajos) {
  const destino = path.join(MINI, `${t.id}.webp`);
  if (!todas && existsSync(destino) && statSync(destino).mtimeMs >= statSync(t.origen).mtimeMs) continue;
  execFileSync(FFMPEG, ['-loglevel', 'error', '-y', '-i', t.origen, '-vf', t.filtro, '-frames:v', '1', '-quality', '80', destino]);
  hechos++;
}
console.log(`${hechos} iconos hechos (${trabajos.length} cartas) en public/cartas/mini/`);
