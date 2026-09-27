// Overlay de partida (/ingame/): marcador en directo con lo que manda el puente del PC donde se mira
// la partida. Los clanes salen del enfrentamiento del panel (lado azul a la izquierda, como en el juego).
// Se retira solo cuando no llegan datos y el panel puede ocultarlo.
import { cargarClanes, conectarDirecto, logo } from '/comun.js';

const $ = s => document.querySelector(s);
const clanes = await cargarClanes();
const DRAGON = { infernal: 'infernal', oceano: 'del océano', montana: 'de montaña', nube: 'de nube', hextech: 'hextech', quimtech: 'quimtech', ancestral: 'ancestral', dragon: '' };
const COLOR_DRAGON = { infernal: '#E0592A', oceano: '#3A8FD9', montana: '#A07D4F', nube: '#C8DFE4', hextech: '#2BC6C0', quimtech: '#8DBF3F', ancestral: '#C3A3EA', dragon: '#8E8676' };
const CARRIL = { top: 'top', mid: 'mid', bot: 'bot' };
const DURACION = { baron: 180, ancestral: 150 };
const DURACION_AVISO = 5000;

let estado = null, partida = null, recibidaEn = 0, primeraPartida = true;
const vistos = new Set();

const mmss = s => { s = Math.max(0, Math.floor(s)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const miles = n => `${(n / 1000).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}k`;
// El reloj avanza solo entre paquetes (uno por segundo); si dejan de llegar, se para a los 3 s
const tiempoAhora = () => (partida ? partida.tiempo + Math.min(3, (Date.now() - recibidaEn) / 1000) * (partida.velocidad || 1) : 0);
const clanDe = lado => clanes.clan(estado?.equipos?.[lado]?.clan || 'NONAME');
const nombreClan = lado => { const c = clanDe(lado); return c.id === 'NONAME' ? (lado === 'azul' ? 'Lado azul' : 'Lado rojo') : c.nombre; };

function pintarEquipos() {
  for (const lado of ['azul', 'rojo']) {
    const c = clanDe(lado);
    const s = $(`.lado.${lado}`);
    s.style.setProperty('--color-clan', c.texto);
    s.querySelector('.logo').src = logo(c.id);
    s.querySelector('.nombre').textContent = nombreClan(lado);
    s.querySelector('.kanji').textContent = c.kanji || '';
  }
}

function pintarPartida() {
  const p = partida;
  document.body.classList.toggle('oculto', !(p?.activo && estado?.partidaVisible !== false));
  if (!p) return;
  for (const lado of ['azul', 'rojo']) {
    const e = p[lado];
    const s = $(`.lado.${lado}`);
    s.querySelector('.kills').textContent = e.kills;
    s.querySelector('.oro b').textContent = miles(e.oro);
    s.querySelector('.torres b').textContent = e.torres;
    s.querySelector('.larvas b').textContent = e.larvas;
    s.querySelector('.larvas').classList.toggle('cero', !e.larvas);
    const dr = s.querySelector('.dragones');
    const firma = `${e.dragones.join(',')}|${e.ancestrales}|${e.alma || ''}`;
    if (dr.dataset.firma !== firma) {
      dr.dataset.firma = firma;
      dr.classList.toggle('alma', Boolean(e.alma));
      const tipos = [...e.dragones, ...Array(e.ancestrales).fill('ancestral')];
      dr.innerHTML = (lado === 'rojo' ? tipos.reverse() : tipos).map(t => `<i class="d-${t}" title="Dragón ${DRAGON[t]}"></i>`).join('');
    }
  }
  const dif = p.azul.oro - p.rojo.oro;
  const igual = Math.abs(dif) < 100;
  const d = $('.diferencia');
  d.className = `diferencia${igual ? '' : dif > 0 ? ' azul' : ' rojo'}`;
  d.querySelector('.flecha').textContent = igual ? '' : dif > 0 ? '◀' : '▶';
  d.querySelector('b').textContent = igual ? 'Oro igualado' : `+${miles(Math.abs(dif))}`;

  // Avisos de objetivos: los que ya estaban al abrir el overlay no se repiten
  for (const a of p.avisos || []) {
    if (vistos.has(a.id)) continue;
    vistos.add(a.id);
    if (!primeraPartida) colaAvisos.push(a);
  }
  primeraPartida = false;
  siguienteAviso();
}

// ---------- chips con cuenta atrás ----------
function chipsDeAhora() {
  const t = tiempoAhora();
  const c = { azul: [], rojo: [], centro: [] };
  for (const b of partida.buffs || []) {
    if (b.hasta <= t) continue;
    c[b.lado].push({ clave: `${b.tipo}-${b.hasta}`, clase: b.tipo, texto: b.tipo === 'baron' ? 'Buff de Barón' : 'Buff ancestral',
      resta: b.hasta - t, fraccion: (b.hasta - t) / DURACION[b.tipo], icono: b.tipo === 'baron' ? 'i-baron' : null });
  }
  for (const lado of ['azul', 'rojo']) {
    const alma = partida[lado].alma;
    if (alma) c[lado].push({ clave: `alma-${alma}`, clase: 'alma', texto: `Alma ${DRAGON[alma]}`, color: COLOR_DRAGON[alma] });
  }
  const pd = partida.proximoDragon;
  if (pd) c.centro.push({ clave: `dragon-${pd.t}`, clase: 'dragon', texto: pd.ancestral ? 'Ancestral' : 'Dragón',
    resta: pd.t - t, vivo: pd.t <= t, color: pd.ancestral ? COLOR_DRAGON.ancestral : null, icono: 'i-dragon' });
  if (partida.proximoBaron != null) c.centro.push({ clave: `baron-${partida.proximoBaron}`, clase: 'baron', texto: 'Barón',
    resta: partida.proximoBaron - t, vivo: partida.proximoBaron <= t, icono: 'i-baron' });
  for (const i of partida.inhibidores || []) {
    if (i.vuelve > t) c[i.lado].push({ clave: `inhib-${i.lado}-${i.carril}`, clase: 'inhibidor', texto: `Inhibidor ${CARRIL[i.carril] || ''}`, resta: i.vuelve - t });
  }
  return c;
}

function pintarChips() {
  if (!partida) return;
  const grupos = chipsDeAhora();
  for (const [grupo, lista] of Object.entries(grupos)) {
    const caja = $(grupo === 'centro' ? '.chips.centro-chips' : `.chips.${grupo}`);
    const presentes = new Set(lista.map(ch => ch.clave));
    for (const el of [...caja.children]) if (!presentes.has(el.dataset.clave)) el.remove();
    for (const ch of lista) {
      let el = caja.querySelector(`[data-clave="${ch.clave}"]`);
      if (!el) {
        el = document.createElement('div');
        el.className = `chip ${ch.clase}`;
        el.dataset.clave = ch.clave;
        if (ch.color) el.style.setProperty('--chip', ch.color);
        el.innerHTML = `${ch.icono ? `<svg><use href="#${ch.icono}"/></svg>` : ''}<span class="n"></span><span class="t"></span>${ch.fraccion != null ? '<i class="barra"></i>' : ''}`;
        caja.append(el);
      }
      el.querySelector('.n').textContent = ch.texto;
      el.querySelector('.t').textContent = ch.vivo ? 'vivo' : ch.resta != null ? mmss(ch.resta) : '';
      const barra = el.querySelector('.barra');
      if (barra) barra.style.width = `calc(${Math.max(0, Math.min(1, ch.fraccion)) * 100}% - 4px)`;
    }
  }
}

// ---------- avisos de objetivos ----------
const colaAvisos = [];
let avisoEnCurso = false;
const dragonDe = t => `dragón ${DRAGON[t] || ''}`.trim();
const TEXTO_AVISO = {
  dragon: a => [`${a.robado ? 'roba' : 'se lleva'} el ${dragonDe(a.dragon)}`, '龍', COLOR_DRAGON[a.dragon] || COLOR_DRAGON.dragon],
  baron: a => [a.robado ? 'roba el Barón Nashor' : 'mata al Barón Nashor', '蛇', '#9B59D0'],
  heraldo: a => [a.robado ? 'roba el Heraldo' : 'se lleva el Heraldo', '使', '#8E8676'],
  atakhan: () => ['derrota a Atakhan', '魔', '#BE2A2F'],
  inhibidor: a => [`rompe el inhibidor ${CARRIL[a.carril] || ''}`, '破', 'var(--shu)'],
};
// Tinta del sello: oscura sobre los colores claros (nube, hextech, ancestral…), clara sobre los oscuros
function tinta(color) {
  const m = /^#(..)(..)(..)$/.exec(color);
  if (!m) return 'var(--washi)';
  const [r, g, b] = m.slice(1).map(h => { const c = parseInt(h, 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.2 ? 'var(--sumi)' : 'var(--washi)';
}
function siguienteAviso() {
  if (avisoEnCurso || !colaAvisos.length) return;
  const a = colaAvisos.shift();
  const [frase, kanji, color] = (TEXTO_AVISO[a.tipo] || (() => ['', '天', 'var(--shu)']))(a);
  const caja = $('.aviso');
  const hanko = caja.querySelector('.hanko');
  caja.style.setProperty('--aviso', color);
  hanko.textContent = kanji;
  hanko.style.background = color;
  hanko.style.color = tinta(color);
  caja.querySelector('.aviso-quien').textContent = nombreClan(a.lado);
  caja.querySelector('.aviso-que').textContent = frase;
  caja.classList.remove('sale');
  caja.hidden = false;
  $('#lienzo').classList.add('con-aviso');
  avisoEnCurso = true;
  setTimeout(() => {
    caja.classList.add('sale');
    setTimeout(() => {
      caja.hidden = true;
      avisoEnCurso = false;
      if (!colaAvisos.length) $('#lienzo').classList.remove('con-aviso');
      siguienteAviso();
    }, 400);
  }, DURACION_AVISO);
}

conectarDirecto({
  alEstado: e => { estado = e; pintarEquipos(); pintarPartida(); },
  alPartida: p => { partida = p; recibidaEn = Date.now(); pintarPartida(); pintarChips(); },
});

setInterval(() => {
  if (!partida) return;
  $('.reloj').textContent = mmss(tiempoAhora());
  pintarChips();
}, 250);
