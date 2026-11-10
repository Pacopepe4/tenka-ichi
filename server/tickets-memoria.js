// Lo que SrDirector aprende hablando: cuando alguien le cuenta algo nuevo sobre Gokudō o la Liga KB (un apodo, un título,
// una anécdota, quién es quién), lo apunta con el rango de quien lo dijo. Así, si dos datos chocan, vale el de más rango
// (lo pidió Pacopepe el 11/11/2026: «los oyabun tienen más peso y yo el que más, los jugadores menos»).
//   Rangos: 4 Pacopepe (el dueño del servidor) · 3 staff (Kumichō) · 2 Oyabun · 1 jugador (Kobun) · 0 sin rol
// Se guarda en la pestaña «SrDirector» de Google Sheets (sin hoja, en data/srdirector.json) y solo se le pasa a la IA lo
// que habla de quien o de lo que sale en la pregunta.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { archivoDatos } from './datos.js';
import { hojaActiva, asegurarPestana, leer, anadir } from './sheets.js';
import { nombra, normalizar } from './tickets-ramas.js';

export const RANGOS = ['alguien sin rol', 'jugador (Kobun)', 'Oyabun', 'staff (Kumichō)', 'Pacopepe, el jefe'];
const CABECERA = ['Fecha', 'Sobre', 'Dato', 'Rango', 'Quien', 'ID'];
const MAX_POR_DIA = 5;        // datos que puede enseñar cada persona al día (el jefe y el staff, sin tope)
const MAX_SOBRE = 60, MAX_DATO = 300;

const celda = s => (/^[=+\-@]/.test(String(s ?? '')) ? `'${s}` : String(s ?? ''));
const deFila = f => ({ fecha: f[0], sobre: f[1] || '', dato: f[2] || '', rango: Number(f[3]) || 0, quien: f[4] || '', id: f[5] || '' });
const aFila = d => [d.fecha, d.sobre, d.dato, d.rango, d.quien, d.id];

export function crearMemoria({ hoja = hojaActiva, asegurar = asegurarPestana, leerHoja = leer, anadirHoja = anadir, pestana = 'SrDirector',
  archivo = archivoDatos('srdirector.json'), ahora = () => new Date(), log = console } = {}) {
  let datos = [];
  let cola = Promise.resolve();
  const enCola = fn => { const p = cola.then(fn); cola = p.catch(() => {}); return p; };

  async function cargar() {
    try {
      if (hoja()) {
        await asegurar(pestana, CABECERA);
        datos = (await leerHoja(pestana)).slice(1).filter(f => f[0]).map(deFila);
      } else datos = JSON.parse(await readFile(archivo, 'utf8')).map(deFila);
    } catch (e) {
      if (hoja()) log.error('SrDirector: no se pudo leer lo aprendido:', e.message);
      datos = [];
    }
  }

  // Apunta lo que ha aprendido. Devuelve cuántos datos nuevos ha guardado
  async function apuntar(nuevos, { rango = 0, quien = '', id = '' } = {}) {
    const hoy = ahora().toISOString().slice(0, 10);
    const deHoy = datos.filter(d => d.id === id && d.fecha.slice(0, 10) === hoy).length;
    const limpios = [];
    for (const n of (nuevos || []).slice(0, 2)) {
      const sobre = String(n?.sobre || '').trim().slice(0, MAX_SOBRE);
      const dato = String(n?.dato || '').trim().replace(/\s+/g, ' ').slice(0, MAX_DATO);
      if (!sobre || !dato) continue;
      if (rango < 3 && deHoy + limpios.length >= MAX_POR_DIA) break;
      // El mismo dato sobre lo mismo no se repite (si lo dice alguien de más rango, cuenta su rango)
      const igual = datos.find(d => normalizar(d.sobre) === normalizar(sobre) && normalizar(d.dato) === normalizar(dato));
      if (igual && igual.rango >= rango) continue;
      limpios.push({ fecha: ahora().toISOString(), sobre, dato, rango, quien: String(quien).slice(0, 60), id: String(id) });
    }
    if (!limpios.length) return 0;
    await enCola(async () => {
      datos.push(...limpios);
      if (hoja()) {
        await asegurar(pestana, CABECERA);
        await anadirHoja(pestana, limpios.map(d => aFila(d).map(celda)));
      } else {
        await mkdir(path.dirname(archivo), { recursive: true });
        await writeFile(archivo, JSON.stringify(datos.map(aFila), null, 1));
      }
    });
    return limpios.length;
  }

  // Lo aprendido sobre quien o lo que sale en el texto (o, con 'general', lo más importante), de más rango a menos y,
  // con el mismo rango, de más nuevo a más viejo
  function relevantes(texto, { general = false, max = 15 } = {}) {
    const t = normalizar(texto);
    const habla = d => nombra(texto, d.sobre) || (normalizar(d.sobre).length >= 4 && t.includes(normalizar(d.sobre)));
    const lista = (texto ? datos.filter(habla) : []);
    const elegidos = (lista.length ? lista : general ? datos : []).slice().sort((a, b) => b.rango - a.rango || b.fecha.localeCompare(a.fecha)).slice(0, max);
    return elegidos.map(d => `- Sobre **${d.sobre}**: ${d.dato} (lo dijo ${RANGOS[d.rango] || RANGOS[0]}${d.quien && d.rango < 4 ? `, ${d.quien}` : ''}, el ${d.fecha.slice(0, 10)})`).join('\n');
  }

  return { cargar, apuntar, relevantes, todos: () => datos.slice() };
}
