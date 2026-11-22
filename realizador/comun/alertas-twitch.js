// Alertas de Twitch (22/11): la URL de origen del navegador del grupo «Gokudō» lleva un token, así que no va en el repo
// ni en el zip. La guarda Pacopepe en el server (TWITCH_ALERTAS_URL) y aquí se pide al instalar o actualizar, con la
// contraseña del panel, para crear la fuente «Alertas Twitch» de OBS. La URL nunca se escribe en el registro.
//   { url: 'https://…' }  la hay
//   { url: null }         el server contesta que no hay (no se crea la fuente)
//   { url: undefined }    no se ha podido preguntar (sin red, contraseña mala…): se deja la que hubiera en OBS
export async function pedirAlertasTwitch({ web, clave, pedir = fetch, ms = 8000 } = {}) {
  if (!web || !clave) return { url: undefined, error: 'sin web o sin contraseña' };
  try {
    const r = await pedir(new URL('/api/realizador/alertas-twitch', web).href, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clave }), signal: AbortSignal.timeout(ms),
    });
    if (!r.ok) return { url: undefined, error: `la web contesta ${r.status}` };
    const d = await r.json();
    return { url: esUrlTwitch(d?.url) ? d.url : null };
  } catch (e) {
    return { url: undefined, error: e.name === 'TimeoutError' ? 'la web no contesta' : 'sin conexión con la web' };
  }
}

export function esUrlTwitch(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' && /(^|\.)twitch\.tv$/i.test(u.hostname);
  } catch { return false; }
}
