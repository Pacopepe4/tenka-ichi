// La temporada de TENKA ICHI: qué clanes juegan y qué día se juega cada jornada y cada ronda de playoffs.
// Todo son domingos (lo fijó el usuario el 29/10/2026): liguilla el 8, 15, 22 y 29 de noviembre; playoffs el 6 de
// diciembre (cuartos), el 13 (semifinales) y el 20 (final).
// Cada día, el primer partido es a las 19:00 (hora de España) y los demás, 45 minutos después del anterior (lo dijo el
// usuario el 03/11/2026: 19:00, 19:45 y 20:30 en la liguilla).
export const TEMPORADA = {
  clanes: ['SARU', 'KAIJU', 'KEMONO', 'ATSUI', 'TORA', 'BUSHI'],
  liguilla: ['2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29'],
  playoffs: { cuartos: '2026-12-06', semis: '2026-12-13', final: '2026-12-20' },
  hora: '19:00',
  margenMinutos: 45,
};
