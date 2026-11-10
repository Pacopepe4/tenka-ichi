// Publica en #tickets el mensaje fijo con el botón «Abrir ticket» (server/tickets.js atiende los clics). Si ya lo
// publicó antes (su id está en discord/ids.json como «mensaje:tickets»), lo actualiza en vez de poner otro.
// No toca nada más del servidor. El canal lo crea npm run discord-aplicar -- --crear.
//   npm run discord-tickets -- --prueba                       → solo dice lo que haría
//   npm run discord-tickets -- --env ../draft-app-discord/.env → con el token del bot de otro .env
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { crearApi, ErrorDiscord } from './discord-aplicar.js';
import { mensajePanel } from '../server/tickets.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function publicarPanel({ api, archivoIds = path.join(RAIZ, 'discord/ids.json'), guildId = null, prueba = false, log = console.log }) {
  const ids = JSON.parse(readFileSync(archivoIds, 'utf8'));
  if (!guildId) {
    const servidores = Object.keys(ids);
    if (servidores.length !== 1) throw new Error('discord/ids.json tiene varios servidores: pon DISCORD_GUILD_ID en el .env');
    guildId = servidores[0];
  }
  const delServidor = ids[guildId] || {};
  const canal = delServidor['canal:tickets'];
  if (!canal) throw new Error('No está el canal #tickets en discord/ids.json: créalo antes con npm run discord-aplicar -- --crear');
  const mensaje = mensajePanel();
  const ya = delServidor['mensaje:tickets'];
  if (ya) {
    try {
      if (!prueba) await api.patch(`/channels/${canal}/messages/${ya}`, mensaje);
      log(`${prueba ? 'Actualizaría' : 'Actualizado'} el mensaje de «Abrir ticket» en #tickets.`);
      return { canal, mensaje: ya, nuevo: false };
    } catch (e) {
      if (!(e instanceof ErrorDiscord) || !/404/.test(e.message)) throw e;
      log('El mensaje de antes ya no está: se publica otro.');
    }
  }
  if (prueba) {
    log('Publicaría en #tickets el mensaje con el botón «Abrir ticket».');
    return { canal, mensaje: null, nuevo: true };
  }
  const m = await api.post(`/channels/${canal}/messages`, mensaje);
  ids[guildId] = { ...delServidor, 'mensaje:tickets': m.id };
  writeFileSync(archivoIds, JSON.stringify(ids, null, 2) + '\n');
  log('Publicado en #tickets el mensaje con el botón «Abrir ticket» (su id queda en discord/ids.json).');
  return { canal, mensaje: m.id, nuevo: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argumentos = process.argv.slice(2);
  const iEnv = argumentos.indexOf('--env');
  const archivoEnv = iEnv >= 0 && argumentos[iEnv + 1] ? path.resolve(argumentos[iEnv + 1]) : path.join(RAIZ, '.env');
  if (iEnv >= 0 && !existsSync(archivoEnv)) { console.error(`No existe el .env que se ha pedido: ${archivoEnv}`); process.exit(1); }
  if (existsSync(archivoEnv)) process.loadEnvFile(archivoEnv);
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) { console.error('Falta DISCORD_BOT_TOKEN en el .env'); process.exit(1); }
  try {
    await publicarPanel({ api: crearApi({ token, base: process.env.DISCORD_URL_API }), guildId: process.env.DISCORD_GUILD_ID || null, prueba: argumentos.includes('--prueba') });
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
