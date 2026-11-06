// Discord de mentira para las pruebas de discord-aplicar: hace de la API REST v10 para un bot que está en un
// servidor recién creado (con sus «Text Channels» y «Voice Channels» de serie). Guarda roles, canales y webhooks
// en memoria y apunta cada petición en estado.peticiones. Con estado.responder se simula una respuesta (un 429...).
//   node scripts/discord-api-falso.js [puerto]   → DISCORD_URL_API=http://localhost:4060/api/v10 DISCORD_BOT_TOKEN=token-prueba
import http from 'node:http';
import { pathToFileURL } from 'node:url';

export const TOKEN_FALSO = 'token-prueba';

export function crearDiscordApiFalso({ nombre = 'Gokudō' } = {}) {
  let siguiente = 100;
  const nuevoId = () => String(siguiente++);
  const G = '1';
  const BOT = { id: '9', username: 'Gokudō', bot: true };
  const estado = {
    guild: { id: G, name: nombre },
    roles: [{ id: G, name: '@everyone', color: 0, hoist: false, mentionable: false, managed: false, position: 0, permissions: '1071698660929' },
      { id: '2', name: 'Gokudō', color: 0, hoist: false, mentionable: false, managed: true, position: 1, permissions: '8', tags: { bot_id: '9' } }],
    canales: [
      { id: '3', type: 4, name: 'Text Channels', position: 0, parent_id: null, permission_overwrites: [] },
      { id: '4', type: 0, name: 'general', position: 0, parent_id: '3', topic: null, permission_overwrites: [] },
      { id: '5', type: 4, name: 'Voice Channels', position: 1, parent_id: null, permission_overwrites: [] },
      { id: '6', type: 2, name: 'General', position: 0, parent_id: '5', permission_overwrites: [] },
    ],
    webhooks: [],
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
    if (req.headers.authorization !== `Bot ${TOKEN_FALSO}`) return responder(401, { message: '401: Unauthorized', code: 0 });
    if (estado.responder) { const r = estado.responder; estado.responder = null; return responder(r.estado, r.cuerpo || {}); }
    const canal = id => estado.canales.find(c => c.id === id);
    const normal = c => ({ ...c, permission_overwrites: (c.permission_overwrites || []).map(o => ({ ...o, allow: String(o.allow), deny: String(o.deny) })) });
    let x;

    if (m === 'GET' && ruta === '/users/@me') return responder(200, BOT);
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
      if (m === 'PATCH') { Object.assign(estado.roles[i], cuerpo); return responder(200, estado.roles[i]); }
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
      if (m === 'PATCH') { Object.assign(c, cuerpo); return responder(200, normal(c)); }
      if (m === 'DELETE') {
        // Como en Discord: al borrar una categoría, sus canales se quedan sin categoría
        estado.canales = estado.canales.filter(k => k.id !== c.id);
        for (const k of estado.canales) if (k.parent_id === c.id) k.parent_id = null;
        return responder(200, c);
      }
    }
    if ((x = /^\/channels\/(\d+)\/webhooks$/.exec(ruta))) {
      if (!canal(x[1])) return responder(404, { message: 'Unknown Channel', code: 10003 });
      if (m === 'GET') return responder(200, estado.webhooks.filter(w => w.channel_id === x[1]));
      if (m === 'POST') {
        const w = { id: nuevoId(), type: 1, name: cuerpo.name, channel_id: x[1], token: `secreto-${siguiente}`, user: BOT };
        estado.webhooks.push(w); return responder(200, w);
      }
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
