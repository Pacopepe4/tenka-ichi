// Partida en directo para el overlay de partida (/ingame/).
// El puente que corre en el PC donde se mira la partida lee la Live Client Data API del cliente
// de LoL (https://127.0.0.1:2999/liveclientdata/…) y la manda aquí cada segundo. Con eso se monta
// el marcador: asesinatos, oro, torres, dragones, larvas, heraldo, barón, inhibidores y temporizadores.
// La API no da el oro sin gastar de cada jugador, así que el oro de cada equipo es el valor de sus objetos.
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

// Tiempos de los objetivos, en segundos de partida. Cambian con los parches: se ajustan aquí.
export const REGLAS = {
  primerDragon: 300, reaparicionDragon: 300, reaparicionAncestral: 360,
  duracionBaron: 180, duracionAncestral: 150, reaparicionBaron: 360, reaparicionInhibidor: 300,
};

const LADO = { ORDER: 'azul', CHAOS: 'rojo' };
const OTRO = { azul: 'rojo', rojo: 'azul' };
const DRAGON = { Fire: 'infernal', Water: 'oceano', Earth: 'montana', Air: 'nube', Hextech: 'hextech', Chemtech: 'quimtech', Elder: 'ancestral' };
const SIN_DATOS_MS = 10000;  // sin datos del puente durante 10 s, la partida se da por parada

const vacia = () => ({ tiempo: 0, recibido: 0, velocidad: 1, prueba: false, sinPartida: true, jugadores: [], eventos: new Map() });
let bruto = vacia();

// Llega un paquete del puente: { juego: gamestats, jugadores: playerlist, eventos: [...] } o { sinPartida: true }
export function recibir(cuerpo, { prueba = false } = {}) {
  if (!cuerpo || cuerpo.sinPartida) {
    Object.assign(bruto, { sinPartida: true, recibido: Date.now() });
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
  const reenviar = Number.isInteger(desde) && desde > 0 && !bruto.eventos.has(desde - 1);
  // El puente manda la respuesta de eventdata tal cual ({ Events: [...] }); la prueba, la lista
  for (const ev of cuerpo.eventos || cuerpo.eventosData?.Events || []) if (ev && Number.isInteger(ev.EventID)) bruto.eventos.set(ev.EventID, ev);
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
const nombreJugador = j => j.riotIdGameName || String(j.riotId || j.summonerName || '').split('#')[0];

// Estructuras: Turret_T1_…/Barracks_T1_… son del lado azul (ORDER) y T2 del rojo (CHAOS)
const duenoEstructura = nombre => (/_T1_|_T1L|_T100/.test(nombre) ? 'azul' : /_T2_|_T2L|_T200/.test(nombre) ? 'rojo' : null);
const carril = nombre => (/_L\d?|_L_/.test(nombre) ? 'top' : /_R\d?|_R_/.test(nombre) ? 'bot' : 'mid');

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
  for (const j of bruto.jugadores) {
    const lado = LADO[j.team];
    if (!lado) continue;
    const s = j.scores || {};
    jugadores[lado].push({ campeon: idCampeon(j), nombre: nombreJugador(j), nivel: j.level || 1,
      k: s.kills || 0, d: s.deaths || 0, a: s.assists || 0, cs: s.creepScore || 0, oro: oroObjetos(j.items),
      muerto: Boolean(j.isDead), reaparece: Math.round(j.respawnTimer || 0), objetos: (j.items || []).map(o => o.itemID) });
  }

  const base = () => ({ kills: 0, oro: 0, torres: 0, inhibidores: 0, dragones: [], alma: null, ancestrales: 0, larvas: 0, heraldos: 0, barones: 0, atakhan: 0 });
  const eq = { azul: base(), rojo: base() };
  for (const lado of ['azul', 'rojo']) {
    eq[lado].kills = jugadores[lado].reduce((s, j) => s + j.k, 0);
    eq[lado].oro = jugadores[lado].reduce((s, j) => s + j.oro, 0);
  }

  const t = bruto.tiempo;
  const buffs = [], avisos = [], caidos = new Map(), desconocidos = new Set();
  let ultimoDragon = null, ultimoBaron = null, terminada = false;
  const eventos = [...bruto.eventos.values()].sort((a, b) => a.EventTime - b.EventTime || a.EventID - b.EventID);
  for (const ev of eventos) {
    const aviso = (tipo, lado, extra = {}) => avisos.push({ id: ev.EventID, tipo, lado, t: ev.EventTime, robado: ev.Stolen === 'True' || ev.Stolen === true, ...extra });
    switch (ev.EventName) {
      case 'TurretKilled': {
        const dueno = duenoEstructura(ev.TurretKilled || '');
        const quien = dueno ? OTRO[dueno] : ladoDelEvento(ev);
        if (quien) eq[quien].torres++;
        break;
      }
      case 'InhibKilled': {
        const dueno = duenoEstructura(ev.InhibKilled || '') || OTRO[ladoDelEvento(ev)];
        if (!dueno) break;
        eq[OTRO[dueno]].inhibidores++;
        caidos.set(ev.InhibKilled, { lado: dueno, carril: carril(ev.InhibKilled || ''), vuelve: ev.EventTime + REGLAS.reaparicionInhibidor });
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
          buffs.push({ tipo: 'ancestral', lado: quien, hasta: ev.EventTime + REGLAS.duracionAncestral });
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
        buffs.push({ tipo: 'baron', lado: quien, hasta: ev.EventTime + REGLAS.duracionBaron });
        aviso('baron', quien);
        break;
      }
      case 'HeraldKill': {
        const quien = ladoDelEvento(ev);
        if (quien) { eq[quien].heraldos++; aviso('heraldo', quien); }
        break;
      }
      case 'GameEnd': terminada = true; break;
      case 'ChampionKill': case 'Multikill': case 'Ace': case 'FirstBlood': case 'FirstBrick': case 'GameStart':
      case 'MinionsSpawning': case 'InhibRespawningSoon':
        break;
      default: {
        // Objetivos que la API ha ido añadiendo con nombres propios: larvas del vacío y Atakhan
        const quien = ladoDelEvento(ev);
        if (/horde|grub|voidgrub/i.test(ev.EventName)) { if (quien) eq[quien].larvas++; }
        else if (/atakhan/i.test(ev.EventName)) { if (quien) { eq[quien].atakhan++; aviso('atakhan', quien); } }
        else desconocidos.add(ev.EventName);
      }
    }
  }

  const conAlma = eq.azul.alma || eq.rojo.alma;
  let proximoDragon;
  if (!ultimoDragon) proximoDragon = { t: REGLAS.primerDragon, ancestral: false };
  else if (ultimoDragon.tipo === 'ancestral' || conAlma) proximoDragon = { t: ultimoDragon.t + REGLAS.reaparicionAncestral, ancestral: true };
  else proximoDragon = { t: ultimoDragon.t + REGLAS.reaparicionDragon, ancestral: false };

  return {
    activo: !bruto.sinPartida && Date.now() - bruto.recibido < SIN_DATOS_MS,
    puente: Date.now() - bruto.recibido < SIN_DATOS_MS,
    sinPartida: bruto.sinPartida, prueba: bruto.prueba, terminada,
    tiempo: t, velocidad: bruto.velocidad, recibido: bruto.recibido,
    azul: eq.azul, rojo: eq.rojo, jugadores,
    buffs: buffs.filter(b => b.hasta > t),
    proximoDragon,
    proximoBaron: ultimoBaron != null ? ultimoBaron + REGLAS.reaparicionBaron : null,
    inhibidores: [...caidos.values()].filter(i => i.vuelve > t),
    avisos: avisos.filter(a => t - a.t < 10).slice(-3),
    eventosSinReconocer: [...desconocidos],
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
let temporizadorPrueba = null;

export function empezarPrueba({ picks, jugadores }, alPaquete) {
  pararPrueba();
  const velocidad = 6;
  const inicio = Date.now();
  const fases = OBJETOS_PRUEBA.map(fase => fase.filter(id => precios[id] != null));
  const objetoPara = s => { const f = fases[s < 480 ? 0 : s < 1080 ? 1 : 2]; return f.length ? f[Math.floor(Math.random() * f.length)] : null; };
  const jug = ['azul', 'rojo'].flatMap(lado => [0, 1, 2, 3, 4].map(i => ({
    lado, team: lado === 'azul' ? 'ORDER' : 'CHAOS',
    campeon: picks?.[lado]?.[i] || CAMPEONES_PRUEBA[lado][i],
    nombre: jugadores?.[lado]?.[i] || `${lado === 'azul' ? 'Azul' : 'Rojo'} ${i + 1}`,
    k: 0, d: 0, a: 0, cs: 0, nivel: 1, items: [],
  })));
  const eventos = [{ EventID: 0, EventName: 'GameStart', EventTime: 0 }];
  let id = 1, ultimo = 60;
  const suceso = (t, EventName, datos = {}) => eventos.push({ EventID: id++, EventName, EventTime: t, ...datos });
  const de = lado => jug.filter(j => j.lado === lado);
  const azar = lista => lista[Math.floor(Math.random() * lista.length)];
  // Guion de objetivos; los asesinatos, el farmeo y las compras van al azar
  const guion = [
    [300, 'DragonKill', 'azul', { DragonType: 'Fire' }], [390, 'HordeKill', 'rojo'], [400, 'HordeKill', 'rojo'], [410, 'HordeKill', 'azul'],
    [600, 'DragonKill', 'rojo', { DragonType: 'Water' }], [700, 'TurretKilled', 'azul', { TurretKilled: 'Turret_T2_R_03_A' }],
    [780, 'TurretKilled', 'rojo', { TurretKilled: 'Turret_T1_L_03_A' }], [900, 'DragonKill', 'azul', { DragonType: 'Hextech' }],
    [960, 'HeraldKill', 'azul'], [1010, 'TurretKilled', 'azul', { TurretKilled: 'Turret_T2_C_05_A' }],
    [1200, 'DragonKill', 'azul', { DragonType: 'Hextech' }], [1260, 'TurretKilled', 'rojo', { TurretKilled: 'Turret_T1_R_03_A' }],
    [1380, 'BaronKill', 'rojo'], [1450, 'TurretKilled', 'rojo', { TurretKilled: 'Turret_T1_R_02_A' }],
    [1500, 'DragonKill', 'azul', { DragonType: 'Hextech' }], [1560, 'InhibKilled', 'rojo', { InhibKilled: 'Barracks_T1_R1' }],
    [1860, 'DragonKill', 'azul', { DragonType: 'Elder' }],
  ];
  temporizadorPrueba = setInterval(() => {
    const t = 60 + (Date.now() - inicio) / 1000 * velocidad;
    if (t > 2100) return empezarPrueba({ picks, jugadores }, alPaquete);  // vuelve a empezar
    // Cada segundo de partida se simula una sola vez: «ultimo» es el primero que falta
    let s = ultimo;
    for (; s < t; s++) {
      for (const j of jug) {
        if (Math.random() < 0.12) j.cs++;
        j.nivel = Math.min(18, 1 + Math.floor(s / 105));
        // Una compra cada 100 s; con el inventario lleno, un componente pasa a objeto completo
        if (s % 100 === 0) {
          const id = objetoPara(s);
          if (id && j.items.length < 6) j.items.push({ itemID: Number(id), count: 1 });
          else if (id && s >= 1080) j.items[Math.floor(Math.random() * 6)] = { itemID: Number(id), count: 1 };
        }
      }
      if (Math.random() < 0.012) {
        const lado = Math.random() < 0.52 ? 'azul' : 'rojo';
        const asesino = azar(de(lado)), victima = azar(de(OTRO[lado]));
        asesino.k++; victima.d++;
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
        riotIdGameName: j.nombre, summonerName: j.nombre, team: j.team, level: j.nivel, isDead: false, respawnTimer: 0,
        items: j.items, scores: { kills: j.k, deaths: j.d, assists: j.a, creepScore: j.cs, wardScore: 0 } })),
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
