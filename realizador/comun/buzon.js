// Buzón de la partida, como el de Planos embalaje: cada jugada es un JSON que pasa de carpeta en carpeta
// (pendientes → guion → en-curso → emitidos, o descartadas) y cada decisión deja una línea en _registro.
// Todo lo que pasa en tiempo real vive en memoria; esto es el registro para el panel y para revisar después.
import { mkdirSync, writeFileSync, renameSync, existsSync, appendFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const CARPETAS = ['pendientes', 'guion', 'en-curso', 'emitidos', 'descartadas', 'repeticiones', '_registro'];

const limpio = s => String(s).replace(/[^\w.-]+/g, '_');

export class Buzon {
  constructor(raiz, idPartida, fecha = new Date()) {
    const dia = fecha.toISOString().slice(0, 10);
    this.carpeta = join(raiz, `${dia}_${limpio(idPartida)}`);
    for (const c of CARPETAS) mkdirSync(join(this.carpeta, c), { recursive: true });
    this.donde = new Map();  // id de jugada → carpeta en la que está
  }

  // Guarda la jugada en su carpeta; si ya estaba en otra, la mueve
  poner(carpeta, jugada) {
    if (!CARPETAS.includes(carpeta)) throw new Error(`Carpeta desconocida: ${carpeta}`);
    const nombre = `${limpio(jugada.id)}.json`;
    const antes = this.donde.get(jugada.id);
    const destino = join(this.carpeta, carpeta, nombre);
    if (antes && antes !== carpeta) {
      const origen = join(this.carpeta, antes, nombre);
      if (existsSync(origen)) renameSync(origen, destino);
    }
    writeFileSync(destino, JSON.stringify(jugada, null, 2));
    this.donde.set(jugada.id, carpeta);
    return destino;
  }

  quitar(id) {
    const antes = this.donde.get(id);
    if (!antes) return;
    rmSync(join(this.carpeta, antes, `${limpio(id)}.json`), { force: true });
    this.donde.delete(id);
  }

  // Una línea por decisión: quién (el realizador o una persona), qué y en qué momento de la partida
  apuntar(quien, que, datos = {}) {
    const linea = { hora: new Date().toISOString(), quien, que, ...datos };
    appendFileSync(join(this.carpeta, '_registro', 'registro.jsonl'), JSON.stringify(linea) + '\n');
    return linea;
  }
}
