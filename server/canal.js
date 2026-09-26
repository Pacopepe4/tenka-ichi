// Puntos del canal de Twitch → sobres del gachapon.
// El staff conecta el canal una vez desde el panel. La web crea la recompensa «Sobre de Tenka Ichi»
// y cada minuto recoge los canjes pendientes de la cola de Twitch: da el sobre y marca el canje como hecho.
// Como los canjes esperan en la cola de Twitch, no se pierde ninguno aunque la web esté dormida.
import { ajuste, guardarAjustes } from './ajustes.js';
import { cifrar, descifrar } from './sesion.js';
import { CANAL, ErrorTwitch, helix, refrescarToken, twitchActivo } from './twitch.js';
import { canjeProcesado, darSobres } from './gacha.js';

export const TITULO_RECOMPENSA = 'Sobre de Tenka Ichi';
export const SCOPE_CANAL = 'channel:manage:redemptions';
const COSTE_INICIAL = 3000;

let tokens = null;
const estado = { conectado: false, login: null, recompensa: null, coste: null, error: null, ultimoSondeo: null };

export async function cargarCanal() {
  const guardados = ajuste('canal_tokens');
  if (!guardados || !twitchActivo()) return;
  try { tokens = JSON.parse(descifrar(guardados)); }
  catch { estado.error = 'No se pudo leer la conexión del canal: vuelve a conectarlo desde el panel'; return; }
  Object.assign(estado, { conectado: true, login: ajuste('canal_login'), recompensa: ajuste('canal_recompensa'), coste: Number(ajuste('canal_coste')) || null });
  if (!estado.recompensa) await asegurarRecompensa();
  iniciarSondeo();
}

// Llama a Twitch con el token del canal y lo renueva si ha caducado
async function conToken(fn) {
  try { return await fn(tokens.access_token); }
  catch (e) {
    if (!(e instanceof ErrorTwitch) || e.estado !== 401) throw e;
    const nuevos = await refrescarToken(tokens.refresh_token);
    tokens = { access_token: nuevos.access_token, refresh_token: nuevos.refresh_token || tokens.refresh_token };
    await guardarAjustes({ canal_tokens: cifrar(JSON.stringify(tokens)) });
    return fn(tokens.access_token);
  }
}

export async function conectarCanal(t, usuario) {
  if (usuario.login.toLowerCase() !== CANAL) throw new Error(`Hay que conectar con la cuenta del canal (${CANAL}), no con ${usuario.login}`);
  tokens = { access_token: t.access_token, refresh_token: t.refresh_token };
  await guardarAjustes({ canal_tokens: cifrar(JSON.stringify(tokens)), canal_id: usuario.id, canal_login: usuario.login });
  Object.assign(estado, { conectado: true, login: usuario.login, error: null });
  await asegurarRecompensa();
  iniciarSondeo();
}

function explicar(e) {
  if (/DUPLICATE/i.test(e.message)) return `Ya hay en Twitch una recompensa llamada «${TITULO_RECOMPENSA}» creada a mano: bórrala para que la web cree la suya`;
  if (e.estado === 403) return 'Twitch no deja usar puntos del canal: el canal tiene que ser afiliado o partner';
  return e.message;
}

async function asegurarRecompensa() {
  const canal = ajuste('canal_id');
  try {
    const { data } = await conToken(tk => helix(`channel_points/custom_rewards?broadcaster_id=${canal}&only_manageable_rewards=true`, { token: tk }));
    let r = data.find(x => x.title === TITULO_RECOMPENSA);
    if (!r) {
      const creada = await conToken(tk => helix(`channel_points/custom_rewards?broadcaster_id=${canal}`, {
        token: tk, method: 'POST',
        body: { title: TITULO_RECOMPENSA, cost: COSTE_INICIAL, is_enabled: true,
          prompt: 'Un sobre de 3 cartas del gachapon de Tenka Ichi. Ábrelo en tenka-ichi.onrender.com/gachapon/ entrando con tu cuenta de Twitch.' },
      }));
      r = creada.data[0];
    }
    Object.assign(estado, { recompensa: r.id, coste: r.cost, error: null });
    await guardarAjustes({ canal_recompensa: r.id, canal_coste: r.cost });
  } catch (e) {
    estado.error = explicar(e);
  }
}

export async function cambiarCoste(coste) {
  const n = Math.round(Number(coste));
  if (!Number.isFinite(n) || n < 1) throw new Error('El coste tiene que ser un número de puntos mayor que 0');
  if (!estado.recompensa) throw new Error('Primero hay que conectar el canal de Twitch');
  const canal = ajuste('canal_id');
  const { data } = await conToken(tk => helix(`channel_points/custom_rewards?broadcaster_id=${canal}&id=${estado.recompensa}`, { token: tk, method: 'PATCH', body: { cost: n } }));
  estado.coste = data[0].cost;
  await guardarAjustes({ canal_coste: estado.coste });
}

// ---------- recogida de canjes ----------
let temporizador = null, sondeando = false;

function iniciarSondeo() {
  clearInterval(temporizador);
  temporizador = setInterval(() => sondear(), 60000);
  temporizador.unref();
  sondear();
}

export async function sondear() {
  if (!estado.conectado || !estado.recompensa || sondeando) return;
  sondeando = true;
  try {
    const canal = ajuste('canal_id');
    const base = `channel_points/custom_rewards/redemptions?broadcaster_id=${canal}&reward_id=${estado.recompensa}`;
    const { data } = await conToken(tk => helix(`${base}&status=UNFULFILLED&first=50`, { token: tk }));
    for (const c of data) if (!canjeProcesado(c.id)) await darSobres({ id: c.user_id, nombre: c.user_name }, 1, 'canje', c.id);
    if (data.length) {
      const ids = data.map(c => `id=${c.id}`).join('&');
      await conToken(tk => helix(`${base}&${ids}`, { token: tk, method: 'PATCH', body: { status: 'FULFILLED' } }));
    }
    Object.assign(estado, { error: null, ultimoSondeo: new Date().toISOString() });
    if (data.length === 50) setTimeout(() => sondear(), 2000);
  } catch (e) {
    estado.error = explicar(e);
  } finally {
    sondeando = false;
  }
}

// Cuando alguien entra en el gachapon, se recogen canjes si hace más de 20 s de la última vez
export function sondearSiHaceFalta() {
  if (!estado.ultimoSondeo || Date.now() - Date.parse(estado.ultimoSondeo) > 20000) sondear();
}

export const estadoCanal = () => ({ ...estado, canal: CANAL, titulo: TITULO_RECOMPENSA });
