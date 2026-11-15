// Vista previa de los códigos de torneo: la de scripts/vista-previa.js (datos inventados, sin Google Sheets) con un
// calendario de mentira (la jornada 1 como la del 15/11) y una Riot y un Discord de mentira en el mismo proceso.
//   node scripts/vista-torneo.js [puerto]        → panel en http://localhost:3056/panel/ (contraseña: tenkaichi)
//   node scripts/vista-torneo.js 3056 --sala     → sin clave de Riot: salas personalizadas
// No toca internet: Riot y Discord contestan desde http://localhost:4071 y lo que les llega sale por la consola.
import http from 'node:http';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const puerto = args.find(a => /^\d+$/.test(a)) || '3056';
const sala = args.includes('--sala');
const FALSO = 4071;

// El calendario: el de la temporada tal como está publicado (15/11/2026)
const CRUCES = [
  [['KAIJU', 'TORA'], ['KEMONO', 'BUSHI'], ['ATSUI', 'SARU']],
  [['KEMONO', 'KAIJU'], ['SARU', 'BUSHI'], ['TORA', 'ATSUI']],
  [['BUSHI', 'TORA'], ['ATSUI', 'KAIJU'], ['SARU', 'KEMONO']],
  [['KAIJU', 'SARU'], ['BUSHI', 'ATSUI'], ['TORA', 'KEMONO']],
];
const cal = { semilla: 0, participantes: ['SARU', 'KAIJU', 'KEMONO', 'ATSUI', 'TORA', 'BUSHI'],
  jornadas: CRUCES.map((j, n) => j.map(([azul, rojo], k) => ({ id: `J${n + 1}-${k + 1}`, jornada: n + 1, azul, rojo }))) };
const carpeta = await mkdtemp(path.join(os.tmpdir(), 'gokudo-torneo-'));
const archivoCal = path.join(carpeta, 'competicion.json');
await writeFile(archivoCal, JSON.stringify(cal));

// Los Oyabun de mentira: uno por familia, con los roles de verdad de discord/ids.json
const ids = Object.values(JSON.parse(await readFile(path.join(RAIZ, 'discord/ids.json'), 'utf8')))[0];
const miembros = [1, 2, 3, 4, 5, 6].map(n => ({ user: { id: `10000000${n}`, username: `oyabun${n}` }, roles: [ids['rol:jefes'], ids[`familia:familia-${n}`]] }));

const POS = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
const CAMPEONES = ['Aatrox', 'LeeSin', 'Ahri', 'Jinx', 'Thresh', 'Garen', 'Vi', 'Syndra', 'Caitlyn', 'Nautilus'];
const partida = { info: { gameDuration: 1912, participants: Array.from({ length: 10 }, (_, i) => ({
  teamId: i < 5 ? 100 : 200, teamPosition: POS[i % 5], riotIdGameName: `Jugador${i + 1}`, championName: CAMPEONES[i], win: i < 5,
  kills: [4, 6, 9, 11, 1, 2, 3, 5, 4, 0][i], deaths: [2, 3, 1, 2, 4, 5, 4, 3, 6, 5][i], assists: [6, 10, 8, 7, 15, 3, 5, 4, 2, 6][i],
  totalMinionsKilled: [210, 40, 230, 260, 30, 190, 35, 200, 220, 25][i], neutralMinionsKilled: [8, 160, 12, 10, 0, 6, 140, 9, 4, 0][i],
  visionScore: [22, 38, 25, 19, 74, 18, 30, 21, 15, 55][i], totalDamageDealtToChampions: [18000, 14000, 26000, 31000, 7000, 12000, 9000, 17000, 15000, 5000][i],
  damageDealtToTurrets: [5000, 2000, 4000, 8000, 500, 1500, 800, 2500, 3000, 200][i], firstBloodKill: i === 2,
  tripleKills: i === 3 ? 1 : 0, quadraKills: 0, pentaKills: 0, turretTakedowns: [2, 1, 2, 3, 1, 0, 0, 1, 1, 0][i],
  challenges: { killParticipation: [0.32, 0.52, 0.55, 0.58, 0.52, 0.36, 0.57, 0.64, 0.43, 0.43][i] },
})) } };

let codigos = 0, hilos = 0;
http.createServer((req, res) => {
  let cuerpo = '';
  req.on('data', d => { cuerpo += d; });
  req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    const dar = (datos, estado = 200) => { res.writeHead(estado, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(datos)); };
    console.log(`[falso] ${req.method} ${u.pathname}${u.search}${cuerpo ? ` ${cuerpo.slice(0, 300)}` : ''}`);
    const p = u.pathname;
    if (p.endsWith('/providers')) return dar(77);
    if (p.endsWith('/tournaments')) return dar(4242);
    if (p.endsWith('/codes')) return dar([`EUW04242-6b1f-${String(++codigos).padStart(4, '0')}-a9c3`]);
    if (p.includes('/games/by-code/')) return dar([{ gameId: 7123456789, region: 'EUW1' }]);
    if (p.startsWith('/lol/match/v5/matches/')) return dar(partida);
    if (p.endsWith('/members')) return dar(miembros);
    if (p.endsWith('/threads')) return dar({ id: `90000${++hilos}` });
    if (p.includes('/thread-members/')) return dar(null, 204);
    if (p.endsWith('/messages')) return dar({ id: '1' });
    return dar({ message: 'no existe' }, 404);
  });
}).listen(FALSO);

Object.assign(process.env, {
  ARCHIVO_COMPETICION: archivoCal,
  DISCORD_BOT_TOKEN: 'token-prueba', DISCORD_URL_API: `http://localhost:${FALSO}/api/v10`,
  ...(!sala && { RIOT_TORNEO_KEY: 'RGAPI-de-mentira', RIOT_TORNEO_HOST: `http://localhost:${FALSO}`, RIOT_PARTIDAS_HOST: `http://localhost:${FALSO}` }),
});
process.argv[2] = puerto;
console.log(`Códigos de torneo de mentira (${sala ? 'salas personalizadas' : 'Riot'}): panel en http://localhost:${puerto}/panel/ (contraseña: tenkaichi)`);
await import('./vista-previa.js');
