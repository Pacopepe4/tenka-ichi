// La tragaperras de Gokudō y la apertura de las tiradas. Cada tirada que tienes es una moneda: se mete por la ranura,
// baja la palanca, giran los tres rodillos y las cartas salen por la bandeja, boca abajo.
// - Con una tirada (×1, o la palanca) las cartas se descubren una a una, o todas de peor a mejor.
// - Con varias (×5 o «Todas») hay un solo giro y después un resumen: cuántas nuevas, lo mejor (que se descubre solo),
//   los premios de familia y la rejilla con todas las cartas.
// Los rodillos son decorativos: al parar insinúan lo mejor que ha salido (tres iguales con una S, una S+, una LEGACY o
// un jefe; dos A y una que no, con una A). Las piezas dibujadas en Flow se apuntan en tragaperras/piezas.json
// (tragaperras.css dice cuáles y de qué tamaño)
import { logo } from '/comun.js';
import { TIERS, claveTier, escapar } from '/carta.js';
import { $, est, clanes, nombreClan, cartaHTML, ganchos } from './estado.js';

const raiz = $('.tragaperras'), dialogo = $('.apertura'), escena = $('.escena');
const palanca = raiz.querySelector('.palanca'), botones = [...raiz.querySelectorAll('.tirar')];
const rodillos = [...raiz.querySelectorAll('.rodillo')];
const reducido = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const espera = ms => new Promise(r => setTimeout(r, ms));
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// De que se pulsa hasta que se abre la apertura, la máquina no atiende a nada más (y gachapon.js no recarga la página)
let ocupada = false, gastando = 0;
export const aperturaAbierta = () => dialogo.open || ocupada;

// ---------- las piezas de Flow ----------
// tragaperras/piezas.json dice qué piezas ya tienen dibujo: { "maquina": "maquina.webp", "palanca": null, … }. Las que
// tienen archivo se ponen en --arte-<pieza> con la clase con-<pieza>; las demás siguen en CSS. Así no se pide ninguna
// imagen que no existe
const PIEZAS = ['maquina', 'palanca', 'pomo', 'moneda', 'bandeja', 'rodillo'];
fetch('/gachapon/tragaperras/piezas.json').then(r => (r.ok ? r.json() : {})).then(piezas => {
  for (const pieza of PIEZAS) {
    const archivo = piezas[pieza];
    if (typeof archivo !== 'string' || !archivo) continue;
    raiz.style.setProperty(`--arte-${pieza}`, `url("/gachapon/tragaperras/${encodeURI(archivo)}")`);
    raiz.classList.add(`con-${pieza}`);
  }
}).catch(() => {});

// ---------- el orden de las cartas ----------
// TIERS va de la más rara a la más común: TEMPORADA, JEFE, LEGACY, S+, S, A, B, C, D
const rango = c => { const i = TIERS.indexOf(c.tier); return i < 0 ? TIERS.length : i; };
const dePeorAMejor = (a, b) => rango(b) - rango(a);
const GRANDES = ['S', 'SP', 'LEGACY', 'JEFE', 'TEMPORADA'];

// ---------- los rodillos ----------
// Los símbolos: los kamon de las familias, las letras de tier y el sol de Gokudō (el de las LEGACY)
const familias = clanes.filter(c => !c.invitado);
const clave = s => s.clan || (s.sol ? 'sol' : s.tier);
const simboloHTML = (s, gana = false) => {
  const extra = gana ? ' gana' : '';
  if (s.clan) return `<span class="simbolo kamon${extra}"><img src="${logo(s.clan)}" alt=""></span>`;
  if (s.sol) return `<span class="simbolo sol${extra}"><img src="/marca/gokudo.png" alt=""></span>`;
  const k = claveTier(s.tier);
  return `<span class="simbolo letra${extra}" data-tier="${k}" style="--color-tier: var(--tier-${k})">${escapar(s.tier)}</span>`;
};
// Al azar salen los kamon y las letras de la D a la A: las S, las S+ y el sol se guardan para cuando toca
const surtido = [...familias.map(c => ({ clan: c.id })), ...['D', 'C', 'B', 'A'].map(tier => ({ tier }))];
const alAzar = (sin = []) => {
  const quedan = surtido.filter(s => !sin.includes(clave(s)));
  return quedan[Math.floor(Math.random() * quedan.length)];
};
const describir = s => (s.clan ? `el kamon de ${nombreClan(s.clan)}` : s.sol ? 'el sol de Gokudō' : `una ${s.tier}`);

// La cinta de un rodillo: una columna de símbolos. La del índice i queda en el centro con translateY(-i/n de la cinta)
function ponerCinta(rodillo, simbolos, centro, gana = false) {
  const cinta = rodillo.querySelector('.cinta');
  cinta.getAnimations().forEach(a => a.cancel());
  cinta.innerHTML = simbolos.map((s, i) => simboloHTML(s, gana && i === centro)).join('');
  cinta.style.transform = `translateY(${(-100 * centro / simbolos.length).toFixed(4)}%)`;
  return cinta;
}
const cintaAlAzar = n => Array.from({ length: n }, () => alAzar());

// En reposo, cada rodillo enseña un símbolo cualquiera con los de al lado asomando
rodillos.forEach(r => ponerCinta(r, cintaAlAzar(3), 1));

// Mientras llega la respuesta, los rodillos dan vueltas sin fin: una cinta de 12 símbolos repetida, que se desplaza media
function girarSinFin() {
  rodillos.forEach((r, i) => {
    const doce = cintaAlAzar(12), cinta = ponerCinta(r, [...doce, ...doce], 0);
    r.classList.add('girando');
    cinta.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-50%)' }], { duration: 380 + i * 30, iterations: Infinity });
  });
}

// Lo que enseñan los rodillos al parar, según lo mejor que ha salido en todas las tiradas
function finales(tiradas) {
  const todas = tiradas.flatMap(t => [...t.cartas, ...(t.premios || []).map(p => p.carta).filter(Boolean)]);
  const mejor = [...todas].sort((a, b) => rango(a) - rango(b))[0];
  const k = mejor ? claveTier(mejor.tier) : null;
  let tres = null;
  if (k === 'JEFE') tres = { clan: mejor.clan };          // el jefe de una familia: tres kamon de su familia
  else if (k === 'LEGACY' || k === 'TEMPORADA') tres = { sol: true };
  else if (k === 'S' || k === 'SP') tres = { tier: mejor.tier };
  if (tres?.clan && !familias.some(c => c.id === tres.clan)) tres = { sol: true };
  if (tres) return { simbolos: [tres, tres, tres], premio: k, mejor };
  // Con una A, dos A y la tercera no: casi
  if (k === 'A') return { simbolos: [{ tier: 'A' }, { tier: 'A' }, alAzar(['A'])], casi: true, mejor };
  // Si no, tres distintos
  const a = alAzar(), b = alAzar([clave(a)]), c = alAzar([clave(a), clave(b)]);
  return { simbolos: [a, b, c], mejor };
}

// Cada rodillo para con su símbolo en el centro, uno detrás de otro y con un rebote. Si los dos primeros son iguales, el
// tercero se hace esperar un poco más. La cinta de parada lleva tantos símbolos como recorrería a la velocidad de la vuelta
async function pararRodillos(simbolos, conMovimiento) {
  const iguales = clave(simbolos[0]) === clave(simbolos[1]);
  const premio = iguales && clave(simbolos[1]) === clave(simbolos[2]);
  await Promise.all(rodillos.map(async (r, i) => {
    const gana = premio || (iguales && i < 2);
    if (!conMovimiento) { r.classList.remove('girando'); ponerCinta(r, [alAzar(), simbolos[i], alAzar()], 1, gana); return; }
    const duracion = 900 + i * 420 + (i === 2 && iguales ? 650 : 0);
    const pasos = Math.round(duracion / 77);
    const lista = [...cintaAlAzar(pasos), simbolos[i], alAzar()];
    const cinta = ponerCinta(r, lista, 0, false);
    const fin = `translateY(${(-100 * pasos / lista.length).toFixed(4)}%)`;
    const vuelta = cinta.animate([{ transform: 'translateY(0)' }, { transform: fin }], { duration: duracion, easing: 'cubic-bezier(.25, .6, .3, 1.08)' });
    // El rodillo deja de verse borroso en el último tramo
    setTimeout(() => r.classList.remove('girando'), duracion * .7);
    await vuelta.finished.catch(() => {});
    ponerCinta(r, lista, pasos, gana);
  }));
  return { premio, casi: iguales && !premio };
}

// ---------- el monedero ----------
// Las tiradas que quedan, en monedas (hasta 8 en el monton) y en cifra
function pintarMonedas(n) {
  const monedero = raiz.querySelector('.monedero'), monton = raiz.querySelector('.monedas');
  const ver = Math.min(n, 8);
  if (Number(monton.dataset.n) !== ver) {
    monton.dataset.n = ver;
    monton.innerHTML = ver ? Array.from({ length: ver }, () => '<span class="moneda"></span>').join('') : '<span class="moneda sin"></span>';
  }
  raiz.querySelector('.monedero-cifra').textContent = n;
  raiz.querySelector('.monedero-texto').textContent = n === 1 ? 'moneda' : 'monedas';
  monedero.classList.toggle('vacio', !n);
}

const estado = texto => { raiz.querySelector('.maquina-estado').textContent = texto; };

// La máquina, con lo último que ha dicho el servidor: monedas, botones y el aviso de debajo
export function pintarMaquina() {
  const info = est.info, u = info?.usuario, n = Math.max(0, (u?.sobres || 0) - gastando);
  const lista = Boolean(info?.activo && info?.sobresListos && u);
  const max = info?.maximoTiradas || 50, todas = Math.min(n, max);
  for (const b of botones) {
    const cuantas = b.dataset.cuantas === 'todos' ? 1 : Number(b.dataset.cuantas);
    b.disabled = ocupada || !lista || n < cuantas;
  }
  palanca.disabled = ocupada || !lista || n < 1;
  // «Todas» dice cuántas son (hasta el máximo de una vez)
  const bTodas = botones.find(b => b.dataset.cuantas === 'todos');
  bTodas.innerHTML = `<b>Todas</b>${todas > 1 ? `<small>×${todas}</small>` : ''}`;
  bTodas.setAttribute('aria-label', todas > 1 ? `Todas las tiradas de una vez: gastan ${todas} monedas` : 'Todas las tiradas de una vez');
  raiz.querySelector('.monedero').hidden = !u;
  if (u) pintarMonedas(n);
  raiz.classList.toggle('encendida', lista && n > 0);
  if (ocupada) return;
  estado(!info ? '' : !info.activo ? 'La máquina se enciende muy pronto.' : !u ? 'Entra con tu cuenta para jugar.'
    : !info.sobresListos ? 'Apagada hasta que estén las cartas de los jugadores.'
    : n ? 'Mete una moneda y tira de la palanca.' : 'Sin monedas: consigue más tiradas.');
}

// Cada vez que gachapon.js pinta la cuenta (rehace .cuenta y escribe las tiradas en .sobre-contador), se repinta la máquina
const alPintarCuenta = new MutationObserver(pintarMaquina);
alPintarCuenta.observe($('.cuenta'), { childList: true });
alPintarCuenta.observe(raiz.querySelector('.sobre-contador'), { childList: true, characterData: true, subtree: true });
pintarMaquina();

// ---------- tirar ----------
// La moneda vuela del monedero a la ranura y entra. Con varias tiradas entran unas cuantas seguidas (hasta 3)
async function meterMonedas(cuantas, alSalir) {
  const desde = raiz.querySelector('.monedas .moneda:last-child') || raiz.querySelector('.monedero');
  const ranura = raiz.querySelector('.ranura'), boca = raiz.querySelector('.ranura-boca');
  const a = desde.getBoundingClientRect(), b = boca.getBoundingClientRect();
  alSalir();   // las monedas dejan el montón al echar a volar
  const vuelos = Array.from({ length: Math.min(cuantas, 3) }, async (_, i) => {
    await espera(i * 150);
    const m = document.createElement('span');
    m.className = 'moneda vuela';
    m.setAttribute('aria-hidden', 'true');
    raiz.appendChild(m);
    const x0 = a.left + a.width / 2 - 20, y0 = a.top + a.height / 2 - 20, x1 = b.left + b.width / 2 - 20, y1 = b.top + b.height / 2 - 20;
    const alto = Math.min(y0, y1) - 70;
    // Sube en arco, se pone de canto delante de la ranura y entra
    await m.animate([
      { transform: `translate(${x0}px, ${y0}px) rotateY(0) scale(1)` },
      { transform: `translate(${(x0 + x1) / 2}px, ${alto}px) rotateY(0) scale(1.15)`, offset: .45 },
      { transform: `translate(${x1}px, ${y1 - 8}px) rotateY(80deg) scale(1)`, offset: .8 },
      { transform: `translate(${x1}px, ${y1 + 6}px) rotateY(88deg) scale(.7)`, opacity: 0 },
    ], { duration: 620, easing: 'cubic-bezier(.3, .6, .4, 1)', fill: 'forwards' }).finished.catch(() => {});
    m.remove();
    ranura.classList.add('tragando');
    setTimeout(() => ranura.classList.remove('tragando'), 260);
  });
  await Promise.all(vuelos);
}

async function tirarPalanca() {
  palanca.classList.remove('tirando');
  void palanca.offsetWidth;   // para que vuelva a empezar si ya se había tirado
  palanca.classList.add('tirando');
  await espera(380);          // los rodillos arrancan cuando la palanca llega abajo
  setTimeout(() => palanca.classList.remove('tirando'), 600);
}

// Unas cartas boca abajo asoman por la bandeja de la máquina
function sacarPorBandeja(n) {
  const bandeja = raiz.querySelector('.bandeja-cartas');
  const reverso = est.info.reverso ? `background-image: url('${escapar(est.info.reverso)}');` : '';
  bandeja.innerHTML = Array.from({ length: Math.min(n, 5) }, (_, i) => `<i style="--i: ${i}; ${reverso}"></i>`).join('');
}

// Lo que se dice al parar los rodillos
function aviso(fin, tiradas) {
  const n = tiradas.reduce((s, t) => s + t.cartas.length + (t.premios || []).filter(p => p.carta).length, 0);
  const salen = `salen ${plural(n, 'carta', 'cartas')}`;
  if (fin.premio === 'JEFE') return `¡Tres kamon de ${nombreClan(fin.mejor.clan)}! Familia completa: ${salen}.`;
  if (fin.premio === 'LEGACY' || fin.premio === 'TEMPORADA') return `¡Tres soles! Hay una LEGACY: ${salen}.`;
  if (fin.premio) return `¡Tres ${fin.mejor.tier}! ${salen[0].toUpperCase()}${salen.slice(1)}.`;
  if (fin.casi) return `Dos A… ${salen[0].toUpperCase()}${salen.slice(1)}.`;
  return `${salen[0].toUpperCase()}${salen.slice(1)}.`;
}

// cuantas: 1, 5 o 'todos'. Hace las tiradas en el servidor y, mientras, la máquina hace lo suyo
export async function tirar(cuantas = 1) {
  const info = est.info, u = info?.usuario;
  if (ocupada || dialogo.open || !u || !info.activo || !info.sobresListos) return;
  const n = cuantas === 'todos' ? Math.min(u.sobres, info.maximoTiradas || 50) : Number(cuantas);
  if (!(n >= 1) || u.sobres < n) return;
  const lento = !reducido();
  ocupada = true;
  gastando = 0;
  pintarMaquina();
  delete raiz.dataset.premio;
  delete raiz.dataset.casi;
  raiz.querySelector('.bandeja-cartas').innerHTML = '';
  // Si la máquina no se ve (se tira otra vez desde la apertura con la página bajada), se sube a verla
  const caja = raiz.getBoundingClientRect();
  if (caja.top < 0 || caja.bottom > innerHeight) raiz.scrollIntoView({ block: 'center', behavior: lento ? 'smooth' : 'auto' });
  const peticion = fetch('/api/gacha/tirar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cuantas }) })
    .then(x => x.json()).catch(() => ({ ok: false, error: 'No hay conexión con la web' }));
  estado(n === 1 ? 'Entra la moneda…' : `Entran ${plural(n, 'moneda', 'monedas')}…`);
  if (lento) {
    if (caja.top < 0 || caja.bottom > innerHeight) await espera(450);
    await meterMonedas(n, () => { gastando = n; pintarMaquina(); });
    await tirarPalanca();
    girarSinFin();
    estado('Giran los rodillos…');
  } else { gastando = n; pintarMaquina(); }
  const [r] = await Promise.all([peticion, lento ? espera(500) : null]);
  if (!r.ok) {
    await pararRodillos(cintaAlAzar(3), lento);
    ocupada = false;
    gastando = 0;
    pintarMaquina();
    estado(r.error || 'No se ha podido tirar');
    ganchos.avisar(r.error || 'No se ha podido tirar');
    return;
  }
  est.info.usuario = r.usuario;
  gastando = 0;
  pintarMaquina();
  const fin = finales(r.tiradas);
  const parada = await pararRodillos(fin.simbolos, lento);
  if (parada.premio && fin.premio) raiz.dataset.premio = fin.premio;
  if (parada.casi) raiz.dataset.casi = '';
  raiz.querySelector('.rodillos').setAttribute('aria-label', `Los rodillos: ${fin.simbolos.map(describir).join(', ')}`);
  estado(aviso(fin, r.tiradas));
  if (lento) {
    await espera(parada.premio ? 900 : 350);
    sacarPorBandeja(r.tiradas.reduce((s, t) => s + t.cartas.length, 0));
    await espera(900);
  }
  ocupada = false;
  mostrarApertura(r.tiradas, cuantas);
}

botones.forEach(b => b.addEventListener('click', () => tirar(b.dataset.cuantas === 'todos' ? 'todos' : Number(b.dataset.cuantas))));
palanca.addEventListener('click', () => tirar(1));

// ---------- la apertura ----------
// Todas las cartas salen boca abajo con el mismo reverso: no se sabe si es Jugador o BOOST hasta darle la vuelta (la
// pista de su color sí deja intuir la tier). Sin el reverso dibujado, el sol partido sobre la noche
const dorso = () => (est.info.reverso
  ? `<div class="cara dorso con-reverso"><img src="${escapar(est.info.reverso)}" alt=""></div>`
  : '<div class="cara dorso"><img src="/marca/sol-partido-sin-fondo.png" alt=""></div>');

// El sello de cada carta al girarla: NUEVA, o Repetida ×N con las copias que tienes; y Segura si la trajo la garantía
const selloHTML = (c, copias = c.copias) => (c.nueva ? '<span class="sello nueva">Nueva</span>' : `<span class="sello repetida">Repetida ×${copias}</span>`)
  + (c.garantia ? '<span class="segura" title="La trajo la garantía de rareza">Segura</span>' : '');
const textoSello = c => (c.nueva ? 'nueva' : `repetida, tienes ${c.copias}`) + (c.garantia ? ', segura por la garantía' : '');
const avisoFamilia = p => `Familia completa (${nombreClan(p.clan)}): +${plural(p.sobres || 1, 'tirada', 'tiradas')} y su jefe`;

// Una carta boca abajo. item: { c: carta, aviso: 'Carta extra' | 'Premio de familia' | '', premio }
const volteableHTML = (item, i, n, giro = 7) => `<div class="volteable${item.aviso ? ' extra' : ''}" style="--giro: ${((i - (n - 1) / 2) * giro).toFixed(1)}deg" data-tier="${claveTier(item.c.tier)}" data-i="${i}"
    tabindex="0" role="button" aria-label="${item.aviso ? `${item.aviso}, boca abajo` : `Carta ${i + 1} de ${n}, boca abajo`}: dale la vuelta">
    ${item.aviso ? `<span class="aviso-extra${item.premio ? ' familia' : ''}">${item.aviso}</span>` : ''}<span class="pista" aria-hidden="true"></span>
    <div class="giro">${dorso()}<div class="cara frente">${cartaHTML(item.c)}</div></div>${selloHTML(item.c)}</div>`;

// Las cartas grandes se celebran al descubrirlas: chispas alrededor de la carta y un fogonazo de su color en la
// escena, con centro en la carta. Cuántas chispas, según la tier; las demás cartas se descubren sin más
const CHISPAS = { SP: 24, LEGACY: 24, JEFE: 24, TEMPORADA: 24, S: 12 };
function celebrar(v) {
  const n = CHISPAS[v.dataset.tier];
  if (!n) return;
  const caja = document.createElement('span');
  caja.className = 'chispas';
  caja.setAttribute('aria-hidden', 'true');
  caja.innerHTML = Array.from({ length: n }, (_, i) =>
    `<i style="--a:${Math.round(360 / n * i + Math.random() * 14)}deg; --d:${Math.round(70 + Math.random() * 130)}px; --t:${Math.round(Math.random() * 180)}ms"></i>`).join('');
  v.appendChild(caja);
  setTimeout(() => caja.remove(), 2400);
  const r = v.getBoundingClientRect(), e = escena.getBoundingClientRect();
  escena.style.setProperty('--fx', `${((r.left + r.width / 2 - e.left) / e.width * 100).toFixed(1)}%`);
  escena.style.setProperty('--fy', `${((r.top + r.height / 2 - e.top + escena.scrollTop) / escena.scrollHeight * 100).toFixed(1)}%`);
  escena.dataset.fogonazo = v.dataset.tier === 'TEMPORADA' ? 'LEGACY' : v.dataset.tier;
  escena.classList.remove('fogonazo');
  void escena.offsetWidth;   // para que el fogonazo vuelva a empezar si ya había uno
  escena.classList.add('fogonazo');
}

// Antes de girar, el dorso se carga del color de su tier: un momento en las bajas, más en las grandes
const CARGA = { D: 200, C: 220, B: 280, A: 480, S: 760, SP: 1000, LEGACY: 1000, JEFE: 1000, TEMPORADA: 1000 };

// Engancha unas cartas boca abajo: se giran tocándolas (o con Intro o espacio). Devuelve girar(v, rapido)
function enganchar(volteables, items, alGirar) {
  const girar = async (v, rapido = false) => {
    if (v.classList.contains('girada') || v.classList.contains('cargando')) return;
    if (!reducido()) {
      v.classList.add('cargando');
      await espera(rapido ? 120 : CARGA[v.dataset.tier] || 200);
      v.classList.remove('cargando');
    }
    const item = items[volteables.indexOf(v)], teniaFoco = document.activeElement === v;
    v.classList.add('girada');
    v.removeAttribute('tabindex');
    v.removeAttribute('role');
    // Con el teclado, el foco pasa a la siguiente boca abajo (cuando no queda ninguna, a «Guardar en la colección»)
    if (teniaFoco) volteables.find(x => !x.classList.contains('girada'))?.focus();
    v.setAttribute('aria-label', `${item.c.nombre}, ${item.c.tipo === 'jefe' ? 'jefe de la familia' : item.c.tipo === 'legacy' ? 'LEGACY' : `tier ${item.c.tier}`}, ${textoSello(item.c)}`);
    if (!reducido()) celebrar(v);
    alGirar(item);
  };
  volteables.forEach(v => {
    v.onclick = () => girar(v);
    v.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); girar(v); } };
  });
  return girar;
}

// Gira las que quedan, de peor a mejor (las cartas ya van en ese orden), una detrás de otra. Con prisa, todas deprisa
// menos las dos últimas, que son las mejores y se hacen esperar
let descubriendo = 0;
async function descubrirEnOrden(volteables, girar, { rapido = false, prisa = false } = {}) {
  const vuelta = ++descubriendo;
  for (const [i, v] of volteables.entries()) {
    if (vuelta !== descubriendo || !dialogo.open) return;
    if (v.classList.contains('girada')) continue;
    const deprisa = rapido || (prisa && i < volteables.length - 2);
    await girar(v, deprisa);
    await espera(reducido() ? 0 : deprisa ? 140 : 320);
  }
}

// Al terminar: guardar o tirar otra vez (lo mismo si se puede; si no, una)
function pintarAcciones(cuantas) {
  const u = est.info.usuario, n = u?.sobres || 0, lista = est.info.sobresListos;
  const otro = $('.otro');
  let siguiente = null;
  if (lista && n > 0) {
    if (cuantas === 'todos') siguiente = 'todos';
    else if (cuantas === 5 && n >= 5) siguiente = 5;
    else siguiente = 1;
  }
  otro.hidden = !siguiente;
  otro.textContent = siguiente === 'todos' ? (n === 1 ? 'Tirar la que queda' : `Tirar las ${Math.min(n, est.info.maximoTiradas || 50)} que quedan`)
    : siguiente === 5 ? 'Otras 5 tiradas' : 'Otra tirada';
  otro.onclick = () => { dialogo.close(); tirar(siguiente); };
  $('.descubrir').hidden = true;
  $('.cerrar-apertura').hidden = false;
  $('.cerrar-apertura').focus();
}

function mostrarApertura(tiradas, cuantas) {
  const varias = tiradas.length > 1, lento = !reducido();
  descubriendo++;
  dialogo.classList.remove('repartida', 'con-resumen');
  escena.classList.remove('fogonazo');
  escena.scrollTop = 0;
  $('.aviso-premio').textContent = '';
  $('.descubrir').hidden = false;
  $('.descubrir').textContent = 'Descubrir todas';
  $('.otro').hidden = true;
  $('.cerrar-apertura').hidden = true;
  $('.reparto').innerHTML = '';
  $('.resumen-tiradas').innerHTML = '';
  $('.resumen-tiradas').hidden = !varias;
  $('.titulo-apertura').textContent = varias ? `Tus ${tiradas.length} tiradas` : 'Tu tirada';
  if (varias) pintarResumen(tiradas, cuantas, lento);
  else pintarUna(tiradas[0], cuantas, lento);
  dialogo.showModal();
  // Al abrirse, el diálogo enfoca la primera carta, que aún está abajo, en la bandeja, y la escena se desplazaría a buscarla
  $('.descubrir').focus({ preventScroll: true });
  escena.scrollTop = 0;
}

// ---------- una tirada: carta a carta ----------
function pintarUna(tirada, cuantas, lento) {
  const premios = tirada.premios || [];
  // De peor a mejor; la LEGACY de regalo y el jefe de una familia completa, al final
  const items = [...tirada.cartas].sort(dePeorAMejor).map(c => ({ c, aviso: c.extra ? 'Carta extra' : '' }))
    .concat(premios.filter(p => p.carta).map(p => ({ c: p.carta, aviso: 'Premio de familia', premio: p })));
  $('.reparto').innerHTML = items.map((x, i) => volteableHTML(x, i, items.length)).join('');
  const volteables = [...$('.reparto').querySelectorAll('.volteable')];
  const avisos = [];
  const girar = enganchar(volteables, items, item => {
    if (item.premio) avisos.push(avisoFamilia(item.premio));
    if (!volteables.every(v => v.classList.contains('girada'))) return;
    // Los premios sin carta (por si acaso) se avisan al final igual
    premios.filter(p => !p.carta).forEach(p => avisos.push(avisoFamilia(p)));
    $('.aviso-premio').textContent = avisos.join(' · ');
    pintarAcciones(cuantas);
  });
  $('.descubrir').onclick = () => descubrirEnOrden(volteables, girar);
  // Suben de la bandeja una detrás de otra
  if (!lento) { volteables.forEach(v => v.classList.add('fuera')); dialogo.classList.add('repartida'); return; }
  volteables.forEach((v, i) => setTimeout(() => v.classList.add('fuera'), 120 + i * 160));
  setTimeout(() => dialogo.classList.add('repartida'), 120 + items.length * 160 + 800);
}

// ---------- varias tiradas: el resumen ----------
function pintarResumen(tiradas, cuantas, lento) {
  const caja = $('.resumen-tiradas');
  dialogo.classList.add('con-resumen');
  const premios = tiradas.flatMap(t => t.premios || []);
  const salidas = tiradas.flatMap(t => t.cartas);
  const todas = [...salidas, ...premios.map(p => p.carta).filter(Boolean)];
  const nuevas = todas.filter(c => c.nueva).length;
  // La rejilla: cada carta una vez (aunque haya salido varias), con su sello, de mejor a peor
  const grupos = new Map();
  for (const c of todas) {
    const g = grupos.get(c.id) || { c: { ...c, nueva: false, garantia: null }, veces: 0 };
    g.veces++;
    g.c.nueva ||= Boolean(c.nueva);
    g.c.garantia ||= c.garantia || null;
    g.c.copias = Math.max(g.c.copias || 0, c.copias || 0);
    grupos.set(c.id, g);
  }
  const rejilla = [...grupos.values()].sort((a, b) => rango(a.c) - rango(b.c) || b.c.nueva - a.c.nueva || String(a.c.nombre).localeCompare(b.c.nombre));
  // Lo mejor: las 3 mejores (5 con más de 5 tiradas), sin los jefes, que van en su sitio. Se descubren de peor a mejor
  const destacadas = rejilla.filter(g => g.c.tipo !== 'jefe').slice(0, tiradas.length > 5 ? 5 : 3).reverse()
    .map(g => ({ c: g.c, aviso: g.c.extra ? 'Carta extra' : '' }));
  const jefes = premios.filter(p => p.carta).map(p => ({ c: p.carta, aviso: 'Premio de familia', premio: p }));
  const items = [...destacadas, ...jefes];

  caja.classList.remove('descubierto');
  caja.innerHTML = `<dl class="cifras-resumen">
      <div><dt>Tiradas</dt><dd>${tiradas.length}</dd></div>
      <div><dt>Cartas</dt><dd>${todas.length}</dd></div>
      <div class="nuevas"><dt>${nuevas === 1 ? 'Nueva' : 'Nuevas'}</dt><dd data-cifra="${nuevas}">${nuevas}</dd></div>
    </dl>
    <section aria-labelledby="titulo-destacadas"><h3 id="titulo-destacadas">Lo mejor</h3>
      <div class="destacadas">${destacadas.map((x, i) => volteableHTML(x, i, destacadas.length, 4)).join('')}</div></section>
    ${premios.length ? `<section class="premios-resumen" aria-labelledby="titulo-premios"><h3 id="titulo-premios">${premios.length === 1 ? 'Premio de familia' : 'Premios de familia'}</h3>
      ${jefes.length ? `<div class="cartas-premio">${jefes.map((x, i) => volteableHTML(x, destacadas.length + i, jefes.length, 0)).join('')}</div>` : ''}
      ${premios.map(p => `<p>${escapar(avisoFamilia(p))}</p>`).join('')}</section>` : ''}
    <section class="rejilla-bloque" aria-labelledby="titulo-rejilla"><h3 id="titulo-rejilla">Todas las cartas</h3>
      <ul class="rejilla-resumen">${rejilla.map((g, i) => `<li style="--i: ${i}">${cartaHTML(g.c)}${g.veces > 1 ? `<span class="veces" title="Ha salido ${g.veces} veces en estas tiradas">×${g.veces}</span>` : ''}${selloHTML(g.c)}</li>`).join('')}</ul></section>`;

  const volteables = [...caja.querySelectorAll('.volteable')];
  const terminar = () => {
    if (caja.classList.contains('descubierto')) return;
    caja.classList.add('descubierto');
    contar(caja.querySelector('.nuevas dd'), nuevas, lento);
    pintarAcciones(cuantas);
  };
  const girar = enganchar(volteables, items, () => { if (volteables.every(v => v.classList.contains('girada'))) terminar(); });
  if (!volteables.length) terminar();
  // «Descubrir todas» lo hace deprisa
  $('.descubrir').onclick = () => descubrirEnOrden(volteables, girar, { rapido: true });
  if (!lento) { volteables.forEach(v => v.classList.add('fuera')); return; }
  volteables.forEach((v, i) => setTimeout(() => v.classList.add('fuera'), 120 + i * 140));
  // Y lo mejor se descubre solo, de peor a mejor, cuando ya ha subido
  setTimeout(() => descubrirEnOrden(volteables, girar, { prisa: true }), 120 + volteables.length * 140 + 700);
}

// La cifra de nuevas sube de cero a la que es
function contar(dd, hasta, lento) {
  if (!lento || hasta < 2) { dd.textContent = hasta; return; }
  const inicio = performance.now(), dura = Math.min(1200, 300 + hasta * 40);
  const paso = t => {
    const p = Math.min(1, (t - inicio) / dura);
    dd.textContent = Math.round(hasta * (1 - (1 - p) ** 3));
    if (p < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

$('.cerrar-apertura').onclick = () => dialogo.close();
dialogo.addEventListener('close', () => {
  descubriendo++;
  delete raiz.dataset.premio;
  delete raiz.dataset.casi;
  raiz.querySelector('.bandeja-cartas').innerHTML = '';
  ganchos.pintar();
});
