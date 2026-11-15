// Fases del directo del realizador: qué se enseña en el panel con el campo `fase` de la foto del PC 1 y qué se le manda.
// Sin el DOM, para poder probarlo en Node (test/fases-panel.test.js); lo pinta realizador.js.
//   fase: { actual, manual, hasta, faltan, siguiente, escena }
//     actual: 'espera'|'intro'|'draft'|'pausa'|'partida'|'repeticion'|'postpartida'|'casters'|'resumen'|'cierre'|null
//     faltan: segundos para pasar a `siguiente` (o null); hasta: la hora (epoch ms) de la cuenta atrás de la espera
// Los botones mandan { tipo: 'panelFase', fase: 'espera'|'intro'|'pausa'|'postpartida'|'casters'|'cierre'|'auto',
// hasta?, jornada? }: `hasta` y `jornada` solo con la espera; 'auto' devuelve el control al flujo automático.
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export const FASES = {
  espera: { nombre: 'Espera', con: 'la espera' },
  intro: { nombre: 'Intro', con: 'la intro' },
  draft: { nombre: 'Draft', con: 'el draft' },
  pausa: { nombre: 'Pausa', con: 'la pausa' },
  partida: { nombre: 'Partida', con: 'la partida' },
  repeticion: { nombre: 'Repetición', con: 'la repetición' },
  postpartida: { nombre: 'Postpartida', con: 'la postpartida' },
  casters: { nombre: 'Casters', con: 'los casters' },
  resumen: { nombre: 'Resumen', con: 'el resumen' },
  cierre: { nombre: 'Cierre', con: 'el cierre' },
};
// Los botones del panel, en orden (la espera va aparte, con su hora)
export const BOTONES = ['intro', 'pausa', 'postpartida', 'casters', 'cierre', 'auto'];

// 754 → «12:34»; 3725 → «1:02:05». La cuenta atrás redondea hacia arriba (con 20,2 s quedan «0:21»)
export const cuenta = s => {
  const t = Math.max(0, Math.ceil(s));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), seg = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${seg}` : `${m}:${seg}`;
};
// Epoch ms → «21:30» (hora local)
export const horaDe = ms => {
  if (num(ms) === null) return '';
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// «21:30» → el epoch ms de hoy a esa hora; si ya ha pasado (o es justo ahora), de mañana. Mal escrita → null
export function hastaDesdeHora(hora, ahora = Date.now()) {
  const m = /^\s*(\d{1,2})[:.h](\d{2})\s*$/.exec(String(hora ?? ''));
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  const d = new Date(ahora);
  d.setHours(h, min, 0, 0);
  if (d.getTime() <= ahora) d.setDate(d.getDate() + 1);
  return d.getTime();
}

// El mensaje de cada botón. La espera necesita una hora buena; sin ella, null (no se manda nada)
export function ordenFase(fase, { hora, jornada, ahora = Date.now() } = {}) {
  if (fase === 'espera') {
    const hasta = hastaDesdeHora(hora, ahora);
    if (hasta === null) return null;
    const j = String(jornada ?? '').trim().slice(0, 80);
    return { tipo: 'panelFase', fase: 'espera', hasta, ...(j ? { jornada: j } : {}) };
  }
  if (!BOTONES.includes(fase)) return null;
  return { tipo: 'panelFase', fase };
}

// Qué botón va en cada fase. A mano se puede casi todo; lo que no tiene sentido se apaga:
//   la intro, antes del draft o entre bloques (no con el draft, la partida o el resumen en antena);
//   la postpartida, con una partida ya jugada (partida, repetición, pausa, casters o resumen);
//   la espera, fuera del draft y de la partida; Automático, solo si va a mano; y nunca la fase que ya está
const INTRO = new Set([null, 'espera', 'pausa', 'casters', 'cierre']);
const POSTPARTIDA = new Set(['partida', 'repeticion', 'pausa', 'casters', 'resumen']);
const ESPERA = new Set([null, 'espera', 'intro', 'pausa', 'casters', 'cierre']);

const NADA = { intro: false, pausa: false, postpartida: false, casters: false, cierre: false, auto: false, espera: false };
const VACIA = { actual: null, manual: false, titulo: '', detalle: '', texto: '', modo: '', escena: '', aviso: null, esperaTexto: 'Poner la espera', hora: '' };

export function vistaFases(foto, ahora = Date.now()) {
  // Sin foto del PC 1 no se sabe nada: el bloque no sale (el resto del apartado ya dice que espera al PC 1)
  if (!foto) return { visible: false, botones: false, ...NADA, ...VACIA };
  const f = foto.fase;
  // Un PC 1 de antes de las fases no manda el campo (o lo manda a null)
  if (!f || typeof f !== 'object') {
    return { visible: true, botones: false, ...NADA, ...VACIA, titulo: 'Sin fases',
      texto: 'Este realizador no lleva las fases del directo: actualízalo desde la guía' };
  }
  const actual = Object.hasOwn(FASES, f.actual) ? f.actual : null;
  const desconocida = f.actual !== null && f.actual !== undefined && !actual;
  const manual = Boolean(f.manual);
  const titulo = actual ? FASES[actual].nombre : desconocida ? 'Fase desconocida' : 'Fuera de antena';

  // Lo que viene: «la intro en 12:34». Sin `faltan`, la espera saca la cuenta de su `hasta`
  let faltan = num(f.faltan);
  const hasta = num(f.hasta);
  if (faltan === null && actual === 'espera' && hasta !== null) faltan = Math.max(0, (hasta - ahora) / 1000);
  const sig = Object.hasOwn(FASES, f.siguiente) ? FASES[f.siguiente].con : null;
  let detalle = '';
  if (sig && faltan !== null) detalle = `${sig} en ${cuenta(faltan)}`;
  else if (sig) detalle = `luego, ${sig}`;
  else if (faltan !== null) detalle = `quedan ${cuenta(faltan)}`;
  if (actual === 'espera' && hasta !== null) detalle = `${detalle || 'empieza'} (a las ${horaDe(hasta)})`;

  const v = {
    visible: true, botones: !desconocida, ...NADA, actual, manual, titulo, detalle,
    texto: actual ? `En antena: ${titulo}${detalle ? ` · ${detalle}` : ''}` : titulo,
    modo: manual ? 'A mano' : 'Automático',
    escena: typeof f.escena === 'string' && f.escena ? `Escena de OBS: ${f.escena}` : '',
    // La pastilla de la barra: «Espera ● 12:34»; sin cuenta, «a mano» o «auto»
    aviso: actual ? { etiqueta: titulo, texto: faltan !== null ? cuenta(faltan) : manual ? 'a mano' : 'auto' } : null,
    esperaTexto: actual === 'espera' ? 'Cambiar hora' : 'Poner la espera',
    hora: actual === 'espera' ? horaDe(hasta) : '',
  };
  if (desconocida) return v;
  v.intro = INTRO.has(actual) && actual !== 'intro';
  v.pausa = actual !== 'pausa';
  v.postpartida = POSTPARTIDA.has(actual);
  v.casters = actual !== 'casters';
  v.cierre = actual !== 'cierre';
  v.auto = manual;
  v.espera = ESPERA.has(actual);
  return v;
}

// La pregunta antes de pasar al cierre: más seria si el draft o la partida están en antena
export const preguntaCierre = actual => (['draft', 'partida', 'repeticion'].includes(actual)
  ? `¿Pasar al cierre del directo con ${FASES[actual].con} en antena?` : '¿Pasar al cierre del directo?');
