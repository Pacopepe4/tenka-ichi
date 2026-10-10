// Google Sheets de mentira para las pruebas: las pocas peticiones que hace server/sheets.js (qué pestañas hay, crear
// una, leer, añadir filas, vaciar y escribir), con lo que de la hoja de verdad puede dar un disgusto:
// - El nombre de una pestaña con espacios, guiones u otros signos tiene que ir entre comillas simples.
// - Lo que se escribe se interpreta como si se tecleara: un número, una fecha o una hora no vuelven como se mandaron
//   («2026-10-10» vuelve «10/10/2026»; «007», «7»). Una celda sin valor (null) se queda como estaba.
// - Al leer no llegan las filas vacías del final ni las celdas vacías del final de cada fila.
// - Una pestaña nueva trae 1000 filas. Al añadir filas la hoja pone las que hagan falta, pero escribir de golpe más
//   allá de la última es un error.
// Con estado.fallar se simula un fallo de Google en una petición: 'antes' de hacerla o 'despues' (queda hecha, pero la
// respuesta es un error).
// También se arranca suelto:  node scripts/sheets-falso.js [puerto]
//   y la web, con GOOGLE_URL_SHEETS=http://localhost:4060 GOOGLE_SHEET_ID=hoja-de-prueba GOOGLE_CREDENTIALS=prueba
import http from 'node:http';
import { pathToFileURL } from 'node:url';

// Lo que hace la hoja con algo tecleado en una celda
export function comoTecleado(v) {
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  const s = String(v);
  let m;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) return `${Number(m[3])}/${Number(m[2])}/${m[1]}`;      // una fecha
  if ((m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s))) return `${Number(m[1])}:${m[2]}:${m[3] || '00'}`;   // una hora
  if (/^-?\d+(\.\d+)?$/.test(s)) return String(Number(s));                                                 // un número
  return s;
}

// «Pestaña!A:Z» o «'Pestaña con espacios'!A1»: sin comillas solo vale un nombre de letras y números
function leerRango(texto) {
  const m = /^'((?:[^']|'')+)'!(.+)$/.exec(texto) || /^([A-Za-z0-9]+)!(.+)$/.exec(texto);
  return m ? { pestana: m[1].replace(/''/g, "'"), celdas: m[2] } : null;
}

// hojas: { Pestaña: [[celda, …], …] }, tal como ya están en la hoja (no se interpretan)
export function crearSheetsFalso({ hojas = {} } = {}) {
  const estado = { hojas: new Map(Object.entries(hojas).map(([p, filas]) => [p, filas.map(f => f.map(String))])), peticiones: [], fallar: null };

  // Las filas que caben en cada pestaña
  const FILAS_DE_UNA_NUEVA = 1000;
  const caben = new Map([...estado.hojas].map(([p, filas]) => [p, filas.length + FILAS_DE_UNA_NUEVA - 1]));

  // Lo que devuelve una lectura: sin lo vacío del final
  const valores = pestana => {
    const filas = estado.hojas.get(pestana).map(f => { const g = [...f]; while (g.length && g.at(-1) === '') g.pop(); return g; });
    while (filas.length && !filas.at(-1).length) filas.pop();
    return filas;
  };
  estado.leer = pestana => (estado.hojas.has(pestana) ? valores(pestana) : null);

  function escribir(pestana, desde, filas) {
    const hoja = estado.hojas.get(pestana);
    filas.forEach((fila, i) => {
      while (hoja.length <= desde + i) hoja.push([]);
      const destino = hoja[desde + i];
      fila.forEach((v, j) => {
        if (v === null || v === undefined) return;
        while (destino.length <= j) destino.push('');
        destino[j] = v === '' ? '' : comoTecleado(v);
      });
    });
  }

  const servidor = http.createServer(async (req, res) => {
    const trozos = [];
    for await (const t of req) trozos.push(t);
    const cuerpo = trozos.length ? JSON.parse(Buffer.concat(trozos).toString('utf8')) : {};
    const responder = (codigo, datos) => { res.writeHead(codigo, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(datos)); };
    const mal = (codigo, message) => responder(codigo, { error: { code: codigo, message } });
    const ruta = new URL(req.url, 'http://x').pathname;
    const deValores = /^\/v4\/spreadsheets\/[^/:]+\/values\/([^/:]+)(?::(append|clear))?$/.exec(ruta);

    let accion = null, pestana = null, rango = null, hacer = null;
    if (/^\/v4\/spreadsheets\/[^/:]+$/.test(ruta) && req.method === 'GET') {
      accion = 'pestanas';
      hacer = () => ({ sheets: [...estado.hojas.keys()].map(title => ({ properties: { title } })) });
    } else if (/^\/v4\/spreadsheets\/[^/:]+:batchUpdate$/.test(ruta) && req.method === 'POST') {
      accion = 'crear';
      pestana = cuerpo.requests?.[0]?.addSheet?.properties?.title;
      if (!pestana) return mal(400, 'Invalid requests[0]: no request set.');
      if (estado.hojas.has(pestana)) return mal(400, `Invalid requests[0].addSheet: A sheet with the name "${pestana}" already exists. Please enter another name.`);
      hacer = () => { estado.hojas.set(pestana, []); caben.set(pestana, FILAS_DE_UNA_NUEVA); return { replies: [{ addSheet: { properties: { title: pestana } } }] }; };
    } else if (deValores) {
      const texto = decodeURIComponent(deValores[1]), partes = leerRango(texto);
      if (!partes || !estado.hojas.has(partes.pestana)) return mal(400, `Unable to parse range: ${texto}`);
      pestana = partes.pestana;
      rango = texto;
      if (req.method === 'GET' && !deValores[2]) {
        accion = 'leer';
        hacer = () => { const values = valores(pestana); return { range: texto, majorDimension: 'ROWS', ...(values.length ? { values } : {}) }; };
      } else if (req.method === 'POST' && deValores[2] === 'append') {
        accion = 'anadir';
        hacer = () => {
          caben.set(pestana, caben.get(pestana) + (cuerpo.values || []).length);
          escribir(pestana, valores(pestana).length, cuerpo.values || []);
          return { updates: { updatedRows: (cuerpo.values || []).length } };
        };
      } else if (req.method === 'POST' && deValores[2] === 'clear') {
        accion = 'vaciar';
        hacer = () => { estado.hojas.set(pestana, []); return { clearedRange: texto }; };
      } else if (req.method === 'PUT' && !deValores[2] && partes.celdas === 'A1') {
        accion = 'escribir';
        const filas = (cuerpo.values || []).length;
        if (filas > caben.get(pestana)) return mal(400, `Range (${texto.replace(/!.*/, '')}!A1:Z${filas}) exceeds grid limits. Max rows: ${caben.get(pestana)}, max columns: 26`);
        hacer = () => { escribir(pestana, 0, cuerpo.values || []); return { updatedRange: texto, updatedRows: (cuerpo.values || []).length }; };
      }
    }
    if (!hacer) return mal(404, `Requested entity was not found: ${req.method} ${ruta}`);

    estado.peticiones.push({ accion, pestana, rango });
    const fallo = estado.fallar?.({ accion, pestana }) || null;
    if (fallo === 'antes') return mal(503, 'The service is currently unavailable.');
    const datos = hacer();
    if (fallo === 'despues') return mal(503, 'The service is currently unavailable.');
    responder(200, datos);
  });

  return {
    estado,
    abrir: (puerto = 0) => new Promise(ok => servidor.listen(puerto, '127.0.0.1', () => ok(`http://127.0.0.1:${servidor.address().port}`))),
    cerrar: () => new Promise(ok => { servidor.closeAllConnections?.(); servidor.close(ok); }),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const url = await crearSheetsFalso().abrir(Number(process.argv[2]) || 4060);
  console.log(`Google Sheets de mentira en ${url}`);
  console.log(`  Para la web: GOOGLE_URL_SHEETS=${url} GOOGLE_SHEET_ID=hoja-de-prueba GOOGLE_CREDENTIALS=prueba`);
}
