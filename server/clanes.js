// Familias de GOKUDŌ (antes clanes de Tenka Ichi): datos fijos de marca (nombre, kanji, color, logo en public/logos/<ID>.png,
// arte en public/clanes/<ID>.jpg). El lema, la descripción y los jugadores viven en la pestaña
// "Plantillas" de Google Sheets (ver plantillas.js); aquí están los valores iniciales.
// - legacy: equipo de la organización que lo conserva todo (logo, arte, lema, plantilla) pero está apartado de la
//   competición: no entra en el sorteo ni en la tier list, así que tampoco tiene cartas ni puntúa en el fantasy.
// - invitado: no es un clan (un rival de fuera o un hueco por decidir); solo sirve para ponerlo en el overlay.
// Desde el 07/11/2026 cada clan es una familia de Gokudō (la del mismo color, como en data-proyecto/familias.json).
// El id se queda igual (ATSUI, TORA…) porque con él están guardadas en la hoja las plantillas, la tier list, las cartas
// y las colecciones del gachapon; lo que se ve (nombre, kanji, color, logo y arte) ya es el de la familia.
// Desde el 29/10/2026 juegan seis clanes; KAMIKAZE, KURU, DORAGON, RAIJIN, KANJI y CHIRU ya no están (sus logos y su
// arte siguen en public/logos y public/clanes por si vuelven).
export const CLANES = [
  { id: 'SARU', nombre: 'Tsuki', kanji: '月', color: '#A9722F', texto: '#D19A52', lema: 'Los lobos de la luna',
    descripcion: 'Cazan de noche y en manada. Nadie los ve llegar hasta que la luna ya está encima.' },
  { id: 'KAIJU', nombre: 'Yasha', kanji: '夜叉', color: '#5FA341', texto: '#78BF58', lema: 'Los demonios guardianes',
    descripcion: 'Guardan su calle como un templo. Quien entra sin permiso no vuelve a salir igual.' },
  { id: 'KEMONO', nombre: 'Tengu', kanji: '天狗', color: '#2E6B45', texto: '#5FA876', lema: 'Los espíritus de la montaña',
    descripcion: 'Bajan de la montaña cuando quieren. Orgullosos, rápidos y siempre un paso por encima.' },
  { id: 'ATSUI', nombre: 'Ryūjin', kanji: '竜神', color: '#39C6F0', texto: '#39C6F0', lema: 'El dios dragón del mar',
    descripcion: 'Dueños del puerto y de la marea. Su fuerza llega como el oleaje: sin avisar y sin parar.' },
  { id: 'TORA', nombre: 'Byakko', kanji: '白虎', color: '#EE7B2B', texto: '#EE7B2B', lema: 'Los tigres blancos',
    descripcion: 'Guardianes del oeste. Pacientes y orgullosos: acechan en silencio y atacan cuando ya es tarde para huir.' },
  { id: 'BUSHI', nombre: 'Akuma', kanji: '悪魔', color: '#C1272D', texto: '#E5484E', lema: 'Los demonios rojos',
    descripcion: 'La familia más temida del barrio. No negocian: golpean primero y preguntan después.' },
  { id: 'AMATERATSU', nombre: 'Shinigami', kanji: '死神', color: '#EBD28A', texto: '#EBD28A', lema: 'Los dioses de la muerte',
    descripcion: 'Los veteranos de la organización. Ya no compiten: vigilan desde la sombra a quien se atreva a reinar.', legacy: true },
  { id: 'NEGROCLARO', nombre: 'Negroclaro', kanji: '', color: '#9A917C', texto: '#E0D7CA', lema: '', descripcion: '', invitado: true },
  { id: 'NONAME', nombre: 'Por decidir', kanji: '', color: '#9A917C', texto: '#E0D7CA', lema: '', descripcion: '', invitado: true },
];

export const ROLES = ['TOP', 'JUNGLA', 'MEDIO', 'ADC', 'SUPPORT'];

// Los clanes que compiten en Tenka Ichi: ni los invitados ni los equipos Legacy
export const enCompeticion = c => !c.invitado && !c.legacy;

export function clan(id) {
  return CLANES.find(c => c.id === id) || CLANES[CLANES.length - 1];
}
