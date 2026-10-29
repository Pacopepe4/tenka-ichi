// El bombo del sorteo del calendario, en directo (zona de la liga de la portada).
// Recibe de la web (canal «sorteo») lo que ya ha salido, nunca lo que falta: cada bola nueva sale del bombo, se
// planta delante con su clan y vuela a su hueco del tablero. Quien entra con el sorteo a medias ve lo que ya ha
// salido colocado de golpe y solo anima las bolas que llegan después.
import { escapar } from '/carta.js';
import { fechaCorta } from '/comun.js';

const esperar = ms => new Promise(r => setTimeout(r, ms));
// En una pestaña oculta el navegador frena las animaciones: ahí (y con «reducir movimiento») se coloca todo de golpe
const sinMovimiento = () => document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches;
// Una animación que, pase lo que pase, nunca deja la cola esperando
function correr(el, fotogramas, opciones) {
  const a = el.animate(fotogramas, { fill: 'forwards', ...opciones });
  return Promise.race([a.finished.catch(() => {}), esperar(opciones.duration + 300)]);
}

const GRANDE = 124;   // lado de la bola que se planta delante, en px
// Cada bola del bombo gira a su radio, a su ritmo y desde su sitio, para que no se muevan a la vez
const RADIOS = [.27, .14, .31, .05, .22, .34, .18, .29];
const TIEMPOS = [6.5, 8.2, 5.4, 9.5, 7.1, 6.0, 8.8, 5.9];

export function montarSorteo(caja, { clan, logo, formato, hayCalendario, alTerminar }) {
  const nJornadas = formato.liguilla.length, porJornada = formato.clanes.length, nCruces = porJornada / 2;
  const nombre = id => clan(id).nombre;
  const lado = l => (l === 'azul' ? 'lado azul' : 'lado rojo');

  caja.innerHTML = `
    <div class="sorteo-cabecera">
      <span class="sorteo-vivo" hidden><i class="punto-vivo" aria-hidden="true"></i>En directo</span>
      <h3>Sorteo del calendario</h3>
      <span class="sorteo-ensayo" hidden>Ensayo</span>
    </div>
    <p class="sorteo-estado" role="status" aria-live="polite"></p>
    <div class="sorteo-escena">
      <div class="bombo" aria-hidden="true">
        <div class="bombo-aro"></div>
        <div class="bombo-kanji">抽</div>
        <div class="bombo-bolas"></div>
        <div class="bombo-boca"></div>
      </div>
      <div class="sorteo-foco" aria-hidden="true">
        <div class="foco-diana"></div>
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
  const [escena, bombo, dentro, boca, diana, nombreFoco, ladoFoco, tablero, estadoEl, pie, vivo, ensayoEl] =
    ['.sorteo-escena', '.bombo', '.bombo-bolas', '.bombo-boca', '.foco-diana', '.foco-nombre', '.foco-lado', '.sorteo-tablero', '.sorteo-estado', '.sorteo-pie', '.sorteo-vivo', '.sorteo-ensayo'].map(q);

  const decir = t => { estadoEl.textContent = t; };
  const hueco = (cruce, l) => tablero.querySelector(`[data-cruce="${cruce}"] .hueco[data-lado="${l}"]`);
  const bolaHTML = (id, clase, extra = '') => `<span class="${clase}" data-clan="${escapar(id)}" style="--color:${clan(id).color};${extra}"><img src="${logo(id)}" alt=""></span>`;

  function llenarBombo(ids) {
    dentro.innerHTML = ids.map((id, i) => bolaHTML(id, `bola-d${i % 2 ? ' inversa' : ''}`,
      `--rf:${RADIOS[i % RADIOS.length]};--t:${TIEMPOS[i % TIEMPOS.length]}s;--d:${-(i * 1.3).toFixed(1)}s`)).join('');
  }
  function llenarHueco(h, id, pulso = false) {
    h.style.setProperty('--color', clan(id).color);
    h.classList.add('lleno');
    h.innerHTML = `<img src="${logo(id)}" alt=""><b>${escapar(nombre(id))}</b>`;
    if (pulso) { h.classList.remove('nuevo'); void h.offsetWidth; h.classList.add('nuevo'); }
  }
  const marcarJornada = n => tablero.querySelectorAll('.tab-jornada').forEach(s => s.classList.toggle('actual', Number(s.dataset.j) === n));
  const centro = (el, base) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2 - base.left, y: r.top + r.height / 2 - base.top, w: r.width, h: r.height }; };

  // Las bolas que ya han salido en la jornada de la bola b, para saber qué clanes quedan en el bombo
  const quedan = (sacadas, jornada) => formato.clanes.filter(id => !sacadas.some(b => b.jornada === jornada && b.clan === id));

  // ---------- estado de este sorteo ----------
  let idSorteo = null, vistas = 0, sacadas = [], ultima = null, animando = false, primeraVista = true, terminadoAvisado = false;
  let epoca = 0;   // cambia al empezar o cancelar un sorteo: lo que se estaba animando del anterior se abandona
  const cola = [];

  function reiniciar() {
    epoca++;
    idSorteo = null; vistas = 0; sacadas = []; ultima = null; cola.length = 0; terminadoAvisado = false;
    tablero.querySelectorAll('.hueco').forEach(h => { h.className = 'hueco'; h.innerHTML = ''; h.style.removeProperty('--color'); });
    tablero.querySelectorAll('.tab-jornada').forEach(s => s.classList.remove('actual'));
    llenarBombo(formato.clanes);
    nombreFoco.textContent = ladoFoco.textContent = ''; ladoFoco.className = 'foco-lado';
    pie.textContent = '';
    bombo.classList.remove('agitando');
  }

  // Sin animación: la bola ya está en su hueco
  function colocar(b) {
    llenarHueco(hueco(b.cruce, b.lado), b.clan);
    marcarJornada(b.jornada);
  }

  async function sacar(b) {
    const mia = epoca;
    sacadas.push(b);
    if (sinMovimiento()) { colocar(b); llenarBombo(quedan(sacadas, b.jornada)); return; }
    marcarJornada(b.jornada);
    // Cada jornada es un bombo nuevo con los seis clanes
    if (b.jornada > 1 && (b.n - 1) % porJornada === 0) {
      llenarBombo(formato.clanes); decir(`Jornada ${b.jornada}: el bombo se llena otra vez.`);
      await esperar(900);
      if (mia !== epoca) return;
    }
    decir(`Jornada ${b.jornada}: sale una bola…`);
    bombo.classList.add('agitando');
    await esperar(1100);
    if (mia !== epoca) return;

    // La bola sale por la boca del bombo y se planta en la diana
    const dentroEl = dentro.querySelector(`[data-clan="${b.clan}"]`);
    if (dentroEl) correr(dentroEl, [{ opacity: 1 }, { opacity: 0 }], { duration: 160 }).then(() => dentroEl.remove());
    const grande = document.createElement('span');
    grande.className = 'bola-grande';
    grande.style.setProperty('--color', clan(b.clan).color);
    grande.innerHTML = `<img src="${logo(b.clan)}" alt="">`;
    escena.appendChild(grande);
    const base = escena.getBoundingClientRect();
    const desde = centro(boca, base), punto = centro(diana, base);
    await correr(grande, [
      { transform: `translate(${desde.x}px, ${desde.y}px) scale(.25)`, opacity: 0 },
      { transform: `translate(${desde.x}px, ${desde.y + 22}px) scale(.3)`, opacity: 1, offset: .12 },
      { transform: `translate(${punto.x}px, ${punto.y}px) scale(1)`, opacity: 1 },
    ], { duration: 950, easing: 'cubic-bezier(.3, 1.35, .5, 1)' });
    if (mia !== epoca) return grande.remove();
    bombo.classList.remove('agitando');
    nombreFoco.textContent = nombre(b.clan);
    nombreFoco.style.setProperty('--color', clan(b.clan).color);
    ladoFoco.textContent = lado(b.lado);
    ladoFoco.className = `foco-lado ${b.lado}`;
    decir(b.lado === 'azul' ? `Jornada ${b.jornada}: ${nombre(b.clan)}, en el ${lado(b.lado)}.` : `Jornada ${b.jornada}: ${nombre(sacadas.at(-2).clan)} contra ${nombre(b.clan)}.`);
    await esperar(1200);
    if (mia !== epoca) return grande.remove();

    // Y vuela a su hueco del tablero
    const h = hueco(b.cruce, b.lado), icono = centro(h, base);
    const destino = icono.x + (b.lado === 'azul' ? -icono.w / 2 + 22 : icono.w / 2 - 22);
    await correr(grande, [
      { transform: `translate(${punto.x}px, ${punto.y}px) scale(1)`, opacity: 1 },
      { transform: `translate(${destino}px, ${icono.y}px) scale(${34 / GRANDE})`, opacity: 1, offset: .9 },
      { transform: `translate(${destino}px, ${icono.y}px) scale(${30 / GRANDE})`, opacity: 0 },
    ], { duration: 800, easing: 'cubic-bezier(.5, 0, .3, 1)' });
    grande.remove();
    if (mia !== epoca) return;
    llenarHueco(h, b.clan, true);
    nombreFoco.textContent = ladoFoco.textContent = '';
    if (b.n % porJornada === 0) decir(`Jornada ${b.jornada} completa.`);
    await esperar(200);
  }

  async function vaciarCola() {
    if (animando) return;
    animando = true;
    while (cola.length) await sacar(cola.shift()).catch(() => {});
    animando = false;
    final();
  }

  // Cuando ha salido la última bola y se ha terminado de enseñar
  function final() {
    if (animando || cola.length || !ultima || ultima.estado !== 'terminado') return;
    bombo.classList.remove('agitando');
    vivo.hidden = true;
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

  reiniciar();   // el bombo se ve lleno desde el primer momento

  return {
    recibir(v) {
      if (v.estado === 'ninguno') {
        reiniciar();
        vivo.hidden = true; ensayoEl.hidden = true;
        decir('El sorteo del calendario se hace en directo, bola a bola. Cuando empiece, saldrán aquí las bolas.');
        caja.hidden = !visibilidad(v);
        primeraVista = false;
        return;
      }
      if (v.id !== idSorteo) {
        reiniciar();
        idSorteo = v.id;
        caja.dataset.estado = v.estado;
      }
      ensayoEl.hidden = !v.ensayo;
      ultima = v;
      if (primeraVista) {
        // Entra con el sorteo empezado: lo que ya salió se coloca de golpe
        v.sacadas.forEach(b => { sacadas.push(b); colocar(b); });
        vistas = v.sacadas.length;
        if (v.estado === 'en curso') { llenarBombo(quedan(sacadas, sacadas.at(-1)?.jornada ?? 1)); decir(sacadas.length ? `Jornada ${sacadas.at(-1).jornada}: el sorteo sigue.` : 'Todo listo: el bombo va a empezar.'); }
        else decir('Sorteo terminado.');
      } else {
        for (const b of v.sacadas.slice(vistas)) cola.push(b);
        vistas = v.sacadas.length;
        if (!sacadas.length && !cola.length) decir('Todo listo: el bombo va a empezar.');
      }
      vivo.hidden = v.estado === 'terminado' && !animando && !cola.length;
      caja.hidden = !visibilidad(v);
      primeraVista = false;
      if (v.estado === 'terminado' && !cola.length && !animando) final();
      vaciarCola();
    },
  };
}
