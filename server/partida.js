// Partida en directo para el overlay de partida (/ingame/).
// El puente que corre en el PC donde se mira la partida lee la Live Client Data API del cliente
// de LoL (https://127.0.0.1:2999/liveclientdata/…) y la manda aquí cada segundo. Con eso se monta
// el marcador (asesinatos, oro, torres, dragones, larvas, heraldo, barón e inhibidores), los
// temporizadores de los objetivos y el marcador línea por línea.
// La API no da el oro sin gastar de cada jugador, así que el oro es el valor de los objetos.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let precios = {};            // id de objeto → oro total (Data Dragon)
let idsCampeon = new Set();  // ids de Data Dragon, para reconocer los campeones

export async function cargarPartida() {
  try {
    const { objetos } = JSON.parse(await readFile(path.join(RAIZ, 'public', 'ddragon', 'objetos.json'), 'utf8'));
    precios = Object.fromEntries(Object.entries(objetos).map(([id, o]) => [id, o.oro]));
  } catch (e) { console.error('Precios de objetos:', e.message); }
  try {
    const { campeones } = JSON.parse(await readFile(path.join(RAIZ, 'public', 'ddragon', 'campeones.json'), 'utf8'));
    idsCampeon = new Set(campeones.map(c => c.id));
  } catch (e) { console.error('Campeones:', e.message); }
}

// Tiempos de los objetivos en segundos de partida (temporada 2026, parche 26.1: sin Atakhan y con el
// Barón otra vez a los 20:00). Cambian con los parches: se ajustan aquí.
export const REGLAS = {
  primerDragon: 300, reaparicionDragon: 300, reaparicionAncestral: 360, duracionAncestral: 150,
  primerBaron: 1200, reaparicionBaron: 360, duracionBaron: 180,
  // Larvas del vacío: un grupo de 3 a las 6:00. Si cae entero antes de las 9:45, sale otro grupo
  // 4 minutos después; a las 14:45 se van
  larvas: 360, larvasPorGrupo: 3, segundoGrupoAntesDe: 585, reaparicionLarvas: 240, finLarvas: 885,
  // Heraldo de la Grieta: de las 15:00 a las 19:45
  heraldo: 900, finHeraldo: 1185,
  reaparicionInhibidor: 300,
};

const LADO = { ORDER: 'azul', CHAOS: 'rojo' };
const OTRO = { azul: 'rojo', rojo: 'azul' };
const DRAGON = { Fire: 'infernal', Water: 'oceano', Earth: 'montana', Air: 'nube', Hextech: 'hextech', Chemtech: 'quimtech', Elder: 'ancestral' };
const ROLES = ['TOP', 'JUNGLA', 'MEDIO', 'ADC', 'SUPPORT'];
const POSICION = { TOP: 0, JUNGLE: 1, MIDDLE: 2, MID: 2, BOTTOM: 3, BOT: 3, UTILITY: 4, SUPPORT: 4 };
const SIN_DATOS_MS = 10000;      // sin latidos del puente durante 10 s, el puente se da por cerrado
const GRACIA_PARTIDA_MS = 20000; // sin datos de la partida durante 20 s, se da por parada: un corte corto no quita el marcador

// Cada partida lleva un número: así el servidor sabe si la que ha terminado es la misma de antes
let numeroPartida = 0;
const vacia = () => ({ numero: ++numeroPartida, tiempo: 0, recibido: 0, velocidad: 1, prueba: false, sinPartida: true, jugadores: [],
  eventos: new Map(), ids: new Set(), firmas: new Set(), llegada: new Map() });

// Algunos sucesos llegan repetidos con otro número (al volver atrás en una repetición): se reconocen por
// qué pasó, cuándo y a quién. Las larvas no, porque pueden caer dos a la vez del mismo golpe.
const UNICOS = new Set(['ChampionKill', 'DragonKill', 'BaronKill', 'HeraldKill', 'TurretKilled', 'InhibKilled', 'GameEnd', 'FirstBlood']);
const firma = ev => (UNICOS.has(ev.EventName)
  ? `${ev.EventName}|${Math.round(Number(ev.EventTime))}|${ev.KillerName || ''}|${ev.VictimName || ev.DragonType || ev.TurretKilled || ev.InhibKilled || ev.Recipient || ''}`
  : null);
let bruto = vacia();

// Último latido del puente, haya partida o no: su versión y si está en espera, buscando o en partida
let puente = { visto: 0, version: 0, estado: 'espera' };

// Del panel: nombres de los jugadores por rol y picks del draft, para saber quién juega cada línea
let contexto = { nombres: { azul: [], rojo: [] }, picks: { azul: [], rojo: [] } };
export function ponerContexto(c) { contexto = c; }

// Llega un paquete del puente: { juego: gamestats, jugadores: playerlist, eventosData: { Events }, desde, version }
// o un latido sin partida: { sinPartida: true, espera: true si nadie le ha pedido buscar, version }
export function recibir(cuerpo, { prueba = false } = {}) {
  if (!prueba) {
    puente = { visto: Date.now(), version: Number(cuerpo?.version) || 1,
      estado: cuerpo?.espera ? 'espera' : cuerpo?.sinPartida ? 'buscando' : 'partida' };
  }
  if (!cuerpo || cuerpo.sinPartida) {
    // Si el panel ha parado la búsqueda, el marcador se retira ya. Si solo es que el cliente no contesta
    // (cargando, un salto en una repetición), sigue con lo último que llegó hasta que pasen 20 s.
    // Un latido del puente tampoco para la partida de prueba.
    if (!bruto.prueba && cuerpo?.espera) bruto.sinPartida = true;
    return resumen();
  }
  const tiempo = Number(cuerpo.juego?.gameTime) || 0;
  // Partida nueva: el reloj vuelve atrás, o se pasa de la prueba a una real
  if (tiempo + 5 < bruto.tiempo || bruto.prueba !== prueba) bruto = vacia();
  Object.assign(bruto, { tiempo, recibido: Date.now(), velocidad: Number(cuerpo.velocidad) || 1, prueba, sinPartida: false });
  if (Array.isArray(cuerpo.jugadores) && cuerpo.jugadores.length) bruto.jugadores = cuerpo.jugadores;
  // El puente solo manda los eventos nuevos («desde» es el primero que ha pedido). Si aquí falta el
  // anterior (la web se ha reiniciado a mitad de partida), se le pide que los mande todos otra vez.
  const desde = Number(cuerpo.desde);
  const reenviar = Number.isInteger(desde) && desde > 0 && !bruto.ids.has(desde - 1);
  // El puente manda la respuesta de eventdata tal cual ({ Events: [...] }); la prueba, la lista
  for (const ev of cuerpo.eventos || cuerpo.eventosData?.Events || []) {
    if (!ev || !Number.isInteger(ev.EventID)) continue;
    if (bruto.eventos.has(ev.EventID)) { bruto.eventos.set(ev.EventID, ev); continue; }  // ya lo teníamos
    if (bruto.ids.has(ev.EventID)) continue;  // ya llegó y se descartó por repetido
    bruto.ids.add(ev.EventID);
    const f = firma(ev);
    if (f && bruto.firmas.has(f)) continue;  // el mismo suceso repetido con otro número
    if (f) bruto.firmas.add(f);
    bruto.eventos.set(ev.EventID, ev);
    bruto.llegada.set(ev.EventID, Date.now());  // los avisos van por cuándo llega, no por el reloj de la partida
  }
  return { ...resumen(), reenviar };
}

export function olvidarPartida() { bruto = vacia(); return resumen(); }

// ---------- de los datos del cliente al marcador ----------
const idCampeon = j => {
  const crudo = String(j.rawChampionName || '').replace(/^game_character_displayname_/, '');
  if (idsCampeon.has(crudo)) return crudo;
  const limpio = String(j.championName || '').replace(/[^A-Za-z]/g, '');
  return [...idsCampeon].find(id => id.toLowerCase() === limpio.toLowerCase()) || crudo || limpio;
};
const oroObjetos = items => (items || []).reduce((s, o) => s + (precios[o.itemID] ?? o.price ?? 0) * (o.count || 1), 0);
// Inventario por huecos: 0-5 los objetos y 6 el abalorio, como en el juego
const porHuecos = items => {
  const huecos = Array(7).fill(null);
  for (const o of items || []) {
    const s = Number.isInteger(o.slot) && o.slot >= 0 && o.slot < 7 && huecos[o.slot] == null ? o.slot : huecos.indexOf(null);
    if (s >= 0) huecos[s] = o.itemID;
  }
  return huecos;
};
const nombreJugador = j => j.riotIdGameName || String(j.riotId || j.summonerName || '').split('#')[0];
const tieneAplastar = j => ['summonerSpellOne', 'summonerSpellTwo'].some(k =>
  /smite|aplastar/i.test(`${j.summonerSpells?.[k]?.rawDisplayName || ''} ${j.summonerSpells?.[k]?.displayName || ''}`));

// Estructuras: Turret_T1_…/Barracks_T1_… son del lado azul (ORDER) y T2 del rojo (CHAOS)
const duenoEstructura = nombre => (/_T1_|_T1L|_T100/.test(nombre) ? 'azul' : /_T2_|_T2L|_T200/.test(nombre) ? 'rojo' : null);
const carril = nombre => (/_L\d?|_L_/.test(nombre) ? 'top' : /_R\d?|_R_/.test(nombre) ? 'bot' : 'mid');
// Qué torre es: en top y bot, 03 exterior, 02 interior y 01 la del inhibidor; en medio, 05, 04 y 03, y 01-02 las del nexo
const torreDe = nombre => {
  const m = /_([LCR])_0?(\d)/.exec(nombre || '');
  if (!m) return {};
  const n = Number(m[2]);
  const nivel = m[1] === 'C' ? (n >= 5 ? 'exterior' : n === 4 ? 'interior' : n === 3 ? 'del inhibidor' : 'del nexo')
    : n >= 3 ? 'exterior' : n === 2 ? 'interior' : 'del inhibidor';
  return { carril: m[1] === 'L' ? 'top' : m[1] === 'R' ? 'bot' : 'mid', nivel };
};

// Quién juega cada línea. Por orden de confianza: el nombre del panel, el campeón del draft, la posición
// que da el cliente (en las personalizadas suele venir vacía), Aplastar para la jungla y, si no, el orden.
const normalizar = s => String(s || '').toLowerCase().split('#')[0].replace(/[\s_.-]/g, '');
function porLineas(lista, lado) {
  const asignado = Array(5).fill(null);
  const libres = new Set(lista.map((_, i) => i));
  const poner = (rol, i) => {
    if (rol == null || rol < 0 || rol > 4 || asignado[rol] != null || !libres.has(i)) return;
    asignado[rol] = i;
    libres.delete(i);
  };
  const nombres = (contexto.nombres?.[lado] || []).map(normalizar);
  lista.forEach((j, i) => { const n = normalizar(j.nombre); if (n) poner(nombres.indexOf(n), i); });
  const picks = contexto.picks?.[lado] || [];
  lista.forEach((j, i) => { if (j.campeon) poner(picks.indexOf(j.campeon), i); });
  lista.forEach((j, i) => poner(POSICION[String(j.posicion || '').toUpperCase()], i));
  lista.forEach((j, i) => { if (j.aplastar) poner(1, i); });
  for (const i of [...libres]) poner(asignado.indexOf(null), i);
  return asignado.map(i => (i == null ? null : lista[i]));
}

// ---------- recompensa aproximada por matar a cada jugador (shutdown) ----------
// El juego no se la da a los espectadores y, desde el parche 14.21, sale de todo el oro que gana cada
// uno (asesinatos, asistencias, súbditos y monstruos), que tampoco se ve. Se estima con las reglas de
// 26.03 a partir de lo que sí llega: los asesinatos en orden, los súbditos y el nivel. Es aproximada.
export const RECOMPENSAS = {
  oroPorSubdito: 22,       // media de oro de un súbdito o monstruo (no se sabe cuáles ha matado)
  porAsesinato: 3,         // 1 de recompensa por cada 3 de oro de asesinatos y asistencias
  porFarmeo: 20, porFarmeoNegativo: 7,  // 1 por cada 20 de súbditos y monstruos (7 si va en negativo)
  colchon: 100,            // los primeros 100 de recompensa no cuentan como shutdown
  alMorir: 3.5,            // al morir baja 1 por cada 3,5 de oro repartido
  minima: 50, maximaExtra: 700, primeraSangre: 100,
  // Pasadas las 6:00, si su equipo no va claramente por delante, el shutdown se reduce. La ventaja
  // se mide con el oro en objetos; los cortes son una estimación: [ventaja mínima, lo que queda]
  desdeReduccion: 360, reduccion: [[0.08, 1], [0.05, 0.7], [0.03, 0.4], [0.01, 0.1]],
};
const baseRecompensa = nivel => 300 + 10 * Math.max(0, Math.min(18, Math.round(nivel)) - 6);

function estimarRecompensas(jugadores, eventos, t, eq, jugadorPorNombre) {
  const R = RECOMPENSAS;
  const todos = [...jugadores.azul, ...jugadores.rojo];
  const lado = new Map([...jugadores.azul.map(j => [j, 'azul']), ...jugadores.rojo.map(j => [j, 'rojo'])]);
  const cuenta = new Map(todos.map(j => [j, { b: 0, cs: 0, k: 0, a: 0 }]));
  // Solo se sabe el nivel y los súbditos de ahora: a mitad de partida se suponen repartidos por igual
  const parte = tt => Math.min(1, tt / Math.max(1, t));
  const shutdown = c => Math.max(0, c.b - R.colchon);
  const farmear = tt => {
    for (const [j, c] of cuenta) {
      const cs = j.cs * parte(tt);
      if (cs > c.cs) { c.b += (cs - c.cs) * R.oroPorSubdito / (c.b < 0 ? R.porFarmeoNegativo : R.porFarmeo); c.cs = cs; }
    }
  };
  const jugadorDe = nombre => jugadorPorNombre.get(normalizar(nombre));
  let primeraSangre = true;
  for (const ev of eventos) {
    if (ev.EventName !== 'ChampionKill') continue;
    farmear(ev.EventTime);
    const victima = jugadorDe(ev.VictimName), asesino = jugadorDe(ev.KillerName);
    if (!victima) continue;
    const cv = cuenta.get(victima);
    const base = baseRecompensa(1 + (victima.nivel - 1) * parte(ev.EventTime));
    const valor = Math.max(R.minima, Math.min(base + R.maximaExtra, base + (cv.b >= 0 ? shutdown(cv) : cv.b)));
    let repartido = 0;
    if (asesino && asesino !== victima) {
      const oro = valor + (primeraSangre ? R.primeraSangre : 0);
      primeraSangre = false;
      cuenta.get(asesino).b += oro / R.porAsesinato;
      cuenta.get(asesino).k++;
      const ayudantes = (ev.Assisters || []).map(jugadorDe).filter(a => a && a !== asesino && a !== victima);
      const bolsa = ayudantes.length ? Math.min(valor / 2, base / 2) : 0;
      for (const a of ayudantes) { cuenta.get(a).b += bolsa / ayudantes.length / R.porAsesinato; cuenta.get(a).a++; }
      repartido = oro + bolsa;
    }
    // Si tenía shutdown, lo pierde entero; si no, baja según el oro que ha dado (sin bajar del mínimo)
    if (shutdown(cv) > 0) cv.b = 0;
    else cv.b = Math.max(R.minima - base, cv.b - repartido / R.alMorir);
  }
  // Asesinatos y asistencias de antes de entrar a mirar: solo se sabe que están en el KDA. A quien aún no
  // ha muerto le cuentan enteros (unos 300 de oro por asesinato y 100 por asistencia)
  for (const j of todos) {
    const c = cuenta.get(j);
    if (j.d === 0) c.b += (Math.max(0, j.k - c.k) * 300 + Math.max(0, j.a - c.a) * 100) / R.porAsesinato;
  }
  farmear(t);
  for (const j of todos) {
    const l = lado.get(j);
    const ventaja = (eq[l].oro - eq[OTRO[l]].oro) / Math.max(1, eq[l].oro + eq[OTRO[l]].oro);
    const queda = t < R.desdeReduccion ? 1 : (R.reduccion.find(([minimo]) => ventaja >= minimo)?.[1] ?? 0);
    const valor = Math.min(R.maximaExtra, shutdown(cuenta.get(j)) * queda);
    j.recompensa = Math.round(valor / 50) * 50;  // el juego también la enseña redondeada a 50
  }
}

export function resumen() {
  const porNombre = new Map();
  for (const j of bruto.jugadores) {
    for (const n of [j.summonerName, j.riotId, j.riotIdGameName, nombreJugador(j)]) if (n) porNombre.set(String(n).toLowerCase(), LADO[j.team]);
  }
  const ladoDe = nombre => {
    if (!nombre) return null;
    const n = String(nombre).toLowerCase();
    return porNombre.get(n) || porNombre.get(n.split('#')[0]) || duenoEstructura(String(nombre));
  };
  const ladoDelEvento = ev => ladoDe(ev.KillerName) || (ev.Assisters || []).map(ladoDe).find(Boolean) || null;

  const jugadores = { azul: [], rojo: [] };
  const jugadorPorNombre = new Map();  // nombre normalizado → jugador, para las rachas de asesinatos
  for (const j of bruto.jugadores) {
    const lado = LADO[j.team];
    if (!lado) continue;
    const s = j.scores || {};
    const jugador = { campeon: idCampeon(j), nombre: nombreJugador(j), nivel: j.level || 1,
      k: s.kills || 0, d: s.deaths || 0, a: s.assists || 0, cs: s.creepScore || 0, oro: oroObjetos(j.items),
      muerto: Boolean(j.isDead), reaparece: Math.round(j.respawnTimer || 0), objetos: porHuecos(j.items), racha: 0,
      posicion: j.position || '', aplastar: tieneAplastar(j) };
    jugadores[lado].push(jugador);
    for (const n of [j.summonerName, j.riotId, j.riotIdGameName, jugador.nombre]) if (n) jugadorPorNombre.set(normalizar(n), jugador);
  }
  const porRol = { azul: porLineas(jugadores.azul, 'azul'), rojo: porLineas(jugadores.rojo, 'rojo') };
  const lineas = ROLES.map((rol, i) => ({ rol, azul: porRol.azul[i], rojo: porRol.rojo[i] }));

  const base = () => ({ kills: 0, oro: 0, torres: 0, inhibidores: 0, dragones: [], alma: null, puntoDeAlma: false, ancestrales: 0,
    larvas: 0, heraldos: 0, barones: 0, atakhan: 0 });
  const eq = { azul: base(), rojo: base() };
  for (const lado of ['azul', 'rojo']) {
    eq[lado].kills = jugadores[lado].reduce((s, j) => s + j.k, 0);
    eq[lado].oro = jugadores[lado].reduce((s, j) => s + j.oro, 0);
  }

  const t = bruto.tiempo;
  const buffs = [], avisos = [], caidos = new Map(), desconocidos = new Set(), muertesLarvas = [];
  let ultimoDragon = null, ultimoBaron = null, heraldoMuerto = false, terminada = false;
  // Solo lo que ya ha pasado según el reloj: en una repetición, al volver atrás el cliente conserva
  // los sucesos que ya se habían visto más adelante
  const eventos = [...bruto.eventos.values()].filter(ev => !(Number(ev.EventTime) > t + 1))
    .sort((a, b) => a.EventTime - b.EventTime || a.EventID - b.EventID);
  const nombreDe = n => jugadorPorNombre.get(normalizar(n))?.nombre || String(n || '').split('#')[0];
  const recibidos = {};  // cuántos sucesos de cada tipo han llegado, para ver qué da el cliente
  for (const ev of eventos) {
    recibidos[ev.EventName] = (recibidos[ev.EventName] || 0) + 1;
    const aviso = (tipo, lado, extra = {}) => avisos.push({ id: ev.EventID, tipo, lado, t: ev.EventTime, robado: ev.Stolen === 'True' || ev.Stolen === true, ...extra });
    switch (ev.EventName) {
      case 'TurretKilled': {
        const dueno = duenoEstructura(ev.TurretKilled || '');
        const quien = dueno ? OTRO[dueno] : ladoDelEvento(ev);
        if (quien) { eq[quien].torres++; aviso('torre', quien, torreDe(ev.TurretKilled)); }
        break;
      }
      case 'InhibKilled': {
        const dueno = duenoEstructura(ev.InhibKilled || '') || OTRO[ladoDelEvento(ev)];
        if (!dueno) break;
        eq[OTRO[dueno]].inhibidores++;
        caidos.set(ev.InhibKilled, { lado: dueno, carril: carril(ev.InhibKilled || ''), desde: ev.EventTime, vuelve: ev.EventTime + REGLAS.reaparicionInhibidor });
        aviso('inhibidor', OTRO[dueno], { carril: carril(ev.InhibKilled || '') });
        break;
      }
      case 'InhibRespawned': caidos.delete(ev.InhibRespawned); break;
      case 'DragonKill': {
        const quien = ladoDelEvento(ev);
        const tipo = DRAGON[ev.DragonType] || 'dragon';
        ultimoDragon = { t: ev.EventTime, tipo };
        if (!quien) break;
        if (tipo === 'ancestral') {
          eq[quien].ancestrales++;
          buffs.push({ tipo: 'ancestral', lado: quien, desde: ev.EventTime, hasta: ev.EventTime + REGLAS.duracionAncestral });
        } else {
          eq[quien].dragones.push(tipo);
          if (eq[quien].dragones.length === 4) eq[quien].alma = tipo;
        }
        aviso('dragon', quien, { dragon: tipo });
        break;
      }
      case 'BaronKill': {
        const quien = ladoDelEvento(ev);
        ultimoBaron = ev.EventTime;
        if (!quien) break;
        eq[quien].barones++;
        buffs.push({ tipo: 'baron', lado: quien, desde: ev.EventTime, hasta: ev.EventTime + REGLAS.duracionBaron });
        aviso('baron', quien);
        break;
      }
      case 'HeraldKill': {
        heraldoMuerto = true;
        const quien = ladoDelEvento(ev);
        if (quien) { eq[quien].heraldos++; aviso('heraldo', quien); }
        break;
      }
      case 'GameEnd': terminada = true; break;
      case 'ChampionKill': {
        // Racha: asesinatos desde la última muerte (si lo mata una torre o un súbdito, también se corta)
        const asesino = jugadorPorNombre.get(normalizar(ev.KillerName)), victima = jugadorPorNombre.get(normalizar(ev.VictimName));
        if (asesino && asesino !== victima) asesino.racha++;
        if (victima) victima.racha = 0;
        break;
      }
      case 'FirstBlood': {
        const quien = ladoDe(ev.Recipient);
        if (quien) aviso('primera', quien, { jugador: nombreDe(ev.Recipient) });
        break;
      }
      case 'Multikill': {
        // Los dobles son muy frecuentes: se avisa de triple para arriba
        const quien = ladoDe(ev.KillerName), n = Number(ev.KillStreak);
        if (quien && n >= 3) aviso('multi', quien, { racha: n, jugador: nombreDe(ev.KillerName) });
        break;
      }
      case 'Ace': {
        const quien = LADO[ev.AcingTeam] || ladoDe(ev.Acer);
        if (quien) aviso('ace', quien);
        break;
      }
      case 'FirstBrick': case 'GameStart': case 'MinionsSpawning': case 'InhibRespawningSoon':
        break;
      default: {
        // Objetivos que la API ha ido añadiendo con nombres propios: larvas del vacío y Atakhan (hasta 2025)
        const quien = ladoDelEvento(ev);
        if (/horde|grub|voidgrub/i.test(ev.EventName)) { muertesLarvas.push(ev.EventTime); if (quien) { eq[quien].larvas++; aviso('larvas', quien); } }
        else if (/atakhan/i.test(ev.EventName)) { if (quien) { eq[quien].atakhan++; aviso('atakhan', quien); } }
        else desconocidos.add(ev.EventName);
      }
    }
  }

  const conAlma = eq.azul.alma || eq.rojo.alma;
  for (const lado of ['azul', 'rojo']) eq[lado].puntoDeAlma = !conAlma && eq[lado].dragones.length === 3;
  // Si se entró a mirar con la partida empezada, faltan los asesinatos de antes: el KDA del cliente
  // sí es completo. Quien no ha muerto aún lleva de racha todos sus asesinatos, y nadie más de los que tiene.
  for (const j of [...jugadores.azul, ...jugadores.rojo]) j.racha = j.d === 0 ? j.k : Math.min(j.racha, j.k);
  estimarRecompensas(jugadores, eventos, t, eq, jugadorPorNombre);

  // ¿Se tiene la partida desde el principio? Si se entró a mirar con ella empezada (o se saltó en una
  // repetición), el cliente solo da lo que pasa desde entonces: faltan asesinatos y objetivos de antes
  const killsVistas = eventos.filter(ev => ev.EventName === 'ChampionKill' && jugadorPorNombre.has(normalizar(ev.KillerName))).length;
  const killsTotales = [...jugadores.azul, ...jugadores.rojo].reduce((s, j) => s + j.k, 0);
  const historiaIncompleta = !eventos.some(ev => ev.EventName === 'GameStart') || killsVistas < killsTotales;

  // Temporizadores de los objetivos neutrales, en el orden en que salen en el overlay:
  // dragón, larvas o heraldo (lo que toque) y Barón. «desde» es cuando empezó la cuenta atrás.
  // Sin la historia completa, los que ya han podido caer sin que se sepa no salen hasta que caiga el siguiente.
  const objetivos = [];
  const dragon = !ultimoDragon ? { aparece: REGLAS.primerDragon, desde: 0, ancestral: false }
    : ultimoDragon.tipo === 'ancestral' || conAlma ? { aparece: ultimoDragon.t + REGLAS.reaparicionAncestral, desde: ultimoDragon.t, ancestral: true }
      : { aparece: ultimoDragon.t + REGLAS.reaparicionDragon, desde: ultimoDragon.t, ancestral: false };
  if (!(historiaIncompleta && !ultimoDragon && t >= REGLAS.primerDragon)) objetivos.push({ tipo: 'dragon', ...dragon });
  const g = REGLAS.larvasPorGrupo;
  let finLarvas = REGLAS.finLarvas;
  if (historiaIncompleta && t >= REGLAS.larvas) finLarvas = Math.min(t, REGLAS.finLarvas);
  else if (t < REGLAS.finLarvas) {
    const n = muertesLarvas.length;
    if (n < g) objetivos.push({ tipo: 'larvas', aparece: REGLAS.larvas, desde: 0, quedan: g - n });
    else if (n < 2 * g && muertesLarvas[g - 1] < REGLAS.segundoGrupoAntesDe) {
      const fin = muertesLarvas[g - 1];
      objetivos.push({ tipo: 'larvas', aparece: fin + REGLAS.reaparicionLarvas, desde: fin, quedan: 2 * g - n });
    } else finLarvas = muertesLarvas.at(-1);
  }
  if (!objetivos.some(o => o.tipo === 'larvas') && !heraldoMuerto && t < REGLAS.finHeraldo && !(historiaIncompleta && t >= REGLAS.heraldo)) {
    objetivos.push({ tipo: 'heraldo', aparece: REGLAS.heraldo, desde: Math.min(finLarvas, REGLAS.heraldo), hasta: REGLAS.finHeraldo });
  }
  const proximoBaron = ultimoBaron != null ? ultimoBaron + REGLAS.reaparicionBaron : REGLAS.primerBaron;
  if (!(historiaIncompleta && ultimoBaron == null && t >= REGLAS.primerBaron)) objetivos.push({ tipo: 'baron', aparece: proximoBaron, desde: ultimoBaron ?? 0 });

  const conectado = Date.now() - puente.visto < SIN_DATOS_MS;
  return {
    numero: bruto.numero,
    activo: !bruto.sinPartida && Date.now() - bruto.recibido < GRACIA_PARTIDA_MS,
    puente: { conectado, version: puente.version, estado: conectado ? puente.estado : null },
    sinPartida: bruto.sinPartida, prueba: bruto.prueba, terminada,
    tiempo: t, velocidad: bruto.velocidad, recibido: bruto.recibido,
    azul: eq.azul, rojo: eq.rojo, jugadores, lineas,
    objetivos, historiaIncompleta,
    buffs: buffs.filter(b => b.hasta > t),
    inhibidores: [...caidos.values()].filter(i => i.vuelve > t),
    // Avisos de lo que ha llegado en los últimos 8 s (reales: en una repetición acelerada el reloj corre más),
    // sin anunciar cosas de hace más de un minuto de partida (al saltar hacia delante llegan de golpe)
    avisos: avisos.filter(a => Date.now() - (bruto.llegada.get(a.id) || 0) < 8000 && t - a.t < 60).slice(-4),
    eventosSinReconocer: [...desconocidos], eventosRecibidos: recibidos,
    // Para los overlays abiertos con la versión anterior
    proximoDragon: { t: dragon.aparece, ancestral: dragon.ancestral }, proximoBaron,
  };
}

// ---------- modo de prueba: una partida inventada para montar el overlay en OBS sin jugar ----------
// Compras de la partida de prueba por fases: objetos iniciales, componentes y objetos completos
const OBJETOS_PRUEBA = [
  ['1055', '1056', '1054', '2055', '1001'],
  ['1036', '1037', '1058', '1026', '1028', '3006', '3047', '3020', '3111'],
  ['3031', '6672', '3153', '3071', '3089', '3157', '3072', '3036', '3026'],
];
const CAMPEONES_PRUEBA = { azul: ['Aatrox', 'LeeSin', 'Ahri', 'Jinx', 'Thresh'], rojo: ['Jax', 'Viego', 'Syndra', 'Kaisa', 'Nautilus'] };
const POSICIONES_PRUEBA = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
const FARMEO_PRUEBA = [0.125, 0.09, 0.13, 0.135, 0.02];  // súbditos por segundo según el rol
let temporizadorPrueba = null;

export function empezarPrueba({ picks, jugadores }, alPaquete) {
  pararPrueba();
  const velocidad = 6;
  const inicio = Date.now();
  const fases = OBJETOS_PRUEBA.map(fase => fase.filter(id => precios[id] != null));
  const objetoPara = s => { const f = fases[s < 480 ? 0 : s < 1080 ? 1 : 2]; return f.length ? f[Math.floor(Math.random() * f.length)] : null; };
  const jug = ['azul', 'rojo'].flatMap(lado => [0, 1, 2, 3, 4].map(i => ({
    lado, rol: i, team: lado === 'azul' ? 'ORDER' : 'CHAOS',
    campeon: picks?.[lado]?.[i] || CAMPEONES_PRUEBA[lado][i],
    nombre: jugadores?.[lado]?.[i] || `${lado === 'azul' ? 'Azul' : 'Rojo'} ${i + 1}`,
    k: 0, d: 0, a: 0, cs: 0, nivel: 1, items: [], muertoHasta: 0,
  })));
  const eventos = [{ EventID: 0, EventName: 'GameStart', EventTime: 0 }];
  let id = 1, ultimo = 60;
  const suceso = (t, EventName, datos = {}) => eventos.push({ EventID: id++, EventName, EventTime: t, ...datos });
  const de = lado => jug.filter(j => j.lado === lado);
  const azar = lista => lista[Math.floor(Math.random() * lista.length)];
  // Guion de objetivos con las reglas de 2026; los asesinatos, el farmeo y las compras van al azar
  const guion = [
    [300, 'DragonKill', 'azul', { DragonType: 'Fire' }],
    [400, 'HordeKill', 'rojo'], [405, 'HordeKill', 'rojo'], [410, 'HordeKill', 'azul'],
    [600, 'DragonKill', 'rojo', { DragonType: 'Water' }],
    [680, 'HordeKill', 'azul'], [690, 'HordeKill', 'azul'], [700, 'HordeKill', 'azul'],
    [700, 'TurretKilled', 'azul', { TurretKilled: 'Turret_T2_R_03_A' }], [780, 'TurretKilled', 'rojo', { TurretKilled: 'Turret_T1_L_03_A' }],
    [900, 'DragonKill', 'azul', { DragonType: 'Hextech' }], [960, 'HeraldKill', 'azul'],
    [1010, 'TurretKilled', 'azul', { TurretKilled: 'Turret_T2_C_05_A' }],
    [1200, 'DragonKill', 'azul', { DragonType: 'Hextech' }], [1260, 'TurretKilled', 'rojo', { TurretKilled: 'Turret_T1_R_03_A' }],
    [1290, 'BaronKill', 'rojo'], [1450, 'TurretKilled', 'rojo', { TurretKilled: 'Turret_T1_R_02_A' }],
    [1500, 'DragonKill', 'azul', { DragonType: 'Hextech' }], [1560, 'InhibKilled', 'rojo', { InhibKilled: 'Barracks_T1_R1' }],
    [1860, 'DragonKill', 'azul', { DragonType: 'Elder' }], [1900, 'BaronKill', 'azul'],
    [2060, 'GameEnd', 'azul', { Result: 'Win' }],
  ];
  temporizadorPrueba = setInterval(() => {
    const t = 60 + (Date.now() - inicio) / 1000 * velocidad;
    if (t > 2100) return empezarPrueba({ picks, jugadores }, alPaquete);  // vuelve a empezar
    // Cada segundo de partida se simula una sola vez: «ultimo» es el primero que falta
    let s = ultimo;
    for (; s < t; s++) {
      for (const j of jug) {
        if (Math.random() < FARMEO_PRUEBA[j.rol]) j.cs++;
        j.nivel = Math.min(18, 1 + Math.floor(s / 105));
        // Una compra cada 100 s; con el inventario lleno, un componente pasa a objeto completo
        if (s % 100 === 0) {
          const id = objetoPara(s);
          if (id && j.items.length < 6) j.items.push({ itemID: Number(id), count: 1 });
          else if (id && s >= 1080) j.items[Math.floor(Math.random() * 6)] = { itemID: Number(id), count: 1 };
        }
      }
      if (Math.random() < 0.016) {
        const lado = Math.random() < 0.52 ? 'azul' : 'rojo';
        // Cada lado tiene un jugador que mata más (el ADC azul y el medio rojo), para que se vean rachas
        const asesino = Math.random() < 0.45 ? de(lado)[lado === 'azul' ? 3 : 2] : azar(de(lado)), victima = azar(de(OTRO[lado]));
        asesino.k++; victima.d++;
        victima.muertoHasta = s + 8 + victima.nivel * 2;
        const ayudante = azar(de(lado)); if (ayudante !== asesino) ayudante.a++;
        suceso(s, 'ChampionKill', { KillerName: asesino.nombre, VictimName: victima.nombre, Assisters: [] });
      }
      for (const [cuando, nombre, lado, datos] of guion) {
        if (cuando >= s && cuando < s + 1) suceso(cuando, nombre, { KillerName: azar(de(lado)).nombre, Assisters: [], Stolen: 'False', ...datos });
      }
    }
    ultimo = s;
    alPaquete(recibir({
      velocidad,
      juego: { gameTime: t, gameMode: 'CLASSIC' },
      jugadores: jug.map(j => ({ championName: j.campeon, rawChampionName: `game_character_displayname_${j.campeon}`,
        riotIdGameName: j.nombre, summonerName: j.nombre, team: j.team, position: POSICIONES_PRUEBA[j.rol], level: j.nivel,
        isDead: j.muertoHasta > t, respawnTimer: Math.max(0, j.muertoHasta - t),
        summonerSpells: { summonerSpellOne: { rawDisplayName: `GeneratedTip_SummonerSpell_${j.rol === 1 ? 'SummonerSmite' : 'SummonerFlash'}_DisplayName` } },
        // Objetos en sus huecos y el abalorio en el 6 (el apoyo, con la lente)
        items: [...j.items.map((o, slot) => ({ ...o, slot })), { itemID: j.rol === 4 ? 3364 : 3340, count: 1, slot: 6 }],
        scores: { kills: j.k, deaths: j.d, assists: j.a, creepScore: j.cs, wardScore: 0 } })),
      eventos,
    }, { prueba: true }));
  }, 1000);
}

export function pararPrueba() {
  if (!temporizadorPrueba) return false;
  clearInterval(temporizadorPrueba);
  temporizadorPrueba = null;
  bruto = vacia();
  return true;
}

export const enPrueba = () => Boolean(temporizadorPrueba);
