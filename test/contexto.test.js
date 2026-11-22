// El contexto compartido de los bots (server/contexto.js y server/contexto-fuentes.js) sobre PGlite: Postgres en WASM,
// con pgvector y su índice HNSW de verdad (en el server es el contenedor «db»). Los embeddings son de mentira: una
// bolsa de palabras en 384 dimensiones, así las pruebas no bajan el modelo y van rápidas. La prueba con el modelo de
// verdad está en scripts/medir-contexto.mjs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { crearContexto, textoTrozos, DIMENSIONES } from '../server/contexto.js';
import { crearSincronizacion, trozosFicha, trozosFichas, leerFichas, fichaDe, trozosKb, trozosPlantillas, trozosCronica, trozosMemoria, partir, quitarSinRespuesta } from '../server/contexto-fuentes.js';
import { normalizar } from '../server/tickets-ramas.js';
import { crearTickets } from '../server/tickets.js';

// Embeddings de mentira: cada palabra (sin tildes, en minúsculas, de 3 letras o más) suma en una dimensión
export function embeddingsFalsos() {
  const llamadas = [];
  const uno = texto => {
    const v = new Array(DIMENSIONES).fill(0);
    for (const p of normalizar(texto).split(' ').filter(x => x.length >= 3)) {
      let h = 0;
      for (const c of p.slice(0, 6)) h = (h * 31 + c.charCodeAt(0)) % DIMENSIONES;
      v[h] += 1;
    }
    const n = Math.hypot(...v) || 1;
    return v.map(x => x / n);
  };
  return { llamadas, embeber: async (textos, tipo) => { llamadas.push({ tipo, n: textos.length }); return textos.map(uno); } };
}

let db, emb, ctx;
before(async () => {
  db = await PGlite.create({ extensions: { vector } });
  emb = embeddingsFalsos();
  ctx = crearContexto({ db, embeddings: emb, log: { log() {}, error() {} } });
});
after(() => db.close());

const FICHA = `# Lo que sabe SrDirector
<!-- notas para el staff -->

## Qué es Gokudō <!-- nucleo -->
Una liga de League of Legends con familias yakuza.

## Gachapon <!-- gachapon -->
Cada tirada de la tragaperras da cuatro cartas. Las tiradas se consiguen con el Omamori de Kick, las subs y los kicks.

## Formato de la temporada <!-- liga -->
Seis familias juegan una liga a una vuelta y luego cuartos, semis y final. Los partidos son los domingos a las 17:00.
`;

test('los trozos de la ficha: uno por apartado, sin el núcleo (que va siempre en el papel) ni los comentarios', () => {
  const t = trozosFicha(FICHA);
  assert.deepEqual(t.map(x => x.titulo), ['Ficha de Gokudō · Gachapon', 'Ficha de Gokudō · Formato de la temporada']);
  assert.doesNotMatch(t.map(x => x.texto).join(' '), /notas para el staff|familias yakuza/);
  const largo = partir(`${'Una frase corta. '.repeat(300)}\n\nOtro párrafo.`, 500);
  assert.ok(largo.length > 5 && largo.every(x => x.length <= 500), 'lo largo se parte en trozos de como mucho 500');
});

test('las fichas del cuestionario: sin las preguntas sin contestar y con la pregunta 10 dentro (el bot la respeta)', () => {
  const md = `# Cuestionario
Lo que contestes aquí…

## Familia Ryūjin (ATSUI)
### GAATSU — Top de Ryūjin
1. ¿Cómo se le llama de verdad en la comunidad (nombre, apodos)?
Gaatsu, «el muro del puerto».
2. Cuentas: Discord, Riot ID, Twitch y Kick (si las tiene).
10. Lo que el bot NO debe decir nunca de esta persona (temas delicados, cosas privadas).
Su trabajo.

### SOLET — Jungla de Ryūjin
1. ¿Cómo se le llama de verdad en la comunidad (nombre, apodos)?
2. Cuentas: Discord, Riot ID, Twitch y Kick (si las tiene).
`;
  const t = trozosFichas(md);
  assert.equal(t.length, 1, 'SOLET no tiene nada contestado');
  assert.equal(t[0].titulo, 'Ficha · Familia Ryūjin (ATSUI) · GAATSU — Top de Ryūjin');
  assert.match(t[0].texto, /el muro del puerto/);
  assert.match(t[0].texto, /10\. Lo que el bot NO debe decir nunca[^\n]*\nSu trabajo\./);
  assert.doesNotMatch(t[0].texto, /Cuentas/);
  assert.equal(quitarSinRespuesta('1. ¿Algo?\n\n2. ¿Otra?\nSí.'), '2. ¿Otra?\nSí.');
});

test('las fichas pasadas a limpio (discord/fichas-miembros.md): un trozo por persona y el tono de quien pregunta', () => {
  const md = `# Fichas de los miembros de Gokudō

Sacadas del cuestionario.

## GAATSU · Top · Ryūjin
- **¿Cómo se le llama en la comunidad?:** Gaatsu, MRP
- **Su lore en Gokudō:** El rey de la Toplane de Gokudo
- **Tono con esta persona:** Muy de cachondeo, muy vacilón

## MAKITAH · Legacy · Shinigami (Legacy)
- **¿Cómo se le llama en la comunidad?:** Mamamamamamamakitaaaah, makitah
- **Temas que el bot no debe sacar:** No pasarse de bromista con el
- **Tono con esta persona:** De cachondeo pero con mucho respeto por su juego.
`;
  const t = trozosFichas(md);
  assert.deepEqual(t.map(x => x.titulo), ['Ficha · GAATSU · Top · Ryūjin', 'Ficha · MAKITAH · Legacy · Shinigami (Legacy)'], 'sin la entradilla');
  assert.match(t[0].texto, /El rey de la Toplane/);
  const fichas = leerFichas(md);
  assert.deepEqual(fichaDe(fichas, 'Gaatsu_MRP'), { nombre: 'GAATSU', apodos: ['Gaatsu', 'MRP'], tono: 'Muy de cachondeo, muy vacilón', noSacar: '' });
  assert.equal(fichaDe(fichas, 'makitah').noSacar, 'No pasarse de bromista con el');
  assert.equal(fichaDe(fichas, 'ana_kick'), null);
});

test('KB, plantillas, lo aprendido y las crónicas, en trozos', () => {
  const kb = trozosKb('## KB ARASHI\n\n### Hikigaayaa#YUKNO\n- KB: KB ARASHI · Top\n- En Gokudō: GAATSU\n- Lore: El muro.\n\n### Nadie#EUW\n- KB: x\n- En Gokudō: \n- Lore:\n');
  assert.deepEqual(kb.map(x => x.texto), ['Hikigaayaa juega en la Liga KB con la cuenta Hikigaayaa#YUKNO. En Gokudō es GAATSU. El muro.']);
  const [p] = trozosPlantillas([{ id: 'ATSUI', nombre: 'Ryūjin', kanji: '竜神', lema: 'El dios dragón del mar', jugadores: ['GAATSU', 'SOLET', '', 'X', 'Y'], suplentes: 'Z' }, { id: 'NONAME', invitado: true }]);
  assert.equal(p.texto, 'Familia Ryūjin (竜神). Lema: «El dios dragón del mar». Jugadores: Top: GAATSU · Jungla: SOLET · ADC: X · Support: Y. Suplentes: Z.');
  const [m] = trozosMemoria([{ fecha: '2026-11-20T10:00:00Z', sobre: 'GAATSU', dato: 'Le llaman el muro.', rango: 2, quien: 'Oyabun1' }]);
  assert.equal(m.rango, 2);
  assert.match(m.texto, /lo dijo Oyabun, Oyabun1, el 2026-11-20/);
  const c = trozosCronica({ fecha: '2026-11-15T19:00:00Z', azul: 'ATSUI', rojo: 'SARU', titulo: 'La marea', resumen: 'Ryūjin gana.', texto: 'Partidazo.' }, id => ({ ATSUI: 'Ryūjin', SARU: 'Tsuki' }[id]));
  assert.equal(c[0].titulo, 'Crónica de Ryūjin contra Tsuki (2026-11-15): La marea');
  assert.match(c[0].texto, /^Resumen: Ryūjin gana\.\n\nPartidazo\.$/);
});

test('guardar una fuente solo calcula los embeddings de lo nuevo o cambiado y borra lo que ya no está', async () => {
  const trozos = trozosFicha(FICHA);
  let r = await ctx.guardarFuente('ficha', trozos);
  assert.deepEqual(r, { nuevos: 2, cambiados: 0, borrados: 0 });
  emb.llamadas.length = 0;
  r = await ctx.guardarFuente('ficha', trozos);
  assert.deepEqual(r, { nuevos: 0, cambiados: 0, borrados: 0 });
  assert.equal(emb.llamadas.length, 0, 'sin cambios no se calcula nada');
  r = await ctx.guardarFuente('ficha', [{ ...trozos[0], texto: `${trozos[0].texto} Y las garantías.` }]);
  assert.deepEqual(r, { nuevos: 0, cambiados: 1, borrados: 1 });
  assert.equal(ctx.estado().trozos, 1);
  const indices = (await db.query("SELECT indexdef FROM pg_indexes WHERE tablename = 'trozos'")).rows.map(x => x.indexdef).join('\n');
  assert.match(indices, /USING hnsw \(vector vector_cosine_ops\)/);
  assert.match(indices, /USING gin \(palabras\)/);
});

test('buscar mezcla el parecido (HNSW) y las palabras: encuentra por tema y por nombre, y dice cuánto tarda', async () => {
  await ctx.guardarFuente('ficha', trozosFicha(FICHA));
  await ctx.guardarFuente('plantillas', trozosPlantillas([
    { id: 'ATSUI', nombre: 'Ryūjin', lema: 'El dios dragón del mar', jugadores: ['GAATSU', 'SOLET', 'MOONFALL', 'A1', 'S1'] },
    { id: 'SARU', nombre: 'Tsuki', lema: 'Los lobos de la luna', jugadores: ['KINGKAI', 'J1', 'M1', 'A2', 'S2'] }]));
  const tiradas = await ctx.buscar('¿cómo consigo más tiradas del gachapon?', { k: 2 });
  assert.equal(tiradas[0].titulo, 'Ficha de Gokudō · Gachapon');
  assert.ok(tiradas.ms.total >= 0 && 'embedding' in tiradas.ms);
  const gaatsu = await ctx.buscar('¿en qué familia juega gaatsu?', { k: 1 });
  assert.equal(gaatsu[0].titulo, 'Plantilla de la familia Ryūjin');
  assert.equal((await ctx.buscar('lobos de la luna', { k: 3, fuentes: ['ficha'] })).every(t => t.fuente === 'ficha'), true, 'se puede limitar a unas fuentes');
  assert.match(textoTrozos(gaatsu), /^### Plantilla de la familia Ryūjin\nFamilia Ryūjin\./);
  assert.equal(await crearContexto({ db: null }).buscar('hola'), null, 'sin base no busca (y los bots siguen por ramas)');
});

test('si la base falla, buscar devuelve null en vez de romper la respuesta', async () => {
  const roto = crearContexto({ db: { query: async () => { throw new Error('se cayó'); } }, embeddings: emb, log: { error() {}, log() {} } });
  assert.equal(await roto.buscar('hola'), null);
  assert.match(roto.estado().error, /se cayó/);
});

test('la sincronización: todo al arrancar, lo aprendido solo cuando se ha leído, y cada crónica nueva al momento', async () => {
  let memoria = null;
  const cronicas = [{ fecha: '2026-11-16T19:00:00Z', azul: 'KAIJU', rojo: 'TORA', titulo: '', resumen: 'Yasha arrolla a Byakko 22-5.', texto: '' }];
  const s = crearSincronizacion(ctx, { raiz: process.cwd(), cronicas: () => cronicas, memoria: () => memoria, clanes: () => [],
    archivos: { ficha: 'discord/tickets-saber.md', lore: 'discord/lore.md', kb: 'discord/kbstats-jugadores.md', fichas: 'discord/no-existe.md' }, log: { log() {}, error() {} } });
  const r = await s.todo();
  assert.ok(r.ficha.nuevos > 5, 'la ficha de verdad');
  assert.ok(r.lore.nuevos >= 7, 'el lore entero: una entradilla y las siete familias');
  assert.ok(r.kb.nuevos > 5);
  assert.equal(r.cronicas.nuevos, 1);
  assert.equal(r.memoria, undefined, 'lo aprendido no se toca hasta que se ha leído de la hoja');
  memoria = [{ fecha: '2026-11-20T10:00:00Z', sobre: 'DRAGON', dato: 'Es la nueva de Yasha.', rango: 4, quien: '' }];
  await s.aprendido();
  assert.equal((await ctx.buscar('¿quién es dragon?', { k: 1 }))[0].fuente, 'memoria');
  await s.cronica({ fecha: '2026-11-22T19:00:00Z', azul: 'ATSUI', rojo: 'BUSHI', titulo: 'Fuego en el puerto', resumen: 'Akuma remonta.', texto: '' });
  assert.equal((await ctx.buscar('fuego en el puerto', { k: 1 }))[0].fuente, 'cronicas');
});

test('SrDirector: con el contexto, los trozos encontrados sustituyen a las ramas de la ficha; sin él, como antes', async () => {
  const base = { token: 'x', urlApi: 'http://127.0.0.1:1', ids: () => ({}), cliente: null, kbstats: null, memoria: null, fichaKb: () => '', aliasKb: () => ({}),
    saber: () => FICHA, cartas: () => null };
  const buscador = { activo: () => true, buscar: async p => [{ fuente: 'lore', titulo: 'Lore · Ryūjin', texto: `El dragón del mar (${p.slice(0, 20)})` }] };
  const con = await crearTickets({ ...base, buscador }).contexto('¿cómo consigo tiradas del gachapon?', '');
  assert.match(con.partes.join('\n'), /<contexto>\n### Lore · Ryūjin\nEl dragón del mar/);
  assert.doesNotMatch(con.partes.join('\n'), /<ficha>/);
  const sin = await crearTickets({ ...base, buscador: { activo: () => true, buscar: async () => null } }).contexto('¿cómo consigo tiradas del gachapon?', '');
  assert.match(sin.partes.join('\n'), /<ficha>\n## Gachapon\nCada tirada de la tragaperras/);
});
