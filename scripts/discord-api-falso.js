// Discord de mentira para las pruebas de discord-aplicar: hace de la API REST v10 para un bot que está en un
// servidor recién creado (con sus «Text Channels» y «Voice Channels» de serie). Guarda roles, canales y webhooks
// en memoria y apunta cada petición en estado.peticiones. Con estado.responder se simula una respuesta (un 429...).
// Para los tickets hace también de hilos privados, mensajes y respuestas diferidas a las interacciones (estas no
// llevan el token del bot, como en Discord).
//   node scripts/discord-api-falso.js [puerto]   → DISCORD_URL_API=http://localhost:4060/api/v10 DISCORD_BOT_TOKEN=token-prueba
import http from 'node:http';
import { pathToFileURL } from 'node:url';

export const TOKEN_FALSO = 'token-prueba';

export function crearDiscordApiFalso({ nombre = 'Gokudō' } = {}) {
  let siguiente = 100;
  const nuevoId = () => String(siguiente++);
  const G = '1';
  const BOT = { id: '9', username: 'Gokudō', bot: true, avatar: null };
  const estado = {
    guild: { id: G, name: nombre, icon: null, features: [] },
    roles: [{ id: G, name: '@everyone', color: 0, hoist: false, mentionable: false, managed: false, position: 0, permissions: '1071698660929' },
      { id: '2', name: 'Gokudō', color: 0, hoist: false, mentionable: false, managed: true, position: 1, permissions: '8', tags: { bot_id: '9' } }],
    canales: [
      { id: '3', type: 4, name: 'Text Channels', position: 0, parent_id: null, permission_overwrites: [] },
      { id: '4', type: 0, name: 'general', position: 0, parent_id: '3', topic: null, permission_overwrites: [] },
      { id: '5', type: 4, name: 'Voice Channels', position: 1, parent_id: null, permission_overwrites: [] },
      { id: '6', type: 2, name: 'General', position: 0, parent_id: '5', permission_overwrites: [] },
    ],
    webhooks: [],
    emojis: [],
    comandos: [],
    // Los miembros del servidor: id → { user, roles }
    miembros: {},
    // Mensajes de los canales y los hilos ({ id, channel_id, author, content, embeds, components }) y lo que la web
    // pone en las respuestas diferidas (token de la interacción → último mensaje)
    mensajes: [],
    respuestas: {},
    peticiones: [],
    responder: null,
  };

  const servidor = http.createServer(async (req, res) => {
    const trozos = [];
    for await (const t of req) trozos.push(t);
    const cuerpo = trozos.length ? JSON.parse(Buffer.concat(trozos).toString()) : undefined;
    const ruta = new URL(req.url, 'http://x').pathname.replace(/^\/api\/v10/, '');
    const m = req.method;
    estado.peticiones.push({ metodo: m, ruta, cuerpo });
    const responder = (codigo, datos) => {
      if (codigo === 204) { res.writeHead(204); return res.end(); }
      res.writeHead(codigo, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(datos));
    };
    let x;
    // La respuesta diferida a una interacción: va con el token de la interacción, no con el del bot
    if ((x = /^\/webhooks\/(\d+)\/([^/]+)\/messages\/@original$/.exec(ruta)) && m === 'PATCH') {
      if (estado.responder) { const r = estado.responder; estado.responder = null; return responder(r.estado, r.cuerpo || {}); }
      estado.respuestas[x[2]] = cuerpo;
      return responder(200, { id: nuevoId(), ...cuerpo });
    }
    if (req.headers.authorization !== `Bot ${TOKEN_FALSO}`) return responder(401, { message: '401: Unauthorized', code: 0 });
    if (estado.responder) { const r = estado.responder; estado.responder = null; return responder(r.estado, r.cuerpo || {}); }
    const canal = id => estado.canales.find(c => c.id === id);
    const normal = c => ({ ...c, permission_overwrites: (c.permission_overwrites || []).map(o => ({ ...o, allow: String(o.allow), deny: String(o.deny) })) });

    // Las imágenes (icono, avatar...) llegan como data:image/...;base64: aquí se guarda un «hash» inventado
    const hashDe = uri => (uri ? `h${uri.length}` : null);
    if (m === 'GET' && ruta === '/gateway/bot') return responder(200, { url: estado.gateway || 'ws://127.0.0.1:9', shards: 1 });
    if ((x = /^\/channels\/(\d+)\/typing$/.exec(ruta)) && m === 'POST') return responder(204);
    if (m === 'GET' && ruta === '/users/@me') return responder(200, BOT);
    if (m === 'PATCH' && ruta === '/users/@me') { if ('avatar' in cuerpo) BOT.avatar = hashDe(cuerpo.avatar); return responder(200, BOT); }
    if (m === 'PATCH' && ruta === `/guilds/${G}`) { if ('icon' in cuerpo) estado.guild.icon = hashDe(cuerpo.icon); return responder(200, estado.guild); }
    if (ruta === `/guilds/${G}/emojis`) {
      if (m === 'GET') return responder(200, estado.emojis);
      if (m === 'POST') {
        if (!/^data:image\//.test(cuerpo.image || '')) return responder(400, { message: 'Invalid Form Body', code: 50035 });
        const e = { id: nuevoId(), name: cuerpo.name, imagen: cuerpo.image, animated: false };
        estado.emojis.push(e); return responder(201, e);
      }
    }
    if ((x = /^\/guilds\/1\/emojis\/(\d+)$/.exec(ruta))) {
      const i = estado.emojis.findIndex(e => e.id === x[1]);
      if (i < 0) return responder(404, { message: 'Unknown Emoji', code: 10014 });
      if (m === 'PATCH') { estado.emojis[i].name = cuerpo.name; return responder(200, estado.emojis[i]); }
      if (m === 'DELETE') { estado.emojis.splice(i, 1); return responder(204); }
    }
    if ((x = /^\/webhooks\/(\d+)$/.exec(ruta)) && m === 'PATCH') {
      const w = estado.webhooks.find(h => h.id === x[1]);
      if (!w) return responder(404, { message: 'Unknown Webhook', code: 10015 });
      if ('avatar' in cuerpo) w.avatar = hashDe(cuerpo.avatar);
      return responder(200, w);
    }
    if (m === 'GET' && ruta === '/users/@me/guilds') return responder(200, [{ id: G, name: estado.guild.name }]);
    if (m === 'GET' && ruta === `/guilds/${G}`) return responder(200, estado.guild);
    if (ruta === `/guilds/${G}/roles`) {
      if (m === 'GET') return responder(200, estado.roles);
      if (m === 'POST') {
        // Como en Discord: el rol nuevo se queda en la posición 1, empatado con los demás
        const r = { id: nuevoId(), name: cuerpo.name || 'new role', color: cuerpo.color || 0, hoist: !!cuerpo.hoist, mentionable: !!cuerpo.mentionable, managed: false, position: 1,
          permissions: cuerpo.permissions ?? '1071698660929' };
        estado.roles.push(r); return responder(200, r);
      }
      if (m === 'PATCH') {
        const bot = estado.roles.find(x => x.managed);
        for (const p of cuerpo) {
          const r = estado.roles.find(x => x.id === p.id);
          if (!r) return responder(404, { message: 'Unknown Role', code: 10011 });
          // Como en Discord: el bot no puede subir nada por encima de su rol, salvo que su rol vaya en la misma lista más arriba
          const suyo = cuerpo.find(q => q.id === bot.id);
          const techo = suyo ? Math.max(suyo.position, bot.position) : bot.position;
          if ((r.managed && r.id !== bot.id) || (r.id !== bot.id && p.position >= techo)) return responder(400, { message: 'Missing Permissions', code: 50013 });
        }
        for (const p of cuerpo) estado.roles.find(x => x.id === p.id).position = p.position;
        return responder(200, estado.roles);
      }
    }
    if ((x = /^\/guilds\/1\/roles\/(\d+)$/.exec(ruta))) {
      const i = estado.roles.findIndex(r => r.id === x[1]);
      if (i < 0) return responder(404, { message: 'Unknown Role', code: 10011 });
      if (m === 'PATCH') { const { icon, ...resto } = cuerpo; Object.assign(estado.roles[i], resto, icon !== undefined && { icon: hashDe(icon) }); return responder(200, estado.roles[i]); }
      if (m === 'DELETE') { estado.roles.splice(i, 1); return responder(204); }
    }
    if (ruta === `/guilds/${G}/channels`) {
      if (m === 'GET') return responder(200, estado.canales.map(normal));
      if (m === 'POST') {
        const hermanos = estado.canales.filter(c => (c.type === 4) === (cuerpo.type === 4) && c.parent_id === (cuerpo.parent_id || null));
        const c = { id: nuevoId(), type: cuerpo.type, name: cuerpo.type === 0 ? cuerpo.name.toLowerCase().replace(/\s+/g, '-') : cuerpo.name,
          position: hermanos.length, parent_id: cuerpo.parent_id || null, topic: cuerpo.topic ?? null, permission_overwrites: cuerpo.permission_overwrites || [] };
        estado.canales.push(c); return responder(200, normal(c));
      }
      if (m === 'PATCH') {
        for (const p of cuerpo) { const c = canal(p.id); if (!c) return responder(404, { message: 'Unknown Channel', code: 10003 }); c.position = p.position; }
        return responder(204);
      }
    }
    if ((x = /^\/channels\/(\d+)$/.exec(ruta))) {
      const c = canal(x[1]);
      if (!c) return responder(404, { message: 'Unknown Channel', code: 10003 });
      if (m === 'GET') return responder(200, normal(c));
      if (m === 'PATCH') { Object.assign(c, cuerpo); return responder(200, normal(c)); }
      if (m === 'DELETE') {
        // Como en Discord: al borrar una categoría, sus canales se quedan sin categoría
        estado.canales = estado.canales.filter(k => k.id !== c.id);
        for (const k of estado.canales) if (k.parent_id === c.id) k.parent_id = null;
        return responder(200, c);
      }
    }
    // Hilos privados (tipo 12) dentro de un canal: quién está dentro va en 'miembros'
    if ((x = /^\/channels\/(\d+)\/threads$/.exec(ruta)) && m === 'POST') {
      if (!canal(x[1])) return responder(404, { message: 'Unknown Channel', code: 10003 });
      const h = { id: nuevoId(), type: cuerpo.type, name: cuerpo.name, parent_id: x[1], invitable: cuerpo.invitable, archived: false, locked: false, miembros: [BOT.id], permission_overwrites: [] };
      estado.canales.push(h); return responder(201, h);
    }
    if ((x = /^\/channels\/(\d+)\/thread-members\/(\d+)$/.exec(ruta)) && m === 'PUT') {
      const h = canal(x[1]);
      if (!h) return responder(404, { message: 'Unknown Channel', code: 10003 });
      if (!h.miembros.includes(x[2])) h.miembros.push(x[2]);
      return responder(204);
    }
    if ((x = /^\/channels\/(\d+)\/messages$/.exec(ruta))) {
      const c = canal(x[1]);
      if (!c) return responder(404, { message: 'Unknown Channel', code: 10003 });
      if (m === 'POST') {
        if (c.locked) return responder(403, { message: 'Thread is locked', code: 160005 });
        const msj = { id: nuevoId(), channel_id: x[1], author: BOT, content: cuerpo.content || '', embeds: cuerpo.embeds || [], components: cuerpo.components || [], allowed_mentions: cuerpo.allowed_mentions, message_reference: cuerpo.message_reference };
        estado.mensajes.push(msj); return responder(200, msj);
      }
      if (m === 'GET') {
        const limite = Number(new URL(req.url, 'http://x').searchParams.get('limit')) || 50;
        return responder(200, estado.mensajes.filter(k => k.channel_id === x[1]).reverse().slice(0, limite));
      }
    }
    if ((x = /^\/channels\/(\d+)\/messages\/(\d+)$/.exec(ruta)) && m === 'PATCH') {
      const msj = estado.mensajes.find(k => k.channel_id === x[1] && k.id === x[2]);
      if (!msj) return responder(404, { message: 'Unknown Message', code: 10008 });
      Object.assign(msj, cuerpo); return responder(200, msj);
    }
    if ((x = /^\/channels\/(\d+)\/webhooks$/.exec(ruta))) {
      if (!canal(x[1])) return responder(404, { message: 'Unknown Channel', code: 10003 });
      if (m === 'GET') return responder(200, estado.webhooks.filter(w => w.channel_id === x[1]));
      if (m === 'POST') {
        const w = { id: nuevoId(), type: 1, name: cuerpo.name, avatar: hashDe(cuerpo.avatar), channel_id: x[1], token: `secreto-${siguiente}`, user: BOT };
        estado.webhooks.push(w); return responder(200, w);
      }
    }
    if (ruta === `/applications/${BOT.id}/guilds/${G}/commands`) {
      if (m === 'GET') return responder(200, estado.comandos);
      if (m === 'PUT') {
        // Como Discord: los que no tienen 'required' lo pierden en la respuesta
        estado.comandos = cuerpo.map(c => ({ id: nuevoId(), application_id: BOT.id, ...c,
          options: (c.options || []).map(o => { const { required, ...resto } = o; return required ? o : resto; }) }));
        return responder(200, estado.comandos);
      }
    }
    if ((x = /^\/guilds\/1\/members\/(\d+)\/roles\/(\d+)$/.exec(ruta)) && m === 'PUT') {
      const miembro = estado.miembros[x[1]];
      if (!miembro) return responder(404, { message: 'Unknown Member', code: 10007 });
      if (!estado.roles.some(r => r.id === x[2])) return responder(404, { message: 'Unknown Role', code: 10011 });
      if (!miembro.roles.includes(x[2])) miembro.roles.push(x[2]);
      return responder(204);
    }
    responder(404, { message: '404: Not Found', code: 0 });
  });
  return { servidor, estado };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const puerto = Number(process.argv[2]) || 4060;
  const { servidor } = crearDiscordApiFalso();
  servidor.listen(puerto, () => console.log(`Discord falso: DISCORD_URL_API=http://localhost:${puerto}/api/v10 DISCORD_BOT_TOKEN=${TOKEN_FALSO}`));
}
