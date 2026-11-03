// Enlaces de DraftCore creados por adelantado (sin red: un DraftCore de mentira)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearDraft, crearEnlaces, porCrear, claveEnlace } from '../server/enlaces-draft.js';

function draftcoreFalso() {
  let n = 0;
  const pedidos = [];
  const pedir = async (url, o) => {
    pedidos.push({ url, cuerpo: JSON.parse(o.body), origin: o.headers.Origin });
    n++;
    return { ok: true, status: 201, json: async () => ({ draft: { id: `D${n}` }, links: { id: `D${n}`, team1: `A${n}`, team2: `R${n}`, admin: `G${n}`, stream: `S${n}` } }) };
  };
  return { pedir, pedidos };
}

test('crearDraft manda los dos equipos y devuelve los enlaces de cada uno', async () => {
  const dc = draftcoreFalso();
  const l = await crearDraft({ azul: { nombre: 'KEMONO', tag: 'KEMO', jugadores: ['Jaavaa', 'Vaskoñito'] }, rojo: { nombre: 'SARU' }, anteriores: ['X1'] }, { pedir: dc.pedir });
  assert.match(dc.pedidos[0].url, /\/drafts\/v2$/);
  const c = dc.pedidos[0].cuerpo;
  assert.equal(c.blueTeam.name, 'KEMONO');
  assert.equal(c.blueTeam.top, 'Jaavaa');
  assert.equal(c.blueTeam.jungle, 'Vaskoñito');
  assert.equal(c.redTeam.name, 'SARU');
  assert.equal(c.settings.fearless, true);
  assert.deepEqual(c.settings.fearlessPreviousDrafts, ['X1']);
  assert.deepEqual(l, { id: 'D1', azul: 'https://lol.draftcore.net/A1', rojo: 'https://lol.draftcore.net/R1', espectador: 'https://lol.draftcore.net/D1',
    stream: 'https://lol.draftcore.net/S1', gestor: 'https://lol.draftcore.net/G1' });
});

test('crearDraft avisa si DraftCore no los crea', async () => {
  await assert.rejects(crearDraft({ azul: {}, rojo: {} }, { pedir: async () => ({ ok: false, status: 429 }) }), /429/);
  await assert.rejects(crearDraft({ azul: {}, rojo: {} }, { pedir: async () => ({ ok: true, json: async () => ({}) }) }), /enlaces/);
});

test('precrear: una vez por partida, guardado, y la segunda de una serie lleva la primera (fearless)', async () => {
  const dc = draftcoreFalso();
  let guardado = null;
  const enl = crearEnlaces({ guardar: v => { guardado = v; }, crear: d => crearDraft(d, { pedir: dc.pedir }), equipo: id => ({ nombre: id }) });
  const lista = [{ jornada: 'Jornada 1', azul: 'SARU', rojo: 'KAIJU', partida: 1 }, { jornada: 'Jornada 1', azul: 'TORA', rojo: 'BUSHI', partida: 1 }];
  assert.deepEqual(await enl.precrear(lista), { total: 2, creados: 2, fallos: 0, error: null });
  assert.deepEqual(await enl.precrear(lista), { total: 2, creados: 0, fallos: 0, error: null }, 'no se repiten');
  assert.equal(dc.pedidos.length, 2);
  assert.equal(enl.buscar(lista[0]).azul, 'https://lol.draftcore.net/A1');
  // A la vez, el mismo draft solo se pide una vez
  const p2 = { jornada: 'Cuartos', azul: 'SARU', rojo: 'KAIJU', partida: 2 };
  await enl.asegurar({ ...p2, partida: 1 });
  const [a, b] = await Promise.all([enl.asegurar(p2), enl.asegurar(p2)]);
  assert.equal(a.id, b.id);
  assert.deepEqual(dc.pedidos.at(-1).cuerpo.settings.fearlessPreviousDrafts, ['D3']);
  // Tras un reinicio siguen ahí
  const otra = crearEnlaces({ leer: () => guardado });
  assert.equal(otra.buscar(p2).id, a.id);
  assert.ok(otra.olvidar(claveEnlace(p2)));
  assert.equal(otra.buscar(p2), null);
});

test('porCrear: liga por jugar, desempate y la primera de cada serie de playoffs con los dos clanes', () => {
  const comp = {
    calendario: { jornadas: [[{ id: 'c1', jornada: 1, azul: 'SARU', rojo: 'KAIJU' }, { id: 'c2', jornada: 1, azul: 'TORA', rojo: 'BUSHI' }]] },
    clasificacion: { resultados: { c1: { ganador: 'SARU' } }, desempate: null },
    cuadro: { cuartos: [{ ronda: 'Cuartos', alto: 'ATSUI', bajo: 'KEMONO', siguiente: { partida: 1, eligeLado: 'ATSUI' } }, { ronda: 'Cuartos', alto: null, bajo: 'SARU', siguiente: { partida: 1 } }],
      semis: [], final: { ronda: 'Final', alto: 'TORA', bajo: 'KAIJU', siguiente: { partida: 2, eligeLado: 'KAIJU' } } },
  };
  assert.deepEqual(porCrear(comp), [
    { jornada: 'Jornada 1', azul: 'TORA', rojo: 'BUSHI', partida: 1 },
    { jornada: 'Cuartos', azul: 'ATSUI', rojo: 'KEMONO', partida: 1 },
  ]);
  assert.deepEqual(porCrear({}), []);
});
