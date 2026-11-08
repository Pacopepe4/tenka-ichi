// Enciende (o apaga) el modo IA en el PC 1. Lo lanza INSTALAR-IA.bat:
//  1. Busca la clave de la API en Documentos (archivo «realizado») o la pide para pegarla.
//  2. Pregunta el modelo: Sonnet 5.5 (recomendado) o Haiku 5.5 (más rápido y barato), o apagar la IA.
//  3. Instala la librería de Anthropic si falta (npm install).
//  4. Hace una prueba pequeña con la clave y lo deja anotado en opciones.local.json.
// La clave no se escribe en opciones.local.json ni se enseña en pantalla: solo dónde está.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { RAIZ, mezclar } from '../comun/opciones.js';
import { leerClave, sacarClave, ocultar, causaConexion, MODELOS, NOMBRE_MODELO } from '../pc1/ia.js';

export function guardarOpcionesIa(rutaLocal, ia) {
  const actuales = existsSync(rutaLocal) ? JSON.parse(readFileSync(rutaLocal, 'utf8').replace(/^﻿/, '')) : {};
  writeFileSync(rutaLocal, JSON.stringify(mezclar(actuales, { ia }), null, 2) + '\n');
}

const tapada = c => `${c.slice(0, 7)}…${c.slice(-4)}`;

async function cargarSdk() {
  try { return (await import('@anthropic-ai/sdk')).default; } catch { /* falta: se instala */ }
  console.log('Instalando la librería de la IA (una vez, tarda un poco)...');
  const npm = process.platform === 'win32' ? join(dirname(process.execPath), 'npm.cmd') : 'npm';
  execFileSync(existsSync(npm) || process.platform !== 'win32' ? npm : 'npm.cmd', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: RAIZ, stdio: 'inherit', shell: process.platform === 'win32' });
  return (await import(pathToFileURL(join(RAIZ, 'node_modules', '@anthropic-ai', 'sdk', 'index.mjs')).href)).default;
}

async function probar(Anthropic, clave, modelo) {
  const cliente = new Anthropic({ apiKey: clave, maxRetries: 1, timeout: 30000 });
  try {
    const r = await cliente.messages.create({
      model: modelo, max_tokens: 300,
      messages: [{ role: 'user', content: 'Contesta solo con la palabra OK.' }],
      output_config: { effort: 'low' },
    });
    return { ok: r.content.some(b => b.type === 'text') };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, motivo: 'la clave no vale. Revisa que la copiaste entera en el archivo «realizado»' };
    if (e instanceof Anthropic.PermissionDeniedError) return { ok: false, motivo: 'la clave no tiene permiso para ese modelo' };
    if (e instanceof Anthropic.RateLimitError) return { ok: false, motivo: 'límite de gasto o de peticiones: revisa Limits en la consola de Anthropic' };
    if (e instanceof Anthropic.APIConnectionError) return { ok: false, motivo: `no hay conexión con la API de Anthropic${causaConexion(e)}` };
    return { ok: false, motivo: ocultar(e?.message || String(e), clave).slice(0, 200) };
  }
}

export async function instalarIa({ rutaLocal = join(RAIZ, 'opciones.local.json'), preguntar }) {
  // 1. La clave
  let encontrada = leerClave({});
  if (encontrada) console.log(`Clave encontrada en ${encontrada.ruta} (${tapada(encontrada.clave)})`);
  else {
    console.log('No encuentro el archivo «realizado» con la clave en Documentos.');
    const pegada = sacarClave(await preguntar('Pega aquí la clave (empieza por sk-ant-) y pulsa Enter, o Enter sin nada para salir: '));
    if (!pegada) return { ok: false, motivo: 'sin clave' };
    const ruta = join(RAIZ, 'clave-ia.txt');
    writeFileSync(ruta, pegada + '\n');
    encontrada = { clave: pegada, ruta };
    console.log('Guardada solo en este PC, en la carpeta del realizador.');
  }

  // 2. El modelo
  console.log('');
  console.log('  1 = Sonnet 5.5 (recomendado: rápido y decide muy bien)');
  console.log('  2 = Haiku 5.5 (aún más rápido y barato)');
  console.log('  3 = Apagar la IA (el realizador va solo con sus reglas)');
  const eleccion = (await preguntar('Elige 1, 2 o 3 y pulsa Enter [1]: ')).trim() || '1';
  if (eleccion === '3') {
    guardarOpcionesIa(rutaLocal, { activo: false });
    return { ok: true, apagada: true };
  }
  const rapido = eleccion === '2';
  const modelo = rapido ? MODELOS.rapido : MODELOS.normal;

  // 3 y 4. Librería y prueba
  const Anthropic = await cargarSdk();
  console.log(`Probando la clave con ${NOMBRE_MODELO[modelo]}...`);
  const prueba = await probar(Anthropic, encontrada.clave, modelo);
  if (!prueba.ok) return { ok: false, motivo: prueba.motivo || 'la IA no contestó' };
  guardarOpcionesIa(rutaLocal, { activo: true, rapido, archivoClave: encontrada.ruta === join(RAIZ, 'clave-ia.txt') ? '' : encontrada.ruta });
  return { ok: true, modelo: NOMBRE_MODELO[modelo] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const r = await instalarIa({ preguntar: q => rl.question(q) });
    console.log('');
    if (r.apagada) console.log('  OK  IA apagada. Para encenderla otra vez, vuelve a abrir INSTALAR-IA.bat');
    else if (r.ok) {
      console.log(`  OK  IA encendida con ${r.modelo}.`);
      console.log('      Cierra y vuelve a abrir «Realizador PC1». En la pestaña Realización verás lo que decide la IA.');
      console.log('      Si la IA falla en un directo, el realizador sigue solo con sus reglas.');
    } else {
      console.log(`  !!  No se ha encendido la IA: ${r.motivo}.`);
      process.exitCode = 1;
    }
  } catch (e) {
    console.error(`  !!  ${e.message}`);
    process.exitCode = 1;
  } finally { rl.close(); }
}
