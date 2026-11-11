// Inhouses de Gokudō (11/11/2026): personalizadas 5 contra 5 de LoL, abiertas a los servidores de la red (server/red.js).
// En #🎲・inhouses (y en el canal de cada servidor de la red) hay un mensaje fijo con tres botones:
//   🎲 Convocar inhouse  → solo Oyabun y staff en Gokudō; en los servidores de la red, su staff («Gestionar servidor»).
//                          Ventana con cuándo, elo orientativo y notas. Sale una tarjeta en todos los canales de la red.
//   🏆 Ranking           → victorias y partidas de cada uno (solo lo ve quien lo pide).
//   🔔 Avísame           → te menciona cuando convoquen una inhouse a tu hora.
// En la tarjeta: un botón por rol (2 plazas por rol; al pulsar se pide el elo), «Desapuntarme» y «Cancelar». Todas las
// copias de la tarjeta se actualizan a la vez. Con las 10 plazas, SrDirector hace los equipos equilibrados por elo. 15
// minutos antes menciona a los 10 y abre dos canales de voz en Gokudō, «🔵 Azul» y «🔴 Rojo», que se borran al acabar.
// Quien convocó (o el staff) pulsa «Ganó Azul/Rojo» y se apunta en el ranking. Si a su hora no está llena, se cancela.
// La partida se crea a mano en el cliente del LoL (Riot solo deja crearlas con códigos de torneo). Sin IA.
// Se guarda en las pestañas «Inhouses» (las abiertas) y «RankingInhouses» de Google Sheets (sin hoja, en data/).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { archivoDatos } from './datos.js';
import { hojaActiva, asegurarPestana, leer, escribirEncima } from './sheets.js';
import { cuando } from './scrims.js';

const AGENTE = 'DiscordBot (https://tenka-ichi.onrender.com, 1.0)';
const BERMELLON = 0xBE2A2F, AZUL = 0x39C6F0;
const MENSAJE = 4, DIFERIDA = 5, VENTANA = 9, SOLO_TU = 64, FILA = 1, BOTON = 2, TEXTO = 4, PRIMARIO = 1, GRIS = 2, VERDE = 3, ROJO = 4;
const ADMINISTRADOR = 1n << 3n, GESTIONAR_SERVIDOR = 1n << 5n;
export const ROLES = [['TOP', 'Top'], ['JUNGLA', 'Jungla'], ['MEDIO', 'Medio'], ['ADC', 'ADC'], ['SUPPORT', 'Support']];
const PLAZAS = 2;
const MARGEN_MS = 60 * 60 * 1000, AVISO_MS = 15 * 60 * 1000, CANCELA_MS = 30 * 60 * 1000, FIN_MS = 4 * 3600 * 1000;

const sinTildes = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const recortar = (s, n) => String(s || '').trim().slice(0, n);
const segundos = f => Math.floor(new Date(f).getTime() / 1000);
const cuandoTexto = f => `<t:${segundos(f)}:F> (<t:${segundos(f)}:R>)`;
const horaCorta = f => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }).format(new Date(f));
const aviso = texto => ({ type: MENSAJE, data: { content: texto, flags: SOLO_TU, allowed_mentions: { parse: [] } } });
const valorDe = (i, id) => String(i.data.components?.flatMap(f => f.components || []).find(c => c.custom_id === id)?.value || '').trim();

// El elo en número para equilibrar: Hierro IV = 0 … Challenger = 36. Entiende «Platino II», «plat 2», «D4», «Emerald 1»…
const TIERS = [[/^(hierro|iron|i)$/, 0], [/^(bronce|bronze|b)$/, 4], [/^(plata|silver|s)$/, 8], [/^(oro|gold|g)$/, 12], [/^(platino|plat|platinum|p)$/, 16],
  [/^(esmeralda|emerald|e)$/, 20], [/^(diamante|diamond|dia|d)$/, 24], [/^(master|maestro|m)$/, 28], [/^(grandmaster|gm|gran maestro)$/, 32], [/^(challenger|aspirante|chall|c)$/, 36]];
const DIVISION = { iv: 0, 4: 0, iii: 1, 3: 1, ii: 2, 2: 2, i: 3, 1: 3 };
export function eloNumero(texto) {
  const t = sinTildes(texto).replace(/[^a-z0-9 ]/g, ' ').trim();
  const m = /^([a-z]+(?: maestro)?)\s*([iv]+|[1-4])?\b/.exec(t) || /^([a-z])([1-4])$/.exec(t.replace(/\s+/g, ''));
  if (!m) return 12;   // si no se entiende, como un oro
  const tier = TIERS.find(([r]) => r.test(m[1]));
  if (!tier) return 12;
  return tier[1] + (tier[1] >= 28 ? 0 : (DIVISION[m[2]] ?? 0));
}

// Los equipos más igualados: un jugador de cada rol en cada lado (2^5 combinaciones)
export function equilibrar(plazas) {
  let mejor = null;
  for (let mask = 0; mask < 32; mask++) {
    const azul = ROLES.map(([r], k) => ({ ...plazas[r][(mask >> k) & 1], rol: r }));
    const rojo = ROLES.map(([r], k) => ({ ...plazas[r][1 - ((mask >> k) & 1)], rol: r }));
    const suma = e => e.reduce((s, j) => s + j.valor, 0);
    const diferencia = Math.abs(suma(azul) - suma(rojo));
    if (!mejor || diferencia < mejor.diferencia) mejor = { azul, rojo, diferencia, mediaAzul: suma(azul) / 5, mediaRojo: suma(rojo) / 5 };
  }
  return mejor;
}

const NOMBRE_ELO = n => ['Hierro', 'Bronce', 'Plata', 'Oro', 'Platino', 'Esmeralda', 'Diamante', 'Master', 'Grandmaster', 'Challenger'][Math.min(9, Math.floor(n / 4))];

export function mensajePanelInhouses() {
  return {
    embeds: [{ color: BERMELLON, title: '🎲 Inhouses de Gokudō', footer: { text: '極道 · Gokudō' },
      description: 'Personalizadas 5 contra 5 abiertas a toda la red de Gokudō.\n\n'
        + '**🎲 Convocar inhouse**: los Oyabun y el staff (en otros servidores de la red, su staff).\n'
        + '**Apúntate** con el botón de tu rol en la tarjeta de la inhouse: con 10, SrDirector hace los equipos igualados.\n'
        + '**🏆 Ranking**: victorias y partidas de cada uno.\n**🔔 Avísame**: te menciono cuando convoquen una a tu hora.' }],
    components: [{ type: FILA, components: [
      { type: BOTON, style: ROJO, custom_id: 'inh:convocar', label: 'Convocar inhouse', emoji: { name: '🎲' } },
      { type: BOTON, style: GRIS, custom_id: 'inh:ranking', label: 'Ranking', emoji: { name: '🏆' } },
      { type: BOTON, style: GRIS, custom_id: 'inh:avisame', label: 'Avísame', emoji: { name: '🔔' } },
    ] }],
    allowed_mentions: { parse: [] },
  };
}

const campo = (id, label, { requerido = true, max = 60, ejemplo = '', largo = false } = {}) => ({ type: FILA, components: [{ type: TEXTO, custom_id: id, label, style: largo ? 2 : 1, required: requerido, max_length: max, placeholder: ejemplo }] });

export function crearInhouses({ token, urlApi, ids, red, ahora = () => new Date(), hoja = hojaActiva, asegurar = asegurarPestana, leerHoja = leer, escribirHoja = escribirEncima,
  archivo = archivoDatos('inhouses.json'), archivoRanking = archivoDatos('ranking-inhouses.json'), log = console } = {}) {
  const base = urlApi.replace(/\/$/, '');
  let inhouses = [];     // las abiertas, llenas o en juego
  let ranking = {};      // id → { nombre, partidas, victorias }
  let avisos = [];       // { usuario, guild, desde }
  const filasAntes = { Inhouses: 0, RankingInhouses: 0 };
  let cola = Promise.resolve();
  const enCola = fn => { const p = cola.then(fn); cola = p.catch(() => {}); return p; };
  const trabajos = new Set();
  const despues = fn => { const p = fn().catch(e => log.error('Inhouses:', e.message)).finally(() => trabajos.delete(p)); trabajos.add(p); };

  async function pedir(metodo, ruta, cuerpo, { bot = true } = {}) {
    const r = await fetch(`${base}${ruta}`, { method: metodo,
      headers: { ...(bot && { Authorization: `Bot ${token}` }), 'User-Agent': AGENTE, ...(cuerpo && { 'Content-Type': 'application/json' }) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(`Discord respondió ${r.status} a ${metodo} ${ruta.replace(/\/webhooks\/\d+\/[^/]+/, '/webhooks/…')}: ${j.message || 'error'}`); }
    return r.status === 204 ? null : r.json();
  }
  const responderTarde = (i, datos) => pedir('PATCH', `/webhooks/${i.application_id}/${i.token}/messages/@original`, datos, { bot: false });

  // ---------- Guardar ----------
  async function cargar() {
    try {
      if (hoja()) {
        await asegurar('Inhouses', ['ID', 'Datos']);
        const filas = (await leerHoja('Inhouses')).slice(1).filter(f => f[0]);
        filasAntes.Inhouses = filas.length + 1;
        inhouses = filas.map(f => JSON.parse(f[1]));
        await asegurar('RankingInhouses', ['ID', 'Nombre', 'Partidas', 'Victorias']);
        const rk = (await leerHoja('RankingInhouses')).slice(1).filter(f => f[0]);
        filasAntes.RankingInhouses = rk.length + 1;
        ranking = Object.fromEntries(rk.map(f => [f[0], { nombre: f[1], partidas: Number(f[2]) || 0, victorias: Number(f[3]) || 0 }]));
      } else {
        inhouses = JSON.parse(await readFile(archivo, 'utf8').catch(() => '[]'));
        ranking = JSON.parse(await readFile(archivoRanking, 'utf8').catch(() => '{}'));
      }
    } catch (e) {
      log.error('Inhouses: no se pudieron leer:', e.message);
    }
  }
  const celda = s => String(s ?? '').replace(/^([=+\-@])/, "'$1");
  const guardar = () => enCola(async () => {
    if (hoja()) {
      await asegurar('Inhouses', ['ID', 'Datos']);
      const filas = [['ID', 'Datos'], ...inhouses.map(x => [x.id, JSON.stringify(x)])];
      await escribirHoja('Inhouses', filas, filasAntes.Inhouses); filasAntes.Inhouses = filas.length;
      await asegurar('RankingInhouses', ['ID', 'Nombre', 'Partidas', 'Victorias']);
      const rk = [['ID', 'Nombre', 'Partidas', 'Victorias'], ...Object.entries(ranking).map(([id, r]) => [id, celda(r.nombre), r.partidas, r.victorias])];
      await escribirHoja('RankingInhouses', rk, filasAntes.RankingInhouses); filasAntes.RankingInhouses = rk.length;
    } else {
      await mkdir(path.dirname(archivo), { recursive: true });
      await writeFile(archivo, JSON.stringify(inhouses, null, 1));
      await writeFile(archivoRanking, JSON.stringify(ranking, null, 1));
    }
  });

  // ---------- Quién puede ----------
  const casa = () => red.casa();
  const delCasa = () => ids()[casa()] || {};
  const permisos = i => BigInt(i.member?.permissions || 0);
  const esStaffCasa = i => i.guild_id === casa() && Boolean((permisos(i) & ADMINISTRADOR) || (delCasa()['rol:staff'] && i.member?.roles?.includes(delCasa()['rol:staff'])));
  function puedeConvocar(i) {
    if (i.guild_id === casa()) return esStaffCasa(i) || Boolean(delCasa()['rol:jefes'] && i.member?.roles?.includes(delCasa()['rol:jefes']));
    return Boolean(permisos(i) & (ADMINISTRADOR | GESTIONAR_SERVIDOR)) && red.canales('inhouses').some(c => c.guild === i.guild_id);
  }
  const puedeGestionar = (i, x) => x.convoca.id === i.member.user.id || esStaffCasa(i);

  // ---------- La tarjeta ----------
  const jugadores = x => ROLES.flatMap(([r]) => x.plazas[r]);
  const llena = x => ROLES.every(([r]) => x.plazas[r].length === PLAZAS);
  const nombreServidor = guild => (guild === casa() ? 'Gokudō' : red.canales('inhouses').find(c => c.guild === guild)?.nombre || 'otro servidor');
  const linea = j => `${j.nombre} · ${j.elo}${j.guild !== casa() ? ` · ${nombreServidor(j.guild)}` : ''}`;

  function tarjeta(x) {
    const cabecera = `**Cuándo:** ${cuandoTexto(x.inicio)}\n**Elo:** ${x.elo || 'abierto'} · **Convoca:** ${x.convoca.nombre}${x.convoca.guild !== casa() ? ` (${nombreServidor(x.convoca.guild)})` : ''}${x.notas ? `\n${x.notas}` : ''}`;
    const estado = { abierta: `${jugadores(x).length}/10 · apúntate con el botón de tu rol`, llena: 'Completa: equipos hechos', jugando: 'En juego', terminada: `Terminada · ganó ${x.ganador === 'azul' ? '🔵 Azul' : '🔴 Rojo'}`, cancelada: `Cancelada${x.motivo ? ` · ${x.motivo}` : ''}` }[x.estado];
    const fields = x.equipos
      ? [['azul', '🔵 Azul'], ['rojo', '🔴 Rojo']].map(([lado, titulo]) => ({ name: `${titulo} · media ${NOMBRE_ELO(x.equipos[`media${lado === 'azul' ? 'Azul' : 'Rojo'}`])}`, inline: true,
        value: x.equipos[lado].map(j => `**${ROLES.find(([r]) => r === j.rol)[1]}**: ${j.nombre}`).join('\n') }))
      : ROLES.map(([r, nombre]) => ({ name: `${nombre} (${x.plazas[r].length}/${PLAZAS})`, value: x.plazas[r].map(linea).join('\n') || '—', inline: true }));
    const abierta = x.estado === 'abierta';
    const filas = [];
    if (abierta) filas.push({ type: FILA, components: ROLES.map(([r, nombre]) => ({ type: BOTON, style: x.plazas[r].length >= PLAZAS ? GRIS : PRIMARIO, custom_id: `inh:rol:${x.id}:${r}`, label: nombre, disabled: x.plazas[r].length >= PLAZAS })) });
    if (abierta || x.estado === 'llena' || x.estado === 'jugando') {
      filas.push({ type: FILA, components: [
        ...(abierta ? [{ type: BOTON, style: GRIS, custom_id: `inh:salir:${x.id}`, label: 'Desapuntarme' }] : []),
        ...(!abierta ? [{ type: BOTON, style: PRIMARIO, custom_id: `inh:gana:${x.id}:azul`, label: 'Ganó Azul', emoji: { name: '🔵' } },
          { type: BOTON, style: ROJO, custom_id: `inh:gana:${x.id}:rojo`, label: 'Ganó Rojo', emoji: { name: '🔴' } }] : []),
        { type: BOTON, style: GRIS, custom_id: `inh:cancelar:${x.id}`, label: 'Cancelar' },
      ] });
    }
    return { embeds: [{ color: x.equipos ? AZUL : BERMELLON, title: `🎲 Inhouse de las ${horaCorta(x.inicio)}`, description: cabecera, fields, footer: { text: estado } }],
      components: filas, allowed_mentions: { parse: [] } };
  }

  // Actualiza todas las copias de la tarjeta (una por canal de la red)
  async function repintar(x) {
    const t = tarjeta(x);
    for (const c of x.copias) await pedir('PATCH', `/channels/${c.canal}/messages/${c.mensaje}`, t).catch(e => log.error('Inhouses: no he podido actualizar una tarjeta:', e.message));
  }
  // Un mensaje a los jugadores de cada servidor, en el canal de inhouses de su servidor (solo los menciona a ellos)
  async function avisarJugadores(x, texto) {
    for (const c of x.copias) {
      const suyos = jugadores(x).filter(j => j.guild === c.guild).map(j => j.id);
      if (!suyos.length) continue;
      await pedir('POST', `/channels/${c.canal}/messages`, { content: `${suyos.map(u => `<@${u}>`).join(' ')} ${texto}`, message_reference: { message_id: c.mensaje, fail_if_not_exists: false },
        allowed_mentions: { parse: [], users: suyos } }).catch(e => log.error('Inhouses: aviso:', e.message));
    }
  }

  // ---------- Botones ----------
  const ventanas = {
    convocar: { custom_id: 'inh:nueva', title: 'Convocar inhouse', components: [
      campo('cuando', '¿Cuándo? (hora de España)', { max: 40, ejemplo: 'viernes 22:00 · mañana 21h · 14/11 20:30' }),
      campo('elo', 'Elo orientativo', { requerido: false, max: 40, ejemplo: 'Abierto · Oro-Esmeralda' }),
      campo('notas', 'Notas', { requerido: false, max: 200, largo: true, ejemplo: 'Draft de torneo, al mejor de 1. Pasad por voz.' }),
    ] },
    avisame: { custom_id: 'inh:aviso', title: 'Avísame de una inhouse', components: [campo('cuando', '¿Cuándo quieres jugar? (hora de España)', { max: 40, ejemplo: 'sábado 22:00' })] },
  };

  function convocar(i) {
    if (!puedeConvocar(i)) return aviso(i.guild_id === casa() ? 'Convocan los Oyabun y el staff. Apúntate con los botones de una inhouse convocada.' : 'Convoca el staff de este servidor.');
    const inicio = cuando(valorDe(i, 'cuando'), ahora());
    if (!inicio) return aviso('No entiendo cuándo. Prueba con algo como «viernes 22:00» o «mañana 21h».');
    if (inicio < ahora()) return aviso('Esa hora ya ha pasado.');
    if (inicio.getTime() > ahora().getTime() + 30 * 86400000) return aviso('Como mucho, con un mes de antelación.');
    const quien = i.member.user;
    if (inhouses.some(x => x.convoca.id === quien.id && x.estado === 'abierta')) return aviso('Ya tienes una inhouse abierta: cancélala o espera a que se llene.');
    const x = { id: crypto.randomBytes(5).toString('hex'), inicio: inicio.toISOString(), elo: recortar(valorDe(i, 'elo'), 40), notas: recortar(valorDe(i, 'notas'), 200),
      convoca: { id: quien.id, nombre: recortar(quien.global_name || quien.username, 40), guild: i.guild_id }, plazas: Object.fromEntries(ROLES.map(([r]) => [r, []])),
      copias: [], estado: 'abierta', equipos: null, voz: [], avisado: false, creada: ahora().toISOString() };
    despues(async () => {
      for (const c of red.canales('inhouses')) {
        try { const m = await pedir('POST', `/channels/${c.canal}/messages`, tarjeta(x)); x.copias.push({ guild: c.guild, canal: c.canal, mensaje: m.id }); }
        catch (e) { log.error(`Inhouses: no he podido publicar en ${c.nombre}:`, e.message); }
      }
      inhouses.push(x);
      await guardar();
      const propia = x.copias.find(c => c.guild === i.guild_id) || x.copias[0];
      await responderTarde(i, { content: propia ? `Convocada: https://discord.com/channels/${propia.guild}/${propia.canal}/${propia.mensaje} (sale en ${x.copias.length} servidor${x.copias.length === 1 ? '' : 'es'})` : 'No he podido publicarla en ningún canal.' });
      // Los «Avísame» que encajan: a cada uno en el canal de inhouses de su servidor
      const toca = avisos.filter(a => Math.abs(new Date(x.inicio) - a.desde) <= MARGEN_MS);
      avisos = avisos.filter(a => !toca.includes(a));
      for (const a of toca) {
        const c = x.copias.find(k => k.guild === a.guild);
        if (!c) continue;
        await pedir('POST', `/channels/${c.canal}/messages`, { content: `🔔 <@${a.usuario}>, han convocado una inhouse que te encaja: ${cuandoTexto(x.inicio)}.`,
          message_reference: { message_id: c.mensaje, fail_if_not_exists: false }, allowed_mentions: { parse: [], users: [a.usuario] } }).catch(e => log.error('Inhouses: aviso:', e.message));
      }
    });
    return { type: DIFERIDA, data: { flags: SOLO_TU } };
  }

  const buscar = id => inhouses.find(x => x.id === id);

  function pedirRol(i, id, rol) {
    const x = buscar(id);
    if (!x || x.estado !== 'abierta') return aviso('Esta inhouse ya no admite gente.');
    if (jugadores(x).some(j => j.id === i.member.user.id)) return aviso('Ya estás apuntado en esta inhouse. Para cambiar de rol, desapúntate primero.');
    if (x.plazas[rol]?.length >= PLAZAS) return aviso('Ese rol ya está lleno.');
    return { type: VENTANA, data: { custom_id: `inh:apunta:${id}:${rol}`, title: `Apuntarme de ${ROLES.find(([r]) => r === rol)[1]}`,
      components: [campo('elo', 'Tu elo (para hacer equipos igualados)', { max: 30, ejemplo: 'Platino II · Esmeralda 4 · D3' })] } };
  }

  function apuntar(i, id, rol) {
    const x = buscar(id);
    if (!x || x.estado !== 'abierta') return aviso('Esta inhouse ya no admite gente.');
    const quien = i.member.user;
    if (jugadores(x).some(j => j.id === quien.id)) return aviso('Ya estás apuntado en esta inhouse.');
    if (!x.plazas[rol] || x.plazas[rol].length >= PLAZAS) return aviso('Ese rol ya está lleno.');
    const elo = recortar(valorDe(i, 'elo'), 30) || 'sin decir';
    x.plazas[rol].push({ id: quien.id, nombre: recortar(quien.global_name || quien.username, 40), elo, valor: eloNumero(elo), guild: i.guild_id });
    const completa = llena(x);
    if (completa) { x.equipos = equilibrar(x.plazas); x.estado = 'llena'; }
    despues(async () => {
      await guardar();
      await repintar(x);
      if (completa) await avisarJugadores(x, `🎲 ¡Inhouse completa! Equipos hechos para ${cuandoTexto(x.inicio)}: mira la tarjeta. Os aviso 15 minutos antes.`);
    });
    return aviso(`Apuntado de **${ROLES.find(([r]) => r === rol)[1]}** (${elo}).${completa ? ' ¡Con esto está completa: equipos hechos!' : ''}`);
  }

  function salir(i, id) {
    const x = buscar(id);
    if (!x || x.estado !== 'abierta') return aviso('Ya no te puedes desapuntar: la inhouse está completa o ya no existe. Habla con quien la convocó.');
    const antes = jugadores(x).length;
    for (const [r] of ROLES) x.plazas[r] = x.plazas[r].filter(j => j.id !== i.member.user.id);
    if (antes === jugadores(x).length) return aviso('No estabas apuntado.');
    despues(async () => { await guardar(); await repintar(x); });
    return aviso('Desapuntado.');
  }

  async function borrarVoz(x) {
    for (const c of x.voz || []) await pedir('DELETE', `/channels/${c}`).catch(() => {});
    x.voz = [];
  }

  function cancelar(i, id) {
    const x = buscar(id);
    if (!x || !['abierta', 'llena', 'jugando'].includes(x.estado)) return aviso('Esa inhouse ya no está activa.');
    if (!puedeGestionar(i, x)) return aviso('Solo puede cancelarla quien la convocó o el staff de Gokudō.');
    x.estado = 'cancelada'; x.motivo = `por ${i.member.user.global_name || i.member.user.username}`;
    despues(async () => {
      await repintar(x);
      await avisarJugadores(x, `La inhouse de ${cuandoTexto(x.inicio)} se ha cancelado.`);
      await borrarVoz(x);
      inhouses = inhouses.filter(k => k !== x);
      await guardar();
    });
    return aviso('Cancelada.');
  }

  function resultado(i, id, lado) {
    const x = buscar(id);
    if (!x || !['llena', 'jugando'].includes(x.estado) || !x.equipos) return aviso('Esa inhouse no está en juego.');
    if (!puedeGestionar(i, x)) return aviso('El resultado lo apunta quien la convocó o el staff de Gokudō.');
    x.estado = 'terminada'; x.ganador = lado;
    for (const l of ['azul', 'rojo']) {
      for (const j of x.equipos[l]) {
        const r = ranking[j.id] || (ranking[j.id] = { nombre: j.nombre, partidas: 0, victorias: 0 });
        r.nombre = j.nombre; r.partidas += 1; if (l === lado) r.victorias += 1;
      }
    }
    despues(async () => {
      await repintar(x);
      await borrarVoz(x);
      inhouses = inhouses.filter(k => k !== x);
      await guardar();
    });
    return aviso(`Apuntado: ganó ${lado === 'azul' ? '🔵 Azul' : '🔴 Rojo'}. ¡GG!`);
  }

  function verRanking() {
    const lista = Object.values(ranking).filter(r => r.partidas).sort((a, b) => b.victorias - a.victorias || (b.victorias / b.partidas) - (a.victorias / a.partidas) || b.partidas - a.partidas).slice(0, 15);
    if (!lista.length) return aviso('Todavía no hay resultados de inhouses.');
    return aviso(`🏆 **Ranking de inhouses**\n${lista.map((r, n) => `${n + 1}. **${r.nombre}** · ${r.victorias} victorias de ${r.partidas} (${Math.round(100 * r.victorias / r.partidas)} %)`).join('\n')}`);
  }

  function avisame(i) {
    const desde = cuando(valorDe(i, 'cuando'), ahora());
    if (!desde) return aviso('No entiendo cuándo. Prueba con algo como «sábado 22:00».');
    avisos = avisos.filter(a => a.usuario !== i.member.user.id);
    avisos.push({ usuario: i.member.user.id, guild: i.guild_id, desde: desde.getTime() });
    const ya = inhouses.filter(x => x.estado === 'abierta' && Math.abs(new Date(x.inicio) - desde) <= MARGEN_MS).length;
    return aviso(`Hecho: te menciono si convocan una inhouse para ${cuandoTexto(desde)}.${ya ? ` Ojo, ya hay ${ya} abierta${ya === 1 ? '' : 's'} a esa hora.` : ''}`);
  }

  function atender(i) {
    if (!i.guild_id || !i.member) return aviso('Esto solo funciona dentro de un servidor.');
    const [, accion, id, extra] = String(i.data?.custom_id || '').split(':');
    if (accion === 'convocar') return puedeConvocar(i) ? { type: VENTANA, data: ventanas.convocar } : convocar(i);
    if (accion === 'avisame') return { type: VENTANA, data: ventanas.avisame };
    if (accion === 'ranking') return verRanking();
    if (accion === 'nueva') return convocar(i);
    if (accion === 'aviso') return avisame(i);
    if (accion === 'rol') return pedirRol(i, id, extra);
    if (accion === 'apunta') return apuntar(i, id, extra);
    if (accion === 'salir') return salir(i, id);
    if (accion === 'cancelar') return cancelar(i, id);
    if (accion === 'gana') return resultado(i, id, extra);
    return aviso('Este botón ya no funciona.');
  }

  // ---------- Reloj (cada minuto) ----------
  // 15 min antes: aviso a los 10 y voz en Gokudō. Sin llenar a su hora + 30 min: se cancela. A las 4 horas: se cierra
  async function reloj() {
    const t = ahora().getTime();
    let cambia = false;
    for (const x of inhouses.slice()) {
      const inicio = new Date(x.inicio).getTime();
      if (x.estado === 'llena' && !x.avisado && t >= inicio - AVISO_MS) {
        x.avisado = true; x.estado = 'jugando'; cambia = true;
        const categoria = delCasa()['categoria:scrims'];
        for (const [lado, nombre] of [['azul', '🔵 Azul'], ['rojo', '🔴 Rojo']]) {
          try { const v = await pedir('POST', `/guilds/${casa()}/channels`, { name: `${nombre} · ${horaCorta(x.inicio)}`, type: 2, ...(categoria && { parent_id: categoria }) }); x.voz.push(v.id); }
          catch (e) { log.error(`Inhouses: no he podido crear la voz ${lado}:`, e.message); }
        }
        await repintar(x);
        await avisarJugadores(x, `⏰ La inhouse empieza ${cuandoTexto(x.inicio)}.${x.voz.length ? ` Voz: ${x.voz.map(v => `<#${v}>`).join(' ')} (en Gokudō).` : ''} ${x.convoca.nombre} crea la partida personalizada y pasa nombre y contraseña.`);
      } else if (x.estado === 'abierta' && t >= inicio + CANCELA_MS) {
        x.estado = 'cancelada'; x.motivo = 'no se llenó'; cambia = true;
        await repintar(x);
        inhouses = inhouses.filter(k => k !== x);
      } else if (['llena', 'jugando'].includes(x.estado) && t >= inicio + FIN_MS) {
        x.estado = 'cancelada'; x.motivo = 'sin resultado'; cambia = true;
        await repintar(x);
        await borrarVoz(x);
        inhouses = inhouses.filter(k => k !== x);
      }
    }
    avisos = avisos.filter(a => a.desde > t - MARGEN_MS);
    if (cambia) await guardar();
  }

  let intervalo = null;
  return {
    atender, cargar, reloj,
    arrancar: () => { cargar().then(reloj).catch(() => {}); intervalo = setInterval(() => reloj().catch(e => log.error('Inhouses:', e.message)), 60 * 1000); intervalo.unref?.(); },
    parar: () => clearInterval(intervalo),
    inhouses: () => inhouses.slice(), ranking: () => ({ ...ranking }),
    esperar: () => Promise.all([...trabajos]),
  };
}
