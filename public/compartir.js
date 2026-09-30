// Imágenes para compartir en Discord: la colección y la alineación de cada coleccionista y la tier list,
// dibujadas en un lienzo con los mismos marcos, dibujos y textos que la web. Se descargan o se publican en el
// canal de Discord (POST /api/discord/publicar, que pone el texto y comprueba quién publica).
import { logo } from '/comun.js';

const MINCHO = "'Shippori Mincho B1', 'Yu Mincho', serif";
const GOTHIC = "'Zen Kaku Gothic New', 'Yu Gothic', 'Segoe UI', sans-serif";
const C = { sumi: '#161412', alzado: '#221E1A', linea: '#353029', washi: '#E7DFD2', hai: '#8E8676', shu: '#BE2A2F', tinta: '#1D1A17' };
const COLOR_TIER = { 'S+': '#9A6AD0', S: '#BE2A2F', A: '#D9A441', B: '#A9B3BC', C: '#7FA36B', D: '#8A8175' };
const TIERS = ['S+', 'S', 'A', 'B', 'C', 'D'];
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
export async function dibujarCarta(ctx, c, x, y, w, { cantidad = 1, nombreClan = id => id } = {}) {
  const h = Math.round(w * 1.4);
  const boost = c.tipo === 'boost';
  const quien = boost ? (c.subtitulo || 'Boost') : `${ROL[c.rol] || c.rol} de ${nombreClan(c.clan)}`;
  const [arte, marco, emblema] = await Promise.all([imagen(c.arte), imagen(c.marco), imagen(c.clan ? logo(c.clan) : null)]);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, w * 0.04);
  ctx.clip();
  ctx.fillStyle = C.sumi;
  ctx.fillRect(x, y, w, h);
  if (marco) {
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
// alineacion: { TOP: carta|null, … } con las cartas enteras; puntos: { TOP: n, … }
export async function imagenAlineacion({ nombre, alineacion, puntos = {}, total = 0, puesto = null, nombreClan }) {
  await fuentes();
  const w = 264, hueco = (ANCHO - 2 * MARGEN - 5 * w) / 4, h = Math.round(w * 1.4);
  const alto = ARRIBA + 58 + h + 72 + 100;
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
export async function publicar(tipo, imagenBlob, { clave = null } = {}) {
  try {
    const r = await fetch(`/api/discord/publicar?tipo=${encodeURIComponent(tipo)}`, {
      method: 'POST', body: imagenBlob,
      headers: { 'Content-Type': imagenBlob.type || 'image/jpeg', ...(clave ? { 'X-Clave-Panel': clave } : {}) },
    });
    return await r.json();
  } catch {
    return { ok: false, error: 'No hay conexión con la web' };
  }
}
