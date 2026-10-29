// La garapon del sorteo: el bombo octogonal de manivela de los sorteos japoneses (福引), con una bola por clan.
// Gira, se para con la boca abajo y deja caer la bola que toca en la bandeja. La física va aparte del dibujo
// (fisicaGarapon) para poder probarla sin navegador. Las medidas van en «bombos» (1 es el ancho del bombo), con el
// origen en el eje y la y hacia abajo.

export const MEDIDA = { apotema: .40, radio: .085, eje: .055, suelo: .70, bandeja: .17 };
const GRAVEDAD = 7;
const REPOSO = .35, AGITADO = 10;   // lo que gira el bombo, en radianes por segundo
const VUELTA = 2 * Math.PI;
const PAREDES = Array.from({ length: 8 }, (_, k) => k * Math.PI / 4);   // las normales de las ocho paredes; la de π/2 es la boca
const PASO = 1 / 240;
const resto = (a, m) => ((a % m) + m) % m;

export function fisicaGarapon({ alGolpe = () => {}, azar = Math.random } = {}) {
  const { apotema: A, radio: R, eje: E, suelo: S, bandeja: B } = MEDIDA;
  const bolas = [];
  const tambor = { th: 0, w: REPOSO, meta: REPOSO, frenada: null };
  let saca = null;   // la bola que está saliendo y en qué punto va

  // Donde espera la bola que va a salir: pegada a la boca, que gira con el bombo
  const boca = () => ({ x: -(A - R) * Math.sin(tambor.th), y: (A - R) * Math.cos(tambor.th) });

  function meter(id, x = (azar() - .5) * .36, y = -.22 + azar() * .1) {
    bolas.push({ id, x, y, vx: (azar() - .5) * .8, vy: 0, giro: azar() * VUELTA, w: 0, modo: 'dentro', masa: 1, quieta: 0 });
  }
  function quitar(id) {
    const i = bolas.findIndex(b => b.id === id);
    if (i >= 0) bolas.splice(i, 1);
  }

  // Rebote contra algo que gira con el bombo (las paredes y el eje): se rebota respecto a su superficie, que arrastra
  function rebote(b, nx, ny, e, roce) {
    const px = -tambor.w * b.y, py = tambor.w * b.x;
    let rx = b.vx - px, ry = b.vy - py;
    const vn = rx * nx + ry * ny;
    if (vn <= 0) return;
    rx -= (1 + e) * vn * nx; ry -= (1 + e) * vn * ny;
    const tx = -ny, ty = nx, vt = rx * tx + ry * ty;
    rx -= roce * vt * tx; ry -= roce * vt * ty;
    b.vx = rx + px; b.vy = ry + py;
    b.w = vt * (1 - roce) / R;
    if (vn > .6) alGolpe(vn, 'pared');
  }
  function paredes(b) {
    for (const f of PAREDES) {
      const nx = Math.cos(tambor.th + f), ny = Math.sin(tambor.th + f);
      const dentro = b.x * nx + b.y * ny - (A - R);
      if (dentro > 0) { b.x -= dentro * nx; b.y -= dentro * ny; rebote(b, nx, ny, .35, .12); }
    }
    const d = Math.hypot(b.x, b.y), min = E + R;
    if (d < min && d > 1e-6) {
      const nx = -b.x / d, ny = -b.y / d;
      b.x = -nx * min; b.y = -ny * min;
      rebote(b, nx, ny, .4, .1);
    }
  }
  function choques(lista) {
    for (let i = 0; i < lista.length; i++) for (let j = i + 1; j < lista.length; j++) {
      const a = lista[i], c = lista[j];
      const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
      if (d >= 2 * R || d < 1e-6) continue;
      const nx = dx / d, ny = dy / d, ia = 1 / a.masa, ic = 1 / c.masa, hundido = (2 * R - d) / (ia + ic);
      a.x -= nx * hundido * ia; a.y -= ny * hundido * ia; c.x += nx * hundido * ic; c.y += ny * hundido * ic;
      const vn = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
      if (vn >= 0) continue;
      const imp = -1.5 * vn / (ia + ic);
      a.vx -= imp * ia * nx; a.vy -= imp * ia * ny; c.vx += imp * ic * nx; c.vy += imp * ic * ny;
      if (-vn > .6) alGolpe(-vn, 'bola');
    }
  }
  // La bola que ha salido cae a la bandeja, bota y se queda quieta
  function bandeja(b, h) {
    const fondo = S - R;
    if (b.y > fondo) {
      b.y = fondo;
      if (b.vy > 0) {
        if (b.vy > .5) alGolpe(b.vy, 'bandeja');
        b.vy = b.vy > .35 ? -b.vy * .38 : 0;
      }
    }
    if (b.y > fondo - .1 && Math.abs(b.x) > B - R) { b.x = Math.sign(b.x) * (B - R); b.vx *= -.5; }
    const enElFondo = b.y >= fondo - 1e-3;
    if (enElFondo) { b.vx *= Math.exp(-7 * h); b.w = b.vx / R; }
    b.quieta = enElFondo && Math.abs(b.vx) < .06 && Math.abs(b.vy) < .05 ? b.quieta + h : 0;
    if (b.quieta > .08) Object.assign(b, { modo: 'quieta', vx: 0, vy: 0, w: 0 });
  }

  // La extracción, paso a paso: agita, espera a tener la boca a tiro, frena con ella abajo, suelta la bola y la
  // deja caer a la bandeja
  function avanzar(h) {
    const s = saca;
    if (!s) return;
    s.t += h;
    if (s.fase === 'agita' && s.t >= s.agitar) Object.assign(s, { fase: 'busca', t: 0, armada: false });
    if (s.fase === 'busca') {
      const falta = VUELTA - resto(tambor.th, VUELTA), frenando = tambor.w * .3;
      // Solo frena si ha visto la boca lejos: así nunca se para en seco
      if (falta > frenando) s.armada = true;
      const llega = s.armada && falta <= frenando;
      if (llega || s.t > 3) {
        const dif = llega ? falta : falta + VUELTA;
        tambor.frenada = { th0: tambor.th, w0: tambor.w, dif, T: llega ? Math.max(.2, 2 * dif / tambor.w) : 1.5, t: 0 };
        tambor.meta = 0;
        Object.assign(s.b, { modo: 'guiada', masa: 6 });
        Object.assign(s, { fase: 'frena', t: 0 });
      }
    }
    if (s.fase === 'frena' && !tambor.frenada) Object.assign(s, { fase: 'suelta', t: 0 });
    if (s.fase === 'suelta') {
      const p = boca();
      if (Math.hypot(s.b.x - p.x, s.b.y - p.y) < .05 || s.t > .3) {
        Object.assign(s.b, { modo: 'cae', masa: 1, vx: (azar() - .5) * .24, vy: Math.max(s.b.vy, .3) });
        Object.assign(s, { fase: 'cae', t: 0 });
      }
    }
    if (s.fase === 'cae' && s.b.modo === 'quieta') {
      saca = null;
      tambor.meta = REPOSO;
      s.resolver(s.b);
    }
  }

  function sub(h) {
    const f = tambor.frenada;
    if (f) {
      // Frenada con deceleración constante hasta dejar la boca abajo (curva de Hermite: sale a w0 y llega a 0)
      f.t = Math.min(f.T, f.t + h);
      const s = f.t / f.T;
      tambor.th = f.th0 + f.T * f.w0 * (s - 2 * s * s + s ** 3) + f.dif * (3 * s * s - 2 * s ** 3);
      tambor.w = f.w0 * (1 - 4 * s + 3 * s * s) + f.dif / f.T * (6 * s - 6 * s * s);
      if (s >= 1) { tambor.w = 0; tambor.frenada = null; }
    } else {
      tambor.w += (tambor.meta - tambor.w) * Math.min(1, h * 2.5);
      tambor.th += tambor.w * h;
    }
    const dentro = [];
    for (const b of bolas) {
      if (b.modo === 'quieta') continue;
      b.vy += GRAVEDAD * h;
      if (b.modo === 'guiada') {
        const p = boca();
        b.vx += (140 * (p.x - b.x) - 22 * b.vx) * h;
        b.vy += (140 * (p.y - b.y) - 22 * b.vy) * h;
      } else if (b.modo === 'dentro' && tambor.meta === AGITADO) {
        b.vx += (azar() - .5) * 6 * h; b.vy += (azar() - .5) * 6 * h;   // el aire del bombo agitado
      }
      b.x += b.vx * h; b.y += b.vy * h;
      b.giro += b.w * h;
      if (b.modo === 'cae') bandeja(b, h); else dentro.push(b);
    }
    choques(dentro);
    for (const b of dentro) paredes(b);
    avanzar(h);
  }

  function paso(dt) {
    dt = Math.min(dt, 1 / 20);   // un fotograma largo (la pestaña vuelve de segundo plano) no se recupera entero
    if (dt <= 0) return;
    const n = Math.ceil(dt / PASO);
    for (let i = 0; i < n; i++) sub(dt / n);
  }

  // Saca la bola id; se resuelve con ella en la bandeja (o null si no estaba o se canceló)
  function extraer(id, { agitar = .7 } = {}) {
    if (saca) acabarYa();
    const b = bolas.find(x => x.id === id && x.modo === 'dentro');
    if (!b) return Promise.resolve(null);
    return new Promise(resolver => {
      saca = { b, fase: 'agita', t: 0, agitar, resolver };
      tambor.meta = AGITADO;
    });
  }
  // Sin tiempo para animar (pestaña oculta): la bola aparece ya en la bandeja y el bombo, con la boca abajo
  function acabarYa() {
    const s = saca;
    if (!s) return;
    saca = null;
    Object.assign(tambor, { frenada: null, th: Math.ceil(tambor.th / VUELTA) * VUELTA, w: 0, meta: REPOSO });
    Object.assign(s.b, { modo: 'quieta', x: 0, y: S - R, vx: 0, vy: 0, w: 0, masa: 1 });
    s.resolver(s.b);
  }
  // Deja lo que estuviera saliendo y devuelve dentro las bolas que estaban fuera; dice cuántas ha devuelto
  function cancelar() {
    const s = saca;
    saca = null;
    Object.assign(tambor, { frenada: null, meta: REPOSO });
    s?.resolver(null);
    let devueltas = 0;
    for (const b of bolas) if (b.modo !== 'dentro') {
      Object.assign(b, { modo: 'dentro', masa: 1, x: (azar() - .5) * .3, y: -.2, vx: 0, vy: 0, quieta: 0 });
      devueltas++;
    }
    return devueltas;
  }
  function asentar(segundos) {
    for (let t = 0; t < segundos; t += 1 / 60) paso(1 / 60);
  }

  return { bolas, tambor, boca, meter, quitar, paso, extraer, acabarYa, cancelar, asentar, ocupada: () => Boolean(saca) };
}

// ---------- el dibujo ----------

// Vértices de un octógono con las normales de los lados en k·45°, como las paredes de la física
const octogono = (apotema, r = apotema / Math.cos(Math.PI / 8)) => Array.from({ length: 8 }, (_, k) => {
  const a = (k * 45 + 22.5) * Math.PI / 180;
  return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
});
const AP = MEDIDA.apotema * 100;   // la pared por dentro, en las unidades del dibujo (100 = el ancho)

const TAMBOR = `
  <svg class="garapon-giro garapon-tambor" viewBox="-50 -50 100 100">
    <defs>
      <radialGradient id="garapon-cristal" cx="50%" cy="46%" r="58%"><stop offset="0" stop-color="#2b251f"/><stop offset="1" stop-color="#0b0a09"/></radialGradient>
      <radialGradient id="garapon-laca" r="50%"><stop offset=".8" stop-color="#a8262c"/><stop offset=".9" stop-color="#7d1a1f"/><stop offset="1" stop-color="#4f0f13"/></radialGradient>
    </defs>
    <polygon points="${octogono(AP).join(' ')}" fill="url(#garapon-cristal)"/>
    <g stroke="rgba(235,210,138,.12)" stroke-width=".6">${octogono(AP).map(p => `<line x1="0" y1="0" x2="${p.split(',')[0]}" y2="${p.split(',')[1]}"/>`).join('')}</g>
    <path fill="url(#garapon-laca)" fill-rule="evenodd" d="M${octogono(AP + 6).join(' L')} Z M${octogono(AP).join(' L')} Z"/>
    <polygon points="${octogono(AP + 6).join(' ')}" fill="none" stroke="#B39A5E" stroke-width="1.1"/>
    <polygon points="${octogono(AP).join(' ')}" fill="none" stroke="#EBD28A" stroke-opacity=".5" stroke-width=".6"/>
    <g fill="#EBD28A">${octogono(AP + 3).map(p => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r=".9"/>`).join('')}</g>
    <rect class="garapon-boca" x="-9.5" y="${AP - .6}" width="19" height="7.2" rx="1" fill="#0b0a09" stroke="#B39A5E" stroke-width=".6"/>
  </svg>`;

// Delante de las bolas: el eje y la manivela, que giran con el bombo
const MANIVELA = `
  <svg class="garapon-giro garapon-manivela" viewBox="-50 -50 100 100">
    <defs><radialGradient id="garapon-oro" cx="38%" cy="34%" r="70%"><stop offset="0" stop-color="#F3E2AE"/><stop offset=".6" stop-color="#C9AC66"/><stop offset="1" stop-color="#7A6535"/></radialGradient></defs>
    <g transform="rotate(-120)">
      <rect x="0" y="-1.7" width="56" height="3.4" rx="1.7" fill="#1d1916" stroke="#B39A5E" stroke-width=".6"/>
      <circle cx="56" cy="0" r="4.6" fill="#BE2A2F" stroke="#EBD28A" stroke-width=".7"/>
      <circle cx="54.6" cy="-1.4" r="1.3" fill="rgba(255,255,255,.35)"/>
    </g>
    <circle r="6" fill="url(#garapon-oro)" stroke="#6b5a33" stroke-width=".6"/>
    <circle r="2.3" fill="#2a2219"/>
  </svg>`;

// El mueble (detrás): las patas, la base y el hueco de la bandeja. 100 de ancho; el eje está en (50, 50)
const MUEBLE = `
  <svg class="garapon-mueble" viewBox="0 0 100 130">
    <g fill="#1d1916" stroke="#B39A5E" stroke-width=".6" stroke-linejoin="round">
      <polygon points="45,50 51,50 35,121 27,121"/>
      <polygon points="49,50 55,50 73,121 65,121"/>
    </g>
    <rect x="12" y="121" width="76" height="7" rx="1.2" fill="#221E1A" stroke="#B39A5E" stroke-width=".6"/>
    <rect x="12.6" y="121.6" width="74.8" height="1.4" fill="#BE2A2F" opacity=".8"/>
    <ellipse cx="50" cy="115" rx="18" ry="3.2" fill="#0b0908"/>
  </svg>`;

// El borde de la bandeja (delante de la bola que cae en ella)
const BANDEJA = `
  <svg class="garapon-bandeja" viewBox="0 0 100 130">
    <defs><linearGradient id="garapon-laca-bandeja" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b02a30"/><stop offset="1" stop-color="#5c1217"/></linearGradient></defs>
    <path d="M31,115 L69,115 L66,121 L34,121 Z" fill="url(#garapon-laca-bandeja)"/>
    <path d="M31,115 L69,115" stroke="#EBD28A" stroke-width=".7"/>
  </svg>`;

// Lo de dentro de una bola: el cuerpo de color (gira) con el sello de papel y el logo
export const bolaHTML = logo => `<span class="bola-cuerpo"><i class="bola-sello"><img src="${logo}" alt=""></i></span>`;

export function montarGarapon(caja, { color, logo, alGolpe }) {
  caja.innerHTML = `${MUEBLE}${TAMBOR}<div class="garapon-bolas"></div>${MANIVELA}<div class="garapon-brillo"></div>${BANDEJA}`;
  const capa = caja.querySelector('.garapon-bolas');
  const giran = caja.querySelectorAll('.garapon-giro');
  const fisica = fisicaGarapon({ alGolpe });
  const elementos = new Map();
  const reducido = matchMedia('(prefers-reduced-motion: reduce)');
  let lado = caja.clientWidth || 260, visible = false, raf = 0, antes = 0, turno = 0, ultimoFotograma = 0;

  function pintar() {
    giran.forEach(el => { el.style.transform = `rotate(${fisica.tambor.th}rad)`; });
    const r = MEDIDA.radio * lado;
    for (const b of fisica.bolas) {
      const el = elementos.get(b.id);
      if (!el) continue;
      el.style.transform = `translate(${((b.x + .5) * lado - r).toFixed(1)}px, ${((b.y + .5) * lado - r).toFixed(1)}px)`;
      el.style.setProperty('--giro', `${b.giro.toFixed(3)}rad`);
    }
  }

  // La física solo corre si se ve (o si hay una bola saliendo, que el sorteo espera); oculta, se para
  const moviendo = () => !document.hidden && !reducido.matches;
  function decidir() {
    const debe = moviendo() && (visible || fisica.ocupada());
    if (debe && !raf) { antes = performance.now(); raf = requestAnimationFrame(fotograma); }
    if (!debe && raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  function fotograma(t) {
    fisica.paso((t - antes) / 1000);
    antes = t;
    ultimoFotograma = performance.now();
    pintar();
    raf = visible || fisica.ocupada() ? requestAnimationFrame(fotograma) : 0;
  }
  new ResizeObserver(() => { lado = caja.clientWidth || lado; pintar(); }).observe(caja);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; decidir(); }).observe(caja);
  document.addEventListener('visibilitychange', () => { if (document.hidden) fisica.acabarYa(); decidir(); });
  reducido.addEventListener?.('change', decidir);

  function meterBola(id, entra = false, x, y) {
    const el = document.createElement('span');
    el.className = `bola${entra ? ' entra' : ''}`;
    el.style.setProperty('--color', color(id));
    el.innerHTML = bolaHTML(logo(id));
    capa.append(el);
    elementos.set(id, el);
    fisica.meter(id, x, y);
  }
  function quitar(id) {
    fisica.quitar(id);
    elementos.get(id)?.remove();
    elementos.delete(id);
  }

  // Deja dentro justo estas bolas, ya asentadas en el fondo, sin animar
  function poner(ids) {
    turno++;
    let mover = fisica.cancelar();
    for (const id of [...elementos.keys()]) if (!ids.includes(id)) quitar(id);
    for (const id of ids) if (!elementos.has(id)) { meterBola(id); mover++; }
    if (mover) fisica.asentar(1.6);
    pintar();
  }
  // Llena el bombo dejando caer las bolas una a una
  function llenar(ids) {
    if (!moviendo()) return poner(ids), Promise.resolve();
    poner([]);
    const yo = turno;
    return new Promise(listo => ids.forEach((id, i) => setTimeout(() => {
      if (yo === turno) { meterBola(id, true, (Math.random() - .5) * .2, -.3); decidir(); }
      if (i === ids.length - 1) listo();
    }, i * 110)));
  }

  function posicion(id) {
    const el = elementos.get(id), b = fisica.bolas.find(x => x.id === id);
    if (!el || !b) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, tam: r.width, giro: b.giro };
  }
  // Saca la bola: gira, frena con la boca abajo y la deja en la bandeja. Devuelve dónde ha quedado (o null)
  async function extraer(id, { agitar } = {}) {
    const promesa = fisica.extraer(id, { agitar });
    if (!moviendo()) fisica.acabarYa();
    decidir();
    // Si el navegador deja de dar fotogramas sin ocultar la pestaña (ventana tapada, una vista incrustada…), la bola no
    // se queda dentro esperando: sale sin animar
    const inicio = ultimoFotograma = performance.now();
    const vigia = setInterval(() => {
      const ahora = performance.now();
      if (ahora - ultimoFotograma > 700 || ahora - inicio > 7000) fisica.acabarYa();
    }, 250);
    const b = await promesa;
    clearInterval(vigia);
    pintar();
    return b && posicion(id);
  }

  return { poner, llenar, quitar, extraer, posicion };
}

// ---------- el sonido (solo si quien mira lo enciende) ----------
export function sonidoGarapon() {
  let ctx = null, ruido = null, activo = false, ultimo = 0;
  function preparar() {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    if (!ruido) {
      ruido = ctx.createBuffer(1, Math.round(ctx.sampleRate * .08), ctx.sampleRate);
      const d = ruido.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
    }
  }
  // El golpe seco de una bola de madera: ruido filtrado, más fuerte cuanto más fuerte el choque
  function golpe(fuerza, tipo) {
    if (!activo || !ctx) return;
    const t = ctx.currentTime;
    if (t - ultimo < .025) return;
    ultimo = t;
    const fuente = ctx.createBufferSource(), filtro = ctx.createBiquadFilter(), vol = ctx.createGain();
    fuente.buffer = ruido;
    filtro.type = 'bandpass'; filtro.Q.value = 5;
    filtro.frequency.value = tipo === 'bandeja' ? 650 : 1700 + Math.random() * 1500;
    vol.gain.value = Math.min(.45, .06 * fuerza * (tipo === 'bandeja' ? 2 : 1));
    fuente.connect(filtro).connect(vol).connect(ctx.destination);
    fuente.start(t);
  }
  // La campanilla de los sorteos japoneses: «karan, karan»
  function campana() {
    if (!activo || !ctx) return;
    const t0 = ctx.currentTime;
    for (const [retraso, fuerza] of [[0, .2], [.17, .14]]) for (const [parcial, peso] of [[1, 1], [2.76, .5], [5.4, .25], [8.93, .12]]) {
      const osc = ctx.createOscillator(), vol = ctx.createGain(), t = t0 + retraso;
      osc.frequency.value = 1180 * parcial;
      vol.gain.setValueAtTime(0, t);
      vol.gain.linearRampToValueAtTime(fuerza * peso, t + .004);
      vol.gain.exponentialRampToValueAtTime(.0001, t + 1.1 / Math.sqrt(parcial));
      osc.connect(vol).connect(ctx.destination);
      osc.start(t); osc.stop(t + 1.2);
    }
  }
  return { get activo() { return activo; }, activar(v) { activo = v; if (v) preparar(); }, golpe, campana };
}
