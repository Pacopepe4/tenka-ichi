// La temporada de TENKA ICHI: qué clanes juegan y qué día se juega cada jornada y cada ronda de playoffs.
// Todo son domingos (lo fijó el usuario el 29/10/2026). El 08/11/2026 pidió retrasarlo todo una semana («hasta el
// domingo que viene, mismas horas»): liguilla el 15, 22 y 29 de noviembre y el 6 de diciembre; playoffs el 13 de
// diciembre (cuartos), el 20 (semifinales) y el 27 (final).
// Cada día, el primer partido es a las 17:00 (hora de España) y los demás, 45 minutos después del anterior (lo dijo el
// usuario el 03/11/2026 y lo confirmó después: 17:00, 17:45 y 18:30 en la liguilla; antes había dicho las 19:00).
export const TEMPORADA = {
  clanes: ['SARU', 'KAIJU', 'KEMONO', 'ATSUI', 'TORA', 'BUSHI'],
  liguilla: ['2026-11-15', '2026-11-22', '2026-11-29', '2026-12-06'],
  playoffs: { cuartos: '2026-12-13', semis: '2026-12-20', final: '2026-12-27' },
  hora: '17:00',
  margenMinutos: 45,
};
