// Clanes de TENKA ICHI: datos fijos de marca (nombre, kanji, color, logo en public/logos/<ID>.png,
// arte en public/clanes/<ID>.jpg). El lema, la descripción y los jugadores viven en la pestaña
// "Plantillas" de Google Sheets (ver plantillas.js); aquí están los valores iniciales.
export const CLANES = [
  { id: 'SARU', nombre: 'Saru', kanji: '猿', color: '#A9722F', texto: '#D19A52', lema: 'El Rey Mono',
    descripcion: 'Fuerza y agilidad infinitas. Arrogante: lucha por diversión, no por honor.' },
  { id: 'KAMIKAZE', nombre: 'Kamikaze', kanji: '神風', color: '#E3B23C', texto: '#E3B23C', lema: 'El Samurái del Viento',
    descripcion: 'Corte huracanado. Estoico: máximo impacto con el mínimo esfuerzo.' },
  { id: 'KURU', nombre: 'Kuru', kanji: '来', color: '#9B59D0', texto: '#B584E0', lema: 'El Samurái del Tiempo',
    descripcion: 'Fallas temporales. Manipula pasado y futuro. Campeón de los desafíos anteriores.' },
  { id: 'DORAGON', nombre: 'Doragon', kanji: '龍', color: '#1F5FA8', texto: '#5C95DB', lema: 'El Samurái del Dragón',
    descripcion: 'Furia azul del dragón. Disciplinado y frío: nadie ha roto su defensa.' },
  { id: 'ATSUI', nombre: 'Atsui', kanji: '熱', color: '#39C6F0', texto: '#39C6F0', lema: 'El Samurái del Fuego Azul',
    descripcion: 'Llama pura. Rápido y pasional: su fuego consume energía, no carne.' },
  { id: 'RAIJIN', nombre: 'Raijin', kanji: '雷神', color: '#F2D024', texto: '#F2D024', lema: 'El Samurái del Rayo',
    descripcion: 'El rayo sin control. Más potencia bruta que ningún otro clan.' },
  { id: 'KAIJU', nombre: 'Kaiju', kanji: '怪獣', color: '#5FA341', texto: '#78BF58', lema: 'El Samurái Berserker',
    descripcion: 'Transformación bestial. Su fuerza crece con cada golpe que recibe.' },
  { id: 'KEMONO', nombre: 'Kemono', kanji: '獣', color: '#2E6B45', texto: '#5FA876', lema: 'El Rey de las Bestias',
    descripcion: 'Mimetismo animal. Astucia, camuflaje y hambre.' },
  { id: 'TORA', nombre: 'Tora', kanji: '虎', color: '#EE7B2B', texto: '#EE7B2B', lema: 'El Samurái Tigre',
    descripcion: 'Garras de espíritu. Orgulloso y felino: ataca solo con ventaja.' },
  { id: 'KANJI', nombre: 'Kanji', kanji: '漢字', color: '#E0348B', texto: '#E8559E', lema: 'El Samurái de las Runas',
    descripcion: 'Sello mágico. Trampas y conjuros rúnicos: el mejor cerebro del torneo.' },
  { id: 'CHIRU', nombre: 'Chiru', kanji: '散', color: '#5B3FA0', texto: '#9A82E0', lema: 'El Samurái Calmado',
    descripcion: 'Meditación defensiva. Anula la intención de cada ataque.' },
  { id: 'BUSHI', nombre: 'Bushi', kanji: '武士', color: '#C1272D', texto: '#E5484E', lema: 'El Rey Guerrero',
    descripcion: 'Aura de guerra y dominio técnico absoluto. Combate tradicional puro.' },
  { id: 'AMATERATSU', nombre: 'Amateratsu', kanji: '天照', color: '#D9D3C7', texto: '#D9C58A', lema: 'La Reina del Sol',
    descripcion: 'Luz y fuego negro. Busca vencer en equilibrio, nunca por la espalda.' },
  { id: 'NEGROCLARO', nombre: 'Negroclaro', kanji: '', color: '#9A917C', texto: '#E0D7CA', lema: '', descripcion: '', invitado: true },
  { id: 'NONAME', nombre: 'Por decidir', kanji: '', color: '#9A917C', texto: '#E0D7CA', lema: '', descripcion: '', invitado: true },
];

export const ROLES = ['TOP', 'JUNGLA', 'MEDIO', 'ADC', 'SUPPORT'];

export function clan(id) {
  return CLANES.find(c => c.id === id) || CLANES[CLANES.length - 1];
}
