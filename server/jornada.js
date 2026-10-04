// Cierre de una jornada del fantasy: los tres primeros de la jornada se llevan sobres, se apunta que ya está
// premiada (para no dar los sobres dos veces) y se vuelven a abrir las alineaciones para la siguiente.
// La clasificación se publica en Discord desde el panel, que es quien dibuja la imagen.
import { ajuste, guardarAjustes } from './ajustes.js';
import { clasificacionJornada, cerrarAlineaciones, jornadasFantasy } from './fantasy.js';
import { darSobres } from './gacha.js';

const CLAVE = 'jornadas_cerradas';

// { 'Jornada 1': { fecha, ganadores: [{ puesto, id, nombre, puntos, sobres }] } }
export function jornadasCerradas() {
  try { return JSON.parse(ajuste(CLAVE) || '{}') || {}; } catch { return {}; }
}

// Lo que ve el panel: las jornadas con partidas puntuadas, cuál está cerrada y la clasificación de la que se pida
export function estadoJornadas(jornada = null) {
  const cerradas = jornadasCerradas(), jornadas = jornadasFantasy();
  const elegida = jornada && jornadas.includes(jornada) ? jornada : jornadas.at(-1) || null;
  return { jornadas: jornadas.map(j => ({ nombre: j, cerrada: Boolean(cerradas[j]) })), jornada: elegida,
    clasificacion: elegida ? clasificacionJornada(elegida) : [], cerrada: elegida ? cerradas[elegida] || null : null };
}

// Para la web: quién ganó cada jornada cerrada (sin los identificadores de las cuentas)
export function premiosPublicos() {
  return Object.entries(jornadasCerradas()).map(([jornada, c]) => ({ jornada, fecha: c.fecha,
    ganadores: c.ganadores.map(({ puesto, nombre, puntos, sobres }) => ({ puesto, nombre, puntos, sobres })) }));
}

export async function terminarJornada(jornada, premios = [3, 2, 1]) {
  if (!jornada) throw new Error('Elige la jornada que se termina');
  const cerradas = jornadasCerradas();
  if (cerradas[jornada]) throw new Error(`${jornada} ya está cerrada: sus sobres ya se repartieron`);
  const clasificacion = clasificacionJornada(jornada);
  if (!clasificacion.length) throw new Error(`Nadie ha puntuado en ${jornada}: guarda antes las estadísticas de sus partidas`);
  const ganadores = clasificacion.slice(0, 3).map((c, i) => ({ puesto: c.puesto, id: c.id, nombre: c.nombre, puntos: c.puntos,
    sobres: Math.max(0, Math.round(Number(premios[i]) || 0)) }));
  // Primero se apunta como cerrada: si algo falla a medias, no se reparten los sobres dos veces
  cerradas[jornada] = { fecha: new Date().toISOString(), ganadores };
  await guardarAjustes({ [CLAVE]: JSON.stringify(cerradas) });
  for (const g of ganadores) if (g.sobres > 0) await darSobres({ id: g.id, nombre: g.nombre }, g.sobres, 'premio', `${jornada}, ${g.puesto}.º`);
  await cerrarAlineaciones(false);
  return { jornada, ganadores, clasificacion };
}
