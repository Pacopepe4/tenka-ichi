// Lo que comparten las pruebas que arrancan la web de verdad (server/index.js) en otro proceso: un puerto libre, esperar
// a que conteste y pararla. No es un archivo de pruebas (no acaba en .test.js): npm test no lo corre solo.
import net from 'node:net';

const esperar = ms => new Promise(r => setTimeout(r, ms));
const vivo = proceso => proceso && proceso.exitCode === null && proceso.signalCode === null;

// Un puerto que el sistema da por libre. Los tramos fijos de antes (4200 + un número al azar entre 0 y 89…) chocaban
// entre archivos de prueba que corren a la vez y con las pruebas de otras copias del repositorio: la web no arrancaba
// (puerto ocupado) o, peor, la prueba hablaba con la web de otra prueba
export function puertoLibre() {
  return new Promise((ok, mal) => {
    const s = net.createServer();
    s.unref();
    s.on('error', mal);
    s.listen(0, () => { const { port } = s.address(); s.close(() => ok(port)); });
  });
}

// Espera a que la web conteste en /salud. Con el equipo cargado (todas las pruebas a la vez arrancan su web) puede
// tardar bastante más de 12 s, así que el plazo es largo; pero si el proceso se cae antes, falla ya con lo que haya
// dicho, en lugar de agotar el plazo. Lee lo que escribe para que una tubería llena no la bloquee
export async function esperarWeb(proceso, url, ms = 60000) {
  let dicho = '';
  for (const s of [proceso.stdout, proceso.stderr]) s?.on('data', d => { dicho = (dicho + d).slice(-2000); });
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (!vivo(proceso)) throw new Error(`La web no arranca: se ha cerrado (código ${proceso.exitCode ?? proceso.signalCode})\n${dicho}`);
    try { if ((await fetch(`${url}/salud`)).ok) return; } catch {}
    await esperar(150);
  }
  proceso.kill();
  throw new Error(`La web no arranca en ${ms / 1000} s\n${dicho}`);
}

// Para la web y espera a que se cierre. Si ya estaba cerrada (no llegó a arrancar o ya se paró), vuelve al momento:
// esperar su 'exit' dejaba colgado el archivo de pruebas entero
export async function pararWeb(proceso) {
  if (!vivo(proceso)) return;
  const fin = new Promise(r => proceso.once('exit', r));
  proceso.kill();
  await fin;
}
