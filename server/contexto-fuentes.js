// Lo que se guarda en el contexto de los bots (server/contexto.js), en trozos de como mucho unas 1800 letras:
//   ficha        discord/tickets-saber.md, menos el núcleo (que va siempre en el papel de SrDirector)
//   lore         discord/lore.md (copia entera de gokudo/diseno/teasers-familias/LORE.md, pedido el 21/11/2026)
//   kb           discord/kbstats-jugadores.md: un trozo por jugador de KB Stats que tenga algo rellenado
//   plantillas   las familias con su lema y sus jugadores por rol (la pestaña «Plantillas»)
//   fichas       discord/fichas-miembros.md, el cuestionario de gokudo/contexto/cuestionario-miembros.md ya contestado
//                por Pacopepe: un trozo por persona. La pregunta 10 («lo que el bot NO debe decir nunca») va dentro
//                y SrDirector la respeta como un tema que no saca
//   memoria      lo que aprende SrDirector hablando, con el rango de quien lo dijo (la pestaña «SrDirector»)
//   cronicas     cada crónica de partida, en cuanto llega a POST /api/cronicas/partida
// Al arrancar se sincroniza todo (solo se recalcula lo que ha cambiado) y luego cada 10 minutos, además de cada crónica
// nueva y cada dato aprendido al momento.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerFichaKb, normalizar, nombra } from './tickets-ramas.js';
import { RANGOS } from './tickets-memoria.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MAX_TROZO = 1800;
const ROL = { TOP: 'Top', JUNGLA: 'Jungla', MEDIO: 'Medio', ADC: 'ADC', SUPPORT: 'Support' };
const ORDEN_ROLES = ['TOP', 'JUNGLA', 'MEDIO', 'ADC', 'SUPPORT'];

const clave = s => normalizar(s).replace(/ /g, '-').slice(0, 80) || 'x';
const sinComentarios = s => String(s || '').replace(/<!--[\s\S]*?-->/g, '').trim();

// Parte un texto largo por párrafos (y, si un párrafo solo ya es muy largo, por frases) en trozos de como mucho 'max'
export function partir(texto, max = MAX_TROZO) {
  const cortar = s => (s.length <= max ? [s] : Array.from({ length: Math.ceil(s.length / max) }, (_, i) => s.slice(i * max, (i + 1) * max)));
  const piezas = String(texto).split(/\n\s*\n/).flatMap(p => (p.length <= max ? [p] : p.split(/(?<=[.!?])\s+/).flatMap(cortar)));
  const trozos = [];
  let actual = '';
  for (const p of piezas) {
    if (actual && actual.length + p.length + 2 > max) { trozos.push(actual); actual = ''; }
    actual = actual ? `${actual}\n\n${p}` : p;
  }
  if (actual.trim()) trozos.push(actual);
  return trozos.map(t => t.trim()).filter(Boolean);
}

// Un markdown en trozos, uno por apartado («## » y «### »), con el título de su apartado padre delante.
// 'saltar(rama, titulo)' deja fuera apartados (el núcleo de la ficha, por ejemplo)
export function trozosMarkdown(md, { prefijo = '', saltar = () => false } = {}) {
  const lineas = String(md || '').replace(/\r/g, '').split('\n');
  const apartados = [];
  let padre = '', actual = { titulo: prefijo || 'Introducción', rama: '', lineas: [] };
  for (const l of lineas) {
    const m = /^(#{1,3})\s+(.*)$/.exec(l);
    if (m) {
      apartados.push(actual);
      const rama = /<!--\s*([\w-]+)\s*-->/.exec(m[2])?.[1] || '';
      const titulo = sinComentarios(m[2]);
      if (m[1].length <= 2) padre = titulo;
      actual = { titulo: m[1].length === 3 && padre ? `${padre} · ${titulo}` : titulo, rama: rama || (m[1].length === 3 ? actual.rama : ''), lineas: [] };
      continue;
    }
    actual.lineas.push(l);
  }
  apartados.push(actual);
  const trozos = [];
  for (const a of apartados) {
    if (saltar(a.rama, a.titulo)) continue;
    const texto = sinComentarios(a.lineas.join('\n'));
    if (!texto) continue;
    const titulo = prefijo && a.titulo !== prefijo ? `${prefijo} · ${a.titulo}` : a.titulo;
    partir(texto).forEach((t, i) => trozos.push({ clave: `${clave(a.titulo)}${i ? `-${i + 1}` : ''}`, titulo, texto: t, rama: a.rama }));
  }
  return trozos;
}

// La ficha (tickets-saber.md) sin el núcleo, que ya va en el papel de SrDirector
export const trozosFicha = md => trozosMarkdown(md, { prefijo: 'Ficha de Gokudō', saltar: rama => rama === 'nucleo' });
export const trozosLore = md => trozosMarkdown(md, { prefijo: 'Lore' });

// La lista de KB Stats: un trozo por jugador con algo rellenado (quién es en Gokudō o su lore)
export function trozosKb(md) {
  return leerFichaKb(md).filter(f => f.gokudo || f.lore).map(f => ({
    clave: clave(f.cuenta), titulo: `Liga KB · ${f.cuenta}`,
    texto: [`${f.nombre} juega en la Liga KB con la cuenta ${f.cuenta}.`, f.gokudo && `En Gokudō es ${f.gokudo}.`, f.lore].filter(Boolean).join(' '),
  }));
}

// Las plantillas: un trozo por familia, con el lema, la descripción, los jugadores por rol y los suplentes
export function trozosPlantillas(clanes) {
  return (clanes || []).filter(c => !c.invitado).map(c => {
    const jugadores = ORDEN_ROLES.map((r, i) => (c.jugadores?.[i] ? `${ROL[r]}: ${c.jugadores[i]}` : null)).filter(Boolean);
    const suplentes = (Array.isArray(c.suplentes) ? c.suplentes : String(c.suplentes || '').split(/[,;]/)).map(s => String(s).trim()).filter(Boolean);
    return {
      clave: String(c.id), titulo: `Plantilla de la familia ${c.nombre}`,
      texto: [`Familia ${c.nombre}${c.kanji ? ` (${c.kanji})` : ''}${c.legacy ? ', la familia Legacy: ya no compite' : ''}.`, c.lema && `Lema: «${c.lema}».`, c.descripcion,
        jugadores.length ? `Jugadores: ${jugadores.join(' · ')}.` : 'Aún no tiene jugadores apuntados.', suplentes.length && `Suplentes: ${suplentes.join(', ')}.`].filter(Boolean).join(' '),
    };
  });
}

// Las fichas del cuestionario contestado (se contesta debajo de cada pregunta): se quitan las preguntas sin nada debajo
// y queda un trozo por persona («### ») o por bloque («## A. La organización»)
export function quitarSinRespuesta(texto) {
  const lineas = String(texto).replace(/\r/g, '').split('\n');
  const pregunta = l => /^\s*\d+\.\s/.test(l);
  const fuera = new Set();
  for (let i = 0; i < lineas.length; i++) {
    if (!pregunta(lineas[i])) continue;
    let j = i + 1;
    while (j < lineas.length && !lineas[j].trim()) j++;
    if (!(j < lineas.length && !pregunta(lineas[j]) && !/^#/.test(lineas[j]))) fuera.add(i);
  }
  return lineas.filter((_, i) => !fuera.has(i)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
// Valen las dos formas: el cuestionario contestado (preguntas numeradas, la respuesta debajo) y las fichas ya pasadas a
// limpio (discord/fichas-miembros.md desde el 21/11: «## GAATSU · Top · Ryūjin» y una línea «- **Tono…:** …» por dato).
// La entradilla del archivo (sin preguntas ni datos) no entra
export function trozosFichas(md) {
  return trozosMarkdown(md, { prefijo: 'Ficha' })
    .map(t => ({ ...t, texto: quitarSinRespuesta(t.texto) }))
    .filter(t => t.texto && /(^|\n)\s*(\d+\.\s|- \*\*[^*]+:\*\*)/.test(t.texto) && !/^Introducción/.test(t.titulo.replace(/^Ficha · /, '')));
}

// La ficha de quien habla con el bot, para hablarle con el tono que pidió y no sacar lo que no quiere: se busca por el
// nombre del apartado («## GAATSU · …») y por cómo se le llama en la comunidad. Devuelve { nombre, tono, noSacar } o null
export function leerFichas(md) {
  return String(md || '').replace(/\r/g, '').split(/^(?=## )/m).filter(b => b.startsWith('## ')).map(b => {
    const dato = re => (re.exec(b)?.[1] || '').trim().replace(/[,.\s]+$/, '');
    const nombre = b.split('\n')[0].slice(3).split('·')[0].trim();
    const apodos = dato(/^- \*\*¿Cómo se le llama[^*]*\*\*\s*(.*)$/m).split(/[,/]| y /).map(s => s.trim()).filter(Boolean);
    return { nombre, apodos, tono: dato(/^- \*\*Tono[^*]*\*\*\s*(.*)$/m), noSacar: dato(/^- \*\*(?:Temas que el bot no debe sacar|Lo que el bot NO debe decir)[^*]*\*\*\s*(.*)$/mi) };
  }).filter(f => f.nombre && (f.tono || f.noSacar));
}
export function fichaDe(fichas, quien) {
  if (!quien) return null;
  return fichas.find(f => [f.nombre, ...f.apodos].some(n => nombra(quien, n))) || null;
}

// Lo aprendido: un trozo por dato, con el rango de quien lo dijo dentro del texto (así se ve en cualquier bot)
export function trozosMemoria(datos) {
  return (datos || []).map(d => ({
    clave: `${d.fecha}:${clave(d.sobre)}:${clave(d.dato).slice(0, 30)}`, titulo: `Lo que han contado de ${d.sobre}`, rango: d.rango,
    texto: `Sobre ${d.sobre}: ${d.dato} (lo dijo ${RANGOS[d.rango] || RANGOS[0]}${d.quien && d.rango < 4 ? `, ${d.quien}` : ''}, el ${String(d.fecha).slice(0, 10)}).`,
  }));
}

// Una crónica: su título y su resumen y, si es larga, su texto en varios trozos
export function trozosCronica(c, nombre = id => id) {
  const partido = `${nombre(c.azul)} contra ${nombre(c.rojo)}`;
  const dia = String(c.fecha || '').slice(0, 10);
  const titulo = `Crónica de ${partido} (${dia})${c.titulo ? `: ${c.titulo}` : ''}`;
  const base = `${dia}:${clave(`${c.azul}-${c.rojo}`)}`;
  const texto = [c.resumen && `Resumen: ${c.resumen}`, c.texto].filter(Boolean).join('\n\n');
  return partir(texto).map((t, i) => ({ clave: `${base}${i ? `-${i + 1}` : ''}`, titulo, texto: t }));
}

const leerSiHay = async archivo => { try { return await readFile(archivo, 'utf8'); } catch { return ''; } };

// Sincroniza todas las fuentes con el contexto. 'de' dice de dónde sale cada cosa (en las pruebas, de mentira)
export function crearSincronizacion(contexto, { clanes = () => [], memoria = () => [], cronicas = () => [], nombre = id => id,
  archivos = { ficha: 'discord/tickets-saber.md', lore: 'discord/lore.md', kb: 'discord/kbstats-jugadores.md', fichas: 'discord/fichas-miembros.md' },
  raiz = RAIZ, cada = 10 * 60 * 1000, log = console } = {}) {
  let temporizador = null;
  let corriendo = null;
  const leer = nombreArchivo => leerSiHay(path.join(raiz, archivos[nombreArchivo]));

  async function todo() {
    if (corriendo) return corriendo;
    corriendo = (async () => {
      const t = Date.now();
      const resumen = {};
      const fuentes = {
        ficha: async () => trozosFicha(await leer('ficha')),
        lore: async () => trozosLore(await leer('lore')),
        kb: async () => trozosKb(await leer('kb')),
        fichas: async () => trozosFichas(await leer('fichas')),
        plantillas: async () => trozosPlantillas(clanes()),
        // null: aún no se ha leído (o no se pudo leer la hoja): no se toca, para no borrar lo que ya hay
        memoria: async () => { const d = memoria(); return d ? trozosMemoria(d) : null; },
        cronicas: async () => cronicas().flatMap(c => trozosCronica(c, nombre)),
      };
      for (const [fuente, sacar] of Object.entries(fuentes)) {
        try {
          const trozos = await sacar();
          if (trozos) resumen[fuente] = await contexto.guardarFuente(fuente, trozos);
        }
        catch (e) { resumen[fuente] = { error: e.message }; log.error(`Contexto: no se ha podido guardar «${fuente}»:`, e.message); }
      }
      const hechos = Object.values(resumen).reduce((n, r) => n + (r.nuevos || 0) + (r.cambiados || 0), 0);
      if (hechos) log.log(`Contexto: ${hechos} trozos nuevos o cambiados en ${Math.round((Date.now() - t) / 1000)} s (${contexto.estado().trozos} en total)`);
      return resumen;
    })().finally(() => { corriendo = null; });
    return corriendo;
  }

  function arrancar() {
    const primera = todo();
    clearInterval(temporizador);
    temporizador = setInterval(() => todo().catch(() => {}), cada);
    temporizador.unref?.();
    return primera;
  }
  const parar = () => clearInterval(temporizador);
  // Una crónica nueva va al momento, sin esperar a la siguiente vuelta
  const cronica = c => Promise.all(trozosCronica(c, nombre).map(t => contexto.anadir('cronicas', t)));
  const aprendido = async () => { const d = memoria(); if (d) await contexto.guardarFuente('memoria', trozosMemoria(d)); };
  return { todo, arrancar, parar, cronica, aprendido };
}
