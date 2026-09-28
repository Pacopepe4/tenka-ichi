// Puntuación del fantasy: los puntos que hace cada jugador en una partida con los datos que da el LoL al terminar.
// Cada regla solo cuenta si se tiene ese dato: si en una partida no se apunta el daño, nadie suma ni pierde por daño.
// Los datos llegan del puente (el cliente del LoL en directo), del panel (lo que apunta el staff de la pantalla
// final) o, si algún día se usa, de la API de Riot (match-v5, con códigos de torneo).
//
// El reparto está pensado para que los cinco roles puntúen parecido: el apoyo compensa con asistencias y visión
// lo que el tirador hace con asesinatos, farmeo y daño.
export const REGLAS_PUNTOS = {
  jugar: 1,                                   // por jugar la partida
  victoria: 3,                                // si gana
  asesinato: 2,                               // por asesinato
  asistencia: 1.5,                            // por asistencia
  muerte: -1,                                 // por muerte
  sinMorir: 2,                                // si no muere en toda la partida
  subditos: { puntos: 1, cada: 30 },          // por cada 30 de farmeo (súbditos y monstruos)
  vision: { puntos: 1, cada: 10 },            // por cada 10 de puntuación de visión
  dano: { puntos: 1, cada: 5000 },            // por cada 5000 de daño a campeones
  primeraSangre: 2,                           // si hace la primera sangre
  // Los multikills se cuentan como en el juego: un pentakill también es cuádruple y triple, así que suma 2 + 3 + 5
  triple: 2, cuadruple: 3, pentakill: 5,
  participacion: { puntos: 2, desde: 70 },    // si participa en el 70 % o más de los asesinatos de su equipo
  torre: 1,                                   // por torre que derriba o ayuda a derribar
  mvp: 3,                                     // si el staff lo elige MVP
};

// Estadística de una partida, igual venga de donde venga (null = no se sabe):
// { victoria, k, d, a, cs, vision, dano, primeraSangre, triples, quadras, pentas, torres, kp (0-100), mvp }
const hay = v => v != null && v !== '' && Number.isFinite(Number(v));
const redondear = x => Math.round(x * 10) / 10;
const plural = (n, uno, varios) => `${n.toLocaleString('es-ES')} ${n === 1 ? uno : varios}`;

export function puntuar(s = {}, R = REGLAS_PUNTOS) {
  const desglose = [];
  const sumar = (regla, texto, puntos) => { if (puntos) desglose.push({ regla, texto, puntos: redondear(puntos) }); };
  const cada = (regla, valor, { puntos, cada }, texto) => { if (hay(valor)) sumar(regla, texto(Number(valor)), Math.floor(Number(valor) / cada) * puntos); };

  sumar('jugar', 'Jugar la partida', R.jugar);
  if (s.victoria) sumar('victoria', 'Victoria', R.victoria);
  if (hay(s.k)) sumar('asesinato', plural(Number(s.k), 'asesinato', 'asesinatos'), Number(s.k) * R.asesinato);
  if (hay(s.a)) sumar('asistencia', plural(Number(s.a), 'asistencia', 'asistencias'), Number(s.a) * R.asistencia);
  if (hay(s.d)) {
    sumar('muerte', plural(Number(s.d), 'muerte', 'muertes'), Number(s.d) * R.muerte);
    if (Number(s.d) === 0) sumar('sinMorir', 'Sin morir', R.sinMorir);
  }
  cada('subditos', s.cs, R.subditos, n => `${n.toLocaleString('es-ES')} de farmeo`);
  cada('vision', s.vision, R.vision, n => `${n.toLocaleString('es-ES')} de visión`);
  cada('dano', s.dano, R.dano, n => `${n.toLocaleString('es-ES')} de daño`);
  if (s.primeraSangre) sumar('primeraSangre', 'Primera sangre', R.primeraSangre);
  if (hay(s.triples)) sumar('triple', plural(Number(s.triples), 'triple', 'triples'), Number(s.triples) * R.triple);
  if (hay(s.quadras)) sumar('cuadruple', plural(Number(s.quadras), 'cuádruple', 'cuádruples'), Number(s.quadras) * R.cuadruple);
  if (hay(s.pentas)) sumar('pentakill', plural(Number(s.pentas), 'pentakill', 'pentakills'), Number(s.pentas) * R.pentakill);
  if (hay(s.kp) && Number(s.kp) >= R.participacion.desde) sumar('participacion', `Participa en el ${Math.round(Number(s.kp))} % de los asesinatos`, R.participacion.puntos);
  if (hay(s.torres)) sumar('torre', plural(Number(s.torres), 'torre', 'torres'), Number(s.torres) * R.torre);
  if (s.mvp) sumar('mvp', 'MVP', R.mvp);

  return { total: redondear(desglose.reduce((t, d) => t + d.puntos, 0)), desglose };
}

// Participación en asesinatos (0-100): sus asesinatos y asistencias entre los asesinatos de su equipo
export function participacion(k, a, asesinatosEquipo) {
  if (!hay(k) || !hay(a) || !(Number(asesinatosEquipo) > 0)) return null;
  return Math.min(100, Math.round((Number(k) + Number(a)) / Number(asesinatosEquipo) * 100));
}

// Un participante de la API de Riot (match-v5, /lol/match/v5/matches/{id} → info.participants[]).
// Sus multikills ya son acumulativos (un pentakill cuenta también en quadraKills y tripleKills).
export function desdeMatchV5(p) {
  const num = v => (hay(v) ? Number(v) : null);
  const kp = num(p.challenges?.killParticipation);
  return {
    victoria: Boolean(p.win), k: num(p.kills), d: num(p.deaths), a: num(p.assists),
    cs: hay(p.totalMinionsKilled) ? Number(p.totalMinionsKilled) + (num(p.neutralMinionsKilled) || 0) : null,
    vision: num(p.visionScore), dano: num(p.totalDamageDealtToChampions),
    primeraSangre: p.firstBloodKill == null ? null : Boolean(p.firstBloodKill),
    triples: num(p.tripleKills), quadras: num(p.quadraKills), pentas: num(p.pentaKills),
    torres: num(p.turretTakedowns ?? p.turretKills), kp: kp == null ? null : Math.round(kp * 100),
  };
}

// Texto corto de las reglas, para el panel y la página del gachapon
export function reglasLegibles(R = REGLAS_PUNTOS) {
  const n = x => `${x > 0 ? '+' : '−'}${Math.abs(x).toLocaleString('es-ES')}`;
  return [
    [n(R.jugar), 'por jugar la partida'], [n(R.victoria), 'si gana'],
    [n(R.asesinato), 'por asesinato'], [n(R.asistencia), 'por asistencia'], [n(R.muerte), 'por muerte'],
    [n(R.sinMorir), 'si no muere en toda la partida'],
    [n(R.subditos.puntos), `por cada ${R.subditos.cada} de farmeo (súbditos y monstruos)`],
    [n(R.vision.puntos), `por cada ${R.vision.cada} de puntuación de visión`],
    [n(R.dano.puntos), `por cada ${R.dano.cada.toLocaleString('es-ES')} de daño a campeones`],
    [n(R.primeraSangre), 'por la primera sangre'],
    [n(R.triple), `por triple, ${n(R.triple + R.cuadruple)} por cuádruple y ${n(R.triple + R.cuadruple + R.pentakill)} por pentakill`],
    [n(R.participacion.puntos), `si participa en el ${R.participacion.desde} % o más de los asesinatos de su equipo`],
    [n(R.torre), 'por torre que derriba o ayuda a derribar'],
    [n(R.mvp), 'si es el MVP'],
  ].map(([puntos, texto]) => ({ puntos, texto }));
}
