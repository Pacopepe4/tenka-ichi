// Conexión con DraftCore: la versión del cliente que exige su servidor (se lee de su web), el rechazo por versión
// antigua y su limitador de conexiones. Todo contra un DraftCore de mentira: una web con la página del draft y sus
// trozos de código, y un servidor de Socket.IO mínimo (lo justo del protocolo, sobre ws) en el mismo puerto.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocketServer } from 'ws';

const CODIGO = 'ABC1234';
const esperar = ms => new Promise(r => setTimeout(r, ms));
let servidor, dc;
// Lo que hace el DraftCore de mentira en cada prueba y lo que va viendo
const falso = { versionEnLaWeb: '9.9.9', versionExigida: '9.9.9', limitado: false, paginas: 0, conexiones: [], uniones: [] };

before(async () => {
  const ws = new WebSocketServer({ noServer: true });
  servidor = http.createServer((req, res) => {
    // La página del draft enlaza sus trozos; la versión va en uno de ellos, minificada como en la de verdad
    if (req.url === `/${CODIGO}`) {
      falso.paginas++;
      res.setHeader('Content-Type', 'text/html');
      return res.end('<html><script src="/_next/static/chunks/aaa.js"></script><script src="/_next/static/chunks/bbb.js"></script></html>');
    }
    if (req.url === '/_next/static/chunks/aaa.js') return res.end('console.log("nada que ver")');
    if (req.url === '/_next/static/chunks/bbb.js') return res.end(`let tk=tb.API_URL,tv="${falso.versionEnLaWeb}";h.current=t_(tk,{path:"/socket.io",auth:{clientVersion:tv},transports:["polling","websocket"]})`);
    res.statusCode = 404;
    res.end();
  });
  servidor.on('upgrade', (req, socket, cabeza) => {
    // Su limitador: contesta 400 al abrir el websocket
    if (falso.limitado) {
      const cuerpo = 'Handshake throttled (penalty)';
      return socket.end(`HTTP/1.1 400 Bad Request\r\nContent-Type: text/html\r\nContent-Length: ${cuerpo.length}\r\n\r\n${cuerpo}`);
    }
    ws.handleUpgrade(req, socket, cabeza, c => {
      c.send('0{"sid":"motor","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}');
      c.on('message', m => {
        const texto = String(m);
        // 40: el cliente pide entrar, con lo que mande en auth
        if (texto.startsWith('40')) {
          const auth = texto.length > 2 ? JSON.parse(texto.slice(2)) : {};
          falso.conexiones.push({ auth, origen: req.headers.origin });
          if (!auth.clientVersion) return c.send('44{"message":"CLIENT_VERSION_REQUIRED: please reload to get the latest client"}');
          if (auth.clientVersion !== falso.versionExigida) return c.send('44{"message":"CLIENT_VERSION_OUTDATED: please reload to get the latest client"}');
          return c.send('40{"sid":"enchufe"}');
        }
        // 42: un evento. Al unirse a un draft, DraftCore manda el draft entero
        if (texto.startsWith('42')) {
          const [evento, datos] = JSON.parse(texto.slice(2));
          if (evento === 'V3-joinDraft') {
            falso.uniones.push(datos);
            c.send(`42${JSON.stringify(['V3-initialize', { draft: { turn: 3, ban1: 'Ahri', ban6: 'Zed', hovered: 'Jinx' } }])}`);
          }
        }
      });
    });
  });
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${servidor.address().port}`;
  Object.assign(process.env, { DRAFTCORE_URL_WEB: url, DRAFTCORE_URL_WS: url, DRAFTCORE_PAUSA_MS: '150' });
  delete process.env.DRAFTCORE_VERSION;
  dc = await import('../server/draftcore.js');
});
after(() => { servidor.closeAllConnections?.(); servidor.close(); });
beforeEach(() => Object.assign(falso, { versionEnLaWeb: '9.9.9', versionExigida: '9.9.9', limitado: false, conexiones: [], uniones: [] }));

// Abre una conexión y va guardando lo que la web le diría al panel
function conectar() {
  const visto = { estados: [], drafts: [] };
  visto.conexion = dc.conectar(CODIGO, { alEstado: e => visto.estados.push(e), alDraft: t => visto.drafts.push(t), alHover: () => {}, alTiempo: () => {} });
  visto.hasta = async (condicion, texto, ms = 4000) => {
    const fin = Date.now() + ms;
    while (Date.now() < fin) { if (condicion()) return; await esperar(20); }
    assert.fail(`No ha llegado: ${texto}. Estados: ${JSON.stringify(visto.estados)}`);
  };
  return visto;
}

test('la versión del cliente se saca de su código, venga escrita tal cual o en una variable minificada', () => {
  assert.equal(dc.versionEnCodigo('t_(tk,{path:"/socket.io",auth:{clientVersion:"0.7.0"}})'), '0.7.0');
  assert.equal(dc.versionEnCodigo('let tk=tb.API_URL,tv="0.7.0";t.s([]);h.current=t_(tk,{auth:{clientVersion:tv}})'), '0.7.0');
  assert.equal(dc.versionEnCodigo("var $v='1.12.3-beta';io(u,{auth:{clientVersion:$v}})"), '1.12.3-beta');
  // Sin versión, o con algo que no lo parece: nada
  assert.equal(dc.versionEnCodigo('console.log("nada")'), null);
  assert.equal(dc.versionEnCodigo('io(u,{auth:{clientVersion:x}})'), null, 'la variable no está en este trozo');
  assert.equal(dc.versionEnCodigo('let v="última";io(u,{auth:{clientVersion:v}})'), null);
  assert.equal(dc.versionEnCodigo(null), null);
});

test('al conectar manda la versión que hay en la web de DraftCore, entra en el draft y traduce lo que llega', async () => {
  const v = conectar();
  await v.hasta(() => v.drafts.length > 0, 'el draft');
  assert.deepEqual(falso.conexiones, [{ auth: { clientVersion: '9.9.9' }, origen: process.env.DRAFTCORE_URL_WEB }]);
  assert.deepEqual(falso.uniones, [{ draftId: CODIGO, url: CODIGO }]);
  assert.deepEqual(v.estados, [{ conectado: true, error: null }]);
  assert.equal(v.drafts[0].turno, 3);
  assert.equal(v.drafts[0].bans.azul[0], 'Ahri');
  assert.equal(v.drafts[0].bans.rojo[0], 'Zed');
  assert.equal(v.drafts[0].hover, 'Jinx');
  v.conexion.cerrar();
});

test('la versión leída se recuerda: conectar otra vez no vuelve a bajar su web', async () => {
  const antes = falso.paginas;
  const v = conectar();
  await v.hasta(() => v.drafts.length > 0, 'el draft');
  assert.equal(falso.paginas, antes);
  v.conexion.cerrar();
});

test('si DraftCore sube de versión, la web la vuelve a leer y entra sola al segundo intento', async () => {
  // Su servidor ya exige la 10.0.0 y su web ya la sirve, pero aquí se recordaba la 9.9.9
  Object.assign(falso, { versionEnLaWeb: '10.0.0', versionExigida: '10.0.0' });
  const v = conectar();
  await v.hasta(() => v.estados.length > 0, 'el rechazo');
  assert.equal(v.estados[0].conectado, false);
  assert.match(v.estados[0].error, /ha cambiado la versión/);
  await v.hasta(() => v.drafts.length > 0, 'el draft, ya con la versión nueva');
  assert.deepEqual(falso.conexiones.map(c => c.auth.clientVersion), ['9.9.9', '10.0.0']);
  assert.deepEqual(v.estados.at(-1), { conectado: true, error: null });
  v.conexion.cerrar();
});

test('si tampoco vale la versión de su web, deja de insistir y lo dice', async () => {
  falso.versionExigida = '11.0.0';   // su web sigue sirviendo otra
  const v = conectar();
  await v.hasta(() => v.estados.length >= 2, 'el segundo rechazo');
  assert.match(v.estados[1].error, /no acepta la versión de cliente/);
  await esperar(500);
  assert.equal(falso.conexiones.length, 2, 'dos intentos y ni uno más: cada rechazo trae penalización');
  v.conexion.cerrar();
});

test('si su limitador corta la conexión, el panel sabe por qué y no ve un «websocket error» a secas', async () => {
  falso.limitado = true;
  const v = conectar();
  await v.hasta(() => v.estados.length > 0, 'el aviso');
  assert.equal(v.estados[0].conectado, false);
  assert.match(v.estados[0].error, /limitando las conexiones/);
  // Al cerrar se dejan los reintentos: después de «Desconectar» no llega nada más
  v.conexion.cerrar();
  falso.limitado = false;
  await esperar(2600);
  assert.equal(falso.conexiones.length, 0);
});

test('DRAFTCORE_VERSION fija la versión a mano, sin mirar su web', async () => {
  process.env.DRAFTCORE_VERSION = '3.2.1';
  try {
    const antes = falso.paginas;
    assert.equal(await dc.versionCliente(CODIGO, { forzar: true }), '3.2.1');
    assert.equal(falso.paginas, antes);
  } finally { delete process.env.DRAFTCORE_VERSION; }
});

test('el código del draft sale del enlace de espectador o del propio código', () => {
  assert.equal(dc.codigoDeEnlace('https://lol.draftcore.net/EN5AQ2N'), 'EN5AQ2N');
  assert.equal(dc.codigoDeEnlace('  lol.draftcore.net/EN5AQ2N?x=1 '), 'EN5AQ2N');
  assert.equal(dc.codigoDeEnlace('EN5AQ2N'), 'EN5AQ2N');
  assert.equal(dc.codigoDeEnlace('https://otra.web/algo'), null);
  assert.equal(dc.codigoDeEnlace(''), null);
});
