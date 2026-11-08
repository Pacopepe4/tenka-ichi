// Lo que comparten los módulos del gachapon: lo último que ha dicho el servidor (est.info de /api/gacha y est.fantasia de
// /api/fantasy), las familias y cómo se pinta una carta. Cada parte de la página va en su módulo:
// - apertura.js: hacer tiradas y descubrir las cartas
// - album.js: la colección
// - alineacion.js: la alineación del fantasy y la clasificación
// - gachapon.js: la cuenta, las probabilidades, fundir, compartir y el arranque
// Un módulo no llama a otro para repintar: usa los ganchos, que pone gachapon.js
import { cargarClanes } from '/comun.js';
import { cartaHTML as carta } from '/carta.js';

export const $ = s => document.querySelector(s);
export const { clanes } = await cargarClanes();
export const nombreClan = id => clanes.find(c => c.id === id)?.nombre || id;
export const colorClan = id => clanes.find(c => c.id === id)?.color || 'var(--sumi-linea)';

export const est = { info: null, fantasia: null };

// La carta la pinta carta.js, igual que en la portada y en el overlay
export const cartaHTML = (c, cantidad = null) => carta(c, { cantidad, nombreClan });
export const cartaPorId = id => est.info?.catalogo.find(c => c.id === id) || null;
// Mis cartas: id → copias
export const misCartas = () => new Map((est.info?.usuario?.cartas || []).map(c => [c.id, c.cantidad]));

// pintar(): repinta toda la página con est.info y est.fantasia. avisar(texto): un aviso corto junto a la cuenta.
// cargar(): vuelve a pedir /api/gacha y /api/fantasy y repinta
export const ganchos = { pintar: () => {}, avisar: () => {}, cargar: async () => {} };
