// Twitch falso para probar el gachapon sin conectar nada de verdad. Imita lo que usa la app:
//   id.twitch.tv  → /oauth2/authorize, /oauth2/token (código, refresco y aplicación), /oauth2/validate
//   api.twitch.tv → /helix/users y las recompensas y canjes de puntos del canal
// y tiene órdenes de control (/_control/…) para simular canjes, tokens caducados o permisos retirados.
//
// Uso: node scripts/twitch-falso.js [puerto]   (4040 por defecto)
// Luego, la app con TWITCH_URL_ID=http://localhost:4040 y TWITCH_URL_API=http://localhost:4040/helix
// y TWITCH_CLIENT_ID=cliente-prueba TWITCH_CLIENT_SECRET=secreto-prueba.
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const CLIENTE = { id: 'cliente-prueba', secreto: 'secreto-prueba' };
const TITULO_RECOMPENSA = 'Sobre de Tenka Ichi';

export function crearTwitchFalso() {
  const usuarios = new Map([
    ['koryubudo', { id: '1001', login: 'koryubudo', display_name: 'KoryuBudo', afiliado: true }],
    ['ana', { id: '2001', login: 'ana', display_name: 'Ana' }],
    ['beto', { id: '2002', login: 'beto', display_name: 'Beto' }],
    ['carla', { id: '2003', login: 'carla', display_name: 'Carla' }],
  ].map(([k, u]) => [k, { ...u, profile_image_url: `https://static.twitch.tv/${u.login}.png` }]));
  const estado = {
    sesion: 'ana',              // quién tiene Twitch abierto en el navegador (lo cambia /_control/sesion)
    denegar: false,             // la próxima autorización se cancela (el usuario pulsa «Cancelar»)
    codigos: new Map(),         // código → { login, scope, redirect }
    accesos: new Map(),         // token → { login | null (aplicación), scopes, caduca }
    refrescos: new Map(),       // token de refresco → { login, scopes }
    recompensas: [],            // { id, broadcaster_id, title, cost, prompt, is_enabled, creada_por }
    canjes: [],                 // { id, broadcaster_id, reward, user_id, user_login, user_name, status, redeemed_at }
    llamadas: [],               // ruta de cada llamada, para las pruebas
  };
  const token = () => crypto.randomBytes(15).toString('hex');
  const darAcceso = (login, scopes) => {
    const acceso = token(), refresco = login ? token() : null;
    estado.accesos.set(acceso, { login, scopes, caduca: Date.now() + 4 * 3600e3 });
    if (refresco) estado.refrescos.set(refresco, { login, scopes });
    return { access_token: acceso, ...(refresco ? { refresh_token: refresco } : {}), expires_in: login ? 14400 : 5000000, scope: scopes, token_type: 'bearer' };
  };

  const enviar = (res, codigo, datos) => {
    if (codigo === 204) { res.writeHead(204); return res.end(); }
    res.writeHead(codigo, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(datos));
  };
  const leerCuerpo = req => new Promise(ok => { let s = ''; req.on('data', d => { s += d; }); req.on('end', () => ok(s)); });
  const error = (res, codigo, message) => enviar(res, codigo, { error: http.STATUS_CODES[codigo], status: codigo, message });

  const servidor = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    estado.llamadas.push(`${req.method} ${p}`);
    const texto = await leerCuerpo(req);

    // ---------- id.twitch.tv ----------
    if (p === '/oauth2/authorize') {
      const q = url.searchParams;
      if (q.get('client_id') !== CLIENTE.id) return error(res, 400, 'invalid client');
      const vuelta = new URL(q.get('redirect_uri'));
      vuelta.searchParams.set('state', q.get('state') || '');
      if (estado.denegar) {
        estado.denegar = false;
        vuelta.searchParams.set('error', 'access_denied');
      } else {
        const codigo = token();
        estado.codigos.set(codigo, { login: estado.sesion, scope: (q.get('scope') || '').split(' ').filter(Boolean), redirect: q.get('redirect_uri') });
        vuelta.searchParams.set('code', codigo);
      }
      res.writeHead(302, { Location: vuelta.toString() });
      return res.end();
    }
    if (p === '/oauth2/token' && req.method === 'POST') {
      const f = new URLSearchParams(texto);
      if (f.get('client_id') !== CLIENTE.id || f.get('client_secret') !== CLIENTE.secreto) return error(res, 403, 'invalid client secret');
      if (f.get('grant_type') === 'authorization_code') {
        const c = estado.codigos.get(f.get('code'));
        estado.codigos.delete(f.get('code'));
        if (!c || c.redirect !== f.get('redirect_uri')) return error(res, 400, 'Invalid authorization code');
        return enviar(res, 200, darAcceso(c.login, c.scope));
      }
      if (f.get('grant_type') === 'refresh_token') {
        const r = estado.refrescos.get(f.get('refresh_token'));
        if (!r) return error(res, 400, 'Invalid refresh token');
        estado.refrescos.delete(f.get('refresh_token'));  // Twitch puede devolver otro token de refresco
        return enviar(res, 200, darAcceso(r.login, r.scopes));
      }
      if (f.get('grant_type') === 'client_credentials') return enviar(res, 200, darAcceso(null, []));
      return error(res, 400, 'unsupported grant type');
    }
    if (p === '/oauth2/validate') {
      const t = String(req.headers.authorization || '').replace(/^(OAuth|Bearer)\s+/i, '');
      const a = estado.accesos.get(t);
      if (!a || a.caduca < Date.now()) return error(res, 401, 'invalid access token');
      const u = a.login ? usuarios.get(a.login) : null;
      return enviar(res, 200, { client_id: CLIENTE.id, login: u?.login || null, user_id: u?.id || null, scopes: a.scopes,
        expires_in: Math.round((a.caduca - Date.now()) / 1000) });
    }

    // ---------- api.twitch.tv/helix ----------
    if (p.startsWith('/helix/')) {
      if (req.headers['client-id'] !== CLIENTE.id) return error(res, 401, 'Client ID and OAuth token do not match');
      const a = estado.accesos.get(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
      if (!a || a.caduca < Date.now()) return error(res, 401, 'Invalid OAuth token');
      const yo = a.login ? usuarios.get(a.login) : null;
      const q = url.searchParams;
      const cuerpo = texto ? JSON.parse(texto) : {};

      if (p === '/helix/users') {
        const logins = q.getAll('login');
        const lista = logins.length ? logins.map(l => usuarios.get(l.toLowerCase())).filter(Boolean) : yo ? [yo] : [];
        return enviar(res, 200, { data: lista.map(({ afiliado, ...u }) => u) });
      }

      // Recompensas y canjes: solo con el token del propio canal, con permiso, y si es afiliado o partner
      if (p.startsWith('/helix/channel_points/')) {
        if (!yo || q.get('broadcaster_id') !== yo.id) return error(res, 403, 'The ID in broadcaster_id must match the user ID found in the request\'s OAuth token.');
        const lectura = req.method === 'GET';
        if (!a.scopes.includes('channel:manage:redemptions') && !(lectura && a.scopes.includes('channel:read:redemptions'))) return error(res, 401, 'Missing scope: channel:manage:redemptions');
        if (!yo.afiliado) return error(res, 403, 'The broadcaster must have partner or affiliate status.');

        if (p === '/helix/channel_points/custom_rewards') {
          const mias = estado.recompensas.filter(r => r.broadcaster_id === yo.id);
          if (req.method === 'GET') {
            const ids = q.getAll('id');
            return enviar(res, 200, { data: mias.filter(r => (!ids.length || ids.includes(r.id)) && (q.get('only_manageable_rewards') !== 'true' || r.creada_por === CLIENTE.id)) });
          }
          if (req.method === 'POST') {
            if (mias.some(r => r.title === cuerpo.title)) return error(res, 400, 'CREATE_CUSTOM_REWARD_DUPLICATE_REWARD');
            if (!cuerpo.title || !(cuerpo.cost >= 1)) return error(res, 400, 'Invalid title or cost');
            const r = { id: crypto.randomUUID(), broadcaster_id: yo.id, broadcaster_login: yo.login, title: cuerpo.title, cost: cuerpo.cost,
              prompt: cuerpo.prompt || '', is_enabled: cuerpo.is_enabled !== false, creada_por: CLIENTE.id };
            estado.recompensas.push(r);
            return enviar(res, 200, { data: [r] });
          }
          if (req.method === 'PATCH') {
            const r = mias.find(x => x.id === q.get('id'));
            if (!r) return error(res, 404, 'Not Found');
            if (r.creada_por !== CLIENTE.id) return error(res, 403, 'The custom reward was created by a different client id');
            Object.assign(r, cuerpo);
            return enviar(res, 200, { data: [r] });
          }
        }
        if (p === '/helix/channel_points/custom_rewards/redemptions') {
          const deLa = estado.canjes.filter(c => c.broadcaster_id === yo.id && c.reward.id === q.get('reward_id'));
          const ids = q.getAll('id');
          if (req.method === 'GET') {
            const lista = deLa.filter(c => (!ids.length || ids.includes(c.id)) && (!q.get('status') || c.status === q.get('status')))
              .slice(0, Math.min(50, Number(q.get('first')) || 20));
            return enviar(res, 200, { data: lista, pagination: {} });
          }
          if (req.method === 'PATCH') {
            if (!ids.length) return error(res, 400, 'Missing required parameter "id"');
            if (!['FULFILLED', 'CANCELED'].includes(cuerpo.status)) return error(res, 400, 'Invalid status');
            const cambiados = deLa.filter(c => ids.includes(c.id) && c.status === 'UNFULFILLED');
            if (!cambiados.length) return error(res, 404, 'Not Found');
            for (const c of cambiados) c.status = cuerpo.status;
            return enviar(res, 200, { data: cambiados });
          }
        }
      }
      return error(res, 404, 'Not Found');
    }

    // ---------- control de las pruebas ----------
    if (p.startsWith('/_control/')) {
      const c = texto ? JSON.parse(texto) : {};
      if (p === '/_control/sesion') { estado.sesion = c.login; return enviar(res, 200, { ok: true }); }
      if (p === '/_control/denegar') { estado.denegar = true; return enviar(res, 200, { ok: true }); }
      if (p === '/_control/afiliado') { usuarios.get(c.login).afiliado = Boolean(c.afiliado); return enviar(res, 200, { ok: true }); }
      if (p === '/_control/canje') {
        // Un espectador canjea sus puntos por la recompensa de la app en el canal
        const canal = usuarios.get('koryubudo'), u = usuarios.get(c.login);
        const r = estado.recompensas.find(x => x.broadcaster_id === canal.id && x.title === TITULO_RECOMPENSA);
        if (!r || !u) return error(res, 404, 'No hay recompensa o usuario');
        const nuevos = Array.from({ length: c.veces || 1 }, () => ({ id: crypto.randomUUID(), broadcaster_id: canal.id, broadcaster_login: canal.login,
          reward: { id: r.id, title: r.title, cost: r.cost }, user_id: u.id, user_login: u.login, user_name: u.display_name,
          status: 'UNFULFILLED', redeemed_at: new Date().toISOString(), user_input: '' }));
        estado.canjes.push(...nuevos);
        return enviar(res, 200, { ok: true, ids: nuevos.map(n => n.id) });
      }
      if (p === '/_control/caducar') {
        // Los tokens de acceso del usuario dejan de valer (han caducado); el de refresco sigue valiendo
        for (const [t, a] of estado.accesos) if (a.login === c.login) estado.accesos.delete(t);
        return enviar(res, 200, { ok: true });
      }
      if (p === '/_control/revocar') {
        // El usuario quita el permiso a la app o cambia la contraseña: no vale ningún token
        for (const [t, a] of estado.accesos) if (a.login === c.login) estado.accesos.delete(t);
        for (const [t, r] of estado.refrescos) if (r.login === c.login) estado.refrescos.delete(t);
        return enviar(res, 200, { ok: true });
      }
      if (p === '/_control/estado') {
        return enviar(res, 200, { recompensas: estado.recompensas, canjes: estado.canjes, llamadas: estado.llamadas,
          validaciones: estado.llamadas.filter(l => l.endsWith('/oauth2/validate')).length,
          refrescos: estado.llamadas.filter(l => l.endsWith('/oauth2/token')).length });
      }
    }
    return error(res, 404, 'Not Found');
  });
  return { servidor, estado, usuarios };
}

// Arrancado a mano: node scripts/twitch-falso.js [puerto]
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const puerto = Number(process.argv[2]) || 4040;
  crearTwitchFalso().servidor.listen(puerto, () => {
    console.log(`Twitch falso en http://localhost:${puerto}`);
    console.log(`  TWITCH_URL_ID=http://localhost:${puerto}  TWITCH_URL_API=http://localhost:${puerto}/helix`);
    console.log(`  TWITCH_CLIENT_ID=${CLIENTE.id}  TWITCH_CLIENT_SECRET=${CLIENTE.secreto}`);
  });
}
