# Acabado de la web pública de Tenka Ichi · diseño

Fecha: 4 de octubre de 2026 · Rama: `web-frontend` · Decisiones tomadas por el usuario en conversación el 4/10.

## Objetivo

Subir el nivel visual de la parte pública de la web: **portada, gachapon y guía**. El usuario lo quiere **muy refinado**, con **animaciones fluidas**, y con la estética de siempre pero **un poco más atrevida, como las cartas «full art»**: algo más juguetona con los colores, sin perder el estilo.

Es trabajo de aspecto. Lo que la web hace y los datos que enseña no cambian. Es una sola versión, bien acabada.

## Cómo es hoy

- **Portada:** `public/index.html`, `inicio.css`, `inicio.js`. Secciones: portada, directo, los doce clanes (la baraja), el camino al trono (formato), la liga, fantasy, tier list y pie.
- **Gachapon:** `public/gachapon/` (`index.html`, `gachapon.css`, `gachapon.js`). Cabecera, fantasy (alineación), colección, puntos de los jugadores, probabilidades y reglas, y la apertura de sobres.
- **Guía:** `public/guia/` (`index.html`, `guia.css`, `guia.js`). Es la más floja: 58 líneas de estilos y ninguna animación.
- **Compartido:** `public/marca.css` (colores, tipografías, grano, corte, sello hanko), `public/carta.css` y `carta.js` (la carta del gachapon, que también usan el overlay y las imágenes de Discord), `comun.js`, `directo.css` y `directo.js`.
- **Imágenes para Discord:** `public/compartir.js` pinta en un lienzo la colección, la alineación y la tier list que se publican en Discord.
- Web de prueba con datos: `npm run prueba-directo [puerto]` levanta la web con una liga inventada, partidas, estadísticas y coleccionistas. Para entrar en el gachapon sin Discord: `/auth/prueba?nombre=Koryu`.

## Requisitos

### W1. Sistema visual

- Ampliar `public/marca.css` con lo que falte para que todo salga de variables: escala de espacios, escala tipográfica, radios y bordes, y **variables de movimiento** (duraciones y curvas de aceleración) usadas en toda la web.
- Más color, con criterio: oro viejo en filos y sellos, el color de cada clan con más presencia donde se habla de ese clan, y los colores de tier. La referencia es `.carta-g.fullart` en `public/carta.css` y los dibujos de `public/cartas/fullart/`.
- **Solo añadir** variables en `marca.css`: no renombrar ni quitar las que hay, ni cambiarles el valor, porque el overlay, el panel y el marcador dependen de ellas y otra sesión los está tocando en la rama `ingame-mejoras`.

### W2. Portada

- Repasar cada sección: jerarquía (qué se lee primero), ritmo de espacios entre secciones, alineaciones y remates.
- Entrada de cada sección al llegar con el desplazamiento, escalonando sus piezas (`IntersectionObserver`; `transform` y `opacity`).
- La baraja de los clanes es la pieza estrella: respuesta al pasar el ratón y al tocar, con el color de cada clan.
- La liga (clasificación, jornadas y cuadro), el fantasy y la tier list son tablas y listas: que se lean de un vistazo y no parezcan una hoja de cálculo.
- Cabecera y navegación: estado de la sección activa y comportamiento al bajar.

### W3. Gachapon

- Mismo acabado en la cabecera, la alineación del fantasy, la colección, los puntos y las probabilidades.
- **Apertura de sobres:** animación nueva, con un brillo especial cuando sale una S+. Estaba pendiente en `PROGRESO.md` y es el momento más vistoso de la página: tiene que lucir.
- Los estados de la colección (carta que se tiene, que no se tiene, repetida, full art) tienen que distinguirse a simple vista.

### W4. Guía

- Ponerla al nivel de las otras dos: misma cabecera, misma tipografía y ritmo, índice claro y pasos bien separados. Es una página de instrucciones para el staff: manda la lectura.

### W5. Móvil y pantallas grandes

- Bien en móvil (360 a 430 px de ancho), en portátil (1440 px) y en 1920 px. Sin desplazamiento horizontal de la página en móvil.
- Objetivos táctiles cómodos y sin efectos que solo existan al pasar el ratón.

### W6. Acabado y animaciones (lo más importante para el usuario)

- Antes una sección menos que una sección a medias.
- Nada aparece ni desaparece de golpe: lo que entra, sale o cambia lo hace con transición.
- Animar solo `transform` y `opacity`. Sin saltos de maquetación al cargar imágenes o tipografías.
- Respetar `prefers-reduced-motion` (ya se hace en `marca.css`): con movimiento reducido, todo se ve sin animaciones.
- Foco con teclado visible y contraste suficiente en textos y cifras.
- Repaso final en pantalla de las tres páginas, en móvil y en escritorio, antes de dar nada por terminado.

### W7. No romper nada

- No cambiar identificadores ni clases que use el JavaScript sin cambiar el JavaScript a la vez.
- Los flujos tienen que seguir igual: entrar con Discord, abrir sobres, fundir repetidas, poner la alineación, canjear códigos, «Ver carta», descargar y publicar imágenes.
- **Web y Discord a la vez** (regla del usuario): lo que sale en las dos partes (cartas, alineación, tier list, clasificación) se cambia en las dos en el mismo cambio. Si cambia el aspecto de una de esas piezas en la web, `public/compartir.js` se actualiza igual.
- `npm test` tiene que pasar entero.

## No entra

- El overlay, el marcador de partida y el panel de producción (`public/overlay/`, `public/ingame/`, `public/panel/`): los lleva otra sesión en `ingame-mejoras`.
- El servidor (`server/`) y los datos (`data-proyecto/`), salvo algo imprescindible y pequeño que se deje apuntado.
- Dibujos de cartas: no generar ni sustituir imágenes de `public/cartas/`. Los hace la sesión de las cartas. Nada de arte original de Riot como definitivo.
- Dependencias nuevas: HTML, CSS y JavaScript a mano, como el resto. Sin frameworks ni librerías de animación.

## Restricciones

- **Rama:** todo en `web-frontend`. No tocar `master` ni hacer push a `master`: Render despliega desde ahí.
- **Otras sesiones a la vez:** una sesión local trabaja en `master` en la web y el gachapon (datos, cartas, plantillas) y otra en la nube en `ingame-mejoras`. Para que la unión sea fácil: cambios de aspecto y pocos de estructura; en `carta.css` y `carta.js`, lo mínimo y añadiendo, sin reorganizar.
- **Estilo de Koryu Budo:** samurái japonés con toque fantástico y mitológico; negro, rojo y azul; tinta, hueso y el color de cada clan. Las cartas de jugador son sobrias y las BOOST S+ van a todo color: esa gradación se respeta.
- **Logos:** los originales del usuario, tal cual. Nunca generarlos, recolorearlos ni invertirlos.
- **Idioma:** textos, comentarios y commits en español, con el estilo del código que ya hay.
- **Secretos:** no hacen falta. La web de prueba quita Google, Discord, Twitch y Render del entorno.

## Comprobación

- `npm test`.
- En pantalla con `npm run prueba-directo`: portada, gachapon (entrando con `/auth/prueba?nombre=Koryu`: abrir sobres, colección, alineación) y guía, en móvil y en escritorio.
- Si se puede usar un navegador sin ventana, capturas de antes y después en `docs/capturas/web/` (390 px y 1440 px). Si no, decirlo en la entrega.

## Entrega

- Commits pequeños y claros en `web-frontend`, subidos a GitHub.
- Entrada nueva en `PROGRESO.md` con lo hecho, lo comprobado y lo que no se ha podido comprobar.
- Pull request **en borrador** hacia `master`, con resumen y capturas. No unirlo: lo decide el usuario.
