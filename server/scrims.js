// Tablón de scrims de Gokudō (fase 1, pedida por Pacopepe el 11/11/2026). En #🔎・scrims hay un mensaje fijo de
// SrDirector con tres botones (lo publica npm run discord-scrims):
//   📣 Publicar scrim → ventana (equipo y elo, cuándo, formato, contacto, notas) → tarjeta en #scrims que se borra sola
//                       cuando empieza la scrim (o con su botón «Retirar», que puede usar quien la puso o el staff)
//   🔎 Buscar scrim   → ventana (cuándo, elo) → las ofertas que encajan, solo para quien busca, con enlace a cada una
//   🔔 Avísame        → ventana (cuándo, elo) → cuando alguien publica una que encaja, lo menciona en #scrims
// Sin IA: todo sale de formularios. Las ofertas se guardan en la pestaña «Scrims» de Google Sheets (sin hoja, en
// data/scrims.json) para que sobrevivan a un reinicio; los avisos, solo en memoria.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { archivoDatos } from './datos.js';
import { hojaActiva, asegurarPestana, leer, escribirEncima } from './sheets.js';

const AGENTE = 'DiscordBot (https://tenka-ichi.onrender.com, 1.0)';
const BERMELLON = 0xBE2A2F;
const MENSAJE = 4, DIFERIDA = 5, VENTANA = 9, SOLO_TU = 64, FILA = 1, BOTON = 2, TEXTO = 4, ROJO = 4, GRIS = 2;
const ADMINISTRADOR = 1n << 3n;
const MARGEN_MS = 60 * 60 * 1000;         // al buscar una hora, vale lo que empiece una hora antes o después
const CADUCA_MS = 15 * 60 * 1000;         // una oferta se borra 15 minutos después de su hora
const MAX_POR_PERSONA = 3;                // ofertas a la vez de cada persona
const CABECERA = ['ID', 'Inicio', 'Equipo', 'Elo', 'Formato', 'Contacto', 'Notas', 'Autor', 'Nombre', 'Mensaje', 'Creada'];
const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

const sinTildes = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const recortar = (s, n) => String(s || '').trim().slice(0, n);

// La hora de Madrid de una fecha (y, m, d, h, min) a un instante (Date). Se calcula el desfase de ese momento (CET/CEST)
export function madrid(y, m, d, h, min) {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(guess)).map(p => [p.type, Number(p.value)]));
  const comoMadrid = Date.UTC(partes.year, partes.month - 1, partes.day, partes.hour, partes.minute);
  return new Date(guess - (comoMadrid - guess));
}
const hoyEnMadrid = ahora => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' })
    .formatToParts(ahora).map(x => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), dia: DIAS[['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(p.weekday)] };
};

// «jueves 20:00», «hoy a las 21h», «mañana 19.30», «13/11 20:00», «20:00» (hoy o, si ya ha pasado, mañana).
// Devuelve un Date o null si no hay una hora clara
export function cuando(texto, ahora = new Date()) {
  let t = sinTildes(texto).replace(/\s+/g, ' ').trim();
  const hoy = hoyEnMadrid(ahora);
  let y = hoy.y, m = hoy.m, d = hoy.d, diaDado = false, sumar = 0;
  const fecha = /(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/.exec(t);
  if (fecha) {
    d = Number(fecha[1]); m = Number(fecha[2]); diaDado = true;
    if (fecha[3]) y = Number(fecha[3].length === 2 ? `20${fecha[3]}` : fecha[3]);
    t = t.replace(fecha[0], ' ');
  }
  const hora = /(?:^|\D)(\d{1,2})(?:[:.h](\d{2}))?\s*(?:h|hrs?|horas)?(?=\D|$)/.exec(t);
  if (!hora) return null;
  const h = Number(hora[1]), min = Number(hora[2] || 0);
  if (h > 23 || min > 59) return null;
  if (!diaDado) {
    if (/pasado manana/.test(t)) { sumar = 2; diaDado = true; }
    else if (/manana/.test(t)) { sumar = 1; diaDado = true; }
    else if (/\bhoy\b/.test(t)) diaDado = true;
    else {
      const i = DIAS.findIndex(x => new RegExp(`\\b${x}\\b`).test(t));
      if (i >= 0) { sumar = (i - DIAS.indexOf(hoy.dia) + 7) % 7; diaDado = true; }
    }
  }
  const base = new Date(Date.UTC(y, m - 1, d) + sumar * 86400000);
  let r = madrid(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), h, min);
  // Sin día, o con un día de la semana que ya ha pasado hoy: la siguiente vez que toque
  if (r.getTime() < ahora.getTime() - CADUCA_MS) {
    if (!diaDado) r = new Date(r.getTime() + 86400000);
    else if (!fecha && sumar === 0 && !/\bhoy\b/.test(t)) r = new Date(r.getTime() + 7 * 86400000);
    else if (fecha && !fecha[3]) r = madrid(y + 1, m, d, h, min);
  }
  return r;
}

const segundos = f => Math.floor(f.getTime() / 1000);
// Discord enseña <t:…> en la hora de quien lo lee
const cuandoTexto = f => `<t:${segundos(f)}:F> (<t:${segundos(f)}:R>)`;
const encaja = (oferta, desde, elo) => Math.abs(new Date(oferta.inicio) - desde) <= MARGEN_MS
  && (!elo || sinTildes(elo).split(/[\s,/-]+/).filter(Boolean).some(p => sinTildes(oferta.elo).includes(p)));

export function mensajePanelScrims() {
  return {
    embeds: [{ color: BERMELLON, title: '⚔️ Scrims de Gokudō', footer: { text: '極道 · Gokudō' },
      description: '**📣 Publicar scrim**: pon cuándo, tu elo y el formato, y sale aquí como tarjeta (se borra sola al empezar).\n'
        + '**🔎 Buscar scrim**: dime cuándo quieres jugar y te enseño las que encajan.\n'
        + '**🔔 Avísame**: te menciono aquí en cuanto alguien publique una que te encaje.\n\n'
        + 'Las horas son de España; en las tarjetas, Discord te las enseña en tu hora. Para cerrar la scrim, escribe al contacto de la tarjeta.' }],
    components: [{ type: FILA, components: [
      { type: BOTON, style: ROJO, custom_id: 'scrims:publicar', label: 'Publicar scrim', emoji: { name: '📣' } },
      { type: BOTON, style: GRIS, custom_id: 'scrims:buscar', label: 'Buscar scrim', emoji: { name: '🔎' } },
      { type: BOTON, style: GRIS, custom_id: 'scrims:avisame', label: 'Avísame', emoji: { name: '🔔' } },
    ] }],
    allowed_mentions: { parse: [] },
  };
}

const campo = (id, label, { largo = false, requerido = true, max = 100, ejemplo = '' } = {}) => ({ type: FILA, components: [{ type: TEXTO, custom_id: id, label, style: largo ? 2 : 1, required: requerido, max_length: max, placeholder: ejemplo }] });
const ventanas = {
  publicar: { custom_id: 'scrims:nueva', title: 'Publicar scrim', components: [
    campo('equipo', 'Equipo', { max: 60, ejemplo: 'Akuma Academy' }),
    campo('cuando', '¿Cuándo? (hora de España)', { max: 40, ejemplo: 'jueves 20:00 · mañana 21h · 14/11 19:30' }),
    campo('elo', 'Elo', { max: 40, ejemplo: 'Oro-Platino · Esmeralda+' }),
    campo('formato', 'Formato', { max: 60, ejemplo: 'Bo3 fearless · 3 partidas' }),
    campo('contacto', 'Contacto y notas', { largo: true, max: 300, ejemplo: 'MD a @capitán · op.gg: …' }),
  ] },
  buscar: { custom_id: 'scrims:busca', title: 'Buscar scrim', components: [
    campo('cuando', '¿Cuándo quieres jugar? (hora de España)', { max: 40, ejemplo: 'jueves 20:00' }),
    campo('elo', 'Elo (opcional)', { requerido: false, max: 40, ejemplo: 'Platino' }),
  ] },
  avisame: { custom_id: 'scrims:aviso', title: 'Avísame si sale una scrim', components: [
    campo('cuando', '¿Cuándo quieres jugar? (hora de España)', { max: 40, ejemplo: 'viernes 21:00' }),
    campo('elo', 'Elo (opcional)', { requerido: false, max: 40, ejemplo: 'Esmeralda' }),
  ] },
};

const aviso = texto => ({ type: MENSAJE, data: { content: texto, flags: SOLO_TU, allowed_mentions: { parse: [] } } });
const valor = (i, id) => String(i.data.components?.flatMap(f => f.components || []).find(c => c.custom_id === id)?.value || '').trim();

export function crearScrims({ token, urlApi, ids, ahora = () => new Date(), hoja = hojaActiva, asegurar = asegurarPestana, leerHoja = leer, escribirHoja = escribirEncima,
  archivo = archivoDatos('scrims.json'), log = console } = {}) {
  const base = urlApi.replace(/\/$/, '');
  let ofertas = [];           // { id, inicio (ISO), equipo, elo, formato, contacto, autor, nombre, mensaje, canal, creada }
  let avisos = [];            // { usuario, desde (ms), elo, guild }
  let filasAntes = 0;
  let cola = Promise.resolve();
  const enCola = fn => { const p = cola.then(fn); cola = p.catch(() => {}); return p; };
  const trabajos = new Set();
  const despues = fn => { const p = fn().catch(e => log.error('Scrims:', e.message)).finally(() => trabajos.delete(p)); trabajos.add(p); };

  async function pedir(metodo, ruta, cuerpo, { bot = true } = {}) {
    const r = await fetch(`${base}${ruta}`, { method: metodo,
      headers: { ...(bot && { Authorization: `Bot ${token}` }), 'User-Agent': AGENTE, ...(cuerpo && { 'Content-Type': 'application/json' }) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(`Discord respondió ${r.status} a ${metodo} ${ruta.replace(/\/webhooks\/\d+\/[^/]+/, '/webhooks/…')}: ${j.message || 'error'}`);
    }
    return r.status === 204 ? null : r.json();
  }
  const responderTarde = (i, datos) => pedir('PATCH', `/webhooks/${i.application_id}/${i.token}/messages/@original`, datos, { bot: false });

  const aFila = o => [o.id, o.inicio, o.equipo, o.elo, o.formato, o.contacto, '', o.autor, o.nombre, `${o.canal}/${o.mensaje}`, o.creada].map(s => (/^[=+\-@]/.test(String(s ?? '')) ? `'${s}` : String(s ?? '')));
  const deFila = f => { const [canal, mensaje] = String(f[9] || '').split('/'); return { id: f[0], inicio: f[1], equipo: f[2], elo: f[3], formato: f[4], contacto: f[5], autor: f[7], nombre: f[8], canal, mensaje, creada: f[10] }; };

  async function cargar() {
    try {
      if (hoja()) {
        await asegurar('Scrims', CABECERA);
        const filas = (await leerHoja('Scrims')).slice(1).filter(f => f[0]);
        filasAntes = filas.length + 1;
        ofertas = filas.map(deFila);
      } else ofertas = JSON.parse(await readFile(archivo, 'utf8'));
    } catch (e) {
      if (hoja()) log.error('Scrims: no se pudieron leer:', e.message);
      ofertas = [];
    }
  }
  const guardar = () => enCola(async () => {
    if (hoja()) {
      await asegurar('Scrims', CABECERA);
      const filas = [CABECERA, ...ofertas.map(aFila)];
      await escribirHoja('Scrims', filas, filasAntes);
      filasAntes = filas.length;
    } else {
      await mkdir(path.dirname(archivo), { recursive: true });
      await writeFile(archivo, JSON.stringify(ofertas, null, 1));
    }
  });

  const delServidor = i => ids()[i.guild_id] || {};
  const esStaff = i => Boolean((BigInt(i.member?.permissions || 0) & ADMINISTRADOR) || (delServidor(i)['rol:staff'] && i.member?.roles?.includes(delServidor(i)['rol:staff'])));
  const vivas = () => ofertas.filter(o => new Date(o.inicio).getTime() > ahora().getTime() - CADUCA_MS);

  function tarjeta(o) {
    return {
      embeds: [{ color: BERMELLON, title: `⚔️ ${o.equipo} busca scrim`, footer: { text: `Publicada por ${o.nombre} · se borra sola al empezar` },
        fields: [
          { name: '🕘 Cuándo', value: cuandoTexto(new Date(o.inicio)), inline: false },
          { name: '🏅 Elo', value: o.elo || '—', inline: true },
          { name: '🎮 Formato', value: o.formato || '—', inline: true },
          { name: '📨 Contacto', value: o.contacto || `<@${o.autor}>`, inline: false },
        ] }],
      components: [{ type: FILA, components: [{ type: BOTON, style: GRIS, custom_id: `scrims:retirar:${o.id}`, label: 'Retirar', emoji: { name: '🗑️' } }] }],
      allowed_mentions: { parse: [] },
    };
  }
  const enlace = (o, guild) => `https://discord.com/channels/${guild}/${o.canal}/${o.mensaje}`;

  async function borrarTarjeta(o) {
    if (!o.canal || !o.mensaje) return;
    try { await pedir('DELETE', `/channels/${o.canal}/messages/${o.mensaje}`); } catch (e) { if (!/404/.test(e.message)) log.error('Scrims: no he podido borrar una tarjeta:', e.message); }
  }

  // Se pasa cada pocos minutos (y al publicar): borra las tarjetas de las scrims que ya han empezado y los avisos viejos
  async function limpiar() {
    const t = ahora().getTime();
    const viejas = ofertas.filter(o => new Date(o.inicio).getTime() <= t - CADUCA_MS);
    avisos = avisos.filter(a => a.desde > t - CADUCA_MS);
    if (!viejas.length) return 0;
    ofertas = ofertas.filter(o => !viejas.includes(o));
    for (const o of viejas) await borrarTarjeta(o);
    await guardar();
    return viejas.length;
  }

  function publicar(i) {
    const inicio = cuando(valor(i, 'cuando'), ahora());
    if (!inicio) return aviso('No entiendo cuándo es. Prueba con algo como «jueves 20:00», «mañana 21h» o «14/11 19:30».');
    if (inicio.getTime() < ahora().getTime() - 5 * 60 * 1000) return aviso('Esa hora ya ha pasado.');
    if (inicio.getTime() > ahora().getTime() + 30 * 86400000) return aviso('Como mucho, con un mes de antelación.');
    const autor = i.member.user;
    if (!esStaff(i) && vivas().filter(o => o.autor === autor.id).length >= MAX_POR_PERSONA) return aviso(`Ya tienes ${MAX_POR_PERSONA} scrims publicadas: retira alguna antes de poner otra.`);
    const canal = delServidor(i)['canal:scrims'] || i.channel_id;
    const contactoYNotas = recortar(valor(i, 'contacto'), 300);
    const o = { id: crypto.randomBytes(5).toString('hex'), inicio: inicio.toISOString(), equipo: recortar(valor(i, 'equipo'), 60), elo: recortar(valor(i, 'elo'), 40),
      formato: recortar(valor(i, 'formato'), 60), contacto: contactoYNotas, autor: autor.id, nombre: recortar(autor.global_name || autor.username, 40), canal, mensaje: '', creada: ahora().toISOString() };
    despues(async () => {
      const m = await pedir('POST', `/channels/${canal}/messages`, tarjeta(o));
      o.mensaje = m.id;
      ofertas.push(o);
      await guardar();
      await responderTarde(i, { content: `Publicada: ${enlace(o, i.guild_id)}`, allowed_mentions: { parse: [] } });
      // Los avisos que encajan: una mención en #scrims, solo a esa persona
      const toca = avisos.filter(a => a.guild === i.guild_id && a.usuario !== autor.id && encaja(o, new Date(a.desde), a.elo));
      avisos = avisos.filter(a => !toca.includes(a));
      for (const a of toca) {
        await pedir('POST', `/channels/${canal}/messages`, { content: `🔔 <@${a.usuario}>, hay una scrim que te encaja: **${o.equipo}**, ${cuandoTexto(inicio)}.`,
          message_reference: { message_id: o.mensaje, fail_if_not_exists: false }, allowed_mentions: { parse: [], users: [a.usuario] } }).catch(e => log.error('Scrims: aviso:', e.message));
      }
    });
    return { type: DIFERIDA, data: { flags: SOLO_TU } };
  }

  function buscar(i) {
    const desde = cuando(valor(i, 'cuando'), ahora());
    if (!desde) return aviso('No entiendo cuándo. Prueba con algo como «jueves 20:00» o «mañana 21h».');
    const elo = valor(i, 'elo');
    const salen = vivas().filter(o => encaja(o, desde, elo)).sort((a, b) => a.inicio.localeCompare(b.inicio));
    if (!salen.length) return aviso(`Ahora mismo no hay ninguna scrim para ${cuandoTexto(desde)}${elo ? ` de ${elo}` : ''}. Pulsa **🔔 Avísame** y te menciono si sale una.`);
    return aviso(`Scrims para ${cuandoTexto(desde)}${elo ? ` (${elo})` : ''}:\n${salen.slice(0, 10).map(o => `• **${o.equipo}** · ${o.elo || '—'} · ${o.formato || '—'} · ${cuandoTexto(new Date(o.inicio))} → ${enlace(o, i.guild_id)}`).join('\n')}`);
  }

  function avisame(i) {
    const desde = cuando(valor(i, 'cuando'), ahora());
    if (!desde) return aviso('No entiendo cuándo. Prueba con algo como «viernes 21:00».');
    const elo = valor(i, 'elo');
    const yaHay = vivas().filter(o => encaja(o, desde, elo));
    avisos = avisos.filter(a => a.usuario !== i.member.user.id);   // uno a la vez por persona
    avisos.push({ usuario: i.member.user.id, desde: desde.getTime(), elo, guild: i.guild_id });
    return aviso(`Hecho: te menciono en #scrims si sale una scrim para ${cuandoTexto(desde)}${elo ? ` de ${elo}` : ''}.${yaHay.length ? ` Ojo, ya hay ${yaHay.length}: pulsa **🔎 Buscar scrim**.` : ''}`);
  }

  function retirar(i, id) {
    const o = ofertas.find(x => x.id === id);
    if (!o) return aviso('Esa scrim ya no está.');
    if (o.autor !== i.member.user.id && !esStaff(i)) return aviso('Solo puede retirarla quien la publicó o el staff.');
    ofertas = ofertas.filter(x => x !== o);
    despues(async () => { await borrarTarjeta(o); await guardar(); });
    return aviso('Retirada.');
  }

  // Un clic en un botón o una ventana de scrims (custom_id «scrims:…»)
  function atender(i) {
    if (!i.guild_id || !i.member) return aviso('Esto solo funciona dentro del servidor.');
    const [, accion, id] = String(i.data?.custom_id || '').split(':');
    if (accion in ventanas) return { type: VENTANA, data: ventanas[accion] };
    if (accion === 'nueva') return publicar(i);
    if (accion === 'busca') return buscar(i);
    if (accion === 'aviso') return avisame(i);
    if (accion === 'retirar') return retirar(i, id);
    return aviso('Este botón ya no funciona.');
  }

  let reloj = null;
  return {
    atender, cargar, limpiar,
    arrancar: () => { cargar().then(limpiar).catch(() => {}); reloj = setInterval(() => limpiar().catch(e => log.error('Scrims:', e.message)), 5 * 60 * 1000); reloj.unref?.(); },
    parar: () => clearInterval(reloj),
    ofertas: () => ofertas.slice(), avisos: () => avisos.slice(),
    esperar: () => Promise.all([...trabajos]),
  };
}
