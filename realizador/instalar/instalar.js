// Instalación de cada PC en un paso (lo lanzan INSTALAR-PC1.bat e INSTALAR-PC2.bat):
//
//   node instalar/instalar.js pc1 --clave CONTRASEÑA [--ruta "D:\Riot Games\League of Legends"]
//   node instalar/instalar.js pc2 --clave CONTRASEÑA [--ruta ...]
//
//  - Guarda la contraseña (la del panel de TENKA ICHI: sirve para todo) y el papel del PC en opciones.local.json.
//  - PC 2: si viene el puente del marcador de TENKA ICHI (descarga de la guía), le deja la misma contraseña.
//  - Los dos se encuentran en la sala del realizador del servidor de TENKA ICHI con esa contraseña: sirve
//    aunque estén en redes distintas.
//  - PC 2: deja OBS listo (escenas, búfer, WebSocket con la misma contraseña); su relé lo maneja en local.
//  - Activa en LoL lo que necesita cada PC (Replay API; en el PC 1 también LiveEvents).
//  - Crea en el escritorio el acceso directo «Realizador PC1» o «Realizador PC2».
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { RAIZ, cargarOpciones, mezclar } from '../comun/opciones.js';
import { configurarApis, rutaConfig } from './configurar-lol.js';
import { configurarObs, carpetaObs, obsAbierto, NOMBRE } from './configurar-obs.js';

// El overlay de TENKA ICHI sale del mismo servidor que la sala: wss://x/realizador → https://x/overlay/
export function overlayDeTenka(urlPuente) {
  try {
    const u = new URL(urlPuente);
    u.protocol = u.protocol === 'ws:' ? 'http:' : 'https:';
    u.pathname = '/overlay/';
    return u.href;
  } catch { return ''; }
}

// El panel de TENKA ICHI (su WebSocket /ws) también: wss://x/realizador → wss://x/ws
export function wsDeTenka(urlPuente) {
  try {
    const u = new URL(urlPuente);
    u.pathname = '/ws';
    return u.href;
  } catch { return ''; }
}

export function opcionesLocales(papel, clave, actuales = {}, ruta, urlPuente) {
  // Los dos PCs hablan con el panel de TENKA ICHI con la misma contraseña: el PC 1 lleva el overlay (línea por
  // línea, gráfica de oro, ficha) y el PC 2 mira el draft para poner su escena
  const tenka = wsDeTenka(urlPuente || actuales.puente?.url || 'wss://tenka-ichi.onrender.com/realizador');
  const comun = { papel, clave, ...(ruta ? { rutaLoL: ruta } : {}), ...(tenka ? { tenkaIchi: { activo: true, url: actuales.tenkaIchi?.url || tenka, clave } } : {}) };
  // Los dos PCs se encuentran en la sala del realizador del servidor de TENKA ICHI. OBS va en el PC 2 y lo
  // maneja su relé: el PC 1 solo le dice qué guardar y qué repetir.
  const puente = { modo: 'tenka' };
  if (papel === 'pc1') return mezclar(actuales, { ...comun, puente, obs: { activo: false } });
  return mezclar(actuales, { ...comun, puente, obs: { activo: true, enRele: true, clave } });
}

function accesoDirecto(nombre, bat) {
  if (process.platform !== 'win32') return null;
  const ps = [
    "$e=[Environment]::GetFolderPath('Desktop')",
    `$s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $e '${nombre}.lnk'))`,
    `$s.TargetPath='${bat.replace(/'/g, "''")}'`,
    `$s.WorkingDirectory='${RAIZ.replace(/'/g, "''")}'`,
    "$s.Save()",
  ].join(';');
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { stdio: 'ignore' });
  return nombre;
}

export function instalar({ papel, clave, ruta, emision = '', rutaLocal = join(RAIZ, 'opciones.local.json'), carpeta = carpetaObs(), atajo = true, carpetaPuente }) {
  if (papel !== 'pc1' && papel !== 'pc2') throw new Error('Di qué PC es: pc1 o pc2');
  if (!clave || clave.length < 4) throw new Error('La contraseña tiene que tener al menos 4 caracteres');
  const hechos = [];
  const avisos = [];

  // 1. opciones.local.json
  const actuales = existsSync(rutaLocal) ? JSON.parse(readFileSync(rutaLocal, 'utf8').replace(/^\uFEFF/, '')) : {};
  const locales = opcionesLocales(papel, clave, actuales, ruta, cargarOpciones().puente?.url);
  // Clave de retransmisión de Kick (solo PC 2): se queda en opciones.local.json de este PC y de ahí la lee
  // configurar-obs para el perfil de OBS. No sale nunca en pantalla ni en las descargas.
  const conEmision = papel === 'pc2' && Boolean(emision.trim());
  if (conEmision) locales.obs = { ...locales.obs, emision: { ...(locales.obs?.emision || {}), clave: emision.trim() } };
  writeFileSync(rutaLocal, JSON.stringify(locales, null, 2) + '\n');
  hechos.push('Contraseña guardada');
  if (conEmision) hechos.push('Clave de retransmisión guardada solo en este PC');
  const o = cargarOpciones();

  // 2. LoL
  try {
    const cfg = rutaConfig(ruta || o.rutaLoL);
    const r = configurarApis(cfg, papel === 'pc1' ? { liveEvents: true, puerto: o.explorador.liveEventsPuerto } : {});
    hechos.push(`LoL listo (${r.join(', ')}). Reinicia el cliente de LoL si estaba abierto`);
  } catch (e) { avisos.push(`LoL: ${e.message}`); }

  // 3. OBS (solo PC 2)
  if (papel === 'pc2') {
    if (obsAbierto()) avisos.push('OBS está abierto: ciérralo y vuelve a instalar para dejarlo configurado');
    else {
      try {
        const r = configurarObs({ carpeta, opciones: o, rutaLocal, overlayPorDefecto: overlayDeTenka(o.puente?.url), carpetaClips: join(homedir(), 'Videos', NOMBRE) });
        hechos.push(...r.hechos.map(h => `OBS: ${h}`));
        if (!r.overlay) avisos.push('OBS: falta la URL del overlay de TENKA ICHI (doble clic en «Overlay TENKA ICHI»)');
      } catch (e) { avisos.push(`OBS: ${e.message}`); }
    }
  }

  // 4. Puente del marcador de TENKA ICHI (viene en la descarga del PC 2 de la guía): la misma contraseña
  const puente = join(RAIZ, 'puente');
  if (papel === 'pc2' && carpetaPuente !== null && existsSync(join(carpetaPuente || puente, 'puente-tenka-ichi.ps1'))) {
    // Con BOM: PowerShell 5 lee sin BOM como ANSI y una ñ en la contraseña no coincidiría
    writeFileSync(join(carpetaPuente || puente, 'clave.txt'), `\uFEFF${clave}`);
    hechos.push('Puente del marcador de TENKA ICHI con la misma contraseña');
  }

  // 5. Acceso directo
  if (atajo) {
    const nombre = papel === 'pc1' ? 'Realizador PC1' : 'Realizador PC2';
    try {
      if (accesoDirecto(nombre, join(RAIZ, 'windows', `realizador-${papel}.bat`))) hechos.push(`Acceso directo «${nombre}» en el escritorio`);
    } catch (e) { avisos.push(`No se pudo crear el acceso directo: ${e.message}`); }
  }
  return { hechos, avisos };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const arg = n => { const i = args.indexOf(n); return i !== -1 ? args[i + 1] : undefined; };
  try {
    // La clave de retransmisión llega por el entorno (REALIZADOR_EMISION) para que no se vea en la lista de procesos
    const { hechos, avisos } = instalar({ papel: args[0], clave: arg('--clave'), ruta: arg('--ruta'), emision: process.env.REALIZADOR_EMISION || '' });
    console.log('');
    for (const h of hechos) console.log(`  OK  ${h}`);
    for (const a of avisos) console.log(`  !!  ${a}`);
    console.log('');
    console.log(args[0] === 'pc1'
      ? 'Listo. Abre «Realizador PC1» en el escritorio. Se conecta solo con el PC 2 que tenga la misma contraseña.'
      : 'Listo. Abre «Realizador PC2» en el escritorio: abre OBS y se conecta solo con el PC 1.');
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
