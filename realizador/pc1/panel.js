// Interfaz del realizador: una página local que se actualiza sola por Server-Sent Events. La usan los dos PCs
// (la misma página, con lo que sabe cada uno): el botón de empezar el directo, lo que falta para empezar y,
// en el PC 1, la realización (lo que está en antena, tomar el control, próximos planos, jugadas, registro).
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerCuerpo, responder } from '../comun/http.js';

const CARPETA = join(dirname(fileURLToPath(import.meta.url)), 'panel');

// app: acciones de la app (comprobar o instalar una versión nueva, volver a la anterior, cerrar el realizador)
// escena, repetir, captura (PC 2): cambiar la escena de OBS, repetir la última jugada y una imagen de lo que sale
export function arrancarPanel({ puerto, host, foto, control, orden, emision, camaras, app, escena, repetir, captura }) {
  const oyentes = new Set();
  let programado = null;

  const servidor = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(readFileSync(join(CARPETA, 'index.html')));
      }
      if (req.method === 'GET' && (url.pathname === '/icono.png' || url.pathname === '/favicon.ico')) {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=86400' });
        return res.end(readFileSync(join(CARPETA, 'icono.png')));
      }
      if (req.method === 'GET' && url.pathname === '/preview.jpg' && captura) {
        const img = await captura();
        if (!img) return responder(res, { ok: false, error: 'Sin imagen de OBS' }, 503);
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' });
        return res.end(img);
      }
      if (req.method === 'GET' && url.pathname === '/estado') return responder(res, foto());
      if (req.method === 'GET' && url.pathname === '/sse') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        res.write(`data: ${JSON.stringify(foto())}\n\n`);
        oyentes.add(res);
        req.on('close', () => oyentes.delete(res));
        return;
      }
      if (req.method === 'POST' && url.pathname === '/control' && control) {
        await control(await leerCuerpo(req));
        emitir();
        return responder(res, { ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/orden' && orden) {
        await orden(await leerCuerpo(req));
        emitir();
        return responder(res, { ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/emision' && emision) {
        await emision(await leerCuerpo(req));
        emitir();
        return responder(res, { ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/app' && app) {
        const r = await app(await leerCuerpo(req));
        emitir();
        return responder(res, { ok: true, ...(r || {}) });
      }
      if (req.method === 'POST' && url.pathname === '/escena' && escena) {
        await escena(await leerCuerpo(req));
        emitir();
        return responder(res, { ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/repetir' && repetir) {
        await repetir(await leerCuerpo(req));
        emitir();
        return responder(res, { ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/camaras' && camaras) {
        await camaras(await leerCuerpo(req));
        emitir();
        return responder(res, { ok: true });
      }
      responder(res, { ok: false, error: 'No existe' }, 404);
    } catch (e) {
      responder(res, { ok: false, error: e.message }, 500);
    }
  });
  servidor.on('error', e => {
    if (e.code === 'EADDRINUSE') console.error(`El puerto ${puerto} está ocupado: ¿hay otro realizador abierto? Ciérralo y vuelve a abrir este.`);
    else console.error(`Página: ${e.message}`);
  });
  servidor.listen(puerto, host);

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
  const reloj = setInterval(emitir, 1000);
  reloj.unref();

  return {
    emitir,
    servidor,
    parar() {
      clearInterval(reloj);
      clearTimeout(programado);
      for (const r of oyentes) r.end();
      servidor.closeAllConnections?.();
      servidor.close();
    },
  };
}
