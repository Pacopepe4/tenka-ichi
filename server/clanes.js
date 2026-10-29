// Clanes de TENKA ICHI: datos fijos de marca (nombre, kanji, color, logo en public/logos/<ID>.png,
// arte en public/clanes/<ID>.jpg). El lema, la descripción y los jugadores viven en la pestaña
// "Plantillas" de Google Sheets (ver plantillas.js); aquí están los valores iniciales.
// - legacy: equipo de la organización que lo conserva todo (logo, arte, lema, plantilla) pero está apartado de la
//   competición: no entra en el sorteo ni en la tier list, así que tampoco tiene cartas ni puntúa en el fantasy.
// - invitado: no es un clan (un rival de fuera o un hueco por decidir); solo sirve para ponerlo en el overlay.
// Desde el 29/10/2026 juegan seis clanes; KAMIKAZE, KURU, DORAGON, RAIJIN, KANJI y CHIRU ya no están (sus logos y su
// arte siguen en public/logos y public/clanes por si vuelven).
export const CLANES = [
  { id: 'SARU', nombre: 'Saru', kanji: '猿', color: '#A9722F', texto: '#D19A52', lema: 'El Rey Mono',
    descripcion: 'Fuerza y agilidad infinitas. Arrogante: lucha por diversión, no por honor.' },
  { id: 'KAIJU', nombre: 'Kaiju', kanji: '怪獣', color: '#5FA341', texto: '#78BF58', lema: 'El Samurái Berserker',
    descripcion: 'Transformación bestial. Su fuerza crece con cada golpe que recibe.' },
  { id: 'KEMONO', nombre: 'Kemono', kanji: '獣', color: '#2E6B45', texto: '#5FA876', lema: 'El Rey de las Bestias',
    descripcion: 'Mimetismo animal. Astucia, camuflaje y hambre.' },
  { id: 'ATSUI', nombre: 'Atsui', kanji: '熱', color: '#39C6F0', texto: '#39C6F0', lema: 'El Samurái del Fuego Azul',
    descripcion: 'Llama pura. Rápido y pasional: su fuego consume energía, no carne.' },
  { id: 'TORA', nombre: 'Tora', kanji: '虎', color: '#EE7B2B', texto: '#EE7B2B', lema: 'El Samurái Tigre',
    descripcion: 'Garras de espíritu. Orgulloso y felino: ataca solo con ventaja.' },
  { id: 'BUSHI', nombre: 'Bushi', kanji: '武士', color: '#C1272D', texto: '#E5484E', lema: 'El Rey Guerrero',
    descripcion: 'Aura de guerra y dominio técnico absoluto. Combate tradicional puro.' },
  { id: 'AMATERATSU', nombre: 'Amateratsu', kanji: '天照', color: '#D9D3C7', texto: '#D9C58A', lema: 'La Reina del Sol',
    descripcion: 'Luz y fuego negro. Busca vencer en equilibrio, nunca por la espalda.', legacy: true },
  { id: 'NEGROCLARO', nombre: 'Negroclaro', kanji: '', color: '#9A917C', texto: '#E0D7CA', lema: '', descripcion: '', invitado: true },
  { id: 'NONAME', nombre: 'Por decidir', kanji: '', color: '#9A917C', texto: '#E0D7CA', lema: '', descripcion: '', invitado: true },
];

export const ROLES = ['TOP', 'JUNGLA', 'MEDIO', 'ADC', 'SUPPORT'];

// Los clanes que compiten en Tenka Ichi: ni los invitados ni los equipos Legacy
export const enCompeticion = c => !c.invitado && !c.legacy;

export function clan(id) {
  return CLANES.find(c => c.id === id) || CLANES[CLANES.length - 1];
}
