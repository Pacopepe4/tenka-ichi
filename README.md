# TENKA ICHI · Web y draft en directo

Web de la liga TENKA ICHI de Koryu Budo. Refleja en directo un draft de **DraftCore** (lol.draftcore.net) en un overlay para OBS y lleva el registro de picks y bans con porcentajes.

- **Portada pública:** `/` (los trece clanes en baraja, su plantilla, clasificación y campeones más presentes)
- **Panel de producción:** `/panel/` (con contraseña)
- **Guía de retransmisión:** `/guia/` (enlaces, montaje en OBS, dónde va cada cámara, la carpeta de Drive con los vídeos y la música, y el marcador de partida; es lo que se le pasa a quien lleva OBS)
- **Overlay para OBS:** `/overlay/` (1920×1080, con fondo de tinta y de 0 a 4 cámaras; `?transparente=1` quita el fondo y `?guia=1` marca los huecos de las cámaras)
- **Overlay de partida:** `/ingame/` (1920×1080 transparente, encima del juego: marcador en directo con los datos que manda el puente)

## Arrancar en tu PC

En PowerShell, cada línea por separado:

```
cd "E:\ Escritorio\Claude\koryu-budo\draft-app"
npm install
npm start
```

Abre http://localhost:3000/panel/ . Contraseña por defecto: `tenkaichi` (cámbiala con la variable `PANEL_CLAVE`).

Cada parche de LoL: `npm run ddragon` (descarga los campeones nuevos de Data Dragon).

## Cómo se usa un día de partido

1. En DraftCore crea el draft como siempre y copia el enlace de **espectador** (`lol.draftcore.net/XXXXXXX`).
2. En el panel: pega el enlace y pulsa **Conectar**. Elige jornada, fase y formato (Bo1 / Bo3 fearless) y los dos clanes: sus jugadores se rellenan desde la plantilla. Pulsa **Poner en el overlay**.
3. En OBS: fuente de navegador 1920×1080 con la dirección `/overlay/`, por encima de las cámaras (ver «Cámaras en OBS»).
4. Cada pick y ban aparece solo. Al pickear sale una tarjeta con pick %, ban %, presencia, victorias e historial del jugador y del clan.
5. Al acabar: **Gana el lado azul / rojo** (se guarda en el registro) y **Siguiente partida**. En Bo3 fearless los campeones usados quedan bloqueados y se muestran en el overlay. **Nueva serie** limpia los bloqueos.

Si DraftCore falla, cualquier hueco se puede corregir a mano desde el panel escribiendo el nombre del campeón.

## Plantillas de los clanes

Lema, descripción y jugadores de cada clan están en `data-proyecto/plantillas.json` y se ven en la portada. Se pueden editar desde el panel (**Guardar en la plantilla del clan**). En la web publicada, lo que se edite desde el panel dura hasta que Render reinicie; para dejarlo fijo, edita el archivo y súbelo a GitHub.

## Publicarlo en internet (Render, gratis)

1. En GitHub crea un repositorio vacío (por ejemplo `tenka-ichi`, puede ser privado) **sin** README.
2. En PowerShell, dentro de esta carpeta:
   ```
   git remote add origin https://github.com/TU_USUARIO/tenka-ichi.git
   git push -u origin master
   ```
3. En https://render.com → **New → Blueprint** → elige el repositorio. Render lee `render.yaml` y te pide:
   - `PANEL_CLAVE`: la contraseña del panel (no uses la de por defecto).
   - `GOOGLE_SHEET_ID` y `GOOGLE_CREDENTIALS`: déjalas vacías hasta tener Google Sheets (abajo).
4. Render te da una dirección tipo `https://tenka-ichi.onrender.com`. Cada vez que hagas `git push`, se actualiza sola.
5. El plan gratuito se duerme tras 15 min sin uso: abre el panel un minuto antes del directo.

## Google Sheets (registro de picks y bans)

A la hoja solo va el registro de las partidas: cada pick y cada ban, quién lo hace, de qué clan y si ganó o perdió.

1. En https://console.cloud.google.com crea un proyecto, activa **Google Sheets API** y crea una **cuenta de servicio**. En ella, **Claves → Añadir clave → JSON** (se descarga un archivo; no lo compartas).
2. Crea una hoja de Google y compártela (Editor) con el correo de la cuenta de servicio (`...@...iam.gserviceaccount.com`). La pestaña **Registro** la crea la app sola.
3. En Render, en **Environment**:
   - `GOOGLE_SHEET_ID`: el código largo de la dirección de la hoja (`docs.google.com/spreadsheets/d/<ESTO>/edit`).
   - `GOOGLE_CREDENTIALS`: el contenido completo del JSON de la clave.
4. Cada partida añade 20 filas (una por pick y ban) con: Fecha, Jornada, Fase, Serie, Partida, Clan azul, Clan rojo, Ganador, Lado, Tipo (pick/ban), Orden, Rol, Jugador, Clan, Campeón y Resultado (Victoria/Derrota de ese clan). Al arrancar, la app lee la pestaña para recalcular los porcentajes.

Sin Google configurado, el registro se guarda en `data/registro.json` (solo en local; en Render se perdería al reiniciar).

## Estructura

```
server/index.js        servidor HTTP + WebSocket, estado del enfrentamiento y acciones del panel
server/draftcore.js    conexión Socket.IO con DraftCore y traducción de su formato
server/registro.js     registro de partidas (archivo local y Google Sheets)
server/sheets.js       acceso a Google Sheets con cuenta de servicio
server/plantillas.js   lema, descripción y jugadores de cada clan
server/stats.js        porcentajes por campeón y resumen de la liga
server/clanes.js       clanes, colores y roles
server/partida.js      marcador de partida con lo que manda el puente, y la partida de prueba
server/zip.js          zip mínimo para descargar el puente
puente/                puente del PC del espectador (PowerShell) y su LEEME
data-proyecto/         plantillas.json (va en el repositorio)
public/index.html      portada pública (inicio.css, inicio.js)
public/panel/          panel de producción
public/overlay/        overlay para OBS
public/ingame/         overlay de partida (marcador encima del juego)
public/marca.css       colores y tipografías de marca compartidos
public/clanes/         arte vertical de cada samurái
public/ddragon/        datos e imágenes de Data Dragon (npm run ddragon)
public/logos/          logos de clan (copiados de logos-equipos)
public/marca/          logo de Koryu Budo y sol partido
```

## Formato de DraftCore (comprobado con drafts reales en septiembre de 2026)

Socket.IO en `https://ws.lol.draftcore.net` → `V3-joinDraft { draftId, url }`. Llegan `initializeDraft` / `V3-initialize` / `startDraft` con el draft completo (`ban1..ban5` azul y `ban6..ban10` rojo, `b1..b5`, `r1..r5`, `turn`, `hovered`), `V3-updateHover { hovered }` y `V2-timerTick { turn, timeLeft }`. Los campeones usan el id de Data Dragon.

## Formato de la competición

- **Liguilla (Bo1)**: 10 clanes en un único grupo. Cada clan juega 5 partidas contra 5 rivales distintos sorteados (5 jornadas de 5 partidas). Los lados se reparten para que nadie tenga más de 3 azules.
- **Desempates**: si empatan dos clanes, cuenta el enfrentamiento directo. Si son más, cuenta la fuerza de calendario (suma de victorias de los rivales). Si aun así hay empate en la frontera del 8.º y el 9.º puesto, se juega un Bo1 de desempate; en cualquier otro puesto se ordena por sorteo con la semilla.
- **Playoffs (Bo3 fearless)**: los 8 primeros. El cuadro es fijo: 1.º–8.º y 4.º–5.º por un lado, 2.º–7.º y 3.º–6.º por el otro. El mejor clasificado elige lado en la partida 1; después elige el que perdió la partida anterior.

### Sorteo y día de partida

1. En el panel, apartado **Competición**, marca los 10 clanes y pulsa **Sortear calendario**. La semilla es opcional; con la misma semilla el sorteo sale igual.
2. El calendario se guarda en la pestaña **Calendario** de Google Sheets (y una copia en `data-proyecto/competicion.json`). Así sobrevive a los reinicios de Render y cualquiera que entre en la web lo ve.
3. Cada día de partida, elige en **Competición** la siguiente partida y pulsa **Cargar en el panel**. Se rellenan jornada, fase, formato, número de partida, clanes y jugadores. En playoffs te dice quién elige lado.

### Simulación

`npm run simular [semilla]` juega una temporada inventada entera y la guarda en `data-proyecto/simulacion.json`. Se ve en `/?simulacion#liga` sin tocar los datos reales.

## Qué se guarda en Google Sheets

- **Registro**: picks, bans, jugador, clan y resultado de cada partida (de aquí salen las estadísticas y la clasificación).
- **Calendario**: el sorteo de la liguilla.
- **Plantillas**: jugadores por rol, suplentes, lema y descripción de cada clan. Se puede editar a mano en la hoja; la web lo recoge en un minuto.

Las pestañas se crean solas la primera vez. Si Sheets no está configurado, todo se guarda en archivos locales, que en Render se borran al reiniciar.

## Cámaras en OBS

El overlay tiene de 0 a 4 huecos transparentes en el centro, entre los picks. Se eligen en el panel, apartado **Cámaras**: cuántas salen y qué es cada una (caster, lado azul, lado rojo o un clan). Las de lado azul y rojo siguen al clan que esté en ese lado aunque se inviertan los lados.

1. En la escena de OBS, pon las fuentes de cámara **por debajo** de la fuente del overlay.
2. El panel indica la medida y la posición de cada hueco (por ejemplo, «560×315 en x 680, y 226»). En OBS: clic derecho en la cámara, **Transformar**, **Editar transformación**, y escribe esa posición y ese tamaño del cuadro delimitador.
3. Para verlo mientras colocas, abre `/overlay/?guia=1`: los huecos salen rayados con su medida.

| Cámaras | Huecos (ancho×alto en x, y) |
|---|---|
| 1 | 680×383 en 620, 320 |
| 2 | 480×270 en 720, 224 · 480×270 en 720, 552 |
| 3 | 560×315 en 680, 226 · 334×188 en 620, 607 · 334×188 en 966, 607 |
| 4 | 334×188 en 620, 290 · 966, 290 · 620, 544 · 966, 544 |

## Vídeos del stream

Los vídeos terminados (inicio y final con su música, transición, cabeceras de La Izakaya) y la música suelta para OBS pesan demasiado para el repositorio y para Render: están en `koryu-budo/paquete-stream/`, que se sincroniza con la carpeta **paquete-stream** de Drive, y la guía enlaza esa carpeta (compartida como «Cualquier persona con el enlace · Lector»). Se hacen en `koryu-budo/flow/` y `koryu-budo/musica/`; si se rehacen, se vuelven a copiar a `paquete-stream/`.

## Marcador de partida (overlay in-game)

`/ingame/` va encima de la captura del juego en OBS, como Blue Bottle o el antiguo LeagueBroadcast pero con la estética de Tenka Ichi. Los clanes y los jugadores salen del enfrentamiento del panel.

- **Marcador:** asesinatos, oro, torres, larvas y dragones de cada clan, reloj y diferencia de oro.
- **Temporizadores** debajo del reloj: próximo dragón (o ancestral), larvas o heraldo y Barón, con un ensō de pincel que se completa cuando el objetivo aparece.
- **Debajo de cada clan:** buff de Barón y buff ancestral con su cuenta atrás, punto de alma o alma conseguida (sello con el kanji del elemento) e inhibidores caídos hasta que vuelven.
- **Avisos** con sello cuando un clan se lleva un dragón, el Barón o el heraldo, o rompe un inhibidor.
- **Línea por línea** (lo saca el panel durante 20 s, 45 s o hasta quitarlo): objetos, oro, KDA, súbditos, nivel y muertes de cada jugador contra su rival, con el logo de Tenka Ichi en medio y un brillo en el retrato de quien va en racha (3 asesinatos o más sin morir; más fuerte a partir de 5). Cada jugador se empareja con su puesto por el nombre de la plantilla, el campeón del draft, la posición que da el cliente o Aplastar, en ese orden.

Cómo llegan los datos:

1. En el PC que mira la partida como espectador corre el **puente** (`puente/`, se descarga desde la guía en `/puente/puente-tenka-ichi.zip`, que el servidor comprime al vuelo sin `clave.txt`). Es un script de PowerShell 5.1: no instala nada. Se abre al empezar la jornada y se queda **en espera** mandando un latido cada 3 s.
2. El puente solo lee el cliente cuando la web se lo pide: `estado.buscarPartida.activa`, que se enciende con **Buscar la partida** en el panel o sola cuando el draft se completa (si está marcado «Buscar sola al acabar el draft»), y se apaga sola cuando la partida termina (evento `GameEnd`) y el cliente se cierra.
3. Mientras busca, cada segundo lee la **Live Client Data API** del cliente (`https://127.0.0.1:2999/liveclientdata/gamestats`, `playerlist` y `eventdata?eventID=`), con el certificado propio de Riot aceptado solo para 127.0.0.1, y lo manda con `POST /api/partida` y la contraseña del panel en `X-Clave`. La respuesta le dice si seguir buscando (`buscar`), si ocultar el marcador del juego y si reenviar la partida entera porque la web se ha reiniciado.
4. `server/partida.js` lo convierte en el marcador y lo reparte por WebSocket (mensaje `partida`). Si la **Replay API** está activada (`EnableReplayApi=1` en `[General]` de `game.cfg`), el puente oculta la barra de marcador del juego con `POST /replay/render {"interfaceScore":false}`.

Al terminar la partida, el panel rellena solo el KDA de las estadísticas del fantasy (si estaban vacías) con los datos de cada línea; también se puede hacer con **Rellenar con la partida**.

Límites: la API no da a los espectadores el oro sin gastar, así que el oro es el valor de los objetos (precios de `public/ddragon/objetos.json`, que genera `npm run ddragon`). Los tiempos de los objetivos están en `REGLAS` de `server/partida.js` (temporada 2026: sin Atakhan y Barón a los 20:00) y hay que revisarlos si un parche los cambia. Los eventos que no reconoce salen en el panel, en **Partida**, para añadirlos.

En el panel, **Partida** enseña en qué punto está (puente abierto, buscando, en juego, terminada), el resumen, los grafismos y una **partida de prueba** (seis veces más rápida) para montar la escena sin jugar; se para sola si llega una partida de verdad.

## Directo

La portada tiene un apartado **Directo** con el reproductor de twitch.tv/koryubudo. Cuando hay directo, al bajar por la página el vídeo pasa a una ventanita en la esquina (también en el gachapon). Twitch solo deja incrustar el reproductor en el dominio de la web, que la página le indica sola.

## Tier list

Se edita en el panel, apartado **Tier list**: cada jugador (por su puesto en la plantilla del clan) y cada equipo tiene una tier S, A, B, C o D. Se publica en la portada. Los jugadores sin nombre en la plantilla no salen. Se guarda en la pestaña **Tierlist** de Google Sheets.

## Gachapon

`/gachapon/`: cada espectador entra con su cuenta de Twitch y recibe **2 sobres**. Cada sobre trae **3 cartas** de jugadores de la liga, y la rareza de cada carta es la tier del jugador: en el sorteo un S pesa 1, un A 3, un B 6, un C 10 y un D 15 (un S sale 15 veces menos que un D). La página enseña las probabilidades reales, que dependen de cuántos jugadores hay en cada tier.

Más sobres: con la recompensa de puntos del canal **Sobre de Tenka Ichi**. La web recoge los canjes de la cola de Twitch cada minuto (y cuando alguien entra en el gachapon), da el sobre y marca el canje como hecho. Si la web está dormida, los canjes esperan en Twitch y no se pierden.

Todo se guarda como movimientos en la pestaña **Gachapon** de Google Sheets (altas, canjes, regalos, aperturas y cartas), así que ahí se ve quién tiene qué. La conexión del canal va cifrada en la pestaña **Ajustes**.

### Activarlo (gratis)

1. Entra en https://dev.twitch.tv/console/apps con tu cuenta de Twitch y pulsa **Register Your Application**:
   - Name: `Tenka Ichi` (o el que quieras).
   - OAuth Redirect URLs: `https://tenka-ichi.onrender.com/auth/twitch/callback` y, para probar en local, `http://localhost:3030/auth/twitch/callback`.
   - Category: **Website Integration**. Client Type: **Confidential**.
2. En la app creada copia el **Client ID** y pulsa **New Secret** para sacar el **Client Secret**.
3. En Render, en Environment del servicio, añade:
   - `TWITCH_CLIENT_ID`: el Client ID.
   - `TWITCH_CLIENT_SECRET`: el Client Secret.
   - `SESION_SECRETO`: una cadena larga al azar. Puedes sacar una con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Si la cambias, se cierran todas las sesiones y hay que volver a conectar el canal.
4. En el panel, apartado **Gachapon**, pulsa **Conectar el canal de Twitch** y entra con la cuenta **koryubudo**. La web crea la recompensa «Sobre de Tenka Ichi» a 3000 puntos; el coste se cambia desde el panel.

Los puntos del canal solo existen en canales afiliados o partner de Twitch. El staff puede **regalar sobres** desde el panel (premios, sorteos).

Sin las variables de Twitch, la página del gachapon dice que abre muy pronto. En local se puede probar sin Twitch entrando en `/auth/prueba?nombre=Alguien`.

## Fantasy

En `/gachapon/`, cada coleccionista alinea **una carta por rol** (Top, Jungla, Medio, ADC y Support) entre las que tiene. Esos cinco jugadores suman los puntos que hacen en las partidas reales:

| | Puntos |
|---|---|
| Jugar la partida | +1 |
| Ganar | +3 |
| Cada asesinato | +1 |
| Cada muerte | −1 |
| Cada asistencia | +0,5 |
| MVP de la partida | +3 |

- **Estadísticas:** al acabar cada partida, en el panel (apartado Resultado, después de marcar el ganador) se apunta el KDA de los diez jugadores y el MVP, y se pulsa **Guardar estadísticas**. Si hay un error, se corrige y se vuelve a guardar. Van a la pestaña **Estadisticas** de Google Sheets.
- **Alineaciones:** cada cambio se guarda en la pestaña **Alineaciones**. Una partida puntúa a la alineación que tenía cada uno cuando se guardaron sus estadísticas.
- **Cerrar alineaciones:** en el panel, apartado Gachapon. Ciérralas al empezar la jornada y ábrelas al acabar, para que nadie cambie a un jugador sabiendo cómo le ha ido.
- La página enseña la clasificación de coleccionistas (total y última jornada) y los puntos de cada jugador de la liga. Los premios (por ejemplo, sobres para los tres primeros de la jornada) se dan a mano con **Regalar sobres**.
