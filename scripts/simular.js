// Simula una temporada completa de TENKA ICHI (liguilla + desempate + playoffs) con resultados,
// jugadores, picks y bans inventados. Se guarda en data-proyecto/simulacion.json y se ve en
// la portada con ?simulacion. No toca el registro real ni Google Sheets.
// Uso: npm run simular [semilla]
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLANES } from '../server/clanes.js';
import { azar, barajar, sortear, clasificacion, cuadro, FASE_LIGA, FASE_DESEMPATE, FASE_FINAL } from '../server/competicion.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const semilla = Number(process.argv[2]) || 1509;
const rnd = azar(semilla);
const { campeones } = JSON.parse(await readFile(path.join(raiz, 'public', 'ddragon', 'campeones.json'), 'utf8'));

// 10 de los 13 clanes, con una fuerza oculta cada uno
const liga = CLANES.filter(c => !c.invitado).map(c => c.id);
const participantes = barajar(liga, rnd).slice(0, 10);
const fuerza = Object.fromEntries(participantes.map(c => [c, 0.35 + rnd() * 0.5]));

// Jugadores inventados
const NICKS = ['Kenshin', 'Oni', 'Ryu', 'Hana', 'Sora', 'Kaze', 'Tsubame', 'Arashi', 'Hayate', 'Nami', 'Kage', 'Yuki', 'Raiden', 'Akuma',
  'Shiro', 'Kuro', 'Hotaru', 'Tetsu', 'Ren', 'Jin', 'Mizu', 'Hikari', 'Daichi', 'Kaito', 'Rin', 'Sen', 'Tora', 'Haru', 'Ikki', 'Goro',
  'Masa', 'Nobu', 'Sato', 'Taka', 'Yoru', 'Zen', 'Aki', 'Fuyu', 'Natsu', 'Kiba', 'Moku', 'Shin', 'Toshi', 'Umi', 'Washi', 'Yama', 'Ko', 'Enma', 'Gin', 'Ichi'];
const nicks = barajar(NICKS, rnd);
const jugadores = Object.fromEntries(participantes.map((c, i) => [c, nicks.slice(i * 5, i * 5 + 5)]));

// Meta: unos campeones mucho más populares que otros (peso ~ azar³)
const peso = Object.fromEntries(campeones.map(c => [c.id, Math.pow(rnd(), 3) + 0.01]));
function elegir(excluidos, n) {
  const res = [];
  for (let k = 0; k < n; k++) {
    const pool = campeones.filter(c => !excluidos.has(c.id));
    let t = rnd() * pool.reduce((s, c) => s + peso[c.id], 0);
    const c = pool.find(c => (t -= peso[c.id]) <= 0) || pool[0];
    res.push(c.id); excluidos.add(c.id);
  }
  return res;
}

function jugar({ fecha, jornada, fase, serie, partida, azul, rojo, bloqueados = [] }) {
  const usados = new Set(bloqueados);
  const bans = { azul: elegir(usados, 5), rojo: elegir(usados, 5) };
  const picks = { azul: elegir(usados, 5), rojo: elegir(usados, 5) };
  const pAzul = fuerza[azul] / (fuerza[azul] + fuerza[rojo]) + 0.03; // pequeña ventaja del lado azul
  return { fecha, jornada, fase, serie, partida, clanAzul: azul, clanRojo: rojo, ganador: rnd() < pAzul ? 'azul' : 'rojo',
    picks, bans, jugadores: { azul: jugadores[azul], rojo: jugadores[rojo] } };
}

const dia = n => new Date(Date.UTC(2026, 9, 5 + n)).toISOString().slice(0, 10);
const partidas = [];

// Liguilla
const calendario = sortear(participantes, semilla);
calendario.jornadas.forEach((j, i) => j.forEach(c => partidas.push(jugar({
  fecha: dia(i * 7), jornada: `Jornada ${c.jornada}`, fase: FASE_LIGA, serie: `Jornada ${c.jornada} · ${c.azul} vs ${c.rojo}`, partida: 1, azul: c.azul, rojo: c.rojo,
}))));

// Desempate si hace falta
let clasif = clasificacion(calendario, partidas);
if (clasif.desempate) {
  const [a, b] = clasif.desempate.clanes;
  partidas.push(jugar({ fecha: dia(35), jornada: 'Desempate', fase: FASE_DESEMPATE, serie: `Desempate · ${a} vs ${b}`, partida: 1, azul: a, rojo: b }));
  clasif = clasificacion(calendario, partidas);
}

// Playoffs: se juega ronda a ronda, respetando quién elige lado y el fearless de la serie
const fechas = { 'Cuartos de final': dia(42), Semifinales: dia(49), Final: dia(56) };
for (const ronda of ['cuartos', 'semis', 'final']) {
  let c = cuadro(clasif, partidas);
  const series = ronda === 'final' ? [c.final] : c[ronda];
  for (const s of series) {
    const bloqueados = [];
    let actual = s;
    while (!actual.ganador) {
      const elige = actual.siguiente.eligeLado;
      const otro = elige === actual.alto ? actual.bajo : actual.alto;
      const azul = rnd() < 0.75 ? elige : otro; // casi siempre se elige el lado azul
      const rojo = azul === elige ? otro : elige;
      const p = jugar({ fecha: fechas[s.ronda], jornada: s.ronda, fase: FASE_FINAL, serie: `${s.ronda} · ${actual.alto} vs ${actual.bajo}`,
        partida: actual.siguiente.partida, azul, rojo, bloqueados });
      partidas.push(p);
      bloqueados.push(...p.picks.azul, ...p.picks.rojo);
      c = cuadro(clasif, partidas);
      actual = [...c.cuartos, ...c.semis, c.final].find(x => x.id === s.id);
    }
  }
}

const resultado = cuadro(clasif, partidas);
await writeFile(path.join(raiz, 'data-proyecto', 'simulacion.json'), JSON.stringify({ semilla, generado: new Date().toISOString(), calendario, partidas }, null, 1));
console.log(`Simulación ${semilla}: ${partidas.length} partidas. Clanes: ${participantes.join(', ')}`);
console.log('Clasificación:', clasif.filas.map(f => `${f.puesto}.${f.clan}(${f.victorias}-${f.derrotas},F${f.fuerza}${f.criterio ? ',' + f.criterio : ''})`).join(' '));
if (clasif.desempate) console.log('Desempate:', clasif.desempate);
console.log('Campeón:', resultado.campeon);
