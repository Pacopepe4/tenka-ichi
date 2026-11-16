// Límites del modo IA (pc1/ia.js): las herramientas que puede usar Sonnet y lo que el realizador le deja hacer.
// Cada propuesta se valida aquí antes de tocar el cerebro. Si no vale, se rechaza con un motivo en español claro
// (sale en el tool_result del turno siguiente, con is_error) para que Sonnet entienda qué falla y no insista.
//
// Todo va en segundos de partida. Solo se puede tocar lo que aún no se ha emitido (pasada la ventana congelada de
// la antena) y lo que ya se sabe (antes de lo que ve el PC 1, con margen por si una pelea se adelanta).
import { mezclar } from '../comun/opciones.js';

// Topes por defecto (opciones.json → ia.limites)
export const LIMITES = {
  antenaSegundos: 15,       // lo más pronto: antena + max(15, reglas.congelarSegundos + margenCongelado)
  margenCongelado: 2,
  colchonSegundos: 5,       // margen alrededor de cada jugada (pelea, objetivo, muerte)
  grafismos: { maximo: 1, ventanaSegundos: 60, separacionSegundos: 30, minimoSegundos: 8, maximoSegundos: 25 },
  repeticiones: { maximo: 1, ventanaSegundos: 240, calmaSegundos: 20, buscarSegundos: 60 },
  camara: { maximo: 2, ventanaSegundos: 300, minimoSegundos: 6, maximoSegundos: 20 },
};

export function limitesDe(ia = {}) { return mezclar(LIMITES, ia.limites || {}); }

const reloj = t => (t === null || t === undefined || !Number.isFinite(t) ? '--:--' : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`);
// Un segundo de partida en los mensajes: el número (lo que usan las herramientas) y el reloj del juego
export const hora = t => `${Math.round(t)} (${reloj(t)})`;
const red = x => Math.round(x * 10) / 10;
const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
const POSICIONES = { TOP: 0, JUNGLE: 1, MIDDLE: 2, MID: 2, BOTTOM: 3, ADC: 3, UTILITY: 4, SUPPORT: 4 };
const GRAFICOS = new Set(['oro', 'ficha', 'lineas']);
const NOMBRE_GRAFICO = { oro: 'gráfica de oro', ficha: 'ficha', lineas: 'línea por línea reservado' };

// ---------- herramientas (estables: mismo orden y mismo texto en toda la partida, para la caché) ----------

const nulable = tipo => ({ anyOf: [{ type: tipo }, { type: 'null' }] });

export function herramientas(ia = {}) {
  const L = limitesDe(ia);
  const g = L.grafismos, r = L.repeticiones, c = L.camara;
  const objeto = (properties) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
  const motivo = { type: 'string', description: 'Una frase: por qué.' };
  return [
    {
      name: 'programar_grafico',
      description: `Saca un grafismo en el overlay en un rato aún por emitir. tipo "oro": gráfica de diferencia de oro; "ficha": ficha de un jugador (pon su campeón); "lineas": reserva el rato para el línea por línea, sin que salga otra cosa. desde: segundo de partida en que empieza, dentro de reloj.programable. segundos: de ${g.minimoSegundos} a ${g.maximoSegundos}. Solo en ratos tranquilos: sin pisar jugadas, repeticiones, recorridos ni visión, a ${g.separacionSegundos} s como poco de otro grafismo y como mucho ${g.maximo} cada ${g.ventanaSegundos} s.`,
      strict: true,
      input_schema: objeto({
        tipo: { type: 'string', enum: ['oro', 'ficha', 'lineas'] },
        campeon: { ...nulable('string'), description: 'Solo para "ficha": el campeón tal como sale en equipos. null en los demás.' },
        desde: { type: 'number', description: 'Segundo de partida en que empieza.' },
        segundos: { type: 'integer', description: `Cuánto dura, de ${g.minimoSegundos} a ${g.maximoSegundos}.` },
        motivo,
      }),
    },
    {
      name: 'pedir_repeticion',
      description: `Pide una repetición que las reglas no han puesto, de una jugada ya acabada y aún sin emitir entera, con al menos una muerte o un objetivo. El realizador la mete en el primer rato tranquilo de ${r.calmaSegundos} s que haya en el minuto siguiente. Como mucho ${r.maximo} cada ${Math.round(r.ventanaSegundos / 60)} min.`,
      strict: true,
      input_schema: objeto({ jugada: { type: 'string', description: 'Id de la jugada (por ejemplo "j12").' }, motivo }),
    },
    {
      name: 'seguir_jugador',
      description: `Lleva la cámara a un campeón entre dos segundos de un rato muerto (sin jugadas, repeticiones, recorridos ni visión), de ${c.minimoSegundos} a ${c.maximoSegundos} s. Como mucho ${c.maximo} cada ${Math.round(c.ventanaSegundos / 60)} min.`,
      strict: true,
      input_schema: objeto({
        campeon: { type: 'string', description: 'El campeón tal como sale en equipos.' },
        desde: { type: 'number', description: 'Segundo de partida en que empieza.' },
        hasta: { type: 'number', description: 'Segundo de partida en que acaba.' },
        motivo,
      }),
    },
    {
      name: 'elegir_repeticion',
      description: 'Cuando el mensaje trae "elegirRepeticion" (varias jugadas acaban a la vez y solo cabe una repetición): la jugada que se repite.',
      strict: true,
      input_schema: objeto({ jugada: { type: 'string', description: 'Id de una de las jugadas del grupo.' }, motivo }),
    },
    {
      name: 'elegir_mvp',
      description: 'Solo al acabar la partida: el MVP para la pantalla final.',
      strict: true,
      input_schema: objeto({ campeon: { type: 'string', description: 'El campeón tal como sale en equipos.' }, motivo }),
    },
    {
      name: 'resumen_final',
      description: 'Solo al acabar la partida: titular (70 caracteres como mucho), resumen para los casters (3 a 5 frases) y las jugadas destacadas para el resumen en vídeo (ids de las candidatas, en el orden en que salen).',
      strict: true,
      input_schema: objeto({
        titular: { type: 'string' },
        resumen: { type: 'string' },
        destacadas: { type: 'array', items: { type: 'string' } },
      }),
    },
  ];
}

// ---------- comprobar la forma de los datos (aunque vaya con strict) ----------

function tipoDe(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v === 'number' ? (Number.isFinite(v) ? 'number' : 'nan') : typeof v;
}

function encaja(v, s) {
  if (s.anyOf) return s.anyOf.some(x => encaja(v, x));
  const t = tipoDe(v);
  if (s.type === 'number' ? !(t === 'number' || t === 'integer') : t !== s.type) return false;
  if (s.enum && !s.enum.includes(v)) return false;
  if (s.type === 'array') return v.every(x => encaja(x, s.items));
  return true;
}

// Devuelve el motivo del fallo o null si vale
export function revisarForma(input, esquema) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'los datos no son un objeto';
  for (const k of esquema.required) if (!(k in input)) return `falta «${k}»`;
  for (const k of Object.keys(input)) if (!(k in esquema.properties)) return `sobra «${k}»`;
  for (const [k, s] of Object.entries(esquema.properties)) if (!encaja(input[k], s)) return `«${k}» no tiene el tipo que toca`;
  return null;
}

// ---------- lo que ya hay en la partida ----------

export function buscarCampeon(jugadores = [], nombre) {
  const n = norm(nombre);
  if (!n) return null;
  return jugadores.find(j => norm(j.campeon) === n) || jugadores.find(j => norm(j.jugador) === n) || null;
}

// Segundos que se pueden tocar ahora
export function ventana({ tA, tD, reglas = {}, finPartida = null }, L = LIMITES) {
  const desde = (tA ?? 0) + Math.max(L.antenaSegundos, (reglas.congelarSegundos ?? 0) + L.margenCongelado);
  // Una pelea que aparezca luego adelanta su jugada (anticipacionPelea): hasta ahí no se sabe del todo
  let hasta = (tD ?? 0) - ((reglas.anticipacionPelea ?? reglas.anticipacion ?? 7) + 2);
  if (Number.isFinite(finPartida)) hasta = Math.min(hasta, finPartida);
  return { desde: red(desde), hasta: red(hasta) };
}

// Todo lo que ocupa un rato: jugadas, repeticiones, grafismos, visión, recorridos y planos de la IA
export function ocupaciones(cerebro) {
  const r = [];
  for (const j of cerebro.jugadas) r.push({ clase: 'jugada', tipo: j.tipo, desde: j.inicio, hasta: j.fin, id: j.id, texto: `la jugada ${j.id} (${j.tipo}, ${hora(j.inicio)}–${hora(j.fin)})` });
  for (const a of cerebro.acciones) {
    if (a.tipo === 'repeticion') r.push({ clase: 'repeticion', desde: a.t, hasta: a.t + a.segundos, id: a.id, texto: `la repetición de ${a.jugada} (${hora(a.t)}–${hora(a.t + a.segundos)})` });
    else if (GRAFICOS.has(a.tipo)) r.push({ clase: 'grafico', tipo: a.tipo, ia: Boolean(a.ia), desde: a.t, hasta: a.t + a.segundos, id: a.id, texto: `${NOMBRE_GRAFICO[a.tipo]}${a.campeon ? ' de ' + a.campeon : ''} (${hora(a.t)}–${hora(a.t + a.segundos)})` });
  }
  for (const v of cerebro.visiones || []) r.push({ clase: 'vision', desde: v.t, hasta: v.t + 2 * (v.segundos || 2) + 1, id: v.id, texto: `el momento de visión de ${v.jugada} (${hora(v.t)})` });
  for (const x of cerebro.recorridos || []) r.push({ clase: 'recorrido', desde: x.t, hasta: x.t + (x.segundos || 0), id: x.id, texto: `el recorrido del río (${hora(x.t)}–${hora(x.t + (x.segundos || 0))})` });
  for (const p of cerebro.propuestasIa || []) r.push({ clase: 'seguir', desde: p.desde, hasta: p.hasta, id: p.id, texto: `tu plano de ${p.jugador.campeon} (${hora(p.desde)}–${hora(p.hasta)})` });
  return r;
}

// Ratos tranquilos entre a y b: sin jugadas (con su colchón) ni nada programado. Para el contexto de la IA.
export function ratosTranquilos(cerebro, a, b, { colchon = LIMITES.colchonSegundos, minimo = 8 } = {}) {
  const ocupados = ocupaciones(cerebro)
    .map(o => (o.clase === 'jugada' ? [o.desde - colchon, o.hasta + colchon] : [o.desde, o.hasta]))
    .filter(([i, f]) => f > a && i < b).sort((x, y) => x[0] - y[0]);
  const r = [];
  let t = a;
  for (const [i, f] of ocupados) {
    if (i - t >= minimo) r.push([Math.round(t), Math.round(i)]);
    t = Math.max(t, f);
  }
  if (b - t >= minimo) r.push([Math.round(t), Math.round(b)]);
  return r;
}

// ---------- el que valida ----------

export class LimitesIa {
  constructor(ia = {}) {
    this.L = limitesDe(ia);
    this.esquemas = Object.fromEntries(herramientas(ia).map(h => [h.name, h.input_schema]));
    this.aceptadas = [];  // { nombre, t }: para los topes
  }

  reiniciar() { this.aceptadas = []; }

  // Cuántas quedan de cada una cerca del segundo t (para el contexto)
  cupos(t) {
    const quedan = (nombre, c) => Math.max(0, c.maximo - this.aceptadas.filter(a => a.nombre === nombre && Math.abs(a.t - t) < c.ventanaSegundos).length);
    return { graficos: quedan('programar_grafico', this.L.grafismos), repeticiones: quedan('pedir_repeticion', this.L.repeticiones), camara: quedan('seguir_jugador', this.L.camara) };
  }

  apuntar(nombre, accion) { this.aceptadas.push({ nombre, t: accion.t ?? accion.desde ?? 0 }); }

  // ctx: { cerebro, jugadores, tA, tD, reglas, manual, final, candidatas }
  // Devuelve { ok: true, accion, texto } o { ok: false, motivo }
  validar(nombre, input, ctx) {
    const esquema = this.esquemas[nombre];
    if (!esquema) return { ok: false, motivo: `no existe la herramienta «${nombre}».` };
    const forma = revisarForma(input, esquema);
    if (forma) return { ok: false, motivo: `datos no válidos: ${forma}.` };
    const f = this[`v_${nombre}`];
    return f.call(this, input, ctx);
  }

  // Lo común a lo que se programa en el tiempo: control manual, ventana y que no se pise nada
  comun(a, b, ctx, { jugadas, saltar = () => false }) {
    if (ctx.manual) return 'el realizador tiene el control manual: no se programa nada hasta que lo devuelva.';
    if (ctx.cerebro.finPartida !== null && ctx.cerebro.finPartida !== undefined && a >= ctx.cerebro.finPartida) return `la partida acaba en ${hora(ctx.cerebro.finPartida)}.`;
    const v = ventana({ ...ctx, finPartida: ctx.cerebro.finPartida }, this.L);
    if (v.hasta - v.desde < 1) return `ahora no hay nada programable: lo que sale antes de ${hora(v.desde)} ya está fijado y solo se sabe lo que pasa hasta ${hora(v.hasta)}.`;
    if (a < v.desde) return `el segundo ${hora(a)} ya no se puede tocar: la antena va por ${hora(ctx.tA ?? 0)} y lo que sale antes de ${hora(v.desde)} ya está fijado para la emisión. Lo más pronto: ${Math.ceil(v.desde)}.`;
    if (b > v.hasta) return `hasta ${hora(b)} aún no se sabe qué pasa (lo seguro llega a ${hora(v.hasta)}): tiene que acabar antes.`;
    const colchon = this.L.colchonSegundos;
    for (const o of ocupaciones(ctx.cerebro)) {
      if (saltar(o)) continue;
      if (o.clase === 'jugada') {
        if (!jugadas(o)) continue;
        if (o.desde - colchon < b && o.hasta + colchon > a) return `pisa ${o.texto}, con ${colchon} s de margen a cada lado. Busca un rato tranquilo en ratosTranquilos.`;
      } else if (o.clase !== 'grafico' && o.desde < b && o.hasta > a) return `pisa ${o.texto}.`;
    }
    return null;
  }

  v_programar_grafico(input, ctx) {
    const g = this.L.grafismos;
    const { tipo, desde } = input;
    const segundos = input.segundos;
    if (segundos < g.minimoSegundos || segundos > g.maximoSegundos) return { ok: false, motivo: `«segundos» tiene que ir de ${g.minimoSegundos} a ${g.maximoSegundos} (has puesto ${segundos}).` };
    let quien = null;
    if (tipo === 'ficha') {
      quien = buscarCampeon(ctx.jugadores, input.campeon);
      if (!quien) return { ok: false, motivo: `no hay ningún campeón «${input.campeon ?? ''}» en la partida. Usa uno de: ${(ctx.jugadores || []).map(j => j.campeon).join(', ')}.` };
    }
    const hasta = desde + segundos;
    // Los grafismos no van encima de peleas, objetivos ni muertes (una torre sí se puede tapar)
    // (un plano de cámara de la IA sí puede llevar grafismo: son cosas distintas)
    const choque = this.comun(desde, hasta, ctx, { jugadas: o => o.tipo !== 'estructura', saltar: o => o.clase === 'seguir' });
    if (choque) return { ok: false, motivo: choque };
    for (const o of ocupaciones(ctx.cerebro).filter(x => x.clase === 'grafico')) {
      if (o.desde - g.separacionSegundos < hasta && o.hasta + g.separacionSegundos > desde) return { ok: false, motivo: `está muy cerca de ${o.texto}: deja al menos ${g.separacionSegundos} s entre un grafismo y otro.` };
    }
    const previa = this.aceptadas.find(a => a.nombre === 'programar_grafico' && Math.abs(a.t - desde) < g.ventanaSegundos);
    if (previa) return { ok: false, motivo: `ya programaste un grafismo en ${hora(previa.t)}: como mucho ${g.maximo} cada ${g.ventanaSegundos} s.` };
    const accion = { tipo, t: red(desde), segundos, campeon: quien?.campeon || null, jugador: quien?.jugador || null, equipo: quien?.equipo || null, motivo: input.motivo };
    return { ok: true, accion, texto: `aceptada: ${NOMBRE_GRAFICO[tipo]}${quien ? ' de ' + quien.campeon : ''} de ${hora(desde)} a ${hora(hasta)}.` };
  }

  v_pedir_repeticion(input, ctx) {
    const r = this.L.repeticiones;
    const { cerebro, reglas = {} } = ctx;
    if (ctx.manual) return { ok: false, motivo: 'el realizador tiene el control manual: no se programa nada hasta que lo devuelva.' };
    const j = cerebro.jugadas.find(x => x.id === input.jugada);
    if (!j) return { ok: false, motivo: `no hay ninguna jugada «${input.jugada}». Usa un id de las jugadas que te he pasado.` };
    if (String(j.repeticion || '').startsWith('rep-')) return { ok: false, motivo: `la jugada ${j.id} ya tiene repetición programada.` };
    if (!(j.muertes >= 1 || j.objetivos.length)) return { ok: false, motivo: `la jugada ${j.id} no tiene muertes ni objetivos: solo se repiten jugadas con al menos una de las dos cosas.` };
    if (j.objetivos.includes('BaronKill') && !j.eventos.some(e => e.nombre === 'Ace')) return { ok: false, motivo: 'el Barón sin ace no se repite (regla fija del realizador).' };
    const tD = ctx.tD ?? 0;
    if (j.fin > tD || tD - j.ultimoT <= (reglas.ventanaPelea ?? 12)) return { ok: false, motivo: `la jugada ${j.id} aún no ha acabado (puede seguir la pelea): espera a que acabe.` };
    if (j.fin < (ctx.tA ?? 0)) return { ok: false, motivo: `la jugada ${j.id} ya se ha emitido entera: solo se repiten jugadas que acaban en lo que aún no se ha emitido.` };
    const previa = this.aceptadas.find(a => a.nombre === 'pedir_repeticion' && Math.abs(a.t - j.fin) < r.ventanaSegundos);
    if (previa) return { ok: false, motivo: `ya pediste una repetición en ${hora(previa.t)}: como mucho ${r.maximo} cada ${Math.round(r.ventanaSegundos / 60)} min.` };
    // Un rato tranquilo de «calmaSegundos» en el minuto siguiente a la jugada (sin peleas ni objetivos, sin nada programado)
    const segundos = Math.max(r.calmaSegundos, reglas.repeticion?.segundos ?? 12);
    let hueco = null;
    for (let t = Math.ceil(j.fin + 2); t <= j.fin + r.buscarSegundos; t += 1) {
      if (this.comun(t, t + segundos, ctx, { jugadas: o => o.tipo === 'pelea' || o.tipo === 'objetivo' || o.tipo === 'muerte', saltar: o => o.clase === 'jugada' && o.id === j.id }) === null
        && !ocupaciones(cerebro).some(o => o.clase === 'grafico' && o.desde < t + segundos && o.hasta > t)) { hueco = t; break; }
    }
    if (hueco === null) return { ok: false, motivo: `no hay un rato tranquilo de ${segundos} s por emitir en el minuto siguiente a ${j.id} (o aún no se sabe lo bastante): no cabe.` };
    return { ok: true, accion: { jugada: j.id, t: hueco, motivo: input.motivo }, texto: `aceptada: repetición de ${j.id} hacia ${hora(hueco)} (el realizador pone el segundo exacto).` };
  }

  v_seguir_jugador(input, ctx) {
    const c = this.L.camara;
    const { desde, hasta } = input;
    const quien = buscarCampeon(ctx.jugadores, input.campeon);
    if (!quien) return { ok: false, motivo: `no hay ningún campeón «${input.campeon}» en la partida. Usa uno de: ${(ctx.jugadores || []).map(j => j.campeon).join(', ')}.` };
    const dur = hasta - desde;
    if (!(dur >= c.minimoSegundos && dur <= c.maximoSegundos)) return { ok: false, motivo: `el plano tiene que durar de ${c.minimoSegundos} a ${c.maximoSegundos} s (has puesto ${red(dur)}).` };
    const ini = ctx.reglas?.inicio;
    const finInicio = ini?.activo !== false && Array.isArray(ini?.tramos) && ini.tramos.length ? Math.max(...ini.tramos.map(t => t.hasta)) : 0;
    if (desde < finInicio) return { ok: false, motivo: `hasta ${hora(finInicio)} la cámara lleva el guion de inicio (bot y junglas): no se cambia.` };
    // La cámara solo se mueve en ratos muertos: ninguna jugada, ni una torre
    const choque = this.comun(desde, hasta, ctx, { jugadas: () => true });
    if (choque) return { ok: false, motivo: choque };
    const previas = this.aceptadas.filter(a => a.nombre === 'seguir_jugador' && Math.abs(a.t - desde) < c.ventanaSegundos);
    if (previas.length >= c.maximo) return { ok: false, motivo: `ya llevas ${previas.length} planos de cámara cerca (${previas.map(p => hora(p.t)).join(', ')}): como mucho ${c.maximo} cada ${Math.round(c.ventanaSegundos / 60)} min.` };
    const jugador = { jugador: quien.jugador, campeon: quien.campeon, equipo: quien.equipo };
    return { ok: true, accion: { desde: red(desde), hasta: red(hasta), jugador, motivo: input.motivo }, texto: `aceptada: cámara con ${quien.campeon} de ${hora(desde)} a ${hora(hasta)}.` };
  }

  v_elegir_repeticion(input, ctx) {
    const grupos = ctx.cerebro.gruposSinElegir();
    const g = grupos.find(x => x.jugadas.some(j => j.id === input.jugada));
    if (!g) {
      return { ok: false, motivo: grupos.length ? `la jugada «${input.jugada}» no está en ninguna repetición por elegir (elige entre: ${grupos.map(x => x.jugadas.map(j => j.id).join(', ')).join(' / ')}).` : 'ahora no hay ninguna repetición por elegir (ya pasó el tiempo o se eligió).' };
    }
    return { ok: true, accion: { grupo: g.id, jugada: input.jugada, motivo: input.motivo }, texto: `aceptada: se repite ${input.jugada} (de ${g.jugadas.map(j => j.id).join(', ')}).` };
  }

  v_elegir_mvp(input, ctx) {
    if (!ctx.final) return { ok: false, motivo: 'el MVP se elige al acabar la partida.' };
    const quien = buscarCampeon(ctx.jugadores, input.campeon);
    if (!quien) return { ok: false, motivo: `no hay ningún campeón «${input.campeon}» en la partida. Usa uno de: ${(ctx.jugadores || []).map(j => j.campeon).join(', ')}.` };
    const i = POSICIONES[String(quien.posicion || '').toUpperCase()];
    // «azul-0»…«rojo-4»: como la pantalla final de la web marca el MVP (lado y puesto: top, jungla, medio, ADC, support)
    const clave = ['azul', 'rojo'].includes(quien.equipo) && i !== undefined ? `${quien.equipo}-${i}` : null;
    return { ok: true, accion: { campeon: quien.campeon, jugador: quien.jugador, equipo: quien.equipo || null, clave, motivo: input.motivo }, texto: `aceptada: MVP ${quien.campeon} (${quien.jugador}).` };
  }

  v_resumen_final(input, ctx) {
    if (!ctx.final) return { ok: false, motivo: 'el resumen final se escribe al acabar la partida.' };
    const titular = input.titular.trim(), resumen = input.resumen.trim();
    if (!resumen) return { ok: false, motivo: 'el resumen está vacío.' };
    if (titular.length > 90) return { ok: false, motivo: `el titular es demasiado largo (${titular.length} caracteres; como mucho 70).` };
    const ids = (ctx.candidatas || []).map(j => j.id);
    const destacadas = [...new Set(input.destacadas)].filter(id => ids.includes(id));
    const quitadas = input.destacadas.filter(id => !ids.includes(id));
    return {
      ok: true, accion: { titular: titular || null, resumen, destacadas: ids.length ? destacadas : null },
      texto: `aceptada: resumen final${ids.length ? ` con ${destacadas.length} destacadas` : ''}${quitadas.length ? ` (se quitan ${quitadas.join(', ')}: no son candidatas)` : ''}.`,
    };
  }
}
