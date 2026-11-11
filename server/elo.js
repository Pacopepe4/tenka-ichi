// El elo en número (Hierro IV = 0 … Challenger = 36), para equilibrar inhouses y valorar jugadores. Entiende «Platino II»,
// «plat 2», «D4», «Emerald 1», «Gold II» (el rango que da WhatIsMyMMR)…
const sinTildes = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const TIERS = [[/^(hierro|iron|i)$/, 0], [/^(bronce|bronze|b)$/, 4], [/^(plata|silver|s)$/, 8], [/^(oro|gold|g)$/, 12], [/^(platino|plat|platinum|p)$/, 16],
  [/^(esmeralda|emerald|e)$/, 20], [/^(diamante|diamond|dia|d)$/, 24], [/^(master|maestro|m)$/, 28], [/^(grandmaster|gm|gran maestro)$/, 32], [/^(challenger|aspirante|chall|c)$/, 36]];
const DIVISION = { iv: 0, 4: 0, iii: 1, 3: 1, ii: 2, 2: 2, i: 3, 1: 3 };
export function eloNumero(texto) {
  const t = sinTildes(texto).replace(/[^a-z0-9 ]/g, ' ').trim();
  const m = /^([a-z]+(?: maestro)?)\s*([iv]+|[1-4])?\b/.exec(t) || /^([a-z])([1-4])$/.exec(t.replace(/\s+/g, ''));
  if (!m) return 12;   // si no se entiende, como un oro
  const tier = TIERS.find(([r]) => r.test(m[1]));
  if (!tier) return 12;
  return tier[1] + (tier[1] >= 28 ? 0 : (DIVISION[m[2]] ?? 0));
}
