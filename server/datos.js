// Carpeta de los datos locales (cuando no hay Google Sheets). Las pruebas la cambian con CARPETA_DATOS
// para no tocar los datos de verdad.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CARPETA_DATOS = process.env.CARPETA_DATOS
  ? path.resolve(process.env.CARPETA_DATOS)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

export const archivoDatos = nombre => path.join(CARPETA_DATOS, nombre);

// Temporada del gachapon y de las alineaciones del fantasy. Cuando todos empiezan de cero se estrena una temporada: el
// registro y las alineaciones pasan a una pestaña nueva de la hoja (o a un archivo nuevo) y lo de la temporada anterior
// se queda donde estaba, sin tocar: es su copia. La primera no lleva nada en el nombre («Gachapon», gacha.json); las
// siguientes, «GachaponT2», gacha-t2.json… En la web publicada va la 2 desde el 10/10/2026; en local y en las pruebas,
// la 1, salvo que se pida otra con GACHA_TEMPORADA. Volver a poner la anterior es volver a lo que había en ella
const pedida = Number(process.env.GACHA_TEMPORADA);
export const TEMPORADA = Number.isInteger(pedida) && pedida >= 1 ? pedida : process.env.RENDER ? 2 : 1;
export const pestanaDeTemporada = (nombre, t = TEMPORADA) => (t > 1 ? `${nombre}T${t}` : nombre);
export const archivoDeTemporada = (nombre, t = TEMPORADA) => archivoDatos(t > 1 ? `${nombre}-t${t}.json` : `${nombre}.json`);
