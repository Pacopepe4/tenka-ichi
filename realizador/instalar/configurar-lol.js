// Deja el juego listo en cada PC y, en el PC 1, pone y quita el perfil mínimo.
//
//   node instalar/configurar-lol.js pc1            APIs para el explorador (Replay API, LiveEvents)
//   node instalar/configurar-lol.js pc2            APIs para la antena (Replay API)
//   node instalar/configurar-lol.js perfil-minimo  guarda una copia y aplica el perfil ligero (PC 1)
//   node instalar/configurar-lol.js restaurar      vuelve a dejarlo todo como estaba
//   Opcional: --ruta "D:\Riot Games\League of Legends"
//
// El cliente reescribe game.cfg con PersistedSettings.json, así que se cambian los dos. Si un archivo está
// en solo lectura (como tienes PersistedSettings.json), se quita el bloqueo para escribir y se vuelve a poner.
import { readFileSync, writeFileSync, existsSync, statSync, chmodSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const CARPETA_COPIA = 'realizador-copia';
const LIVE_EVENTS = [
  'OnChampionKill', 'OnKillDragon_Spectator', 'OnKillRiftHerald_Spectator', 'OnKillWorm_Spectator',
  'OnDragonSoulGiven', 'OnTurretPlateDestroyed',
];

export function rutaConfig(ruta) {
  const base = ruta || 'C:\\Riot Games\\League of Legends';
  return /config$/i.test(base) ? base : join(base, 'Config');
}

// ---------- escribir respetando el solo lectura ----------
function escribir(archivo, texto) {
  const existe = existsSync(archivo);
  const soloLectura = existe && (statSync(archivo).mode & 0o200) === 0;
  if (soloLectura) chmodSync(archivo, 0o666);
  try { writeFileSync(archivo, texto); } finally { if (soloLectura) chmodSync(archivo, 0o444); }
  return soloLectura;
}

// ---------- game.cfg (ini) ----------
export function ponerEnIni(texto, cambios) {
  const lineas = texto.split(/\r?\n/);
  for (const [seccion, claves] of Object.entries(cambios)) {
    let ini = lineas.findIndex(l => l.trim().toLowerCase() === `[${seccion.toLowerCase()}]`);
    if (ini === -1) {
      if (lineas.length && lineas.at(-1).trim() !== '') lineas.push('');
      lineas.push(`[${seccion}]`);
      ini = lineas.length - 1;
    }
    for (const [k, v] of Object.entries(claves)) {
      let fin = lineas.findIndex((l, i) => i > ini && /^\s*\[/.test(l));
      if (fin === -1) fin = lineas.length;
      const i = lineas.findIndex((l, j) => j > ini && j < fin && l.split('=')[0].trim().toLowerCase() === k.toLowerCase());
      if (i !== -1) lineas[i] = `${k}=${v}`;
      else {
        let donde = fin;
        while (donde > ini + 1 && lineas[donde - 1].trim() === '') donde--;
        lineas.splice(donde, 0, `${k}=${v}`);
      }
    }
  }
  return lineas.join('\r\n');
}

// ---------- PersistedSettings.json ----------
export function ponerEnPersisted(datos, cambios) {
  const archivos = datos.files || (datos.files = []);
  let juego = archivos.find(f => String(f.name).toLowerCase() === 'game.cfg');
  if (!juego) archivos.push(juego = { name: 'Game.cfg', sections: [] });
  juego.sections ||= [];
  for (const [seccion, claves] of Object.entries(cambios)) {
    let s = juego.sections.find(x => String(x.name).toLowerCase() === seccion.toLowerCase());
    if (!s) juego.sections.push(s = { name: seccion, settings: [] });
    s.settings ||= [];
    for (const [k, v] of Object.entries(claves)) {
      const a = s.settings.find(x => String(x.name).toLowerCase() === k.toLowerCase());
      if (a) a.value = String(v); else s.settings.push({ name: k, value: String(v) });
    }
  }
  return datos;
}

function aplicar(config, cambios) {
  const hechos = [];
  const cfg = join(config, 'game.cfg');
  if (existsSync(cfg)) {
    const bloq = escribir(cfg, ponerEnIni(readFileSync(cfg, 'utf8'), cambios));
    hechos.push(`game.cfg${bloq ? ' (solo lectura, respetado)' : ''}`);
  }
  const pers = join(config, 'PersistedSettings.json');
  if (existsSync(pers)) {
    const datos = ponerEnPersisted(JSON.parse(readFileSync(pers, 'utf8')), cambios);
    const bloq = escribir(pers, JSON.stringify(datos, null, 4));
    hechos.push(`PersistedSettings.json${bloq ? ' (solo lectura, respetado)' : ''}`);
  }
  if (!hechos.length) throw new Error(`No hay game.cfg ni PersistedSettings.json en ${config}. ¿Está bien la ruta?`);
  return hechos;
}

export function configurarApis(config, { liveEvents = false, puerto = 34243 } = {}) {
  const cambios = { General: { EnableReplayApi: '1' } };
  if (liveEvents) cambios.LiveEvents = { Enable: '1', Port: String(puerto) };
  const hechos = aplicar(config, cambios);
  if (liveEvents) {
    const ini = join(config, 'LiveEvents.ini');
    const actuales = existsSync(ini) ? readFileSync(ini, 'utf8').split(/\r?\n/).filter(Boolean) : [];
    for (const l of LIVE_EVENTS) if (!actuales.includes(l)) actuales.push(l);
    escribir(ini, actuales.join('\r\n'));
    hechos.push('LiveEvents.ini');
  }
  return hechos;
}

// Guarda una copia de lo que hay y aplica el perfil. Si ya hay copia (el agente se cerró de golpe), no la
// pisa: la copia buena es la de antes del primer perfil.
export function aplicarPerfil(config, perfil) {
  const copia = join(config, CARPETA_COPIA);
  if (!existsSync(copia)) {
    mkdirSync(copia, { recursive: true });
    for (const f of ['game.cfg', 'PersistedSettings.json']) {
      if (existsSync(join(config, f))) copyFileSync(join(config, f), join(copia, f));
    }
  }
  return aplicar(config, perfil);
}

export function restaurarPerfil(config) {
  const copia = join(config, CARPETA_COPIA);
  if (!existsSync(copia)) return [];
  const hechos = [];
  for (const f of ['game.cfg', 'PersistedSettings.json']) {
    const de = join(copia, f);
    if (!existsSync(de)) continue;
    escribir(join(config, f), readFileSync(de));
    hechos.push(f);
  }
  rmSync(copia, { recursive: true, force: true });
  return hechos;
}

// ---------- uso desde la línea de órdenes ----------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { cargarOpciones } = await import('../comun/opciones.js');
  const o = cargarOpciones();
  const args = process.argv.slice(2);
  const iRuta = args.indexOf('--ruta');
  const config = rutaConfig(iRuta !== -1 ? args[iRuta + 1] : o.rutaLoL);
  const orden = args.find(a => !a.startsWith('--') && a !== args[iRuta + 1]);
  try {
    let hechos;
    if (orden === 'pc1') hechos = configurarApis(config, { liveEvents: true, puerto: o.explorador.liveEventsPuerto });
    else if (orden === 'pc2') hechos = configurarApis(config, { liveEvents: false });
    else if (orden === 'perfil-minimo') hechos = aplicarPerfil(config, o.perfilMinimo);
    else if (orden === 'restaurar') hechos = restaurarPerfil(config);
    else {
      console.log('Uso: node instalar/configurar-lol.js pc1 | pc2 | perfil-minimo | restaurar  [--ruta "C:\\Riot Games\\League of Legends"]');
      process.exit(1);
    }
    console.log(hechos.length ? `Hecho en ${config}: ${hechos.join(', ')}` : 'No había nada que restaurar');
    if (orden === 'pc1' || orden === 'pc2') console.log('Reinicia el cliente de LoL para que lo lea.');
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
