// Imágenes para compartir en Discord: la colección y la alineación de cada coleccionista, la tier list y la
// clasificación de cada jornada del fantasy,
// dibujadas en un lienzo con los mismos marcos, dibujos y textos que la web. Se descargan o se publican en el
// canal de Discord (POST /api/discord/publicar, que pone el texto y comprueba quién publica).
import { logo } from '/comun.js';
import { emblemaDe } from '/carta.js';

const MINCHO = "'Shippori Mincho B1', 'Yu Mincho', serif";
const GOTHIC = "'Zen Kaku Gothic New', 'Yu Gothic', 'Segoe UI', sans-serif";
const C = { sumi: '#161412', alzado: '#221E1A', linea: '#353029', washi: '#E7DFD2', hai: '#8E8676', shu: '#BE2A2F', tinta: '#1D1A17' };
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
  await Promise.all([`800 40px ${MINCHO}`, `700 20px ${GOTHIC}`, `400 20px ${GOTHIC}`].map(f => document.fonts.load(f)));
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

// Cabecera: título, línea de datos, el sol partido (tal cual) y la raya bermellón
async function cabecera(ctx, titulo, subtitulo) {
  texto(ctx, titulo, MARGEN, 118, { fuente: `800 64px ${MINCHO}`, ancho: ANCHO - 2 * MARGEN - 190 });
  texto(ctx, subtitulo, MARGEN, 166, { fuente: `400 28px ${GOTHIC}`, color: C.hai, ancho: ANCHO - 2 * MARGEN - 190 });
  const sol = await imagen('/marca/sol-partido-sin-fondo.png');
  if (sol) contener(ctx, sol, ANCHO - MARGEN - 150, 34, 150, 150);
  ctx.fillStyle = C.shu;
  ctx.fillRect(MARGEN, 198, ANCHO - 2 * MARGEN, 3);
}

function pie(ctx, alto, ruta) {
  texto(ctx, '天下一 · Tenka Ichi', MARGEN, alto - 32, { fuente: `800 24px ${MINCHO}`, color: C.hai });
  texto(ctx, `${DIRECCION}${ruta}`, ANCHO - MARGEN, alto - 32, { fuente: `400 22px ${GOTHIC}`, color: C.hai, alinear: 'right' });
}

const aImagen = (c, tipo = 'image/jpeg') => new Promise(ok => c.toBlob(ok, tipo, 0.9));

// ---------- una carta, igual que en la web ----------
// La carta se dibuja dos veces: en la web con carta.js y carta.css, y aquí en un lienzo para las imágenes de Discord.
// Lo que cambie en un sitio se cambia en el otro en el mismo cambio: tienen que verse igual
export async function dibujarCarta(ctx, c, x, y, w, { cantidad = 1, nombreClan = id => id } = {}) {
  const h = Math.round(w * 1.4);
  const boost = c.tipo === 'boost', legado = c.tipo === 'legacy';
  const quien = boost || legado ? (c.subtitulo || (legado ? 'Legacy' : 'Boost')) : `${ROL[c.rol] || c.rol} de ${nombreClan(c.clan)}`;
  // Las «full art» van a carta completa, como en la web; si su dibujo no carga, salen con su marco de siempre.
  // Las LEGACY van siempre a carta completa: con su dibujo vertical o, mientras no lo tengan, con el que haya
  const [arte, marco, emblema, vertical] = await Promise.all([imagen(c.arte), imagen(c.marco), imagen(emblemaDe(c)), imagen(c.fullart)]);
  const completa = vertical || (legado ? arte : null);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, w * 0.04);
  ctx.clip();
  ctx.fillStyle = C.sumi;
  ctx.fillRect(x, y, w, h);
  if (completa) {
    dibujarCompleta(ctx, c, { x, y, w, h, completa, emblema, quien, cantidad, alto: vertical ? 0.5 : 0.3 });
  } else if (marco) {
    // Con marco: el dibujo en su ventana y los textos en tinta sobre las placas de papel
    if (arte) cubrir(ctx, arte, x + w * 0.125, y + h * 0.2014, w * 0.75, h * 0.5357);
    ctx.drawImage(marco, x, y, w, h);
    if (emblema) contener(ctx, emblema, x + w * 0.83, y + h * 0.046, w * 0.09, h * 0.084);
    texto(ctx, c.nombre, x + w * 0.08, y + h * 0.088, { fuente: `800 ${w * 0.072}px ${MINCHO}`, color: C.tinta, base: 'middle', ancho: w * 0.72 });
    texto(ctx, quien, x + w * 0.1, y + h * 0.764, { fuente: `700 ${w * 0.05}px ${GOTHIC}`, color: C.tinta, base: 'top', ancho: w * 0.8 });
    if (c.bonus) texto(ctx, c.bonus.etiqueta, x + w * 0.1, y + h * 0.764 + w * 0.08, { fuente: `800 ${w * 0.05}px ${GOTHIC}`, color: C.tinta, base: 'top', ancho: w * 0.8 });
    if (cantidad > 1) texto(ctx, `×${cantidad}`, x + w * 0.91, y + h * 0.93, { fuente: `800 ${w * 0.06}px ${MINCHO}`, color: C.tinta, alinear: 'right' });
  } else {
    // Sin marco: el dibujo a sangre con un velo, el sello de la tier y los textos en claro
    if (arte) cubrir(ctx, arte, x, y, w, h);
    const velo = ctx.createLinearGradient(0, y + h * 0.4, 0, y + h * 0.84);
    velo.addColorStop(0, 'rgba(22,20,18,0)');
    velo.addColorStop(1, 'rgba(22,20,18,0.94)');
    ctx.fillStyle = velo;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = COLOR_TIER[c.tier] || C.hai;
    ctx.fillRect(x + w * 0.05, y + w * 0.05, w * 0.2, w * 0.2);
    texto(ctx, c.tier, x + w * 0.15, y + w * 0.15, { fuente: `800 ${w * 0.12}px ${MINCHO}`, color: ['S', 'S+'].includes(c.tier) ? C.washi : C.sumi, alinear: 'center', base: 'middle' });
    if (emblema) contener(ctx, emblema, x + w * 0.74, y + w * 0.05, w * 0.2, w * 0.19);
    texto(ctx, c.nombre, x + w * 0.06, y + h * 0.86, { fuente: `800 ${w * 0.11}px ${MINCHO}`, ancho: w * 0.86 });
    texto(ctx, quien, x + w * 0.06, y + h * 0.94, { fuente: `400 ${w * 0.06}px ${GOTHIC}`, color: '#CFC6B6', ancho: w * 0.86 });
    if (cantidad > 1) texto(ctx, `×${cantidad}`, x + w * 0.94, y + h * 0.94, { fuente: `800 ${w * 0.08}px ${MINCHO}`, alinear: 'right' });
  }
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
    ctx.font = `800 ${4.4 * u}px ${MINCHO}`;
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
    ctx.translate(x + 12.5 * u, y + 12.5 * u);
    ctx.rotate(-4 * Math.PI / 180);
    sombra(2.4, 0.5);
    ctx.fillStyle = COLOR_TIER[c.tier] || C.hai;
    ctx.beginPath();
    ctx.roundRect(-6.5 * u, -6.5 * u, 13 * u, 13 * u, 0.9 * u);
    ctx.fill();
    sinSombra();
    texto(ctx, c.tier, 0, 0.3 * u, { fuente: `800 ${6.2 * u}px ${MINCHO}`, color: ['S', 'S+'].includes(c.tier) ? C.washi : C.sumi, alinear: 'center', base: 'middle' });
  }
  ctx.restore();
  if (emblema) { sombra(1.2, 0.7); contener(ctx, emblema, x + w - 18.5 * u, y + 6 * u, 12.5 * u, 12.5 * u); sinSombra(); }

  // Abajo, de abajo arriba: el multiplicador, lo que hace, el nombre y las estrellas
  const izquierda = x + 8 * u, ancho = w - 16 * u;
  let linea = y + h - 7.5 * u;
  const renglon = (alto, pintar) => { linea -= alto * u; pintar(linea + alto * u / 2); };
  sombra(0.8, 0.9);
  if (c.bonus) renglon(7.7, medio => texto(ctx, c.bonus.etiqueta, izquierda, medio, { fuente: `800 ${4.8 * u}px ${GOTHIC}`, color: CLARO_CARTA, base: 'middle', ancho }));
  renglon(7.7, medio => texto(ctx, quien, izquierda, medio, { fuente: `700 ${4.8 * u}px ${GOTHIC}`, color: ORO_CARTA, base: 'middle', ancho }));
  sombra(1.4, 0.95);
  renglon(11, medio => texto(ctx, c.nombre, izquierda, medio, { fuente: `800 ${10 * u}px ${MINCHO}`, color: CLARO_CARTA, base: 'middle', ancho }));
  sombra(0.8, 0.9);
  if (ESTRELLAS[c.tier]) renglon(6.4, medio => {
    ctx.font = `400 ${4 * u}px ${GOTHIC}`;
    const paso = ctx.measureText('★').width + 0.9 * u;
    for (let i = 0; i < ESTRELLAS[c.tier]; i++) texto(ctx, '★', izquierda + i * paso, medio, { fuente: ctx.font, color: ORO_CARTA, base: 'middle' });
  });
  if (cantidad > 1) texto(ctx, `×${cantidad}`, x + w - 8 * u, y + h - 9.6 * u, { fuente: `800 ${6 * u}px ${MINCHO}`, color: CLARO_CARTA, alinear: 'right' });
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
  if (!mostradas.length) texto(ctx, 'Todavía no tiene cartas: ¡a abrir sobres!', ANCHO / 2, ARRIBA + h / 2, { fuente: `800 40px ${MINCHO}`, color: C.hai, alinear: 'center' });
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
  await cabecera(ctx, `Alineación de ${nombre}`, `Fantasy de Tenka Ichi  ·  ${n(total)} ${total === 1 ? 'punto' : 'puntos'}${puesto ? `  ·  ${puesto}.º en la clasificación` : ''}`);
  for (const [i, rol] of ROLES.entries()) {
    const x = MARGEN + i * (w + hueco), y = ARRIBA + 58;
    texto(ctx, ROL[rol], x + w / 2, ARRIBA + 38, { fuente: `800 32px ${MINCHO}`, alinear: 'center' });
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
        texto(ctx, boost.nombre, x + mini + 20, by + 40, { fuente: `800 26px ${MINCHO}`, ancho: w - mini - 30 });
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
export async function imagenTierlist({ jugadores, equipos = [], nombreClan }) {
  await fuentes();
  const conTier = lista => ['S', 'A', 'B', 'C', 'D'].map(t => [t, lista.filter(x => x.tier === t)]).filter(([, l]) => l.length);
  const filasJugadores = conTier(jugadores.filter(j => j.nombre)), filasEquipos = conTier(equipos);
  const etiqueta = 110, hueco = 12, fichaW = 262, fichaH = 76;
  const porLinea = Math.floor((ANCHO - 2 * MARGEN - etiqueta - 20 + hueco) / (fichaW + hueco));
  const altoFila = l => Math.max(1, Math.ceil(l.length / porLinea)) * (fichaH + hueco) - hueco;
  const altoSeccion = filas => filas.reduce((s, [, l]) => s + altoFila(l) + 20, 0);
  const alto = ARRIBA + altoSeccion(filasJugadores) + (filasEquipos.length ? 90 + altoSeccion(filasEquipos) : 0) + 100;
  const [c, ctx] = lienzo(alto);
  await cabecera(ctx, 'Tier list de Tenka Ichi', `${filasJugadores.reduce((s, [, l]) => s + l.length, 0)} jugadores${filasEquipos.length ? `  ·  ${equipos.filter(e => e.tier).length} equipos` : ''}`);

  const seccion = async (filas, y, ficha) => {
    for (const [t, lista] of filas) {
      const altoF = altoFila(lista);
      ctx.fillStyle = COLOR_TIER[t];
      ctx.beginPath();
      ctx.roundRect(MARGEN, y, etiqueta, altoF, 8);
      ctx.fill();
      texto(ctx, t, MARGEN + etiqueta / 2, y + altoF / 2, { fuente: `800 56px ${MINCHO}`, color: t === 'S' ? C.washi : C.sumi, alinear: 'center', base: 'middle' });
      for (const [i, x] of lista.entries()) {
        const fx = MARGEN + etiqueta + 20 + (i % porLinea) * (fichaW + hueco), fy = y + Math.floor(i / porLinea) * (fichaH + hueco);
        ctx.fillStyle = C.alzado;
        ctx.beginPath();
        ctx.roundRect(fx, fy, fichaW, fichaH, 8);
        ctx.fill();
        await ficha(x, fx, fy);
      }
      y += altoF + 20;
    }
    return y;
  };
  let y = await seccion(filasJugadores, ARRIBA, async (j, fx, fy) => {
    const e = await imagen(logo(j.clan));
    if (e) contener(ctx, e, fx + 10, fy + 12, 52, 52);
    texto(ctx, j.nombre, fx + 72, fy + 36, { fuente: `800 26px ${MINCHO}`, ancho: fichaW - 82 });
    texto(ctx, `${ROL[j.rol] || j.rol} · ${nombreClan(j.clan)}`, fx + 72, fy + 62, { fuente: `400 18px ${GOTHIC}`, color: C.hai, ancho: fichaW - 82 });
  });
  if (filasEquipos.length) {
    texto(ctx, 'Equipos', MARGEN, y + 50, { fuente: `800 40px ${MINCHO}` });
    await seccion(filasEquipos, y + 80, async (e, fx, fy) => {
      const img = await imagen(logo(e.id));
      if (img) contener(ctx, img, fx + 10, fy + 12, 52, 52);
      texto(ctx, e.nombre, fx + 72, fy + 48, { fuente: `800 28px ${MINCHO}`, ancho: fichaW - 82 });
    });
  }
  pie(ctx, alto, '/#tierlist');
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
  if (!mostradas.length) texto(ctx, 'Nadie ha puntuado todavía', ANCHO / 2, ARRIBA + 50, { fuente: `800 40px ${MINCHO}`, color: C.hai, alinear: 'center' });
  mostradas.forEach((f, i) => {
    const y = ARRIBA + i * (altoFila + hueco), podio = f.puesto <= 3, sobres = ganadores.find(g => g.puesto === f.puesto)?.sobres || 0;
    ctx.fillStyle = C.alzado;
    ctx.beginPath();
    ctx.roundRect(MARGEN, y, ANCHO - 2 * MARGEN, altoFila, 8);
    ctx.fill();
    // El sello con el puesto: bermellón para el primero, hueso para el segundo y el tercero
    ctx.fillStyle = f.puesto === 1 ? C.shu : podio ? C.washi : C.linea;
    ctx.beginPath();
    ctx.roundRect(MARGEN + 14, y + 13, 60, 60, 6);
    ctx.fill();
    texto(ctx, String(f.puesto), MARGEN + 44, y + 45, { fuente: `800 36px ${MINCHO}`, color: f.puesto === 1 ? C.washi : podio ? C.sumi : C.hai, alinear: 'center', base: 'middle' });
    texto(ctx, f.nombre, MARGEN + 100, y + 45, { fuente: `800 ${podio ? 40 : 34}px ${MINCHO}`, base: 'middle', ancho: ANCHO - 2 * MARGEN - 100 - 520 });
    if (sobres) texto(ctx, `+${sobres} ${sobres === 1 ? 'sobre' : 'sobres'}`, ANCHO - MARGEN - 300, y + 45, { fuente: `700 28px ${GOTHIC}`, color: '#E0484D', alinear: 'right', base: 'middle' });
    texto(ctx, n(f.puntos), ANCHO - MARGEN - 130, y + 45, { fuente: `800 44px ${MINCHO}`, alinear: 'right', base: 'middle' });
    texto(ctx, f.puntos === 1 ? 'punto' : 'puntos', ANCHO - MARGEN - 24, y + 47, { fuente: `400 24px ${GOTHIC}`, color: C.hai, alinear: 'right', base: 'middle' });
  });
  pie(ctx, alto, '/gachapon/');
  return aImagen(c);
}
