// Cerebro: agrupa los sucesos en jugadas y decide qué sale en antena en cada momento.
// No sabe nada de redes ni de LoL: recibe sucesos con su segundo de partida y devuelve un guion de planos
// y unas acciones (repeticiones, ficha de un jugador en racha, gráfica de oro). Así se puede probar entero sin el juego.
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
    this.ultimaOro = -Infinity;
    // Rachas de asesinatos sin morir (para la ficha del jugador en racha)
    this.rachas = new Map();       // campeón → asesinatos seguidos sin morir
    this.hitos = [];               // { t, quien, racha }: alguien llega a una racha que merece ficha
    this.muertesVistas = new Set();
    this.ultimaFicha = new Map();  // campeón → segundo de su última ficha
    // Modo IA (opcional, pc1/ia.js). La cámara, las transiciones y cuándo cabe cada cosa siguen siendo reglas:
    // la IA solo elige qué sale en el overlay en un rato tranquilo y qué jugada se repite si coinciden varias.
    // Si no contesta a tiempo o falla, todo sigue como sin ella.
    this.usarIa = false;
    this.consejo = null;            // { tipo: oro|ficha|lineas, campeon, jugador, equipo, motivo, desde, hasta }
    this.eleccionesRep = new Map(); // grupo de jugadas → id de la elegida (null: sin respuesta, se repiten como siempre)
    this.gruposPedidos = new Map(); // grupo → segundo conocido en que empezó a esperar a la IA
    this.finPartida = null;         // segundo en que acabó (ya no llega nada más)
  }

  // Jugadas que se repetirían y acaban casi a la vez («grupoSegundos»): con la IA se repite solo la mejor.
  // Un grupo está cerrado cuando ya no le puede entrar ninguna jugada más.
  gruposRepeticion(conocidoHasta) {
    const g = this.r.repeticion.grupoSegundos ?? 30;
    const candidatas = this.jugadas.filter(j => j.repetir && !j.repeticion).sort((a, b) => a.fin - b.fin);
    const grupos = [];
    for (const j of candidatas) {
      const u = grupos.at(-1);
      if (u && j.fin - u[0].fin <= g) u.push(j);
      else grupos.push([j]);
    }
    return grupos.map(js => ({
      id: js.map(j => j.id).join('+'),
      jugadas: js,
      cerrado: this.finPartida !== null || conocidoHasta >= js[0].fin + g,
    }));
  }

  // Grupos que esperan a que la IA elija (los lee pc1/ia.js)
  gruposSinElegir() {
    return [...this.gruposPedidos.keys()].filter(id => !this.eleccionesRep.has(id))
      .map(id => ({ id, jugadas: id.split('+').map(x => this.jugadas.find(j => j.id === x)).filter(Boolean) }))
      .filter(g => g.jugadas.length >= 2);
  }

  elegirRepeticion(grupo, jugada) { this.eleccionesRep.set(grupo, jugada ?? null); }

  // Consejo de la IA para un hueco tranquilo en el segundo t (vale para un solo hueco)
  consejoPara(t) {
    const c = this.consejo;
    if (!c || c.usado || t < c.desde - 5 || t > c.hasta) return null;
    return c;
  }

  // Racha de cada campeón: suma al que mata y se pone a cero al que muere
  contarRacha(e) {
    if (e.id && this.muertesVistas.has(e.id)) return;
    if (e.id) this.muertesVistas.add(e.id);
    const f = this.r.overlay?.ficha;
    if (e.victima) this.rachas.set(e.victima.campeon, 0);
    if (!e.asesino || e.asesino.campeon === e.victima?.campeon) return;
    const n = (this.rachas.get(e.asesino.campeon) || 0) + 1;
    this.rachas.set(e.asesino.campeon, n);
    if (f && (f.rachas || [3, 5, 8]).includes(n)) this.hitos.push({ t: e.t, quien: e.asesino, racha: n });
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
    this.contarRacha(e);
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
    // Una muerte suelta (o una pelea pequeña) también puede repetirse, pero pidiendo más calma (ver planificarAcciones)
    else if (this.r.repeticion.sueltas?.activo) j.repetir = true;
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

  // Rato sin jugadas entre a y b (b null: abierto). En los primeros minutos (reglas.inicio.tramos) no se pone el
  // plano general sino un guion: bot a nivel 1, los junglas, bot otra vez, los dos junglas cuando sale el
  // cangrejo (3:30) y los junglas hasta el minuto 5. El jungla es el de la posición JUNGLE o el que lleva Castigo;
  // el de bot, el BOTTOM (antes el azul). Sin datos de los jugadores, plano general como siempre.
  rellenarInicio(a, b) {
    const ini = this.r.inicio;
    const fin = b === null ? Infinity : b;
    const planos = [];
    let t = a;
    const js = this.jugadores || [];
    if (ini?.activo !== false && Array.isArray(ini?.tramos) && js.length) {
      const persona = j => ({ jugador: j.jugador, campeon: j.campeon, equipo: j.equipo });
      const azulPrimero = (x, y) => (x.equipo === 'azul' ? 0 : 1) - (y.equipo === 'azul' ? 0 : 1);
      const bot = js.filter(j => /^(BOTTOM|ADC)$/i.test(j.posicion || '')).sort(azulPrimero).slice(0, 1).map(persona);
      const junglas = js.filter(j => /^JUNGLE$/i.test(j.posicion || '') || j.castigo).sort(azulPrimero).slice(0, 2).map(persona);
      for (const tr of ini.tramos) {
        if (tr.hasta <= t || tr.desde >= fin) continue;
        const quienes = tr.quien === 'bot' ? bot : junglas;
        if (!quienes.length) continue;
        const desde = Math.max(t, tr.desde);
        const hasta = Math.min(fin, tr.hasta);
        if (desde > t) planos.push({ inicio: t, fin: desde, tipo: 'general', objetivo: null, jugada: null });
        const cada = tr.cada || (tr.hasta - tr.desde);
        for (let s = desde; s < hasta - 1e-6;) {
          const n = Math.floor((s - tr.desde) / cada + 1e-9);
          const e = Math.min(hasta, tr.desde + (n + 1) * cada);
          planos.push({ inicio: s, fin: e, tipo: 'seguir', objetivo: quienes[n % quienes.length], jugada: null, guion: 'inicio' });
          s = e;
        }
        t = hasta;
      }
    }
    if (t < fin) planos.push(...this.rellenarCalma(t, b));
    return planos;
  }

  // Rato tranquilo pasado el inicio (10/11: «la cámara hace poco juego»): en vez de quedarse en plano general,
  // hilo conductor por los junglas y las líneas: un jungla, una línea, el otro jungla, la siguiente línea…
  // (top, mid, bot). La rueda va por el reloj de la partida, así el plan sale igual cada vez que se rehace.
  // Huecos cortos (menos de «minimo» s), fuera de horario o sin datos de los jugadores: plano general como antes.
  rellenarCalma(a, b) {
    const c = this.r.calma;
    const general = [{ inicio: a, fin: b, tipo: 'general', objetivo: null, jugada: null }];
    const js = this.jugadores || [];
    if (!c || c.activo === false || !js.length) return general;
    const fin = b === null ? Infinity : b;
    const desde = Math.max(a, c.desdeSegundo ?? 300);
    if (fin - desde < (c.minimo ?? 12)) return general;
    const persona = j => ({ jugador: j.jugador, campeon: j.campeon, equipo: j.equipo });
    const azulPrimero = (x, y) => (x.equipo === 'azul' ? 0 : 1) - (y.equipo === 'azul' ? 0 : 1);
    const junglas = js.filter(j => /^JUNGLE$/i.test(j.posicion || '') || j.castigo).sort(azulPrimero).slice(0, 2);
    if (!junglas.length) return general;
    const lineas = (c.lineas || ['TOP', 'MIDDLE', 'BOTTOM'])
      .map(p => js.filter(j => String(j.posicion || '').toUpperCase() === String(p).toUpperCase()).sort(azulPrimero));
    const tJ = c.jungla ?? 25, tL = c.linea ?? 15, periodo = tJ + tL;
    const planos = desde > a ? [{ inicio: a, fin: desde, tipo: 'general', objetivo: null, jugada: null }] : [];
    // Hueco sin final (aún no se sabe la próxima jugada): se rellena un buen rato; el guion se rehace al avanzar
    const hastaDonde = Math.min(fin, desde + (c.horizonte ?? 600));
    for (let s = desde; s < hastaDonde - 1e-6;) {
      const k = Math.floor(s / periodo + 1e-9);
      const dentro = s - k * periodo;
      const jungla = junglas[k % junglas.length];
      let quien, e;
      if (dentro < tJ) { quien = jungla; e = k * periodo + tJ; }
      else {
        const linea = lineas[k % lineas.length] || [];
        quien = linea.find(j => j.equipo === jungla.equipo) || linea[0] || jungla;
        e = (k + 1) * periodo;
      }
      e = Math.min(e, hastaDonde);
      const ultimo = planos.at(-1);
      // Trozos de menos de 4 s (al final del hueco) o el mismo jugador seguido: se alarga el anterior
      if (ultimo?.guion === 'calma' && (e - s < 4 || ultimo.objetivo.campeon === quien.campeon)) ultimo.fin = e;
      else planos.push({ inicio: s, fin: e, tipo: 'seguir', objetivo: persona(quien), jugada: null, guion: 'calma' });
      s = e;
    }
    if (b === null && planos.length) planos.at(-1).fin = null;
    return planos;
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
        planos.push(...this.rellenarInicio(t, proxima ? proxima.inicio : null));
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

  // ---------- acciones: repeticiones y lo que se cambia en el overlay (ficha en racha, gráfica de oro) ----------
  // Solo se decide lo que ya se puede saber: hace falta ver «calma» segundos después de cada momento
  planificarAcciones(desde, conocidoHasta) {
    const r = this.r;
    const nuevas = [];
    const ocupado = (a, b, minimo) => this.jugadas.some(j => this.prioridad(j) >= minimo && j.inicio < b && j.fin > a)
      || this.acciones.some(x => x.t < b && x.t + x.segundos > a);

    // Con la IA: se espera a que cada grupo se cierre y, si hay varias, a que diga cuál (como mucho «esperaIaSegundos»)
    const esperando = new Set();
    if (this.usarIa) {
      const espera = r.repeticion.esperaIaSegundos ?? 10;
      for (const g of this.gruposRepeticion(conocidoHasta)) {
        if (!g.cerrado) { for (const j of g.jugadas) esperando.add(j.id); continue; }
        if (g.jugadas.length < 2) continue;
        if (this.eleccionesRep.has(g.id)) {
          const elegida = this.eleccionesRep.get(g.id);
          if (elegida && g.jugadas.some(j => j.id === elegida)) {
            for (const j of g.jugadas) if (j.id !== elegida) j.repeticion = 'otra-elegida';
            g.jugadas.find(j => j.id === elegida).eleccionIa = true;
          }
          continue;
        }
        if (!this.gruposPedidos.has(g.id)) this.gruposPedidos.set(g.id, conocidoHasta);
        if (this.finPartida === null && conocidoHasta - this.gruposPedidos.get(g.id) < espera) for (const j of g.jugadas) esperando.add(j.id);
      }
    }

    for (const j of this.jugadas) {
      if (!j.repetir || j.repeticion || j.fin < desde || esperando.has(j.id)) continue;
      // Barón: no se repite el Barón, sino la pelea de antes, y solo si el otro equipo quedó entero muerto (ace)
      let hastaT = j.fin;
      if (j.objetivos.includes('BaronKill')) {
        const baron = j.eventos.find(x => x.nombre === 'BaronKill');
        const ace = j.eventos.find(x => x.nombre === 'Ace' && (!baron || x.t <= baron.t + 1));
        if (!ace) { j.repeticion = 'baron-sin-ace'; continue; }
        hastaT = ace.t + 1;
      }
      // Las jugadas pequeñas (una muerte suelta, una pelea de dos) piden más calma y no van pegadas a otra repetición
      const sueltas = r.repeticion.sueltas || {};
      const fuerte = j.muertes >= r.repeticion.minimoMuertes || j.eventos.some(e => r.repeticion.objetivos.includes(e.nombre))
        || j.eventos.some(e => e.nombre === 'Multikill' && (e.detalle?.racha || 0) >= 3) || j.eleccionIa;
      const calma = Math.max(fuerte ? r.repeticion.calmaNecesaria : (sueltas.calmaNecesaria ?? r.repeticion.calmaNecesaria), r.repeticion.segundos);
      const lejosDeOtra = t => fuerte || !this.acciones.some(a => a.tipo === 'repeticion' && Math.abs(a.t - t) < (sueltas.separacion ?? 0));
      for (let t = j.fin + 2; t <= j.fin + 60; t += 2) {
        if (t + calma > conocidoHasta) break;  // aún no se sabe
        if (!ocupado(t, t + calma, fuerte ? r.prioridades.objetivo : 0) && lejosDeOtra(t)) {
          const a = { id: `rep-${j.id}`, tipo: 'repeticion', t: red(t), segundos: r.repeticion.segundos, jugada: j.id, desdeT: red(j.inicio), hastaT: red(hastaT), ...(j.eleccionIa ? { ia: true } : {}) };
          j.repeticion = a.id;
          this.acciones.push(a);
          nuevas.push(a);
          break;
        }
      }
      if (!j.repeticion && j.fin + 60 + calma <= conocidoHasta) j.repeticion = 'sin-hueco';
    }

    // ---------- overlay de Gokudō ----------
    // De base siempre está el línea por línea (y el marcador de arriba): eso lo pone el ejecutor solo. Aquí se
    // deciden los ratos en que se cambia por otra cosa y luego se vuelve al línea por línea.
    const ov = r.overlay || {};

    // Ficha de un jugador en racha: poco después de su asesinato, en cuanto haya unos segundos sin nada
    const f = ov.ficha;
    if (f?.activo !== false && f) {
      // Una repetición aún por decidir va antes: la ficha espera a que tenga su sitio
      const repPendiente = this.jugadas.some(j => j.repetir && !j.repeticion && j.fin >= desde);
      for (const h of this.hitos) {
        if (h.hecho || repPendiente) continue;
        const ultima = this.ultimaFicha.get(h.quien.campeon) ?? -Infinity;
        if (h.t - ultima < (f.cadaSegundosComoMinimo ?? 120)) { h.hecho = 'reciente'; continue; }
        const ventana = (f.segundos ?? 10) + 2;
        for (let t = h.t + (f.retraso ?? 3); t <= h.t + (f.buscarSegundos ?? 45); t += 1) {
          if (t + ventana > conocidoHasta) break;  // aún no se sabe
          if (t < desde) continue;
          if (!ocupado(t, t + ventana, 1)) {
            const a = { id: `ficha-${h.quien.campeon}-${Math.round(h.t)}`, tipo: 'ficha', t: red(t + 1), segundos: f.segundos ?? 10,
              campeon: h.quien.campeon, jugador: h.quien.jugador || null, equipo: h.quien.equipo || null, racha: h.racha };
            h.hecho = a.id;
            this.ultimaFicha.set(h.quien.campeon, h.t);
            this.acciones.push(a);
            nuevas.push(a);
            break;
          }
        }
        if (!h.hecho && h.t + (f.buscarSegundos ?? 45) + ventana <= conocidoHasta) h.hecho = 'sin-hueco';
      }
    }

    // Gráfica de oro en los huecos largos sin nada
    const g = ov.oro;
    // Una repetición aún por decidir (o esperando a la IA) va antes: el rato tranquilo es suyo
    if (g && g.activo !== false && !this.jugadas.some(j => j.repetir && !j.repeticion && j.fin >= desde)) {
      // El rato tranquilo tiene que cubrir, como poco, todo lo que la gráfica está en pantalla
      const ventana = Math.max(g.calmaNecesaria ?? 35, 3 + (g.segundos ?? 15));
      for (let t = Math.max(desde, g.desdeSegundo ?? 480, this.ultimaOro + (g.cadaSegundosComoMinimo ?? 180)); t + ventana <= conocidoHasta; t += 5) {
        if (!ocupado(t, t + ventana, 1)) {
          // Con la IA, ella elige qué sale en este rato: la gráfica de oro, la ficha de alguien o dejar el línea por línea
          const c = this.usarIa ? this.consejoPara(t) : null;
          if (c) c.usado = true;
          let a;
          if (c?.tipo === 'lineas') a = null;
          else if (c?.tipo === 'ficha' && c.campeon) {
            a = { id: `ficha-ia-${c.campeon}-${Math.round(t)}`, tipo: 'ficha', t: red(t + 3), segundos: f?.segundos ?? 10,
              campeon: c.campeon, jugador: c.jugador || null, equipo: c.equipo || null, ia: true, motivo: c.motivo || null };
            this.ultimaFicha.set(c.campeon, t);
          } else {
            a = { id: `oro-${Math.round(t)}`, tipo: 'oro', t: red(t + 3), segundos: g.segundos ?? 15, ...(c ? { ia: true, motivo: c.motivo || null } : {}) };
          }
          this.ultimaOro = t;
          if (a) { this.acciones.push(a); nuevas.push(a); }
          if (c?.tipo === 'lineas') this.decisionesIa = [...(this.decisionesIa || []), { t: red(t), tipo: 'lineas', motivo: c.motivo || null }].slice(-20);
          t += g.cadaSegundosComoMinimo ?? 180;
        }
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
