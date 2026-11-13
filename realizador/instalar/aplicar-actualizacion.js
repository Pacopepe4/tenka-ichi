// Aplica una actualización del realizador (o vuelve a la anterior) con el realizador ya cerrado. El botón del panel
// (comun/app.js) lo deja copiado en .actualizacion/aplicar.mjs con .actualizacion/pendiente.json, y lo pasa el
// lanzador (windows/Realizador.vbs → windows/_aplicar.bat) cuando el realizador se ha cerrado. No importa nada del
// realizador: las carpetas que toca se cambian mientras corre.
//
//   node aplicar.mjs --carpeta <realizador> --papel pc1|pc2 [--modo actualizar|volver]   (el modo, de pendiente.json)
//
//  1. En el PC 2 cierra también OBS (sin forzar) y el puente oculto, para poder volver a configurarlos.
//  2. actualizar: guarda lo de ahora en .actualizacion/anterior y pone .actualizacion/nueva.
//     volver: pone .actualizacion/anterior y la borra.
//     Nunca se tocan las cosas de este PC: opciones.local.json, partidas, node, node_modules, ffmpeg, la clave del
//     puente, la clave de la IA ni la propia carpeta .actualizacion.
//  3. Pasa el instalador sin preguntar (instalar.js <papel> --actualizar: usa la contraseña y la ruta guardadas).
//  4. Deja lo que ha pasado en .actualizacion/resultado.json (el panel lo enseña) y quita pendiente.json; el
//     lanzador vuelve a abrir el realizador.
//  Si algo falla al copiar, vuelve a poner lo de antes.
import { existsSync, readdirSync, statSync, mkdirSync, copyFileSync, rmSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const PRESERVAR = ['.actualizacion', '.git', 'node', 'node_modules', 'partidas', 'capturas', 'opciones.local.json', 'clave-ia.txt',
  'puente/clave.txt', 'herramientas/ffmpeg'];

const norm = rel => rel.replace(/\\/g, '/');
export const preservado = rel => PRESERVAR.includes(norm(rel));
const tienePreservado = rel => PRESERVAR.some(p => p.startsWith(`${norm(rel)}/`));

// Copia todo lo de «desde» en «hasta» menos lo que es de este PC
export function copiar(desde, hasta, rel = '') {
  mkdirSync(hasta, { recursive: true });
  for (const n of readdirSync(desde)) {
    const r = rel ? `${rel}/${n}` : n;
    if (preservado(r)) continue;
    const a = join(desde, n);
    const b = join(hasta, n);
    if (statSync(a).isDirectory()) copiar(a, b, r); else copyFileSync(a, b);
  }
}

// Quita de «carpeta» lo que no está en «modelo» (lo que la versión nueva ya no trae), menos lo de este PC. Se hace
// al final, cuando la copia ya ha ido bien: así un corte a medias nunca deja la instalación sin archivos (13/11: en
// el PC 2, dentro de OneDrive, vaciar primero y copiar después la dejó rota).
export function quitarSobrantes(carpeta, modelo, rel = '') {
  for (const n of readdirSync(carpeta)) {
    const r = rel ? `${rel}/${n}` : n;
    if (preservado(r)) continue;
    const ruta = join(carpeta, n);
    const enModelo = join(modelo, n);
    if (!existsSync(enModelo)) {
      if (tienePreservado(r) && statSync(ruta).isDirectory()) quitarSobrantes(ruta, join(modelo, '__no_existe__'), r);
      else rmSync(ruta, { recursive: true, force: true });
    } else if (statSync(ruta).isDirectory() && statSync(enModelo).isDirectory()) quitarSobrantes(ruta, enModelo, r);
  }
}

// Borra todo lo de la carpeta menos lo que es de este PC (y las carpetas que lo contienen)
export function vaciar(carpeta, rel = '') {
  for (const n of readdirSync(carpeta)) {
    const r = rel ? `${rel}/${n}` : n;
    if (preservado(r)) continue;
    const ruta = join(carpeta, n);
    if (statSync(ruta).isDirectory() && tienePreservado(r)) vaciar(ruta, r);
    else rmSync(ruta, { recursive: true, force: true });
  }
}

const vivo = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const dormir = ms => new Promise(r => setTimeout(r, ms));

async function esperarCierre(pid, segundos = 60) {
  for (let i = 0; i < segundos * 4 && vivo(pid); i++) await dormir(250);
  await dormir(2000);  // que acabe también el .bat que lo había abierto
}

function corriendo(imagen) {
  try { return new RegExp(imagen.replace('.', '\\.'), 'i').test(execFileSync('tasklist', ['/FI', `IMAGENAME eq ${imagen}`, '/NH'], { encoding: 'utf8', windowsHide: true })); } catch { return false; }
}

async function cerrarObs() {
  if (!corriendo('obs64.exe')) return true;
  try { execFileSync('taskkill', ['/IM', 'obs64.exe'], { stdio: 'ignore', windowsHide: true }); } catch { /* ya cerrado */ }
  for (let i = 0; i < 60 && corriendo('obs64.exe'); i++) await dormir(500);
  return !corriendo('obs64.exe');
}

function cerrarPuente() {
  const ps = "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.CommandLine -like '*puente-tenka-ichi.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }";
  try { execFileSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'ignore', windowsHide: true, timeout: 30000 }); } catch { /* no estaba */ }
}

export async function aplicar({ carpeta, papel, esperar, modo = 'actualizar', node = process.execPath, instalar = true, relanzar = false, dormirFn = esperarCierre }) {
  const act = join(carpeta, '.actualizacion');
  const log = texto => { try { appendFileSync(join(act, 'actualizacion.log'), `${new Date().toISOString()} ${texto}\n`); } catch { /* sin log */ } };
  const resultado = { ok: false, modo, hora: null, version: null, hechos: [], avisos: [], error: null };
  log(`--- ${modo} (${papel})`);
  if (esperar) await dormirFn(Number(esperar));

  if (papel === 'pc2' && instalar) {
    if (!(await cerrarObs())) resultado.avisos.push('OBS no se ha cerrado: su configuración se queda como estaba');
    cerrarPuente();
  }

  const nueva = join(act, 'nueva');
  const anterior = join(act, 'anterior');
  const respaldo = join(act, 'respaldo');
  try {
    // Primero se guarda lo de ahora, luego se copia la otra versión ENCIMA (archivo a archivo, sin vaciar antes) y solo
    // al final se quita lo que esa versión ya no trae: un corte en cualquier momento deja todos los archivos en su sitio
    if (modo === 'actualizar') {
      if (!existsSync(nueva)) throw new Error('no está la versión nueva');
      rmSync(anterior, { recursive: true, force: true });
      copiar(carpeta, anterior);
      log('versión de ahora guardada en .actualizacion/anterior');
      copiar(nueva, carpeta);
      log('versión nueva copiada encima');
      quitarSobrantes(carpeta, nueva);
    } else {
      if (!existsSync(anterior)) throw new Error('no hay versión anterior');
      rmSync(respaldo, { recursive: true, force: true });
      copiar(carpeta, respaldo);
      copiar(anterior, carpeta);
      quitarSobrantes(carpeta, anterior);
      rmSync(anterior, { recursive: true, force: true });
    }
    log('archivos puestos');
  } catch (e) {
    // Se deja como estaba: lo guardado se copia otra vez encima (tampoco se vacía nada)
    resultado.error = `no se han podido poner los archivos: ${e.message}`;
    log(resultado.error);
    const deVuelta = modo === 'actualizar' ? anterior : respaldo;
    try { if (existsSync(deVuelta)) { copiar(deVuelta, carpeta); quitarSobrantes(carpeta, deVuelta); log('puesto otra vez lo de antes'); } } catch (e2) { log(`tampoco se ha podido volver: ${e2.message}`); }
  }
  rmSync(nueva, { recursive: true, force: true });
  rmSync(join(act, 'nueva.zip'), { force: true });
  rmSync(respaldo, { recursive: true, force: true });

  try { resultado.version = readFileSync(join(carpeta, 'VERSION.txt'), 'utf8').trim().split(/\s+/)[0] || null; } catch { /* sin versión */ }

  // El instalador sin preguntar: LoL, OBS, ffmpeg, accesos directos… con lo guardado en este PC
  if (!resultado.error && instalar) {
    log('pasando el instalador (LoL, OBS, accesos)...');
    try {
      const salida = execFileSync(node, [join(carpeta, 'instalar', 'instalar.js'), papel, '--actualizar'], { cwd: carpeta, encoding: 'utf8', windowsHide: true, timeout: 900000 });
      for (const l of salida.split(/\r?\n/)) {
        const m = l.match(/^\s+(OK|!!)\s+(.*)$/);
        if (m) (m[1] === 'OK' ? resultado.hechos : resultado.avisos).push(m[2]);
      }
      log('instalador pasado');
    } catch (e) {
      resultado.avisos.push(`El instalador ha fallado: ${String(e.stderr || e.message).trim().split('\n').at(-1)}`);
      log(`instalador: ${e.message}`);
    }
  }
  resultado.ok = !resultado.error;
  rmSync(join(act, 'pendiente.json'), { force: true });
  resultado.hora = new Date().toISOString();
  try { writeFileSync(join(act, 'resultado.json'), JSON.stringify(resultado, null, 2)); } catch { /* sin resultado */ }

  // Otra vez en marcha
  if (relanzar) {
    try {
      const p = spawn('wscript.exe', [join(carpeta, 'windows', 'Realizador.vbs'), papel, 'sinpagina'], { cwd: carpeta, detached: true, stdio: 'ignore', windowsHide: true });
      p.unref();
      log('realizador abierto otra vez');
    } catch (e) { log(`no se ha podido abrir otra vez: ${e.message}`); }
  }
  return resultado;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const arg = n => { const i = args.indexOf(n); return i !== -1 ? args[i + 1] : undefined; };
  const carpeta = arg('--carpeta');
  if (!carpeta || !existsSync(join(carpeta, 'opciones.json'))) { console.error('Falta --carpeta del realizador'); process.exit(1); }
  let pendiente = {};
  try { pendiente = JSON.parse(readFileSync(join(carpeta, '.actualizacion', 'pendiente.json'), 'utf8')); } catch { /* sin pendiente */ }
  const modo = (arg('--modo') || pendiente.modo) === 'volver' ? 'volver' : 'actualizar';
  aplicar({ carpeta, papel: (arg('--papel') || pendiente.papel) === 'pc2' ? 'pc2' : 'pc1', esperar: arg('--esperar'), modo, relanzar: args.includes('--relanzar') })
    .then(r => process.exit(r.ok ? 0 : 1));
}
