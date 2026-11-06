// El realizador automático pide la ficha de un jugador por su nombre o su campeón, sin saber su puesto
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buscarJugador } from '../server/partida.js';

const j = (nombre, campeon) => ({ nombre, campeon });
const lineas = [
  { rol: 'TOP', azul: j('Jaavaa', 'Gwen'), rojo: j('Pepe', 'Aatrox') },
  { rol: 'JUNGLA', azul: j('Vaskoñito', 'MonkeyKing'), rojo: j('Luis', 'LeeSin') },
  { rol: 'MEDIO', azul: j('Kuchauu', 'Elise'), rojo: j('Ana', 'Ahri') },
  { rol: 'ADC', azul: j('Domenache', 'Samira'), rojo: j('Rita', 'Kaisa') },
  { rol: 'SUPPORT', azul: j('Frozenronin', 'Bard'), rojo: null },
];

test('por el nombre del jugador, sin mirar mayúsculas ni el #', () => {
  assert.deepEqual(buscarJugador(lineas, { jugador: 'domenache#EUW' }), { lado: 'azul', indice: 3 });
});

test('por el campeón tal como lo escribe el cliente (con espacios o apóstrofos)', () => {
  assert.deepEqual(buscarJugador(lineas, { campeon: 'Lee Sin' }), { lado: 'rojo', indice: 1 });
  assert.deepEqual(buscarJugador(lineas, { campeon: "Kai'Sa" }), { lado: 'rojo', indice: 3 });
});

test('el lado acota la búsqueda y lo que no está da null', () => {
  assert.equal(buscarJugador(lineas, { campeon: 'Ahri', lado: 'azul' }), null);
  assert.equal(buscarJugador(lineas, { jugador: 'Nadie' }), null);
  assert.equal(buscarJugador([], { campeon: 'Ahri' }), null);
});
