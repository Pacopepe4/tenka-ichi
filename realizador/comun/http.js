// Peticiones JSON sin dependencias. El cliente de LoL usa un certificado propio de Riot en 127.0.0.1:2999:
// solo para esa dirección se acepta sin comprobarlo, igual que hace el puente de Gokudō.
import http from 'node:http';
import https from 'node:https';

const LOCALES = new Set(['127.0.0.1', 'localhost', '::1']);

export function pedirJSON(url, { metodo = 'GET', cuerpo, tiempoMs = 3000, cabeceras = {} } = {}) {
  const u = new URL(url);
  const esHttps = u.protocol === 'https:';
  const lib = esHttps ? https : http;
  const datos = cuerpo === undefined ? null : Buffer.from(JSON.stringify(cuerpo));
  return new Promise((resolver, rechazar) => {
    const req = lib.request(u, {
      method: metodo,
      headers: {
        Accept: 'application/json',
        ...(datos ? { 'Content-Type': 'application/json', 'Content-Length': datos.length } : {}),
        ...cabeceras,
      },
      timeout: tiempoMs,
      ...(esHttps && LOCALES.has(u.hostname) ? { rejectUnauthorized: false } : {}),
    }, res => {
      const trozos = [];
      res.on('data', t => trozos.push(t));
      res.on('end', () => {
        const texto = Buffer.concat(trozos).toString('utf8');
        if (res.statusCode >= 400) return rechazar(new Error(`${metodo} ${u.pathname}: ${res.statusCode} ${texto.slice(0, 200)}`));
        if (!texto) return resolver(null);
        try { resolver(JSON.parse(texto)); } catch { resolver(texto); }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`${metodo} ${u.pathname}: sin respuesta en ${tiempoMs} ms`)));
    req.on('error', rechazar);
    if (datos) req.write(datos);
    req.end();
  });
}

// Lee el cuerpo JSON de una petición que llega a nuestros servidores
export function leerCuerpo(req, limite = 1e6) {
  return new Promise((resolver, rechazar) => {
    let total = 0;
    const trozos = [];
    req.on('data', t => {
      total += t.length;
      if (total > limite) { rechazar(new Error('Cuerpo demasiado grande')); req.destroy(); return; }
      trozos.push(t);
    });
    req.on('end', () => {
      const texto = Buffer.concat(trozos).toString('utf8');
      if (!texto) return resolver({});
      try { resolver(JSON.parse(texto)); } catch { rechazar(new Error('JSON no válido')); }
    });
    req.on('error', rechazar);
  });
}

export function responder(res, datos, codigo = 200) {
  const texto = JSON.stringify(datos);
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(texto);
}
