// El contexto compartido de los bots de Gokudō (SrDirector en Discord y los chats de Kick y Twitch), con embeddings.
// Lo pidió Pacopepe el 21/11/2026: «lo guardaremos como embeddings para que accedas a la info rápido… estilo Postgres».
//   · Postgres con pgvector, en el contenedor «db» del server casero (servidor/docker-compose.yml), con índice HNSW.
//   · Los embeddings se calculan en la propia web con un modelo local, multilingüe y gratis (multilingual-e5-small,
//     con transformers.js): no se llama a ninguna API de pago.
//   · Cada trozo de lo que saben los bots (la ficha, el lore, la lista de KB, las plantillas, las fichas de los
//     miembros, lo que aprende SrDirector y las crónicas: server/contexto-fuentes.js) es una fila de «trozos».
//   · buscar(pregunta) mezcla dos búsquedas: por parecido (el vector, con HNSW) y por palabras (tsvector en español,
//     para los nombres como GAATSU que el modelo no conoce), con Reciprocal Rank Fusion. Solo esos trozos van a la IA.
// Si no hay DATABASE_URL, o la base o el modelo fallan, buscar() devuelve null y los bots siguen como antes (las ramas
// de server/tickets-ramas.js): nunca se queda nadie sin respuesta por esto.
import { createHash } from 'node:crypto';
import { normalizar } from './tickets-ramas.js';

export const DIMENSIONES = 384;
export const MODELO_EMBEDDINGS = 'Xenova/multilingual-e5-small';
const RRF = 60;              // la constante de Reciprocal Rank Fusion
const CANDIDATOS = 20;       // cuántos trae cada búsqueda antes de mezclar
const LOTE = 8;              // trozos por tanda al calcular embeddings

export const huella = texto => createHash('sha1').update(texto).digest('hex').slice(0, 16);
const comoVector = v => `[${Array.from(v, x => Number(x).toFixed(6)).join(',')}]`;

// Los embeddings, con transformers.js. El modelo (unos 130 MB) se baja la primera vez de Hugging Face y se guarda en
// 'carpeta'. e5 pide «query: » delante de las preguntas y «passage: » delante de lo que se guarda.
// Lo que se guarda va de uno en uno, en una cola (el server tiene 2 núcleos y así no se pisa con la web)
export function crearEmbeddings({ modelo = process.env.CONTEXTO_MODELO || MODELO_EMBEDDINGS, carpeta = process.env.CONTEXTO_MODELOS,
  dispositivo = process.env.CONTEXTO_DISPOSITIVO || undefined, hilos = Number(process.env.CONTEXTO_HILOS) || undefined, log = console } = {}) {
  let tubo = null;
  let cola = Promise.resolve();
  async function cargar() {
    if (!tubo) {
      tubo = (async () => {
        const { pipeline, env } = await import('@huggingface/transformers');
        if (carpeta) env.cacheDir = carpeta;
        if (hilos && env.backends?.onnx?.wasm) env.backends.onnx.wasm.numThreads = hilos;
        const t = Date.now();
        const p = await pipeline('feature-extraction', modelo, { dtype: 'q8', ...(dispositivo && { device: dispositivo }),
          ...(hilos && { session_options: { intraOpNumThreads: hilos, interOpNumThreads: 1 } }) });
        log.log(`Contexto: modelo de embeddings cargado en ${Math.round((Date.now() - t) / 100) / 10} s`);
        return p;
      })();
      tubo.catch(() => { tubo = null; });
    }
    return tubo;
  }
  const calcular = async (textos, tipo) => (await (await cargar())(textos.map(t => `${tipo}: ${t}`), { pooling: 'mean', normalize: true })).tolist();
  // Lo que se guarda va en cola, de uno en uno; las preguntas pasan delante (no esperan a que se llene la base)
  function embeber(textos, tipo = 'passage') {
    if (tipo === 'query') return calcular(textos, tipo);
    const p = cola.then(() => calcular(textos, tipo));
    cola = p.catch(() => {});
    return p;
  }
  return { embeber, cargar };
}

// La base: un Pool de node-postgres. En el server casero basta con PG_CLAVE en el .env (la base es el contenedor «db»);
// DATABASE_URL, si se pone, manda. Cualquier objeto con query(sql, params) → { rows } vale (PGlite en las pruebas)
const urlPorDefecto = () => process.env.DATABASE_URL
  || (process.env.PG_CLAVE ? `postgres://tenka:${encodeURIComponent(process.env.PG_CLAVE)}@${process.env.PG_HOST || 'db'}:5432/tenka` : '');
export async function crearBase(url = urlPorDefecto()) {
  if (!url) return null;
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: url, max: 3, idleTimeoutMillis: 30_000 });
  pool.on('error', e => console.error('Contexto: la base de datos:', e.message));
  return pool;
}

export function crearContexto({ db, embeddings, log = console, ahora = () => new Date() } = {}) {
  const estado = { activo: Boolean(db && embeddings), preparado: false, trozos: 0, error: null, ultimaBusqueda: null };
  let preparando = null;

  function preparar() {
    if (!preparando) {
      preparando = (async () => {
        await db.query('CREATE EXTENSION IF NOT EXISTS vector');
        await db.query(`CREATE TABLE IF NOT EXISTS trozos (
          id bigserial PRIMARY KEY,
          fuente text NOT NULL,
          clave text NOT NULL,
          titulo text NOT NULL DEFAULT '',
          texto text NOT NULL,
          rango smallint NOT NULL DEFAULT 4,
          huella text NOT NULL,
          buscable text NOT NULL,
          vector vector(${DIMENSIONES}) NOT NULL,
          palabras tsvector GENERATED ALWAYS AS (to_tsvector('spanish', buscable)) STORED,
          actualizado timestamptz NOT NULL DEFAULT now(),
          UNIQUE (fuente, clave))`);
        await db.query('CREATE INDEX IF NOT EXISTS trozos_vector ON trozos USING hnsw (vector vector_cosine_ops) WITH (m = 16, ef_construction = 64)');
        await db.query('CREATE INDEX IF NOT EXISTS trozos_palabras ON trozos USING gin (palabras)');
        estado.preparado = true;
        await contar();
      })();
      preparando.catch(e => { preparando = null; estado.error = e.message; });
    }
    return preparando;
  }
  async function contar() { estado.trozos = Number((await db.query('SELECT count(*)::int AS n FROM trozos')).rows[0].n); }

  // Guarda los trozos de una fuente entera: solo calcula el embedding de los nuevos o cambiados y borra los que ya no
  // están. trozos: [{ clave, titulo, texto, rango? }]
  async function guardarFuente(fuente, trozos, { borrarResto = true } = {}) {
    await preparar();
    const antes = new Map((await db.query('SELECT clave, huella FROM trozos WHERE fuente = $1', [fuente])).rows.map(f => [f.clave, f.huella]));
    const vistos = new Set();
    const pendientes = [];
    for (const t of trozos) {
      if (!t?.clave || !t.texto?.trim() || vistos.has(t.clave)) continue;
      vistos.add(t.clave);
      const h = huella(`${t.titulo || ''}\n${t.texto}\n${t.rango ?? 4}`);
      if (antes.get(t.clave) !== h) pendientes.push({ ...t, huella: h });
    }
    for (let i = 0; i < pendientes.length; i += LOTE) {
      const tanda = pendientes.slice(i, i + LOTE);
      const vectores = await embeddings.embeber(tanda.map(t => (t.titulo ? `${t.titulo}. ${t.texto}` : t.texto)), 'passage');
      for (const [j, t] of tanda.entries()) {
        await db.query(`INSERT INTO trozos (fuente, clave, titulo, texto, rango, huella, buscable, vector, actualizado)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, $9)
          ON CONFLICT (fuente, clave) DO UPDATE SET titulo = EXCLUDED.titulo, texto = EXCLUDED.texto, rango = EXCLUDED.rango,
            huella = EXCLUDED.huella, buscable = EXCLUDED.buscable, vector = EXCLUDED.vector, actualizado = EXCLUDED.actualizado`,
        [fuente, t.clave, t.titulo || '', t.texto, t.rango ?? 4, t.huella, normalizar(`${t.titulo || ''} ${t.texto}`), comoVector(vectores[j]), ahora()]);
      }
    }
    let borrados = 0;
    if (borrarResto) {
      const sobran = [...antes.keys()].filter(k => !vistos.has(k));
      if (sobran.length) borrados = (await db.query('DELETE FROM trozos WHERE fuente = $1 AND clave = ANY($2::text[])', [fuente, sobran])).affectedRows ?? sobran.length;
    }
    await contar();
    return { nuevos: pendientes.filter(t => !antes.has(t.clave)).length, cambiados: pendientes.filter(t => antes.has(t.clave)).length, borrados };
  }

  // Uno suelto, sin tocar los demás de su fuente (una crónica nueva, un dato aprendido)
  const anadir = (fuente, trozo) => guardarFuente(fuente, [trozo], { borrarResto: false });

  // Los trozos más parecidos a la pregunta: [{ fuente, clave, titulo, texto, rango, distancia }], o null si no se puede
  // buscar. 'fuentes' limita a esas fuentes; 'ms' dice cuánto ha tardado cada parte
  async function buscar(pregunta, { k = 6, fuentes = null } = {}) {
    if (!estado.activo || !String(pregunta || '').trim()) return null;
    try {
      await preparar();
      const t0 = performance.now();
      const [v] = await embeddings.embeber([String(pregunta).slice(0, 2000)], 'query');
      const t1 = performance.now();
      const filtro = fuentes?.length ? 'AND fuente = ANY($2::text[])' : '';
      const porVector = await db.query(`SELECT id, fuente, clave, titulo, texto, rango, vector <=> $1::vector AS distancia FROM trozos
        WHERE true ${filtro} ORDER BY vector <=> $1::vector LIMIT ${CANDIDATOS}`, fuentes?.length ? [comoVector(v), fuentes] : [comoVector(v)]);
      // Por palabras, con «o» entre ellas (to_tsquery quita las palabras vacías: «el», «de», «que»…)
      const palabras = [...new Set(normalizar(pregunta).split(' ').filter(p => p.length >= 3 && /^[a-z0-9ñ]+$/.test(p)))].slice(0, 16);
      const porPalabras = palabras.length ? await db.query(`SELECT id, fuente, clave, titulo, texto, rango, ts_rank(palabras, q) AS nota
        FROM trozos, to_tsquery('spanish', $1) q WHERE palabras @@ q ${filtro} ORDER BY nota DESC LIMIT ${CANDIDATOS}`,
      fuentes?.length ? [palabras.join(' | '), fuentes] : [palabras.join(' | ')]) : { rows: [] };
      const t2 = performance.now();
      const notas = new Map();
      const sumar = (filas, peso) => filas.forEach((f, i) => {
        const n = notas.get(f.id) || { ...f, nota: 0, distancia: f.distancia ?? null };
        n.nota += peso / (RRF + i + 1);
        if (f.distancia != null) n.distancia = Number(f.distancia);
        notas.set(f.id, n);
      });
      sumar(porVector.rows, 1);
      sumar(porPalabras.rows, 1);
      const trozos = [...notas.values()].sort((a, b) => b.nota - a.nota).slice(0, k)
        .map(({ fuente, clave, titulo, texto, rango, distancia }) => ({ fuente, clave, titulo, texto, rango: Number(rango), distancia }));
      const ms = { embedding: Math.round(t1 - t0), busqueda: Math.round(t2 - t1), total: Math.round(t2 - t0) };
      estado.ultimaBusqueda = { fecha: ahora().toISOString(), ms };
      estado.error = null;
      return Object.assign(trozos, { ms });
    } catch (e) {
      estado.error = e.message;
      log.error('Contexto: no se ha podido buscar:', e.message);
      return null;
    }
  }

  return { preparar, guardarFuente, anadir, buscar, estado: () => ({ ...estado }), activo: () => estado.activo };
}

// Los trozos encontrados, en texto para la IA: cada uno con su título (lo aprendido ya lleva dentro quién lo dijo)
export const textoTrozos = trozos => (trozos || []).map(t => `### ${t.titulo || t.clave}\n${t.texto}`).join('\n\n');
