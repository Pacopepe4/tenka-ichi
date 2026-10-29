// Sorteo del calendario en directo: el bombo de la web.
// El calendario se calcula entero al empezar, con su semilla (con la misma semilla sale igual, así se puede
// comprobar), pero la web solo recibe las bolas que ya han salido: ni las que faltan ni la semilla viajan antes de
// tiempo. Cada jornada es un bombo de seis bolas, una por clan: salen por parejas (el lado azul y el rojo de cada
// cruce) y, al acabar la jornada, el bombo se vuelve a llenar. El calendario solo se guarda al sacar la última
// bola; un ensayo se hace igual, pero no guarda nada.
import { randomUUID } from 'node:crypto';
import { prepararCalendario, fijarCalendario } from './calendario.js';

const LADOS = ['azul', 'rojo'];

// Las bolas en el orden en que salen
export function bolasDe(calendario) {
  return calendario.jornadas.flatMap(j => j.flatMap(c => LADOS.map(lado => ({ jornada: c.jornada, cruce: c.id, lado, clan: c[lado] }))))
    .map((b, i) => ({ n: i + 1, ...b }));
}

export function crearSorteo({ preparar = prepararCalendario, fijar = fijarCalendario } = {}) {
  let s = null;            // el sorteo en marcha o el último que terminó
  let temporizador = null;
  let escucha = () => {};

  const parar = () => { clearInterval(temporizador); temporizador = null; if (s) s.cadaMs = 0; };

  // Lo que ve cualquiera
  function vista() {
    if (!s) return { estado: 'ninguno' };
    const terminado = s.sacadas === s.bolas.length;
    return {
      id: s.id, estado: terminado ? 'terminado' : 'en curso', ensayo: s.ensayo,
      participantes: s.calendario.participantes, total: s.bolas.length, porJornada: s.calendario.participantes.length,
      sacadas: s.bolas.slice(0, s.sacadas), cadaMs: s.cadaMs,
      guardado: terminado ? s.guardado : null, semilla: terminado ? s.calendario.semilla : null,
    };
  }
  const avisar = () => escucha(vista());

  function iniciar({ participantes, semilla, ensayo = false }) {
    if (s && s.sacadas < s.bolas.length) throw new Error('Ya hay un sorteo en marcha: termínalo o cancélalo antes de empezar otro');
    const calendario = preparar(participantes, semilla);
    parar();
    s = { id: randomUUID(), calendario, bolas: bolasDe(calendario), sacadas: 0, ensayo: Boolean(ensayo), guardado: null, cadaMs: 0 };
    avisar();
    // La semilla solo la ve quien empieza el sorteo (el panel): el resto la recibe al terminar
    return { semilla: calendario.semilla, total: s.bolas.length };
  }

  async function siguiente() {
    if (!s) throw new Error('No hay ningún sorteo en marcha');
    if (s.sacadas >= s.bolas.length) throw new Error(`Ya han salido las ${s.bolas.length} bolas`);
    s.sacadas++;
    const ultima = s.sacadas === s.bolas.length;
    if (ultima) parar();
    avisar();
    if (ultima && !s.ensayo) {
      const actual = s;
      try { await fijar(actual.calendario); actual.guardado = true; }
      catch (e) { console.error('El sorteo ha terminado, pero no se ha podido guardar:', e.message); actual.guardado = false; }
      if (s === actual) avisar();
    }
    return vista();
  }

  // Con cadaMs, sale una bola sola cada tanto; con 0, solo las que se pidan
  function automatico(cadaMs) {
    if (!s || s.sacadas >= s.bolas.length) throw new Error('No hay ningún sorteo en marcha');
    parar();
    s.cadaMs = cadaMs > 0 ? Math.round(cadaMs) : 0;
    if (s.cadaMs) {
      const actual = s;
      temporizador = setInterval(() => { if (s === actual) siguiente().catch(() => parar()); }, s.cadaMs);
      temporizador.unref?.();
    }
    avisar();
    return vista();
  }

  function cancelar() {
    parar();
    s = null;
    avisar();
    return vista();
  }

  return { iniciar, siguiente, automatico, cancelar, vista, alCambiar: f => { escucha = f; } };
}
