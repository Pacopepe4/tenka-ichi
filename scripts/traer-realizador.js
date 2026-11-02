// Copia en realizador/ la versión del realizador automático (repositorio Pacopepe4/realizador) que se reparte
// desde la guía. Sin pruebas ni simulador: solo lo que hace falta en los PCs.
//
//   node scripts/traer-realizador.js ../realizador
import { cpSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const origen = path.resolve(process.argv[2] || '../realizador');
const destino = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'realizador');
if (!existsSync(path.join(origen, 'pc2', 'rele.js'))) {
  console.error(`No parece el repositorio del realizador: ${origen}`);
  process.exit(1);
}
const FUERA = new Set(['.git', 'node_modules', 'test', 'simulador', 'partidas', 'capturas', 'opciones.local.json', '.gitignore', '.gitattributes']);
rmSync(destino, { recursive: true, force: true });
cpSync(origen, destino, { recursive: true, filter: f => !FUERA.has(path.basename(f)) || f === origen });
console.log(`Realizador copiado en ${destino}`);
