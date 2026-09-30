// Pasa los marcos SVG a PNG de 1000×1400 con la ventana del arte y las esquinas transparentes, con las
// letras y 天下一 en la fuente de la marca (originales en diseno/marcos/png/), y a WebP de 700 px, mucho más
// ligeros, donde los busca la web (public/cartas/marcos/).
//   node diseno/marcos/exportar.mjs              → marcos de Jugador, BOOST y el reverso
//   node diseno/marcos/exportar.mjs --guardadas  → además, las guardadas y las propuestas, en diseno/marcos/png/
//   node diseno/marcos/exportar.mjs jugador/S    → solo las piezas cuyo archivo contenga eso (se pueden poner varias)
// Usa Google Chrome o Microsoft Edge sin ventana (o el que diga CHROME) y hace falta conexión para la fuente.
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..');
const ORIGINALES = path.join(AQUI, 'png');
const WEB = path.join(RAIZ, 'public', 'cartas', 'marcos');
const TMP = path.join(AQUI, '.tmp');

const navegador = [process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(existsSync);
if (!navegador) throw new Error('Hace falta Google Chrome o Microsoft Edge (o su ruta en la variable CHROME)');

// ---------- qué se exporta ----------
const TINTA = '#1D1A17', PAPEL = '#F5EFE2', ORO = '#EBD28A';
const COLOR_LETRA = { S: PAPEL, A: TINTA, B: TINTA, C: PAPEL, D: PAPEL };
const letra = t => ({ texto: t, izq: 125, arriba: 198, ancho: 68, alto: 68, tam: 50, color: COLOR_LETRA[t] });
const selloSP = { texto: 'S+', izq: 823, arriba: 71, ancho: 104, alto: 104, tam: 54, color: ORO };
const tenka = (color, arriba) => ({ texto: '天下一', izq: 125, arriba, alto: 60, tam: 54, espacio: 4, color });
const reverso = (color, [izq, arriba, ancho, alto]) => ({ imagenes: true,
  textos: [{ texto: '天下一', izq, arriba, ancho, alto, tam: 66, espacio: 8, color }] });

const PIEZAS = [
  ...['S', 'A', 'B', 'C', 'D'].map(t => ({ svg: `jugador-${t}.svg`, salida: `jugador/${t}.png`, textos: [letra(t)] })),
  ...['S', 'A', 'B'].map(t => ({ svg: `boost-${t}.svg`, salida: `boost/${t}.png`, textos: [letra(t)] })),
  { svg: 'boost-SP.svg', salida: 'boost/SP.png', textos: [selloSP, tenka(ORO, 202)] },
  { svg: 'reverso.svg', salida: 'reverso.png', ...reverso(TINTA, [320, 948, 360, 108]) },
];
const GUARDADAS = [
  { svg: 'propuestas/jugador-S-oro.svg', salida: 'propuestas/jugador-S-oro.png', textos: [letra('S')] },
  { svg: 'guardadas/washi-S.svg', salida: 'guardadas/washi-S.png', textos: [letra('S')] },
  ...['S', 'A', 'B', 'C'].map(t => ({ svg: `guardadas/laca-${t}.svg`, salida: `guardadas/laca-${t}.png`, textos: [letra(t)] })),
  { svg: 'guardadas/laca-SP.svg', salida: 'guardadas/laca-SP.png', textos: [selloSP, tenka(ORO, 202)] },
  { svg: 'guardadas/washi-SP.svg', salida: 'guardadas/washi-SP.png', textos: [selloSP, tenka(TINTA, 206)] },
  { svg: 'guardadas/laca-reverso.svg', salida: 'guardadas/laca-reverso.png', ...reverso(ORO, [316, 944, 368, 116]) },
];

// ---------- página de cada pieza ----------
const url = f => pathToFileURL(f).href;
function pagina(p) {
  const textos = (p.textos || []).map(t => `<div style="position:absolute;left:${t.izq}px;top:${t.arriba}px;height:${t.alto}px;`
    + `${t.ancho ? `width:${t.ancho}px;justify-content:center;` : ''}display:flex;align-items:center;font-size:${t.tam}px;`
    + `letter-spacing:${t.espacio || 0}px;color:${t.color}">${t.texto}</div>`).join('');
  // En el reverso, el sol partido y el logo de Koryu Budo tal cual
  const imagenes = p.imagenes
    ? `<img src="${url(path.join(RAIZ, 'public', 'marca', 'sol-partido-sin-fondo.png'))}" style="position:absolute;left:319px;top:385px;width:361px;height:430px">`
      + `<img src="${url(path.join(RAIZ, 'public', 'marca', 'koryu-budo.png'))}" style="position:absolute;left:424px;top:1119px;width:152px;height:146px">`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@800&display=block" rel="stylesheet">
<style>html,body{margin:0;background:transparent}.c{position:relative;width:1000px;height:1400px;overflow:hidden;
font-family:'Shippori Mincho B1',serif;font-weight:800;line-height:1}</style></head>
<body><div class="c"><img src="${url(path.join(AQUI, 'svg', p.svg))}" style="position:absolute;left:0;top:0;width:1000px;height:1400px">${imagenes}${textos}</div></body></html>`;
}

// ---------- comprobación: tamaño y transparencia donde toca ----------
function leerPNG(archivo) {
  const b = readFileSync(archivo);
  let p = 8, ancho = 0, alto = 0, tipo = 0;
  const idat = [];
  while (p < b.length) {
    const largo = b.readUInt32BE(p), nombre = b.toString('latin1', p + 4, p + 8), datos = b.subarray(p + 8, p + 8 + largo);
    if (nombre === 'IHDR') { ancho = datos.readUInt32BE(0); alto = datos.readUInt32BE(4); tipo = datos[9]; }
    if (nombre === 'IDAT') idat.push(datos);
    p += 12 + largo;
  }
  if (tipo !== 6) return { ancho, alto, alfa: () => 255 };
  const crudo = zlib.inflateSync(Buffer.concat(idat)), fila = ancho * 4, px = Buffer.alloc(alto * fila);
  for (let y = 0; y < alto; y++) {
    const filtro = crudo[y * (fila + 1)], ini = y * (fila + 1) + 1;
    for (let x = 0; x < fila; x++) {
      const a = x >= 4 ? px[y * fila + x - 4] : 0, b2 = y ? px[(y - 1) * fila + x] : 0, c = x >= 4 && y ? px[(y - 1) * fila + x - 4] : 0;
      let v = crudo[ini + x];
      if (filtro === 1) v += a;
      else if (filtro === 2) v += b2;
      else if (filtro === 3) v += (a + b2) >> 1;
      else if (filtro === 4) { const q = a + b2 - c, pa = Math.abs(q - a), pb = Math.abs(q - b2), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b2 : c; }
      px[y * fila + x] = v & 255;
    }
  }
  return { ancho, alto, alfa: (x, y) => px[(y * ancho + x) * 4 + 3] };
}

function exportar(p) {
  const html = path.join(TMP, p.salida.replace(/[\\/]/g, '-') + '.html');
  const salida = path.join(ORIGINALES, p.salida);
  mkdirSync(path.dirname(salida), { recursive: true });
  writeFileSync(html, pagina(p));
  execFileSync(navegador, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--default-background-color=00000000', '--window-size=1000,1400', '--virtual-time-budget=8000',
    `--screenshot=${salida}`, url(html)], { stdio: 'ignore' });
  const png = leerPNG(salida);
  const fallos = [];
  if (png.ancho !== 1000 || png.alto !== 1400) fallos.push(`mide ${png.ancho}×${png.alto}`);
  if (png.alfa(3, 3) !== 0) fallos.push('la esquina no es transparente');
  if (p.imagenes ? png.alfa(500, 600) !== 255 : png.alfa(500, 657) !== 0) fallos.push('la ventana del arte no está bien');
  if (png.alfa(500, 1200) !== 255) fallos.push('la caja de texto no es opaca');
  console.log(`${fallos.length ? '✖' : '✔'} ${path.relative(RAIZ, salida)}${fallos.length ? `: ${fallos.join(', ')}` : ''}`);
  return !fallos.length;
}

// ---------- WebP para la web: 700 px de ancho (de sobra para las cartas, que se ven a menos de 250) ----------
// Se convierte en el propio navegador con un lienzo, que guarda la transparencia. Las imágenes van en la página
// para que el navegador espere a tenerlas todas antes de convertir (y de volcar el resultado)
function aWebp(piezas, ancho = 700, calidad = 0.88) {
  const html = path.join(TMP, 'webp.html');
  const imagenes = piezas.map(p => `<img class="f" src="data:image/png;base64,${readFileSync(path.join(ORIGINALES, p.salida)).toString('base64')}">`).join('');
  writeFileSync(html, `<!doctype html><html><body>${imagenes}<pre id="webp"></pre><script>
window.addEventListener('load', () => {
  const salida = [...document.querySelectorAll('img.f')].map(img => {
    const lienzo = document.createElement('canvas');
    lienzo.width = ${ancho};
    lienzo.height = Math.round(img.naturalHeight * ${ancho} / img.naturalWidth);
    const ctx = lienzo.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    return lienzo.toDataURL('image/webp', ${calidad}).split(',')[1];
  });
  document.querySelectorAll('img.f').forEach(img => img.remove());
  document.getElementById('webp').textContent = salida.join('|');
});
</script></body></html>`);
  const dom = execFileSync(navegador, ['--headless=new', '--disable-gpu', '--virtual-time-budget=30000', '--dump-dom', url(html)],
    { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  const m = dom.match(/<pre id="webp">([^<]*)<\/pre>/);
  if (!m) throw new Error('No se pudieron pasar a WebP');
  m[1].split('|').forEach((b64, i) => {
    const destino = path.join(WEB, piezas[i].salida.replace(/\.png$/, '.webp'));
    mkdirSync(path.dirname(destino), { recursive: true });
    writeFileSync(destino, Buffer.from(b64, 'base64'));
    console.log(`  → ${path.relative(RAIZ, destino)} (${Math.round(Buffer.byteLength(b64, 'base64') / 1024)} KB)`);
  });
}

const filtros = process.argv.slice(2).filter(a => !a.startsWith('--'));
const elegidas = lista => lista.filter(p => !filtros.length || filtros.some(f => p.salida.includes(f)));
mkdirSync(TMP, { recursive: true });
const web = elegidas(PIEZAS);
let bien = web.map(exportar).every(Boolean);
if (bien && web.length) aWebp(web);
if (process.argv.includes('--guardadas')) bien = elegidas(GUARDADAS).map(exportar).every(Boolean) && bien;
rmSync(TMP, { recursive: true, force: true });
if (!bien) process.exit(1);
