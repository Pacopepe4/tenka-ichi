// Monta el servidor de Discord de Gokudō tal como dice discord/servidor.json (y las familias de
// data-proyecto/familias.json): roles, categorías, canales, permisos y webhooks. Todo con el bot (API REST v10).
//   npm run discord-aplicar -- --prueba             → solo enseña lo que haría, no cambia nada
//   npm run discord-aplicar                          → crea lo que falta y cambia lo que es distinto
//   npm run discord-aplicar -- --borrar-sobrantes    → además borra los canales y roles que no están en el archivo
// Necesita DISCORD_BOT_TOKEN en el .env. Si el bot está en más de un servidor, DISCORD_GUILD_ID dice cuál.
// Es idempotente: si lo lanzas dos veces seguidas, la segunda no hace nada. Las direcciones de los webhooks
// (son secretas) se guardan en el .env, nunca se enseñan. Los ids de lo creado van a discord/ids.json para
// que, si cambias el nombre de una familia, se renombre su canal y su rol en vez de crear otros.
// La marca: el icono del servidor, el avatar del bot y de los webhooks ('marca' en servidor.json) y un emoji
// propio por familia (su 'insignia' en familias.json). De cada imagen puesta se guarda una huella en ids.json,
// así que solo se vuelve a subir si cambias el archivo.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Los permisos de Discord que usamos, por su nombre (el número es el bit)
export const PERMISOS = {
  CREATE_INSTANT_INVITE: 0, MANAGE_CHANNELS: 4, ADD_REACTIONS: 6, VIEW_CHANNEL: 10, SEND_MESSAGES: 11,
  MANAGE_MESSAGES: 13, EMBED_LINKS: 14, ATTACH_FILES: 15, READ_MESSAGE_HISTORY: 16, MENTION_EVERYONE: 17,
  CONNECT: 20, SPEAK: 21, MOVE_MEMBERS: 24, MANAGE_ROLES: 28, MANAGE_WEBHOOKS: 29, CREATE_PUBLIC_THREADS: 35,
  SEND_MESSAGES_IN_THREADS: 38,
};
const bits = nombres => (nombres || []).reduce((t, n) => {
  if (!(n in PERMISOS)) throw new Error(`Permiso desconocido: ${n}`);
  return t | (1n << BigInt(PERMISOS[n]));
}, 0n);
// Lo que pide el bot al invitarlo: Gestionar canales, Gestionar roles y Gestionar webhooks
export const PERMISOS_BOT = bits(['MANAGE_CHANNELS', 'MANAGE_ROLES', 'MANAGE_WEBHOOKS']);
// En los canales que @everyone no ve, el bot se da permiso a sí mismo para poder seguir gestionándolos
const PERMISOS_BOT_CANAL = bits(['VIEW_CHANNEL', 'MANAGE_CHANNELS', 'MANAGE_WEBHOOKS']);

const TEXTO = 0, VOZ = 2, CATEGORIA = 4;
const TIPOS = { texto: TEXTO, voz: VOZ };
const color = c => (c ? parseInt(String(c).replace('#', ''), 16) : 0);
// Nombre de canal como lo deja Discord: minúsculas y guiones
export const nombreCanal = n => String(n).trim().toLowerCase().replace(/\s+/g, '-');
const igual = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

// ---------- Lo que queremos (sin ids de Discord todavía) ----------

export function deseado(config, familias) {
  // Los roles van de arriba abajo en el orden del archivo; { "familias": true } marca dónde van los de las familias.
  // 'permisos' son los permisos del rol en todo el servidor; sin 'permisos', el script no los toca.
  const roles = [];
  const deFamilias = () => familias.map(f => ({ clave: `familia:${f.id}`, ref: `familia:${f.id}`, nombre: f.nombre, color: color(f.color), separado: true, mencionable: true, permisos: null }));
  for (const r of config.roles) {
    if (r.familias) { roles.push(...deFamilias()); continue; }
    roles.push({ clave: `rol:${r.clave}`, ref: r.clave, nombre: r.nombre, color: color(r.color), separado: !!r.separado, mencionable: !!r.mencionable, permisos: r.permisos ? String(bits(r.permisos)) : null });
  }
  if (!config.roles.some(r => r.familias)) roles.push(...deFamilias());
  // El emoji va delante del nombre («📜・normas»); la clave sale del nombre sin emoji, así que se puede cambiar.
  // Los de texto van en minúsculas y con guiones (como los deja Discord); los de voz, tal cual.
  const conEmoji = (emoji, nombre, sep = '・') => (emoji ? `${emoji}${sep}${nombre}` : nombre);
  const tipoDe = x => {
    const tipo = x.tipo || 'texto';
    if (!(tipo in TIPOS)) throw new Error(`Tipo de canal desconocido: ${tipo} (texto o voz)`);
    return tipo;
  };
  const nombreDe = (tipo, emoji, nombre) => (tipo === 'voz' ? conEmoji(emoji, nombre.trim()) : nombreCanal(conEmoji(emoji, nombre)));
  // Los canales de una familia: uno por cada tipo (público, voz, voz privada...) en el orden de servidor.json
  const deFamilia = (c, f) => Object.entries(c.familias).map(([tipo, t]) => {
    const tipoK = tipoDe(t);
    const base = f.nombre + (t.sufijo ? ` ${t.sufijo}` : '');
    const emoji = t.emojiFamilia && f.emoji ? f.emoji : t.emoji;
    return { clave: `canal:familia:${f.id}${tipo === 'publico' ? '' : `:${tipo}`}`, tipo: tipoK, nombre: nombreDe(tipoK, emoji, base),
      tema: (t.tema || 'La familia {familia}.').replace('{familia}', `${f.nombre}${f.legacy ? ' (Legacy)' : ''}`),
      permisos: { ...(c.permisos || {}), ...(t.permisos || {}) }, familia: f.id };
  });
  const categorias = config.categorias.flatMap(c => {
    // "porFamilia": true → una categoría para cada familia (con su nombre), en vez de todas juntas en una
    if (c.familias && c.porFamilia) {
      // "emojiFamilia": true → el distintivo de cada familia (su 'emoji') en vez del de la categoría
      return familias.map(f => ({ clave: `categoria:familia:${f.id}`, nombre: conEmoji(c.emojiFamilia && f.emoji ? f.emoji : c.emoji, f.nombre, ' '), permisos: c.permisos || {}, canales: deFamilia(c, f) }));
    }
    const canales = c.familias ? familias.flatMap(f => deFamilia(c, f)) : (c.canales || []).map(k => {
      const tipoK = tipoDe(k);
      return { clave: `canal:${k.clave || nombreCanal(k.nombre)}`, tipo: tipoK, nombre: nombreDe(tipoK, k.emoji, k.nombre), tema: tipoK === 'voz' ? '' : (k.tema || ''), permisos: { ...(c.permisos || {}), ...(k.permisos || {}) } };
    });
    return [{ clave: `categoria:${c.clave || c.nombre.toLowerCase()}`, nombre: conEmoji(c.emoji, c.nombre, ' '), permisos: c.permisos || {}, canales }];
  });
  // Un emoji propio del servidor por familia (:ryujin:), con la imagen de discord/imagenes/emojis/<insignia>.png
  const emojis = familias.filter(f => f.insignia).map(f => {
    if (!/^[A-Za-z0-9_]{2,32}$/.test(f.insignia)) throw new Error(`La insignia «${f.insignia}» no vale como nombre de emoji (letras, números y _; de 2 a 32)`);
    return { clave: `emoji:${f.id}`, nombre: f.insignia, archivo: `discord/imagenes/emojis/${f.insignia}.png`, familia: f.id };
  });
  return { nombre: config.nombre, roles, categorias, webhooks: config.webhooks || [], marca: config.marca || {}, emojis };
}

// De { todos: {permitir, denegar}, staff: {...}, familia: {...} } a los permission_overwrites de Discord
function overwrites(permisos, { idRol, everyone, botId, familia }) {
  const lista = [];
  let ocultoATodos = false;
  for (const [quien, p] of Object.entries(permisos)) {
    let id;
    if (quien === 'todos') id = everyone;
    else if (quien === 'familia') { if (!familia) continue; id = idRol(`familia:${familia}`); }
    else id = idRol(quien);
    const allow = bits(p.permitir), deny = bits(p.denegar);
    if (quien === 'todos' && (deny & bits(['VIEW_CHANNEL']))) ocultoATodos = true;
    lista.push({ id, type: 0, allow: String(allow), deny: String(deny) });
  }
  if (ocultoATodos && botId) lista.push({ id: botId, type: 1, allow: String(PERMISOS_BOT_CANAL), deny: '0' });
  return lista;
}
const firma = ows => (ows || []).filter(o => o.allow !== '0' || o.deny !== '0')
  .map(o => `${o.id}:${o.type}:${o.allow}:${o.deny}`).sort().join('|');

// ---------- Hablar con Discord ----------

export class ErrorDiscord extends Error {}

export function crearApi({ token, base = 'https://discord.com/api/v10', esperar = ms => new Promise(r => setTimeout(r, ms)) }) {
  base = base.replace(/\/$/, '');
  async function pedir(metodo, ruta, cuerpo) {
    for (let intento = 0; ; intento++) {
      const res = await fetch(base + ruta, {
        method: metodo,
        headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'DiscordBot (gokudo, 1.0)', 'X-Audit-Log-Reason': 'discord-aplicar' },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      });
      if (res.status === 429 && intento < 5) {
        const datos = await res.json().catch(() => ({}));
        await esperar(Math.min(10, Number(datos.retry_after) || 1) * 1000);
        continue;
      }
      if (res.status === 204) return null;
      const datos = await res.json().catch(() => null);
      if (!res.ok) {
        const extra = res.status === 401 ? ' (¿el DISCORD_BOT_TOKEN está bien?)'
          : datos?.code === 50013 ? ' (al bot le faltan permisos: Gestionar canales, roles y webhooks, y su rol tiene que estar por encima de los que gestiona)'
            : datos?.code === 30008 ? ' (el servidor no tiene más huecos de emojis)'
              : '';
        throw new ErrorDiscord(`Discord respondió ${res.status} a ${metodo} ${ruta}: ${datos?.message || 'error'}${extra}`);
      }
      return datos;
    }
  }
  return { base, pedir, get: r => pedir('GET', r), post: (r, c) => pedir('POST', r, c), patch: (r, c) => pedir('PATCH', r, c), borrar: r => pedir('DELETE', r) };
}

// ---------- Aplicar ----------

export function leerFamilias(archivo = path.join(RAIZ, 'data-proyecto/familias.json')) {
  return JSON.parse(readFileSync(archivo, 'utf8')).familias;
}
export function leerConfig(archivo = path.join(RAIZ, 'discord/servidor.json')) {
  return JSON.parse(readFileSync(archivo, 'utf8'));
}

// Pone (o cambia) VARIABLE=valor en el .env sin tocar el resto
export function guardarEnEnv(archivo, valores) {
  let texto = existsSync(archivo) ? readFileSync(archivo, 'utf8') : '';
  for (const [k, v] of Object.entries(valores)) {
    const linea = `${k}=${v}`;
    const re = new RegExp(`^${k}=.*$`, 'm');
    if (re.test(texto)) texto = texto.replace(re, linea);
    else texto += (texto && !texto.endsWith('\n') ? '\n' : '') + linea + '\n';
  }
  writeFileSync(archivo, texto);
}

// Una imagen del repositorio lista para mandarla a Discord, con su huella para saber si ya está puesta
export function leerImagen(archivo, raiz = RAIZ) {
  const datos = readFileSync(path.join(raiz, archivo));
  const tipo = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif' }[path.extname(archivo).toLowerCase()];
  if (!tipo) throw new Error(`${archivo}: la imagen tiene que ser PNG, JPG o GIF`);
  return { uri: `data:${tipo};base64,${datos.toString('base64')}`, huella: createHash('sha256').update(datos).digest('hex').slice(0, 16), bytes: datos.length };
}

export async function aplicar({ api, config, familias, prueba = false, borrarSobrantes = false, guildId = null,
  archivoEnv = path.join(RAIZ, '.env'), archivoIds = path.join(RAIZ, 'discord/ids.json'), log = console.log }) {
  const quiere = deseado(config, familias);
  const acciones = [];
  const anotar = (accion, que, nombre, detalle = '') => {
    acciones.push({ accion, que, nombre, detalle });
    const verbo = { crear: prueba ? 'Crearía' : 'Creado', cambiar: prueba ? 'Cambiaría' : 'Cambiado', borrar: prueba ? 'Borraría' : 'Borrado', sobra: 'Sobra (no se borra)', guardar: prueba ? 'Guardaría' : 'Guardado' }[accion];
    log(`${verbo} ${que} «${nombre}»${detalle ? `: ${detalle}` : ''}`);
  };

  const yo = await api.get('/users/@me');
  if (!guildId) {
    const servidores = await api.get('/users/@me/guilds');
    if (!servidores.length) throw new ErrorDiscord(`El bot no está en ningún servidor. Invítalo con: https://discord.com/oauth2/authorize?client_id=${yo.id}&scope=bot&permissions=${PERMISOS_BOT}`);
    if (servidores.length > 1) throw new ErrorDiscord(`El bot está en ${servidores.length} servidores (${servidores.map(s => s.name).join(', ')}): pon DISCORD_GUILD_ID en el .env`);
    guildId = servidores[0].id;
  }
  const servidor = await api.get(`/guilds/${guildId}`);
  log(`${prueba ? 'MODO DE PRUEBA (no se cambia nada) · ' : ''}Servidor «${servidor.name}» (${guildId}), bot ${yo.username}`);
  if (servidor.name !== quiere.nombre) log(`Ojo: el servidor se llama «${servidor.name}» y en servidor.json pone «${quiere.nombre}» (el nombre lo cambias tú en Discord).`);

  const ids = existsSync(archivoIds) ? JSON.parse(readFileSync(archivoIds, 'utf8')) : {};
  const idsServidor = ids[guildId] || {};
  const nuevosIds = {};  // los ids de esta pasada: lo que ya no está en el archivo desaparece de ids.json
  // ¿Está ya puesta esta imagen? (lo dice la huella guardada en la pasada anterior)
  const puesta = (clave, img) => idsServidor[`imagen:${clave}`] === img.huella;
  const marcar = (clave, img) => { nuevosIds[`imagen:${clave}`] = img.huella; };

  // Marca: icono del servidor y avatar del bot
  if (quiere.marca.servidor) {
    const img = leerImagen(quiere.marca.servidor);
    if (!servidor.icon || !puesta('servidor', img)) {
      anotar('cambiar', 'el icono del servidor', servidor.name, quiere.marca.servidor);
      if (!prueba) await api.patch(`/guilds/${guildId}`, { icon: img.uri });
    }
    marcar('servidor', img);
  }
  if (quiere.marca.bot) {
    const img = leerImagen(quiere.marca.bot);
    if (!yo.avatar || !puesta('bot', img)) {
      anotar('cambiar', 'el avatar del bot', yo.username, quiere.marca.bot);
      try {
        if (!prueba) await api.patch('/users/@me', { avatar: img.uri });
        marcar('bot', img);
      } catch (e) {
        // Discord solo deja cambiar el avatar unas pocas veces por hora: no paramos todo por eso
        if (!(e instanceof ErrorDiscord)) throw e;
        log(`No se ha podido cambiar el avatar del bot (${e.message}). Discord deja cambiarlo pocas veces por hora: vuelve a lanzarlo más tarde.`);
      }
    } else marcar('bot', img);
  }
  const usados = new Set();
  // Busca lo que ya hay: primero por el id guardado, luego por el nombre
  const buscar = (lista, clave, cumple) => {
    const porId = lista.find(x => x.id === idsServidor[clave] && !usados.has(x.id));
    const hallado = porId || lista.find(x => !usados.has(x.id) && cumple(x));
    if (hallado) usados.add(hallado.id);
    return hallado;
  };

  // Roles
  const roles = await api.get(`/guilds/${guildId}/roles`);
  const idDeRol = {};
  for (const r of quiere.roles) {
    const hay = buscar(roles.filter(x => x.id !== guildId && !x.managed), r.clave, x => igual(x.name, r.nombre));
    const cuerpo = { name: r.nombre, color: r.color, hoist: r.separado, mentionable: r.mencionable, ...(r.permisos !== null && { permissions: r.permisos }) };
    if (!hay) {
      anotar('crear', 'el rol', r.nombre);
      idDeRol[r.ref] = prueba ? `nuevo:${r.clave}` : (await api.post(`/guilds/${guildId}/roles`, cuerpo)).id;
    } else {
      idDeRol[r.ref] = hay.id;
      const cambios = [];
      if (hay.name !== r.nombre) cambios.push(`nombre «${hay.name}» → «${r.nombre}»`);
      if (hay.color !== r.color) cambios.push('color');
      if (hay.hoist !== r.separado) cambios.push(r.separado ? 'se ve aparte' : 'no se ve aparte');
      if (hay.mentionable !== r.mencionable) cambios.push(r.mencionable ? 'mencionable' : 'no mencionable');
      if (r.permisos !== null && String(hay.permissions) !== r.permisos) cambios.push('permisos');
      if (cambios.length) {
        anotar('cambiar', 'el rol', r.nombre, cambios.join(', '));
        if (!prueba) await api.patch(`/guilds/${guildId}/roles/${hay.id}`, cuerpo);
      }
    }
    nuevosIds[r.clave] = idDeRol[r.ref];
  }
  // Orden de los roles: los nuestros como en el archivo, por debajo del rol del bot (un rol solo puede dar los que
  // tiene por debajo, así que esto decide qué puede repartir cada uno). Los que no son nuestros quedan debajo.
  {
    const posRol = Object.fromEntries(roles.map(x => [x.id, x.position]));
    const nuestros = quiere.roles.map(r => idDeRol[r.ref]);
    const tope = Math.min(...roles.filter(x => x.managed).map(x => x.position), Infinity);
    const mal = nuestros.some(id => !(id in posRol) || posRol[id] >= tope) || nuestros.some((id, i) => i && posRol[nuestros[i - 1]] <= posRol[id]);
    if (mal) {
      anotar('cambiar', 'el orden de', 'los roles', quiere.roles.map(r => r.nombre).join(' > '));
      if (!prueba) {
        const otros = roles.filter(x => x.id !== guildId && !x.managed && !nuestros.includes(x.id)).sort((a, b) => b.position - a.position).map(x => x.id);
        // El rol del propio bot va en la lista, arriba del todo: si no, Discord no deja subir los demás por encima
        // de donde está (al crearlos, Discord los deja todos en la misma posición que el del bot)
        const delBot = roles.find(x => x.managed && x.tags?.bot_id === yo.id);
        const lista = [...(delBot ? [delBot.id] : []), ...nuestros, ...otros];
        await api.patch(`/guilds/${guildId}/roles`, lista.map((id, i) => ({ id, position: lista.length - i })));
      }
    }
  }
  const idRol = ref => {
    if (!(ref in idDeRol)) throw new Error(`En los permisos se usa el rol «${ref}», que no está en servidor.json`);
    return idDeRol[ref];
  };

  // Categorías y canales
  const canales = await api.get(`/guilds/${guildId}/channels`);
  const orden = [];  // [{ id, nuevo }] en el orden que queremos
  for (const c of quiere.categorias) {
    const ows = overwrites(c.permisos, { idRol, everyone: guildId, botId: yo.id });
    let hay = buscar(canales.filter(x => x.type === CATEGORIA), c.clave, x => igual(x.name, c.nombre));
    let idCat;
    if (!hay) {
      anotar('crear', 'la categoría', c.nombre);
      idCat = prueba ? `nuevo:${c.clave}` : (await api.post(`/guilds/${guildId}/channels`, { name: c.nombre, type: CATEGORIA, permission_overwrites: ows })).id;
    } else {
      idCat = hay.id;
      const cambios = [];
      if (hay.name !== c.nombre) cambios.push(`nombre «${hay.name}» → «${c.nombre}»`);
      if (firma(hay.permission_overwrites) !== firma(ows)) cambios.push('permisos');
      if (cambios.length) {
        anotar('cambiar', 'la categoría', c.nombre, cambios.join(', '));
        if (!prueba) await api.patch(`/channels/${hay.id}`, { name: c.nombre, permission_overwrites: ows });
      }
    }
    nuevosIds[c.clave] = idCat;
    const hijos = [];
    for (const k of c.canales) {
      const owsK = overwrites(k.permisos, { idRol, everyone: guildId, botId: yo.id, familia: k.familia });
      const tipo = TIPOS[k.tipo];
      const marca = k.tipo === 'voz' ? '' : '#';
      const mismos = canales.filter(x => x.type === tipo);
      const hayK = buscar(mismos, k.clave, x => x.name === k.nombre && x.parent_id === idCat) || buscar(mismos, k.clave, x => x.name === k.nombre);
      const cuerpo = { name: k.nombre, parent_id: idCat, permission_overwrites: owsK, ...(tipo === TEXTO && { topic: k.tema }) };
      let idK;
      if (!hayK) {
        anotar('crear', 'el canal', `${marca}${k.nombre}`, `en ${c.nombre}`);
        idK = prueba ? `nuevo:${k.clave}` : (await api.post(`/guilds/${guildId}/channels`, { ...cuerpo, type: tipo })).id;
      } else {
        idK = hayK.id;
        const cambios = [];
        if (hayK.name !== k.nombre) cambios.push(`nombre ${marca}${hayK.name} → ${marca}${k.nombre}`);
        if (tipo === TEXTO && (hayK.topic || '') !== k.tema) cambios.push('descripción');
        if (hayK.parent_id !== idCat) cambios.push(`pasa a ${c.nombre}`);
        if (firma(hayK.permission_overwrites) !== firma(owsK)) cambios.push('permisos');
        if (cambios.length) {
          anotar('cambiar', 'el canal', `${marca}${k.nombre}`, cambios.join(', '));
          if (!prueba) await api.patch(`/channels/${hayK.id}`, cuerpo);
        }
      }
      nuevosIds[k.clave] = idK;
      hijos.push({ id: idK, tipo });
    }
    orden.push({ id: idCat, hijos });
  }

  // Orden: las categorías como en el archivo, y dentro de cada una sus canales. Discord numera aparte los de texto
  // y los de voz (y siempre enseña primero los de texto), así que el orden se mira y se pone por cada tipo.
  const posicion = Object.fromEntries(canales.map(x => [x.id, x.position]));
  const desordenado = ids => ids.some(id => !(id in posicion)) || ids.some((id, i) => i && posicion[ids[i - 1]] >= posicion[id]);
  const cats = orden.map(o => o.id);
  const sobrantesCat = canales.filter(x => x.type === CATEGORIA && !cats.includes(x.id)).sort((a, b) => a.position - b.position);
  const porTipo = hijos => Object.values(Object.groupBy(hijos, h => h.tipo)).map(g => g.map(h => h.id));
  if (desordenado(cats) || orden.some(o => porTipo(o.hijos).some(desordenado))) {
    anotar('cambiar', 'el orden de', 'categorías y canales', 'como en servidor.json');
    if (!prueba) {
      const lista = [];
      orden.forEach((o, i) => { lista.push({ id: o.id, position: i }); for (const g of porTipo(o.hijos)) g.forEach((h, j) => lista.push({ id: h, position: j })); });
      sobrantesCat.forEach((x, i) => lista.push({ id: x.id, position: cats.length + i }));
      await api.patch(`/guilds/${guildId}/channels`, lista);
    }
  }

  // Lo que hay en Discord y no está en el archivo
  const sobrantes = canales.filter(x => !usados.has(x.id)).sort((a, b) => (a.type === CATEGORIA) - (b.type === CATEGORIA));
  for (const x of sobrantes) {
    const nombre = x.type === CATEGORIA ? x.name : `${x.type === VOZ ? '' : '#'}${x.name}`;
    const que = x.type === CATEGORIA ? 'la categoría' : 'el canal';
    if (!borrarSobrantes) { anotar('sobra', que, nombre); continue; }
    anotar('borrar', que, nombre);
    if (!prueba) await api.borrar(`/channels/${x.id}`);
  }
  for (const r of roles.filter(x => x.id !== guildId && !x.managed && !usados.has(x.id))) {
    if (!borrarSobrantes) { anotar('sobra', 'el rol', r.name); continue; }
    anotar('borrar', 'el rol', r.name);
    if (!prueba) await api.borrar(`/guilds/${guildId}/roles/${r.id}`);
  }

  // Webhooks: se crean si faltan y su dirección va al .env
  const env = {};
  for (const w of quiere.webhooks) {
    const clave = `canal:${nombreCanal(w.canal)}`;
    const idCanal = nuevosIds[clave];
    if (!idCanal) throw new Error(`El webhook ${w.variable} es del canal #${w.canal}, que no está en servidor.json`);
    let hook = null;
    if (!String(idCanal).startsWith('nuevo:')) {
      const hooks = await api.get(`/channels/${idCanal}/webhooks`);
      hook = hooks.find(h => h.type === 1 && h.name === w.nombre && h.token);
    }
    const img = quiere.marca.webhooks ? leerImagen(quiere.marca.webhooks) : null;
    const claveImg = `webhook:${w.variable}`;
    if (!hook) {
      anotar('crear', 'el webhook', `${w.nombre} en #${w.canal}`, w.variable);
      if (img) marcar(claveImg, img);
      if (prueba) continue;
      hook = await api.post(`/channels/${idCanal}/webhooks`, { name: w.nombre, ...(img && { avatar: img.uri }) });
    } else if (img) {
      if (!hook.avatar || !puesta(claveImg, img)) {
        anotar('cambiar', 'la imagen del webhook', `${w.nombre} en #${w.canal}`);
        if (!prueba) await api.patch(`/webhooks/${hook.id}`, { avatar: img.uri });
      }
      marcar(claveImg, img);
    }
    env[w.variable] = `${api.base}/webhooks/${hook.id}/${hook.token}`;
  }
  if (Object.keys(env).length) {
    anotar('guardar', 'en el .env', Object.keys(env).join(', '));
    if (!prueba) guardarEnEnv(archivoEnv, env);
  }

  // Comandos del bot (/reclutar...): se registran en este servidor si faltan o han cambiado. Los que haya y no
  // estén en el archivo se dejan, salvo con --borrar-sobrantes.
  if (config.comandos) {
    const ruta = `/applications/${yo.id}/guilds/${guildId}/commands`;
    const hay = await api.get(ruta);
    const forma = c => JSON.stringify({ name: c.name, description: c.description,
      options: (c.options || []).map(o => ({ type: o.type, name: o.name, description: o.description, required: !!o.required })) });
    const sobran = hay.filter(c => !config.comandos.some(q => q.name === c.name));
    let cambia = false;
    for (const c of config.comandos) {
      const ya = hay.find(x => x.name === c.name);
      if (!ya) { anotar('crear', 'el comando', `/${c.name}`); cambia = true; } else if (forma(ya) !== forma(c)) { anotar('cambiar', 'el comando', `/${c.name}`); cambia = true; }
    }
    for (const c of sobran) { anotar(borrarSobrantes ? 'borrar' : 'sobra', 'el comando', `/${c.name}`); if (borrarSobrantes) cambia = true; }
    const quedan = borrarSobrantes ? [] : sobran.map(c => ({ name: c.name, description: c.description, options: c.options }));
    if (cambia && !prueba) await api.pedir('PUT', ruta, [...config.comandos, ...quedan]);
  }

  // Emojis de las familias: se suben si faltan; si cambia la imagen se borra y se sube otra vez (Discord no deja
  // cambiar la imagen de un emoji). Los emojis que no son de las familias no se tocan.
  if (quiere.emojis.length) {
    const hay = await api.get(`/guilds/${guildId}/emojis`);
    for (const e of quiere.emojis) {
      const img = leerImagen(e.archivo);
      if (img.bytes > 256 * 1024) throw new Error(`${e.archivo} pesa más de 256 KB, el máximo de Discord para un emoji`);
      let ya = hay.find(x => x.id === idsServidor[e.clave]) || hay.find(x => x.name === e.nombre);
      const huellaVieja = idsServidor[`imagen:${e.clave}`];
      if (ya && huellaVieja && huellaVieja !== img.huella) {
        anotar('cambiar', 'el emoji', `:${e.nombre}:`, 'imagen nueva');
        if (!prueba) await api.borrar(`/guilds/${guildId}/emojis/${ya.id}`);
        ya = null;
      } else if (!ya) anotar('crear', 'el emoji', `:${e.nombre}:`);
      if (!ya) {
        nuevosIds[e.clave] = prueba ? `nuevo:${e.clave}` : (await api.post(`/guilds/${guildId}/emojis`, { name: e.nombre, image: img.uri })).id;
      } else {
        nuevosIds[e.clave] = ya.id;
        if (ya.name !== e.nombre) {
          anotar('cambiar', 'el emoji', `:${e.nombre}:`, `nombre :${ya.name}: → :${e.nombre}:`);
          if (!prueba) await api.patch(`/guilds/${guildId}/emojis/${ya.id}`, { name: e.nombre });
        }
      }
      marcar(e.clave, img);
    }
    // La misma insignia al lado del nombre de cada miembro (icono del rol): solo con nivel 2 de mejoras
    if ((servidor.features || []).includes('ROLE_ICONS')) {
      for (const e of quiere.emojis) {
        const img = leerImagen(e.archivo);
        const idR = idDeRol[`familia:${e.familia}`];
        const clave = `rol:${e.familia}`;
        if (!puesta(clave, img)) {
          anotar('cambiar', 'el icono del rol', familias.find(f => f.id === e.familia).nombre);
          if (!prueba) await api.patch(`/guilds/${guildId}/roles/${idR}`, { icon: img.uri });
        }
        marcar(clave, img);
      }
    } else {
      log('Iconos de rol: el servidor no tiene nivel 2 de mejoras, así que los roles de familia se quedan sin insignia al lado del nombre (cuando lo tenga, lánzalo otra vez y se ponen solos).');
    }
  }

  if (!prueba) {
    ids[guildId] = nuevosIds;
    writeFileSync(archivoIds, JSON.stringify(ids, null, 2) + '\n');
  }
  const cuenta = a => acciones.filter(x => x.accion === a).length;
  log(`${prueba ? 'Haría' : 'Hecho'}: ${cuenta('crear')} cosas nuevas, ${cuenta('cambiar')} cambios, ${cuenta('borrar')} borradas` +
    (cuenta('sobra') ? `, ${cuenta('sobra')} sobran (se borran con --borrar-sobrantes)` : '') + '.');
  return { acciones, guildId, env };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const archivoEnv = path.join(RAIZ, '.env');
  if (existsSync(archivoEnv)) process.loadEnvFile(archivoEnv);
  const argumentos = process.argv.slice(2);
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) { console.error('Falta DISCORD_BOT_TOKEN en el .env'); process.exit(1); }
  try {
    await aplicar({
      api: crearApi({ token, base: process.env.DISCORD_URL_API }),
      config: leerConfig(), familias: leerFamilias(), archivoEnv,
      prueba: argumentos.includes('--prueba'), borrarSobrantes: argumentos.includes('--borrar-sobrantes'),
      guildId: process.env.DISCORD_GUILD_ID || null,
    });
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
