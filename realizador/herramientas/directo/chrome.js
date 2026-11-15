// Chrome sin ventana manejado por DevTools (CDP), sin dependencias: lo usan preparar.js (para rehacer el fondo de la
// espera con el generador del kit de redes) y muestras.js (fotos y vídeo de las pantallas, con los fotogramas
// congelados para que salgan siempre iguales).
//
// Chrome: la opción `ruta`, la variable CHROME o el de Program Files.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const CHROME_POR_DEFECTO = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const espera = ms => new Promise(r => setTimeout(r, ms));

export async function abrirChrome({ ruta = process.env.CHROME || CHROME_POR_DEFECTO } = {}) {
  const perfil = mkdtempSync(join(tmpdir(), 'directo-chrome-'));
  const proc = spawn(ruta, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${perfil}`, '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--force-device-scale-factor=1', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank',
  ], { stdio: 'ignore' });
  const puerto = join(perfil, 'DevToolsActivePort');
  for (let i = 0; i < 200 && !existsSync(puerto); i++) await espera(50);
  if (!existsSync(puerto)) { proc.kill(); throw new Error(`Chrome no abre DevTools (${ruta})`); }
  let lineas = [];
  for (let i = 0; i < 40 && lineas.length < 2; i++) { lineas = readFileSync(puerto, 'utf8').trim().split(/\r?\n/); if (lineas.length < 2) await espera(50); }
  const ws = new WebSocket(`ws://127.0.0.1:${lineas[0]}${lineas[1]}`);
  await new Promise((ok, mal) => { ws.onopen = ok; ws.onerror = () => mal(new Error('No conecta con DevTools')); });

  let id = 0;
  const pendientes = new Map();
  const oyentes = new Set();
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.id && pendientes.has(m.id)) {
      const { ok, mal } = pendientes.get(m.id);
      pendientes.delete(m.id);
      if (m.error) mal(new Error(`${m.error.message} (${m.error.code})`)); else ok(m.result);
    } else if (m.method) for (const f of oyentes) f(m);
  };
  const enviar = (method, params = {}, sessionId) => new Promise((ok, mal) => {
    const n = ++id;
    pendientes.set(n, { ok, mal });
    ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const evento = (sessionId, method, ms = 15000) => new Promise((ok, mal) => {
    const f = m => { if (m.sessionId === sessionId && m.method === method) { oyentes.delete(f); clearTimeout(t); ok(m.params); } };
    const t = setTimeout(() => { oyentes.delete(f); mal(new Error(`Sin ${method} en ${ms} ms`)); }, ms);
    oyentes.add(f);
  });

  async function nuevaPagina(ancho = 1920, alto = 1080) {
    const { targetId } = await enviar('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await enviar('Target.attachToTarget', { targetId, flatten: true });
    const s = (m, p) => enviar(m, p, sessionId);
    await s('Page.enable');
    await s('Runtime.enable');
    await s('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: 1, mobile: false });
    await s('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    return {
      enviar: s,
      async ir(url) {
        const carga = evento(sessionId, 'Page.loadEventFired');
        await s('Page.navigate', { url });
        await carga;
      },
      async evaluar(expresion) {
        const r = await s('Runtime.evaluate', { expression: expresion, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
        return r.result.value;
      },
      async foto(formato = 'png', calidad = 92) {
        const { data } = await s('Page.captureScreenshot', { format: formato, ...(formato === 'jpeg' ? { quality: calidad } : {}), fromSurface: true });
        return Buffer.from(data, 'base64');
      },
      cerrar: () => enviar('Target.closeTarget', { targetId }),
    };
  }

  async function cerrar() {
    try { await enviar('Browser.close'); } catch { /* ya cerrado */ }
    ws.close();
    for (let i = 0; i < 40 && proc.exitCode === null; i++) await espera(50);
    if (proc.exitCode === null) proc.kill();
    for (let i = 0; i < 10; i++) { try { rmSync(perfil, { recursive: true, force: true }); break; } catch { await espera(200); } }
  }

  return { nuevaPagina, cerrar };
}
