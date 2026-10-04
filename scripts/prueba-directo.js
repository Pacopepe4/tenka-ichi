// La web con una liga de prueba ya empezada, para ver el overlay entero (postdraft, partida y pantalla final), el
// ranking del fantasy, «Ver carta», los códigos de directo y fundir repetidas sin esperar a que haya partidas.
// No toca data/, las plantillas ni Google Sheets: todo va a una carpeta temporal.
//   npm run prueba-directo [puerto]
// Usa los jugadores de verdad de data-proyecto/plantillas.json (los clanes que tengan los cinco puestos), se inventa
// seis partidas entre ellos con sus estadísticas y tres coleccionistas con alineación, y deja en el panel un draft
// completo: el overlay arranca en el postdraft. En el panel (contraseña de local), «Empezar una partida de prueba»
// pasa al marcador y al pararla sale la pantalla final.
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROLES } from '../server/clanes.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const puerto = process.argv.slice(2).find(a => /^\d+$/.test(a)) || '3060';
const carpeta = await mkdtemp(path.join(os.tmpdir(), 'tenka-directo-'));
const leer = async archivo => JSON.parse(await readFile(path.join(RAIZ, 'data-proyecto', archivo), 'utf8'));
const plantillas = await leer('plantillas.json'), campeonDe = await leer('campeones-cartas.json').catch(() => ({}));

const clanes = Object.keys(plantillas).filter(c => plantillas[c].jugadores?.filter(Boolean).length === 5).slice(0, 3);
if (clanes.length < 3) throw new Error('Hacen falta al menos tres clanes con sus cinco jugadores en data-proyecto/plantillas.json');
const [A, B, C] = clanes;
let semilla = 11;
const azar = n => { semilla = (semilla * 9301 + 49297) % 233280; return Math.floor(semilla / 233280 * n); };

// Tier de cada jugador (S, A, B y C repartidas) y otros campeones que juega cada puesto además del de su carta
const tiers = Object.fromEntries(clanes.flatMap((c, i) => ROLES.map((r, j) => [`${c}-${r}`, ['A', 'S', 'B', 'A', 'B', 'S', 'C', 'A', 'B'][(i * 5 + j) % 9]])));
const OTROS = { TOP: ['Gnar', 'Renekton', 'Jax'], JUNGLA: ['LeeSin', 'Vi', 'Sejuani'], MEDIO: ['Ahri', 'Orianna', 'Syndra'], ADC: ['Jinx', 'Ezreal', 'Xayah'], SUPPORT: ['Rakan', 'Leona', 'Lulu'] };
const BANS = ['Yasuo', 'Zed', 'Akali', 'Yone', 'Kaisa', 'Lucian', 'Nautilus', 'Maokai', 'Vayne', 'Draven', 'Skarner', 'Ambessa', 'Aurora', 'Poppy', 'Corki'];
const cruces = [['Jornada 1', A, B, 'azul'], ['Jornada 1', C, A, 'rojo'], ['Jornada 2', B, C, 'azul'], ['Jornada 2', A, C, 'azul'], ['Jornada 3', B, A, 'rojo'], ['Jornada 3', C, B, 'rojo']];

const registro = [], estadisticas = [];
cruces.forEach(([jornada, azul, rojo, ganador], n) => {
  const vistos = new Set();
  const elegir = (clan, rol) => {
    let c = azar(3) && campeonDe[`${clan}-${rol}`] ? campeonDe[`${clan}-${rol}`] : OTROS[rol][azar(3)];
    for (let k = 0; vistos.has(c); k++) c = OTROS[rol][k % 3];
    vistos.add(c);
    return c;
  };
  const picks = { azul: ROLES.map(r => elegir(azul, r)), rojo: ROLES.map(r => elegir(rojo, r)) };
  const libres = BANS.filter(b => !vistos.has(b));
  registro.push({ fecha: `2026-10-${String(5 + n * 2).padStart(2, '0')}`, jornada, fase: 'Fase de liga', serie: `${jornada} · ${azul} vs ${rojo}`, partida: 1,
    clanAzul: azul, clanRojo: rojo, ganador, picks, bans: { azul: libres.slice(0, 5), rojo: libres.slice(5, 10) },
    jugadores: { azul: plantillas[azul].jugadores, rojo: plantillas[rojo].jugadores } });
  for (const lado of ['azul', 'rojo']) {
    const clan = lado === 'azul' ? azul : rojo, gana = ganador === lado;
    const kills = ROLES.map((_, i) => Math.max(0, [3, 5, 6, 8, 1][i] + azar(4) + (gana ? 2 : -1)));
    const total = kills.reduce((s, k) => s + k, 0);
    ROLES.forEach((rol, i) => {
      const k = kills[i], apoyo = rol === 'SUPPORT', a = Math.min(total - k, 3 + azar(8) + (apoyo ? 6 : 0));
      estadisticas.push({ fecha: `2026-10-${String(5 + n * 2).padStart(2, '0')}T20:00:00.000Z`, partida: `${jornada}: ${azul} vs ${rojo}, partida 1`, jornada, fase: 'Fase de liga',
        clan, rol, jugador: plantillas[clan].jugadores[i], id: `${clan}-${rol}`, victoria: gana, mvp: gana && i === 3, k, d: (gana ? 1 : 3) + azar(4), a,
        cs: apoyo ? 30 + azar(30) : 180 + azar(120), vision: apoyo ? 60 + azar(40) : 15 + azar(25), dano: apoyo ? 6000 + azar(5000) : 14000 + azar(18000),
        danoTorres: 1000 + azar(7000), primeraSangre: lado === 'azul' && i === 1, triples: i === 3 && gana ? azar(2) : 0, quadras: 0, pentas: 0, torres: azar(4),
        kp: Math.min(100, Math.round((k + a) / Math.max(1, total) * 100)), fuente: 'a mano' });
    });
  }
});

// Tres coleccionistas con cartas (Koryu, con repetidas para fundir) y alineación desde antes de la primera partida
const carta = (id, usuario, detalle, veces = 1) => Array.from({ length: veces }, () => ({ fecha: '2026-10-01T10:00:00.000Z', id, usuario, tipo: 'carta', detalle, cantidad: 1, rareza: tiers[detalle] || '' }));
const alta = (id, usuario, sobres) => ({ fecha: '2026-10-01T09:00:00.000Z', id, usuario, tipo: 'alta', detalle: '', cantidad: sobres, rareza: '' });
const equipo = lista => ROLES.map((r, i) => `${lista[i]}-${r}`);
const coleccionistas = [['prueba-koryu', 'Koryu', equipo([A, A, B, B, C])], ['prueba-izakaya', 'Izakaya', equipo([C, C, C, A, B])], ['prueba-budoka', 'Budoka', equipo([B, B, A, C, A])]];
const gacha = coleccionistas.flatMap(([id, nombre, cartas]) => [alta(id, nombre, id === 'prueba-koryu' ? 6 : 2), ...cartas.flatMap(c => carta(id, nombre, c))]);
gacha.push(...carta('prueba-koryu', 'Koryu', `${A}-TOP`, 3), ...carta('prueba-koryu', 'Koryu', `${B}-ADC`, 2), ...carta('prueba-koryu', 'Koryu', `${C}-TOP`, 3));
const alineaciones = coleccionistas.map(([id, usuario, cartas]) => ({ fecha: '2026-10-02T10:00:00.000Z', id, usuario,
  slots: { ...Object.fromEntries(ROLES.map((r, i) => [r, cartas[i]])), boosts: [null, null] } }));

// El panel, con un draft completo entre los dos primeros clanes: al arrancar se recupera como si la web se hubiera reiniciado
const picks = { azul: ROLES.map(r => campeonDe[`${A}-${r}`] || OTROS[r][0]), rojo: ROLES.map((r, i) => (i === 2 ? 'Azir' : campeonDe[`${B}-${r}`] || OTROS[r][1])) };
const estadoPanel = { cuando: Date.now(), config: { jornada: 'Jornada 4', fase: 'Fase de liga', formato: 'bo1', serie: 1, partida: 1 },
  equipos: { azul: { clan: A, jugadores: plantillas[A].jugadores }, rojo: { clan: B, jugadores: plantillas[B].jugadores } },
  draft: { picks, bans: { azul: ['Yasuo', 'Zed', 'Akali', null, null], rojo: ['Vayne', 'Draven', null, null, null] } } };

const escribir = (archivo, datos) => writeFile(path.join(carpeta, archivo), JSON.stringify(datos));
await Promise.all([escribir('plantillas.json', plantillas), escribir('tierlist.json', { jugadores: tiers, equipos: {} }), escribir('registro.json', registro),
  escribir('estadisticas.json', estadisticas), escribir('gacha.json', gacha), escribir('alineaciones.json', alineaciones),
  escribir('ajustes.json', { estado_panel: JSON.stringify(estadoPanel) })]);

// Nada de la hoja de Google, de Discord ni del canal de Twitch reales
for (const k of Object.keys(process.env)) if (/^(GOOGLE_|TWITCH_|DISCORD_|RENDER)/.test(k)) delete process.env[k];
Object.assign(process.env, { PORT: puerto, CARPETA_DATOS: carpeta, ARCHIVO_PLANTILLAS: path.join(carpeta, 'plantillas.json'), ESPERA_VISTA_MS: process.env.ESPERA_VISTA_MS || '3000' });

console.log(`Liga de prueba en ${carpeta}: ${clanes.join(', ')}, ${registro.length} partidas`);
console.log(`Entra en el gachapon sin Discord: http://localhost:${puerto}/auth/prueba?nombre=Koryu`);
await import('../server/index.js');
