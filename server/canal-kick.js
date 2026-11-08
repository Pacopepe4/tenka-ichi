// Puntos del canal de Kick → sobres del gachapon, con la recompensa «Omamori».
// Igual que con Twitch (server/canal.js): el staff conecta el canal una vez desde el panel, la web crea la recompensa
// y cada minuto recoge los canjes pendientes de la cola de Kick: da el sobre y acepta el canje.
// El sobre va a «kick-» y el id de Kick de quien canjea: si ha vinculado su Kick en el gachapon, le llega a su cuenta de
// siempre; si no, se le guarda y lo recibe en cuanto lo vincule (server/gacha.js).
// Los canjes esperan en la cola de Kick (pendientes) hasta que la web los acepta, así que no se pierde ninguno aunque la
// web esté dormida. Por eso la recompensa NO se salta la cola: un canje que se la salta ya no se puede listar.
import { ajuste, guardarAjustes } from './ajustes.js';
import { cifrar, descifrar } from './sesion.js';
import { CANAL_KICK, ErrorKick, api, examinarToken, kickActivo, refrescarToken, slugDe, usuariosPorId } from './kick.js';
import { canjeProcesado, darSobres } from './gacha.js';

export const TITULO_OMAMORI = 'Omamori';
// user:read para saber con qué cuenta se conecta (y los nombres de quien canjea); las recompensas, para crearla,
// cambiar su coste, listar los canjes y aceptarlos
export const SCOPE_CANAL_KICK = 'user:read channel:rewards:read channel:rewards:write';
const COSTE_INICIAL = 3000;
const COLOR = '#BE2A2F';   // el bermellón de la marca (--shu)
// Lo que lee el espectador en Kick al canjear (máximo 200 caracteres)
const TEXTO_OMAMORI = 'Un sobre de 4 cartas del gachapon de Gokudō. Entra en tenka-ichi.onrender.com/gachapon/ y vincula tu Kick: el sobre te llega en un minuto.';
export const idKick = userId => `kick-${userId}`;

let tokens = null;
const estado = { conectado: false, login: null, recompensa: null, coste: null, error: null, ultimoSondeo: null };

export async function cargarCanalKick() {
  const guardados = ajuste('kick_tokens');
  if (!guardados || !kickActivo()) return;
  try { tokens = JSON.parse(descifrar(guardados)); }
  catch { estado.error = 'No se pudo leer la conexión del canal de Kick: vuelve a conectarlo desde el panel'; return; }
  Object.assign(estado, { conectado: true, login: ajuste('kick_login'), recompensa: ajuste('kick_recompensa'), coste: Number(ajuste('kick_coste')) || null });
  await comprobarToken();
  if (!estado.conectado) return;
  await asegurarRecompensa();
  iniciarSondeo();
}

// El token del canal caduca y se renueva con el de refresco. Si Kick ya no acepta ni ese (permiso retirado), el canal
// queda desconectado hasta que se vuelva a conectar
async function renovar() {
  try {
    const nuevos = await refrescarToken(tokens.refresh_token);
    tokens = { access_token: nuevos.access_token, refresh_token: nuevos.refresh_token || tokens.refresh_token };
    await guardarAjustes({ kick_tokens: cifrar(JSON.stringify(tokens)) });
  } catch (e) {
    Object.assign(estado, { conectado: false,
      error: 'Kick ha cerrado la conexión del canal (permiso retirado o caducado): vuelve a conectarlo desde el panel' });
    clearInterval(temporizador);
    throw e;
  }
}

// Llama a Kick con el token del canal y lo renueva si ha caducado
async function conToken(fn) {
  try { return await fn(tokens.access_token); }
  catch (e) {
    if (!(e instanceof ErrorKick) || e.estado !== 401) throw e;
    await renovar();
    return fn(tokens.access_token);
  }
}

// Al arrancar: que el token siga valiendo (si no, se renueva) y que tenga los permisos de las recompensas
async function comprobarToken() {
  try {
    let t = await examinarToken(tokens.access_token).catch(e => { if (e.estado === 401) return { active: false }; throw e; });
    if (!t.active) { await renovar(); t = await examinarToken(tokens.access_token); }
    const permisos = String(t.scope || '').split(' ');
    if (!SCOPE_CANAL_KICK.split(' ').every(s => permisos.includes(s))) {
      estado.error = 'La conexión del canal de Kick no tiene permiso para las recompensas: vuelve a conectarlo desde el panel';
    }
  } catch (e) {
    if (estado.conectado) estado.error = explicar(e);
  }
}

// u: { user_id, name } de quien ha autorizado en Kick
export async function conectarCanalKick(t, u) {
  if (slugDe(u.name) !== CANAL_KICK) throw new Error(`Hay que conectar con la cuenta del canal (kick.com/${CANAL_KICK}), no con ${u.name}`);
  tokens = { access_token: t.access_token, refresh_token: t.refresh_token };
  await guardarAjustes({ kick_tokens: cifrar(JSON.stringify(tokens)), kick_id: String(u.user_id), kick_login: u.name });
  Object.assign(estado, { conectado: true, login: u.name, error: null });
  await asegurarRecompensa();
  iniciarSondeo();
}

function explicar(e) {
  if (e.estado === 403) return 'Kick no deja usar las recompensas con esta conexión: vuelve a conectar el canal desde el panel';
  return e.message;
}

// Busca la recompensa que creó la web (la guardada o, si no, una de la web con ese título) y si no hay, la crea.
// Solo la app que crea una recompensa puede cambiarla y aceptar sus canjes
async function asegurarRecompensa() {
  try {
    const { data = [] } = await conToken(tk => api('channels/rewards', { token: tk }));
    let r = data.find(x => x.id === estado.recompensa) || data.find(x => x.title === TITULO_OMAMORI && x.can_manage !== false);
    if (!r) {
      const creada = await conToken(tk => api('channels/rewards', {
        token: tk, method: 'POST',
        body: { title: TITULO_OMAMORI, cost: COSTE_INICIAL, description: TEXTO_OMAMORI, background_color: COLOR, is_enabled: true,
          is_user_input_required: false, should_redemptions_skip_request_queue: false },
      }));
      r = creada.data;
    }
    Object.assign(estado, { recompensa: r.id, coste: r.cost, error: null });
    await guardarAjustes({ kick_recompensa: r.id, kick_coste: r.cost });
  } catch (e) {
    if (estado.conectado) estado.error = /title|exist|duplic/i.test(e.message)
      ? `Ya hay en Kick una recompensa «${TITULO_OMAMORI}» creada a mano: bórrala para que la web cree la suya` : explicar(e);
  }
}

export async function cambiarCosteKick(coste) {
  const n = Math.round(Number(coste));
  if (!Number.isFinite(n) || n < 1) throw new Error('El coste tiene que ser un número de puntos mayor que 0');
  if (!estado.recompensa) throw new Error('Primero hay que conectar el canal de Kick');
  const { data } = await conToken(tk => api(`channels/rewards/${estado.recompensa}`, { token: tk, method: 'PATCH', body: { cost: n } }));
  estado.coste = data?.cost ?? n;
  await guardarAjustes({ kick_coste: estado.coste });
}

// ---------- recogida de canjes ----------
let temporizador = null, sondeando = false;

function iniciarSondeo() {
  clearInterval(temporizador);
  temporizador = setInterval(() => sondearKick(), 60000);
  temporizador.unref();
  sondearKick();
}

export async function sondearKick() {
  if (!estado.conectado || !estado.recompensa || sondeando) return;
  sondeando = true;
  try {
    // Los pendientes de la recompensa, página a página (vienen agrupados por recompensa)
    const pendientes = [];
    let cursor = '';
    for (let paginas = 0; paginas < 20; paginas++) {
      const q = `reward_id=${encodeURIComponent(estado.recompensa)}&status=pending${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const j = await conToken(tk => api(`channels/rewards/redemptions?${q}`, { token: tk }));
      for (const grupo of j.data || []) if (!grupo.reward || grupo.reward.id === estado.recompensa) pendientes.push(...(grupo.redemptions || []));
      cursor = j.pagination?.next_cursor || '';
      if (!cursor) break;
    }
    if (pendientes.length) {
      // El listado solo trae el id de quien canjea: el nombre se pide aparte (si falla, se apunta con el id)
      const ids = [...new Set(pendientes.map(c => String(c.redeemer?.user_id)).filter(Boolean))];
      const nombres = new Map();
      for (let i = 0; i < ids.length; i += 50) {
        const lote = await conToken(tk => usuariosPorId(ids.slice(i, i + 50), tk)).catch(() => []);
        for (const u of lote) nombres.set(String(u.user_id), u.name);
      }
      for (const c of pendientes) {
        const quien = String(c.redeemer?.user_id || '');
        if (!quien || canjeProcesado(c.id)) continue;
        await darSobres({ id: idKick(quien), nombre: nombres.get(quien) || `Kick ${quien}` }, 1, 'canje', c.id);
      }
      // Se aceptan de 25 en 25 (lo máximo que deja Kick). Los que fallan por no estar ya pendientes no importan:
      // el sobre ya está dado y no se da otra vez
      for (let i = 0; i < pendientes.length; i += 25) {
        await conToken(tk => api('channels/rewards/redemptions/accept', { token: tk, method: 'POST', body: { ids: pendientes.slice(i, i + 25).map(c => c.id) } }));
      }
    }
    Object.assign(estado, { error: null, ultimoSondeo: new Date().toISOString() });
  } catch (e) {
    if (estado.conectado) estado.error = explicar(e);  // si se ha desconectado, queda su aviso
  } finally {
    sondeando = false;
  }
}

// Cuando alguien entra en el gachapon, se recogen canjes si hace más de 20 s de la última vez
export function sondearKickSiHaceFalta() {
  if (!estado.ultimoSondeo || Date.now() - Date.parse(estado.ultimoSondeo) > 20000) sondearKick();
}

export const estadoCanalKick = () => ({ ...estado, canal: CANAL_KICK, titulo: TITULO_OMAMORI });
