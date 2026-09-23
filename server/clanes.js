// Clanes de TENKA ICHI: nombre, kanji, color de marca y logo (public/logos/<ID>.png)
export const CLANES = [
  { id: 'SARU', nombre: 'Saru', kanji: '猿', color: '#A9722F', texto: '#D19A52' },
  { id: 'KAMIKAZE', nombre: 'Kamikaze', kanji: '神風', color: '#E3B23C', texto: '#E3B23C' },
  { id: 'KURU', nombre: 'Kuru', kanji: '来', color: '#9B59D0', texto: '#B584E0' },
  { id: 'DORAGON', nombre: 'Doragon', kanji: '龍', color: '#1F5FA8', texto: '#5C95DB' },
  { id: 'ATSUI', nombre: 'Atsui', kanji: '熱', color: '#39C6F0', texto: '#39C6F0' },
  { id: 'RAIJIN', nombre: 'Raijin', kanji: '雷神', color: '#F2D024', texto: '#F2D024' },
  { id: 'KAIJU', nombre: 'Kaiju', kanji: '怪獣', color: '#5FA341', texto: '#78BF58' },
  { id: 'KEMONO', nombre: 'Kemono', kanji: '獣', color: '#2E6B45', texto: '#5FA876' },
  { id: 'TORA', nombre: 'Tora', kanji: '虎', color: '#EE7B2B', texto: '#EE7B2B' },
  { id: 'KANJI', nombre: 'Kanji', kanji: '漢字', color: '#E0348B', texto: '#E8559E' },
  { id: 'CHIRU', nombre: 'Chiru', kanji: '散', color: '#5B3FA0', texto: '#9A82E0' },
  { id: 'BUSHI', nombre: 'Bushi', kanji: '武士', color: '#C1272D', texto: '#E5484E' },
  { id: 'AMATERATSU', nombre: 'Amateratsu', kanji: '天照', color: '#D9D3C7', texto: '#D9C58A' },
  { id: 'NEGROCLARO', nombre: 'Negroclaro', kanji: '', color: '#9A917C', texto: '#E0D7CA' },
  { id: 'NONAME', nombre: 'Por decidir', kanji: '', color: '#9A917C', texto: '#E0D7CA' },
];

export const ROLES = ['TOP', 'JUNGLA', 'MEDIO', 'ADC', 'SUPPORT'];

export function clan(id) {
  return CLANES.find(c => c.id === id) || CLANES[CLANES.length - 1];
}
