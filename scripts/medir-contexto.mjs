// Mide el contexto de los bots con el modelo de verdad (multilingual-e5-small) y Postgres con pgvector en PGlite (WASM):
// llena la base con lo que hay en el repo (ficha, lore, lista de KB y plantillas) y cronometra una búsqueda completa
// (el embedding de la pregunta + HNSW + palabras) con preguntas de verdad. No toca la hoja ni el server.
//   node scripts/medir-contexto.mjs            (con los hilos que quiera onnxruntime)
//   node scripts/medir-contexto.mjs --hilos 1  (con un solo hilo, para parecerse más a un server pequeño)
// El modelo se baja la primera vez a data/modelos (unos 130 MB).
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { crearContexto, crearEmbeddings } from '../server/contexto.js';
import { trozosFicha, trozosLore, trozosKb, trozosPlantillas, trozosFichas } from '../server/contexto-fuentes.js';
import { CLANES } from '../server/clanes.js';

const hilos = Number(process.argv[process.argv.indexOf('--hilos') + 1]) || undefined;
const PREGUNTAS = [
  '¿cuándo es la próxima jornada?', '¿cómo consigo más tiradas del gachapon?', '¿quién es el oyabun de Ryūjin?', '¿en qué familia juega GAATSU?',
  '¿qué es una carta legacy?', '¿cómo funciona el fantasy?', '¿dónde se ve el directo?', 'háblame de los Tengu', '¿qué opinas de KB?', '¿cómo se apunta uno a una familia?', '¿quién es el rey de la toplane?', '¿quién es el dictador de la botlane?', '¿qué campeón juega Freddy?',
];

const silencio = { log() {}, error: console.error };
const embeddings = crearEmbeddings({ carpeta: 'data/modelos', hilos, log: silencio });
let t = performance.now();
await embeddings.cargar();
console.log(`Modelo cargado en ${Math.round(performance.now() - t)} ms${hilos ? ` (${hilos} hilo${hilos > 1 ? 's' : ''})` : ''}`);

const db = await PGlite.create({ extensions: { vector } });
const ctx = crearContexto({ db, embeddings, log: silencio });
let plantillas = {};
try { plantillas = JSON.parse(readFileSync('data-proyecto/plantillas.json', 'utf8')); } catch {}
const fuentes = {
  ficha: trozosFicha(readFileSync('discord/tickets-saber.md', 'utf8')),
  lore: trozosLore(readFileSync('discord/lore.md', 'utf8')),
  kb: trozosKb(readFileSync('discord/kbstats-jugadores.md', 'utf8')),
  fichas: trozosFichas(readFileSync('discord/fichas-miembros.md', 'utf8')),
  plantillas: trozosPlantillas(CLANES.map(c => ({ ...c, ...(plantillas[c.id] || {}) }))),
};
t = performance.now();
let n = 0;
for (const [f, trozos] of Object.entries(fuentes)) { await ctx.guardarFuente(f, trozos); n += trozos.length; }
const llenar = performance.now() - t;
console.log(`${n} trozos guardados en ${Math.round(llenar)} ms (${Math.round(llenar / n)} ms por trozo, con su embedding)`);

await ctx.buscar('calentar');   // la primera búsqueda prepara cosas: no cuenta
const tiempos = [];
for (let vuelta = 0; vuelta < 3; vuelta++) {
  for (const p of PREGUNTAS) {
    const r = await ctx.buscar(p, { k: 6 });
    tiempos.push(r.ms);
    if (vuelta === 0) console.log(`  ${String(r.ms.total).padStart(4)} ms  ${p}  →  ${r[0]?.titulo}`);
  }
}
const media = k => Math.round(tiempos.reduce((s, x) => s + x[k], 0) / tiempos.length * 10) / 10;
const ordenados = tiempos.map(x => x.total).sort((a, b) => a - b);
console.log(`\nBúsqueda completa (${tiempos.length} búsquedas): media ${media('total')} ms · mediana ${ordenados[Math.floor(ordenados.length / 2)]} ms · la peor ${ordenados.at(-1)} ms`);
console.log(`  embedding de la pregunta: ${media('embedding')} ms · HNSW + palabras en Postgres: ${media('busqueda')} ms`);
console.log(`Memoria del proceso: ${Math.round(process.memoryUsage().rss / 1048576)} MB`);
await db.close();
