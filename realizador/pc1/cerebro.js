// Cerebro: agrupa los sucesos en jugadas y decide qué sale en antena en cada momento.
// No sabe nada de redes ni de LoL: recibe sucesos con su segundo de partida y devuelve un guion de planos
// y unas acciones (repeticiones, línea por línea). Así se puede probar entero sin el juego.
//
// Con 2 minutos de margen, cuando la antena llega a un momento el cerebro ya sabe qué pasó después:
// la cámara llega antes de que empiece la pelea y una repetición solo se lanza si viene un rato tranquilo.

const OBJETIVOS = new Set(['DragonKill', 'BaronKill', 'HeraldKill', 'HordeKill', 'AtakhanKill', 'DragonSoul']);
const ESTRUCTURAS = new Set(['TurretKilled', 'InhibKilled']);
const ADORNOS = new Set(['Multikill', 'FirstBlood', 'Ace']);

export class Cerebro {
  constructor(reglas) {
    this.r = reglas;
    this.jugadas = [];
    this.acciones = [];
    this.siguiente = 1;
    this.ultimaLineas = -Infinity;
  }

  // ---------- sucesos → jugadas ----------
  agregar(e) {
    if (e.nombre === 'ChampionKill') return this.agregarMuerte(e);
    if (OBJETIVOS.has(e.nombre)) return this.agregarObjetivo(e);
    if (ESTRUCTURAS.has(e.nombre)) return this.agregarEstructura(e);
    if (ADORNOS.has(e.nombre)) return this.agregarAdorno(e);
    return null;  // GameStart, MinionsSpawning... no hacen jugada
  }

  // Jugada abierta en ese momento: la última que acabó hace menos de la ventana de pelea
  abierta(t, tipos) {
    for (let i = this.jugadas.length - 1; i >= 0; i--) {
      const j = this.jugadas[i];
      if (tipos && !tipos.includes(j.tipo)) continue;
      if (t >= j.primerT - this.r.ventanaPelea && t - j.ultimoT <= this.r.ventanaPelea) return j;
    }
    return null;
  }

  nueva(tipo, e, anticipacion) {
    const j = {
      id: `j${this.siguiente++}`,
      tipo,
      primerT: e.t,
      ultimoT: e.t,
      inicio: Math.max(0, e.t - anticipacion),
      fin: e.t + this.r.cola,
      eventos: [],
      muertes: 0,
      campeones: {},
      focos: [],      // { t, quien }: a quién sigue la cámara desde cada momento
      repetir: false,
      objetivos: [],
    };
    this.jugadas.push(j);
    return j;
  }

  sumar(j, e) {
    j.eventos.push({ id: e.id, nombre: e.nombre, t: e.t, asesino: e.asesino?.campeon || null, victima: e.victima?.campeon || null });
    j.ultimoT = Math.max(j.ultimoT, e.t);
    j.primerT = Math.min(j.primerT, e.t);
    j.fin = Math.max(j.fin, e.t + this.r.cola);
    for (const p of e.implicados || []) j.campeones[p.campeon] = { ...p, veces: (j.campeones[p.campeon]?.veces || 0) + 1 };
  }

  agregarMuerte(e) {
    let j = this.abierta(e.t, ['muerte', 'pelea', 'objetivo']);
    if (!j) {
      j = this.nueva('muerte', e, this.r.anticipacion);
      if (e.asesino) j.focos.push({ t: j.inicio, quien: e.asesino });
      else if (e.victima) j.focos.push({ t: j.inicio, quien: e.victima });
    }
    this.sumar(j, e);
    j.muertes++;
    if (j.tipo === 'muerte' && (j.muertes >= 2 || Object.keys(j.campeones).length >= 3)) j.tipo = 'pelea';
    // Si cae el campeón al que seguimos, la cámara pasa al implicado vivo que más ha participado
    const actual = j.focos.at(-1)?.quien;
    if (actual && e.victima && actual.campeon === e.victima.campeon) {
      const muertos = new Set(j.eventos.filter(x => x.victima).map(x => x.victima));
      const vivo = Object.values(j.campeones).filter(c => !muertos.has(c.campeon)).sort((a, b) => b.veces - a.veces)[0];
      if (vivo) j.focos.push({ t: e.t, quien: { jugador: vivo.jugador, campeon: vivo.campeon, equipo: vivo.equipo } });
    }
    if (j.muertes >= this.r.repeticion.minimoMuertes) j.repetir = true;
    return j;
  }

  agregarObjetivo(e) {
    // Un objetivo en mitad de una pelea forma parte de ella
    let j = this.abierta(e.t, ['pelea', 'muerte', 'objetivo']);
    if (j && j.tipo === 'muerte') j.tipo = 'pelea';
    if (!j) {
      j = this.nueva('objetivo', e, this.r.anticipacionObjetivo);
      if (e.asesino) j.focos.push({ t: j.inicio, quien: e.asesino });
    } else if (!j.focos.length && e.asesino) {
      j.focos.push({ t: j.inicio, quien: e.asesino });
    }
    this.sumar(j, e);
    j.objetivos.push(e.nombre);
    if (this.r.repeticion.objetivos.includes(e.nombre)) j.repetir = true;
    return j;
  }

  agregarEstructura(e) {
    const j0 = this.abierta(e.t, ['pelea', 'objetivo']);
    if (j0) { this.sumar(j0, e); return j0; }
    const j = this.nueva('estructura', e, this.r.anticipacion);
    // Una torre la puede tirar un súbdito: solo hay plano si la tira un campeón
    if (e.asesino) j.focos.push({ t: j.inicio, quien: e.asesino });
    this.sumar(j, e);
    return j;
  }

  agregarAdorno(e) {
    const j = this.abierta(e.t, ['muerte', 'pelea', 'objetivo']);
    if (!j) return null;
    this.sumar(j, e);
    if (e.nombre === 'Ace' && this.r.repeticion.objetivos.includes('Ace')) j.repetir = true;
    if (e.nombre === 'Multikill' && (e.detalle?.racha || 0) >= 3) j.repetir = true;
    return j;
  }

  prioridad(j) {
    const base = this.r.prioridades[j.tipo] || 1;
    return base + (j.objetivos.includes('BaronKill') ? 0.5 : 0) + Math.min(j.muertes, 5) * 0.05;
  }

  // ---------- jugadas → guion de planos ----------
  // Planos desde «desde» (segundo de partida). El último plano general queda abierto (fin null).
  // Cada plano lleva su zoom: «general» (plano general, lo más abierto), «abierto» (de base al seguir a
  // alguien, un poco más abierto que el del juego) y «cerca» (zoom in, solo justo después de una muerte o un
  // objetivo si en los siguientes segundos no pasa nada más). «conocidoHasta»: hasta qué segundo se sabe lo
  // que pasa; un zoom in no se decide sin haber visto la calma que viene después.
  planificar(desde, conocidoHasta = Infinity) {
    const base = this.planificarSinZoom(desde).map(p => ({ ...p, zoom: p.tipo === 'general' ? 'general' : 'abierto' }));
    return juntar(this.ponerCerca(base, conocidoHasta))
      .map(p => ({ ...p, id: `p${Math.round(p.inicio * 10)}-${p.jugada || 'g'}${p.zoom === 'cerca' ? 'c' : ''}`, inicio: red(p.inicio), fin: p.fin === null ? null : red(p.fin) }));
  }

  // Momentos de zoom in: una muerte o un objetivo hecho por un campeón, que se está emitiendo, y tras el que
  // no pasa nada en «calmaSegundos». Se acerca al autor «segundos» y vuelve al zoom de base.
  momentosCerca(conocidoHasta) {
    const c = this.r.cerca;
    if (!c || c.activo === false) return [];
    const todos = this.jugadas.flatMap(j => j.eventos.map(e => e.t)).sort((a, b) => a - b);
    const momentos = [];
    for (const j of this.jugadas) {
      for (const e of j.eventos) {
        if (!e.asesino || !(e.nombre === 'ChampionKill' || OBJETIVOS.has(e.nombre))) continue;
        if (e.t + c.calmaSegundos > conocidoHasta) continue;
        if (todos.some(t => t > e.t && t <= e.t + c.calmaSegundos)) continue;
        const quien = j.campeones[e.asesino];
        if (!quien) continue;
        momentos.push({ inicio: e.t + (c.retraso ?? 0.5), fin: e.t + (c.retraso ?? 0.5) + c.segundos, quien, jugada: j.id });
      }
    }
    return momentos;
  }

  ponerCerca(planos, conocidoHasta) {
    let r = planos;
    for (const m of this.momentosCerca(conocidoHasta)) {
      // Solo si en ese momento se está emitiendo esa jugada: un zoom in no salta a otra parte del mapa
      const enAntena = r.find(p => p.inicio <= m.inicio - 0.6 && (p.fin === null || p.fin > m.inicio - 0.6));
      if (!enAntena || enAntena.jugada !== m.jugada || enAntena.tipo !== 'seguir') continue;
      // Si en mitad del zoom empieza otra jugada (la cámara ya va hacia ella), el zoom in se acorta
      const otra = r.find(p => p.inicio > m.inicio && p.inicio < m.fin && p.jugada && p.jugada !== m.jugada);
      const fin = otra ? otra.inicio : m.fin;
      if (fin - m.inicio < 1.5) continue;
      const nuevo = { inicio: m.inicio, fin, tipo: 'seguir', objetivo: { jugador: m.quien.jugador, campeon: m.quien.campeon, equipo: m.quien.equipo }, jugada: m.jugada, zoom: 'cerca' };
      const fuera = [];
      for (const p of r) {
        const pf = p.fin === null ? Infinity : p.fin;
        if (pf <= nuevo.inicio || p.inicio >= nuevo.fin) { fuera.push(p); continue; }
        if (p.inicio < nuevo.inicio) fuera.push({ ...p, fin: nuevo.inicio });
        if (pf > nuevo.fin) fuera.push({ ...p, inicio: nuevo.fin });
      }
      fuera.push(nuevo);
      r = fuera.sort((a, b) => a.inicio - b.inicio);
    }
    return r;
  }

  planificarSinZoom(desde) {
    const r = this.r;
    const candidatas = this.jugadas
      .filter(j => j.focos.length && j.fin > desde)
      .sort((a, b) => a.inicio - b.inicio);
    const planos = [];
    let t = desde;
    let guarda = 0;
    while (guarda++ < 10000) {
      const activas = candidatas.filter(j => j.inicio <= t + 1e-6 && j.fin > t + 1e-6);
      if (!activas.length) {
        const proxima = candidatas.find(j => j.inicio > t);
        planos.push({ inicio: t, fin: proxima ? proxima.inicio : null, tipo: 'general', objetivo: null, jugada: null });
        if (!proxima) break;
        t = proxima.inicio;
        continue;
      }
      let j, hasta;
      const primera = [...activas].sort((a, b) => a.inicio - b.inicio || this.prioridad(b) - this.prioridad(a))[0];
      // Una torre o un inhibidor sí cede ante una muerte o una pelea
      if (r.quedarseConLaPrimera !== false && primera.tipo !== 'estructura') {
        // La cámara se queda con la jugada que empezó primero hasta que acaba: si dos cosas pasan a la vez,
        // no salta de una a otra. Al acabar, si la otra sigue, va a ella.
        activas.sort((a, b) => a.inicio - b.inicio || this.prioridad(b) - this.prioridad(a));
        j = activas[0];
        hasta = j.fin;
      } else {
        activas.sort((a, b) => this.prioridad(b) - this.prioridad(a) || a.inicio - b.inicio);
        j = activas[0];
        // Si algo más importante empieza antes de que este plano llegue al mínimo, se va ya a eso
        const inminente = candidatas
          .filter(o => o.inicio > t && o.inicio < t + r.planoMinimo && this.prioridad(o) > this.prioridad(j))
          .sort((a, b) => this.prioridad(b) - this.prioridad(a) || a.inicio - b.inicio)[0];
        if (inminente) j = inminente;
        hasta = j.fin;
        for (const o of candidatas) {
          if (o === j || this.prioridad(o) <= this.prioridad(j)) continue;
          if (o.inicio >= hasta || o.fin <= t) continue;
          hasta = Math.min(hasta, Math.max(o.inicio, t + r.planoMinimo));
        }
      }
      if (hasta <= t) hasta = t + r.planoMinimo;
      // Dentro de la jugada, un plano por cada cambio de foco, pero sin cambiar de seguido más a menudo
      // que «focoMinimo» segundos: así la cámara no da tumbos cuando caen varios seguidos
      const minimo = r.focoMinimo ?? 0;
      const focos = [];
      for (const f of j.focos) {
        const desdeF = focos.length ? Math.max(f.t, focos.at(-1).t + minimo) : f.t;
        if (desdeF >= hasta) break;
        if (focos.length && focos.at(-1).quien.campeon === f.quien.campeon) continue;
        if (focos.length && desdeF === focos.at(-1).t) focos[focos.length - 1] = { ...f, t: desdeF };
        else focos.push({ ...f, t: desdeF });
      }
      for (let i = 0; i < focos.length; i++) {
        const a = i === 0 ? t : Math.max(t, focos[i].t);
        const b = i + 1 < focos.length ? Math.max(a, focos[i + 1].t) : hasta;
        if (b - a <= 0.01) continue;
        planos.push({ inicio: a, fin: b, tipo: 'seguir', objetivo: focos[i].quien, jugada: j.id });
      }
      t = hasta;
    }
    return juntar(planos);
  }

  // ---------- acciones: repeticiones y línea por línea ----------
  // Solo se decide lo que ya se puede saber: hace falta ver «calma» segundos después de cada momento
  planificarAcciones(desde, conocidoHasta) {
    const r = this.r;
    const nuevas = [];
    const ocupado = (a, b, minimo) => this.jugadas.some(j => this.prioridad(j) >= minimo && j.inicio < b && j.fin > a)
      || this.acciones.some(x => x.t < b && x.t + x.segundos > a);

    for (const j of this.jugadas) {
      if (!j.repetir || j.repeticion || j.fin < desde) continue;
      // Barón: no se repite el Barón, sino la pelea de antes, y solo si el otro equipo quedó entero muerto (ace)
      let hastaT = j.fin;
      if (j.objetivos.includes('BaronKill')) {
        const baron = j.eventos.find(x => x.nombre === 'BaronKill');
        const ace = j.eventos.find(x => x.nombre === 'Ace' && (!baron || x.t <= baron.t + 1));
        if (!ace) { j.repeticion = 'baron-sin-ace'; continue; }
        hastaT = ace.t + 1;
      }
      const calma = Math.max(r.repeticion.calmaNecesaria, r.repeticion.segundos);
      for (let t = j.fin + 2; t <= j.fin + 60; t += 2) {
        if (t + calma > conocidoHasta) break;  // aún no se sabe
        if (!ocupado(t, t + calma, r.prioridades.objetivo)) {
          const a = { id: `rep-${j.id}`, tipo: 'repeticion', t: red(t), segundos: r.repeticion.segundos, jugada: j.id, desdeT: red(j.inicio), hastaT: red(hastaT) };
          j.repeticion = a.id;
          this.acciones.push(a);
          nuevas.push(a);
          break;
        }
      }
      if (!j.repeticion && j.fin + 60 + calma <= conocidoHasta) j.repeticion = 'sin-hueco';
    }

    const ll = r.lineaPorLinea;
    // El rato tranquilo tiene que cubrir, como poco, todo lo que el gráfico está en pantalla
    const ventana = Math.max(ll.calmaNecesaria, 3 + ll.segundos);
    for (let t = Math.max(desde, ll.desdeSegundo || 0, this.ultimaLineas + ll.cadaSegundosComoMinimo); t + ventana <= conocidoHasta; t += 5) {
      if (!ocupado(t, t + ventana, 1)) {
        const a = { id: `lineas-${Math.round(t)}`, tipo: 'lineas', t: red(t + 3), segundos: ll.segundos };
        this.ultimaLineas = t;
        this.acciones.push(a);
        nuevas.push(a);
        t += ll.cadaSegundosComoMinimo;
      }
    }
    return nuevas;
  }

  jugadasSinEmitir(desde) {
    return this.jugadas.filter(j => j.fin > desde);
  }
}

const red = x => Math.round(x * 100) / 100;

// Une planos seguidos que siguen a lo mismo
export function juntar(planos) {
  const r = [];
  for (const p of planos) {
    const u = r.at(-1);
    if (u && u.tipo === p.tipo && u.fin !== null && Math.abs(u.fin - p.inicio) < 0.01 && (u.zoom || null) === (p.zoom || null)
      && (u.objetivo?.campeon || null) === (p.objetivo?.campeon || null)) {
      u.fin = p.fin;
      if (u.jugada !== p.jugada) u.jugada = u.jugada || p.jugada;
    } else r.push({ ...p });
  }
  return r;
}
