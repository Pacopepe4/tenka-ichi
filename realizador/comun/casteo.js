// Casteo a distancia con VDO.Ninja (15/11, Pacopepe: «seremos el pc2 y dos casters más»). Una sala de VDO.Ninja
// (WebRTC, gratis, por el navegador, sin abrir puertos):
//  - el PC 2 comparte la ventana del LoL (la partida limpia, sin interfaz) y habla con los casters por la sala;
//  - cada caster entra con su enlace: ve la partida con unas décimas de retraso y oye a los demás;
//  - las voces de los casters suenan en el PC 2 por la salida de Windows y OBS las coge con el «Audio del escritorio»
//    (que va a la emisión): no hace falta ninguna fuente en OBS (con una, se oirían dobles).
// Los nombres de la sala salen de la contraseña del realizador: los dos PCs los saben y no van en el zip (que es público).
import { createHash } from 'node:crypto';

export function idsCasteo(clave) {
  if (!clave) return null;
  const h = createHash('sha256').update(`casteo:${clave}`).digest('hex');
  return {
    sala: `gokudo-casteo-${h.slice(0, 10)}`,
    partida: `gk-partida-${h.slice(10, 18)}`,
    pc2: `gk-pc2-${h.slice(18, 26)}`,
    caster1: `gk-caster1-${h.slice(26, 34)}`,
    caster2: `gk-caster2-${h.slice(34, 42)}`,
  };
}

const BASE = 'https://vdo.ninja/';
const url = params => `${BASE}?${params.map(([k, v]) => (v === true ? k : `${k}=${encodeURIComponent(v)}`)).join('&')}`;

// calidad: 0 = 1080p, 1 = 720p, 2 = 360p (lo que manda el PC 2 de la partida)
export function enlacesCasteo(clave, { calidad = 1 } = {}) {
  const i = idsCasteo(clave);
  if (!i) return null;
  const voz = (push, etiqueta) => url([['room', i.sala], ['push', push], ['videodevice', '0'], ['audiodevice', '1'], ['autostart', true], ['label', etiqueta]]);
  return {
    // PC 2: la partida (sin micro) y su voz con los casters
    compartir: url([['room', i.sala], ['push', i.partida], ['screenshare', true], ['autostart', true], ['quality', String(calidad)], ['audiodevice', '0'], ['label', 'Partida']]),
    hablar: voz(i.pc2, 'PC2'),
    // Los casters (se los pasa el del PC 2 o el PC 1, que los ven en su panel)
    caster1: voz(i.caster1, 'Caster1'),
    caster2: voz(i.caster2, 'Caster2'),
  };
}
