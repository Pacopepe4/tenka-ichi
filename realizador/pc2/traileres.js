// Tráilers del inicio del directo (PC 2): tras la intro, los de los equipos (el último, el de shinigami) y el de la
// jornada, uno detrás de otro en la fuente multimedia «Trailer directo» de la escena Traileres (Pacopepe, 15/11: «tras
// el inicio del directo, meter los tráilers de todos los equipos… y luego el tráiler de la jornada»).
//
// Los vídeos no van en el zip (unos 360 MB): se copian a mano en una carpeta fija fuera del realizador
// (obs.videosDirecto.carpeta, C:\Gokudo\videos-directo) y, si no está, en <raíz del realizador>\videos. Salen todos los
// NN-*.mp4 (y .mov, .webm, .mkv) en orden de nombre.
//
// Duraciones: con ffprobe al preparar (herramientas/ffmpeg, obs.ffprobe, al lado de obs.ffmpeg o clips.ffmpeg, o el
// PATH) y, si no está, con lo que escribe «ffmpeg -i» (el ffmpeg de siempre). Si tampoco da la de un vídeo, la que
// dé OBS al cargarlo (GetMediaInputStatus → mediaDuration) y, si tampoco, se espera a que OBS diga que el vídeo ha acabado (con un tope). Un vídeo que no carga se salta.
//
// La fase la lleva pc2/fases.js (fase 'traileres'): esto solo reproduce. El relé le da a fases la duración total
// (duracion()) y, al entrar en la fase, llama a empezar(id); si la fase se corta, a parar().
import { readdirSync, statSync, existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { join, dirname, basename } from 'node:path';

export const EXTENSIONES = /\.(mp4|mov|webm|mkv)$/i;
// Solo los numerados (01-ryujin.mp4…): lo demás de la carpeta (LEEME.txt, copias) no sale
export const NOMBRE = /^\d+[-_ .].*\.(mp4|mov|webm|mkv)$/i;
// Lo que se supone que dura un vídeo del que aún no se sabe la duración (la fase se ajusta al cargarlo)
export const ESTIMADO_SEGUNDOS = 90;
// Tope para esperar a un vídeo sin duración conocida (si OBS no dice que ha acabado)
export const TOPE_SEGUNDOS = 300;

export function carpetasVideos(o = {}, raiz = '') {
  const v = o.obs?.videosDirecto || {};
  return [v.carpeta, raiz ? join(raiz, 'videos') : null].filter(c => typeof c === 'string' && c.trim());
}

// Los vídeos de la primera carpeta que tenga alguno, en orden de nombre
export function listarVideos(carpetas = []) {
  for (const c of carpetas) {
    try {
      if (!existsSync(c)) continue;
      const archivos = readdirSync(c).filter(n => NOMBRE.test(n)).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
      const rutas = archivos.map(n => join(c, n)).filter(r => { try { return statSync(r).isFile(); } catch { return false; } });
      if (rutas.length) return { carpeta: c, rutas };
    } catch { /* carpeta que no se puede leer: la siguiente */ }
  }
  return { carpeta: null, rutas: [] };
}

// ffprobe como se busca ffmpeg en el resto del realizador
export function buscarFfprobe(o = {}, raiz = '') {
  if (o.obs?.ffprobe) return o.obs.ffprobe;
  const junto = [o.obs?.ffmpeg, o.clips?.ffmpeg].filter(Boolean).map(f => join(dirname(f), basename(f).replace(/ffmpeg/i, 'ffprobe')));
  const enHerramientas = raiz ? [join(raiz, 'herramientas', 'ffmpeg', 'ffprobe.exe'), join(raiz, 'herramientas', 'ffmpeg', 'ffprobe')] : [];
  return [...junto, ...enHerramientas].find(r => { try { return existsSync(r); } catch { return false; } }) || 'ffprobe';
}

// Duración en segundos con ffprobe (null si no hay ffprobe o no la da)
export function duracionFfprobe(ffprobe, ruta, tiempoMs = 15000) {
  return new Promise(resolver => {
    try {
      execFile(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', ruta],
        { timeout: tiempoMs, windowsHide: true }, (error, salida) => {
          const s = Number(String(salida || '').trim());
          resolver(!error && Number.isFinite(s) && s > 0 ? s : null);
        });
    } catch { resolver(null); }
  });
}

// Sin ffprobe (el instalador solo deja ffmpeg.exe en herramientas/ffmpeg): la duración que escribe «ffmpeg -i»
// («Duration: 00:01:04.23»). ffmpeg acaba con error porque no se le da salida: da igual, se lee lo que escribe
export function duracionFfmpeg(ffmpeg, ruta, tiempoMs = 15000) {
  return new Promise(resolver => {
    try {
      execFile(ffmpeg, ['-hide_banner', '-i', ruta], { timeout: tiempoMs, windowsHide: true }, (error, salida, errores) => {
        const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(String(errores || '') + String(salida || ''));
        const s = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN;
        resolver(Number.isFinite(s) && s > 0 ? s : null);
      });
    } catch { resolver(null); }
  });
}

const red = s => Math.round(s * 10) / 10;

export class Traileres {
  // obs: el cliente de OBS (ponerVideo, pararVideo, estadoVideo). medir(ruta): segundos o null (por defecto, ffprobe).
  // listar(): { carpeta, rutas }. alAjustar(id, segundosQueQuedan): para fases.ajustarTemporal. alCambiar(detalle).
  constructor({ obs = null, fuente = 'Trailer directo', listar = () => ({ carpeta: null, rutas: [] }), medir = async () => null,
    registrar = () => {}, alAjustar = () => {}, alCambiar = () => {}, esperaEstadoMs = 3000, cadaMs = 500 } = {}) {
    this.obs = obs;
    this.fuente = fuente;
    this.listar = listar;
    this.medir = medir;
    this.registrar = registrar;
    this.alAjustar = alAjustar;
    this.alCambiar = alCambiar;
    this.esperaEstadoMs = esperaEstadoMs;
    this.cadaMs = cadaMs;
    this.videos = [];         // [{ ruta, segundos | null }]
    this.carpeta = null;
    this.duraciones = new Map(); // ruta|tamaño|fecha → segundos (no se vuelve a medir lo mismo)
    this.preparando = null;
    this.id = null;           // la fase que se está reproduciendo (fases.temporal.id)
    this.vez = 0;
    this.actual = null;       // número del vídeo que sale (1, 2…)
    this.despertar = null;
  }

  get activo() { return this.id !== null; }

  // Mira la carpeta y mide los vídeos nuevos (no se espera a la vez dos veces)
  preparar() {
    if (this.preparando) return this.preparando;
    this.preparando = (async () => {
      let lista = { carpeta: null, rutas: [] };
      try { lista = this.listar() || lista; } catch (e) { this.registrar(`[tráilers] no se puede leer la carpeta: ${e.message}`); }
      const videos = [];
      for (const ruta of lista.rutas || []) {
        let clave = ruta;
        try { const st = statSync(ruta); clave = `${ruta}|${st.size}|${st.mtimeMs}`; } catch { /* sin datos: por la ruta */ }
        if (!this.duraciones.has(clave)) {
          let s = null;
          try { s = await this.medir(ruta); } catch { s = null; }
          if (Number.isFinite(s) && s > 0) this.duraciones.set(clave, s);
        }
        videos.push({ ruta, segundos: this.duraciones.get(clave) ?? null });
      }
      const antes = JSON.stringify(this.videos);
      this.videos = videos;
      this.carpeta = lista.carpeta;
      if (JSON.stringify(videos) !== antes || !this.mirado) {
        this.mirado = true;
        const sin = videos.filter(v => !v.segundos).length;
        this.registrar(videos.length
          ? `[tráilers] ${videos.length} vídeo${videos.length === 1 ? '' : 's'} en ${lista.carpeta}: ${red(this.duracion())} s${sin ? ` (${sin} sin duración: se mira en OBS al cargarlo)` : ''}`
          : '[tráilers] no hay vídeos: la fase de tráilers se salta');
      }
      return videos;
    })().finally(() => { this.preparando = null; });
    return this.preparando;
  }

  // Lo que suman (los que no tienen duración cuentan ESTIMADO_SEGUNDOS); 0 sin vídeos
  duracion() {
    return this.videos.reduce((s, v) => s + (v.segundos || ESTIMADO_SEGUNDOS), 0);
  }

  publico() {
    return { videos: this.videos.length, segundos: Math.round(this.duracion()), carpeta: this.carpeta, actual: this.actual };
  }

  detalle() {
    return this.actual ? `${this.actual} de ${this.videos.length}` : null;
  }

  // Empieza desde el primero (id: el de la fase). No se espera: va por su cuenta hasta acabar o parar()
  empezar(id) {
    this.detener();
    const yo = this.vez;
    this.id = id;
    const lista = this.videos.slice();
    this.registrar(`[tráilers] empiezan: ${lista.length} vídeos, ${red(this.duracion())} s`);
    (async () => {
      let puestos = 0;
      for (let i = 0; i < lista.length; i++) {
        if (yo !== this.vez) return;
        const v = lista[i];
        const quedanDespues = lista.slice(i + 1).reduce((s, x) => s + (x.segundos || ESTIMADO_SEGUNDOS), 0);
        try {
          await this.obs.ponerVideo(this.fuente, v.ruta);
        } catch (e) {
          this.registrar(`[tráilers] ${basename(v.ruta)} no carga (${e.message}): se salta`);
          this.alAjustar(id, quedanDespues);
          continue;
        }
        if (yo !== this.vez) return;
        puestos++;
        this.actual = i + 1;
        let segundos = v.segundos;
        if (!segundos) segundos = await this.duracionEnObs(yo);
        if (yo !== this.vez) return;
        this.alAjustar(id, (segundos || ESTIMADO_SEGUNDOS) + quedanDespues);
        this.alCambiar(this.detalle());
        if (segundos) await this.esperar(segundos * 1000, yo);
        else await this.esperarFin(yo);
      }
      if (yo !== this.vez) return;
      this.registrar(puestos ? `[tráilers] acabados (${puestos} de ${lista.length})` : '[tráilers] no ha cargado ningún vídeo');
      this.id = null;
      this.actual = null;
      this.alAjustar(id, 0);
      this.alCambiar(null);
    })().catch(e => {
      this.registrar(`[tráilers] ${e.message}`);
      if (yo === this.vez) { this.id = null; this.actual = null; this.alAjustar(id, 0); }
    });
  }

  // La fase se corta (una orden del panel, la partida): se para el vídeo
  parar(motivo = '') {
    if (!this.activo) return;
    this.registrar(`[tráilers] se paran${motivo ? ` (${motivo})` : ''}`);
    this.detener();
    this.obs?.pararVideo?.(this.fuente)?.catch?.(() => {});
  }

  detener() {
    this.vez++;
    this.id = null;
    this.actual = null;
    this.despertar?.();
  }

  esperar(ms, yo) {
    return new Promise(resolver => {
      const self = this;
      const t = setTimeout(fin, ms);
      function fin() { clearTimeout(t); if (self.despertar === fin) self.despertar = null; resolver(); }
      this.despertar = fin;
      if (yo !== this.vez) fin();
    });
  }

  // Sin ffprobe: la duración que da OBS (tarda un poco en saberla al abrir el archivo)
  async duracionEnObs(yo) {
    const hasta = Date.now() + this.esperaEstadoMs;
    while (yo === this.vez && Date.now() < hasta) {
      try {
        const e = await this.obs.estadoVideo(this.fuente);
        if (Number.isFinite(e?.duracionMs) && e.duracionMs > 0) return Math.max(0.5, (e.duracionMs - Math.max(0, e.cursorMs || 0)) / 1000);
      } catch { /* aún no */ }
      await this.esperar(Math.min(250, this.cadaMs), yo);
    }
    return null;
  }

  // Ni ffprobe ni OBS dan la duración: se espera a que OBS diga que ha acabado (o al tope)
  async esperarFin(yo) {
    const hasta = Date.now() + TOPE_SEGUNDOS * 1000;
    let primero = true;
    while (yo === this.vez && Date.now() < hasta) {
      await this.esperar(this.cadaMs, yo);
      try {
        const e = await this.obs.estadoVideo(this.fuente);
        if (/ENDED|STOPPED|NONE/.test(String(e?.estado || '')) && !primero) return;
      } catch { /* sin estado: se sigue esperando */ }
      primero = false;
    }
  }
}
