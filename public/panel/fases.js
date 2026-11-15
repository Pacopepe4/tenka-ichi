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
  traileres: { nombre: 'Tráilers', con: 'los tráilers' },
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
export const BOTONES = ['intro', 'traileres', 'saltar', 'pausa', 'postpartida', 'casters', 'cierre', 'auto'];

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
  if (d.getTime() <= ahora) {
    // Pasada hace poco (menos de 6 h: «19:00» escrito a las 19:00:20) no vale: dejaría una cuenta de casi 24 h en antena
    if (ahora - d.getTime() < 6 * 3600 * 1000) return null;
    d.setDate(d.getDate() + 1);
  }
  return d.getTime();
}
export function horaValida(hora) {
  const m = /^\s*(\d{1,2})[:.h](\d{2})\s*$/.exec(String(hora ?? ''));
  return Boolean(m) && Number(m[1]) <= 23 && Number(m[2]) <= 59;
}
// Por qué no vale una hora (para avisar al pulsar), o null si vale
export function problemaHora(hora, ahora = Date.now()) {
  if (!horaValida(hora)) return 'Escribe la hora de empezar (HH:MM)';
  return hastaDesdeHora(hora, ahora) === null ? 'Esa hora ya ha pasado: pon una hora que aún no haya llegado' : null;
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
const ESPERA = new Set([null, 'espera', 'intro', 'traileres', 'pausa', 'casters', 'cierre']);

const NADA = { intro: false, traileres: false, saltar: false, pausa: false, postpartida: false, casters: false, cierre: false, auto: false, espera: false };
const VACIA = { actual: null, manual: false, titulo: '', detalle: '', texto: '', modo: '', escena: '', aviso: null, esperaTexto: 'Poner la espera', hora: '' };

export function vistaFases(foto, ahora = Date.now()) {
  // Sin foto del PC 1 no se sabe nada: el bloque no sale (el resto del apartado ya dice que espera al PC 1)
  if (!foto) return { visible: false, botones: false, ...NADA, ...VACIA };
  const f = foto.fase;
  // Un PC 1 de antes de las fases no manda el campo; null quiere decir que falta el PC 2 (o su OBS)
  if (!Object.hasOwn(foto, 'fase')) {
    return { visible: true, botones: false, ...NADA, ...VACIA, titulo: 'Sin fases',
      texto: 'Este realizador no lleva las fases del directo: actualízalo desde la guía' };
  }
  if (!f || typeof f !== 'object') {
    return { visible: true, botones: false, ...NADA, ...VACIA, titulo: 'Sin PC 2',
      texto: 'Esperando al PC 2 (o a su OBS) para saber la fase del directo' };
  }
  // Sin «Empezar directo» las escenas cambian en OBS, pero no se emite
  const sinEmitir = foto.emision?.fase === 'apagada';
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
    enAntena: sinEmitir ? 'En OBS (sin emitir)' : 'En antena',
    texto: actual ? `${sinEmitir ? 'En OBS (sin emitir)' : 'En antena'}: ${titulo}${detalle ? ` · ${detalle}` : ''}` : titulo,
    modo: manual ? 'A mano' : 'Automático',
    escena: typeof f.escena === 'string' && f.escena ? `Escena de OBS: ${f.escena}` : '',
    // La pastilla de la barra: «Espera ● 12:34»; sin cuenta, «a mano» o «auto»
    aviso: actual ? { etiqueta: 'Fase', texto: `${titulo} · ${faltan !== null ? cuenta(faltan) : manual ? 'a mano' : 'auto'}` } : null,
    esperaTexto: actual === 'espera' ? 'Cambiar hora' : 'Poner la espera',
    hora: actual === 'espera' ? horaDe(hasta) : '',
  };
  if (desconocida) return v;
  v.intro = INTRO.has(actual) && actual !== 'intro';
  // Los tráilers, donde la intro (o justo tras ella); «Saltar» acaba ya lo que dura un tiempo fijo
  v.traileres = (INTRO.has(actual) || actual === 'intro') && actual !== 'traileres';
  v.saltar = ['intro', 'traileres', 'postpartida'].includes(actual);
  v.pausa = actual !== 'pausa';
  v.postpartida = POSTPARTIDA.has(actual);
  v.casters = actual !== 'casters';
  v.cierre = actual !== 'cierre';
  v.auto = manual;
  v.espera = ESPERA.has(actual);
  // Con el resumen en vídeo saliendo, lo que se pida espera a que acabe: mejor cancelarlo antes en «Resumen final»
  if (actual === 'resumen') {
    v.intro = v.traileres = v.saltar = v.pausa = v.postpartida = v.casters = v.espera = false;
    v.detalle = `${v.detalle ? `${v.detalle} · ` : ''}para cambiar de fase, cancela antes el resumen`;
  }
  return v;
}

// La pregunta antes de pasar al cierre: más seria si el draft o la partida están en antena
export const preguntaCierre = actual => (['draft', 'partida', 'repeticion'].includes(actual)
  ? `¿Pasar al cierre del directo con ${FASES[actual].con} en antena?` : '¿Pasar al cierre del directo?');
// La pregunta antes de cada botón (null: sin pregunta). En plena partida, cualquier fase tapa el juego en antena
export function preguntaFase(fase, actual) {
  if (fase === 'cierre') return preguntaCierre(actual);
  if (['partida', 'repeticion'].includes(actual) && ['intro', 'traileres', 'pausa', 'postpartida', 'casters'].includes(fase)) {
    return `¿Poner ${FASES[fase].con} con la partida en antena? El juego deja de verse hasta que pulses «Automático».`;
  }
  return null;
}
