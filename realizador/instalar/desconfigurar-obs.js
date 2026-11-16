// Deja el OBS del PC 2 como lo tenía su dueño (16/11, Pacopepe: «hoy, haciendo directo, le abría también en nuestro
// canal»). El realizador nunca toca el perfil ni la colección del dueño: crea los suyos («Realizador», con nuestras
// claves de Kick y Twitch) y abre OBS con ellos. Pero OBS recuerda al cerrarse el último perfil y la última colección,
// así que el dueño, al abrir su OBS de siempre, se encontraba el perfil «Realizador» y emitía también en nuestros
// canales. Esto vuelve a poner como perfil y colección de arranque los del dueño (los que había antes de configurar,
// apuntados en realizador-copia\dueno.json, o en la copia más antigua de user.ini/global.ini).
//
//   node instalar/desconfigurar-obs.js           (con OBS cerrado; si está abierto, se cierra antes)
//
// No borra el perfil ni la colección «Realizador» (el realizador los necesita): solo dejan de ser los de arranque.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { leerIni, carpetaObs, NOMBRE } from './configurar-obs.js';
import { ponerEnIni } from './configurar-lol.js';

const leer = ruta => (existsSync(ruta) ? readFileSync(ruta, 'utf8').replace(/^﻿/, '') : '');
export const ARCHIVO_DUENO = 'dueno.json';
const CAMPOS = ['Profile', 'ProfileDir', 'SceneCollection', 'SceneCollectionFile'];
const esNuestro = b => !b || [b.Profile, b.ProfileDir, b.SceneCollection, b.SceneCollectionFile].includes(NOMBRE);

// Lo que usaba el dueño: el dueno.json que apunta configurar-obs o, si no hay, la copia más antigua de user.ini o
// global.ini en realizador-copia\<fecha>\ que no sea ya el perfil del realizador. null si no se sabe.
export function duenoObs(carpeta) {
  const copias = join(carpeta, 'realizador-copia');
  try {
    const d = JSON.parse(leer(join(copias, ARCHIVO_DUENO)) || 'null');
    if (d && !esNuestro(d)) return d;
  } catch { /* roto */ }
  if (!existsSync(copias)) return null;
  const fechas = readdirSync(copias, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort();
  for (const f of fechas) {
    for (const n of ['user.ini', 'global.ini']) {
      const b = leerIni(leer(join(copias, f, n))).Basic;
      if (b && !esNuestro(b) && b.Profile) return Object.fromEntries(CAMPOS.map(c => [c, b[c]]).filter(([, v]) => v));
    }
  }
  return null;
}

// Apunta el del dueño (solo si lo que hay ahora es suyo, no el del realizador; y sin pisar uno ya apuntado)
export function apuntarDueno(carpeta, basic) {
  if (esNuestro(basic)) return false;
  const copias = join(carpeta, 'realizador-copia');
  mkdirSync(copias, { recursive: true });
  writeFileSync(join(copias, ARCHIVO_DUENO), JSON.stringify({ ...Object.fromEntries(CAMPOS.map(c => [c, basic[c]]).filter(([, v]) => v)), hora: new Date().toISOString() }, null, 2));
  return true;
}

// ¿Arranca OBS ahora con el perfil del realizador?
export function arrancaConRealizador(carpeta) {
  for (const n of ['user.ini', 'global.ini']) {
    const b = leerIni(leer(join(carpeta, n))).Basic;
    if (b && (b.Profile || b.SceneCollection)) return esNuestro(b);
  }
  return false;
}

// Pone el perfil y la colección del dueño como los de arranque. OBS tiene que estar cerrado (al cerrarse escribe los
// suyos encima). Devuelve { ok, perfil, coleccion, hechos, faltan }.
export function restaurarDueno({ carpeta = carpetaObs() } = {}) {
  const hechos = [], faltan = [];
  let d = duenoObs(carpeta);
  if (!d) {
    // Sin saber cuál era: el primer perfil y la primera colección que no son del realizador
    const perfiles = existsSync(join(carpeta, 'basic', 'profiles')) ? readdirSync(join(carpeta, 'basic', 'profiles'), { withFileTypes: true }).filter(e => e.isDirectory() && e.name !== NOMBRE).map(e => e.name) : [];
    const colecciones = existsSync(join(carpeta, 'basic', 'scenes')) ? readdirSync(join(carpeta, 'basic', 'scenes')).filter(n => n.endsWith('.json') && n !== `${NOMBRE}.json`).map(n => n.slice(0, -5)) : [];
    if (!perfiles.length) return { ok: false, hechos, faltan: ['No hay ningún perfil de OBS aparte del del realizador: no hay a cuál volver'] };
    d = { Profile: perfiles[0], ProfileDir: perfiles[0], ...(colecciones.length ? { SceneCollection: colecciones[0], SceneCollectionFile: colecciones[0] } : {}) };
    faltan.push(`No estaba apuntado cuál era el tuyo: se pone el perfil «${d.Profile}»${d.SceneCollection ? ` y la colección «${d.SceneCollection}»` : ''}. Si no es, elígelo en OBS (menú Perfil y Colección de escenas)`);
  }
  if (!d.SceneCollection) faltan.push('No se sabe cuál era tu colección de escenas: elígela en OBS (menú Colección de escenas)');
  const copia = join(carpeta, 'realizador-copia', `antes-de-desconfigurar-${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)}`);
  const inis = ['user.ini', 'global.ini'].map(n => join(carpeta, n)).filter(existsSync);
  for (const ruta of inis) {
    mkdirSync(copia, { recursive: true });
    copyFileSync(ruta, join(copia, ruta.endsWith('user.ini') ? 'user.ini' : 'global.ini'));
    writeFileSync(ruta, ponerEnIni(leer(ruta), { Basic: Object.fromEntries(CAMPOS.map(c => [c, d[c]]).filter(([, v]) => v)) }));
  }
  if (!inis.length) return { ok: false, hechos, faltan: ['No encuentro la configuración de OBS (user.ini / global.ini)'] };
  hechos.push(`OBS arrancará con tu perfil «${d.Profile}»${d.SceneCollection ? ` y tu colección «${d.SceneCollection}»` : ''}`);
  hechos.push(`El perfil y la colección «${NOMBRE}» siguen ahí (el realizador los usa al abrir OBS), pero ya no se abren solos`);
  return { ok: true, perfil: d.Profile, coleccion: d.SceneCollection || null, hechos, faltan };
}

// Cierra OBS con cuidado (como al pulsar la X: si está emitiendo, OBS pregunta) y espera a que se cierre
export function cerrarObs({ esperaMs = 20000, ejecutar = execFile } = {}) {
  if (process.platform !== 'win32') return Promise.resolve(true);
  const corriendo = () => new Promise(r => ejecutar('tasklist', ['/FI', 'IMAGENAME eq obs64.exe', '/NH'], { windowsHide: true }, (e, s) => r(!e && /obs64\.exe/i.test(String(s)))));
  return new Promise(resolver => {
    ejecutar('taskkill', ['/IM', 'obs64.exe'], { windowsHide: true }, async () => {
      const fin = Date.now() + esperaMs;
      while (Date.now() < fin) {
        if (!(await corriendo())) return resolver(true);
        await new Promise(r => setTimeout(r, 1000));
      }
      resolver(false);
    });
  });
}

// Todo junto: cerrar OBS si está abierto y dejar lo del dueño
export async function desconfigurarObs({ carpeta = carpetaObs(), cerrar = cerrarObs } = {}) {
  if (!(await cerrar())) return { ok: false, hechos: [], faltan: ['OBS no se ha cerrado (¿está emitiendo o tiene un aviso abierto?): ciérralo a mano y vuelve a pulsar'] };
  return restaurarDueno({ carpeta });
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  desconfigurarObs().then(r => {
    for (const h of r.hechos) console.log(`  OK  ${h}`);
    for (const f of r.faltan) console.log(`  !!  ${f}`);
    if (!r.ok) process.exitCode = 1;
  });
}
