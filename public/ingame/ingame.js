// Overlay de partida (/ingame/): marcador en directo con lo que manda el puente del PC donde se mira
// la partida, temporizadores de los objetivos, lo que lleva cada clan (buffs, alma, inhibidores),
// avisos de objetivos y resumen de pelea, la cámara del caster abajo a la derecha (si está activada) y, cuando lo
// saca el panel, el línea por línea, la ficha de un jugador o la gráfica de oro. Los clanes salen del
// enfrentamiento del panel (lado azul a la izquierda).
// El aspecto es el estilo A de Gokudō («Placas», estilo-a.css, acotado a data-estilo="a" en <body>). Pacopepe se quedó con
// él el 08/11 y la B se borró.
import { cargarClanes, conectarDirecto, logo, icono, splash, definitiva, estadoDefinitiva, camaraPartida, ESCALA_LINEAS } from '/comun.js';
import { cartaHTML } from '/carta.js';

const $ = s => document.querySelector(s);
const clanes = await cargarClanes();
const params = new URLSearchParams(location.search);
// ?guia=1 (o la vista previa del panel): los huecos de las cámaras salen rayados y con su medida, para colocarlas en OBS
if (params.has('guia')) document.body.classList.add('guia');
const DRAGON = { infernal: 'infernal', oceano: 'del océano', montana: 'de montaña', nube: 'de nube', hextech: 'hextech', quimtech: 'quimtech', ancestral: 'ancestral', dragon: '' };
const ALMA = { infernal: 'Infernal', oceano: 'Océano', montana: 'Montaña', nube: 'Nube', hextech: 'Hextech', quimtech: 'Quimtech' };
const COLOR_DRAGON = { infernal: '#E0592A', oceano: '#3A8FD9', montana: '#A07D4F', nube: '#C8DFE4', hextech: '#2BC6C0', quimtech: '#8DBF3F', ancestral: '#C3A3EA', dragon: '#8E8676' };
// Kanji de cada elemento: fuego, mar, montaña, nube, trueno, veneno; el ancestral es el dragón
const KANJI_DRAGON = { infernal: '炎', oceano: '海', montana: '山', nube: '雲', hextech: '雷', quimtech: '毒', ancestral: '龍', dragon: '龍' };
const OBJETIVO = {
  dragon: { nombre: 'Dragón', kanji: '龍' },
  larvas: { nombre: 'Larvas', kanji: '虫' },
  heraldo: { nombre: 'Heraldo', kanji: '使' },
  baron: { nombre: 'Barón', kanji: '蛇' },
};
const ROL = { TOP: 'Top', JUNGLA: 'Jungla', MEDIO: 'Medio', ADC: 'ADC', SUPPORT: 'Support' };
const DURACION_AVISO = 5000, DURACION_PELEA = 6500;
// Lo que tardan en salir las piezas (la animación de salida de ingame.css) y lo que dura el cambio de una cifra
const SALIDA_MS = 420, CIFRA_MS = 550;

let estado = null, partida = null, recibidaEn = 0, primeraPartida = true;
const vistos = new Set();

const mmss = s => { s = Math.max(0, Math.floor(s)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const miles = n => `${(n / 1000).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}k`;
const decimal = n => Number(n).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const escapar = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
// El reloj avanza solo entre paquetes (uno por segundo); si dejan de llegar, se para a los 3 s
const tiempoAhora = () => (partida ? partida.tiempo + Math.min(3, (Date.now() - recibidaEn) / 1000) * (partida.velocidad || 1) : 0);
const clanDe = lado => clanes.clan(estado?.equipos?.[lado]?.clan || 'NONAME');
const nombreClan = lado => { const c = clanDe(lado); return c.id === 'NONAME' ? (lado === 'azul' ? 'Lado azul' : 'Lado rojo') : c.nombre; };
const enso = () => `<svg class="enso" viewBox="0 0 40 40" aria-hidden="true"><circle class="pista" cx="20" cy="20" r="16"/><circle class="trazo" cx="20" cy="20" r="16" pathLength="100"/></svg>`;
// Se escribe solo lo que cambia: el marcador se refresca cada segundo (y los relojes cada 250 ms), y reescribir un texto
// igual invalida el layout del panel entero aunque en pantalla no cambie nada
const texto = (el, v) => { v = String(v ?? ''); if (el.textContent !== v) el.textContent = v; };
const clase = (el, v) => { if (el.className !== v) el.className = v; };
const variable = (el, k, v) => { if (el.style.getPropertyValue(k) !== v) el.style.setProperty(k, v); };
const src = (img, v) => { if (img.getAttribute('src') !== v) img.src = v; };
// El trazo del ensō, redondeado a medio punto de los 100 de la vuelta (medio píxel): por debajo no se ve, y así no se
// repinta cada 250 ms con una transición nueva por un cambio invisible
const trazar = (el, p) => {
  const v = String(Math.round((100 - Math.max(0, Math.min(1, p)) * 100) * 2) / 2), trazo = el.querySelector('.trazo');
  if (trazo.style.strokeDashoffset !== v) trazo.style.strokeDashoffset = v;
};
const interruptor = k => estado?.ingame?.[k] !== false;  // lo nuevo viene encendido: solo se apaga a propósito

// Tinta del sello: oscura sobre los colores claros (nube, hextech, ancestral…), clara sobre los oscuros
function tinta(color) {
  const m = /^#(..)(..)(..)$/.exec(color);
  if (!m) return 'var(--washi)';
  const [r, g, b] = m.slice(1).map(h => { const c = parseInt(h, 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.2 ? 'var(--sumi)' : 'var(--washi)';
}

// Pinta una lista de elementos con clave: reutiliza los que siguen, quita los que sobran (con su salida) y respeta el orden
function lista(caja, items, crear, actualizar) {
  const claves = new Set(items.map(i => i.clave));
  for (const el of [...caja.children]) if (!claves.has(el.dataset.clave) && !el.classList.contains('sale')) {
    el.classList.add('sale');
    setTimeout(() => el.remove(), SALIDA_MS);
  }
  items.forEach((item, orden) => {
    let el = caja.querySelector(`[data-clave="${item.clave}"]:not(.sale)`);
    if (!el) { el = crear(item); el.dataset.clave = item.clave; caja.append(el); }
    if (el.style.order !== String(orden)) el.style.order = orden;
    actualizar(el, item);
  });
}

// Una cifra que cambia sin saltos: cuenta del valor anterior al nuevo y hace un pequeño latido. Cada cifra lleva como
// mucho una cuenta en marcha (la nueva cancela la anterior) y solo escribe cuando cambia el texto que se ve
const cuentas = new WeakMap(), pasos = new WeakMap();
function parar(el) { cancelAnimationFrame(pasos.get(el)); pasos.delete(el); }
// Para poner un texto que no es la cifra («–», «Igual»…): corta la cuenta que hubiera en marcha
function fijar(el, valor, literal) { parar(el); cuentas.set(el, valor); texto(el, literal); }
// El latido (.cambia) se relanza rebobinando su animación, sin quitar la clase y leer offsetWidth (eso fuerza un
// reflow por cada cifra que cambia); al acabar se quita la clase sola
function latir(el) {
  const a = el.getAnimations().find(x => x.animationName === 'cambia');
  if (a) { a.currentTime = 0; a.play(); } else el.classList.add('cambia');
}
document.addEventListener('animationend', e => { if (e.animationName === 'cambia') e.target.classList.remove('cambia'); });
function cifra(el, valor, formato = String) {
  const anterior = cuentas.get(el);
  if (anterior === valor && pasos.has(el)) return;   // ya va camino de ese valor
  parar(el);
  cuentas.set(el, valor);
  if (anterior === undefined || anterior === valor || !Number.isFinite(valor) || !Number.isFinite(anterior)) { texto(el, formato(valor)); return; }
  latir(el);
  const desde = anterior, inicio = performance.now();
  const paso = ahora => {
    const p = Math.min(1, (ahora - inicio) / CIFRA_MS);
    const suave = 1 - (1 - p) ** 3;
    texto(el, formato(p < 1 ? Math.round(desde + (valor - desde) * suave) : valor));
    if (p < 1) pasos.set(el, requestAnimationFrame(paso));
    else pasos.delete(el);
  };
  pasos.set(el, requestAnimationFrame(paso));
}

// Entrada y salida de una pieza: la animación la pone el CSS (.sale); aquí solo se espera a que acabe para ocultarla
const salidas = new WeakMap();
function aparecer(el, visible) {
  const estaba = !el.hidden && !el.classList.contains('sale');
  if (visible === estaba) return;
  clearTimeout(salidas.get(el));
  if (visible) { el.classList.remove('sale'); el.hidden = false; }
  else {
    el.classList.add('sale');
    salidas.set(el, setTimeout(() => { el.hidden = true; el.classList.remove('sale'); }, SALIDA_MS));
  }
}

// ---------- estilo ----------
function pintarEstilo() {
  document.body.dataset.estilo = 'a';
}

// ---------- marcador ----------
function pintarEquipos() {
  for (const lado of ['azul', 'rojo']) {
    const c = clanDe(lado);
    for (const caja of document.querySelectorAll(`.marcador .lado.${lado}, .lineas-cabeza .equipo.${lado}, .grafica-cabeza .equipo.${lado}, .modulos.${lado}`)) {
      variable(caja, '--clan', c.color);
      variable(caja, '--clan-texto', c.texto);
    }
    // En la raíz: reescribirlas aunque sean iguales recalcula el estilo de toda la página
    variable(document.documentElement, `--clan-${lado}`, c.color);
    variable(document.documentElement, `--clan-${lado}-texto`, c.texto);
    const s = $(`.marcador .lado.${lado}`);
    src(s.querySelector('.logo'), logo(c.id));
    texto(s.querySelector('.nombre'), nombreClan(lado));
    texto(s.querySelector('.kanji'), c.kanji || '');
    texto(s.querySelector('.kanji-fondo'), c.kanji || '');
    for (const cab of document.querySelectorAll(`.lineas-cabeza .equipo.${lado}, .grafica-cabeza .equipo.${lado}`)) {
      src(cab.querySelector('.logo'), logo(c.id));
      texto(cab.querySelector('.nombre'), nombreClan(lado));
    }
  }
}

function pintarPartida() {
  const p = partida;
  document.body.classList.toggle('oculto', !(p?.activo && estado?.partidaVisible !== false));
  if (!p) return;
  for (const lado of ['azul', 'rojo']) {
    const e = p[lado];
    const s = $(`.marcador .lado.${lado}`);
    cifra(s.querySelector('.kills'), e.kills);
    cifra(s.querySelector('.oro b'), e.oro, n => `≈${miles(n)}`);
    cifra(s.querySelector('.torres b'), e.torres);
    cifra(s.querySelector('.larvas b'), e.larvas);
    s.querySelector('.larvas').classList.toggle('cero', !e.larvas);
    // Los muertos del clan con sus segundos para reaparecer (el cliente los da en cada paquete, cada segundo)
    const caidos = p.lineas.map(l => l[lado]).filter(j => j?.muerto && j.reaparece > 0);
    // Solo se rehacen cuando cambia quién está muerto (si no, la entrada se repetiría cada segundo); si no, los segundos
    const cajaCaidos = s.querySelector('.caidos'), firmaCaidos = caidos.map(j => j.campeon).join(',');
    if (cajaCaidos.dataset.firma !== firmaCaidos) {
      cajaCaidos.dataset.firma = firmaCaidos;
      cajaCaidos.innerHTML = caidos.map(j => `<span class="caido"><img src="${icono(j.campeon)}" alt=""><b></b></span>`).join('');
    }
    cajaCaidos.querySelectorAll('.caido b').forEach((b, i) => { texto(b, caidos[i].reaparece); });
    // Dragones del clan como sellos bajo su lado: 4 huecos hasta el alma (vacíos, un rombo sin rellenar) y,
    // detrás, los ancestrales. Empiezan junto al centro y crecen hacia fuera, en espejo
    const dr = s.querySelector('.dragones');
    const firma = `${e.dragones.join(',')}|${e.ancestrales}|${e.alma || ''}`;
    if (dr.dataset.firma !== firma) {
      dr.dataset.firma = firma;
      dr.classList.toggle('alma', Boolean(e.alma));
      const huecos = [0, 1, 2, 3].map(i => e.dragones[i]
        ? `<i class="d-${e.dragones[i]}" title="Dragón ${DRAGON[e.dragones[i]]}"><span>${KANJI_DRAGON[e.dragones[i]]}</span></i>` : '<i class="vacio"></i>');
      const todos = [...huecos, ...Array(e.ancestrales).fill('<i class="d-ancestral" title="Dragón ancestral"><span>龍</span></i>')];
      dr.innerHTML = (lado === 'azul' ? todos.reverse() : todos).join('');
    }
  }
  const dif = p.azul.oro - p.rojo.oro;
  const igual = Math.abs(dif) < 100;
  const d = $('.diferencia');
  clase(d, `diferencia${igual ? '' : dif > 0 ? ' azul' : ' rojo'}`);
  texto(d.querySelector('.flecha'), igual ? '' : dif > 0 ? '◀' : '▶');
  if (igual) fijar(d.querySelector('b'), 0, 'Oro igualado');
  else cifra(d.querySelector('b'), Math.abs(dif), n => `≈${miles(n)}`);

  // Avisos: los que ya estaban al abrir el overlay no se repiten. Los de objetivos solo si el panel los tiene
  // encendidos (si no, se ven los del propio LoL); el resumen de pelea tiene su propio interruptor
  for (const a of p.avisos || []) {
    if (vistos.has(a.id)) continue;
    vistos.add(a.id);
    if (primeraPartida) continue;
    if (a.tipo === 'pelea' ? interruptor('resumenPelea') : estado?.avisosPropios) encolarAviso(a);
  }
  if (primeraPartida) encolarDemo();
  primeraPartida = false;
  siguienteAviso();
  pintarGraficos();
}

// ?demo=aviso,pelea en la dirección encola avisos de muestra al llegar la partida, para colocar el overlay en OBS
// (o sacar capturas) sin esperar a que pase algo de verdad
function encolarDemo() {
  const pedidos = (params.get('demo') || '').split(',').filter(Boolean);
  if (pedidos.includes('aviso')) colaAvisos.push({ id: 'demo-aviso', tipo: 'dragon', lado: 'azul', dragon: 'infernal', t: 0 });
  if (pedidos.includes('multi')) colaAvisos.push({ id: 'demo-multi', tipo: 'multi', lado: 'rojo', racha: 3, jugador: partida?.lineas?.[2]?.rojo?.nombre, t: 0 });
  if (pedidos.includes('pelea')) {
    colaAvisos.push({ id: 'demo-pelea', tipo: 'pelea', lado: 'azul', t: 0, marcador: { azul: 3, rojo: 1 },
      destacado: { nombre: partida?.lineas?.[3]?.azul?.nombre, lado: 'azul', asesinatos: 2 } });
  }
}

// ---------- temporizadores de los objetivos neutrales ----------
function pintarTemporizadores() {
  const t = tiempoAhora();
  lista($('.temporizadores .relojes'), (partida.objetivos || []).map(o => ({ ...o, clave: o.tipo })), o => {
    const el = document.createElement('div');
    el.className = `temporizador ${o.tipo}`;
    el.innerHTML = `<span class="sello">${enso()}<span class="kanji">${OBJETIVO[o.tipo]?.kanji || '天'}</span></span><span class="texto"><small></small><b></b></span>`;
    return el;
  }, (el, o) => {
    const vivo = t >= o.aparece;
    el.classList.toggle('vivo', vivo);
    variable(el, '--color', o.tipo === 'dragon' && o.ancestral ? COLOR_DRAGON.ancestral : '');
    texto(el.querySelector('small'), o.tipo === 'dragon' && o.ancestral ? 'Ancestral'
      : o.tipo === 'larvas' && vivo && o.quedan < 3 ? `Larvas · ${o.quedan}` : OBJETIVO[o.tipo]?.nombre || o.tipo);
    texto(el.querySelector('b'), vivo ? 'vivo' : mmss(o.aparece - t));
    trazar(el, vivo ? 1 : (t - o.desde) / Math.max(1, o.aparece - o.desde));
  });
}

// ---------- lo de cada clan: buffs, alma o punto de alma e inhibidores caídos ----------
function pintarModulos() {
  const t = tiempoAhora();
  for (const lado of ['azul', 'rojo']) {
    const items = [];
    for (const b of partida.buffs || []) {
      if (b.lado !== lado || b.hasta <= t) continue;
      const baron = b.tipo === 'baron';
      items.push({ clave: `${b.tipo}-${b.desde}`, clase: `buff ${b.tipo}`, kanji: baron ? '蛇' : '龍', color: baron ? '#9B59D0' : COLOR_DRAGON.ancestral,
        etiqueta: baron ? 'Buff de Barón' : 'Buff ancestral', valor: mmss(b.hasta - t), p: (b.hasta - t) / Math.max(1, b.hasta - b.desde) });
    }
    const e = partida[lado];
    if (e.alma) items.push({ clave: `alma-${e.alma}`, clase: 'alma', lleno: true, kanji: KANJI_DRAGON[e.alma], color: COLOR_DRAGON[e.alma], etiqueta: 'Alma', valor: ALMA[e.alma] || '' });
    else if (e.puntoDeAlma) items.push({ clave: 'punto', clase: 'punto', kanji: '龍', color: 'var(--shu-claro)', etiqueta: `${e.dragones.length} dragones`, valor: 'Punto de alma', p: 1 });
    for (const i of partida.inhibidores || []) {
      if (i.lado !== lado || i.vuelve <= t) continue;
      items.push({ clave: `inhib-${i.carril}-${i.desde}`, clase: 'inhibidor', kanji: '破', color: 'var(--hai)', etiqueta: `Inhibidor ${i.carril}`,
        valor: mmss(i.vuelve - t), p: (i.vuelve - t) / Math.max(1, i.vuelve - (i.desde ?? i.vuelve - 300)) });
    }
    lista($(`.modulos.${lado}`), items, m => {
      const el = document.createElement('div');
      el.className = `modulo ${m.clase}`;
      el.style.setProperty('--color', m.color);
      if (m.lleno) el.style.setProperty('--tinta', tinta(m.color));
      el.innerHTML = `<span class="sello${m.lleno ? ' lleno' : ''}">${m.lleno ? '' : enso()}<span class="kanji">${m.kanji}</span></span><span class="texto"><small></small><b></b></span>`;
      return el;
    }, (el, m) => {
      texto(el.querySelector('small'), m.etiqueta);
      texto(el.querySelector('b'), m.valor);
      if (m.p != null) trazar(el, m.p);
    });
  }
}

// ---------- avisos: objetivos, torres, primera sangre, multikills, aces y resumen de pelea ----------
// Salen con el logo del clan; el color de la raya dice qué ha sido. Van en cola, de uno en uno: el resumen de
// pelea usa su propia caja (los dos logos y el marcador de la pelea), pero espera su turno como los demás
const colaAvisos = [];
let avisoActual = null, temporizadorAviso = null;
const dragonDe = t => `dragón ${DRAGON[t] || ''}`.trim();
// El nombre del panel para ese jugador, si está en su puesto; si no, el del cliente
const jugadorDe = (lado, nombre) => {
  const i = (partida?.lineas || []).findIndex(l => l[lado]?.nombre === nombre);
  return (i >= 0 && estado?.equipos?.[lado]?.jugadores?.[i]) || nombre || '';
};
const MULTI = { 3: 'triple kill', 4: 'quadra kill', 5: 'pentakill' };
const TEXTO_AVISO = {
  dragon: a => [`${a.robado ? 'roba' : 'se lleva'} el ${dragonDe(a.dragon)}`, COLOR_DRAGON[a.dragon] || COLOR_DRAGON.dragon],
  baron: a => [a.robado ? 'roba el Barón Nashor' : 'mata al Barón Nashor', '#9B59D0'],
  heraldo: a => [a.robado ? 'roba el Heraldo' : 'se lleva el Heraldo', '#8F7AE8'],
  larvas: a => [`se lleva ${a.n > 1 ? `${a.n} larvas` : 'una larva'}`, '#8F7AE8'],
  atakhan: () => ['derrota a Atakhan', '#BE2A2F'],
  torre: a => [a.nivel === 'del nexo' ? 'derriba una torre del nexo' : `derriba la torre ${a.nivel || ''} ${a.carril ? `de ${a.carril}` : ''}`.replace(/\s+/g, ' ').trim(), '#B5AC9C'],
  inhibidor: a => [`rompe el inhibidor ${a.carril || ''}`.trim(), 'var(--shu)'],
  primera: a => [`primera sangre para ${jugadorDe(a.lado, a.jugador)}`, 'var(--shu)'],
  multi: a => [a.racha >= 5 ? `¡pentakill de ${jugadorDe(a.lado, a.jugador)}!` : `${MULTI[a.racha] || 'multikill'} de ${jugadorDe(a.lado, a.jugador)}`, '#E8B04A'],
  ace: () => ['hace un ace', 'var(--shu)'],
};
const cajaDe = a => $(a.tipo === 'pelea' ? '.pelea' : '.aviso');
function pintarAviso(a) {
  if (a.tipo === 'pelea') return pintarPelea(a);
  const [frase, color] = (TEXTO_AVISO[a.tipo] || (() => ['', 'var(--shu)']))(a);
  const caja = $('.aviso');
  caja.style.setProperty('--aviso', color);
  const c = clanDe(a.lado);
  caja.style.setProperty('--clan', c.color);
  const img = caja.querySelector('.aviso-logo');
  if (img.getAttribute('src') !== logo(c.id)) img.src = logo(c.id);
  caja.querySelector('.aviso-quien').textContent = nombreClan(a.lado);
  caja.querySelector('.aviso-que').textContent = frase;
}
function pintarPelea(a) {
  const caja = $('.pelea');
  caja.className = `pelea${a.lado ? ` gana-${a.lado}` : ' empate'}`;
  for (const lado of ['azul', 'rojo']) {
    const img = caja.querySelector(`.pelea-logo.${lado}`);
    if (img.getAttribute('src') !== logo(clanDe(lado).id)) img.src = logo(clanDe(lado).id);
    caja.querySelector(`.pelea-cifra.${lado}`).textContent = a.marcador?.[lado] ?? 0;
  }
  const d = a.destacado;
  caja.querySelector('.pelea-destacado').innerHTML = d
    ? `<b class="${d.lado}">${escapar(jugadorDe(d.lado, d.nombre))}</b> <span>${d.asesinatos} asesinatos</span>`
    : `<span>${nombreClan('azul')} ${a.marcador?.azul ?? 0} – ${a.marcador?.rojo ?? 0} ${nombreClan('rojo')}</span>`;
}
function programarSalida() {
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => {
    aparecer(cajaDe(avisoActual), false);
    temporizadorAviso = setTimeout(() => { avisoActual = null; siguienteAviso(); }, SALIDA_MS + 80);
  }, avisoActual?.tipo === 'pelea' ? DURACION_PELEA : DURACION_AVISO);
}
function siguienteAviso() {
  if (avisoActual || !colaAvisos.length) return;
  avisoActual = colaAvisos.shift();
  pintarAviso(avisoActual);
  aparecer(cajaDe(avisoActual), true);
  programarSalida();
}
// Las larvas caen de dos en dos o de tres en tres: se juntan en un solo aviso que va contando
function encolarAviso(a) {
  if (a.tipo === 'larvas') {
    const junto = [avisoActual, colaAvisos.at(-1)].find(x => x?.tipo === 'larvas' && x.lado === a.lado);
    if (junto) {
      junto.n++;
      if (junto === avisoActual && !$('.aviso').classList.contains('sale')) { pintarAviso(junto); programarSalida(); }
      return;
    }
    a = { ...a, n: 1 };
  }
  colaAvisos.push(a);
}

// ---------- grafismos que saca el panel: línea por línea, ficha y gráfica (uno a la vez) ----------
function pintarGraficos() {
  const g = estado?.grafico;
  const hay = tipo => g?.tipo === tipo && Boolean(partida?.activo);
  const lineas = hay('lineas') && (partida.lineas || []).length === 5;
  pintarLineas(lineas);
  pintarCamaraPartida();
  pintarFicha(hay('ficha') ? g : null);
  pintarGrafica(hay('oro'));
}

// ---------- la definitiva (la R) de cada campeón ----------
// Una insignia pegada al retrato, en la esquina de abajo del lado de fuera: el icono de la R, apagado (gris y medio
// transparente) hasta que se desbloquea y encendido después, con una muesca por rango (niveles 6, 11 y 16) al lado.
// El modo espectador no da el enfriamiento: solo el nivel. La misma insignia va en la ficha, junto a su retrato
const INSIGNIA_DEFINITIVA = '<i class="definitiva r0" hidden><img alt="" hidden><b class="rangos"><i></i><i></i><i></i></b></i>';
// Si el icono no carga, la insignia entera se esconde, como los hechizos y las runas (y no se vuelve a pedir)
document.addEventListener('error', e => {
  const insignia = e.target.tagName === 'IMG' && e.target.closest('.definitiva');
  if (insignia) { e.target.dataset.roto = e.target.getAttribute('src'); e.target.hidden = true; insignia.hidden = true; }
}, true);
// Solo escribe el src, el hidden y las clases si cambian (el marcador se refresca cada segundo)
function pintarDefinitiva(insignia, campeon, nivel) {
  const img = insignia.querySelector('img');
  pintarIcono(img, campeon && definitiva(campeon));
  if (insignia.hidden !== img.hidden) insignia.hidden = img.hidden;
  const { rango, encendida } = estadoDefinitiva(campeon, nivel);
  clase(insignia, `definitiva r${rango}${encendida ? ' encendida' : ''}`);
}

// ---------- línea por línea ----------
// Cada fila es un puesto (top, jungla, medio, ADC y apoyo, en ese orden): retrato, hechizos, runa y misión de rol, nombre,
// KDA y súbditos, objetos y oro de cada jugador; en medio, la diferencia de oro y los puntos provisionales del fantasy de los dos
const filas = $('.lineas .filas');
filas.innerHTML = [0, 1, 2, 3, 4].map(i => `<div class="fila" style="--i:${i}" data-i="${i}">
  ${['azul', 'rojo'].map(lado => {
    const retrato = `<span class="retrato"><img alt=""><i class="nivel"></i><i class="muerte"></i>${INSIGNIA_DEFINITIVA}</span>`;
    // Pegados al retrato: los dos hechizos apilados y, al lado, la piedra angular sobre el hueco de la misión de rol
    const icono = clase => `<i class="${clase}"><img alt="" hidden></i>`;
    const iconos = `<span class="iconos"><span class="sums">${icono('sum')}${icono('sum')}</span>`
      + `<span class="runa-mision">${icono('runa')}${icono('mision vacio')}</span></span>`;
    const quien = '<span class="quien"><span class="linea-nombre"><b class="nombre"></b>'
      + '<span class="recompensa" hidden><svg><use href="#i-oro"/></svg><b></b></span></span><small class="kda"><b class="kda-cifras"></b><span class="cs"></span></small></span>';
    const objetos = '<span class="objetos"><span class="huecos"></span><i class="hueco abalorio"><img alt="" hidden></i></span>';
    const oro = '<span class="oro"></span>';
    const partes = lado === 'azul' ? [retrato, iconos, quien, objetos, oro] : [oro, objetos, quien, iconos, retrato];
    return `<div class="jugador ${lado}">${partes.join('')}</div>`;
  }).join(`<div class="medio">
    <span class="puntos azul"><b></b></span>
    <span class="dif-oro"><span class="barra"><i class="relleno azul"></i><i class="relleno rojo"></i></span><span class="dif"></span></span>
    <span class="puntos rojo"><b></b></span>
  </div>`)}
</div>`).join('');
// Un objeto sin icono (nuevo en un parche) deja el hueco vacío en lugar de una imagen rota
filas.addEventListener('error', e => { if (e.target.tagName === 'IMG' && e.target.closest('.hueco')) e.target.closest('.hueco').remove(); }, true);
// Un hechizo, una runa o una misión sin icono se esconde (el hueco se queda, para no descolocar la fila) y se recuerda
// cuál falló para no pedirlo otra vez cada segundo
filas.addEventListener('error', e => {
  if (e.target.tagName === 'IMG' && e.target.closest('.iconos')) { e.target.dataset.roto = e.target.getAttribute('src'); e.target.hidden = true; }
}, true);
function pintarIcono(img, src) {
  const verlo = Boolean(src) && img.dataset.roto !== src;
  if (verlo && img.getAttribute('src') !== src) img.src = src;
  img.hidden = !verlo;
}

function pintarLineas(mostrar) {
  const caja = $('.lineas');
  // La zona del panel (la misma de la gráfica de oro) va siempre encogida a ESCALA_LINEAS: así la gráfica sale justo en
  // el mismo hueco
  if (mostrar) variable($('.zona-lineas'), '--escala-lineas', String(ESCALA_LINEAS));
  aparecer(caja, mostrar);
  if (!mostrar) return;
  const conPuntos = interruptor('puntosFantasy');
  caja.classList.toggle('sin-puntos', !conPuntos);
  const difs = partida.lineas.map(l => (l.azul?.oro || 0) - (l.rojo?.oro || 0));
  const escala = Math.max(1500, ...difs.map(Math.abs));
  partida.lineas.forEach((l, i) => {
    const fila = filas.children[i];
    for (const lado of ['azul', 'rojo']) {
      const j = l[lado];
      const caja = fila.querySelector(`.jugador.${lado}`);
      if (caja.style.visibility !== (j ? '' : 'hidden')) caja.style.visibility = j ? '' : 'hidden';
      if (!j) continue;
      src(caja.querySelector('.retrato > img'), icono(j.campeon));
      texto(caja.querySelector('.nivel'), j.nivel);
      pintarDefinitiva(caja.querySelector('.definitiva'), j.campeon, j.nivel);
      const retrato = caja.querySelector('.retrato');
      retrato.classList.toggle('muerto', j.muerto);
      // En racha (3 asesinatos o más sin morir) el recuadro se ilumina; a partir de 5, más
      retrato.classList.toggle('racha', !j.muerto && j.racha >= 3);
      retrato.classList.toggle('racha-alta', !j.muerto && j.racha >= 5);
      texto(caja.querySelector('.muerte'), j.muerto && j.reaparece ? j.reaparece : '');
      // Solo los objetos que se tienen, sin huecos vacíos; el abalorio aparte
      const huecos = caja.querySelector('.huecos');
      const ids = (j.objetos || []).slice(0, 6).filter(Boolean);
      const firma = ids.join(',');
      if (huecos.dataset.firma !== firma) {
        huecos.dataset.firma = firma;
        huecos.innerHTML = ids.map(id => `<i class="hueco"><img src="/ddragon/objeto/${id}.png" alt=""></i>`).join('');
      }
      const abalorio = caja.querySelector('.abalorio');
      const idAbalorio = j.objetos?.[6];
      const rutaAbalorio = idAbalorio ? `/ddragon/objeto/${idAbalorio}.png` : null;
      const imgAbalorio = abalorio.querySelector('img');
      if (!imgAbalorio) abalorio.innerHTML = '<img alt="" hidden>';
      const ia = abalorio.querySelector('img');
      if (ia.getAttribute('src') !== rutaAbalorio) {
        if (rutaAbalorio) { ia.hidden = false; ia.src = rutaAbalorio; } else { ia.hidden = true; ia.removeAttribute('src'); }
      }
      abalorio.classList.toggle('vacio', !rutaAbalorio);
      // Hechizos de invocador, piedra angular y recompensa de la misión de rol (si el cliente la da)
      caja.querySelectorAll('.sum img').forEach((img, n) => pintarIcono(img, j.hechizos?.[n] && `/ddragon/hechizo/${j.hechizos[n]}.png`));
      pintarIcono(caja.querySelector('.runa img'), j.runa && `/ddragon/runa/${j.runa}.png`);
      const mision = caja.querySelector('.mision');
      pintarIcono(mision.querySelector('img'), j.mision?.objeto && `/ddragon/objeto/${j.mision.objeto}.png`);
      mision.classList.toggle('vacio', !j.mision);
      // El nombre del panel para ese puesto, si lo hay; si no, el del cliente
      texto(caja.querySelector('.nombre'), estado?.equipos?.[lado]?.jugadores?.[i] || j.nombre);
      texto(caja.querySelector('.kda-cifras'), `${j.k} / ${j.d} / ${j.a}`);
      texto(caja.querySelector('.cs'), `${j.cs} CS`);
      // Shutdown: lo que se lleva quien lo mate por encima de lo normal (aproximado, el juego no lo da).
      // Por debajo de 100 no sale: el margen de error de la estimación es de ese orden
      const recompensa = caja.querySelector('.recompensa');
      recompensa.hidden = !(j.recompensa >= 100);
      texto(recompensa.querySelector('b'), `≈${j.recompensa}`);
      cifra(caja.querySelector('.oro'), j.oro, n => `≈${miles(n)}`);
    }
    const dif = difs[i];
    const lado = Math.abs(dif) < 100 ? '' : dif > 0 ? 'azul' : 'rojo';
    const ancho = lado ? Math.abs(dif) / escala : 0;
    for (const [rel, suyo] of [[fila.querySelector('.relleno.azul'), 'azul'], [fila.querySelector('.relleno.rojo'), 'rojo']]) {
      const t = `scaleX(${lado === suyo ? ancho : 0})`;
      if (rel.style.transform !== t) rel.style.transform = t;
    }
    const d = fila.querySelector('.dif');
    clase(d, `dif ${lado}`);
    if (lado) cifra(d, Math.abs(dif), n => `≈${miles(n)}`); else fijar(d, 0, 'Igual');
    // Puntos provisionales de los dos, con el que va por delante resaltado
    const pa = l.azul?.puntos, pr = l.rojo?.puntos;
    const delante = pa == null || pr == null || pa === pr ? '' : pa > pr ? 'azul' : 'rojo';
    for (const lado of ['azul', 'rojo']) {
      const caja = fila.querySelector(`.puntos.${lado}`);
      const v = l[lado]?.puntos;
      caja.classList.toggle('delante', delante === lado);
      caja.classList.toggle('sin', v == null);
      if (v == null) fijar(caja.querySelector('b'), 0, '–');
      else cifra(caja.querySelector('b'), Math.round(v * 10), n => decimal(n / 10));
    }
  });
}

// ---------- cámara del caster en partida, abajo a la derecha ----------
// Un hueco transparente abajo a la derecha (abajo a la izquierda va el minimapa del LoL): la cámara va por debajo del
// overlay en OBS, justo donde dice el panel (camaraPartida en comun.js). Va por su cuenta, se vea o no el línea por línea: sale (con su animación) cuando se
// activa en el panel y hay partida, y se va al quitarla. Lleva el marco de caster: el emblema de Gokudō y el nombre y
// el detalle que se escriban en el panel. Es ingame.camaras[0]; la segunda de la lista no sale (la izquierda de
// antes chocaría con el minimapa)
function pintarCamaraPartida() {
  const cam = estado?.ingame?.camaras?.[0];
  const ver = Boolean(cam?.activa && partida?.activo);
  document.body.classList.toggle('con-camara-partida', ver);
  const h = camaraPartida();
  lista($('.camaras-partida'), ver ? [{ ...cam, clave: 'partida' }] : [], () => {
    const el = document.createElement('div');
    el.className = 'camara-partida';
    el.innerHTML = '<div class="ventana-cam"><div class="medidas-cam"><span></span></div></div>'
      + '<div class="placa-cam"><span class="sello-cam"><img src="/marca/gokudo.png" alt=""></span><span class="nombre-cam"></span><span class="detalle-cam"></span></div>';
    return el;
  }, (el, c) => {
    Object.assign(el.style, { left: `${h.x}px`, top: `${h.y}px`, width: `${h.w}px` });
    el.querySelector('.ventana-cam').style.height = `${h.h}px`;
    el.querySelector('.medidas-cam span').innerHTML = `Cámara del caster<br>${h.w}×${h.h} en x ${h.x}, y ${h.y}`;
    el.querySelector('.nombre-cam').textContent = c.nombre || 'Caster';
    el.querySelector('.detalle-cam').textContent = c.detalle || '';
  });
}

// ---------- ficha de un jugador (su carta y sus números) ----------
// La carta es la del puesto (CLAN-ROL), de /api/jugador. Si no la tiene (clanes sin cartas todavía), el retrato de
// su campeón ocupa su sitio. Nunca una imagen rota: si la carta no carga, también se pasa al retrato
const cartas = new Map();  // id del puesto → carta (o null si no tiene)
async function cartaDe(id) {
  if (!cartas.has(id)) {
    cartas.set(id, fetch(`/api/jugador?id=${encodeURIComponent(id)}`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(f => f?.carta || null).catch(() => null));
  }
  return cartas.get(id);
}
let fichaPintada = null;
function pintarFicha(g) {
  const caja = $('.ficha');
  const j = g ? partida.lineas?.[g.indice]?.[g.lado] : null;
  aparecer(caja, Boolean(j));
  if (!j) { fichaPintada = null; return; }
  const lado = g.lado, i = g.indice, rol = partida.lineas[i].rol;
  const c = clanDe(lado);
  clase(caja, `ficha ${lado}`);
  variable(caja, '--clan', c.color);
  variable(caja, '--clan-texto', c.texto);
  const nombre = estado?.equipos?.[lado]?.jugadores?.[i] || j.nombre;
  texto(caja.querySelector('.ficha-nombre'), nombre);
  texto(caja.querySelector('.ficha-rol'), `${ROL[rol] || rol} · ${nombreClan(lado)}`);
  src(caja.querySelector('.ficha-logo'), logo(c.id));
  src(caja.querySelector('.ficha-campeon'), icono(j.campeon));
  pintarDefinitiva(caja.querySelector('.ficha-campeon-caja .definitiva'), j.campeon, j.nivel);
  // La carta solo se vuelve a montar si cambia de jugador (la ficha se refresca cada segundo)
  const clave = `${g.id}|${lado}|${i}`;
  if (fichaPintada !== clave) {
    fichaPintada = clave;
    const hueco = caja.querySelector('.ficha-carta');
    // Sin carta, el splash de su campeón recortado a lo alto (si tampoco carga, su icono): nunca una imagen rota
    const retrato = `<div class="ficha-retrato"><img src="${splash(j.campeon)}" alt="" onerror="this.onerror=null;this.src='${icono(j.campeon)}'"><span class="ficha-retrato-nivel"></span></div>`;
    hueco.innerHTML = retrato;
    const id = `${c.id}-${rol}`;
    cartaDe(id).then(carta => {
      if (fichaPintada !== clave) return;
      if (!carta) return;
      hueco.innerHTML = cartaHTML(carta, { nombreClan: idClan => clanes.clan(idClan).nombre });
      const arte = hueco.querySelector('.arte');
      if (arte) arte.addEventListener('error', () => { if (fichaPintada === clave) hueco.innerHTML = retrato; }, { once: true });
    });
  }
  const nivel = caja.querySelector('.ficha-retrato-nivel');
  if (nivel) texto(nivel, j.nivel);
  const minutos = Math.max(1, tiempoAhora() / 60);
  const cifras = [
    ['KDA', `${j.k}/${j.d}/${j.a}`, ''],
    ['CS / min', decimal(j.cs / minutos), ''],
    ['Participación', j.kp == null ? '–' : `${j.kp} %`, ''],
    ['Visión', j.vision == null ? '–' : String(j.vision), ''],
    ['Nivel', String(j.nivel), ''],
    ['Oro', `≈${miles(j.oro)}`, 'oro'],
  ];
  const cajaCifras = caja.querySelector('.ficha-cifras');
  if (cajaCifras.children.length !== cifras.length) cajaCifras.innerHTML = cifras.map((_, k) => `<div class="ficha-cifra" style="--i:${k}"><small></small><b></b></div>`).join('');
  cifras.forEach(([etiqueta, valor, extra], k) => {
    const el = cajaCifras.children[k];
    clase(el, `ficha-cifra ${extra}`);
    texto(el.querySelector('small'), etiqueta);
    texto(el.querySelector('b'), valor);
  });
  // Sus objetos, sin huecos vacíos, y el abalorio aparte
  const objetos = caja.querySelector('.ficha-objetos');
  const ids = (j.objetos || []).slice(0, 6).filter(Boolean), abalorio = j.objetos?.[6];
  const firmaObjetos = `${ids.join(',')}|${abalorio || ''}`;
  if (objetos.dataset.firma !== firmaObjetos) {
    objetos.dataset.firma = firmaObjetos;
    objetos.innerHTML = `<span class="huecos">${ids.map(id => `<i class="hueco"><img src="/ddragon/objeto/${id}.png" alt=""></i>`).join('')}</span>`
      + `<i class="hueco abalorio${abalorio ? '' : ' vacio'}">${abalorio ? `<img src="/ddragon/objeto/${abalorio}.png" alt="">` : ''}</i>`;
  }
  const puntos = caja.querySelector('.ficha-puntos');
  puntos.hidden = !interruptor('puntosFantasy');
  if (j.puntos == null) fijar(puntos.querySelector('b'), 0, '–');
  else cifra(puntos.querySelector('b'), Math.round(j.puntos * 10), n => decimal(n / 10));
}

// ---------- gráfica de oro ----------
// Área en SVG: azul por encima del cero y rojo por debajo, cada 15 s de partida, con el eje en minutos. Cada
// muestra lleva una barra fina que entra escalonada (transform); el área se descubre de izquierda a derecha
// (un rectángulo de recorte que se escala) y la línea se dibuja por encima
let graficaFirma = null;
function pintarGrafica(mostrar) {
  const caja = $('.grafica');
  aparecer(caja, mostrar);
  if (!mostrar) { graficaFirma = null; return; }
  const muestras = partida.grafica?.muestras || [];
  const firma = `${muestras.length}|${muestras.at(-1)?.join(',')}`;
  if (firma === graficaFirma) return;
  const primera = graficaFirma === null;
  graficaFirma = firma;
  // Mide lo mismo que el línea por línea (1560 de ancho) para salir en su mismo hueco; el alto es el que le queda a la
  // gráfica dentro del panel (436 menos la cabeza y el eje). Si cambia, cambia también el viewBox de index.html
  const W = 1560, H = 344, margen = 18, cero = H / 2;
  const svg = caja.querySelector('.grafica-svg');
  if (muestras.length < 2) { svg.innerHTML = ''; return; }
  const t0 = muestras[0][0], t1 = Math.max(muestras.at(-1)[0], t0 + 120);
  // La escala redondea al millar hacia arriba, con 2k de mínimo para que una partida igualada no parezca una montaña
  const maximo = Math.max(2000, Math.ceil(Math.max(...muestras.map(m => Math.abs(m[1]))) / 1000) * 1000);
  const x = t => (t - t0) / (t1 - t0) * W;
  const y = v => cero - Math.max(-1, Math.min(1, v / maximo)) * (cero - margen);
  const puntos = muestras.map(([t, v]) => `${x(t).toFixed(1)},${y(v).toFixed(1)}`);
  const area = `M${x(t0).toFixed(1)},${cero} L${puntos.join(' L')} L${x(muestras.at(-1)[0]).toFixed(1)},${cero} Z`;
  const linea = `M${puntos.join(' L')}`;
  const barras = muestras.map(([t, v], k) => `<line class="barra ${v >= 0 ? 'azul' : 'rojo'}" x1="${x(t).toFixed(1)}" x2="${x(t).toFixed(1)}" y1="${cero}" y2="${y(v).toFixed(1)}" style="--i:${k}; transform-origin: 0 ${cero}px"/>`).join('');
  // Rejilla: una línea por cada paso hasta el máximo (como mucho 4 a cada lado) y el cero
  const paso = Math.max(1000, Math.ceil(maximo / 4 / 1000) * 1000);
  const rejilla = [], rotulos = [];
  for (let v = paso; v <= maximo; v += paso) {
    rejilla.push(y(v), y(-v));
    rotulos.push(`<text class="rotulo azul" x="8" y="${(y(v) + 5).toFixed(1)}">+${miles(v)}</text><text class="rotulo rojo" x="8" y="${(y(-v) + 5).toFixed(1)}">+${miles(v)}</text>`);
  }
  const entra = primera ? ' entra' : '';
  svg.innerHTML = `<defs>
      <clipPath id="recorte-azul"><rect x="0" y="0" width="${W}" height="${cero}"/></clipPath>
      <clipPath id="recorte-rojo"><rect x="0" y="${cero}" width="${W}" height="${cero}"/></clipPath>
      <clipPath id="recorte-tiempo"><rect class="cortina${entra}" x="0" y="0" width="${W}" height="${H}"/></clipPath>
    </defs>
    <g class="rejilla">${rejilla.map(yy => `<line x1="0" x2="${W}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}"/>`).join('')}</g>
    <g clip-path="url(#recorte-tiempo)">
      <path class="area azul" d="${area}" clip-path="url(#recorte-azul)"/>
      <path class="area rojo" d="${area}" clip-path="url(#recorte-rojo)"/>
    </g>
    <g class="barras${entra}">${barras}</g>
    <path class="linea${entra}" d="${linea}" pathLength="100"/>
    <line class="cero" x1="0" x2="${W}" y1="${cero}" y2="${cero}"/>
    <g class="rotulos">${rotulos.join('')}</g>`;
  // Eje de tiempo en minutos: una marca cada 5 minutos (cada 2 si la partida es corta)
  const cada = t1 - t0 > 1500 ? 300 : 120;
  const marcas = [];
  for (let t = Math.ceil(t0 / cada) * cada; t <= t1; t += cada) marcas.push(`<span style="left:${(x(t) / W * 100).toFixed(2)}%">${Math.round(t / 60)}'</span>`);
  caja.querySelector('.grafica-eje').innerHTML = marcas.join('');
}

conectarDirecto({
  alEstado: e => { estado = e; pintarEstilo(); pintarEquipos(); pintarPartida(); },
  alPartida: p => { partida = p; recibidaEn = Date.now(); pintarPartida(); pintarTemporizadores(); pintarModulos(); },
});
pintarEstilo();

setInterval(() => {
  if (!partida) return;
  texto($('.reloj'), mmss(tiempoAhora()));
  pintarTemporizadores();
  pintarModulos();
}, 250);
