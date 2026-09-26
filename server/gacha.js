// Gachapon de Tenka Ichi: cartas de los jugadores de la liga con la rareza de su tier (S, A, B, C, D).
// Cuanto mejor es la tier, menos peso tiene en el sorteo y más difícil es que salga.
// Todo se guarda como un registro de movimientos (altas, canjes, regalos, aperturas y cartas) en la
// pestaña «Gachapon» de Google Sheets; el estado de cada coleccionista se reconstruye leyéndolo.
import crypto from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TIERS, vistaTierlist } from './tierlist.js';
import { hojaActiva, asegurarPestana, leer, anadir } from './sheets.js';

export const PESOS = { S: 1, A: 3, B: 6, C: 10, D: 15 };
export const CARTAS_POR_SOBRE = 3;
export const SOBRES_INICIALES = 2;

const ARCHIVO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'gacha.json');
const PESTANA = 'Gachapon';
const CABECERA = ['Fecha', 'Twitch ID', 'Usuario', 'Tipo', 'Detalle', 'Cantidad', 'Rareza'];

let registro = [];
const usuarios = new Map();
const canjes = new Set();
let sinGuardar = [];

function aplicar(e) {
  let u = usuarios.get(e.id);
  if (!u) { u = { id: e.id, nombre: e.usuario, sobres: 0, abiertos: 0, cartas: new Map() }; usuarios.set(e.id, u); }
  if (e.usuario) u.nombre = e.usuario;
  const n = Number(e.cantidad) || 0;
  if (e.tipo === 'alta' || e.tipo === 'regalo' || e.tipo === 'canje') u.sobres += n;
  if (e.tipo === 'canje') canjes.add(e.detalle);
  if (e.tipo === 'apertura') { u.sobres -= 1; u.abiertos += 1; }
  if (e.tipo === 'carta') u.cartas.set(e.detalle, (u.cartas.get(e.detalle) || 0) + 1);
}

const aFila = e => [e.fecha, e.id, e.usuario, e.tipo, e.detalle || '', e.cantidad, e.rareza || ''];
const deFila = f => ({ fecha: f[0], id: f[1], usuario: f[2], tipo: f[3], detalle: f[4], cantidad: Number(f[5]) || 0, rareza: f[6] || '' });

export async function cargarGacha() {
  try {
    if (hojaActiva()) {
      await asegurarPestana(PESTANA, CABECERA);
      registro = (await leer(PESTANA)).slice(1).filter(f => f[1]).map(deFila);
    } else {
      registro = JSON.parse(await readFile(ARCHIVO, 'utf8'));
    }
  } catch (e) {
    if (hojaActiva()) console.error('No se pudo leer el gachapon:', e.message);
    registro = [];
  }
  usuarios.clear(); canjes.clear();
  registro.forEach(aplicar);
}

async function guardar(eventos) {
  if (hojaActiva()) {
    const filas = [...sinGuardar, ...eventos].map(aFila);
    try { await anadir(PESTANA, filas); sinGuardar = []; }
    catch (e) { sinGuardar.push(...eventos); console.error('Gachapon sin guardar en Sheets, se reintenta:', e.message); }
  } else {
    await mkdir(path.dirname(ARCHIVO), { recursive: true });
    await writeFile(ARCHIVO, JSON.stringify(registro));
  }
}
// Si Google Sheets falló, se reintenta cada 30 s con lo pendiente
setInterval(() => { if (sinGuardar.length) guardar([]).catch(() => {}); }, 30000).unref();

async function registrar(eventos) {
  for (const e of eventos) { registro.push(e); aplicar(e); }
  await guardar(eventos);
}

// Una operación detrás de otra, para que nadie abra dos veces el mismo sobre
let cola = Promise.resolve();
const enCola = fn => { const p = cola.then(fn); cola = p.catch(() => {}); return p; };
const ahora = () => new Date().toISOString();

// ---------- cartas y probabilidades ----------
export function catalogo() {
  return vistaTierlist().jugadores.filter(j => j.nombre && j.tier).map(j => ({ ...j, peso: PESOS[j.tier] }));
}

// Probabilidad de que una carta cualquiera del sobre sea de cada tier
export function probabilidades(cat = catalogo()) {
  const total = cat.reduce((s, c) => s + c.peso, 0);
  return Object.fromEntries(TIERS.map(t => [t, total ? cat.filter(c => c.tier === t).reduce((s, c) => s + c.peso, 0) / total : 0]));
}

function sacarCarta(cat) {
  const total = cat.reduce((s, c) => s + c.peso, 0);
  let r = crypto.randomInt(total);
  for (const c of cat) if ((r -= c.peso) < 0) return c;
  return cat[cat.length - 1];
}

// ---------- operaciones ----------
export const darAlta = u => enCola(async () => {
  if (usuarios.has(u.id)) return false;
  await registrar([{ fecha: ahora(), id: u.id, usuario: u.nombre, tipo: 'alta', cantidad: SOBRES_INICIALES }]);
  return true;
});

export const darSobres = (u, cantidad, tipo, detalle = '') => enCola(async () => {
  if (tipo === 'canje' && canjes.has(detalle)) return;
  await registrar([{ fecha: ahora(), id: u.id, usuario: u.nombre, tipo, detalle, cantidad }]);
});

export const abrirSobre = u => enCola(async () => {
  const yo = usuarios.get(u.id);
  if (!yo || yo.sobres < 1) throw new Error('No te quedan sobres');
  const cat = catalogo();
  if (!cat.length) throw new Error('Todavía no hay cartas: el staff tiene que poner la tier de los jugadores');
  const cartas = Array.from({ length: CARTAS_POR_SOBRE }, () => sacarCarta(cat));
  const fecha = ahora(), sobre = crypto.randomUUID().slice(0, 8);
  await registrar([
    { fecha, id: u.id, usuario: u.nombre, tipo: 'apertura', detalle: sobre, cantidad: -1 },
    ...cartas.map(c => ({ fecha, id: u.id, usuario: u.nombre, tipo: 'carta', detalle: c.id, cantidad: 1, rareza: c.tier })),
  ]);
  return cartas.map(({ peso, ...c }) => c);
});

export const canjeProcesado = id => canjes.has(id);

export function estadoUsuario(id) {
  const u = usuarios.get(id);
  if (!u) return { sobres: 0, abiertos: 0, cartas: [] };
  return { sobres: u.sobres, abiertos: u.abiertos, cartas: [...u.cartas].map(([carta, cantidad]) => ({ id: carta, cantidad })) };
}

export function buscarUsuario(nombre) {
  const n = String(nombre).trim().toLowerCase();
  return [...usuarios.values()].find(u => u.nombre?.toLowerCase() === n) || null;
}

export function resumenGacha() {
  let abiertos = 0, sobres = 0;
  for (const u of usuarios.values()) { abiertos += u.abiertos; sobres += u.sobres; }
  return { coleccionistas: usuarios.size, sobresAbiertos: abiertos, sobresSinAbrir: sobres, cartas: catalogo().length };
}
