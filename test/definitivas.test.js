// El icono de la definitiva (la R) de cada campeón en el línea por línea y la ficha del marcador de partida:
// que están todos los iconos, cuándo se ven apagados y encendidos, y que la insignia no cambia la caja de la fila.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { definitiva, estadoDefinitiva, RANGOS_DEFINITIVA } from '../public/comun.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = r => readFileSync(path.join(raiz, r), 'utf8');
const carpeta = path.join(raiz, 'public', 'ddragon', 'definitiva');

test('cada campeón de campeones.json tiene su definitiva en public/ddragon/definitiva/<id>.png, y entre todas pesan menos de 1 MB', () => {
  const { campeones } = JSON.parse(leer('public/ddragon/campeones.json'));
  assert.ok(campeones.length > 150);
  const firmaPng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  for (const { id } of campeones) {
    const ruta = path.join(carpeta, `${id}.png`);
    let png;
    assert.doesNotThrow(() => { png = readFileSync(ruta); }, `falta la definitiva de ${id}`);
    assert.ok(png.subarray(0, 8).equals(firmaPng), `${id}.png no es un PNG`);
    assert.ok(png.length > 500, `${id}.png está vacío o casi`);
  }
  // Los de varias formas también, con la R que da Data Dragon
  for (const id of ['Nidalee', 'Elise', 'Jayce', 'Gnar', 'Kled', 'MonkeyKing']) assert.ok(campeones.some(c => c.id === id), id);
  const total = readdirSync(carpeta).reduce((s, f) => s + statSync(path.join(carpeta, f)).size, 0);
  assert.ok(total < 1024 * 1024, `pesan ${total} bytes`);
  assert.equal(definitiva('Ahri'), '/ddragon/definitiva/Ahri.png');
});

test('la definitiva se apaga hasta nivel 6 y sube de rango a 11 y 16; Elise, Jayce, Karma, Nidalee y Udyr la tienen desde nivel 1', () => {
  assert.deepEqual(RANGOS_DEFINITIVA, [6, 11, 16]);
  const casos = [[1, 0, false], [5, 0, false], [6, 1, true], [10, 1, true], [11, 2, true], [15, 2, true], [16, 3, true], [18, 3, true]];
  for (const [nivel, rango, encendida] of casos) assert.deepEqual(estadoDefinitiva('Ahri', nivel), { rango, encendida }, `nivel ${nivel}`);
  // Sin nivel (aún no ha llegado), apagada
  assert.deepEqual(estadoDefinitiva('Ahri', undefined), { rango: 0, encendida: false });
  for (const id of ['Elise', 'Jayce', 'Karma', 'Nidalee', 'Udyr']) assert.deepEqual(estadoDefinitiva(id, 1), { rango: 0, encendida: true }, id);
  assert.deepEqual(estadoDefinitiva('Nidalee', 11), { rango: 2, encendida: true });
});

test('la insignia de la definitiva va superpuesta al retrato, se esconde si no hay icono y solo escribe lo que cambia', () => {
  const css = leer('public/ingame/ingame.css'), estilo = leer('public/ingame/estilo-a.css'), js = leer('public/ingame/ingame.js');
  const regla = sel => css.match(new RegExp(`\n${sel.replace(/[.>]/g, m => `\\${m}`)} \\{([^}]*)\\}`))?.[1] || '';
  // Fuera del flujo de la fila: no cambia la caja del línea por línea (las columnas del retrato siguen en 56 px)
  assert.match(regla('.definitiva'), /position: absolute;/);
  assert.match(regla('.retrato'), /position: relative; width: 56px; height: 56px;/);
  assert.match(css, /\.jugador\.azul \{ grid-template-columns: 56px auto minmax\(0, 1fr\) auto 84px; \}/);
  // En la esquina de abajo del lado de fuera: a la izquierda en el azul y a la derecha en el rojo (el nivel, al revés)
  assert.match(regla('.azul .retrato .definitiva'), /left: -\d+px/);
  assert.match(regla('.rojo .retrato .definitiva'), /right: -\d+px/);
  // Apagada: gris y medio transparente; encendida, sin filtro. Solo se anima la opacidad, nunca filter ni box-shadow
  assert.match(regla('.definitiva img'), /opacity: \.45; filter: grayscale\(1\); transition: opacity /);
  assert.match(regla('.definitiva.encendida img'), /opacity: 1; filter: none;/);
  for (const hoja of [css, estilo]) {
    for (const r of hoja.match(/[^}\n]*\.definitiva[^{]*\{[^}]*\}/g) || []) {
      assert.ok(!/transition:[^;]*(filter|box-shadow|all)|animation:/.test(r), `anima de más: ${r}`);
    }
  }
  assert.match(estilo, /\.definitiva\.encendida \{ box-shadow: 0 0 0 1\.5px var\(--shu, #E0303A\)/);
  // En la fila y en la ficha; sin icono se esconde entera (y no se vuelve a pedir el que falló)
  assert.match(js, /<span class="retrato"><img alt=""><i class="nivel"><\/i><i class="muerte"><\/i>\$\{INSIGNIA_DEFINITIVA\}<\/span>/);
  assert.ok(leer('public/ingame/index.html').includes('<span class="ficha-campeon-caja"><img class="ficha-campeon" alt=""><i class="definitiva r0" hidden>'));
  assert.match(js, /e\.target\.closest\('\.definitiva'\)[\s\S]{0,200}insignia\.hidden = true/);
  // El src (pintarIcono), el hidden y las clases (clase) solo se escriben si cambian
  const pintar = js.slice(js.indexOf('function pintarDefinitiva'), js.indexOf('// ---------- línea por línea'));
  assert.match(pintar, /pintarIcono\(img, campeon && definitiva\(campeon\)\)/);
  assert.match(pintar, /if \(insignia\.hidden !== img\.hidden\) insignia\.hidden = img\.hidden/);
  assert.match(pintar, /clase\(insignia, `definitiva r\$\{rango\}\$\{encendida \? ' encendida' : ''\}`\)/);
  assert.match(js, /pintarDefinitiva\(caja\.querySelector\('\.definitiva'\), j\.campeon, j\.nivel\)/);
  assert.match(js, /pintarDefinitiva\(caja\.querySelector\('\.ficha-campeon-caja \.definitiva'\), j\.campeon, j\.nivel\)/);
});
