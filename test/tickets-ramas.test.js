// Las ramas de lo que sabe la IA de los tickets: con cada pregunta solo va lo que hace falta, para gastar menos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { elegirRamas, nombra, seccionesSaber, filasKb, textoLiga, RAMAS } from '../server/tickets-ramas.js';

const FAMILIAS = ['Ryūjin', 'Byakko', 'Tengu', 'Tsuki', 'Yasha', 'Akuma', 'Shinigami'];
const NOMBRES = ['KINGKAI', 'JLEGEND', 'DESPO', 'VASKOÑITO', 'XNEAR'];
const ramas = pregunta => [...elegirRamas(pregunta, { nombres: NOMBRES, familias: FAMILIAS }).ramas].sort();

test('cada pregunta típica despierta sus ramas, y un saludo ninguna', () => {
  assert.deepEqual(ramas('hola!!'), []);
  assert.ok(ramas('¿qué hace !tiradas?').includes('directo'), 'un comando de Kick sí');
  assert.deepEqual(ramas('buenas'), []);
  assert.ok(ramas('¿Cuándo es la próxima jornada?').includes('liga'));
  assert.deepEqual(ramas('¿cómo consigo más tiradas?').filter(r => ['gachapon', 'tiradas'].includes(r)), ['gachapon', 'tiradas']);
  assert.ok(ramas('¿Cómo funciona el fantasy?').includes('fantasy'));
  assert.ok(ramas('¿Qué es el Omamori de Kick?').includes('tiradas') && ramas('¿Qué es el Omamori de Kick?').includes('directo'));
  assert.ok(ramas('cuéntame el lore de Akuma').includes('lore'));
  assert.ok(ramas('¿Qué opinas de KB?').includes('kb'));
  assert.ok(ramas('¿Cómo recluto a alguien en Discord?').includes('discord'));
});

test('nombrar a un jugador trae sus cartas y sus estadísticas, aunque esté mal escrito; nombrar una familia, su lore', () => {
  const r = elegirRamas('qué tal juega jlgend', { nombres: NOMBRES, familias: FAMILIAS });
  assert.deepEqual(r.jugadores, ['JLEGEND'], 'una letra de diferencia vale');
  assert.ok(r.ramas.has('stats') && r.ramas.has('cartas'));
  assert.ok(nombra('stats de vaskonito', 'VASKOÑITO'));
  assert.ok(nombra('KB Despo', 'Despo'));
  assert.ok(!nombra('hola que tal', 'Despo'));
  assert.ok(!nombra('top', 'Top Gun'), 'un nombre de dos palabras no salta por media');
  assert.ok(elegirRamas('¿quién es el jefe de Ryūjin?', { familias: FAMILIAS }).ramas.has('lore'));
});

test('de KB Stats solo van las filas de quien se nombra o, si no, las mejores notas del rol que se diga', () => {
  const kb = { cabecera: 'CAB', filas: [
    { nombre: 'Despo', rol: 'Top', texto: '- Despo' }, { nombre: 'J Lgend', rol: 'Jungla', texto: '- J Lgend' }, { nombre: 'Sergi', rol: 'Support', texto: '- Sergi' }] };
  assert.equal(filasKb(kb, 'kda de despo'), 'CAB\n- Despo');
  assert.equal(filasKb(kb, 'stats de jlgend'), 'CAB\n- J Lgend');
  assert.match(filasKb(kb, '¿quién es el mejor jungla?'), /van las 1 mejores notas de Jungla\.\n- J Lgend$/);
  assert.match(filasKb(kb, '¿quién es el mejor?'), /van las 3 mejores notas\./);
  assert.equal(filasKb(null, 'despo'), '');
});

test('la liga en texto corto: fechas, cruces con su ganador, clasificación y cuadro de playoffs', () => {
  const clanes = [{ id: 'SARU', nombre: 'Tsuki' }, { id: 'TORA', nombre: 'Byakko' }];
  assert.match(textoLiga({ formato: { liguilla: [{ jornada: 1, fecha: '2026-11-15' }], hora: '17:00' } }, clanes), /todavía no se ha sorteado/);
  const t = textoLiga({
    formato: { liguilla: [{ jornada: 1, nombre: 'Jornada 1', fecha: '2026-11-15' }], playoffs: [{ ronda: 'final', nombre: 'Final', fecha: '2026-12-27' }], hora: '17:00', margen: 45 },
    calendario: { jornadas: [[{ jornada: 1, azul: 'TORA', rojo: 'SARU' }]] },
    clasificacion: { filas: [{ clan: 'SARU', puesto: 1, victorias: 1, derrotas: 0, ganados: ['TORA'] }, { clan: 'TORA', puesto: 2, victorias: 0, derrotas: 1, ganados: [] }] },
    cuadro: { final: { ronda: 'Final', fecha: '2026-12-27', alto: 'SARU', bajo: 'TORA', victorias: { SARU: 2, TORA: 1 }, ganador: 'SARU' } },
  }, clanes);
  assert.match(t, /Playoffs: Final el 2026-12-27\./);
  assert.match(t, /Jornada 1 \(2026-11-15\): Byakko \(azul\) vs Tsuki \(rojo\), gana Tsuki\./);
  assert.match(t, /Final \(2026-12-27\): Tsuki vs Byakko 2-1, gana Tsuki\./);
  assert.equal(textoLiga(null, clanes), 'No hay datos de la liga ahora mismo.');
});

test('la ficha de verdad: cada apartado lleva una rama que existe, y el núcleo es corto', () => {
  const secciones = seccionesSaber(readFileSync(new URL('../discord/tickets-saber.md', import.meta.url), 'utf8'));
  const validas = new Set(['nucleo', ...Object.keys(RAMAS)]);
  for (const s of secciones) assert.ok(validas.has(s.rama), `rama desconocida «${s.rama}» en ${s.texto.split('\n')[0]}`);
  assert.deepEqual([...new Set(secciones.map(s => s.rama))].sort(), [...validas].filter(r => !['stats'].includes(r)).sort(), 'todas las ramas de la ficha tienen su apartado');
  const nucleo = secciones.filter(s => s.rama === 'nucleo').map(s => s.texto).join('\n\n');
  assert.ok(nucleo.length < 3000, `el núcleo (va en todas las preguntas) ocupa ${nucleo.length} caracteres`);
  assert.doesNotMatch(nucleo, /<!--/);
});

test('del lore solo va el de la familia que se nombra (con la entradilla), y entero si no se nombra ninguna', async () => {
  const { recortarLore } = await import('../server/tickets-ramas.js');
  const lore = 'Entradilla común.\n- **Ryūjin**, el dragón.\n- **Akuma**, el demonio rojo.';
  assert.equal(recortarLore(lore, ['Akuma']), 'Entradilla común.\n- **Akuma**, el demonio rojo.');
  assert.equal(recortarLore(lore, []), lore);
  assert.deepEqual(elegirRamas('háblame del oyabun de Akuma', { familias: FAMILIAS }).familias, ['Akuma']);
});

test('KB Stats con las equivalencias: la cuenta de KB de cada jugador, y quien no juega en KB se dice (sin parecidos)', async () => {
  const { filasKb } = await import('../server/tickets-ramas.js');
  const kb = { cabecera: 'CAB', filas: [{ nombre: 'Hikigaayaa', rol: 'Top', texto: '- Hikigaayaa' }, { nombre: 'Reiko', rol: 'Medio', texto: '- Reiko' }, { nombre: 'KingKai', rol: 'Top', texto: '- KingKai' }] };
  const alias = { GAATSU: 'Hikigaayaa#YUKNO', DRAGON: null };
  assert.equal(filasKb(kb, 'stats de gaatsu', { jugadores: ['GAATSU'], alias }), 'CAB\n- Hikigaayaa');
  assert.match(filasKb(kb, 'stats de dragon', { jugadores: ['DRAGON'], alias }), /^CAB\nNo juegan en la Liga KB, así que no tienen estadísticas allí: DRAGON\./);
  assert.equal(filasKb(kb, 'stats de kingkai', { jugadores: ['KINGKAI'], alias }), 'CAB\n- KingKai', 'sin equivalencia, por el nombre parecido');
  assert.match(filasKb(kb, 'stats de pablo', { jugadores: ['PABLO'], alias }), /No aparecen en KB Stats con ese nombre[^\n]*PABLO/);
});

test('el archivo de equivalencias de verdad: cada cuenta existe tal cual se escribe, y los que no juegan en KB van con null', () => {
  const { alias } = JSON.parse(readFileSync(new URL('../discord/kbstats-alias.json', import.meta.url), 'utf8'));
  assert.equal(alias.GAATSU, 'Hikigaayaa');
  assert.equal(alias.SRGALLEGO, 'Señor Gallego');
  assert.equal(alias.DRAGON, null, 'DRAGON no es Reiko');
});

test('lo que dijo la gente: sus mensajes y las preguntas que SrDirector copia, sin sus respuestas', async () => {
  const { loQueDijoLaGente } = await import('../server/tickets-ramas.js');
  const historia = '[SrDirector (tú)] **❓ Persona 20:** háblame de KINGKAI → KINGKAI es el top de Tsuki, y DESPO el de Yasha\n[Persona 20 (quien abrió el ticket)] gracias crack';
  assert.equal(loQueDijoLaGente(historia), 'háblame de KINGKAI\n[Persona 20 (quien abrió el ticket)] gracias crack');
});

test('las leyendas de KB despiertan su rama por el nombre', () => {
  assert.ok(ramas('¿quién es Dakin?').includes('escena'));
  assert.ok(ramas('cuéntame lo de coña malą').includes('escena'));
});
