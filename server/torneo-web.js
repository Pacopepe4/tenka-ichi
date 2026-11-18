// Los códigos de torneo (server/torneo.js) con lo de verdad: el calendario y el cuadro de la liga, las plantillas, los
// ajustes de Google Sheets, el bot de Discord de Gokudō y el guardado de estadísticas del fantasy.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearTorneo, partidosTemporada, AJUSTE } from './torneo.js';
import { calendarioActual } from './calendario.js';
import { competicion } from './competicion.js';
import { todas } from './registro.js';
import { clan } from './clanes.js';
import { plantilla } from './plantillas.js';
import { ajuste, guardarAjustes } from './ajustes.js';
import { guardarEstadisticas } from './fantasy.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leerJson = (archivo, defecto) => { try { return JSON.parse(readFileSync(path.join(RAIZ, archivo), 'utf8')); } catch { return defecto; } };

// Cada clan es la familia de Discord del mismo color (data-proyecto/familias.json → familia-1…)
function familiaDe(id) {
  const color = clan(id)?.color?.toLowerCase();
  return (leerJson('data-proyecto/familias.json', { familias: [] }).familias || []).find(f => String(f.color).toLowerCase() === color)?.id || null;
}

function discordDeGokudo({ token = process.env.DISCORD_BOT_TOKEN, urlApi = process.env.DISCORD_URL_API || 'https://discord.com/api/v10' } = {}) {
  const todos = leerJson('discord/ids.json', {});
  const guild = Object.keys(todos)[0];
  const ids = todos[guild] || {};
  if (!token || !guild || !ids['canal:tickets']) return null;
  async function pedir(metodo, ruta, cuerpo) {
    const r = await fetch(`${urlApi}${ruta}`, {
      method: metodo,
      headers: { Authorization: `Bot ${token}`, 'User-Agent': 'DiscordBot (https://gokudo.es, 1.0)', ...(cuerpo && { 'Content-Type': 'application/json' }) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(`Discord respondió ${r.status} a ${metodo} ${ruta}: ${j.message || 'error'}`);
    }
    return r.status === 204 ? null : r.json();
  }
  return {
    pedir, guild, canal: ids['canal:tickets'], rolJefes: ids['rol:jefes'],
    rolFamilia: c => ids[`familia:${familiaDe(c)}`] || null,
    // El chat del canal de voz privado de la familia (solo lo ven los suyos)
    chatFamilia: c => ids[`canal:familia:${familiaDe(c)}:voz-privado`] || null,
    // Opcional: { "KEMONO": ["id de Discord", …] } si el capitán no es el Oyabun (o el bot no puede leer los miembros)
    capitanes: c => [].concat(leerJson('data-proyecto/capitanes.json', {})[c] || []),
  };
}

const nombreDe = id => clan(id)?.nombre || id;

export const torneo = crearTorneo({
  leerAjuste: () => ajuste(AJUSTE),
  guardarAjuste: v => guardarAjustes({ [AJUSTE]: v }),
  partidos: horario => partidosTemporada({ calendario: calendarioActual(), cuadro: calendarioActual() ? competicion(calendarioActual(), todas()).cuadro : null, horario, nombreDe }),
  clan: id => ({ id, nombre: nombreDe(id) }),
  jugadoresDe: id => plantilla(id)?.jugadores || [],
  discord: discordDeGokudo(),
  guardarEstadisticas,
});

