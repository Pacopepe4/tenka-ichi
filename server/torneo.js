// Códigos de torneo de los partidos de Gokudō. Lo pidió Pacopepe el 15/11/2026: «tenemos que gestionar los códigos
// de torneo para todos los partidos».
//
// Cada partido de la temporada (los cruces del calendario y las series de playoffs) tiene su código:
//   - Con clave de Riot con la Tournament API (RIOT_TORNEO_KEY): un código de torneo de verdad. Los diez jugadores lo
//     meten en el cliente (Jugar → el trofeo de arriba a la derecha) y entran solos en la sala. Al acabar, Riot avisa
//     (callback a /api/torneo/riot) y con match-v5 se leen las estadísticas para el fantasy.
//   - Sin esa clave: una sala personalizada con nombre y contraseña, que crea el staff. Se reparte igual.
// RIOT_TORNEO_STUB=1 usa tournament-stub-v5 de Riot (para probar con una clave de desarrollo: sus códigos no valen en
// el cliente).
//
// El código nunca sale en abierto: no va en el estado que la web emite a todos (overlay, portada), solo en las
// respuestas a las acciones del panel (con su contraseña) y en un hilo privado de Discord con los capitanes de las dos
// familias (los Oyabun, o quien diga data-proyecto/capitanes.json). El staff ve los hilos privados por su permiso de
// gestionar hilos.
//
// Se guarda en el ajuste «codigos_torneo» (pestaña Ajustes de Google Sheets): proveedor y torneo de Riot, el código de
// cada partido, si se ha entregado y la partida de Riot que se jugó. Las estadísticas no se guardan aquí: se vuelven a
// pedir a Riot cuando el staff pulsa «Rellenar con Riot» y se guardan en el panel como las demás.
import crypto from 'node:crypto';
import { TEMPORADA } from './formato.js';
import { desdeMatchV5 } from './puntuacion.js';

export const AJUSTE = 'codigos_torneo';
const LETRAS = 'ACDEFGHJKLMNPQRTUVWXY34679';   // sin letras que se confundan al dictarlas (como los códigos de directo)
const RONDAS = { cuartos: 'Cuartos', semis: 'Semifinal', final: 'Final' };
// Como las llama el panel al guardar las estadísticas de una serie (server/competicion.js)
const RONDAS_FANTASY = { cuartos: 'Cuartos de final', semis: 'Semifinales', final: 'Final' };
const ROLES = ['TOP', 'JUNGLA', 'MEDIO', 'ADC', 'SUPPORT'];
const POSICION = { TOP: 0, JUNGLE: 1, MIDDLE: 2, BOTTOM: 3, UTILITY: 4 };
const HILO_PRIVADO = 12;

// ---------- Riot: tournament-v5 (o su stub) y match-v5 ----------
export class ErrorRiot extends Error {
  constructor(estado, ruta, detalle = '') {
    const porQue = {
      401: 'falta la clave o no vale',
      403: 'la clave no tiene acceso a esto (la Tournament API necesita una clave de producción aprobada por Riot)',
      404: 'no existe',
      429: 'demasiadas peticiones: espera un poco',
    }[estado] || `error ${estado}`;
    super(`Riot: ${porQue} (${ruta.split('?')[0]})${detalle ? `: ${detalle}` : ''}`);
    this.estado = estado;
  }
}

export function crearRiot({ clave, stub = false, pedir = fetch, region = 'EUW',
  hostTorneo = 'https://americas.api.riotgames.com', hostPartidas = 'https://europe.api.riotgames.com' } = {}) {
  const api = stub ? 'tournament-stub' : 'tournament';
  async function llamar(metodo, host, ruta, cuerpo) {
    const r = await pedir(`${host}${ruta}`, {
      method: metodo,
      headers: { 'X-Riot-Token': clave, ...(cuerpo !== undefined && { 'Content-Type': 'application/json' }) },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new ErrorRiot(r.status, ruta, j?.status?.message || '');
    }
    return r.status === 204 ? null : r.json();
  }
  return {
    stub,
    // Una vez por clave: a dónde avisa Riot al acabar cada partida. Devuelve el id del proveedor
    proveedor: url => llamar('POST', hostTorneo, `/lol/${api}/v5/providers`, { region, url }),
    torneo: (nombre, providerId) => llamar('POST', hostTorneo, `/lol/${api}/v5/tournaments`, { name: nombre, providerId }),
    codigos: (tournamentId, count, parametros) =>
      llamar('POST', hostTorneo, `/lol/${api}/v5/codes?count=${count}&tournamentId=${tournamentId}`, parametros),
    // Las partidas jugadas con un código (por si el aviso de Riot no llega)
    partidasDeCodigo: codigo => llamar('GET', hostTorneo, `/lol/${api}/v5/games/by-code/${encodeURIComponent(codigo)}`),
    partida: id => llamar('GET', hostPartidas, `/lol/match/v5/matches/${encodeURIComponent(id)}`),
  };
}

// ---------- Los partidos de la temporada ----------
const sumarMinutos = (hora, minutos) => {
  const [h, m] = String(hora).split(':').map(Number);
  const t = h * 60 + m + minutos;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

// Cada cruce de la liguilla y cada partida posible de las series de playoffs (al mejor de tres: una por partida),
// con su día y su hora. «horario» cambia el día o la hora de alguno (lo pone el staff en el panel: el 15/11 se empezó a
// las 19:00 y Yasha–Byakko pasó al 16/11).
export function partidosTemporada({ calendario = null, cuadro = null, temporada = TEMPORADA, horario = {}, nombreDe = id => id } = {}) {
  const lista = [];
  (calendario?.jornadas || []).forEach((cruces, j) => cruces.forEach((c, k) => lista.push({
    id: c.id, fase: 'liga', ronda: `Jornada ${j + 1}`, corto: `J${j + 1}`, jornada: j + 1,
    fantasy: { jornada: `Jornada ${j + 1}`, fase: 'Fase de liga', partida: 1 },
    fecha: temporada.liguilla[j], hora: sumarMinutos(temporada.hora, k * temporada.margenMinutos), azul: c.azul, rojo: c.rojo,
  })));
  for (const ronda of Object.keys(RONDAS)) {
    const series = cuadro ? [].concat(cuadro[ronda] || []) : [];
    series.forEach((s, k) => {
      if (!s?.alto || !s?.bajo) return;
      for (let n = 1; n <= 3; n++) lista.push({
        id: `${s.id}-${n}`, fase: 'playoffs', ronda: `${RONDAS[ronda]}${series.length > 1 ? ` ${k + 1}` : ''}, partida ${n}`,
        corto: `${s.id} P${n}`, fantasy: { jornada: s.ronda || RONDAS_FANTASY[ronda], fase: 'Fase final', partida: n }, fecha: temporada.playoffs[ronda], hora: sumarMinutos(temporada.hora, (k * 3 + n - 1) * temporada.margenMinutos),
        azul: s.partidas?.[n - 1]?.azul || s.alto, rojo: s.partidas?.[n - 1]?.rojo || s.bajo,
      });
    });
  }
  for (const p of lista) {
    const cambio = horario[p.id];
    if (cambio?.fecha) p.fecha = cambio.fecha;
    if (cambio?.hora) p.hora = cambio.hora;
    p.nombre = `${nombreDe(p.azul)} 対 ${nombreDe(p.rojo)}`;
  }
  return lista.sort((a, b) => `${a.fecha} ${a.hora}`.localeCompare(`${b.fecha} ${b.hora}`) || a.id.localeCompare(b.id));
}

// ---------- Las estadísticas de una partida de Riot, por familia ----------
const normalizar = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// De una partida de match-v5, las estadísticas de los cinco de cada familia en el orden de los roles (top, jungla,
// medio, tirador, apoyo). Los lados del lobby los eligen los jugadores: si los nombres de los de un equipo se parecen
// más a la plantilla de la otra familia, se dan la vuelta.
export function filasDePartida(partida, { azul, rojo }, jugadoresDe = () => []) {
  const ps = partida?.info?.participants || [];
  const equipo = id => {
    const del = ps.filter(p => p.teamId === id);
    const filas = Array(5).fill(null);
    const sinPuesto = [];
    for (const p of del) {
      const i = POSICION[p.teamPosition || p.individualPosition];
      if (i != null && !filas[i]) filas[i] = p; else sinPuesto.push(p);
    }
    for (let i = 0; i < 5; i++) if (!filas[i]) filas[i] = sinPuesto.shift() || null;
    return filas;
  };
  const e100 = equipo(100), e200 = equipo(200);
  const parecidos = (filas, clan) => {
    const nombres = jugadoresDe(clan).map(normalizar).filter(Boolean);
    return filas.filter(p => p && nombres.some(n => { const r = normalizar(p.riotIdGameName || p.summonerName); return r && (r.includes(n) || n.includes(r)); })).length;
  };
  const invertido = parecidos(e100, rojo) + parecidos(e200, azul) > parecidos(e100, azul) + parecidos(e200, rojo);
  const [deAzul, deRojo] = invertido ? [e200, e100] : [e100, e200];
  const stats = p => (p ? { ...desdeMatchV5(p), nombre: p.riotIdGameName || p.summonerName || '', campeon: p.championName || '' } : null);
  const gana = deAzul.some(p => p?.win) ? azul : deRojo.some(p => p?.win) ? rojo : null;
  return { porClan: { [azul]: deAzul.map(stats), [rojo]: deRojo.map(stats) }, ganador: gana, invertido,
    duracion: partida?.info?.gameDuration ?? null };
}

// ---------- Todo junto ----------
export function crearTorneo({
  claveRiot = process.env.RIOT_TORNEO_KEY || (process.env.RIOT_TORNEO_STUB ? process.env.RIOT_API_KEY : ''),
  stub = Boolean(process.env.RIOT_TORNEO_STUB),
  riot = null, pedirRiot = fetch,
  plataforma = process.env.RIOT_TORNEO_PLATAFORMA || 'EUW1',
  urlAvisos = `${process.env.TORNEO_URL_PUBLICA || process.env.RENDER_EXTERNAL_URL || 'https://gokudo.es'}/api/torneo/riot`,
  nombreTorneo = 'Gokudō 2026',
  parametros = { teamSize: 5, pickType: 'TOURNAMENT_DRAFT', mapType: 'SUMMONERS_RIFT', spectatorType: 'LOBBYONLY', enoughPlayers: false },
  secreto = process.env.SESION_SECRETO || 'secreto-solo-para-pruebas-en-local',
  leerAjuste, guardarAjuste,                  // (texto) ← y → el ajuste «codigos_torneo»
  partidos = () => [],                        // (horario) → partidosTemporada(...)
  clan = id => ({ id, nombre: id }),
  jugadoresDe = () => [],
  discord = null,                             // { pedir(metodo, ruta, cuerpo), guild, canal, rolJefes, rolFamilia(clan), capitanes(clan) }
  guardarEstadisticas = null,                 // (partida, filas) → puntos: el mismo guardado del panel (server/fantasy.js)
  reintentos = [0, 60_000, 180_000, 600_000], // tras el aviso de Riot: ya, al minuto, a los 3 y a los 10 minutos
  esperarAviso = false,                       // los tests esperan al primer intento
  azar = n => crypto.randomInt(n),
  ahora = () => new Date(),
  log = console,
} = {}) {
  const r = riot || (claveRiot ? crearRiot({ clave: claveRiot, stub, pedir: pedirRiot,
    ...(process.env.RIOT_TORNEO_HOST && { hostTorneo: process.env.RIOT_TORNEO_HOST }), ...(process.env.RIOT_PARTIDAS_HOST && { hostPartidas: process.env.RIOT_PARTIDAS_HOST }) }) : null);
  const huella = claveRiot ? crypto.createHash('sha256').update(`${stub ? 'stub:' : ''}${claveRiot}`).digest('hex').slice(0, 12) : null;
  const modo = () => (r ? (stub ? 'stub' : 'riot') : 'sala');

  let datos;
  const cargar = () => {
    if (datos) return datos;
    try { datos = JSON.parse(leerAjuste() || 'null'); } catch { datos = null; }
    datos ||= {};
    datos.partidos ||= {};
    datos.horario ||= {};
    return datos;
  };
  const guardar = () => guardarAjuste(JSON.stringify(datos));
  const lista = () => partidos(cargar().horario);
  const partido = id => {
    const p = lista().find(x => x.id === id);
    if (!p) throw new Error(`No hay ningún partido ${id} en el calendario`);
    return p;
  };
  const firma = id => crypto.createHmac('sha256', secreto).update(`torneo:${id}`).digest('base64url').slice(0, 16);
  const aleatorio = n => Array.from({ length: n }, () => LETRAS[azar(LETRAS.length)]).join('');

  // El proveedor y el torneo de Riot se registran una vez por clave (si cambia la clave, otra vez)
  async function torneoRiot() {
    const d = cargar();
    if (d.riot?.huella === huella && d.riot.torneo) return d.riot.torneo;
    const proveedor = await r.proveedor(urlAvisos);
    const torneo = await r.torneo(nombreTorneo, proveedor);
    d.riot = { huella, proveedor, torneo, url: urlAvisos, creado: ahora().toISOString(), stub };
    await guardar();
    return torneo;
  }

  // ---- generar ----
  async function generar(id, { otraVez = false } = {}) {
    const p = partido(id);
    const d = cargar();
    const antes = d.partidos[id];
    if (antes?.codigo && !otraVez) return antes;
    let nuevo;
    if (r) {
      const torneo = await torneoRiot();
      const meta = JSON.stringify({ p: id, f: firma(id) });
      const [codigo] = await r.codigos(torneo, 1, { ...parametros, metadata: meta });
      if (!codigo) throw new Error('Riot no ha dado ningún código');
      nuevo = { modo: modo(), codigo };
    } else {
      nuevo = { modo: 'sala', sala: `Gokudō ${p.corto} · ${clan(p.azul).nombre} vs ${clan(p.rojo).nombre}`.slice(0, 40), codigo: aleatorio(6) };
    }
    d.partidos[id] = { ...nuevo, creado: ahora().toISOString(), entregado: null, hilos: antes?.hilos || {}, ...(antes?.drafts && { drafts: antes.drafts }), partidaRiot: null, ganador: null };
    await guardar();
    return d.partidos[id];
  }

  // ---- drafts precreados ----
  // Lo pidió Pacopepe el 15/11/2026: «pon también los drafts precreados junto a los códigos de torneo». El staff crea
  // cada draft en DraftCore como siempre (aquí no se crean: DraftCore no tiene forma oficial y solo nos conectamos de
  // espectador) y pega sus tres enlaces junto al código: el del lado azul, el del rojo y el de espectador, que es el
  // que usa el panel. Cada capitán recibe solo el de su lado.
  const LADOS_DRAFT = ['azul', 'rojo', 'espectador'];
  const enlaceDraft = v => {
    const t = String(v || '').trim();
    if (!t) return null;
    if (t.length > 300 || !/^https:\/\/([a-z0-9-]+\.)*draftcore\.net\/\S+$/i.test(t)) throw new Error(`Eso no es un enlace de DraftCore: ${t.slice(0, 60)}`);
    return t;
  };
  function ponerDrafts(id, enlaces) {
    partido(id);
    const limpios = Object.fromEntries(LADOS_DRAFT.map(l => [l, enlaceDraft(enlaces[l])]));
    const c = cargar().partidos[id] ||= {};
    if (LADOS_DRAFT.some(l => limpios[l])) c.drafts = limpios; else delete c.drafts;
  }
  async function guardarDrafts(id, enlaces = {}) {
    ponerDrafts(id, enlaces);
    await guardar();
    return estado();
  }
  // Todos de golpe: una línea por partido, «J1-1 enlace-azul enlace-rojo enlace-espectador»
  async function pegarDrafts(texto) {
    const hechos = [], errores = [];
    for (const linea of String(texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)) {
      const [id, azul, rojo, espectador] = linea.split(/[\s|;,]+/);
      try { ponerDrafts(id, { azul, rojo, espectador }); hechos.push(id); } catch (e) { errores.push(`${id}: ${e.message}`); }
    }
    if (hechos.length) await guardar();
    return { hechos, errores, torneo: estado() };
  }

  // ---- códigos de fuera (Toornament) ----
  // Lo pidió Pacopepe el 15/11/2026 («rellénalas automáticas en el panel»): los códigos de torneo los da Toornament
  // (torneo privado «Gokudō · Temporada 1», un código por partido). Si un partido tiene uno, se usa ese en lugar de
  // la sala o del código de Riot propio. El resultado lo apunta Toornament: aquí no se puede leer con match-v5.
  const codigoExterno = v => {
    const t = String(v || '').trim();
    if (!/^[A-Z]{2,4}\d{0,2}[0-9A-Za-z]*-[0-9A-Za-z-]{8,80}$/.test(t)) throw new Error(`Eso no parece un código de torneo de LoL: ${t.slice(0, 40)}`);
    return t;
  };
  function ponerCodigoExterno(id, codigo) {
    partido(id);
    const limpio = codigoExterno(codigo);
    const d = cargar();
    const antes = d.partidos[id] || {};
    if (antes.codigo === limpio) return;
    d.partidos[id] = { modo: 'externo', codigo: limpio, creado: ahora().toISOString(), entregado: null, hilos: antes.hilos || {},
      ...(antes.drafts && { drafts: antes.drafts }), partidaRiot: null, ganador: null };
  }
  // Una línea por partido: «J1-1 EUW0…»
  async function pegarCodigos(texto) {
    const hechos = [], errores = [];
    for (const linea of String(texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)) {
      const [id, codigo] = linea.split(/[\s|;,]+/);
      try { ponerCodigoExterno(id, codigo); hechos.push(id); } catch (e) { errores.push(`${id}: ${e.message}`); }
    }
    if (hechos.length) await guardar();
    return { hechos, errores, torneo: estado() };
  }

  // ---- entregar por Discord ----
  // Un hilo privado por familia y partido, con su capitán: el código es el mismo para los dos, pero el enlace del draft
  // de un lado no lo tiene que ver el otro
  async function capitanesDe(c) {
    const fijos = (discord.capitanes?.(c) || []).map(String).filter(x => /^\d{5,25}$/.test(x));
    if (fijos.length) return { ids: fijos, de: 'lista' };
    const rolF = discord.rolFamilia(c);
    if (!rolF || !discord.rolJefes) return { ids: [], de: null };
    // Los Oyabun de la familia. Leer los miembros necesita el permiso «Server Members Intent» del bot
    discord.miembros ||= discord.pedir('GET', `/guilds/${discord.guild}/members?limit=1000`).catch(e => { discord.miembros = null; throw e; });
    try {
      const ms = await discord.miembros;
      return { ids: ms.filter(m => m.roles?.includes(rolF) && m.roles.includes(discord.rolJefes) && !m.user?.bot).map(m => m.user.id), de: 'oyabun' };
    } catch (e) {
      log.error('Códigos de torneo: no puedo leer los miembros del servidor:', e.message);
      return { ids: [], de: null, error: 'no puedo leer los miembros del servidor (activa «Server Members Intent» del bot o pon los capitanes en data-proyecto/capitanes.json)' };
    }
  }

  function mensaje(p, c, lado, menciones) {
    const cuando = `${p.fecha.split('-').reverse().join('/')} a las ${p.hora}`;
    const ladoTexto = lado === 'azul' ? 'el **lado azul** (equipo 1)' : 'el **lado rojo** (equipo 2)';
    const como = c.modo === 'sala'
      ? `**Sala personalizada** (la crea el staff):\n> Nombre: \`${c.sala}\`\n> Contraseña: \`${c.codigo}\`\n`
        + `En el cliente: **Jugar → Personalizada → Unirse**, buscad la sala por su nombre, meted la contraseña y poneos en ${ladoTexto}.`
      : `**Código de torneo:**\n\`\`\`\n${c.codigo}\n\`\`\``
        + `En el cliente: **Jugar → el trofeo de arriba a la derecha («Código de torneo»)**, pegad el código y poneos en ${ladoTexto}.`
        + (c.modo === 'stub' ? '\n-# ⚠️ Código de PRUEBA (tournament-stub): no vale en el cliente.' : '');
    const draft = c.drafts?.[lado]
      ? `\n\n**Vuestro draft (${lado === 'azul' ? 'lado azul' : 'lado rojo'}):** ${c.drafts[lado]}\nEs solo para el capitán: no lo pases al rival ni lo publiques.`
      : '';
    return {
      content: `${menciones.map(u => `<@${u}>`).join(' ')}`.trim() || undefined,
      embeds: [{
        color: 0xBE2A2F,
        title: `🎟️ ${p.ronda} · ${p.nombre}`,
        description: `${cuando}. Jugáis en ${ladoTexto}.\n\n${como}${draft}\n\nNo lo saquéis de este chat: el código y el draft no se publican en abierto. Si algo falla, escribid aquí y os ayuda el staff.`,
        footer: { text: '極道 · Gokudō' },
      }],
      allowed_mentions: { parse: [], users: menciones },
    };
  }

  async function entregar(id) {
    if (!discord?.pedir || !discord.canal) return { ok: false, error: 'Falta el bot de Discord (DISCORD_BOT_TOKEN y discord/ids.json con canal:tickets)' };
    const p = partido(id);
    const c = cargar().partidos[id]?.codigo ? cargar().partidos[id] : await generar(id);
    c.hilos ||= {};
    const caps = {};
    for (const lado of ['azul', 'rojo']) {
      const familia = p[lado];
      // El chat de su canal de voz privado, que solo ve esa familia (lo pidió Pacopepe el 15/11: «que SrDirector se lo
      // ponga por los chats de cada equipo»). Se nombra al rol de la familia; si no hay canal, va a un hilo privado
      const chat = discord.chatFamilia?.(familia);
      if (chat) {
        const rol = discord.rolFamilia(familia);
        const m = mensaje(p, c, lado, []);
        await discord.pedir('POST', `/channels/${chat}/messages`, { ...m, content: rol ? `<@&${rol}>` : undefined, allowed_mentions: { parse: [], roles: rol ? [rol] : [] } });
        caps[lado] = { ids: ['chat'], de: 'chat' };
        continue;
      }
      caps[lado] = await capitanesDe(familia);
      let hilo = c.hilos[lado];
      if (!hilo) {
        const h = await discord.pedir('POST', `/channels/${discord.canal}/threads`,
          { name: `🎟️・${p.corto} ${clan(p.azul).nombre} vs ${clan(p.rojo).nombre} · ${clan(familia).nombre}`.slice(0, 100), type: HILO_PRIVADO, invitable: false, auto_archive_duration: 1440 });
        hilo = c.hilos[lado] = h.id;
      }
      for (const u of caps[lado].ids) await discord.pedir('PUT', `/channels/${hilo}/thread-members/${u}`).catch(e => log.error('Códigos de torneo: no pude meter a', u, 'en el hilo:', e.message));
      await discord.pedir('POST', `/channels/${hilo}/messages`, mensaje(p, c, lado, caps[lado].ids));
    }
    c.entregado = ahora().toISOString();
    cargar().partidos[id] = c;
    await guardar();
    const sin = ['azul', 'rojo'].filter(l => !caps[l].ids.length).map(l => clan(p[l]).nombre);
    const error = caps.azul.error || caps.rojo.error;
    const enChats = ['azul', 'rojo'].filter(l => caps[l].de === 'chat').length;
    return { ok: true, chats: enChats, capitanes: caps.azul.ids.filter(x => x !== 'chat').length + caps.rojo.ids.filter(x => x !== 'chat').length, sinCapitan: sin, drafts: Boolean(c.drafts?.azul && c.drafts?.rojo),
      aviso: sin.length ? `Sin capitán en Discord: ${sin.join(' y ')}${error ? ` (${error})` : ''}. El staff los puede meter en su hilo nombrándolos.` : null };
  }

  // ---- registrar las estadísticas ----
  // Lo dijo Pacopepe el 15/11/2026: «las partidas con el código serán las que queden registradas las stats». La partida
  // de Riot se guarda en el fantasy con el mismo nombre que usa el panel («Jornada 1: KEMONO vs BUSHI, partida 1», con
  // los lados en los que se jugó de verdad), así que si el staff guarda luego desde el panel (para poner el MVP) la
  // sustituye en vez de contarla dos veces. El MVP lo elige el staff: aquí nadie lo es.
  function filasParaFantasy(p, f) {
    const [azul, rojo] = f.invertido ? [p.rojo, p.azul] : [p.azul, p.rojo];
    const partida = `${p.fantasy.jornada}: ${azul} vs ${rojo}, partida ${p.fantasy.partida}`;
    const filas = [azul, rojo].flatMap(c => ROLES.map((rol, i) => {
      const s = f.porClan[c][i] || {};
      return { jornada: p.fantasy.jornada, fase: p.fantasy.fase, clan: c, rol, jugador: jugadoresDe(c)[i] || '', id: `${c}-${rol}`,
        victoria: f.ganador === c, mvp: false, k: s.k, d: s.d, a: s.a, cs: s.cs, vision: s.vision, dano: s.dano, danoTorres: s.danoTorres,
        primeraSangre: s.primeraSangre, triples: s.triples, quadras: s.quadras, pentas: s.pentas, torres: s.torres, fuente: 'riot' };
    }));
    return { partida, filas, azul, rojo };
  }

  // ---- resultado (match-v5) ----
  const cache = new Map();
  async function resultado(id, { registrar = true, otraVez = false } = {}) {
    if (!r) return { ok: false, error: 'Sin clave de Riot con la Tournament API no se puede leer la partida: apunta las estadísticas a mano.' };
    const p = partido(id);
    const c = cargar().partidos[id];
    if (c?.modo === 'externo') return { ok: false, error: 'Este código es de Toornament: el resultado lo apunta Toornament y las estadísticas se guardan en el panel como siempre' };
    if (!c?.codigo || c.modo === 'sala') return { ok: false, error: 'Este partido no tiene código de torneo de Riot' };
    let matchId = c.partidaRiot;
    if (!matchId) {
      const jugadas = await r.partidasDeCodigo(c.codigo);
      const ultima = [].concat(jugadas || []).filter(g => g?.gameId).at(-1);
      if (!ultima) return { ok: false, error: 'Riot aún no tiene ninguna partida jugada con este código' };
      matchId = `${/^[A-Z]+\d+$/.test(ultima.region || '') ? ultima.region : plataforma}_${ultima.gameId}`;
    }
    if (!cache.has(matchId)) cache.set(matchId, await r.partida(matchId));
    const f = filasDePartida(cache.get(matchId), p, jugadoresDe);
    const fantasy = filasParaFantasy(p, f);
    let puntos = null;
    const toca = registrar && guardarEstadisticas && f.ganador && (otraVez || c.registrado !== matchId);
    if (toca) puntos = await guardarEstadisticas(fantasy.partida, fantasy.filas);
    if (c.partidaRiot !== matchId || c.ganador !== f.ganador || toca) {
      Object.assign(c, { partidaRiot: matchId, ganador: f.ganador, ...(toca && { registrado: matchId, partidaFantasy: fantasy.partida }) });
      await guardar();
    }
    return { ok: true, partido: id, partidaRiot: matchId, ...f, lados: { azul: fantasy.azul, rojo: fantasy.rojo },
      partidaFantasy: c.partidaFantasy || null, registrado: c.registrado === matchId, puntos };
  }

  // El aviso de Riot al acabar una partida (POST a urlAvisos). Solo vale si el código es nuestro y la firma cuadra
  async function aviso(cuerpo = {}) {
    let meta = {};
    try { meta = JSON.parse(cuerpo.metaData || '{}'); } catch {}
    const c = cargar().partidos[meta.p];
    if (!c || c.codigo !== cuerpo.shortCode || meta.f !== firma(meta.p)) return { ok: false, error: 'Aviso que no es de un código nuestro' };
    if (cuerpo.gameId) {
      c.partidaRiot = `${/^[A-Z]+\d+$/.test(cuerpo.region || '') ? cuerpo.region : plataforma}_${cuerpo.gameId}`;
      await guardar();
    }
    // La partida tarda un poco en estar en match-v5: se intenta ya y, si no está, otra vez al rato. Si no hay manera,
    // el staff pulsa «Leer la partida de Riot» en el panel
    const intentar = async n => {
      try { await resultado(meta.p); } catch (e) {
        if (n + 1 < reintentos.length) return setTimeout(() => intentar(n + 1), reintentos[n + 1]);
        log.error('Códigos de torneo: no puedo leer la partida', c.partidaRiot, e.message);
      }
    };
    const listo = intentar(0);
    if (esperarAviso) await listo;
    return { ok: true, partido: meta.p };
  }

  // ---- lo que ve el panel (sin los códigos) ----
  function estado() {
    const d = cargar();
    return {
      modo: modo(), discord: Boolean(discord?.pedir && discord.canal), torneo: d.riot?.huella === huella ? d.riot.torneo : null,
      partidos: lista().map(p => {
        const c = d.partidos[p.id];
        return { ...p, azulNombre: clan(p.azul).nombre, rojoNombre: clan(p.rojo).nombre, tiene: Boolean(c?.codigo), modoCodigo: c?.modo || null,
          drafts: Object.fromEntries(['azul', 'rojo', 'espectador'].map(l => [l, Boolean(c?.drafts?.[l])])),
          entregado: c?.entregado || null, partidaRiot: c?.partidaRiot || null, ganador: c?.ganador || null,
          registrado: Boolean(c?.registrado && c.registrado === c.partidaRiot), partidaFantasy: c?.partidaFantasy || null, cambiado: Boolean(d.horario[p.id]) };
      }),
    };
  }
  // Los partidos con el día o la hora cambiados en el panel, ya resueltos ({ J2-1: { fecha, hora } }): la web, la cuenta
  // atrás, el !partido de Kick y los tickets los enseñan en vez de la hora de la temporada (el 22/11 se retrasó 30 min)
  function cambios() {
    const d = cargar();
    return Object.fromEntries(lista().filter(p => d.horario[p.id]).map(p => [p.id, { fecha: p.fecha, hora: p.hora }]));
  }
  const ver = id => { partido(id); const c = cargar().partidos[id]; return c ? { modo: c.modo || null, codigo: c.codigo || null, sala: c.sala || null, drafts: c.drafts || null } : null; };

  async function cambiarHorario(id, { fecha = null, hora = null } = {}) {
    partido(id);
    const d = cargar();
    if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('El día va como 2026-11-16');
    if (hora && !/^\d{2}:\d{2}$/.test(hora)) throw new Error('La hora va como 19:00');
    if (!fecha && !hora) delete d.horario[id]; else d.horario[id] = { ...(fecha && { fecha }), ...(hora && { hora }) };
    await guardar();
    return estado();
  }

  async function olvidar(id) {
    const d = cargar();
    delete d.partidos[id];
    await guardar();
    return estado();
  }

  return { modo, estado, cambios, ver, generar, guardarDrafts, pegarDrafts, pegarCodigos, entregar, resultado, aviso, cambiarHorario, olvidar, firma };
}
