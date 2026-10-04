// Vista previa del gachapon y el fantasy con datos inventados, sin tocar data/, las plantillas ni Google Sheets:
// jugadores inventados en todos los clanes, con su tier, y una carta BOOST de cada tier (S+, S, A y B).
//   node scripts/vista-previa.js [puerto] [--cartas=carpeta]
// Abre http://localhost:3055/auth/prueba?nombre=Ana para entrar sin Twitch (con 2 sobres) y ve al gachapon.
// Con --cartas se usan los dibujos y marcos de otra carpeta (misma forma que public/cartas: ID.png y marcos/TIER.png).
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLANES, ROLES, enCompeticion } from '../server/clanes.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const puerto = process.argv.slice(2).find(a => /^\d+$/.test(a)) || '3055';
const cartas = process.argv.slice(2).find(a => a.startsWith('--cartas='))?.slice('--cartas='.length);

const carpeta = await mkdtemp(path.join(os.tmpdir(), 'tenka-vista-'));
const SILABAS = ['ka', 'ze', 'ri', 'mo', 'to', 'ha', 'ya', 'shi', 'ro', 'ku', 'na', 'mi', 'su', 'ke', 'ra', 'no', 'yu', 'ki'];
let semilla = 7;
const azar = n => { semilla = (semilla * 9301 + 49297) % 233280; return Math.floor(semilla / 233280 * n); };
const nick = () => { const n = Array.from({ length: 2 + azar(2) }, () => SILABAS[azar(SILABAS.length)]).join(''); return n[0].toUpperCase() + n.slice(1); };

// Plantillas con jugadores inventados y una tier para cada uno (repartidas para que haya de todas)
const plantillas = JSON.parse(await readFile(path.join(RAIZ, 'data-proyecto', 'plantillas.json'), 'utf8'));
const tiers = {}, orden = ['C', 'B', 'D', 'A', 'C', 'B', 'D', 'S', 'C', 'B', 'A', 'D', 'C'];
CLANES.filter(enCompeticion).forEach((c, i) => {
  plantillas[c.id].jugadores = ROLES.map(() => nick());
  ROLES.forEach((r, j) => { tiers[`${c.id}-${r}`] = orden[(i * 5 + j) % orden.length]; });
});
await writeFile(path.join(carpeta, 'plantillas.json'), JSON.stringify(plantillas));
await writeFile(path.join(carpeta, 'tierlist.json'), JSON.stringify({ jugadores: tiers, equipos: {} }));
await writeFile(path.join(carpeta, 'boosts.json'), JSON.stringify([
  { id: 'BOOST-KAMI', nombre: 'Kami', tier: 'S+', subtitulo: 'Guardián del Tenka Ichi' },
  { id: 'BOOST-TENGU', nombre: 'Tengu', tier: 'S', subtitulo: 'Boost de ejemplo' },
  { id: 'BOOST-KITSUNE', nombre: 'Kitsune', tier: 'A', subtitulo: 'Boost de ejemplo' },
  { id: 'BOOST-KAPPA', nombre: 'Kappa', tier: 'B', subtitulo: 'Boost de ejemplo' },
]));

// Nada de la hoja de Google ni del canal de Twitch reales
for (const k of Object.keys(process.env)) if (/^(GOOGLE_|TWITCH_|RENDER)/.test(k)) delete process.env[k];
Object.assign(process.env, { PORT: puerto, CARPETA_DATOS: carpeta, ARCHIVO_PLANTILLAS: path.join(carpeta, 'plantillas.json'),
  ARCHIVO_BOOSTS: path.join(carpeta, 'boosts.json'), ARCHIVO_LEGACY: path.join(carpeta, 'legacy.json'), ...(cartas ? { CARPETA_CARTAS: path.resolve(cartas) } : {}) });

console.log(`Vista previa con datos inventados en ${carpeta}`);
console.log(`Entra sin Twitch: http://localhost:${puerto}/auth/prueba?nombre=Ana`);
await import('../server/index.js');
