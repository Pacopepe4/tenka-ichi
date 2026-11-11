// La «app» del realizador (11/11): versión instalada, registro en archivo (las consolas van ocultas) y el botón
// «Actualizar» del panel, igual en los dos PCs.
//
// Actualizar: la web dice qué versión reparte y la huella SHA-256 de cada zip (/puente/realizador-version.json).
// Si hay una nueva y no se está emitiendo, se baja el zip de este PC, se comprueba la huella, se descomprime en
// .actualizacion/nueva y se lanza instalar/aplicar-actualizacion.js (de la versión NUEVA, copiado fuera) en segundo
// plano; este proceso se cierra. El aplicador espera a que se cierre, guarda la versión de ahora en
// .actualizacion/anterior, pone la nueva conservando lo de este PC (opciones.local.json, partidas, node, ffmpeg…),
// vuelve a pasar el instalador sin preguntar nada y abre otra vez el realizador. «Volver a la anterior» hace lo mismo
// con .actualizacion/anterior.
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync, appendFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { RAIZ } from './opciones.js';

export const CARPETA_ACT = '.actualizacion';

export function versionInstalada(raiz = RAIZ) {
  try {
    const [version = '', fecha = ''] = readFileSync(join(raiz, 'VERSION.txt'), 'utf8').trim().split(/\s+/);
    return { version: version || null, fecha: fecha || null };
  } catch { return { version: null, fecha: null }; }
}

// wss://x/realizador → https://x (la web de Gokudō, de donde salen las descargas)
export function webDe(o = {}) {
  for (const u of [o.puente?.url, o.tenkaIchi?.url]) {
    try {
      const x = new URL(u);
      return `${x.protocol === 'ws:' || x.protocol === 'http:' ? 'http:' : 'https:'}//${x.host}`;
    } catch { /* sin dirección */ }
  }
  return null;
}

// Además de la consola (que ahora va oculta), cada línea queda en partidas/<nombre>-AAAA-MM-DD.log
export function registroEnArchivo(o, nombre, { consola = console.log } = {}) {
  const carpeta = join(o.registro?.raiz || RAIZ, o.registro?.carpeta || 'partidas');
  try { mkdirSync(carpeta, { recursive: true }); } catch { /* sin carpeta: solo consola */ }
  return texto => {
    consola(texto);
    const ahora = new Date();
    try { appendFileSync(join(carpeta, `${nombre}-${ahora.toISOString().slice(0, 10)}.log`), `${ahora.toTimeString().slice(0, 8)} ${texto}\n`); } catch { /* disco lleno o sin permiso */ }
  };
}

// Lanza un proceso que sigue vivo cuando este se cierra, sin ventana
export function lanzarOculto(programa, args, { cwd } = {}) {
  const p = spawn(programa, args, { cwd, detached: true, stdio: 'ignore', windowsHide: true });
  p.unref();
  return p;
}

function descomprimir(zip, destino) {
  rmSync(destino, { recursive: true, force: true });
  mkdirSync(destino, { recursive: true });
  execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${destino.replace(/'/g, "''")}' -Force`], { stdio: 'ignore', timeout: 300000, windowsHide: true });
}

export class Actualizador extends EventEmitter {
  // ocupado(): texto con el motivo si ahora no se puede actualizar (emitiendo, partida en marcha), o null.
  // salir(): cierra el realizador (para la cámara, el grabador… y termina el proceso).
  constructor({ papel, o = {}, raiz = RAIZ, ocupado = () => null, salir = () => process.exit(0), bajar = fetch, registrar = () => {},
    node = process.execPath, lanzar = lanzarOculto, abrirZip = descomprimir, cadaMinutos = 30 }) {
    super();
    Object.assign(this, { papel, o, raiz, ocupado, salir, bajar, registrar, node, lanzar, abrirZip, cadaMinutos });
    this.act = join(raiz, CARPETA_ACT);
    this.estado = { ...versionInstalada(raiz), nueva: null, fase: 'nada', error: null, anterior: existsSync(join(this.act, 'anterior')), resultado: this.leerResultado() };
  }

  leerResultado() {
    try { return JSON.parse(readFileSync(join(this.act, 'resultado.json'), 'utf8')); } catch { return null; }
  }

  publico() { return { ...this.estado, web: webDe(this.o), ocupado: this.ocupado() || null }; }

  cambiar(cambios) { Object.assign(this.estado, cambios); this.emit('cambio'); }

  arrancar() {
    this.primera = setTimeout(() => this.comprobar().catch(() => {}), 5000);
    this.cada = setInterval(() => this.comprobar().catch(() => {}), this.cadaMinutos * 60000);
    this.primera.unref?.();
    this.cada.unref?.();
  }

  parar() { clearTimeout(this.primera); clearInterval(this.cada); }

  async comprobar() {
    const web = webDe(this.o);
    if (!web) throw new Error('no se sabe cuál es la web de Gokudō');
    const r = await this.bajar(`${web}/puente/realizador-version.json`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`la web no dice qué versión hay (HTTP ${r.status})`);
    const v = await r.json();
    const zip = v.zips?.[`realizador-${this.papel}.zip`];
    const nueva = v.version && zip && v.version !== this.estado.version ? { version: v.version, fecha: v.fecha, ...zip } : null;
    this.cambiar({ nueva, comprobado: new Date().toISOString(), error: null });
    if (nueva) this.registrar(`[app] hay una versión nueva del realizador: ${nueva.version}${nueva.fecha ? ` (${nueva.fecha.slice(0, 10)})` : ''}`);
    return nueva;
  }

  // Copia el aplicador fuera de las carpetas que se van a tocar y lo lanza en segundo plano
  lanzarAplicador(desde, modo) {
    const aplicador = join(this.act, 'aplicar.mjs');
    copyFileSync(join(desde, 'instalar', 'aplicar-actualizacion.js'), aplicador);
    this.lanzar(this.node, [aplicador, '--carpeta', this.raiz, '--papel', this.papel, '--esperar', String(process.pid), '--modo', modo], { cwd: this.act });
  }

  async actualizar() {
    const motivo = this.ocupado();
    if (motivo) throw new Error(motivo);
    if (['bajando', 'preparando', 'aplicando'].includes(this.estado.fase)) throw new Error('ya se está actualizando');
    try {
      const nueva = this.estado.nueva || await this.comprobar();
      if (!nueva) throw new Error('ya tienes la última versión');
      const web = webDe(this.o);
      this.cambiar({ fase: 'bajando', error: null });
      const r = await this.bajar(`${web}/puente/realizador-${this.papel}.zip`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`no se pudo bajar la versión nueva (HTTP ${r.status})`);
      const datos = Buffer.from(await r.arrayBuffer());
      if (createHash('sha256').update(datos).digest('hex') !== nueva.sha256) throw new Error('lo bajado no coincide con la huella de la web: no se instala (prueba otra vez en un rato)');
      this.cambiar({ fase: 'preparando' });
      mkdirSync(this.act, { recursive: true });
      const zip = join(this.act, 'nueva.zip');
      writeFileSync(zip, datos);
      const carpetaNueva = join(this.act, 'nueva');
      this.abrirZip(zip, carpetaNueva);
      if (!existsSync(join(carpetaNueva, 'instalar', 'aplicar-actualizacion.js'))) throw new Error('la versión bajada no trae su actualizador');
      // Que no se pierda la versión nueva por el camino: se repite la comprobación de la huella del zip guardado
      if (createHash('sha256').update(readFileSync(zip)).digest('hex') !== nueva.sha256) throw new Error('el zip guardado no coincide');
      this.lanzarAplicador(carpetaNueva, 'actualizar');
      this.registrar(`[app] actualizando a la versión ${nueva.version}: el realizador se cierra y se vuelve a abrir solo`);
      this.cambiar({ fase: 'aplicando' });
      setTimeout(() => this.salir(), 800);
    } catch (e) {
      this.cambiar({ fase: 'error', error: e.message });
      this.registrar(`[app] no se ha podido actualizar: ${e.message}`);
      throw e;
    }
  }

  async volver() {
    const motivo = this.ocupado();
    if (motivo) throw new Error(motivo);
    if (!existsSync(join(this.act, 'anterior', 'comun'))) throw new Error('no hay una versión anterior guardada');
    this.lanzarAplicador(this.raiz, 'volver');
    this.registrar('[app] volviendo a la versión anterior: el realizador se cierra y se vuelve a abrir solo');
    this.cambiar({ fase: 'aplicando' });
    setTimeout(() => this.salir(), 800);
  }
}
