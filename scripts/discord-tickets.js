// Publica el mensaje fijo de SrDirector con sus botones: el de #tickets («Abrir ticket», server/tickets.js) o, con
// --panel scrims, el de #scrims («Publicar», «Buscar» y «Avísame», server/scrims.js). Si ya lo publicó antes (su id
// está en discord/ids.json como «mensaje:<panel>»), lo actualiza en vez de poner otro. No toca nada más del servidor.
// El canal lo crea npm run discord-aplicar -- --crear.
//   npm run discord-tickets -- --prueba                       → solo dice lo que haría
//   npm run discord-tickets -- --env ../draft-app-discord/.env → con el token del bot de otro .env
//   npm run discord-scrims -- --env ../draft-app-discord/.env  → el de #scrims
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { crearApi, ErrorDiscord } from './discord-aplicar.js';
import { mensajePanel } from '../server/tickets.js';
import { mensajePanelScrims } from '../server/scrims.js';
import { mensajePanelInhouses } from '../server/inhouses.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PANELES = {
  tickets: { mensaje: mensajePanel, que: 'el botón «Abrir ticket»' },
  scrims: { mensaje: mensajePanelScrims, que: 'los botones de scrims' },
  inhouses: { mensaje: mensajePanelInhouses, que: 'los botones de inhouses' },
};

export async function publicarPanel({ api, archivoIds = path.join(RAIZ, 'discord/ids.json'), guildId = null, prueba = false, log = console.log, panel = 'tickets' }) {
  if (!PANELES[panel]) throw new Error(`No conozco el panel «${panel}» (${Object.keys(PANELES).join(' o ')})`);
  const ids = JSON.parse(readFileSync(archivoIds, 'utf8'));
  if (!guildId) {
    const servidores = Object.keys(ids);
    if (servidores.length !== 1) throw new Error('discord/ids.json tiene varios servidores: pon DISCORD_GUILD_ID en el .env');
    guildId = servidores[0];
  }
  const delServidor = ids[guildId] || {};
  const canal = delServidor[`canal:${panel}`];
  if (!canal) throw new Error(`No está el canal #${panel} en discord/ids.json: créalo antes con npm run discord-aplicar -- --crear`);
  const mensaje = PANELES[panel].mensaje();
  const que = PANELES[panel].que;
  const ya = delServidor[`mensaje:${panel}`];
  if (ya) {
    try {
      if (!prueba) await api.patch(`/channels/${canal}/messages/${ya}`, mensaje);
      log(`${prueba ? 'Actualizaría' : 'Actualizado'} el mensaje con ${que} en #${panel}.`);
      return { canal, mensaje: ya, nuevo: false };
    } catch (e) {
      if (!(e instanceof ErrorDiscord) || !/404/.test(e.message)) throw e;
      log('El mensaje de antes ya no está: se publica otro.');
    }
  }
  if (prueba) {
    log(`Publicaría en #${panel} el mensaje con ${que}.`);
    return { canal, mensaje: null, nuevo: true };
  }
  const m = await api.post(`/channels/${canal}/messages`, mensaje);
  ids[guildId] = { ...delServidor, [`mensaje:${panel}`]: m.id };
  writeFileSync(archivoIds, JSON.stringify(ids, null, 2) + '\n');
  log(`Publicado en #${panel} el mensaje con ${que} (su id queda en discord/ids.json).`);
  return { canal, mensaje: m.id, nuevo: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argumentos = process.argv.slice(2);
  const iEnv = argumentos.indexOf('--env');
  const archivoEnv = iEnv >= 0 && argumentos[iEnv + 1] ? path.resolve(argumentos[iEnv + 1]) : path.join(RAIZ, '.env');
  if (iEnv >= 0 && !existsSync(archivoEnv)) { console.error(`No existe el .env que se ha pedido: ${archivoEnv}`); process.exit(1); }
  if (existsSync(archivoEnv)) process.loadEnvFile(archivoEnv);
  const iPanel = argumentos.indexOf('--panel');
  const panel = iPanel >= 0 ? argumentos[iPanel + 1] : 'tickets';
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) { console.error('Falta DISCORD_BOT_TOKEN en el .env'); process.exit(1); }
  try {
    await publicarPanel({ api: crearApi({ token, base: process.env.DISCORD_URL_API }), guildId: process.env.DISCORD_GUILD_ID || null, prueba: argumentos.includes('--prueba'), panel });
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
