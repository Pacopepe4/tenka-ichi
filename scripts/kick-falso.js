// Kick falso para probar la recompensa «Omamori» sin conectar nada de verdad. Imita lo que usa la app (docs.kick.com):
//   id.kick.com            → /oauth/authorize (con PKCE S256), /oauth/token (código y refresco), /oauth/token/introspect
//   api.kick.com/public/v1 → /users, /channels/rewards y sus canjes (listar los pendientes y aceptarlos), /public-key,
//                            /events/subscriptions (suscribirse a los avisos) y /chat (escribir en el chat)
// y tiene órdenes de control (/_control/…) para simular canjes, tokens caducados, permisos retirados y avisos (webhooks)
// firmados con su propia clave, como los de Kick: /_control/evento manda uno a la dirección de /_control/webhook.
//
// Uso: node scripts/kick-falso.js [puerto]   (4050 por defecto)
// Luego, la app con KICK_URL_ID=http://localhost:4050 y KICK_URL_API=http://localhost:4050/public/v1
// y KICK_CLIENT_ID=kick-cliente-prueba KICK_CLIENT_SECRET=kick-secreto-prueba.
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const CLIENTE_KICK = { id: 'kick-cliente-prueba', secreto: 'kick-secreto-prueba' };
const ulid = () => crypto.randomBytes(13).toString('hex').toUpperCase().slice(0, 26);

export function crearKickFalso() {
  const usuarios = new Map([
    ['gokudo_zoku', { user_id: 5001, name: 'Gokudo_zoku' }],
    ['ana', { user_id: 6001, name: 'ana_kick' }],
    ['beto', { user_id: 6002, name: 'Beto_K' }],
  ].map(([k, u]) => [k, { ...u, email: `${k}@ejemplo.test`, profile_picture: '' }]));
  const porId = id => [...usuarios.values()].find(u => String(u.user_id) === String(id));
  const estado = {
    sesion: 'ana',          // quién tiene Kick abierto en el navegador (lo cambia /_control/sesion)
    denegar: false,         // la próxima autorización se cancela
    codigos: new Map(),     // código → { login, scope, redirect, reto }
    accesos: new Map(),     // token → { login, scopes, caduca }
    refrescos: new Map(),   // token de refresco → { login, scopes }
    recompensas: [],        // { id, canal, title, cost, description, background_color, is_enabled, skip, creada_por }
    canjes: [],             // { id, reward_id, user_id, status, redeemed_at }
    suscripciones: [],      // { id, app_id, broadcaster_user_id, event, version, method }
    chat: [],               // { canal, type, content, reply_to_message_id }
    webhook: null,          // a dónde manda los avisos (la «Webhook URL» de la app)
    rechazar: new Set(),    // avisos a los que Kick no deja suscribirse (para probar el error)
    llamadas: [],
  };
  // Kick firma los avisos con RSA y SHA-256; la web pide la clave pública a /public/v1/public-key
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const clavePublica = publicKey.export({ type: 'spki', format: 'pem' });
  async function mandarAviso({ tipo, datos, id = ulid(), firmaMala = false, momento = new Date().toISOString() }) {
    const cuerpo = JSON.stringify(datos);
    let firma = crypto.sign('sha256', Buffer.from(`${id}.${momento}.${cuerpo}`), privateKey).toString('base64');
    if (firmaMala) firma = crypto.sign('sha256', Buffer.from(`${id}.${momento}.{}`), privateKey).toString('base64');
    const r = await fetch(estado.webhook, { method: 'POST', body: cuerpo, headers: { 'Content-Type': 'application/json',
      'Kick-Event-Message-Id': id, 'Kick-Event-Subscription-Id': ulid(), 'Kick-Event-Signature': firma,
      'Kick-Event-Message-Timestamp': momento, 'Kick-Event-Type': tipo, 'Kick-Event-Version': '1' } });
    return { estado: r.status, id, cuerpo: await r.json().catch(() => null) };
  }
  const token = () => crypto.randomBytes(15).toString('hex');
  const darAcceso = (login, scopes) => {
    const acceso = token(), refresco = token();
    estado.accesos.set(acceso, { login, scopes, caduca: Date.now() + 2 * 3600e3 });
    estado.refrescos.set(refresco, { login, scopes });
    return { access_token: acceso, refresh_token: refresco, expires_in: 7200, scope: scopes.join(' '), token_type: 'Bearer' };
  };
  const enviar = (res, codigo, datos) => {
    if (codigo === 204) { res.writeHead(204); return res.end(); }
    res.writeHead(codigo, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(datos));
  };
  const leerCuerpo = req => new Promise(ok => { let s = ''; req.on('data', d => { s += d; }); req.on('end', () => ok(s)); });
  const error = (res, codigo, message) => enviar(res, codigo, { data: {}, message });
  const recompensaPublica = r => ({ id: r.id, title: r.title, cost: r.cost, description: r.description, background_color: r.background_color,
    is_enabled: r.is_enabled, is_paused: false, is_user_input_required: false, should_redemptions_skip_request_queue: r.skip });

  const servidor = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname, q = url.searchParams;
    estado.llamadas.push(`${req.method} ${p}`);
    const texto = await leerCuerpo(req);

    // ---------- id.kick.com ----------
    if (p === '/oauth/authorize') {
      if (q.get('client_id') !== CLIENTE_KICK.id) return error(res, 400, 'invalid client');
      if (q.get('code_challenge_method') !== 'S256' || !q.get('code_challenge')) return error(res, 400, 'PKCE required');
      const vuelta = new URL(q.get('redirect_uri'));
      vuelta.searchParams.set('state', q.get('state') || '');
      if (estado.denegar) { estado.denegar = false; vuelta.searchParams.set('error', 'access_denied'); }
      else {
        const codigo = token();
        estado.codigos.set(codigo, { login: estado.sesion, scope: (q.get('scope') || '').split(' ').filter(Boolean), redirect: q.get('redirect_uri'), reto: q.get('code_challenge') });
        vuelta.searchParams.set('code', codigo);
      }
      res.writeHead(302, { Location: vuelta.toString() });
      return res.end();
    }
    if (p === '/oauth/token' && req.method === 'POST') {
      const f = new URLSearchParams(texto);
      if (f.get('client_id') !== CLIENTE_KICK.id || f.get('client_secret') !== CLIENTE_KICK.secreto) return error(res, 401, 'invalid client');
      if (f.get('grant_type') === 'authorization_code') {
        const c = estado.codigos.get(f.get('code'));
        estado.codigos.delete(f.get('code'));
        if (!c || c.redirect !== f.get('redirect_uri')) return error(res, 400, 'invalid code');
        const reto = crypto.createHash('sha256').update(f.get('code_verifier') || '').digest('base64url');
        if (reto !== c.reto) return error(res, 400, 'invalid code_verifier');
        return enviar(res, 200, darAcceso(c.login, c.scope));
      }
      if (f.get('grant_type') === 'refresh_token') {
        const r = estado.refrescos.get(f.get('refresh_token'));
        if (!r) return error(res, 400, 'invalid refresh token');
        estado.refrescos.delete(f.get('refresh_token'));
        return enviar(res, 200, darAcceso(r.login, r.scopes));
      }
      return error(res, 400, 'unsupported grant type');
    }
    const acceso = () => {
      const a = estado.accesos.get(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
      return a && a.caduca > Date.now() ? a : null;
    };
    if (p === '/oauth/token/introspect' && req.method === 'POST') {
      const a = acceso();
      return enviar(res, 200, { data: a ? { active: true, client_id: CLIENTE_KICK.id, token_type: 'user', scope: a.scopes.join(' '), exp: Math.round(a.caduca / 1000) } : { active: false }, message: 'OK' });
    }

    // ---------- api.kick.com/public/v1 ----------
    if (p === '/public/v1/public-key') return enviar(res, 200, { data: { public_key: clavePublica }, message: 'OK' });
    if (p.startsWith('/public/v1/')) {
      const a = acceso();
      if (!a) return error(res, 401, 'Unauthorized');
      const yo = usuarios.get(a.login);
      const tiene = s => a.scopes.includes(s);
      const cuerpo = texto ? JSON.parse(texto) : {};
      const ruta = p.slice('/public/v1'.length);

      if (ruta === '/users') {
        if (!tiene('user:read')) return error(res, 403, 'Forbidden: missing scope user:read');
        const ids = q.getAll('id');
        const lista = ids.length ? ids.map(porId).filter(Boolean) : [yo];
        return enviar(res, 200, { data: lista, message: 'OK' });
      }
      if (ruta === '/events/subscriptions') {
        if (!tiene('events:subscribe')) return error(res, 403, 'Forbidden: missing scope events:subscribe');
        const mias = estado.suscripciones.filter(x => x.broadcaster_user_id === yo.user_id);
        if (req.method === 'GET') return enviar(res, 200, { data: mias, message: 'OK' });
        if (req.method === 'POST') {
          if (cuerpo.method !== 'webhook' || !Array.isArray(cuerpo.events)) return error(res, 400, 'invalid body');
          const data = cuerpo.events.map(e => {
            if (estado.rechazar.has(e.name)) return { name: e.name, version: e.version, error: 'event not available' };
            const s = { id: ulid(), app_id: CLIENTE_KICK.id, broadcaster_user_id: yo.user_id, event: e.name, version: e.version, method: 'webhook' };
            estado.suscripciones.push(s);
            return { name: e.name, version: e.version, subscription_id: s.id };
          });
          return enviar(res, 200, { data, message: 'OK' });
        }
        if (req.method === 'DELETE') {
          const ids = q.getAll('id');
          estado.suscripciones = estado.suscripciones.filter(x => !ids.includes(x.id));
          return enviar(res, 204);
        }
      }
      if (ruta === '/chat' && req.method === 'POST') {
        if (!tiene('chat:write')) return error(res, 403, 'Forbidden: missing scope chat:write');
        if (!['user', 'bot'].includes(cuerpo.type) || !cuerpo.content || [...cuerpo.content].length > 500) return error(res, 400, 'invalid message');
        estado.chat.push({ canal: yo.user_id, type: cuerpo.type, content: cuerpo.content, reply_to_message_id: cuerpo.reply_to_message_id || null });
        return enviar(res, 200, { data: { is_sent: true, message_id: crypto.randomUUID() }, message: 'OK' });
      }
      if (ruta.startsWith('/channels/rewards')) {
        const escribir = req.method !== 'GET';
        if (!(tiene('channel:rewards:write') || (!escribir && tiene('channel:rewards:read')))) return error(res, 403, 'Forbidden: missing scope');
        const mias = estado.recompensas.filter(r => r.canal === yo.user_id);
        if (ruta === '/channels/rewards' && req.method === 'GET') return enviar(res, 200, { data: mias.map(r => ({ ...recompensaPublica(r), can_manage: r.creada_por === CLIENTE_KICK.id })), message: 'OK' });
        if (ruta === '/channels/rewards' && req.method === 'POST') {
          if (!cuerpo.title || !(cuerpo.cost >= 1)) return error(res, 400, 'invalid title or cost');
          if (mias.some(r => r.title.toLowerCase() === cuerpo.title.toLowerCase())) return error(res, 400, 'A reward with this title already exists');
          const r = { id: ulid(), canal: yo.user_id, title: cuerpo.title, cost: cuerpo.cost, description: cuerpo.description || '',
            background_color: cuerpo.background_color || '#00e701', is_enabled: cuerpo.is_enabled !== false,
            skip: Boolean(cuerpo.should_redemptions_skip_request_queue), creada_por: CLIENTE_KICK.id };
          estado.recompensas.push(r);
          return enviar(res, 200, { data: recompensaPublica(r), message: 'OK' });
        }
        const m = ruta.match(/^\/channels\/rewards\/([A-Z0-9]+)$/);
        if (m && req.method === 'PATCH') {
          const r = mias.find(x => x.id === m[1]);
          if (!r) return error(res, 404, 'Not Found');
          if (r.creada_por !== CLIENTE_KICK.id) return error(res, 403, 'only the app that created the reward can update it');
          if (cuerpo.cost !== undefined) r.cost = cuerpo.cost;
          return enviar(res, 200, { data: recompensaPublica(r), message: 'OK' });
        }
        if (ruta === '/channels/rewards/redemptions' && req.method === 'GET') {
          const st = q.get('status') || 'pending';
          const lista = estado.canjes.filter(c => mias.some(r => r.id === c.reward_id) && (!q.get('reward_id') || c.reward_id === q.get('reward_id')) && c.status === st);
          // Páginas de 3 para probar el cursor
          const desde = Number(q.get('cursor') ? Buffer.from(q.get('cursor'), 'base64').toString() : 0);
          const pagina = lista.slice(desde, desde + 3);
          const grupos = [...new Set(pagina.map(c => c.reward_id))].map(id => {
            const r = mias.find(x => x.id === id);
            return { reward: { id: r.id, title: r.title, cost: r.cost, description: r.description, can_manage: true },
              redemptions: pagina.filter(c => c.reward_id === id).map(c => ({ id: c.id, redeemed_at: c.redeemed_at, redeemer: { user_id: c.user_id }, status: c.status, user_input: '' })) };
          });
          const siguiente = desde + 3 < lista.length ? Buffer.from(String(desde + 3)).toString('base64') : '';
          return enviar(res, 200, { data: grupos, message: 'OK', pagination: { next_cursor: siguiente } });
        }
        if (ruta === '/channels/rewards/redemptions/accept' && req.method === 'POST') {
          const ids = cuerpo.ids || [];
          if (!ids.length || ids.length > 25 || new Set(ids).size !== ids.length) return error(res, 400, 'ids must have 1 to 25 unique items');
          const fallos = [];
          for (const id of ids) {
            const c = estado.canjes.find(x => x.id === id);
            if (!c) fallos.push({ id, reason: 'NOT_FOUND' });
            else if (c.status !== 'pending') fallos.push({ id, reason: 'NOT_PENDING' });
            else c.status = 'accepted';
          }
          return enviar(res, 200, { data: fallos, message: 'OK' });
        }
      }
      return error(res, 404, 'Not Found');
    }

    // ---------- control de las pruebas ----------
    if (p.startsWith('/_control/')) {
      const c = texto ? JSON.parse(texto) : {};
      if (p === '/_control/sesion') { estado.sesion = c.login; return enviar(res, 200, { ok: true }); }
      if (p === '/_control/denegar') { estado.denegar = true; return enviar(res, 200, { ok: true }); }
      if (p === '/_control/canje') {
        // Un espectador canjea sus puntos por la recompensa «Omamori» del canal; se queda pendiente en la cola
        const canal = usuarios.get('gokudo_zoku'), u = usuarios.get(c.login);
        const r = estado.recompensas.find(x => x.canal === canal.user_id && x.title === (c.titulo || 'Omamori'));
        if (!r || !u) return error(res, 404, 'No hay recompensa o usuario');
        const nuevos = Array.from({ length: c.veces || 1 }, () => ({ id: ulid(), reward_id: r.id, user_id: u.user_id,
          status: r.skip ? 'accepted' : 'pending', redeemed_at: new Date().toISOString() }));
        estado.canjes.push(...nuevos);
        return enviar(res, 200, { ok: true, ids: nuevos.map(n => n.id) });
      }
      if (p === '/_control/recompensa-a-mano') {
        // El canal crea a mano (desde Kick, no desde la app) una recompensa con ese título
        const canal = usuarios.get('gokudo_zoku');
        estado.recompensas.push({ id: ulid(), canal: canal.user_id, title: c.titulo, cost: 100, description: '', background_color: '#00e701', is_enabled: true, skip: false, creada_por: 'kick' });
        return enviar(res, 200, { ok: true });
      }
      if (p === '/_control/caducar') {
        for (const [t, a] of estado.accesos) if (a.login === c.login) estado.accesos.delete(t);
        return enviar(res, 200, { ok: true });
      }
      if (p === '/_control/revocar') {
        for (const [t, a] of estado.accesos) if (a.login === c.login) estado.accesos.delete(t);
        for (const [t, r] of estado.refrescos) if (r.login === c.login) estado.refrescos.delete(t);
        return enviar(res, 200, { ok: true });
      }
      if (p === '/_control/webhook') { estado.webhook = c.url; return enviar(res, 200, { ok: true }); }
      if (p === '/_control/rechazar') { estado.rechazar = new Set(c.eventos || []); return enviar(res, 200, { ok: true }); }
      if (p === '/_control/baja') {   // Kick da de baja una suscripción (el webhook falló más de un día)
        estado.suscripciones = estado.suscripciones.filter(x => x.event !== c.evento);
        return enviar(res, 200, { ok: true });
      }
      if (p === '/_control/evento') {
        if (!estado.webhook) return error(res, 400, 'Falta /_control/webhook');
        return enviar(res, 200, await mandarAviso(c));
      }
      // Un canje del Omamori que llega también por aviso, como hace Kick (channel.reward.redemption.updated)
      if (p === '/_control/canje-avisado') {
        const canal = usuarios.get('gokudo_zoku'), u = usuarios.get(c.login);
        const r = estado.recompensas.find(x => x.canal === canal.user_id && x.title === 'Omamori');
        const canje = { id: ulid(), reward_id: r.id, user_id: u.user_id, status: 'pending', redeemed_at: new Date().toISOString() };
        estado.canjes.push(canje);
        const quien = x => ({ user_id: x.user_id, username: x.name, is_verified: false, profile_picture: '', channel_slug: x.name.toLowerCase().replace(/_/g, '-') });
        const aviso = await mandarAviso({ tipo: 'channel.reward.redemption.updated', datos: { id: canje.id, user_input: '', status: 'pending', redeemed_at: canje.redeemed_at,
          reward: { id: r.id, title: r.title, cost: r.cost, description: r.description }, redeemer: quien(u), broadcaster: quien(canal) } });
        return enviar(res, 200, { ...aviso, canje: canje.id });
      }
      if (p === '/_control/estado') return enviar(res, 200, { recompensas: estado.recompensas, canjes: estado.canjes, llamadas: estado.llamadas,
        suscripciones: estado.suscripciones, chat: estado.chat });
    }
    return error(res, 404, 'Not Found');
  });
  return { servidor, estado, usuarios };
}

// Arrancado a mano: node scripts/kick-falso.js [puerto]
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const puerto = Number(process.argv[2]) || 4050;
  crearKickFalso().servidor.listen(puerto, () => {
    console.log(`Kick falso en http://localhost:${puerto}`);
    console.log(`  KICK_URL_ID=http://localhost:${puerto}  KICK_URL_API=http://localhost:${puerto}/public/v1`);
    console.log(`  KICK_CLIENT_ID=${CLIENTE_KICK.id}  KICK_CLIENT_SECRET=${CLIENTE_KICK.secreto}`);
  });
}
