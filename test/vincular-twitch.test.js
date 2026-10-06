// Twitch vinculado a la cuenta del gachapon: los sobres de los puntos del canal (que Twitch da al id de Twitch de
// quien canjea) llegan a la colección de siempre de quien ha vinculado su Twitch. Todo con datos temporales.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROLES = ['TOP', 'JUNGLA', 'MEDIO', 'ADC', 'SUPPORT'];
let carpeta, g;
// Las cuentas del gachapon (entran con Discord) y sus cuentas de Twitch
const ana = { id: 'discord-1', nombre: 'Ana' }, beto = { id: 'discord-2', nombre: 'Beto' };
const twAna = { id: '2001', login: 'ana_tw' }, twBeto = { id: '2002', login: 'beto_tw' };
const canje = (twitch, n, id) => g.darSobres({ id: twitch.id, nombre: twitch.login.toUpperCase() }, n, 'canje', id);

before(async () => {
  carpeta = await mkdtemp(path.join(os.tmpdir(), 'tenka-vincular-'));
  const plantillas = JSON.parse(await readFile(path.join(RAIZ, 'data-proyecto', 'plantillas.json'), 'utf8'));
  for (const c of Object.values(plantillas)) c.jugadores = Array(5).fill('');
  plantillas.KAIJU.jugadores = ['Gojirasu', 'Kage', 'Mizuchi', 'Hayate', 'Tsuru'];
  await writeFile(path.join(carpeta, 'plantillas.json'), JSON.stringify(plantillas));
  await writeFile(path.join(carpeta, 'tierlist.json'), JSON.stringify({ equipos: {}, jugadores: Object.fromEntries(ROLES.map(r => [`KAIJU-${r}`, 'B'])) }));
  for (const [archivo, vacio] of [['boosts.json', '[]'], ['campeones.json', '{}'], ['legacy.json', '[]']]) await writeFile(path.join(carpeta, archivo), vacio);
  for (const k of Object.keys(process.env)) if (/^(GOOGLE_)/.test(k)) delete process.env[k];
  Object.assign(process.env, { CARPETA_DATOS: carpeta, ARCHIVO_PLANTILLAS: path.join(carpeta, 'plantillas.json'), ARCHIVO_BOOSTS: path.join(carpeta, 'boosts.json'),
    ARCHIVO_CAMPEONES: path.join(carpeta, 'campeones.json'), ARCHIVO_LEGACY: path.join(carpeta, 'legacy.json'), CARPETA_CARTAS: path.join(carpeta, 'cartas') });
  const { cargarPlantillas } = await import('../server/plantillas.js');
  const { cargarTierlist } = await import('../server/tierlist.js');
  g = await import('../server/gacha.js');
  await cargarPlantillas();
  await cargarTierlist();
  await g.cargarGacha();
});
after(() => rm(carpeta, { recursive: true, force: true }));

test('los canjes de un Twitch vinculado van a la cuenta de siempre, que conserva su nombre', async () => {
  await g.darAlta(ana);
  assert.equal(g.estadoUsuario(ana.id).twitch, null);
  assert.equal(await g.vincularTwitch(ana, twAna), true);
  await canje(twAna, 1, 'canje-1');
  const e = g.estadoUsuario(ana.id);
  assert.equal(e.sobres, 2 + 1, 'los dos de bienvenida y el del canje');
  assert.deepEqual(e.twitch, { login: 'ana_tw' });
  assert.equal(g.buscarUsuario('Ana')?.id, ana.id, 'sigue llamándose como en Discord');
  assert.equal(g.buscarUsuario('ANA_TW'), null, 'no hay una segunda colección a nombre de su Twitch');
  assert.deepEqual([g.resumenGacha().coleccionistas, g.resumenGacha().conTwitch], [1, 1]);
  // El mismo canje no cuenta dos veces, llegue las veces que llegue
  await canje(twAna, 1, 'canje-1');
  assert.equal(g.estadoUsuario(ana.id).sobres, 3);
});

test('lo que ese Twitch ya tenía a su nombre (canjes de antes de vincularse) se junta al vincular', async () => {
  // Beto canjea dos sobres en Twitch sin haber entrado nunca en el gachapon, y abre uno... de momento, a su id de Twitch
  await canje(twBeto, 2, 'canje-2');
  assert.equal(g.estadoUsuario(twBeto.id).sobres, 2);
  await g.abrirSobre({ id: twBeto.id, nombre: 'BETO_TW' });
  assert.equal(g.resumenGacha().coleccionistas, 2);
  // Entra con Discord y vincula su Twitch: todo pasa a su cuenta y la de Twitch desaparece
  await g.darAlta(beto);
  await g.vincularTwitch(beto, twBeto);
  const e = g.estadoUsuario(beto.id);
  assert.deepEqual([e.sobres, e.abiertos], [2 + 1, 1], 'los dos de bienvenida y el que le quedaba sin abrir');
  assert.equal(e.cartas.reduce((s, c) => s + c.cantidad, 0), 3, 'y las tres cartas del que abrió');
  assert.deepEqual(g.estadoUsuario(twBeto.id), { sobres: 0, abiertos: 0, cartas: [], twitch: null });
  assert.deepEqual([g.resumenGacha().coleccionistas, g.resumenGacha().conTwitch], [2, 2]);
});

test('vincular otra vez lo mismo no hace nada, y sin saber de quién es la cuenta de Twitch no se vincula', async () => {
  assert.equal(await g.vincularTwitch(ana, twAna), false);
  await assert.rejects(g.vincularTwitch(ana, {}), /de quién es la cuenta/);
  await assert.rejects(g.vincularTwitch(ana, null), /de quién es la cuenta/);
});

test('al desvincular, los canjes dejan de llegar; al volver a vincular, llegan los que quedaron sueltos', async () => {
  assert.equal(await g.desvincularTwitch(ana), true);
  assert.equal(g.estadoUsuario(ana.id).twitch, null);
  assert.equal(await g.desvincularTwitch(ana), false, 'ya no tenía ninguno');
  await canje(twAna, 1, 'canje-3');
  assert.equal(g.estadoUsuario(ana.id).sobres, 3, 'ese canje no es suyo');
  assert.equal(g.estadoUsuario(twAna.id).sobres, 1);
  await g.vincularTwitch(ana, twAna);
  assert.equal(g.estadoUsuario(ana.id).sobres, 4);
  assert.equal(g.resumenGacha().coleccionistas, 2);
});

test('un Twitch va a una sola cuenta y una cuenta lleva un solo Twitch: manda el último vínculo', async () => {
  // Beto vincula el Twitch que tenía Ana (ha tenido que entrar en Twitch con él): Ana se queda sin vínculo
  await g.vincularTwitch(beto, twAna);
  assert.equal(g.estadoUsuario(ana.id).twitch, null);
  assert.deepEqual(g.estadoUsuario(beto.id).twitch, { login: 'ana_tw' });
  const antes = [g.estadoUsuario(ana.id).sobres, g.estadoUsuario(beto.id).sobres];
  // Lo que canjee ese Twitch va ahora a Beto; lo del Twitch que Beto tenía antes, ya no
  await canje(twAna, 1, 'canje-4');
  await canje(twBeto, 1, 'canje-5');
  assert.deepEqual([g.estadoUsuario(ana.id).sobres, g.estadoUsuario(beto.id).sobres], [antes[0], antes[1] + 1]);
  assert.equal(g.estadoUsuario(twBeto.id).sobres, 1);
  assert.equal(g.resumenGacha().conTwitch, 1);
});

test('al volver a leer el registro (un reinicio de la web) queda todo igual', async () => {
  const foto = () => JSON.stringify([ana.id, beto.id, twAna.id, twBeto.id].map(id => g.estadoUsuario(id)).concat(g.resumenGacha()));
  const antes = foto();
  await g.cargarGacha();
  assert.equal(foto(), antes);
  // En el registro, cada vínculo es un movimiento más, con el id y el nombre de Twitch en el detalle
  const registro = JSON.parse(await readFile(path.join(carpeta, 'gacha.json'), 'utf8'));
  assert.deepEqual(registro.filter(e => e.tipo === 'vinculo').map(e => [e.id, e.detalle]),
    [[ana.id, '2001:ana_tw'], [beto.id, '2002:beto_tw'], [ana.id, ''], [ana.id, '2001:ana_tw'], [beto.id, '2001:ana_tw']]);
  assert.ok(registro.filter(e => e.tipo === 'canje').every(e => /^200[12]$/.test(e.id)), 'y cada canje, a nombre de quien lo hizo en Twitch');
});
