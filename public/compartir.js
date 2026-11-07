// Imágenes para compartir en Discord: la colección y la alineación de cada coleccionista, la tier list y la
// clasificación de cada jornada del fantasy,
// dibujadas en un lienzo con los mismos marcos, dibujos y textos que la web. Se descargan o se publican en el
// canal de Discord (POST /api/discord/publicar, que pone el texto y comprueba quién publica).
import { logo, cargarClanes } from '/comun.js';
import { emblemaDe } from '/carta.js';

const GOTHIC = "'Zen Kaku Gothic New', 'Yu Gothic', 'Segoe UI', sans-serif";
// La letra de rótulo de Gokudō (títulos y nombres de las cartas), como --rotulo en marca.css
const ROTULO = "'Dela Gothic One', 'Zen Kaku Gothic New', sans-serif";
// La noche de Gokudō: asfalto, callejón y el bermellón de neón (diseño B, 07/11/2026)
const C = { sumi: '#07080C', alzado: '#12131A', linea: '#23242F', washi: '#E7DFD2', hai: '#8D8A99', shu: '#E0303A', tinta: '#1D1A17', oro: '#EBD28A', oroViejo: '#B39A5E', panel: '#0C0D13', gris: '#A7A3B3' };
// El podio del fantasy: oro, plata y bronce, como en la web
const METAL = { 1: C.oro, 2: '#B9C1C8', 3: '#B5814F' };
const COLOR_TIER = { LEGACY: '#EBD28A', 'S+': '#9A6AD0', S: '#BE2A2F', A: '#D9A441', B: '#A9B3BC', C: '#7FA36B', D: '#8A8175' };
const TIERS = ['LEGACY', 'S+', 'S', 'A', 'B', 'C', 'D'];
const ROLES = ['TOP', 'JUNGLA', 'MEDIO', 'ADC', 'SUPPORT'];
const ROL = { TOP: 'Top', JUNGLA: 'Jungla', MEDIO: 'Medio', ADC: 'ADC', SUPPORT: 'Support' };
const ANCHO = 1600, MARGEN = 64, ARRIBA = 236;
const DIRECCION = 'tenka-ichi.onrender.com';

// ---------- utilidades ----------
const cargadas = new Map();
function imagen(src) {
  if (!src) return Promise.resolve(null);
  if (!cargadas.has(src)) {
    cargadas.set(src, new Promise(ok => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ok(null);   // sin esa imagen se dibuja lo demás
      i.src = src;
    }));
  }
  return cargadas.get(src);
}

async function fuentes() {
  await Promise.all([`400 40px ${ROTULO}`, `700 20px ${GOTHIC}`, `400 20px ${GOTHIC}`].map(f => document.fonts.load(f)));
}

function lienzo(alto) {
  const c = document.createElement('canvas');
  c.width = ANCHO;
  c.height = Math.ceil(alto);
  const ctx = c.getContext('2d');
  ctx.fillStyle = C.sumi;
  ctx.fillRect(0, 0, c.width, c.height);
  return [c, ctx];
}

// Como object-fit: cover y contain
function cubrir(ctx, img, x, y, w, h) {
  const r = Math.max(w / img.naturalWidth, h / img.naturalHeight), sw = w / r, sh = h / r;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}
function contener(ctx, img, x, y, w, h) {
  const r = Math.min(w / img.naturalWidth, h / img.naturalHeight), dw = img.naturalWidth * r, dh = img.naturalHeight * r;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

// El texto que cabe en ese ancho, con puntos suspensivos si no
function recortar(ctx, texto, ancho) {
  let t = String(texto ?? '');
  if (ctx.measureText(t).width <= ancho) return t;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > ancho) t = t.slice(0, -1);
  return `${t}…`;
}

function texto(ctx, t, x, y, { fuente, color = C.washi, alinear = 'left', base = 'alphabetic', ancho = null }) {
  ctx.font = fuente;
  ctx.fillStyle = color;
  ctx.textAlign = alinear;
  ctx.textBaseline = base;
  ctx.fillText(ancho ? recortar(ctx, t, ancho) : t, x, y);
}

// Mezcla de dos colores #RRGGBB: cuánto de a (de 0 a 1) sobre b. Como color-mix() en la web
function mezclar(a, b, cuanto) {
  const n = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), [x, y] = [n(a), n(b)];
  return `rgb(${x.map((v, i) => Math.round(v * cuanto + y[i] * (1 - cuanto))).join(', ')})`;
}

// El color de cada clan, para el canto de las fichas. Si no se pueden pedir, las fichas van sin color
let coloresDeClan = null;
const colorDeClan = async id => {
  coloresDeClan ??= cargarClanes().then(({ clanes }) => new Map(clanes.map(c => [c.id, c.color]))).catch(() => new Map());
  return (await coloresDeClan).get(id) || C.linea;
};

// Texto inclinado como la letra de rótulo de la web (transform: skewX(-10deg))
function textoInclinado(ctx, t, x, y, opciones, grados = -10) {
  ctx.save();
  ctx.translate(x, y);
  ctx.transform(1, 0, Math.tan(grados * Math.PI / 180), 1, 0, 0);
  texto(ctx, t, 0, 0, opciones);
  ctx.restore();
}

// Una placa inclinada con un texto en oscuro: la tier de las cartas y las repetidas, como en la web
function placa(ctx, t, x, y, { alto, fondo, fuente, minimo = 0 }) {
  ctx.font = fuente;
  const ancho = Math.max(minimo, ctx.measureText(t).width + alto * 0.5), sesgo = Math.tan(12 * Math.PI / 180) * alto;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, .55)'; ctx.shadowBlur = alto * 0.25; ctx.shadowOffsetY = alto * 0.08;
  ctx.fillStyle = fondo;
  ctx.beginPath();
  ctx.moveTo(x + sesgo, y); ctx.lineTo(x + ancho + sesgo, y); ctx.lineTo(x + ancho, y + alto); ctx.lineTo(x, y + alto);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  texto(ctx, t, x + sesgo / 2 + ancho / 2, y + alto / 2 + alto * 0.04, { fuente, color: C.sumi, alinear: 'center', base: 'middle' });
  return ancho + sesgo;
}

// Las repetidas: una placa de neón con cuántas hay, abajo a la derecha, como en el álbum de la web
function pastillaCantidad(ctx, cantidad, x, y, w, h) {
  if (!(cantidad > 1)) return;
  const u = w / 100, t = `×${cantidad}`, fuente = `400 ${5.4 * u}px ${ROTULO}`, alto = 8.4 * u;
  ctx.font = fuente;
  const ancho = ctx.measureText(t).width + 4.2 * u + Math.tan(12 * Math.PI / 180) * alto;
  placa(ctx, t, x + w - 5 * u - ancho, y + h - 5 * u - alto, { alto, fondo: C.shu, fuente });
}

// Un kamon redondo con su aro de color, como .carta-g .logo
function kamon(ctx, img, cx, cy, r, aro) {
  ctx.save();
  ctx.fillStyle = aro;
  ctx.beginPath(); ctx.arc(cx, cy, r * 1.16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.sumi;
  ctx.beginPath(); ctx.arc(cx, cy, r * 1.08, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  ctx.drawImage(img, cx - r, cy - r, 2 * r, 2 * r);
  ctx.restore();
}

// La raya de neón bermellón, con su brillo
function rayaDeNeon(ctx, x, y, ancho, grosor) {
  ctx.save();
  ctx.shadowColor = 'rgba(224, 48, 58, .8)'; ctx.shadowBlur = 14;
  ctx.fillStyle = C.shu;
  ctx.fillRect(x, y, ancho, grosor);
  ctx.restore();
}

// Cabecera: título en letra de rótulo, línea de datos, el logo de Gokudō (el sol cortado, tal cual) y la raya de neón
async function cabecera(ctx, titulo, subtitulo) {
  textoInclinado(ctx, titulo, MARGEN, 118, { fuente: `400 60px ${ROTULO}`, ancho: ANCHO - 2 * MARGEN - 200 });
  texto(ctx, subtitulo, MARGEN, 166, { fuente: `400 28px ${GOTHIC}`, color: C.hai, ancho: ANCHO - 2 * MARGEN - 190 });
  const logoGokudo = await imagen('/marca/gokudo.png');
  if (logoGokudo) kamon(ctx, logoGokudo, ANCHO - MARGEN - 72, 108, 68, C.shu);
  rayaDeNeon(ctx, MARGEN, 198, ANCHO - 2 * MARGEN, 3);
}

function pie(ctx, alto, ruta) {
  texto(ctx, '極道 · Gokudō', MARGEN, alto - 32, { fuente: `400 24px ${ROTULO}`, color: C.hai });
  texto(ctx, `${DIRECCION}${ruta}`, ANCHO - MARGEN, alto - 32, { fuente: `400 22px ${GOTHIC}`, color: C.hai, alinear: 'right' });
}

const aImagen = (c, tipo = 'image/jpeg') => new Promise(ok => c.toBlob(ok, tipo, 0.9));

// ---------- una carta, igual que en la web ----------
// La carta se dibuja dos veces: en la web con carta.js y carta.css, y aquí en un lienzo para las imágenes de Discord.
// Lo que cambie en un sitio se cambia en el otro en el mismo cambio: tienen que verse igual
export async function dibujarCarta(ctx, c, x, y, w, { cantidad = 1, nombreClan = id => id } = {}) {
  const h = Math.round(w * 1.4), u = w / 100;
  const boost = c.tipo === 'boost', legado = c.tipo === 'legacy';
  const quien = boost || legado ? (c.subtitulo || (legado ? 'Legacy' : 'Boost')) : `${ROL[c.rol] || c.rol} · ${nombreClan(c.clan)}`;
  // Las «full art» van a carta completa, como en la web. Las LEGACY van siempre a carta completa: con su dibujo
  // vertical o, mientras no lo tengan, con el que haya
  const [arte, emblema, vertical] = await Promise.all([imagen(c.arte || (c.clan ? logo(c.clan) : null)), imagen(emblemaDe(c)), imagen(c.fullart)]);
  const completa = vertical || (legado ? arte : null);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, u);
  ctx.clip();
  ctx.fillStyle = C.panel;
  ctx.fillRect(x, y, w, h);
  if (completa) {
    dibujarCompleta(ctx, c, { x, y, w, h, completa, emblema, quien, cantidad, alto: vertical ? 0.5 : 0.3 });
  } else {
    // El dibujo arriba, en cuadrado, con un velo hacia el panel de abajo
    if (arte) cubrir(ctx, arte, x, y, w, w);
    const velo = ctx.createLinearGradient(0, y + w * 0.7, 0, y + w);
    velo.addColorStop(0, 'rgba(7,8,12,0)');
    velo.addColorStop(1, 'rgba(12,13,19,0.9)');
    ctx.fillStyle = velo;
    ctx.fillRect(x, y, w, w);
    // Las S y S+, holográficas: un reflejo que cruza el dibujo
    if (['S', 'S+'].includes(c.tier)) {
      const reflejo = ctx.createLinearGradient(x, y, x + w, y + w * 0.6);
      reflejo.addColorStop(0.22, 'rgba(255,255,255,0)');
      reflejo.addColorStop(0.38, 'rgba(255,255,255,0.16)');
      reflejo.addColorStop(0.46, 'rgba(120,220,255,0.14)');
      reflejo.addColorStop(0.54, 'rgba(255,120,200,0.12)');
      reflejo.addColorStop(0.7, 'rgba(255,255,255,0)');
      ctx.fillStyle = reflejo;
      ctx.fillRect(x, y, w, w);
    }
    // La tier en su placa inclinada y el kamon de la familia en su círculo
    const color = c.tier === 'S' ? C.shu : c.tier === 'S+' ? C.oro : COLOR_TIER[c.tier] || C.hai;
    placa(ctx, c.tier, x + 4.5 * u, y + 4.5 * u, { alto: 11 * u, fondo: color, fuente: `400 ${(c.tier === 'S+' ? 6.4 : 7.4) * u}px ${ROTULO}`, minimo: 17 * u });
    if (emblema) kamon(ctx, emblema, x + w - 11.5 * u, y + 11.5 * u, 7.5 * u, color);
    // Debajo: el nombre en letra de rótulo, inclinado, y el rol con su familia (o lo que hace la BOOST)
    const lineas = c.bonus ? [106, 119, 130] : [107, 122];
    // Los nombres largos, en letra más pequeña (como .nombre-largo en carta.css)
    const tamano = String(c.nombre).length > 10 ? 7.6 : 10.5;
    textoInclinado(ctx, c.nombre, x + 6 * u, y + lineas[0] * u, { fuente: `400 ${tamano * u}px ${ROTULO}`, base: 'middle', ancho: w * 0.86 });
    texto(ctx, quien.toUpperCase(), x + 6 * u, y + lineas[1] * u, { fuente: `700 ${4.6 * u}px ${GOTHIC}`, color: C.gris, base: 'middle', ancho: w * 0.88 });
    if (c.bonus) texto(ctx, c.bonus.etiqueta, x + 6 * u, y + lineas[2] * u, { fuente: `800 ${4.6 * u}px ${GOTHIC}`, base: 'middle', ancho: w * 0.88 });
    // El brillo de la tier en el borde: D y C mate, B con canto de color, A y S con neón, S+ en oro
    ctx.save();
    if (c.tier === 'B') { ctx.fillStyle = COLOR_TIER.B; ctx.fillRect(x, y + h - 1.6 * u, w, 1.6 * u); }
    ctx.strokeStyle = { A: COLOR_TIER.A, S: C.shu, 'S+': C.oro }[c.tier] || C.linea;
    ctx.lineWidth = ['A', 'S', 'S+'].includes(c.tier) ? 1.6 * u : Math.max(1, 0.4 * u);
    if (['S', 'S+'].includes(c.tier)) { ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 3 * u; }
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }
  pastillaCantidad(ctx, cantidad, x, y, w, h);
  ctx.restore();
  return h;
}

// Carta «full art», con las mismas medidas que .carta-g.fullart de carta.css (allí en cqw: centésimas del ancho):
// el dibujo a carta completa con un velo arriba y abajo, un filo de oro, el sello de la tier y el emblema arriba, y
// las estrellas, el nombre, lo que hace y el multiplicador abajo, en claro sobre el dibujo
const ORO_CARTA = '#EBD28A', CLARO_CARTA = '#F5EFE2';
const ESTRELLAS = { 'S+': 6, S: 5, A: 4, B: 3 };
function dibujarCompleta(ctx, c, { x, y, w, h, completa, emblema, quien, cantidad, alto = 0.5 }) {
  const u = w / 100;
  const sombra = (desenfoque, opacidad) => { ctx.shadowColor = `rgba(0, 0, 0, ${opacidad})`; ctx.shadowBlur = desenfoque * u; ctx.shadowOffsetY = desenfoque * u / 3; };
  const sinSombra = () => { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; };
  // Como object-fit: cover con object-position: 50% alto (las LEGACY sin dibujo vertical miran algo más arriba)
  const escala = Math.max(w / completa.naturalWidth, h / completa.naturalHeight), sw = w / escala, sh = h / escala;
  ctx.drawImage(completa, (completa.naturalWidth - sw) / 2, (completa.naturalHeight - sh) * alto, sw, sh, x, y, w, h);
  const velo = ctx.createLinearGradient(0, y, 0, y + h);
  velo.addColorStop(0, 'rgba(22,20,18,0.62)');
  velo.addColorStop(0.18, 'rgba(22,20,18,0)');
  velo.addColorStop(0.56, 'rgba(22,20,18,0)');
  velo.addColorStop(0.88, 'rgba(22,20,18,0.94)');
  ctx.fillStyle = velo;
  ctx.fillRect(x, y, w, h);
  // El filo de oro, con una línea de tinta a cada lado para que se despegue del dibujo
  const filo = (margen, grosor, radio, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = grosor * u;
    ctx.beginPath();
    ctx.roundRect(x + margen * u, y + margen * u, w - 2 * margen * u, h - 2 * margen * u, radio * u);
    ctx.stroke();
  };
  filo(2.2, 0.4, 2.8, 'rgba(29, 26, 23, 0.8)');
  filo(2.8, 0.8, 2.2, ORO_CARTA);
  filo(3.4, 0.4, 1.6, 'rgba(29, 26, 23, 0.55)');

  // Arriba: el sello de la tier, algo girado (en las LEGACY, una placa de oro con la palabra), y el emblema
  ctx.save();
  if (c.tier === 'LEGACY') {
    // Las letras van espaciadas, así que se pintan una a una
    ctx.font = `400 ${4.4 * u}px ${ROTULO}`;
    const letras = [...'LEGACY'], espacio = 0.6 * u;
    const largo = letras.reduce((s, l) => s + ctx.measureText(l).width + espacio, 0), ancho = largo + 7 * u, altoPlaca = 9 * u;
    ctx.translate(x + 6 * u + ancho / 2, y + 6 * u + altoPlaca / 2);
    ctx.rotate(-3 * Math.PI / 180);
    sombra(2.4, 0.5);
    ctx.fillStyle = COLOR_TIER.LEGACY;
    ctx.beginPath();
    ctx.roundRect(-ancho / 2, -altoPlaca / 2, ancho, altoPlaca, 0.9 * u);
    ctx.fill();
    sinSombra();
    let px = -largo / 2 + espacio / 2;
    for (const l of letras) { texto(ctx, l, px, 0.3 * u, { fuente: ctx.font, color: C.sumi, base: 'middle' }); px += ctx.measureText(l).width + espacio; }
  } else {
    // La tier en su placa inclinada, como en la carta con el dibujo arriba
    const color = c.tier === 'S' ? C.shu : c.tier === 'S+' ? C.oro : COLOR_TIER[c.tier] || C.hai;
    placa(ctx, c.tier, x + 6 * u, y + 6 * u, { alto: 11 * u, fondo: color, fuente: `400 ${(c.tier === 'S+' ? 6.4 : 7.4) * u}px ${ROTULO}`, minimo: 17 * u });
  }
  ctx.restore();
  if (emblema) kamon(ctx, emblema, x + w - 12.5 * u, y + 12.5 * u, 6.5 * u, ORO_CARTA);

  // Abajo, de abajo arriba: el multiplicador, lo que hace, el nombre y las estrellas
  const izquierda = x + 8 * u, ancho = w - 16 * u;
  let linea = y + h - 7.5 * u;
  const renglon = (alto, pintar) => { linea -= alto * u; pintar(linea + alto * u / 2); };
  sombra(0.8, 0.9);
  if (c.bonus) renglon(7.7, medio => texto(ctx, c.bonus.etiqueta, izquierda, medio, { fuente: `800 ${4.8 * u}px ${GOTHIC}`, color: CLARO_CARTA, base: 'middle', ancho }));
  renglon(7.7, medio => texto(ctx, quien, izquierda, medio, { fuente: `700 ${4.8 * u}px ${GOTHIC}`, color: ORO_CARTA, base: 'middle', ancho }));
  sombra(1.4, 0.95);
  renglon(11, medio => textoInclinado(ctx, c.nombre, izquierda, medio, { fuente: `400 ${10 * u}px ${ROTULO}`, color: CLARO_CARTA, base: 'middle', ancho }));
  sombra(0.8, 0.9);
  if (ESTRELLAS[c.tier]) renglon(6.4, medio => {
    ctx.font = `400 ${4 * u}px ${GOTHIC}`;
    const paso = ctx.measureText('★').width + 0.9 * u;
    for (let i = 0; i < ESTRELLAS[c.tier]; i++) texto(ctx, '★', izquierda + i * paso, medio, { fuente: ctx.font, color: ORO_CARTA, base: 'middle' });
  });
  sinSombra();
}

const ordenCartas = (a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier)
  || (a.tipo === 'boost') - (b.tipo === 'boost') || (a.clan || '').localeCompare(b.clan || '') || a.nombre.localeCompare(b.nombre);

// ---------- colección ----------
// cartas: las que tiene, cada una con su cantidad; total: cuántas cartas distintas hay en el gachapon
export async function imagenColeccion({ nombre, cartas, total, nombreClan }) {
  await fuentes();
  const orden = [...cartas].sort(ordenCartas);
  const MAXIMO = 40, mostradas = orden.slice(0, MAXIMO), quedan = orden.length - mostradas.length;
  const columnas = mostradas.length <= 5 ? 5 : mostradas.length <= 12 ? 6 : mostradas.length <= 24 ? 8 : 10;
  const hueco = 20, w = Math.floor((ANCHO - 2 * MARGEN - (columnas - 1) * hueco) / columnas), h = Math.round(w * 1.4);
  const filas = Math.max(1, Math.ceil(mostradas.length / columnas));
  const alto = ARRIBA + filas * (h + hueco) - hueco + (quedan > 0 ? 70 : 0) + 110;
  const [c, ctx] = lienzo(alto);
  const porTier = TIERS.map(t => [t, orden.filter(x => x.tier === t).length]).filter(([, n]) => n).map(([t, n]) => `${t} ×${n}`).join('  ·  ');
  await cabecera(ctx, `Colección de ${nombre}`, `${orden.length} de ${total} cartas${porTier ? `  ·  ${porTier}` : ''}`);
  if (!mostradas.length) texto(ctx, 'Todavía no tiene cartas: ¡a abrir sobres!', ANCHO / 2, ARRIBA + h / 2, { fuente: `400 40px ${ROTULO}`, color: C.hai, alinear: 'center' });
  for (let i = 0; i < mostradas.length; i++) {
    await dibujarCarta(ctx, mostradas[i], MARGEN + (i % columnas) * (w + hueco), ARRIBA + Math.floor(i / columnas) * (h + hueco), w,
      { cantidad: mostradas[i].cantidad, nombreClan });
  }
  if (quedan > 0) texto(ctx, `y ${quedan} ${quedan === 1 ? 'carta' : 'cartas'} más`, ANCHO / 2, ARRIBA + filas * (h + hueco) + 36, { fuente: `700 30px ${GOTHIC}`, color: C.hai, alinear: 'center' });
  pie(ctx, alto, '/gachapon/');
  return aImagen(c);
}

// ---------- alineación ----------
// alineacion: { TOP: carta|null, … } con las cartas enteras; puntos: { TOP: n, … };
// boosts: { TOP: carta BOOST, … }, la BOOST que lleva el jugador de cada rol (si lleva)
export async function imagenAlineacion({ nombre, alineacion, puntos = {}, boosts = {}, total = 0, puesto = null, nombreClan }) {
  await fuentes();
  const w = 264, hueco = (ANCHO - 2 * MARGEN - 5 * w) / 4, h = Math.round(w * 1.4);
  const hayBoost = ROLES.some(r => alineacion[r] && boosts[r]), altoBoost = 92;
  const alto = ARRIBA + 58 + h + 72 + (hayBoost ? altoBoost + 16 : 0) + 100;
  const [c, ctx] = lienzo(alto);
  const n = x => Number(x || 0).toLocaleString('es-ES');
  await cabecera(ctx, `Alineación de ${nombre}`, `Fantasy de Gokudō  ·  ${n(total)} ${total === 1 ? 'punto' : 'puntos'}${puesto ? `  ·  ${puesto}.º en la clasificación` : ''}`);
  for (const [i, rol] of ROLES.entries()) {
    const x = MARGEN + i * (w + hueco), y = ARRIBA + 58;
    texto(ctx, ROL[rol], x + w / 2, ARRIBA + 38, { fuente: `400 32px ${ROTULO}`, alinear: 'center' });
    const carta = alineacion[rol];
    if (carta) {
      await dibujarCarta(ctx, carta, x, y, w, { nombreClan });
      texto(ctx, `${n(puntos[rol])} ${puntos[rol] === 1 ? 'punto' : 'puntos'}`, x + w / 2, y + h + 44, { fuente: `700 28px ${GOTHIC}`, color: C.hai, alinear: 'center' });
      // Su BOOST: una placa con la carta en pequeño, el nombre y lo que hace
      const boost = boosts[rol];
      if (boost) {
        const by = y + h + 72, mini = 58;
        ctx.fillStyle = C.alzado;
        ctx.beginPath();
        ctx.roundRect(x, by, w, altoBoost, 8);
        ctx.fill();
        await dibujarCarta(ctx, boost, x + 8, by + (altoBoost - mini * 1.4) / 2, mini, { nombreClan });
        texto(ctx, boost.nombre, x + mini + 20, by + 40, { fuente: `400 26px ${ROTULO}`, ancho: w - mini - 30 });
        texto(ctx, boost.bonus?.etiqueta || 'BOOST', x + mini + 20, by + 68, { fuente: `700 19px ${GOTHIC}`, color: C.hai, ancho: w - mini - 30 });
      }
    } else {
      ctx.save();
      ctx.setLineDash([12, 10]);
      ctx.strokeStyle = C.linea;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(x + 1.5, y + 1.5, w - 3, h - 3, 10);
      ctx.stroke();
      ctx.restore();
      texto(ctx, 'Sin elegir', x + w / 2, y + h / 2, { fuente: `700 26px ${GOTHIC}`, color: C.hai, alinear: 'center', base: 'middle' });
    }
  }
  pie(ctx, alto, '/gachapon/');
  return aImagen(c);
}

// ---------- tier list ----------
// jugadores: [{ id, clan, rol, nombre, tier }]; equipos: [{ id, nombre, tier }]
// La del staff va de S a D; la que hace cada espectador en la portada, de S+ a D y con su nombre en el título
export async function imagenTierlist({ jugadores, equipos = [], nombreClan, titulo = 'Tier list de Gokudō', tiers = ['S', 'A', 'B', 'C', 'D'], ruta = '/#tierlist' }) {
  await fuentes();
  const conTier = lista => tiers.map(t => [t, lista.filter(x => x.tier === t)]).filter(([, l]) => l.length);
  const filasJugadores = conTier(jugadores.filter(j => j.nombre)), filasEquipos = conTier(equipos);
  const etiqueta = 110, hueco = 12, fichaW = 262, fichaH = 76;
  const relleno = 12;   // el aire de la placa de cada tier alrededor de sus fichas
  const porLinea = Math.floor((ANCHO - 2 * MARGEN - etiqueta - 12 - relleno + hueco) / (fichaW + hueco));
  const altoFila = l => Math.max(1, Math.ceil(l.length / porLinea)) * (fichaH + hueco) - hueco;
  const altoSeccion = filas => filas.reduce((s, [, l]) => s + altoFila(l) + 2 * relleno + 12, 0);
  const alto = ARRIBA + altoSeccion(filasJugadores) + (filasEquipos.length ? 90 + altoSeccion(filasEquipos) : 0) + 100;
  const [c, ctx] = lienzo(alto);
  await cabecera(ctx, titulo, `${filasJugadores.reduce((s, [, l]) => s + l.length, 0)} jugadores${filasEquipos.length ? `  ·  ${equipos.filter(e => e.tier).length} equipos` : ''}`);

  // Como en la web: la placa de cada tier se tiñe de su color, la letra va en un bloque cortado en diagonal, la S
  // lleva el filo de oro y cada ficha, el color de su clan en el canto
  const seccion = async (filas, y, ficha, clanDe) => {
    for (const [t, lista] of filas) {
      const altoP = altoFila(lista) + 2 * relleno, anchoP = ANCHO - 2 * MARGEN;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(MARGEN, y, anchoP, altoP, 6);
      ctx.clip();
      const tinte = ctx.createLinearGradient(MARGEN, 0, MARGEN + anchoP, 0);
      tinte.addColorStop(0, mezclar(COLOR_TIER[t], C.alzado, 0.2)); tinte.addColorStop(0.6, C.alzado);
      ctx.fillStyle = tinte;
      ctx.fillRect(MARGEN, y, anchoP, altoP);
      ctx.fillStyle = COLOR_TIER[t];
      ctx.beginPath();
      ctx.moveTo(MARGEN, y); ctx.lineTo(MARGEN + etiqueta, y); ctx.lineTo(MARGEN + etiqueta - 24, y + altoP); ctx.lineTo(MARGEN, y + altoP);
      ctx.fill();
      ctx.restore();
      if (t === 'S' || t === 'S+') { ctx.strokeStyle = C.oroViejo; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(MARGEN + 1, y + 1, anchoP - 2, altoP - 2, 6); ctx.stroke(); }
      texto(ctx, t, MARGEN + (etiqueta - 12) / 2, y + altoP / 2, { fuente: `400 ${t.length > 1 ? 46 : 56}px ${ROTULO}`, color: t === 'S' || t === 'S+' ? C.washi : C.sumi, alinear: 'center', base: 'middle' });
      for (const [i, x] of lista.entries()) {
        const fx = MARGEN + etiqueta + 12 + (i % porLinea) * (fichaW + hueco), fy = y + relleno + Math.floor(i / porLinea) * (fichaH + hueco);
        ctx.fillStyle = C.sumi;
        ctx.beginPath();
        ctx.roundRect(fx, fy, fichaW, fichaH, 4);
        ctx.fill();
        ctx.fillStyle = await colorDeClan(clanDe(x));
        ctx.beginPath();
        ctx.roundRect(fx, fy, 5, fichaH, [4, 0, 0, 4]);
        ctx.fill();
        await ficha(x, fx, fy);
      }
      y += altoP + 12;
    }
    return y;
  };
  let y = await seccion(filasJugadores, ARRIBA, async (j, fx, fy) => {
    const e = await imagen(logo(j.clan));
    if (e) contener(ctx, e, fx + 14, fy + 12, 52, 52);
    texto(ctx, j.nombre, fx + 76, fy + 36, { fuente: `400 26px ${ROTULO}`, ancho: fichaW - 86 });
    texto(ctx, `${ROL[j.rol] || j.rol} · ${nombreClan(j.clan)}`, fx + 76, fy + 62, { fuente: `400 18px ${GOTHIC}`, color: C.hai, ancho: fichaW - 86 });
  }, j => j.clan);
  if (filasEquipos.length) {
    texto(ctx, 'Familias', MARGEN, y + 50, { fuente: `400 40px ${ROTULO}` });
    await seccion(filasEquipos, y + 80, async (e, fx, fy) => {
      const img = await imagen(logo(e.id));
      if (img) contener(ctx, img, fx + 14, fy + 12, 52, 52);
      texto(ctx, e.nombre, fx + 76, fy + 48, { fuente: `400 28px ${ROTULO}`, ancho: fichaW - 86 });
    }, e => e.id);
  }
  pie(ctx, alto, ruta);
  return aImagen(c);
}

// ---------- descargar y publicar ----------
export function descargar(imagenBlob, nombre) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(imagenBlob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// El servidor comprueba quién publica y pone el texto; el staff manda la contraseña del panel para la tier list
export async function publicar(tipo, imagenBlob, { clave = null, ...extra } = {}) {
  try {
    const r = await fetch(`/api/discord/publicar?${new URLSearchParams({ tipo, ...extra })}`, {
      method: 'POST', body: imagenBlob,
      headers: { 'Content-Type': imagenBlob.type || 'image/jpeg', ...(clave ? { 'X-Clave-Panel': clave } : {}) },
    });
    return await r.json();
  } catch {
    return { ok: false, error: 'No hay conexión con la web' };
  }
}

// ---------- clasificación de una jornada del fantasy ----------
// filas: [{ puesto, nombre, puntos }] ya ordenadas; ganadores: [{ puesto, sobres }] si la jornada ya tiene premios
export async function imagenClasificacion({ jornada, filas, ganadores = [] }) {
  await fuentes();
  const mostradas = filas.slice(0, 10), altoFila = 86, hueco = 10;
  const alto = ARRIBA + Math.max(1, mostradas.length) * (altoFila + hueco) - hueco + 110;
  const [c, ctx] = lienzo(alto);
  const n = x => Number(x || 0).toLocaleString('es-ES');
  await cabecera(ctx, 'Clasificación del fantasy', `${jornada}  ·  ${filas.length} ${filas.length === 1 ? 'coleccionista' : 'coleccionistas'}`);
  if (!mostradas.length) texto(ctx, 'Nadie ha puntuado todavía', ANCHO / 2, ARRIBA + 50, { fuente: `400 40px ${ROTULO}`, color: C.hai, alinear: 'center' });
  mostradas.forEach((f, i) => {
    const y = ARRIBA + i * (altoFila + hueco), podio = f.puesto <= 3, sobres = ganadores.find(g => g.puesto === f.puesto)?.sobres || 0;
    const anchoF = ANCHO - 2 * MARGEN, metal = METAL[f.puesto] || C.linea;
    // Como en la web: el podio en oro, plata y bronce, con el metal en el canto, y el primero con el filo de oro
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(MARGEN, y, anchoF, altoFila, 6);
    ctx.clip();
    ctx.fillStyle = C.alzado;
    ctx.fillRect(MARGEN, y, anchoF, altoFila);
    if (f.puesto === 1) {
      const brillo = ctx.createLinearGradient(MARGEN, 0, MARGEN + anchoF * 0.6, 0);
      brillo.addColorStop(0, 'rgba(235, 210, 138, .14)'); brillo.addColorStop(1, 'rgba(235, 210, 138, 0)');
      ctx.fillStyle = brillo;
      ctx.fillRect(MARGEN, y, anchoF, altoFila);
    }
    ctx.fillStyle = metal;
    ctx.fillRect(MARGEN, y, 7, altoFila);
    ctx.restore();
    if (f.puesto === 1) { ctx.strokeStyle = C.oroViejo; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(MARGEN + 1, y + 1, anchoF - 2, altoFila - 2, 6); ctx.stroke(); }
    texto(ctx, String(f.puesto), MARGEN + 50, y + 45, { fuente: `400 44px ${ROTULO}`, color: podio ? metal : C.hai, alinear: 'center', base: 'middle' });
    texto(ctx, f.nombre, MARGEN + 100, y + 45, { fuente: `400 ${podio ? 40 : 34}px ${ROTULO}`, base: 'middle', ancho: ANCHO - 2 * MARGEN - 100 - 520 });
    if (sobres) texto(ctx, `+${sobres} ${sobres === 1 ? 'sobre' : 'sobres'}`, ANCHO - MARGEN - 300, y + 45, { fuente: `700 28px ${GOTHIC}`, color: C.oro, alinear: 'right', base: 'middle' });
    texto(ctx, n(f.puntos), ANCHO - MARGEN - 130, y + 45, { fuente: `400 44px ${ROTULO}`, alinear: 'right', base: 'middle' });
    texto(ctx, f.puntos === 1 ? 'punto' : 'puntos', ANCHO - MARGEN - 24, y + 47, { fuente: `400 24px ${GOTHIC}`, color: C.hai, alinear: 'right', base: 'middle' });
  });
  pie(ctx, alto, '/gachapon/');
  return aImagen(c);
}
