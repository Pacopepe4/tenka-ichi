// El sorteo del calendario, en directo (zona de la liga de la portada).
// Recibe de la web (canal «sorteo») lo que ya ha salido, nunca lo que falta. Cada bola nueva sale de la garapon
// (garapon.js): el bombo gira, se para con la boca abajo y la bola cae a la bandeja; de ahí sube a la diana, donde se
// descubre el clan con un trazo de tinta, y vuela a su hueco del tablero. Quien entra con el sorteo a medias ve lo que
// ya ha salido colocado de golpe y solo anima las bolas que llegan después. Si se acumulan bolas (el panel saca
// deprisa), se anima más rápido y, si se queda muy atrás, se coloca sin animar hasta ponerse al día.
import { escapar } from '/carta.js';
import { fechaCorta } from '/comun.js';
import { montarGarapon, sonidoGarapon, bolaHTML } from '/garapon.js';

const esperar = ms => new Promise(r => setTimeout(r, ms));
// En una pestaña oculta el navegador frena las animaciones: ahí (y con «reducir movimiento») se coloca todo de golpe
const sinMovimiento = () => document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches;
// Una animación que, pase lo que pase, nunca deja la cola esperando
function correr(el, fotogramas, opciones) {
  const a = el.animate(fotogramas, { fill: 'forwards', ...opciones });
  return Promise.race([a.finished.catch(() => {}), esperar(opciones.duration + (opciones.delay || 0) + 300)]);
}
// Una trayectoria en arco (curva de Bézier) que, por el camino, cambia de tamaño y gira
function arco(el, de, a, { duracion, alto, escala: [e0, e1], giro: [g0, g1], apagar = false }) {
  const c = { x: (de.x + a.x) / 2, y: Math.min(de.y, a.y) - alto };
  const fotos = Array.from({ length: 13 }, (_, i) => {
    const s = i / 12, u = 1 - s;
    const x = u * u * de.x + 2 * u * s * c.x + s * s * a.x, y = u * u * de.y + 2 * u * s * c.y + s * s * a.y;
    return { transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(e0 + (e1 - e0) * s).toFixed(3)})`,
      '--giro': `${(g0 + (g1 - g0) * s).toFixed(1)}deg`, opacity: apagar && s > .85 ? (1 - s) / .15 : 1 };
  });
  return correr(el, fotos, { duration: duracion, easing: 'cubic-bezier(.45, 0, .2, 1)' });
}

const GRANDE = 124;      // lado de la bola que se planta en la diana, en px
const ATRASO_MAX = 3;    // con más bolas esperando, se colocan sin animar hasta ponerse al día
const ENSO = `
  <svg class="foco-enso" viewBox="0 0 100 100">
    <defs><filter id="sorteo-pincel" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="2.6"/>
    </filter></defs>
    <circle class="enso-trazo" cx="50" cy="50" r="46" pathLength="100"/>
    <circle class="enso-trazo enso-fino" cx="50" cy="50" r="42.5" pathLength="100" transform="rotate(50 50 50)"/>
  </svg>`;
const ALTAVOZ = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 7.5h3l4-3.5v12l-4-3.5H3z" fill="currentColor"/><path class="ondas" d="M13 7.2a4 4 0 0 1 0 5.6M15.3 5a7 7 0 0 1 0 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

export function montarSorteo(caja, { clan, logo, formato, hayCalendario, alTerminar }) {
  const porJornada = formato.clanes.length, nCruces = porJornada / 2;
  const nombre = id => clan(id).nombre;

  caja.innerHTML = `
    <div class="sorteo-cabecera">
      <span class="sorteo-vivo" hidden><i class="punto-vivo" aria-hidden="true"></i>En directo</span>
      <h3>Sorteo del calendario</h3>
      <span class="sorteo-ensayo" hidden>Ensayo</span>
      <div class="sorteo-mandos">
        <span class="sorteo-cuenta" hidden></span>
        <button type="button" class="sorteo-sonido" aria-pressed="false" title="El sonido del bombo y la campanilla">${ALTAVOZ}Sonido</button>
      </div>
    </div>
    <p class="sorteo-estado" role="status" aria-live="polite"></p>
    <div class="sorteo-escena">
      <div class="garapon" aria-hidden="true"></div>
      <div class="sorteo-foco" aria-hidden="true">
        <div class="foco-diana">${ENSO}</div>
        <div class="foco-nombre"></div>
        <div class="foco-lado"></div>
      </div>
    </div>
    <div class="sorteo-tablero">${formato.liguilla.map((j, i) => `
      <section class="tab-jornada" data-j="${i + 1}">
        <h4>Jornada ${i + 1}<small> · ${fechaCorta(j.fecha)}</small></h4>
        <ul>${Array.from({ length: nCruces }, (_, k) => `
          <li data-cruce="J${i + 1}-${k + 1}"><span class="hueco" data-lado="azul"></span><span class="vs">vs</span><span class="hueco" data-lado="rojo"></span></li>`).join('')}
        </ul>
      </section>`).join('')}
    </div>
    <p class="sorteo-pie"></p>`;

  const q = s => caja.querySelector(s);
  const [escena, foco, diana, nombreFoco, ladoFoco, tablero, estadoEl, pie, vivo, ensayoEl, cuenta, botonSonido] =
    ['.sorteo-escena', '.sorteo-foco', '.foco-diana', '.foco-nombre', '.foco-lado', '.sorteo-tablero', '.sorteo-estado', '.sorteo-pie',
      '.sorteo-vivo', '.sorteo-ensayo', '.sorteo-cuenta', '.sorteo-sonido'].map(q);
  const trazos = caja.querySelectorAll('.enso-trazo'), enso = q('.foco-enso');
  // Los huecos van en el orden en que salen las bolas: jornada, cruce, y en cada cruce el azul y luego el rojo
  const huecos = [...tablero.querySelectorAll('.hueco')];

  const sonido = sonidoGarapon();
  const garapon = montarGarapon(q('.garapon'), { color: id => clan(id).color, logo, alGolpe: sonido.golpe });
  botonSonido.addEventListener('click', () => {
    sonido.activar(!sonido.activo);
    botonSonido.setAttribute('aria-pressed', String(sonido.activo));
  });

  // Mientras el sorteo va y el bombo no se ve (quien mira está arriba en la portada), un aviso lleva hasta él
  const aviso = document.createElement('button');
  aviso.type = 'button';
  aviso.className = 'sorteo-aviso';
  aviso.hidden = true;
  aviso.innerHTML = '<i class="punto-vivo" aria-hidden="true"></i>Sorteo en directo: ver el bombo';
  aviso.addEventListener('click', () => caja.scrollIntoView({ behavior: sinMovimiento() ? 'auto' : 'smooth', block: 'start' }));
  document.body.append(aviso);
  let enPantalla = false;
  const pintarAviso = () => { aviso.hidden = enPantalla || caja.hidden || ultima?.estado !== 'en curso'; };
  new IntersectionObserver(([e]) => { enPantalla = e.isIntersecting; pintarAviso(); }, { threshold: .2 }).observe(caja);

  const decir = t => { estadoEl.textContent = t; };
  const hueco = (cruce, l) => tablero.querySelector(`[data-cruce="${cruce}"] .hueco[data-lado="${l}"]`);
  function llenarHueco(h, id, pulso = false) {
    h.style.setProperty('--color', clan(id).color);
    h.classList.remove('siguiente');
    h.classList.add('lleno');
    h.innerHTML = `<img src="${logo(id)}" alt=""><b>${escapar(nombre(id))}</b>`;
    if (pulso) { h.classList.remove('nuevo'); void h.offsetWidth; h.classList.add('nuevo'); }
  }
  // El hueco de la bola n queda señalado mientras se espera o gira el bombo
  function senalar(n) {
    huecos.forEach((h, i) => h.classList.toggle('siguiente', i === n - 1 && !h.classList.contains('lleno')));
  }
  const marcarJornada = n => tablero.querySelectorAll('.tab-jornada').forEach(s => s.classList.toggle('actual', Number(s.dataset.j) === n));
  const centro = (el, base) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2 - base.left, y: r.top + r.height / 2 - base.top, w: r.width, h: r.height }; };
  function contar() {
    if (!ultima) return;
    cuenta.hidden = false;
    cuenta.innerHTML = `<b>${sacadasPintadas}</b> de ${ultima.total} bolas`;
  }

  // Los clanes que siguen en el bombo en esa jornada
  const quedan = jornada => formato.clanes.filter(id => !sacadas.some(b => b.jornada === jornada && b.clan === id));

  // ---------- estado de este sorteo ----------
  let idSorteo = null, vistas = 0, sacadas = [], sacadasPintadas = 0, ultima = null;
  let animando = false, primeraVista = true, terminadoAvisado = false, animado = false;
  let epoca = 0;   // cambia al empezar o cancelar un sorteo: lo que se estaba animando del anterior se abandona
  const cola = [];

  function apagarFoco() { foco.classList.remove('lleno'); }
  function reiniciar() {
    epoca++;
    idSorteo = null; vistas = 0; sacadas = []; sacadasPintadas = 0; ultima = null; cola.length = 0;
    terminadoAvisado = false; animado = false;
    huecos.forEach(h => { h.className = 'hueco'; h.innerHTML = ''; h.style.removeProperty('--color'); });
    marcarJornada(0);
    tablero.classList.remove('sellado');
    escena.querySelectorAll('.bola-grande').forEach(el => el.remove());
    garapon.poner(formato.clanes);   // el bombo se ve lleno desde el primer momento
    apagarFoco();
    pie.textContent = '';
    cuenta.hidden = true;
  }

  // Sin animación: la bola ya está en su hueco y fuera del bombo
  function colocar(b) {
    llenarHueco(hueco(b.cruce, b.lado), b.clan);
    marcarJornada(b.jornada);
    sacadasPintadas = b.n;
    garapon.poner(quedan(b.jornada));
  }

  // El clan se descubre en la diana: un trazo de tinta de su color alrededor de la bola, su nombre y su lado
  function revelar(b) {
    foco.style.setProperty('--color', clan(b.clan).color);
    enso.style.rotate = `${Math.round(Math.random() * 360)}deg`;
    nombreFoco.textContent = nombre(b.clan);
    ladoFoco.textContent = b.lado === 'azul' ? 'Lado azul' : 'Lado rojo';
    ladoFoco.className = `foco-lado ${b.lado}`;
    foco.classList.add('lleno');
    const tinta = 'cubic-bezier(.7, 0, .2, 1)';
    trazos.forEach((t, i) => correr(t, [{ strokeDashoffset: 100 }, { strokeDashoffset: i ? 30 : 9 }], { duration: 560 + i * 140, easing: tinta, fill: 'backwards' }));
    correr(nombreFoco, [{ opacity: 0, letterSpacing: '.3em', filter: 'blur(6px)' }, { opacity: 1, letterSpacing: '.02em', filter: 'blur(0)' }],
      { duration: 480, delay: 120, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'backwards' });
    correr(ladoFoco, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 360, delay: 300, easing: 'ease-out', fill: 'backwards' });
    sonido.campana();
  }

  async function sacar(b, prisa) {
    const mia = epoca, t = prisa ? .55 : 1;
    sacadas.push(b);
    marcarJornada(b.jornada);
    if (sinMovimiento()) return colocar(b);
    // Cada jornada es un bombo nuevo con los seis clanes, que caen dentro uno a uno
    if (b.jornada > 1 && (b.n - 1) % porJornada === 0) {
      decir(`Jornada ${b.jornada}: el bombo se llena otra vez.`);
      await garapon.llenar(formato.clanes);
      await esperar(550 * t);
      if (mia !== epoca) return;
    }
    senalar(b.n);
    decir(`Jornada ${b.jornada}: gira el bombo…`);
    const sale = await garapon.extraer(b.clan, { agitar: .7 * t });
    if (mia !== epoca) return;
    if (!sale) return colocar(b);   // la bola no estaba en el bombo (no debería pasar): se coloca sin más
    animado = true;

    // La bola deja la bandeja y sube a la diana, enderezándose por el camino
    const base = escena.getBoundingClientRect();
    const grande = document.createElement('span');
    grande.className = 'bola bola-grande';
    grande.style.setProperty('--color', clan(b.clan).color);
    grande.innerHTML = bolaHTML(logo(b.clan));
    escena.append(grande);
    garapon.quitar(b.clan);
    const desde = { x: sale.x - base.left, y: sale.y - base.top }, punto = centro(diana, base);
    const g0 = ((sale.giro * 180 / Math.PI) % 360 + 360) % 360;
    await arco(grande, desde, punto, { duracion: 760 * t, alto: 80, escala: [sale.tam / GRANDE, 1], giro: [g0, g0 > 180 ? 720 : 360] });
    if (mia !== epoca) return grande.remove();
    revelar(b);
    decir(b.lado === 'azul' ? `Jornada ${b.jornada}: ${nombre(b.clan)}, en el lado azul.` : `Jornada ${b.jornada}: ${nombre(sacadas.at(-2).clan)} contra ${nombre(b.clan)}.`);
    await esperar(1150 * t);
    if (mia !== epoca) return grande.remove();

    // Y vuela a su hueco del tablero
    const h = hueco(b.cruce, b.lado), icono = centro(h, base);
    const destino = { x: icono.x + (b.lado === 'azul' ? -icono.w / 2 + 18 : icono.w / 2 - 18), y: icono.y };
    apagarFoco();
    await arco(grande, punto, destino, { duracion: 760 * t, alto: 40, escala: [1, 26 / GRANDE], giro: [0, b.lado === 'azul' ? -360 : 360], apagar: true });
    grande.remove();
    if (mia !== epoca) return;
    llenarHueco(h, b.clan, true);
    sacadasPintadas = b.n;
    contar();
    if (b.n % porJornada === 0) decir(`Jornada ${b.jornada} completa.`);
    if (ultima?.estado === 'en curso') senalar(b.n + 1);
    await esperar(200 * t);
  }

  async function vaciarCola() {
    if (animando) return;
    animando = true;
    while (cola.length) {
      const b = cola.shift();
      if (cola.length >= ATRASO_MAX) { sacadas.push(b); colocar(b); contar(); continue; }
      await sacar(b, cola.length > 0).catch(() => {});
    }
    animando = false;
    final();
  }

  // Cuando ha salido la última bola y se ha terminado de enseñar
  function final() {
    if (animando || cola.length || !ultima || ultima.estado !== 'terminado') return;
    vivo.hidden = true;
    senalar(0);
    marcarJornada(0);
    contar();
    pintarAviso();
    if (animado) tablero.classList.add('sellado');
    pie.textContent = ultima.ensayo ? 'Esto ha sido un ensayo: no se ha guardado ningún calendario.'
      : `Semilla ${ultima.semilla}. Con la misma semilla el sorteo sale igual, así que cualquiera puede comprobarlo.`;
    decir(ultima.ensayo ? 'Ensayo terminado.' : ultima.guardado === false ? 'Sorteo terminado, pero el calendario no se ha podido guardar: el staff lo está revisando.' : 'Sorteo terminado: el calendario ya está fijado.');
    // Se avisa cuando el servidor ya ha guardado el calendario (si no, la web aún no lo enseñaría)
    if (!terminadoAvisado && (ultima.ensayo || ultima.guardado !== null)) { terminadoAvisado = true; alTerminar?.(ultima); }
  }

  function visibilidad(v) {
    if (v.estado === 'ninguno') return !hayCalendario();
    if (v.estado === 'terminado' && primeraVista && !v.ensayo) return !hayCalendario();
    return true;
  }

  reiniciar();

  return {
    recibir(v) {
      if (v.estado === 'ninguno') {
        reiniciar();
        vivo.hidden = true; ensayoEl.hidden = true;
        decir('El sorteo del calendario se hace en directo, bola a bola. Cuando empiece, las bolas saldrán de este bombo.');
        caja.hidden = !visibilidad(v);
        primeraVista = false;
        pintarAviso();
        return;
      }
      if (v.id !== idSorteo) {
        reiniciar();
        idSorteo = v.id;
      }
      ensayoEl.hidden = !v.ensayo;
      ultima = v;
      if (primeraVista) {
        // Entra con el sorteo empezado: lo que ya salió se coloca de golpe
        v.sacadas.forEach(b => { sacadas.push(b); colocar(b); });
        vistas = v.sacadas.length;
        if (v.estado === 'en curso') {
          senalar(vistas + 1);
          decir(sacadas.length ? `Jornada ${sacadas.at(-1).jornada}: el sorteo sigue.` : 'Todo listo: el bombo va a empezar.');
        } else decir('Sorteo terminado.');
      } else {
        for (const b of v.sacadas.slice(vistas)) cola.push(b);
        vistas = v.sacadas.length;
        if (!sacadas.length && !cola.length) { senalar(1); decir('Todo listo: el bombo va a empezar.'); }
      }
      contar();
      vivo.hidden = v.estado === 'terminado' && !animando && !cola.length;
      caja.hidden = !visibilidad(v);
      primeraVista = false;
      pintarAviso();
      if (v.estado === 'terminado' && !cola.length && !animando) final();
      vaciarCola();
    },
  };
}
