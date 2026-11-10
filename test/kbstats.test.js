// KB Stats para la IA de los tickets: un KB Stats de mentira con el mismo HTML que la web de verdad (10/11/2026).
// Se lee la tabla de /jugadores/ y el equipo de cada uno; se guarda 6 horas y, si falla, sigue con lo último.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearKbStats, leerJugadores, leerEquipos, jugadoresDeEquipo, temporadaDe } from '../server/kbstats.js';

const CABECERA = ['#', 'Jugador', 'Rol', 'Nota▼', 'Partidas', '% WR', 'MVP', 'ACE', 'KDA', 'K', 'D', 'A', 'KP', 'CS/min', 'Daño/min', 'Visión/min'];
const fila = (nom, tag, rol, valores) => `
        <tr data-href="/jugador/${encodeURIComponent(nom + tag)}/">
          <td class="pos">1</td>
          <td class="col-jug"><a class="jug" href="/jugador/${encodeURIComponent(nom + tag)}/"><img class="camp" src="x.png" alt=""><span class="nom">${nom}</span><span class="tag">${tag}</span></a></td>
          <td class="c"><span class="ico-rol r-${rol}" title="x"></span></td>
          ${valores.map(v => `<td class="cv c"><span>${v}</span></td>`).join('')}
        </tr>`;
const JUGADORES = `<table><thead><tr>${CABECERA.map(c => `<th class="x">${c}</th>`).join('')}</tr></thead><tbody>
${fila('KB Despo', '#KAIJU', 'TOP', ['85', '6', '83%', '1', '0', '2.42', '3.0', '3.5', '4.2', '41%', '8.1', '698', '1.54'])}
${fila('Narcïso', '#ADC', 'ADC', ['84', '6', '83%', '2', '0', '7.08', '6.0', '1.5', '4.6', '60%', '9.9', '820', '0.90'])}
</tbody></table>`;
const PORTADA = '<main><h1>Liga KB</h1><p>Temporada 4 · Final · 44 partidas jugadas</p><a href="/equipo/KB%20KAIJU/">KAI</a><a href="/equipo/KB%20TORA/">TOR</a><a href="/equipo/KB%20KAIJU/">otra vez</a></main>';
const EQUIPOS = { '/equipo/KB%20KAIJU/': '<a href="/jugador/KB%20Despo%23KAIJU/">Despo</a>', '/equipo/KB%20TORA/': '<a href="/jugador/Narc%C3%AFso%23ADC/">Narciso</a>' };

function kbFalso() {
  const pedidas = [];
  let caido = false;
  const pedir = async url => {
    const ruta = new URL(url).pathname;
    pedidas.push(ruta);
    if (caido) return new Response('no', { status: 503 });
    const html = ruta === '/' ? PORTADA : ruta === '/jugadores/' ? JUGADORES : EQUIPOS[ruta];
    return html ? new Response(html) : new Response('no', { status: 404 });
  };
  return { pedir, pedidas, caer: v => { caido = v; } };
}

test('lee la tabla, los equipos y la temporada como los pone KB Stats', () => {
  const j = leerJugadores(JUGADORES);
  assert.equal(j.length, 2);
  assert.deepEqual({ jugador: j[0].jugador, rol: j[0].rol, nota: j[0].datos.Nota, kda: j[0].datos.KDA }, { jugador: 'KB Despo#KAIJU', rol: 'Top', nota: '85', kda: '2.42' });
  assert.equal(j[1].jugador, 'Narcïso#ADC');
  assert.deepEqual(leerEquipos(PORTADA), ['KB%20KAIJU', 'KB%20TORA']);
  assert.deepEqual(jugadoresDeEquipo(EQUIPOS['/equipo/KB%20TORA/']), ['Narcïso#ADC']);
  assert.equal(temporadaDe(PORTADA), 'Temporada 4 · Final');
});

test('para la IA: una fila por jugador con su equipo de la Liga KB y su nombre para buscarlo, y avisa de que no es su familia', async () => {
  const kb = kbFalso();
  const { cabecera, filas } = await crearKbStats({ base: 'http://kb.falso', pedir: kb.pedir, log: { error: () => {} } }).datos();
  const t = [cabecera, ...filas.map(f => f.texto)].join('\n');
  assert.match(t, /^Estadísticas de la Liga KB \(Temporada 4 · Final\)/);
  assert.match(t, /no es su familia de Gokudō/);
  assert.match(t, /- KB Despo#KAIJU · KB KAIJU · Top · nota 85 · 6 partidas · 83% victorias · KDA 2.42 \(3.0\/3.5\/4.2 de media\) · KP 41% · MVP 1 · CS\/min 8.1 · daño\/min 698 · visión\/min 1.54/);
  assert.match(t, /- Narcïso#ADC · KB TORA · ADC/);
  assert.deepEqual(filas.map(f => [f.nombre, f.rol]), [['Despo', 'Top'], ['Narcïso', 'ADC']], 'sin el «KB» ni la etiqueta');
});

test('se guarda 6 horas; si KB Stats falla, sigue con lo último y no lo vuelve a pedir hasta 10 minutos después', async () => {
  const kb = kbFalso();
  let ahora = 0;
  const errores = [];
  const k = crearKbStats({ base: 'http://kb.falso', pedir: kb.pedir, ahora: () => ahora, log: { error: (...a) => errores.push(a.join(' ')) } });
  const primero = await k.datos();
  assert.equal(primero.filas.length, 2);
  const pedidas = kb.pedidas.length;
  ahora = 5 * 3600 * 1000;
  assert.deepEqual(await k.datos(), primero);
  assert.equal(kb.pedidas.length, pedidas, 'antes de 6 horas no vuelve a pedir');
  ahora = 7 * 3600 * 1000;
  kb.caer(true);
  assert.deepEqual(await k.datos(), primero, 'si es viejo, da lo que hay mientras lo renueva');
  await k.esperar();
  assert.ok(errores.some(e => /503/.test(e)));
  const tras = kb.pedidas.length;
  ahora += 60_000;
  assert.deepEqual(await k.datos(), primero);
  assert.equal(kb.pedidas.length, tras, 'tras un fallo espera 10 minutos');
});

test('con TICKETS_KBSTATS=0, o sin KB Stats la primera vez, no hay datos y no se rompe nada', async () => {
  assert.equal(await crearKbStats({ activo: false, pedir: () => { throw new Error('no debería pedir'); } }).datos(), null);
  const kb = kbFalso();
  kb.caer(true);
  assert.equal(await crearKbStats({ base: 'http://kb.falso', pedir: kb.pedir, log: { error: () => {} } }).datos(), null);
});
