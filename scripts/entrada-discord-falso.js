// Discord falso para probar el inicio de sesión del gachapon sin conectar nada de verdad. Imita lo que usa la app:
//   discord.com/oauth2/authorize      → pantalla de permiso (aquí redirige directo)
//   discord.com/api/v10/oauth2/token  → canje del código
//   discord.com/api/v10/users/@me     → el perfil (permiso identify)
// y tiene órdenes de control (/_control/…) para cambiar quién tiene Discord abierto o cancelar la autorización.
// (El Discord falso de los webhooks, para publicar imágenes en un canal, es scripts/discord-falso.js.)
//
// Uso: node scripts/entrada-discord-falso.js [puerto]   (4041 por defecto)
// Luego, la app con DISCORD_URL_WEB=http://localhost:4041 DISCORD_URL_API=http://localhost:4041/api/v10
// DISCORD_URL_CDN=http://localhost:4041/cdn y DISCORD_CLIENT_ID=cliente-prueba DISCORD_CLIENT_SECRET=secreto-prueba.
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const CLIENTE = { id: 'cliente-prueba', secreto: 'secreto-prueba' };

export function crearEntradaDiscordFalsa() {
  const usuarios = new Map([
    // Con nombre visible y avatar
    ['ana', { id: '300000000000000001', username: 'ana_lol', global_name: 'Ana', avatar: 'abc123' }],
    // Sin nombre visible ni avatar: solo el nombre de usuario
    ['beto', { id: '300000000000000002', username: 'beto', global_name: null, avatar: null }],
    // Un nombre que en una hoja de cálculo sería una fórmula
    ['carla', { id: '300000000000000003', username: 'carla', global_name: '=HYPERLINK("http://x.co","a")', avatar: null }],
    // Nombre con caracteres de control y de dirección de texto
    ['dani', { id: '300000000000000004', username: 'dani', global_name: '‮​  +Dani\u0007 ', avatar: 'a_gif99' }],
  ].map(([k, u]) => [k, { discriminator: '0', ...u }]));
  const estado = {
    sesion: 'ana',              // quién tiene Discord abierto en el navegador (lo cambia /_control/sesion)
    denegar: false,             // la próxima autorización se cancela (el usuario pulsa «Cancelar»)
    codigos: new Map(),         // código → { usuario, redirect }
    accesos: new Map(),         // token → usuario
    llamadas: [],               // ruta y User-Agent de cada llamada, para las pruebas
  };
  const token = () => crypto.randomBytes(15).toString('hex');
  const enviar = (res, codigo, datos) => {
    res.writeHead(codigo, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(datos));
  };
  const leerCuerpo = req => new Promise(ok => { let s = ''; req.on('data', d => { s += d; }); req.on('end', () => ok(s)); });

  const servidor = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    estado.llamadas.push({ ruta: `${req.method} ${p}`, agente: req.headers['user-agent'] || '' });
    const texto = await leerCuerpo(req);

    // ---------- discord.com/oauth2/authorize ----------
    if (p === '/oauth2/authorize') {
      const q = url.searchParams;
      if (q.get('client_id') !== CLIENTE.id) return enviar(res, 400, { error: 'invalid_client' });
      if (q.get('response_type') !== 'code' || !(q.get('scope') || '').split(' ').includes('identify')) return enviar(res, 400, { error: 'invalid_scope' });
      const vuelta = new URL(q.get('redirect_uri'));
      vuelta.searchParams.set('state', q.get('state') || '');
      if (estado.denegar) {
        estado.denegar = false;
        vuelta.searchParams.set('error', 'access_denied');
        vuelta.searchParams.set('error_description', 'The resource owner or authorization server denied the request');
      } else {
        const codigo = token();
        estado.codigos.set(codigo, { usuario: estado.sesion, redirect: q.get('redirect_uri') });
        vuelta.searchParams.set('code', codigo);
      }
      res.writeHead(302, { Location: vuelta.toString() });
      return res.end();
    }

    // ---------- discord.com/api/v10 ----------
    if (p === '/api/v10/oauth2/token' && req.method === 'POST') {
      const f = new URLSearchParams(texto);
      if (f.get('client_id') !== CLIENTE.id || f.get('client_secret') !== CLIENTE.secreto) return enviar(res, 401, { error: 'invalid_client' });
      if (f.get('grant_type') !== 'authorization_code') return enviar(res, 400, { error: 'unsupported_grant_type' });
      const c = estado.codigos.get(f.get('code'));
      estado.codigos.delete(f.get('code'));   // un código vale una sola vez
      if (!c || c.redirect !== f.get('redirect_uri')) return enviar(res, 400, { error: 'invalid_grant', error_description: 'Invalid "code" in request.' });
      const acceso = token();
      estado.accesos.set(acceso, c.usuario);
      return enviar(res, 200, { access_token: acceso, token_type: 'Bearer', expires_in: 604800, refresh_token: token(), scope: 'identify' });
    }
    if (p === '/api/v10/users/@me') {
      const u = usuarios.get(estado.accesos.get(String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')));
      if (!u) return enviar(res, 401, { message: '401: Unauthorized', code: 0 });
      return enviar(res, 200, u);
    }

    // ---------- control de las pruebas ----------
    if (p.startsWith('/_control/')) {
      const c = texto ? JSON.parse(texto) : {};
      if (p === '/_control/sesion') { estado.sesion = c.usuario; return enviar(res, 200, { ok: true }); }
      if (p === '/_control/denegar') { estado.denegar = true; return enviar(res, 200, { ok: true }); }
      if (p === '/_control/estado') return enviar(res, 200, { llamadas: estado.llamadas, accesos: estado.accesos.size });
    }
    return enviar(res, 404, { message: '404: Not Found', code: 0 });
  });
  return { servidor, estado, usuarios };
}

// Arrancado a mano: node scripts/entrada-discord-falso.js [puerto]
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const puerto = Number(process.argv[2]) || 4041;
  crearEntradaDiscordFalsa().servidor.listen(puerto, () => {
    console.log(`Discord falso (inicio de sesión) en http://localhost:${puerto}`);
    console.log(`  DISCORD_URL_WEB=http://localhost:${puerto}  DISCORD_URL_API=http://localhost:${puerto}/api/v10  DISCORD_URL_CDN=http://localhost:${puerto}/cdn`);
    console.log(`  DISCORD_CLIENT_ID=${CLIENTE.id}  DISCORD_CLIENT_SECRET=${CLIENTE.secreto}`);
    console.log('  Usuarios: ana, beto (sin nombre visible ni avatar), carla (nombre con fórmula), dani (nombre con caracteres raros)');
  });
}
