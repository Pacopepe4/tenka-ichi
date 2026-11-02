// Panel de supervisión (PC 1): una página local con el guion próximo, lo que está en antena y el botón de
// tomar el control. Se actualiza solo por Server-Sent Events.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerCuerpo, responder } from '../comun/http.js';

const CARPETA = join(dirname(fileURLToPath(import.meta.url)), 'panel');

export function arrancarPanel({ puerto, foto, control, orden }) {
  const oyentes = new Set();
  let programado = null;

  const servidor = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(readFileSync(join(CARPETA, 'index.html')));
      }
      if (req.method === 'GET' && url.pathname === '/estado') return responder(res, foto());
      if (req.method === 'GET' && url.pathname === '/sse') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        res.write(`data: ${JSON.stringify(foto())}\n\n`);
        oyentes.add(res);
        req.on('close', () => oyentes.delete(res));
        return;
      }
      if (req.method === 'POST' && url.pathname === '/control') {
        await control(await leerCuerpo(req));
        emitir();
        return responder(res, { ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/orden') {
        await orden(await leerCuerpo(req));
        emitir();
        return responder(res, { ok: true });
      }
      responder(res, { ok: false, error: 'No existe' }, 404);
    } catch (e) {
      responder(res, { ok: false, error: e.message }, 500);
    }
  });
  servidor.listen(puerto);

  // Como mucho 4 envíos por segundo, aunque cambien muchas cosas a la vez
  function emitir() {
    if (programado) return;
    programado = setTimeout(() => {
      programado = null;
      const datos = `data: ${JSON.stringify(foto())}\n\n`;
      for (const r of oyentes) r.write(datos);
    }, 250);
  }
  // Y una vez por segundo para que corran los relojes
  setInterval(emitir, 1000).unref();

  return { emitir, servidor };
}
