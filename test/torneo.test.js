// Códigos de torneo: un código por partido, entregado en un hilo privado de Discord y el resultado con match-v5.
// Riot y Discord son de mentira (no se toca internet).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearTorneo, crearRiot, partidosTemporada, filasDePartida, ErrorRiot } from '../server/torneo.js';

const TEMP = { liguilla: ['2026-11-15', '2026-11-22'], playoffs: { cuartos: '2026-12-13', semis: '2026-12-20', final: '2026-12-27' }, hora: '17:00', margenMinutos: 45 };
const CAL = { jornadas: [
  [{ id: 'J1-1', azul: 'KEMONO', rojo: 'BUSHI' }, { id: 'J1-2', azul: 'ATSUI', rojo: 'SARU' }, { id: 'J1-3', azul: 'KAIJU', rojo: 'TORA' }],
  [{ id: 'J2-1', azul: 'SARU', rojo: 'KEMONO' }],
] };
const NOMBRES = { KEMONO: 'Tengu', BUSHI: 'Akuma', ATSUI: 'Ryūjin', SARU: 'Tsuki', KAIJU: 'Yasha', TORA: 'Byakko' };
const PLANTILLAS = { KEMONO: ['ALFA', 'BETA', 'GAMMA', 'DELTA', 'EPSILON'], BUSHI: ['ROJO1', 'ROJO2', 'ROJO3', 'ROJO4', 'ROJO5'] };

function participante(teamId, pos, nombre, win, extra = {}) {
  return { teamId, teamPosition: pos, riotIdGameName: nombre, win, kills: 3, deaths: 1, assists: 7, totalMinionsKilled: 180, neutralMinionsKilled: 20,
    visionScore: 30, totalDamageDealtToChampions: 15000, damageDealtToTurrets: 2000, firstBloodKill: false, tripleKills: 0, quadraKills: 0, pentaKills: 0,
    turretTakedowns: 2, challenges: { killParticipation: 0.6 }, championName: 'Ahri', ...extra };
}
const POS = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
// Tengu jugó en el lado rojo (200) aunque el calendario lo pone azul, y ganó
const PARTIDA = { info: { gameDuration: 1800, participants: [
  ...POS.map((p, i) => participante(100, p, PLANTILLAS.BUSHI[i], false)),
  ...POS.map((p, i) => participante(200, p, PLANTILLAS.KEMONO[i].toLowerCase(), true, i === 2 ? { kills: 11, pentaKills: 1, quadraKills: 1, tripleKills: 1 } : {})),
] } };

function riotFalso({ fallar = null } = {}) {
  const llamadas = [];
  const json = (status, cuerpo) => ({ ok: status < 400, status, json: async () => cuerpo });
  const pedir = async (url, o) => {
    const u = new URL(url);
    llamadas.push({ metodo: o.method, ruta: u.pathname + u.search, host: u.host, cuerpo: o.body ? JSON.parse(o.body) : null, clave: o.headers['X-Riot-Token'] });
    if (fallar) return json(fallar, { status: { message: 'Forbidden' } });
    if (u.pathname.endsWith('/providers')) return json(200, 77);
    if (u.pathname.endsWith('/tournaments')) return json(200, 4242);
    if (u.pathname.endsWith('/codes')) return json(200, [`EUW04242-CODIGO-${llamadas.filter(l => l.ruta.includes('/codes')).length}`]);
    if (u.pathname.includes('/games/by-code/')) return json(200, [{ gameId: 7000000001, region: 'EUW1', shortCode: decodeURIComponent(u.pathname.split('/').pop()) }]);
    if (u.pathname === '/lol/match/v5/matches/EUW1_7000000001') return json(200, PARTIDA);
    return json(404, {});
  };
  return { pedir, llamadas };
}

function discordFalso({ miembros = [], fallaMiembros = false } = {}) {
  const llamadas = [];
  let hilos = 0;
  const pedir = async (metodo, ruta, cuerpo) => {
    llamadas.push({ metodo, ruta, cuerpo });
    if (ruta.includes('/members?')) { if (fallaMiembros) throw new Error('Discord respondió 403'); return miembros; }
    if (ruta.endsWith('/threads')) return { id: `hilo-${++hilos}` };
    return {};
  };
  return { llamadas, d: { pedir, guild: 'g1', canal: 'canal-tickets', rolJefes: 'rol-oyabun', rolFamilia: c => `rol-${c}`, capitanes: () => [] } };
}

function montar({ riot = null, discord = null, conRiot = true, ajuste = null } = {}) {
  let guardado = ajuste;
  const t = crearTorneo({
    claveRiot: conRiot ? 'RGAPI-falsa' : '', pedirRiot: riot?.pedir, secreto: 's3creto',
    leerAjuste: () => guardado, guardarAjuste: v => { guardado = v; },
    partidos: horario => partidosTemporada({ calendario: CAL, temporada: TEMP, horario, nombreDe: c => NOMBRES[c] }),
    clan: id => ({ id, nombre: NOMBRES[id] }), jugadoresDe: c => PLANTILLAS[c] || [],
    discord: discord?.d || null, azar: () => 0, ahora: () => new Date('2026-11-15T17:00:00Z'), log: { error() {} },
    guardarEstadisticas: async (partida, filas) => { registros.push({ partida, filas }); return filas.map(f => ({ id: f.id, puntos: 1 })); },
    reintentos: [0], esperarAviso: true,
  });
  return { t, guardado: () => guardado, registros };
}
const registros = [];

test('los partidos de la temporada salen con su día y su hora, y el staff los puede mover', () => {
  const ps = partidosTemporada({ calendario: CAL, temporada: TEMP, nombreDe: c => NOMBRES[c] });
  assert.deepEqual(ps.map(p => `${p.id} ${p.fecha} ${p.hora}`), ['J1-1 2026-11-15 17:00', 'J1-2 2026-11-15 17:45', 'J1-3 2026-11-15 18:30', 'J2-1 2026-11-22 17:00']);
  assert.equal(ps[0].nombre, 'Tengu 対 Akuma');
  // El 15/11: a las 19:00 y Yasha–Byakko al día siguiente
  const movidos = partidosTemporada({ calendario: CAL, temporada: TEMP, horario: { 'J1-1': { hora: '19:00' }, 'J1-2': { hora: '20:30' }, 'J1-3': { fecha: '2026-11-16', hora: '19:00' } } });
  assert.deepEqual(movidos.slice(0, 3).map(p => `${p.id} ${p.fecha} ${p.hora}`), ['J1-1 2026-11-15 19:00', 'J1-2 2026-11-15 20:30', 'J1-3 2026-11-16 19:00']);
});

test('las series de playoffs tienen un código por partida (al mejor de tres)', () => {
  const cuadro = { cuartos: [{ id: 'C1', alto: 'SARU', bajo: 'KAIJU', partidas: [] }, { id: 'C2', alto: 'TORA', bajo: null }], semis: [], final: { id: 'F', alto: null, bajo: null } };
  const ps = partidosTemporada({ calendario: null, cuadro, temporada: TEMP });
  assert.deepEqual(ps.map(p => p.id), ['C1-1', 'C1-2', 'C1-3']);
  assert.equal(ps[2].ronda, 'Cuartos 1, partida 3');
});

test('con clave de Riot: registra proveedor y torneo una vez y pide un código por partido con su firma', async () => {
  const riot = riotFalso();
  const { t } = montar({ riot });
  const a = await t.generar('J1-1');
  const b = await t.generar('J1-2');
  assert.equal(a.modo, 'riot');
  assert.notEqual(a.codigo, b.codigo);
  assert.equal(riot.llamadas.filter(l => l.ruta.endsWith('/providers')).length, 1);
  assert.equal(riot.llamadas.filter(l => l.ruta.endsWith('/tournaments')).length, 1);
  const prov = riot.llamadas.find(l => l.ruta.endsWith('/providers'));
  assert.equal(prov.ruta, '/lol/tournament/v5/providers');
  assert.deepEqual(prov.cuerpo, { region: 'EUW', url: 'https://tenka-ichi.onrender.com/api/torneo/riot' });
  const cod = riot.llamadas.find(l => l.ruta.includes('/codes'));
  assert.equal(cod.ruta, '/lol/tournament/v5/codes?count=1&tournamentId=4242');
  assert.equal(cod.cuerpo.teamSize, 5);
  assert.equal(cod.cuerpo.pickType, 'TOURNAMENT_DRAFT');
  assert.deepEqual(JSON.parse(cod.cuerpo.metadata), { p: 'J1-1', f: t.firma('J1-1') });
  // Pedirlo otra vez no gasta otro código
  assert.equal((await t.generar('J1-1')).codigo, a.codigo);
  assert.equal(riot.llamadas.filter(l => l.ruta.includes('/codes')).length, 2);
});

test('el estado del panel no lleva los códigos; solo «ver» los da', async () => {
  const { t } = montar({ riot: riotFalso() });
  const c = await t.generar('J1-1');
  const e = t.estado();
  assert.equal(JSON.stringify(e).includes(c.codigo), false);
  assert.equal(e.partidos.find(p => p.id === 'J1-1').tiene, true);
  assert.equal(t.ver('J1-1').codigo, c.codigo);
});

test('sin clave de Riot: sala personalizada con nombre y contraseña', async () => {
  const { t } = montar({ conRiot: false });
  assert.equal(t.modo(), 'sala');
  const c = await t.generar('J1-2');
  assert.equal(c.modo, 'sala');
  assert.equal(c.sala, 'Gokudō J1 · Ryūjin vs Tsuki');
  assert.match(c.codigo, /^[A-Z0-9]{6}$/);
  assert.equal((await t.resultado('J1-2')).ok, false);
});

test('una clave sin acceso a la Tournament API da un error claro y sin la clave', async () => {
  const { t } = montar({ riot: riotFalso({ fallar: 403 }) });
  await assert.rejects(t.generar('J1-1'), e => e instanceof ErrorRiot && /clave de producción/.test(e.message) && !/RGAPI/.test(e.message));
});

test('tournament-stub usa las rutas del stub', async () => {
  const riot = riotFalso();
  const r = crearRiot({ clave: 'RGAPI-dev', stub: true, pedir: riot.pedir });
  await r.proveedor('https://x/api/torneo/riot');
  assert.equal(riot.llamadas[0].ruta, '/lol/tournament-stub/v5/providers');
  assert.equal(riot.llamadas[0].host, 'americas.api.riotgames.com');
});

test('entrega: un hilo privado por familia con su Oyabun, el código, su draft y sin menciones de más', async () => {
  const dc = discordFalso({ miembros: [
    { user: { id: '111' }, roles: ['rol-KEMONO', 'rol-oyabun'] },
    { user: { id: '222' }, roles: ['rol-BUSHI', 'rol-oyabun'] },
    { user: { id: '333' }, roles: ['rol-BUSHI'] },                       // jugador, no Oyabun
    { user: { id: '444', bot: true }, roles: ['rol-KEMONO', 'rol-oyabun'] },
  ] });
  const { t } = montar({ riot: riotFalso(), discord: dc });
  await t.guardarDrafts('J1-1', { azul: 'https://lol.draftcore.net/AZUL111', rojo: 'https://lol.draftcore.net/ROJO222', espectador: 'https://lol.draftcore.net/ESPE333' });
  const r = await t.entregar('J1-1');
  assert.equal(r.ok, true);
  assert.equal(r.capitanes, 2);
  assert.equal(r.drafts, true);
  const hilos = dc.llamadas.filter(l => l.ruta === '/channels/canal-tickets/threads');
  assert.deepEqual(hilos.map(h => h.cuerpo.name), ['🎟️・J1 Tengu vs Akuma · Tengu', '🎟️・J1 Tengu vs Akuma · Akuma']);
  assert.ok(hilos.every(h => h.cuerpo.type === 12 && h.cuerpo.invitable === false));
  assert.deepEqual(dc.llamadas.filter(l => l.metodo === 'PUT').map(l => l.ruta), ['/channels/hilo-1/thread-members/111', '/channels/hilo-2/thread-members/222']);
  const azul = dc.llamadas.find(l => l.ruta === '/channels/hilo-1/messages').cuerpo;
  const rojo = dc.llamadas.find(l => l.ruta === '/channels/hilo-2/messages').cuerpo;
  assert.match(azul.embeds[0].description, /EUW04242-CODIGO-1/);
  assert.match(rojo.embeds[0].description, /EUW04242-CODIGO-1/);
  // Cada capitán ve solo el draft de su lado, nunca el del rival ni el de espectador
  assert.match(azul.embeds[0].description, /AZUL111/);
  assert.doesNotMatch(azul.embeds[0].description, /ROJO222|ESPE333/);
  assert.match(rojo.embeds[0].description, /ROJO222/);
  assert.doesNotMatch(rojo.embeds[0].description, /AZUL111|ESPE333/);
  assert.deepEqual(azul.allowed_mentions, { parse: [], users: ['111'] });
  assert.ok(t.estado().partidos.find(p => p.id === 'J1-1').entregado);
  // Volver a entregar usa los mismos hilos
  await t.entregar('J1-1');
  assert.equal(dc.llamadas.filter(l => l.ruta.endsWith('/threads')).length, 2);
});

test('drafts: se pegan todos de golpe, se guardan con el código y solo valen enlaces de DraftCore', async () => {
  const { t } = montar({ riot: riotFalso() });
  const r = await t.pegarDrafts([
    'J1-1 https://lol.draftcore.net/A1 https://lol.draftcore.net/R1 https://lol.draftcore.net/E1',
    '',
    'J1-2 https://lol.draftcore.net/A2 https://lol.draftcore.net/R2 https://lol.draftcore.net/E2',
    'J1-3 https://malo.com/x https://lol.draftcore.net/R3 https://lol.draftcore.net/E3',
    'J9-9 https://lol.draftcore.net/A9 https://lol.draftcore.net/R9 https://lol.draftcore.net/E9',
  ].join('\n'));
  assert.deepEqual(r.hechos, ['J1-1', 'J1-2']);
  assert.equal(r.errores.length, 2);
  // Generar el código después no borra los drafts, y el estado dice que están sin dar los enlaces
  await t.generar('J1-1');
  assert.equal(t.ver('J1-1').drafts.rojo, 'https://lol.draftcore.net/R1');
  const e = t.estado();
  assert.deepEqual(e.partidos.find(p => p.id === 'J1-1').drafts, { azul: true, rojo: true, espectador: true });
  assert.equal(JSON.stringify(e).includes('draftcore.net'), false);
  await assert.rejects(t.guardarDrafts('J1-1', { azul: 'javascript:alert(1)' }));
});

test('entrega sin poder leer los miembros: avisa de qué familias no tienen capitán', async () => {
  const dc = discordFalso({ fallaMiembros: true });
  const { t } = montar({ conRiot: false, discord: dc });
  const r = await t.entregar('J1-2');
  assert.equal(r.ok, true);
  assert.deepEqual(r.sinCapitan, ['Ryūjin', 'Tsuki']);
  assert.match(r.aviso, /Server Members Intent/);
  const msg = dc.llamadas.find(l => l.ruta === '/channels/hilo-1/messages').cuerpo;
  assert.match(msg.embeds[0].description, /Contraseña: `[A-Z0-9]{6}`/);
});

test('los capitanes de data-proyecto/capitanes.json mandan sobre los Oyabun', async () => {
  const dc = discordFalso({ miembros: [{ user: { id: '111' }, roles: ['rol-KEMONO', 'rol-oyabun'] }] });
  dc.d.capitanes = c => (c === 'KEMONO' ? ['99999'] : []);
  const { t } = montar({ conRiot: false, discord: dc });
  await t.entregar('J1-1');
  assert.deepEqual(dc.llamadas.filter(l => l.metodo === 'PUT').map(l => l.ruta.split('/').pop()), ['99999']);
});

test('resultado: lee la partida del código con match-v5 y da la vuelta a los lados si hace falta', async () => {
  const { t } = montar({ riot: riotFalso() });
  await t.generar('J1-1');
  const r = await t.resultado('J1-1');
  assert.equal(r.ok, true);
  assert.equal(r.partidaRiot, 'EUW1_7000000001');
  assert.equal(r.invertido, true);
  assert.equal(r.ganador, 'KEMONO');
  const medio = r.porClan.KEMONO[2];
  assert.equal(medio.nombre, 'gamma');
  assert.equal(medio.k, 11);
  assert.equal(medio.pentas, 1);
  assert.equal(medio.cs, 200);
  assert.equal(medio.kp, 60);
  assert.equal(r.porClan.BUSHI[0].victoria, false);
  assert.equal(t.estado().partidos.find(p => p.id === 'J1-1').ganador, 'KEMONO');
});

test('la partida jugada con el código queda registrada en el fantasy, una vez y con los lados de verdad', async () => {
  registros.length = 0;
  const { t } = montar({ riot: riotFalso() });
  await t.generar('J1-1');
  const r = await t.resultado('J1-1');
  assert.equal(r.registrado, true);
  assert.equal(registros.length, 1);
  // Tengu jugó en rojo: el nombre es el mismo que pondría el panel con los lados en los que se jugó
  assert.equal(registros[0].partida, 'Jornada 1: BUSHI vs KEMONO, partida 1');
  const filas = registros[0].filas;
  assert.equal(filas.length, 10);
  const medio = filas.find(f => f.id === 'KEMONO-MEDIO');
  assert.deepEqual([medio.jugador, medio.victoria, medio.k, medio.pentas, medio.fuente, medio.mvp, medio.jornada, medio.fase],
    ['GAMMA', true, 11, 1, 'riot', false, 'Jornada 1', 'Fase de liga']);
  assert.equal(filas.find(f => f.id === 'BUSHI-TOP').victoria, false);
  // Leerla otra vez no la guarda dos veces; «otra vez» sí
  await t.resultado('J1-1');
  assert.equal(registros.length, 1);
  await t.resultado('J1-1', { otraVez: true });
  assert.equal(registros.length, 2);
  assert.equal(t.estado().partidos.find(p => p.id === 'J1-1').registrado, true);
});

test('el aviso de Riot al acabar registra la partida solo', async () => {
  registros.length = 0;
  const { t } = montar({ riot: riotFalso() });
  const c = await t.generar('J1-1');
  await t.aviso({ shortCode: c.codigo, metaData: JSON.stringify({ p: 'J1-1', f: t.firma('J1-1') }), gameId: 7000000001, region: 'EUW1' });
  assert.equal(registros.length, 1);
});

test('el aviso de Riot solo vale con un código nuestro y su firma', async () => {
  const { t } = montar({ riot: riotFalso() });
  const c = await t.generar('J1-1');
  assert.equal((await t.aviso({ shortCode: c.codigo, metaData: JSON.stringify({ p: 'J1-1', f: 'falsa' }), gameId: 1 })).ok, false);
  assert.equal((await t.aviso({ shortCode: 'OTRO', metaData: JSON.stringify({ p: 'J1-1', f: t.firma('J1-1') }), gameId: 1 })).ok, false);
  const bien = await t.aviso({ shortCode: c.codigo, metaData: JSON.stringify({ p: 'J1-1', f: t.firma('J1-1') }), gameId: 7000000001, region: 'EUW1' });
  assert.equal(bien.ok, true);
  assert.equal(t.estado().partidos.find(p => p.id === 'J1-1').partidaRiot, 'EUW1_7000000001');
});

test('filasDePartida: sin plantillas conocidas se quedan los lados del calendario', () => {
  const f = filasDePartida(PARTIDA, { azul: 'ATSUI', rojo: 'SARU' });
  assert.equal(f.invertido, false);
  assert.equal(f.ganador, 'SARU');
  assert.equal(f.porClan.ATSUI.length, 5);
});

test('los cambios de horario se guardan y se pueden quitar', async () => {
  const { t, guardado } = montar({ conRiot: false });
  await t.cambiarHorario('J1-3', { fecha: '2026-11-16', hora: '19:00' });
  assert.equal(JSON.parse(guardado()).horario['J1-3'].fecha, '2026-11-16');
  assert.equal(t.estado().partidos.at(-2).id, 'J1-3');
  await assert.rejects(t.cambiarHorario('J1-3', { hora: '7pm' }));
  await t.cambiarHorario('J1-3', {});
  assert.equal(t.estado().partidos.find(p => p.id === 'J1-3').cambiado, false);
});

test('códigos de Toornament: se pegan de golpe, mandan sobre la sala y se entregan como código de torneo', async () => {
  const dc = discordFalso({ miembros: [] });
  const { t } = montar({ conRiot: false, discord: dc });
  await t.guardarDrafts('J1-2', { azul: 'https://lol.draftcore.net/A2', rojo: 'https://lol.draftcore.net/R2' });
  await t.generar('J1-3');   // tenía sala
  const r = await t.pegarCodigos([
    'J1-2 EUW05124-3235db14-5b33-405a-ba4d-009f5f3dc672',
    'J1-3 EUW05124-b8ec0f0a-0624-4198-8805-d4d6dd1e3690',
    'J1-1 esto-no',
    'J9-9 EUW05124-00000000-0000-0000-0000-000000000000',
  ].join('\n'));
  assert.deepEqual(r.hechos, ['J1-2', 'J1-3']);
  assert.equal(r.errores.length, 2);
  assert.deepEqual(t.ver('J1-3'), { modo: 'externo', codigo: 'EUW05124-b8ec0f0a-0624-4198-8805-d4d6dd1e3690', sala: null, drafts: null });
  assert.equal(t.ver('J1-2').drafts.azul, 'https://lol.draftcore.net/A2');   // los drafts se quedan
  assert.equal(t.estado().partidos.find(p => p.id === 'J1-2').modoCodigo, 'externo');
  assert.equal(JSON.stringify(t.estado()).includes('EUW05124'), false);
  // «Generar» no lo pisa
  assert.equal((await t.generar('J1-2')).codigo, 'EUW05124-3235db14-5b33-405a-ba4d-009f5f3dc672');
  await t.entregar('J1-2');
  const msg = dc.llamadas.find(l => l.ruta === '/channels/hilo-1/messages').cuerpo.embeds[0].description;
  assert.match(msg, /Código de torneo:\*\*\n```\nEUW05124-3235db14/);
  assert.doesNotMatch(msg, /Sala personalizada/);
  assert.equal((await t.resultado('J1-2')).ok, false);
});

test('entrega por los chats privados de las familias: cada una recibe el código y solo su draft, con su rol nombrado', async () => {
  const dc = discordFalso({ fallaMiembros: true });
  dc.d.chatFamilia = c => `chat-${c}`;
  const { t } = montar({ conRiot: false, discord: dc });
  await t.guardarDrafts('J1-1', { azul: 'https://lol.draftcore.net/AZUL1', rojo: 'https://lol.draftcore.net/ROJO1', espectador: 'https://lol.draftcore.net/ESPE1' });
  await t.pegarCodigos('J1-1 EUW05124-11111111-2222-3333-4444-555555555555');
  const r = await t.entregar('J1-1');
  assert.equal(r.ok, true);
  assert.equal(r.chats, 2);
  assert.equal(r.aviso, null);
  assert.equal(dc.llamadas.some(l => l.ruta.endsWith('/threads') || l.ruta.includes('/members')), false);
  const azul = dc.llamadas.find(l => l.ruta === '/channels/chat-KEMONO/messages').cuerpo;
  const rojo = dc.llamadas.find(l => l.ruta === '/channels/chat-BUSHI/messages').cuerpo;
  assert.equal(azul.content, '<@&rol-KEMONO>');
  assert.deepEqual(azul.allowed_mentions, { parse: [], roles: ['rol-KEMONO'] });
  assert.match(azul.embeds[0].description, /EUW05124-11111111/);
  assert.match(azul.embeds[0].description, /AZUL1/);
  assert.doesNotMatch(azul.embeds[0].description, /ROJO1|ESPE1/);
  assert.match(rojo.embeds[0].description, /ROJO1/);
  assert.doesNotMatch(rojo.embeds[0].description, /AZUL1|ESPE1/);
});
