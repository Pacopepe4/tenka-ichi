// Publicar en Discord con el webhook de un canal: la colección y la alineación de los coleccionistas, y la tier
// list y la clasificación de cada jornada del fantasy (el staff), como imagen (la dibuja la página, public/compartir.js) con un texto que pone el servidor.
// El webhook se crea en Discord (Ajustes del servidor › Integraciones › Webhooks › Nuevo webhook) y su
// dirección va en Render: DISCORD_WEBHOOK_URL. Si la tier list o la clasificación van en otro canal,
// DISCORD_WEBHOOK_TIERLIST y DISCORD_WEBHOOK_CLASIFICACION.
const WEBHOOKS = {
  coleccion: process.env.DISCORD_WEBHOOK_URL,
  alineacion: process.env.DISCORD_WEBHOOK_URL,
  tierlist: process.env.DISCORD_WEBHOOK_TIERLIST || process.env.DISCORD_WEBHOOK_URL,
  clasificacion: process.env.DISCORD_WEBHOOK_CLASIFICACION || process.env.DISCORD_WEBHOOK_URL,
};
// Lo que solo publica el staff, con la contraseña del panel
const DEL_STAFF = new Set(['tierlist', 'clasificacion']);
export const TIPOS_DISCORD = Object.keys(WEBHOOKS);
export const discordActivo = (tipo = 'coleccion') => Boolean(WEBHOOKS[tipo]);

// Cada coleccionista puede publicar su colección y su alineación una vez cada 10 minutos, y el staff la tier
// list una vez por minuto: así nadie llena el canal
const ESPERA_MS = { coleccion: 10 * 60000, alineacion: 10 * 60000, tierlist: 60000, clasificacion: 60000 };
export const MAXIMO_IMAGEN = 8 * 1024 * 1024;
const ultimas = new Map();

export class ErrorDiscord extends Error {
  constructor(mensaje, estado) { super(mensaje); this.estado = estado; }
}

// La imagen llega en PNG o JPEG (con los dibujos de las cartas, el JPEG pesa mucho menos)
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function formatoImagen(b) {
  if (!Buffer.isBuffer(b) || b.length < PNG.length) return null;
  if (b.subarray(0, PNG.length).equals(PNG)) return { extension: 'png', mime: 'image/png' };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { extension: 'jpg', mime: 'image/jpeg' };
  return null;
}
// Los nombres vienen de Twitch: que no cambien el formato del mensaje (cursiva, negrita, etc.)
export const escaparMarkdown = s => String(s ?? '').replace(/([\\*_~`|>#\[\]()])/g, '\\$1');

const minutos = ms => {
  const m = Math.ceil(ms / 60000);
  return m <= 1 ? 'un minuto' : `${m} minutos`;
};

// Cuánto falta para poder volver a publicar (0 si ya se puede)
export function esperaDiscord(tipo, quien) {
  const ultima = ultimas.get(`${tipo}:${quien}`);
  return ultima ? Math.max(0, ultima + ESPERA_MS[tipo] - Date.now()) : 0;
}

// Manda la imagen al canal. texto es el mensaje que la acompaña y quien, a quién se le cuenta el límite
export async function publicarEnDiscord({ tipo, imagen, texto, quien, avatar = null }) {
  const webhook = WEBHOOKS[tipo];
  if (!TIPOS_DISCORD.includes(tipo)) throw new ErrorDiscord('No se puede publicar eso en Discord', 400);
  if (!webhook) throw new ErrorDiscord('Discord todavía no está conectado: falta el webhook del canal en Render', 503);
  const formato = formatoImagen(imagen);
  if (!formato) throw new ErrorDiscord('La imagen no es válida', 400);
  if (imagen.length > MAXIMO_IMAGEN) throw new ErrorDiscord('La imagen es demasiado grande para Discord', 413);
  const espera = esperaDiscord(tipo, quien);
  if (espera) throw new ErrorDiscord(`Ya lo has publicado hace poco: podrás volver a hacerlo dentro de ${minutos(espera)}`, 429);

  const archivo = `${tipo}.${formato.extension}`;
  const formulario = new FormData();
  formulario.append('payload_json', JSON.stringify({
    content: texto, username: 'Tenka Ichi', ...(avatar ? { avatar_url: avatar } : {}),
    allowed_mentions: { parse: [] }, attachments: [{ id: 0, filename: archivo }],
  }));
  formulario.append('files[0]', new Blob([imagen], { type: formato.mime }), archivo);

  let r;
  try { r = await fetch(`${webhook}${webhook.includes('?') ? '&' : '?'}wait=true`, { method: 'POST', body: formulario }); }
  catch { throw new ErrorDiscord('No hay conexión con Discord: prueba otra vez en un momento', 502); }
  if (r.status === 429) {
    const j = await r.json().catch(() => ({}));
    throw new ErrorDiscord(`Discord pide esperar ${Math.ceil(Number(j.retry_after) || 5)} segundos antes de publicar otra vez`, 429);
  }
  if (r.status === 401 || r.status === 404) throw new ErrorDiscord('El webhook de Discord ya no existe: hay que crearlo otra vez y cambiarlo en Render', 502);
  if (r.status === 413) throw new ErrorDiscord('La imagen es demasiado grande para Discord', 413);
  if (!r.ok) throw new ErrorDiscord(`Discord no ha aceptado la publicación (${r.status})`, 502);
  ultimas.set(`${tipo}:${quien}`, Date.now());
  const mensaje = await r.json().catch(() => ({}));
  return { id: mensaje.id || null };
}

// Quién publica: si entró con Discord, se le menciona (se ve su nombre y no le llega aviso, porque
// allowed_mentions va vacío); si no, su nombre en negrita
export const autorDiscord = u => (/^discord-\d+$/.test(String(u?.id)) ? `<@${u.id.slice('discord-'.length)}>` : `**${escaparMarkdown(u?.nombre || 'Alguien')}**`);

// El texto lo pone el servidor con sus propios datos: la página solo manda la imagen
export function textoDiscord(tipo, { usuario, tiene = 0, total = 0, puntos = 0, puesto = null, enlace = null, jornada = null, ganadores = [] } = {}) {
  const numero = n => Number(n || 0).toLocaleString('es-ES');
  const pie = enlace ? `\n<${enlace}>` : '';
  if (tipo === 'clasificacion') {
    // Los tres primeros de la jornada, con los sobres que se lleva cada uno
    const lineas = ganadores.map(g => `${g.puesto}.º ${autorDiscord(g)}: ${numero(g.puntos)} ${g.puntos === 1 ? 'punto' : 'puntos'}`
      + (g.sobres ? ` (+${g.sobres} ${g.sobres === 1 ? 'sobre' : 'sobres'})` : ''));
    return `**Clasificación del fantasy de Tenka Ichi${jornada ? `: ${escaparMarkdown(jornada)}` : ''}**${lineas.length ? `\n${lineas.join('\n')}` : ''}${pie}`;
  }
  if (tipo === 'coleccion') return `${autorDiscord(usuario)} enseña su colección de Tenka Ichi: ${numero(tiene)} de ${numero(total)} cartas.${pie}`;
  if (tipo === 'alineacion') {
    return `${autorDiscord(usuario)} presenta su alineación del fantasy de Tenka Ichi: ${numero(puntos)} ${puntos === 1 ? 'punto' : 'puntos'}`
      + `${puesto ? `, ${puesto}.º en la clasificación` : ''}.${pie}`;
  }
  return `Tier list de Tenka Ichi.${pie}`;
}

// POST /api/discord/publicar?tipo=…: la página manda la imagen y aquí se comprueba quién publica (el coleccionista
// con su sesión; la tier list, el staff con la contraseña del panel). Devuelve { estado, cuerpo } para responder
export async function atenderPublicacion({ tipo, req, usuario = null, staff = false, datos = {}, avatar = null, enlace = null }) {
  try {
    if (!TIPOS_DISCORD.includes(tipo)) throw new ErrorDiscord('No se puede publicar eso en Discord', 400);
    if (DEL_STAFF.has(tipo) && !staff) throw new ErrorDiscord(`La ${tipo === 'tierlist' ? 'tier list' : 'clasificación'} solo la publica el staff`, 401);
    if (!DEL_STAFF.has(tipo) && !usuario) throw new ErrorDiscord('Entra con tu cuenta para publicar en Discord', 401);
    const imagen = await leerImagen(req);
    const texto = textoDiscord(tipo, { ...datos, usuario, enlace });
    await publicarEnDiscord({ tipo, imagen, texto, quien: DEL_STAFF.has(tipo) ? 'staff' : usuario.id, avatar });
    return { estado: 200, cuerpo: { ok: true } };
  } catch (e) {
    return { estado: e.estado || 500, cuerpo: { ok: false, error: e.message } };
  }
}

// Lee la imagen que manda la página (el cuerpo de la petición tal cual), con tope de tamaño
export function leerImagen(req, maximo = MAXIMO_IMAGEN) {
  return new Promise((ok, mal) => {
    const trozos = [];
    let total = 0;
    req.on('data', d => {
      total += d.length;
      if (total > maximo) { mal(new ErrorDiscord('La imagen es demasiado grande para Discord', 413)); req.destroy(); return; }
      trozos.push(d);
    });
    req.on('end', () => ok(Buffer.concat(trozos)));
    req.on('error', mal);
  });
}
