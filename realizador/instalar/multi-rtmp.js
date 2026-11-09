// Emitir a la vez en Kick y en Twitch. OBS solo emite a un sitio: la emisión principal va a Kick (service.json del
// perfil) y Twitch va con el complemento «Multiple RTMP outputs» (github.com/sorayuki/obs-multi-rtmp, GPL), que
// arranca y para su destino a la vez que la emisión principal y usa su mismo codificador (no codifica dos veces).
//
//  - instalarComplemento(): baja el zip oficial de su versión fija, comprueba su SHA-256 y lo deja con el formato de
//    complementos de OBS 28+ en %ProgramData%\obs-studio\plugins\obs-multi-rtmp\ (bin\64bit y data). Es lo mismo que
//    hace su instalador, sin pedir administrador; no se usa el instalador porque al «quitar» borra la carpeta entera
//    de complementos. Si ya está, no hace nada.
//  - configurarDestinos(): escribe el destino de Twitch en <perfil>\obs-multi-rtmp.json (los demás destinos que
//    hubiera se dejan como están). La clave sale de opciones.local.json de este PC y nunca se enseña.
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

export const COMPLEMENTO = {
  version: '0.7.4.5',
  url: 'https://github.com/sorayuki/obs-multi-rtmp/releases/download/0.7.4.5/obs-multi-rtmp-0.7.4.5-windows-x64.zip',
  sha256: '5ddff9bedf9cf09534db6157a5c01f5eb0115ada042ad0c3fefb7ddc1e9af801',
};
export const ID_TWITCH = 'realizador-twitch';
export const SERVIDOR_TWITCH = 'rtmp://live.twitch.tv/app';
const ENCODER_PRINCIPAL = '<OBS_STREAMING_ENCODER>';

export function carpetaComplemento() {
  const base = process.env.ALLUSERSPROFILE || process.env.ProgramData;
  return base ? join(base, 'obs-studio', 'plugins', 'obs-multi-rtmp') : null;
}

const copiarCarpeta = (desde, hasta) => {
  mkdirSync(hasta, { recursive: true });
  for (const n of readdirSync(desde)) {
    const a = join(desde, n);
    const b = join(hasta, n);
    if (statSync(a).isDirectory()) copiarCarpeta(a, b); else copyFileSync(a, b);
  }
};

// Coloca lo que trae el zip (obs-plugins/64bit y data/obs-plugins/obs-multi-rtmp) con el formato nuevo
export function colocarComplemento(descomprimido, destino) {
  const dll = join(descomprimido, 'obs-plugins', '64bit', 'obs-multi-rtmp.dll');
  if (!existsSync(dll)) throw new Error('el zip del complemento no trae obs-multi-rtmp.dll');
  mkdirSync(join(destino, 'bin', '64bit'), { recursive: true });
  copyFileSync(dll, join(destino, 'bin', '64bit', 'obs-multi-rtmp.dll'));
  const datos = join(descomprimido, 'data', 'obs-plugins', 'obs-multi-rtmp');
  if (existsSync(datos)) copiarCarpeta(datos, join(destino, 'data'));
}

export async function instalarComplemento({ destino = carpetaComplemento(), complemento = COMPLEMENTO, bajar = fetch } = {}) {
  if (!destino) return { hecho: false, motivo: 'no se sabe dónde van los complementos de OBS' };
  if (existsSync(join(destino, 'bin', '64bit', 'obs-multi-rtmp.dll'))) return { hecho: true, ya: true };
  const r = await bajar(complemento.url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`no se pudo bajar el complemento (HTTP ${r.status})`);
  const datos = Buffer.from(await r.arrayBuffer());
  const suma = createHash('sha256').update(datos).digest('hex');
  if (suma !== complemento.sha256) throw new Error('el complemento bajado no coincide con su huella oficial: no se instala');
  const tmp = join(tmpdir(), `realizador-multi-rtmp-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const zip = join(tmp, 'complemento.zip');
  writeFileSync(zip, datos);
  try {
    execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${join(tmp, 'x').replace(/'/g, "''")}' -Force`], { stdio: 'ignore', timeout: 120000 });
    colocarComplemento(join(tmp, 'x'), destino);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  return { hecho: true, ya: false };
}

// Destino de Twitch en el JSON del complemento (por perfil). Sin clave, se quita el destino del realizador.
export function configurarDestinos({ perfil, twitch = {} }) {
  const ruta = join(perfil, 'obs-multi-rtmp.json');
  let cfg = { targets: [], video_configs: [], audio_configs: [] };
  if (existsSync(ruta)) {
    try { cfg = { ...cfg, ...JSON.parse(readFileSync(ruta, 'utf8').replace(/^﻿/, '')) }; } catch { /* roto: se rehace */ }
  }
  cfg.targets = (cfg.targets || []).filter(t => t.id !== ID_TWITCH);
  if (twitch.clave) {
    cfg.targets.push({
      id: ID_TWITCH, name: 'Twitch (realizador)', protocol: 'RTMP',
      'service-param': { server: twitch.servidor || SERVIDOR_TWITCH, key: twitch.clave, use_auth: false, bwtest: false },
      'output-param': {},
      'sync-start': true, 'sync-stop': true, enabled: true,
      'video-config': ENCODER_PRINCIPAL, 'audio-config': ENCODER_PRINCIPAL,
    });
  }
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, JSON.stringify(cfg, null, 2));
  return Boolean(twitch.clave);
}
