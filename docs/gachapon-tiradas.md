# Gachapon de Gokudō: tiradas, garantía, familias y temporadas (08/11/2026)

Lo que pidió Pacopepe el 08/11 y cómo se reparte. El servidor lo lleva un solo hilo (todo pasa por `abrirSobres` y por el
registro de `server/gacha.js`); el frontend va en tres partes que no se pisan, cada una en su módulo y su CSS.

## Reglas

- **Tiradas en vez de sobres.** Cada sobre es una tirada de la tragaperras: se mete como una moneda, se tira de la palanca,
  gira y salen las cartas. Por dentro sigue siendo un sobre (`usuario.sobres`, `darSobres`): 1 sobre = 1 tirada = 4 cartas.
  En la página se dice «tirada» y «moneda»; la API mantiene los nombres de siempre.
- **4 cartas por tirada** y, en el 5 % de las tiradas, una LEGACY de regalo como carta extra.
- **Garantía de rareza.** Tras 5 tiradas seguidas sin ninguna A o mejor, la siguiente trae una A segura; tras 10 sin ninguna S
  o mejor, una S segura (S o S+). La segura es una carta que aún no tienes; si ya tienes todas las de esa tier, baja a la de
  debajo (S → A → B…). Sustituye a la peor carta de la tirada. Las cartas de fundir no cuentan para la racha.
- **Tiradas de una vez:** ×1, ×5 o «todas» (hasta 50). Cada tirada tiene su sorteo y su garantía, en orden.
- **Fusión por tiers:** 3 repetidas de la misma tier se cambian por una carta al azar de la tier siguiente (D→C, C→B, B→A,
  A→S). Sigue también el cambio de 5 repetidas por una tirada. De cada carta se queda siempre una copia.
- **Familia completa:** la primera vez en la temporada que juntas todas las cartas de una familia (sus 5 jugadores; las de
  Shinigami, sus 5 LEGACY) te llevas una tirada y la carta de su jefe (`JEFE-<CLAN>`): estética, no entra en ningún sorteo.
- **Carta conmemorativa:** quien acaba una temporada con 30 cartas distintas (de jugador, BOOST o LEGACY) se lleva la de esa
  temporada (`TEMPORADA-T<n>`) al estrenarse la siguiente, y la conserva en todas las que vengan.

## API (contrato entre servidor y página)

`GET /api/gacha` — lo de siempre y además:
- `garantia: { umbralA: 5, umbralS: 10 }`, `maximoTiradas: 50`, `repetidasPorMejora: 3`,
  `tierSiguiente: { D: 'C', C: 'B', B: 'A', A: 'S' }`, `cartasConmemorativa: 30`, `cartasPorSobre: 4`.
- `usuario.garantia: { sinA, sinS, umbralA, umbralS }`: tiradas seguidas que lleva sin A (o mejor) y sin S (o mejor).
  Si `sinS >= umbralS`, la próxima trae una S segura; si `sinA >= umbralA`, una A.
- `usuario.familias: ['ATSUI', …]`: familias cuyo premio ya se ha llevado esta temporada.
- `catalogo`: cada carta con `tipo` = `jugador` | `boost` | `legacy` | `jefe` | `temporada`. Las de `jefe` llevan `clan`,
  `tier: 'JEFE'` y `subtitulo: 'Oyabun de <familia>'`; las de `temporada`, `tier: 'TEMPORADA'` y `temporada: n`. Jefes y
  conmemorativas son premios: no cuentan en «Tienes X de Y» (eso son solo jugador, BOOST y LEGACY).
  Familias: las cartas de jugador y LEGACY tienen `clan` (ATSUI Ryūjin, TORA Byakko, KEMONO Tengu, SARU Tsuki, KAIJU Yasha,
  BUSHI Akuma, AMATERATSU Shinigami). Las BOOST no tienen familia (`clan: null`).

`POST /api/gacha/tirar` — cuerpo `{ cuantas: 1 | 5 | 'todos' }`. Respuesta:
```json
{ "ok": true,
  "tiradas": [
    { "cartas": [ { "...carta del catálogo": "", "nueva": true, "copias": 1, "garantia": "S", "extra": true } ],
      "garantia": "S" | "A" | null,
      "premios": [ { "tipo": "familia", "clan": "ATSUI", "sobres": 1, "carta": { "...JEFE-ATSUI": "", "nueva": true, "copias": 1, "extra": true } } ] }
  ],
  "usuario": { "...lo mismo que en /api/gacha": "" } }
```
- `cartas` en el orden del sorteo: las 4 normales y, si sale, la LEGACY de regalo la última con `extra: true`.
- `nueva`: no la tenías antes de esa carta; `copias`: las que tienes justo después. En una tanda de 5, la misma carta puede ser
  nueva en la primera tirada y repetida en la tercera: el servidor ya lo calcula en orden.
- `garantia` en una carta: es la segura de esa tirada.
- Errores: `{ ok: false, error }` con 400 (sin tiradas, sobres aún cerrados, cantidad fuera de rango) o 401 (sin sesión).

`POST /api/gacha/abrir` sigue igual (una tirada; devuelve `sobre: [cartas]`) para lo que ya lo usa.

`POST /api/gacha/fundir-tier` — cuerpo `{ cartas: { id: copias } }`, todas de la misma tier, en múltiplos de 3. Respuesta
`{ ok, cartas: [carta nueva con nueva/copias], premios: [...como en tirar], usuario }`. (Lo hace el hilo del servidor.)

## Frontend: quién toca qué

`public/gachapon/` está partido en módulos (`estado.js` explica cuál es cuál). Cada parte toca solo lo suyo:

| Parte | Módulo | CSS | En `index.html` |
|---|---|---|---|
| Tragaperras y apertura | `apertura.js` | `tragaperras.css` | el `.sobre` de la cabecera y el `<dialog class="apertura">` |
| Álbum por familias | `album.js` | `album.css` | la `<section class="coleccion">` |
| Grieta de la alineación | `alineacion.js` | `grieta.css` | la `<section class="fantasy">` |
| Cuenta, probabilidades, fundir, textos | `gachapon.js` | `gachapon.css` | el resto |

Las reglas viejas de cada parte en `gachapon.css` se pueden borrar desde su parte. Los tres CSS nuevos ya están enlazados en
`index.html`. Lo que se comparte (est.info, est.fantasia, cartaHTML, misCartas, ganchos) está en `estado.js` y no se cambia
sin avisar.

## Arte que falta (Flow)

- La tragaperras (máquina, rodillos, palanca, ranura de la moneda, bandeja).
- Las 7 cartas de jefe, a carta completa (1000×1400, `public/cartas/fullart/JEFE-<CLAN>.webp`), con el personaje de cada
  familia (`gokudo/diseno/personajes/<FAMILIA>-maestra.jpg`). Mientras no estén, la carta lleva `/personajes/<CLAN>.jpg`.
- La carta conmemorativa de la temporada (`public/cartas/fullart/TEMPORADA-T<n>.webp`). Mientras no esté, el sol en neón.
