// Las familias de Gokudō (antes, los clanes de Tenka Ichi): datos fijos de marca. El nombre, el kanji y el color salen de
// data-proyecto/familias.json, el único sitio con ellos (también los lee el bot de Discord); allí, «clan» dice qué clan
// de Tenka Ichi es cada familia. Por dentro siguen con el id del clan (SARU, KAIJU…): con él están guardadas sus
// plantillas, tiers, cartas y resultados en la hoja, y su logo en public/logos/<ID>.png. El lema, la descripción y los
// jugadores viven en la pestaña "Plantillas" de Google Sheets (ver plantillas.js); aquí están los valores iniciales.
// - legacy: la familia de la organización que lo conserva todo (logo, lema, plantilla) pero está apartada de la
//   competición: no entra en el sorteo ni en la tier list, así que tampoco tiene cartas ni puntúa en el fantasy.
// - invitado: no es una familia (un rival de fuera o un hueco por decidir); solo sirve para ponerlo en el overlay.
// Desde el 29/10/2026 juegan seis; KAMIKAZE, KURU, DORAGON, RAIJIN, KANJI y CHIRU ya no están (sus logos y su arte
// siguen en public/logos y public/clanes por si vuelven). Desde el 07/11/2026 son las familias de Gokudō.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FAMILIAS = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data-proyecto', 'familias.json'), 'utf8')).familias;
const familia = id => FAMILIAS.find(f => f.clan === id) || {};
// El nombre, el kanji y el color de la familia que ocupa el sitio de ese clan
const deFamilia = (id, texto) => {
  const f = familia(id);
  return { id, nombre: f.nombre, kanji: f.kanji, color: f.color, texto: texto || f.color, ...(f.legacy ? { legacy: true } : {}) };
};

export const CLANES = [
  { ...deFamilia('SARU', '#D19A52'), lema: 'El lobo de la luna',
    descripcion: 'Caza de noche y en manada. Cuando sale la luna llena, nadie le cierra el paso.' },
  { ...deFamilia('KAIJU', '#78BF58'), lema: 'El demonio guardián',
    descripcion: 'Guarda su territorio con furia: cuanto más le golpean, más fuerte devuelve.' },
  { ...deFamilia('KEMONO', '#5FA876'), lema: 'El cuervo de las montañas',
    descripcion: 'Vigila desde lo alto y cae en picado. Disciplina de montaña y ojos en todas partes.' },
  { ...deFamilia('ATSUI', '#39C6F0'), lema: 'El dios dragón del mar',
    descripcion: 'Manda en el puerto y en las olas. Paciente como la marea, implacable cuando sube.' },
  { ...deFamilia('TORA', '#EE7B2B'), lema: 'El tigre blanco del oeste',
    descripcion: 'Guardián del oeste. Acecha en silencio y, cuando salta, no suelta la presa.' },
  { ...deFamilia('BUSHI', '#E5484E'), lema: 'El demonio de la máscara',
    descripcion: 'La máscara hannya y el bermellón: la familia más agresiva de la ciudad.' },
  { ...deFamilia('AMATERATSU', '#EBD28A'), lema: 'El dios de la muerte',
    descripcion: 'Los veteranos de la casa. Ya no pelean por el territorio: lo vigilan desde el otro lado.' },
  { id: 'NEGROCLARO', nombre: 'Negroclaro', kanji: '', color: '#9A917C', texto: '#E0D7CA', lema: '', descripcion: '', invitado: true },
  { id: 'NONAME', nombre: 'Por decidir', kanji: '', color: '#9A917C', texto: '#E0D7CA', lema: '', descripcion: '', invitado: true },
];

export const ROLES = ['TOP', 'JUNGLA', 'MEDIO', 'ADC', 'SUPPORT'];

// Las familias que compiten en Gokudō: ni los invitados ni la Legacy
export const enCompeticion = c => !c.invitado && !c.legacy;

export function clan(id) {
  return CLANES.find(c => c.id === id) || CLANES[CLANES.length - 1];
}
