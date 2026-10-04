# Rediseño de KBStats · diseño

Fecha: 4 de octubre de 2026 · Rama: `kbstats-diseno` · Decisiones tomadas por el usuario en conversación el 4/10.

## Objetivo

KBStats (<https://kbstats-preapp-main.onrender.com/>) es la aplicación de estadísticas de Koryu Budo. Funciona, pero su aspecto es el de Bootstrap casi sin tocar. Esta tanda le da **el mismo aspecto que la web de Tenka Ichi**, con acabado muy refinado y animaciones fluidas.

El usuario **no tiene acceso al código** de KBStats. Por eso no se toca la aplicación: se entrega una **hoja de estilos de reemplazo** que funcione con el HTML que ya hay, más la lista de cambios de HTML que merezcan la pena, para que quien tenga el código los aplique.

## Cómo es hoy

- Páginas con HTML generado en el servidor, sin inicio de sesión. Usan Bootstrap 5.3.2 desde CDN y una sola hoja propia, `/static/css/kbstats.css` (265 líneas). Algunas páginas llevan además un `<style>` y un `<script>` propios dentro del HTML.
- **Orden de carga:** `kbstats.css` va **antes** que Bootstrap. A igual peso gana Bootstrap; por eso la hoja de hoy está llena de `!important`.
- Copia de las páginas públicas, tomada el 4/10/2026, en `kbstats-diseno/original/`:

| Archivo | Dirección | Qué tiene |
|---|---|---|
| `inicio.html` | `/` | Panel general: dos cifras y accesos |
| `clasificacion.html` | `/clasificacion/` | Dos tablas de clasificación por grupos |
| `buscar_partidos.html` | `/buscar_partidos/?format=html` | Partidas por jornada |
| `promedios_jugadores.html` | `/promedios_jugadores/?format=html` | Tabla de 107 jugadores y 14 columnas, con filtros y exportar a CSV |
| `tierlist.html` | `/tierlist/` | Tier list por rol |
| `kblix.html` | `/kblix/` | KBLIX: un formulario con un campo |
| `ladder.html` | `/ladder/` | Ladder de 92 jugadores, ordenable, con filtros |
| `partida.html` | `/partida/<id>/?format=html` | Detalle de una partida: estadísticas por equipo, proximidad del jungla y mapa de calor |
| `kbstats.css` | `/static/css/kbstats.css` | La hoja de estilos actual |

La copia contiene nombres y estadísticas de jugadores que ya son públicos en la web. No modificarla: es el punto de partida y la referencia del «antes».

## Qué se entrega

Todo dentro de `kbstats-diseno/`:

1. **`entrega/kbstats.css`:** la hoja de reemplazo. Se pone en lugar de `static/css/kbstats.css` y el resto de la aplicación no se toca.
2. **`entrega/kbstats-b.css`:** una segunda versión para elegir (ver K2).
3. **`entrega/CAMBIOS.md`:** cambios de HTML recomendados, pocos y justificados uno a uno, con el antes y el después. Son opcionales: la hoja tiene que quedar bien sin ellos.
4. **`vista/`:** las mismas páginas de `original/`, enlazadas a la hoja nueva, para abrirlas en el navegador y comparar. Con un selector sencillo o dos carpetas para ver la versión A y la B.
5. **`capturas/`:** antes y después de cada página, en escritorio (1440 px) y móvil (390 px), si en el entorno se puede usar un navegador sin ventana.
6. **`LEEME.md`:** cómo aplicar la entrega, en diez líneas, para quien tenga el código.

## Requisitos

### K1. Misma marca que la web de Tenka Ichi

- Decisión del usuario: KBStats lleva **el aspecto de la web de Tenka Ichi**, como si fuera una sección más.
- La marca está en `public/marca.css` de este repositorio: tinta (`--sumi`), hueso (`--washi`), bermellón (`--shu`), los colores de lado y de tier, el grano de papel, el corte en diagonal, el sello hanko y las tipografías Shippori Mincho B1 (títulos) y Zen Kaku Gothic New (texto). Mirar también `public/inicio.css` y `public/gachapon/gachapon.css` para ver cómo se usan.
- La hoja de KBStats tiene que ser **autónoma**: copia los valores de marca que necesite en sus propias variables, al principio del archivo, porque se sirve desde otra aplicación. Así se podrá volver a igualar cuando la web cambie (otra sesión la está refinando a la vez en la rama `web-frontend`).
- Dirección de estilo del usuario, igual que en la web: que recuerde a la estética de siempre, pero **un poco más atrevida, como las cartas «full art»** (`.carta-g.fullart` en `public/carta.css`): algo más juguetona con los colores, sin perder el estilo.
- Los colores de tier de la tier list y del ladder son los de la marca (`--tier-S`, `--tier-A`…).

### K2. Dos versiones

- **A (`kbstats.css`):** sobria: tinta, hueso y bermellón, con el color justo.
- **B (`kbstats-b.css`):** la atrevida, en la línea de las cartas full art: oro viejo en filos, más color y más presencia de los sellos.
- Las dos con la misma estructura y los mismos nombres de variables, para que elegir sea cambiar un archivo. Tienen que diferenciarse a simple vista.

### K3. Tablas, que son el centro de la aplicación

- Cabecera fija al bajar, filas alternas suaves, fila resaltada al pasar el ratón y cifras alineadas a la derecha con números de ancho fijo.
- La tabla de promedios (107 filas, 14 columnas) tiene que leerse bien: jerarquía clara entre el nombre del jugador y sus cifras, y columnas clave algo más marcadas.
- En móvil: desplazamiento horizontal dentro de la tabla, con la columna del jugador fija a la izquierda si se consigue solo con CSS.
- Indicadores de orden visibles en las cabeceras que ordenan (ladder).

### K4. El resto de piezas

- Barra de navegación, panel general (cifras grandes y accesos), filtros y formularios, botones, insignias de rol y de tier, tarjetas de partida por jornada, la página de detalle de partida (incluidos la proximidad del jungla y el mapa de calor) y KBLIX.
- Estados: página activa en la navegación, foco con teclado visible, campos desactivados y tablas vacías.

### K5. Acabado y animaciones (lo más importante para el usuario)

- El usuario pidió expresamente que salga **muy refinado**, en diseño y en animaciones fluidas. Antes una pieza menos que una pieza a medias.
- Diseño: ritmo de espacios coherente, jerarquía tipográfica clara, alineaciones exactas, bordes y radios iguales en todo.
- Animaciones solo con CSS: entrada suave de la página y de las tarjetas, respuesta al pasar el ratón y al pulsar, transiciones en filtros y pestañas. Solo `transform` y `opacity`.
- Con tablas de cien filas, nada de animar fila por fila al cargar ni efectos caros por celda.
- Respetar `prefers-reduced-motion`.

### K6. Que funcione sin tocar el HTML

- La hoja nueva tiene que ganar a Bootstrap **aunque se cargue antes** que él, que es como está hoy, y seguir bien si alguien la pasa a después. Comprobarlo en `vista/` con el mismo orden de carga que el original.
- No depender de clases nuevas: trabajar con las clases de Bootstrap y las propias que ya salen en el HTML de `original/`.
- Los `<style>` que algunas páginas llevan dentro no se pueden cambiar desde la hoja: la hoja nueva tiene que convivir con ellos. Lo que no se pueda arreglar así va a `CAMBIOS.md`.
- Las tipografías se cargan desde la propia hoja (`@import` de Google Fonts, como en `public/marca.css`).
- Sin imágenes nuevas ni logos: solo CSS (los adornos, con degradados o SVG incrustado en la hoja). Los logos de Koryu Budo son los originales del usuario y no se generan ni se recolorean; si una mejora pide un logo, se propone en `CAMBIOS.md`.

## No entra

- Cambiar el funcionamiento, los datos o el servidor de KBStats.
- JavaScript obligatorio. Si un detalle pide un poco de JS, se propone en `CAMBIOS.md` como opcional.
- La web de Tenka Ichi (`public/`), el marcador y el panel: no tocar nada fuera de `kbstats-diseno/` y `docs/`.

## Comprobación

- Abrir cada página de `vista/` en escritorio y en móvil, en las dos versiones, y repasar: lectura de las tablas, navegación, filtros, estados y animaciones.
- Comparar con `original/` para confirmar que no se pierde contenido ni se rompe ninguna página.
- Capturas en `capturas/` si se puede; si no, decirlo en la entrega.

## Restricciones y entrega

- Todo en la rama `kbstats-diseno`. No tocar `master` ni hacer push a `master`: Render despliega la web de Tenka Ichi desde ahí.
- Esta rama no hace falta unirla a `master`: lo que vale es la carpeta `entrega/`. Subir la rama y abrir un pull request **en borrador** solo para ver el resumen y las capturas. No unirlo.
- Textos, comentarios y commits en español.
- El usuario no quiere gastar dinero real, solo los créditos de la nube: trabajar de forma eficiente, sin flujos de muchos agentes.
