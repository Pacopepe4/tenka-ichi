// Las estadísticas de los jugadores en KB Stats (https://www.kbstats.es, la web de estadísticas de la Liga KB), para que
// la IA de los tickets pueda contestar «¿qué KDA tiene tal?». KB Stats no tiene API: se lee la tabla de /jugadores/ y,
// para saber el equipo de cada uno, la página de cada equipo. Se guarda en memoria y se vuelve a leer cada 6 horas; si
// falla, se sigue con lo último que se leyó. Con TICKETS_KBSTATS=0 no se lee. A la IA solo le llegan las filas de los
// jugadores por los que se pregunta (eso lo elige server/tickets.js).
const BASE = 'https://www.kbstats.es';
const CADA_MS = 6 * 3600 * 1000;
const REINTENTO_MS = 10 * 60 * 1000;
const AGENTE = 'GokudoTickets/1.0 (+https://tenka-ichi.onrender.com)';
const ROLES = { TOP: 'Top', JGL: 'Jungla', JUNGLE: 'Jungla', MID: 'Medio', ADC: 'ADC', BOT: 'ADC', SUP: 'Support', SUPPORT: 'Support' };

const entidades = s => s.replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
const texto = html => entidades(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

// La tabla de /jugadores/: una fila por jugador, con las columnas por su nombre de la cabecera
export function leerJugadores(html) {
  const cabeza = /<thead[\s\S]*?<\/thead>/.exec(html)?.[0] || '';
  const columnas = [...cabeza.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(m => texto(m[1]).replace(/[▼▲]/g, '').trim());
  const cuerpo = /<tbody[\s\S]*?<\/tbody>/.exec(html)?.[0] || '';
  return cuerpo.split(/<tr[\s>]/).slice(1).map(fila => {
    const nom = /class="nom">([^<]*)/.exec(fila)?.[1];
    if (!nom) return null;
    const celdas = [...fila.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => texto(m[1]));
    const datos = Object.fromEntries(columnas.map((c, i) => [c, celdas[i] ?? '']));
    const rol = /r-([A-Z]+)/.exec(fila)?.[1];
    return { jugador: entidades(nom.trim()) + entidades((/class="tag">([^<]*)/.exec(fila)?.[1] || '').trim()), rol: ROLES[rol] || rol || '', datos };
  }).filter(Boolean);
}

// Los equipos que salen en la portada (/equipo/<nombre>/) y, en la página de cada uno, sus jugadores
export const leerEquipos = html => [...new Set([...html.matchAll(/href="\/equipo\/([^"/]+)\/"/g)].map(m => m[1]))];
export const jugadoresDeEquipo = html => [...new Set([...html.matchAll(/href="\/jugador\/([^"/]+)\/"/g)].map(m => decodeURIComponent(m[1])))];
export const temporadaDe = html => /Temporada\s+\d+\s*·\s*[^<·]+/.exec(html)?.[0]?.trim() || '';

// Una línea corta por jugador, con lo que suele preguntar la gente. 'nombre' (sin la etiqueta ni el «KB» de delante)
// sirve para buscarlo y 'rol' para quedarse con los de un rol
export function filasJugadores(jugadores, equipos) {
  const d = (j, c) => j.datos[c] || '?';
  return jugadores.map(j => ({
    nombre: j.jugador.replace(/#.*$/, '').replace(/^KB\s+/i, '').trim(),
    rol: j.rol,
    texto: `- ${j.jugador} · ${equipos.get(j.jugador) || 'sin equipo'} · ${j.rol} · nota ${d(j, 'Nota')} · ${d(j, 'Partidas')} partidas · ${d(j, '% WR')} victorias · KDA ${d(j, 'KDA')} (${d(j, 'K')}/${d(j, 'D')}/${d(j, 'A')} de media) · KP ${d(j, 'KP')} · MVP ${d(j, 'MVP')} · CS/min ${d(j, 'CS/min')} · daño/min ${d(j, 'Daño/min')} · visión/min ${d(j, 'Visión/min')}`,
  }));
}

export const cabeceraKb = temporada => `Estadísticas de la Liga KB${temporada ? ` (${temporada})` : ''}, sacadas de ${BASE}. Los nombres son los de su cuenta de LoL (nombre#etiqueta) y el equipo es el de la Liga KB, que no es su familia de Gokudō: para saber quién es quién, compara el nombre con el de las plantillas.`;

export function crearKbStats({ base = BASE, pedir = fetch, ahora = () => Date.now(), activo = process.env.TICKETS_KBSTATS !== '0', log = console } = {}) {
  let guardado = null;     // { cabecera, filas, cuando }
  let fallo = -Infinity;   // cuándo falló la última vez (para no insistir en cada pregunta)
  let enCurso = null;

  async function leer(ruta) {
    const r = await pedir(`${base}${ruta}`, { headers: { 'User-Agent': AGENTE }, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`KB Stats respondió ${r.status} a ${ruta}`);
    return r.text();
  }

  async function refrescar() {
    try {
      const [portada, tabla] = await Promise.all([leer('/'), leer('/jugadores/')]);
      const jugadores = leerJugadores(tabla);
      if (!jugadores.length) throw new Error('la tabla de /jugadores/ ha cambiado y no se entiende');
      const equipos = new Map();
      // De tres en tres: KB Stats va lento y, con todas a la vez, no contesta a la mitad
      const pendientes = leerEquipos(portada);
      await Promise.all(Array.from({ length: 3 }, async () => {
        for (let e; (e = pendientes.shift());) {
          try {
            for (const j of jugadoresDeEquipo(await leer(`/equipo/${e}/`))) if (!equipos.has(j)) equipos.set(j, decodeURIComponent(e));
          } catch (err) { log.error('KB Stats:', err.message); }
        }
      }));
      guardado = { cabecera: cabeceraKb(temporadaDe(portada)), filas: filasJugadores(jugadores, equipos), cuando: ahora() };
    } catch (e) {
      fallo = ahora();
      log.error('KB Stats: no se ha podido leer:', e.message);
    } finally {
      enCurso = null;
    }
  }

  // Lo leído ({ cabecera, filas }, o null). La primera vez espera a leerlo; después, si es viejo, da lo que hay y lo
  // renueva por detrás
  async function datos() {
    if (!activo) return null;
    const viejo = !guardado || ahora() - guardado.cuando > CADA_MS;
    const puede = ahora() - fallo > REINTENTO_MS;
    if (viejo && puede && !enCurso) enCurso = refrescar();
    if (!guardado && enCurso) await enCurso;
    return guardado ? { cabecera: guardado.cabecera, filas: guardado.filas } : null;
  }

  return { datos, esperar: () => enCurso || Promise.resolve() };
}
