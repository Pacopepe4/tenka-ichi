// La valoración de cada jugador, para ordenar los rivales de scrims por nivel parecido y para equilibrar las inhouses
// (lo pidió Pacopepe el 11/11/2026: «que se base en el MMR, no en el elo»; «MMR si lo hay»). Por orden:
//   1. El MMR de ranked estimado por WhatIsMyMMR.com (API pública, CC BY 4.0: hay que citarlos; 60 consultas por minuto;
//      User-Agent propio). Solo lo tienen de quien ha jugado solo ranked hace poco y ya está en su base.
//   2. El rango oficial de SoloQ con la API de Riot (RIOT_API_KEY, clave personal). No calculamos ningún MMR: Riot lo
//      prohíbe («alternatives … include MMR or ELO calculators»); solo se usa su rango tal cual.
//   3. El elo que declara el propio jugador.
// Todo se pasa a la misma escala: Hierro IV = 0 … Diamante I = 27, Master 28+ (más los LP). Se guarda 6 horas.
import { eloNumero } from './elo.js';

const UA_WIMM = 'Node:es.gokudo.srdirector:v1.0';
const CACHE_MS = 6 * 3600 * 1000;
export const NOMBRES_TIER = ['Hierro', 'Bronce', 'Plata', 'Oro', 'Platino', 'Esmeralda', 'Diamante', 'Master', 'Grandmaster', 'Challenger'];
const TIER_RIOT = { IRON: 0, BRONZE: 4, SILVER: 8, GOLD: 12, PLATINUM: 16, EMERALD: 20, DIAMOND: 24, MASTER: 28, GRANDMASTER: 32, CHALLENGER: 36 };
const DIV_RIOT = { IV: 0, III: 1, II: 2, I: 3 };

// El valor en texto: «Platino II», «Master»…
export function nombreDeValor(v) {
  if (v == null) return '¿?';
  const t = Math.max(0, Math.min(36, Math.floor(v)));
  if (t >= 28) return NOMBRES_TIER[t >= 36 ? 9 : t >= 32 ? 8 : 7];
  return `${NOMBRES_TIER[Math.floor(t / 4)]} ${['IV', 'III', 'II', 'I'][t % 4]}`;
}

// Riot IDs («Nombre#TAG») en un texto: enlaces de op.gg (multi o de un perfil) y «Nombre#TAG» sueltos
export function riotIdsDe(texto) {
  const ids = [];
  const s = String(texto || '');
  for (const m of s.matchAll(/op\.gg\/[^\s)]*multisearch[^\s)]*[?&]summoners=([^\s&)]+)/gi)) {
    for (const parte of decodeURIComponent(m[1].replace(/\+/g, ' ')).split(',')) ids.push(parte.trim().replace(/-([^-]+)$/, '#$1'));
  }
  for (const m of s.matchAll(/op\.gg\/(?:[a-z]{2}\/)?(?:lol\/)?summoners\/[a-z]+\/([^\s/?)]+)/gi)) ids.push(decodeURIComponent(m[1]).replace(/-([^-]+)$/, '#$1'));
  const sinEnlaces = s.replace(/https?:\/\/\S+/g, ' ');
  // Sueltos, sin espacios en el nombre (en un texto no se sabe dónde empieza; los que llevan espacios, por op.gg)
  for (const m of sinEnlaces.matchAll(/(?:^|[\s,;(:])([\p{L}\p{N}._]{2,16})#([\p{L}\p{N}]{2,5})(?=$|[\s,;).])/gu)) ids.push(`${m[1]}#${m[2]}`);
  return [...new Set(ids.filter(x => /^.{2,16}#[\p{L}\p{N}]{2,5}$/u.test(x)))].slice(0, 10);
}

export function crearValoracion({ pedir = fetch, claveRiot = process.env.RIOT_API_KEY, ahora = () => Date.now(), espera = 1100, dormir = ms => new Promise(r => setTimeout(r, ms)), log = console } = {}) {
  const cache = new Map();   // riotId en minúsculas → { cuando, v }
  // Una cola por servicio, para no pasar de sus límites (WhatIsMyMMR: 60/min; Riot personal: 100 cada 2 min)
  const colas = { wimm: Promise.resolve(), riot: Promise.resolve() };
  const enCola = (q, fn) => { const p = colas[q].then(async () => { try { return await fn(); } finally { await dormir(espera); } }); colas[q] = p.catch(() => {}); return p; };

  async function mmr(riotId) {
    return enCola('wimm', async () => {
      const r = await pedir(`https://euw.whatismymmr.com/api/v1/summoner?name=${encodeURIComponent(riotId)}`, { headers: { 'User-Agent': UA_WIMM }, signal: AbortSignal.timeout(10_000) });
      const j = await r.json().catch(() => null);
      const k = j?.ranked;
      if (!r.ok || !k || k.avg == null) return null;
      const v = eloNumero(k.closestRank || '');
      return { v, fuente: 'mmr', texto: `MMR ≈ ${Math.round(k.avg)}${k.err ? ` ±${Math.round(k.err)}` : ''} (${k.closestRank || nombreDeValor(v)})` };
    });
  }

  async function rangoRiot(riotId) {
    if (!claveRiot) return null;
    const [nombre, tag] = riotId.split('#');
    const cab = { headers: { 'X-Riot-Token': claveRiot }, signal: AbortSignal.timeout(10_000) };
    return enCola('riot', async () => {
      const cuenta = await pedir(`https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(nombre)}/${encodeURIComponent(tag)}`, cab);
      if (!cuenta.ok) return null;
      const { puuid } = await cuenta.json();
      const r = await pedir(`https://euw1.api.riotgames.com/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`, cab);
      if (!r.ok) return null;
      const solo = (await r.json()).find(e => e.queueType === 'RANKED_SOLO_5x5');
      if (!solo) return { v: null, fuente: 'riot', texto: 'sin clasificar en SoloQ' };
      const base = TIER_RIOT[solo.tier] ?? 12;
      const v = base + (base >= 28 ? Math.min(8, solo.leaguePoints / 250) : (DIV_RIOT[solo.rank] ?? 0) + solo.leaguePoints / 100);
      return { v, fuente: 'riot', texto: `${nombreDeValor(v)} · ${solo.leaguePoints} LP (rango de Riot)` };
    });
  }

  // La valoración de un jugador: { v, fuente: mmr | riot | elo | ninguna, texto }
  async function valorar(riotId, eloDeclarado = '') {
    const clave = String(riotId || '').toLowerCase();
    if (clave && cache.has(clave) && ahora() - cache.get(clave).cuando < CACHE_MS) return cache.get(clave).v;
    let v = null;
    if (riotId) {
      try { v = await mmr(riotId); } catch (e) { log.error('Valoración: WhatIsMyMMR:', e.message); }
      if (!v || v.v == null) { try { v = (await rangoRiot(riotId)) || v; } catch (e) { log.error('Valoración: Riot:', e.message); } }
    }
    if (!v || v.v == null) {
      v = eloDeclarado ? { v: eloNumero(eloDeclarado), fuente: 'elo', texto: `${eloDeclarado} (declarado)` } : { v: null, fuente: 'ninguna', texto: 'sin datos' };
    }
    if (clave) cache.set(clave, { cuando: ahora(), v });
    return v;
  }

  // La de un equipo: la media de los que tienen valor
  async function valorarEquipo(riotIds) {
    const vs = [];
    for (const id of riotIds.slice(0, 10)) vs.push(await valorar(id));
    const con = vs.filter(x => x.v != null);
    if (!con.length) return null;
    const media = con.reduce((s, x) => s + x.v, 0) / con.length;
    return { v: media, texto: nombreDeValor(media), jugadores: con.length, mmr: con.filter(x => x.fuente === 'mmr').length };
  }

  return { valorar, valorarEquipo };
}

// La cita que pide la licencia de WhatIsMyMMR y el aviso que pide Riot
export const CITA = 'MMR estimado por WhatIsMyMMR.com · SrDirector no está respaldado por Riot Games';
