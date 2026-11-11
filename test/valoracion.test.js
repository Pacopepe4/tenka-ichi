// La valoración de cada jugador: MMR de WhatIsMyMMR si lo hay, si no el rango de Riot, si no el elo declarado.
// WhatIsMyMMR y Riot son de mentira (no se toca internet).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearValoracion, riotIdsDe, nombreDeValor } from '../server/valoracion.js';

function servicios({ mmr = {}, riot = {} } = {}) {
  const llamadas = [];
  const pedir = async (url, opciones) => {
    llamadas.push({ url, cabeceras: opciones?.headers || {} });
    const u = new URL(url);
    const json = (estado, cuerpo) => ({ ok: estado < 400, status: estado, json: async () => cuerpo });
    if (u.host === 'euw.whatismymmr.com') {
      const d = mmr[u.searchParams.get('name').toLowerCase()];
      return d ? json(200, { ranked: d }) : json(404, { error: { message: 'Summoner is not on record.', code: 100 } });
    }
    if (u.host === 'europe.api.riotgames.com') {
      const [, nombre, tag] = /by-riot-id\/([^/]+)\/([^/]+)$/.exec(u.pathname);
      const id = `${decodeURIComponent(nombre)}#${decodeURIComponent(tag)}`.toLowerCase();
      return riot[id] ? json(200, { puuid: `p-${id}` }) : json(404, {});
    }
    if (u.host === 'euw1.api.riotgames.com') {
      const id = decodeURIComponent(/by-puuid\/p-(.+)$/.exec(u.pathname)[1]);
      return json(200, riot[id] || []);
    }
    return json(404, {});
  };
  return { pedir, llamadas };
}

test('Riot IDs de un texto: multi de op.gg, perfil de op.gg y «Nombre#TAG» sueltos', () => {
  assert.deepEqual(riotIdsDe('equipo: https://op.gg/es/lol/multisearch/euw?summoners=KingKai%23EzTop%2CJ%20Lgend-0000 y Lolex#Lolex. Perfil https://op.gg/lol/summoners/euw/Hikigaayaa-YUKNO'),
    ['KingKai#EzTop', 'J Lgend#0000', 'Hikigaayaa#YUKNO', 'Lolex#Lolex']);
  assert.deepEqual(riotIdsDe('scrim 20:00 dm @capi'), []);
  assert.equal(nombreDeValor(18.4), 'Platino II');
  assert.equal(nombreDeValor(30), 'Master');
});

test('primero el MMR de WhatIsMyMMR (con su User-Agent); si no lo tiene, el rango de Riot; si no, el elo declarado', async () => {
  const { pedir, llamadas } = servicios({
    mmr: { 'alto#euw': { avg: 2510, err: 60, closestRank: 'Diamond II' } },
    riot: { 'medio#euw': [{ queueType: 'RANKED_FLEX_SR', tier: 'GOLD', rank: 'I', leaguePoints: 10 }, { queueType: 'RANKED_SOLO_5x5', tier: 'EMERALD', rank: 'III', leaguePoints: 50 }] },
  });
  const val = crearValoracion({ pedir, claveRiot: 'clave-falsa', espera: 0, log: { error: () => {} } });
  const alto = await val.valorar('Alto#EUW');
  assert.deepEqual([alto.v, alto.fuente], [26, 'mmr']);
  assert.match(alto.texto, /^MMR ≈ 2510 ±60 \(Diamond II\)$/);
  assert.match(llamadas[0].cabeceras['User-Agent'], /^Node:es\.gokudo\.srdirector:v/);
  const medio = await val.valorar('Medio#EUW');
  assert.deepEqual([medio.v, medio.fuente], [21.5, 'riot'], 'Esmeralda III con 50 LP');
  assert.match(medio.texto, /Esmeralda III · 50 LP \(rango de Riot\)/);
  assert.equal(llamadas.find(l => l.url.includes('riotgames')).cabeceras['X-Riot-Token'], 'clave-falsa');
  const nadie = await val.valorar('Nadie#EUW', 'Plata II');
  assert.deepEqual([nadie.v, nadie.fuente], [10, 'elo']);
  const antes = llamadas.length;
  await val.valorar('alto#euw');
  assert.equal(llamadas.length, antes, 'se guarda 6 horas');
});

test('sin clave de Riot no se le pregunta; el equipo es la media de los que tienen valor', async () => {
  const { pedir, llamadas } = servicios({ mmr: { 'a#euw': { avg: 1500, closestRank: 'Gold IV' }, 'b#euw': { avg: 1700, closestRank: 'Platinum IV' } } });
  const val = crearValoracion({ pedir, claveRiot: '', espera: 0, log: { error: () => {} } });
  const eq = await val.valorarEquipo(['A#EUW', 'B#EUW', 'C#EUW']);
  assert.deepEqual([eq.v, eq.texto, eq.jugadores, eq.mmr], [14, 'Oro II', 2, 2]);
  assert.ok(!llamadas.some(l => l.url.includes('riotgames')));
  assert.equal(await val.valorarEquipo(['C#EUW']), null);
});
