// Abre un .zip con Node solo (sin PowerShell): lee el directorio central y descomprime cada archivo (guardado o
// deflate). Lo usa el botón «Actualizar» (comun/app.js). Nunca escribe fuera de la carpeta de destino.
import { inflateRawSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

export function leerZip(zip) {
  // Fin del directorio central: firma 0x06054b50, buscando desde el final (puede llevar comentario)
  let fin = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { fin = i; break; }
  }
  if (fin < 0) throw new Error('no es un zip');
  const total = zip.readUInt16LE(fin + 10);
  let p = zip.readUInt32LE(fin + 16);
  const archivos = [];
  for (let n = 0; n < total; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error('zip roto (directorio central)');
    const metodo = zip.readUInt16LE(p + 10);
    const comprimido = zip.readUInt32LE(p + 20);
    const largoNombre = zip.readUInt16LE(p + 28);
    const largoExtra = zip.readUInt16LE(p + 30);
    const largoComentario = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const nombre = zip.toString('utf8', p + 46, p + 46 + largoNombre);
    p += 46 + largoNombre + largoExtra + largoComentario;
    if (nombre.endsWith('/')) continue;  // carpeta
    if (zip.readUInt32LE(local) !== 0x04034b50) throw new Error(`zip roto (${nombre})`);
    const inicio = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const trozo = zip.subarray(inicio, inicio + comprimido);
    let datos;
    if (metodo === 0) datos = Buffer.from(trozo);
    else if (metodo === 8) datos = inflateRawSync(trozo);
    else throw new Error(`zip con un método que no sé abrir (${metodo}) en ${nombre}`);
    archivos.push({ nombre, datos });
  }
  return archivos;
}

export function extraerZip(zip, destino) {
  const base = resolve(destino);
  for (const { nombre, datos } of leerZip(zip)) {
    const ruta = resolve(join(base, nombre));
    if (ruta !== base && !ruta.startsWith(base + sep)) throw new Error(`ruta fuera de la carpeta en el zip: ${nombre}`);
    mkdirSync(join(ruta, '..'), { recursive: true });
    writeFileSync(ruta, datos);
  }
}
