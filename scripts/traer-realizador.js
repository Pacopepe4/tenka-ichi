// Copia en realizador/ la versión del realizador automático (repositorio Pacopepe4/realizador) que se reparte
// desde la guía. Sin pruebas ni simulador: solo lo que hace falta en los PCs.
//
//   node scripts/traer-realizador.js ../realizador
import { cpSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const origen = path.resolve(process.argv[2] || '../realizador');
const destino = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'realizador');
if (!existsSync(path.join(origen, 'pc2', 'rele.js'))) {
  console.error(`No parece el repositorio del realizador: ${origen}`);
  process.exit(1);
}
const FUERA = new Set(['.git', 'node_modules', 'test', 'simulador', 'docs', 'partidas', 'capturas', 'opciones.local.json', '.gitignore', '.gitattributes']);
rmSync(destino, { recursive: true, force: true });
cpSync(origen, destino, { recursive: true, filter: f => !FUERA.has(path.basename(f)) || f === origen });
// Versión (commit del repositorio del realizador): la usan el botón «Actualizar» de los PCs y /puente/realizador-version.json
let version = '';
try { version = execFileSync('git', ['-C', origen, 'log', '-1', '--format=%h %cI'], { encoding: 'utf8' }).trim(); } catch { /* sin git */ }
if (!version) version = `sin-git ${new Date().toISOString()}`;
writeFileSync(path.join(destino, 'VERSION.txt'), `${version}\n`);
console.log(`Realizador copiado en ${destino} (versión ${version})`);
