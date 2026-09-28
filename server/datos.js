// Carpeta de los datos locales (cuando no hay Google Sheets). Las pruebas la cambian con CARPETA_DATOS
// para no tocar los datos de verdad.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CARPETA_DATOS = process.env.CARPETA_DATOS
  ? path.resolve(process.env.CARPETA_DATOS)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

export const archivoDatos = nombre => path.join(CARPETA_DATOS, nombre);
