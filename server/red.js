// La red de Gokudō (11/11/2026): otros servidores que invitan a SrDirector pueden recibir en un canal suyo las inhouses
// de Gokudō (y apuntarse desde allí). Hacen falta las dos partes, que es el permiso expreso que pidió Pacopepe:
//   1. El staff del otro servidor (con «Gestionar servidor») escribe /gokudo-red unirse canal:#… tipo:inhouses.
//   2. En #staff de Gokudō sale la petición con «Aprobar» / «Rechazar»; solo el staff de Gokudō decide.
// /gokudo-red salir tipo:… lo quita. Se guarda en la pestaña «Red» de Google Sheets (sin hoja, en data/red.json).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { archivoDatos } from './datos.js';
import { hojaActiva, asegurarPestana, leer, escribirEncima } from './sheets.js';

const AGENTE = 'DiscordBot (https://tenka-ichi.onrender.com, 1.0)';
const BERMELLON = 0xBE2A2F;
const MENSAJE = 4, SOLO_TU = 64, FILA = 1, BOTON = 2, VERDE = 3, ROJO = 4;
const ADMINISTRADOR = 1n << 3n, GESTIONAR_SERVIDOR = 1n << 5n;
export const TIPOS_RED = { inhouses: 'inhouses' };
const CABECERA = ['Guild', 'Nombre', 'Tipo', 'Canal', 'Estado', 'Fecha', 'Quien'];

// El comando global (lo registra discord-aplicar: comandosGlobales de discord/servidor.json)
export const COMANDO_RED = {
  name: 'gokudo-red', description: 'Conecta este servidor a la red de Gokudō (inhouses)', default_member_permissions: String(GESTIONAR_SERVIDOR), dm_permission: false,
  options: [
    { type: 1, name: 'unirse', description: 'Recibir en un canal de este servidor las inhouses de Gokudō', options: [
      { type: 7, name: 'canal', description: 'El canal donde saldrán', required: true, channel_types: [0] },
      { type: 3, name: 'tipo', description: 'Qué recibir', required: true, choices: [{ name: 'Inhouses', value: 'inhouses' }] },
    ] },
    { type: 1, name: 'salir', description: 'Dejar de recibir algo de la red de Gokudō', options: [
      { type: 3, name: 'tipo', description: 'Qué dejar de recibir', required: true, choices: [{ name: 'Inhouses', value: 'inhouses' }] },
    ] },
  ],
};

const aviso = texto => ({ type: MENSAJE, data: { content: texto, flags: SOLO_TU, allowed_mentions: { parse: [] } } });

export function crearRed({ token, urlApi, ids, ahora = () => new Date(), hoja = hojaActiva, asegurar = asegurarPestana, leerHoja = leer, escribirHoja = escribirEncima,
  archivo = archivoDatos('red.json'), log = console, paneles = {} } = {}) {
  const base = urlApi.replace(/\/$/, '');
  let servidores = [];   // { guild, nombre, tipo, canal, estado: pendiente | activa | rechazada, fecha, quien }
  let filasAntes = 0;
  let cola = Promise.resolve();
  const enCola = fn => { const p = cola.then(fn); cola = p.catch(() => {}); return p; };
  const trabajos = new Set();
  const despues = fn => { const p = fn().catch(e => log.error('Red:', e.message)).finally(() => trabajos.delete(p)); trabajos.add(p); };

  async function pedir(metodo, ruta, cuerpo) {
    const r = await fetch(`${base}${ruta}`, { method: metodo, headers: { Authorization: `Bot ${token}`, 'User-Agent': AGENTE, ...(cuerpo && { 'Content-Type': 'application/json' }) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(`Discord respondió ${r.status} a ${metodo} ${ruta}: ${j.message || 'error'}`); }
    return r.status === 204 ? null : r.json();
  }

  async function cargar() {
    try {
      if (hoja()) {
        await asegurar('Red', CABECERA);
        const filas = (await leerHoja('Red')).slice(1).filter(f => f[0]);
        filasAntes = filas.length + 1;
        servidores = filas.map(f => ({ guild: f[0], nombre: f[1], tipo: f[2], canal: f[3], estado: f[4], fecha: f[5], quien: f[6] }));
      } else servidores = JSON.parse(await readFile(archivo, 'utf8'));
    } catch (e) {
      if (hoja()) log.error('Red: no se pudo leer:', e.message);
      servidores = [];
    }
  }
  const guardar = () => enCola(async () => {
    if (hoja()) {
      await asegurar('Red', CABECERA);
      const filas = [CABECERA, ...servidores.map(s => [s.guild, s.nombre, s.tipo, s.canal, s.estado, s.fecha, s.quien].map(x => String(x ?? '').replace(/^([=+\-@])/, "'$1")))];
      await escribirHoja('Red', filas, filasAntes);
      filasAntes = filas.length;
    } else {
      await mkdir(path.dirname(archivo), { recursive: true });
      await writeFile(archivo, JSON.stringify(servidores, null, 1));
    }
  });

  // Gokudō es el servidor de discord/ids.json; los demás, los de la red
  const casa = () => Object.keys(ids())[0];
  const esCasa = guild => guild === casa();
  const staffCasa = i => i.guild_id === casa() && Boolean((BigInt(i.member?.permissions || 0) & ADMINISTRADOR) || (ids()[casa()]?.['rol:staff'] && i.member?.roles?.includes(ids()[casa()]['rol:staff'])));

  // Dónde sale cada cosa: el canal de Gokudō (canal:<tipo> en ids.json) y los de los servidores aprobados
  function canales(tipo) {
    const propio = ids()[casa()]?.[`canal:${tipo}`];
    return [...(propio ? [{ guild: casa(), canal: propio, nombre: 'Gokudō' }] : []),
      ...servidores.filter(s => s.tipo === tipo && s.estado === 'activa').map(s => ({ guild: s.guild, canal: s.canal, nombre: s.nombre }))];
  }

  // /gokudo-red unirse | salir (en otro servidor, con «Gestionar servidor»)
  async function comando(i) {
    if (!i.guild_id || !i.member) return aviso('Esto se usa dentro de un servidor.');
    if (esCasa(i.guild_id)) return aviso('Este es el servidor de Gokudō: aquí todo sale ya en sus canales.');
    const permisos = BigInt(i.member.permissions || 0);
    if (!(permisos & (ADMINISTRADOR | GESTIONAR_SERVIDOR))) return aviso('Solo el staff de este servidor (con «Gestionar servidor») puede conectarlo a la red.');
    const sub = i.data.options?.[0];
    const opcion = n => sub?.options?.find(o => o.name === n)?.value;
    const tipo = opcion('tipo');
    if (!TIPOS_RED[tipo]) return aviso('Ese tipo no existe.');
    if (sub?.name === 'salir') {
      const antes = servidores.length;
      servidores = servidores.filter(s => !(s.guild === i.guild_id && s.tipo === tipo));
      if (antes === servidores.length) return aviso('Este servidor no estaba en la red para eso.');
      await guardar();
      return aviso(`Hecho: este servidor ya no recibe ${tipo} de Gokudō.`);
    }
    const canal = opcion('canal');
    let nombre = 'otro servidor';
    try { nombre = (await pedir('GET', `/guilds/${i.guild_id}`)).name; } catch {}
    servidores = servidores.filter(s => !(s.guild === i.guild_id && s.tipo === tipo));
    const s = { guild: i.guild_id, nombre, tipo, canal, estado: 'pendiente', fecha: ahora().toISOString(), quien: i.member.user?.username || '' };
    servidores.push(s);
    await guardar();
    // La petición, a #staff de Gokudō, con los botones para aprobarla
    const staff = ids()[casa()]?.['canal:staff'];
    if (staff) {
      await pedir('POST', `/channels/${staff}/messages`, {
        embeds: [{ color: BERMELLON, title: '🌐 Petición para la red de Gokudō', description: `**${nombre}** quiere recibir **${tipo}** de Gokudō en su canal <#${canal}>.\nLo pide ${s.quien}.` }],
        components: [{ type: FILA, components: [
          { type: BOTON, style: VERDE, custom_id: `red:aprobar:${i.guild_id}:${tipo}`, label: 'Aprobar' },
          { type: BOTON, style: ROJO, custom_id: `red:rechazar:${i.guild_id}:${tipo}`, label: 'Rechazar' },
        ] }], allowed_mentions: { parse: [] } }).catch(e => log.error('Red: no he podido avisar al staff:', e.message));
    }
    return aviso(`Petición enviada: cuando el staff de Gokudō la apruebe, las ${tipo} saldrán en <#${canal}>. SrDirector necesita poder ver ese canal y escribir en él.`);
  }

  // «Aprobar» / «Rechazar» en #staff de Gokudō
  function boton(i) {
    if (!staffCasa(i)) return aviso('Solo el staff de Gokudō decide quién entra en la red.');
    const [, accion, guild, tipo] = String(i.data.custom_id).split(':');
    const s = servidores.find(x => x.guild === guild && x.tipo === tipo);
    if (!s) return aviso('Esa petición ya no existe.');
    s.estado = accion === 'aprobar' ? 'activa' : 'rechazada';
    despues(async () => {
      await guardar();
      if (s.estado === 'activa') {
        await pedir('POST', `/channels/${s.canal}/messages`, { embeds: [{ color: BERMELLON, title: '🌐 Conectado a la red de Gokudō',
          description: `A partir de ahora, las ${tipo} de Gokudō salen aquí y os podéis apuntar con sus botones.` }], allowed_mentions: { parse: [] } })
          .catch(e => log.error('Red: no puedo escribir en el canal del otro servidor:', e.message));
        // Y el mensaje fijo con los botones (para que su staff pueda convocar desde allí)
        if (paneles[tipo]) await pedir('POST', `/channels/${s.canal}/messages`, paneles[tipo]()).catch(e => log.error('Red: panel:', e.message));
      }
    });
    return { type: 7, data: { components: [], embeds: [{ color: BERMELLON, title: '🌐 Petición para la red de Gokudō',
      description: `**${s.nombre}** · ${tipo} · ${s.estado === 'activa' ? `✅ aprobada por <@${i.member.user.id}>` : `❌ rechazada por <@${i.member.user.id}>`}` }], allowed_mentions: { parse: [] } } };
  }

  return { cargar, comando, boton, canales, casa, servidores: () => servidores.slice(), esperar: () => Promise.all([...trabajos]) };
}
