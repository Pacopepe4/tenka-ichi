// Crónicas de las partidas (15/11, con el hilo Web): al acabar cada partida, el PC 1 manda a la web el titular y el
// resumen que ha escrito la IA. La web los guarda en la pestaña «Cronicas» y los publica en #resultados de Discord.
//   POST <web>/api/cronicas/partida   Authorization: Bearer <clave>   { titulo, texto, resumen, azul?, rojo? }
// La clave NO va en el zip ni en opciones.json: se lee del archivo «cronicas-clave.txt» de la carpeta del realizador
// (lo pone a mano quien instala; se conserva al actualizar) o de la variable de entorno CRONICAS_CLAVE. Sin clave, no
// se manda nada.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const ARCHIVO_CLAVE = 'cronicas-clave.txt';

export function claveCronicas(raiz, entorno = process.env) {
  try {
    const ruta = join(raiz, ARCHIVO_CLAVE);
    if (existsSync(ruta)) {
      const c = readFileSync(ruta, 'utf8').replace(/^﻿/, '').trim();
      if (c) return c;
    }
  } catch { /* sin archivo */ }
  return (entorno.CRONICAS_CLAVE || '').trim() || null;
}

// La familia de cada lado, del estado del panel de Gokudō (equipos.azul.clan); «NONAME» o vacío no cuentan
export function familiasDe(estado) {
  const de = lado => {
    const c = estado?.equipos?.[lado]?.clan;
    return c && String(c).toUpperCase() !== 'NONAME' ? String(c) : null;
  };
  return { azul: de('azul'), rojo: de('rojo') };
}

// Manda la crónica. Devuelve { ok, estado, error? }; nunca lanza (una crónica que no sale no para nada)
export async function mandarCronica({ web, clave, titulo, texto, resumen, azul = null, rojo = null }, pedir = fetch) {
  if (!web || !clave || !texto) return { ok: false, error: !clave ? 'sin clave' : !texto ? 'sin texto' : 'sin web' };
  const cuerpo = { titulo: titulo || '', texto, resumen: resumen || texto, ...(azul ? { azul } : {}), ...(rojo ? { rojo } : {}) };
  try {
    const r = await pedir(`${web.replace(/\/$/, '')}/api/cronicas/partida`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clave}` }, body: JSON.stringify(cuerpo),
    });
    let datos = null;
    try { datos = await r.json(); } catch { /* sin cuerpo */ }
    return r.status >= 200 && r.status < 300 ? { ok: true, estado: r.status, datos } : { ok: false, estado: r.status, error: datos?.error || `HTTP ${r.status}` };
  } catch (e) { return { ok: false, error: e.message }; }
}
