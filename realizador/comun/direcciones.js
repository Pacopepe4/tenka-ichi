// Dirección de la web de Gokudō (21/11): Render suspendió tenka-ichi.onrender.com y la web vive en gokudo.es, en el
// server casero. Las instalaciones de antes guardan la dirección de Render en su opciones.local.json (tenkaIchi.url,
// a veces puente.url) y en las fuentes de OBS: se traducen al leerlas, sin tocar el archivo.
export const WEB = 'gokudo.es';
const VIEJA = /\/\/tenka-ichi\.onrender\.com(?=[/:?#]|$)/i;

export function alDia(url) {
  return typeof url === 'string' ? url.replace(VIEJA, `//${WEB}`) : url;
}

// Las opciones con direcciones de la web (las demás no se tocan; devuelve el mismo objeto)
export function opcionesAlDia(o) {
  if (!o || typeof o !== 'object') return o;
  for (const [grupo, clave] of [['puente', 'url'], ['tenkaIchi', 'url'], ['obs', 'overlay'], ['obs', 'alertas']]) {
    if (o[grupo] && typeof o[grupo][clave] === 'string') o[grupo][clave] = alDia(o[grupo][clave]);
  }
  return o;
}
