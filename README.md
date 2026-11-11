# TENKA ICHI · Web y draft en directo

Web de la liga TENKA ICHI de Koryu Budo. Refleja en directo un draft de **DraftCore** (lol.draftcore.net) en un overlay para OBS y lleva el registro de picks y bans con porcentajes.

- **Portada pública:** `/` (los seis clanes que compiten en baraja, Amateratsu aparte como equipo Legacy, su plantilla, clasificación y campeones más presentes)
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
3. En OBS: una sola fuente de navegador de 1920×1080 con la dirección `/overlay/`, por encima de las cámaras y de la captura del juego (ver «Cámaras en OBS»).
4. Cada pick y ban aparece solo. Al pickear sale una tarjeta con pick %, ban %, presencia, victorias e historial del jugador y del clan.
5. Con el draft completo, el overlay pasa solo al **postdraft**; cuando empieza la partida, al **marcador**; y cuando acaba, a la **pantalla final** (ver «Qué enseña el overlay»).
6. Al acabar: **Gana el lado azul / rojo** (se guarda en el registro), las estadísticas del fantasy y **Siguiente partida**. En Bo3 fearless los campeones usados quedan bloqueados y se muestran en el overlay. **Nueva serie** limpia los bloqueos.

Si DraftCore falla, cualquier hueco se puede corregir a mano desde el panel escribiendo el nombre del campeón.

El panel va **por fases** (Antes del partido, Draft, Partida, Resultado, Liga y gachapon, o Todo): en cada una salen solo sus apartados, y con «Cambiar sola» la fase sigue a lo que enseña el overlay. `/panel/?fase=partida` lo abre en una fase concreta.

## Qué enseña el overlay

`/overlay/` es la única fuente que hace falta en OBS y enseña cuatro cosas (`server/vista.js`):

- **Draft:** el draft en directo, con las cámaras.
- **Postdraft:** el draft ya cerrado. Cada jugador con su carta, el campeón que juega y lo que lleva con él (partidas, victorias y KDA, o **FIRST PICK** si es la primera vez), sus números de toda la liga y sus puntos del fantasy; en el centro, los dos clanes frente a frente con su porcentaje de victorias, el cara a cara, las medias por partida, la racha y sus campeones más jugados. Los datos salen de `/api/previa` (`server/previa.js`): las partidas del registro cruzadas con las estadísticas del fantasy.
- **Partida:** el marcador de `/ingame/`, transparente, encima del juego.
- **Final:** la pantalla de fin de partida: resultado, duración, la tabla por líneas (KDA, farmeo, oro, visión, daño y puntos del fantasy), lo de cada clan (oro, torres, dragones, Barones…) y el MVP con su carta. Sale del marcador tal como acabó la partida; el ganador, el MVP, el daño y los puntos se añaden al marcarlos en el panel. Sin puente también hay pantalla final: con el draft y lo que apunte el staff.

Cambia sola: el postdraft sale 10 s después del último pick; el marcador, en cuanto el puente encuentra la partida; la pantalla final, 10 s después del fin de la partida (o cuando el puente dice que el cliente ya la ha cerrado), y vuelve al draft con **Siguiente partida**, **Nueva serie** o al cargar otra partida del calendario. Si lo que falla es el puente o la red, el overlay se queda en la partida: no salta a la pantalla final a media partida.

En la cabecera del panel, **En el overlay** fuerza cualquiera de las cuatro vistas por si algo falla (el punto verde marca la que se ve) y **Automático** la suelta. Forzar «Partida» pone además al puente a buscarla, haya draft o no. `/overlay/?vista=postdraft` (o `draft`, `partida`, `final`) deja una fuente fija en una vista, para quien prefiera una escena de OBS por cada una.

## Si la web se reinicia en plena jornada

- Lo que el panel tiene puesto (enfrentamiento, equipos, draft, cámaras, resultados, la vista del overlay, la búsqueda de la partida y la pantalla final) se guarda en la pestaña **Ajustes** de Google Sheets (`server/estado-guardado.js`) y vuelve al arrancar; si estaba conectado a DraftCore, se reconecta. La búsqueda de partida y la vista forzada solo vuelven si el reinicio pilla la jornada en marcha (menos de 6 horas).
- Las páginas abiertas reciben la versión de la web al conectarse (en Render, el commit desplegado). Si cambia, los overlays de OBS **se recargan solos** y el panel avisa con un botón para recargar.
- El puente no se cierra nunca por un corte: reintenta, dice en su ventana qué pasa (la web se reinicia, no hay internet, contraseña mal) y avisa cuando vuelve. El título de la ventana dice si está en espera, buscando o mandando la partida.

## Realizador automático

El realizador de los directos (repositorio `Pacopepe4/realizador`) se reparte desde la guía (`/guia/#realizador`): `/puente/realizador-pc2.zip` (el PC de emisión: realizador más el puente del marcador en `puente/`) y `/puente/realizador-pc1.zip`. Los zips salen de la copia en `realizador/` (`server/descargas.js`); para actualizarla, `node scripts/traer-realizador.js ../realizador`. Sus dos PCs se encuentran en `/realizador` (`server/realizador.js`) con la contraseña del panel, y el panel lo ve y lo controla en **Partida → Realizador automático**.

## Plantillas de los clanes

Lema, descripción y jugadores de cada clan se ven en la portada (en la ficha de cada carta de la baraja). Se editan desde el panel (**Guardar en la plantilla del clan**) o a mano en la pestaña **Plantillas** de Google Sheets, que es la que manda en la web publicada. `data-proyecto/plantillas.json` es la copia local y el punto de partida: una hoja recién hecha, o una que aún no tiene **ningún** jugador, recibe al arrancar los jugadores de ese archivo (el lema y la descripción de la hoja se respetan). En cuanto la hoja tiene un jugador, el archivo ya no la toca.

El enlace al **multi de op.gg** de cada clan va en la columna **op.gg** de la misma pestaña (y en `opgg` de `data-proyecto/plantillas.json`). Sale en la ficha del clan, junto a «Plantilla», como «Ver su multi en op.gg». Solo vale una dirección `https://` de op.gg; si la celda está vacía o tiene otra cosa, se usa la del archivo.

Juegan seis clanes (SARU, KAIJU, KEMONO, ATSUI, TORA y BUSHI). KAMIKAZE, KURU, DORAGON, RAIJIN, KANJI y CHIRU se quitaron de `server/clanes.js` el 29/10/2026; sus logos y su arte siguen en `public/logos` y `public/clanes` por si vuelven.

### Equipos Legacy

Un equipo **Legacy** es de la organización y lo conserva todo (logo, arte, lema, descripción y plantilla), pero está apartado de la competición de Tenka Ichi. Ahora mismo lo es **Amateratsu** (`legacy: true` en `server/clanes.js`; `enCompeticion` dice quién compite). En la práctica:

- En la portada sale debajo de la baraja, con la etiqueta «Legacy», y su ficha dice que está fuera de la competición.
- No entra en el sorteo del calendario (ni en el panel ni en el servidor) ni en la tier list, así que sus jugadores no tienen carta de Jugador ni puntúan en el fantasy, y tampoco sale en la imagen de la tier list de Discord. Lo que tienen son las **cartas LEGACY**, de colección (apartado «Cartas LEGACY» del gachapon), que se ven también en su ficha.
- En el panel se puede seguir eligiendo para el overlay (un amistoso o una exhibición) y se puede guardar su plantilla.

Para que otro clan pase a Legacy (o vuelva a competir) basta con poner o quitar `legacy: true` en su línea de `server/clanes.js`; los textos de la portada que cuentan los clanes («Los seis clanes», «Seis clanes, un solo reino» y «Seis clanes, una temporada») están escritos a mano en `public/index.html`.

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
server/vista.js        qué enseña el overlay (draft, postdraft, partida o final) y la pantalla final
server/previa.js       estadísticas de jugadores y clanes para el postdraft y las fichas de la web
server/estado-guardado.js   el estado del panel, guardado para que sobreviva a un reinicio
server/ajustes.js      ajustes clave-valor que sobreviven a los reinicios (pestaña Ajustes)
server/zip.js          zip mínimo para descargar el puente
server/tierlist.js     tier list de jugadores y equipos
server/gacha.js        sobres, cartas de Jugador y BOOST, arte, marcos y reverso, el sorteo y el estreno de cada temporada
server/entrada-discord.js   inicio de sesión de los espectadores con Discord (OAuth2, permiso identify; no guarda ningún token)
server/twitch.js       API Helix y, si se configura, inicio de sesión con Twitch (con validación de tokens cada hora)
server/canal.js        recompensa de puntos del canal y recogida de canjes
server/sesion.js       sesiones firmadas y cifrado de los tokens del canal
server/fantasy.js      alineaciones, estadísticas de cada partida y clasificación
server/jornada.js      cierre de cada jornada del fantasy: sobres para los tres primeros
server/codigos.js      códigos de directo que se canjean por sobres
server/discord.js      publicar imágenes en un canal de Discord con un webhook
server/puntuacion.js   reglas de puntuación del fantasy
server/datos.js        carpeta de datos locales (data/, o CARPETA_DATOS en las pruebas) y la temporada del gachapon
scripts/twitch-falso.js   Twitch de mentira para las pruebas (npm run twitch-falso)
scripts/entrada-discord-falso.js   Discord de mentira para las pruebas del inicio de sesión (npm run entrada-discord-falso)
scripts/sheets-falso.js   Google Sheets de mentira para las pruebas (npm run sheets-falso)
scripts/vista-previa.js   la web con jugadores y cartas inventados (npm run vista-previa)
scripts/prueba-directo.js   la web con una liga de prueba ya empezada, para ver el postdraft, la pantalla final y el ranking (npm run prueba-directo)
test/                  pruebas (npm test)
diseno/marcos/         marcos de las cartas: generador SVG, exportador a PNG y WebP, y los diseños guardados
puente/                puente del PC del espectador (PowerShell) y su LEEME
data-proyecto/         plantillas.json, cartas-boost.json, cartas-legacy.json y campeones-cartas.json (van en el repositorio)
public/index.html      portada pública (inicio.css, inicio.js)
public/panel/          panel de producción
public/overlay/        overlay para OBS
public/ingame/         overlay de partida (marcador encima del juego)
public/marca.css       colores y tipografías de marca compartidos
public/carta.js, carta.css   la carta del gachapon, igual en el álbum, la portada y el overlay
public/compartir.js    imágenes para Discord: colección, alineación, tier list y clasificación
public/clanes/         arte vertical de cada samurái
public/ddragon/        datos e imágenes de Data Dragon (npm run ddragon)
public/logos/          logos de clan (copiados de logos-equipos)
public/marca/          logo de Koryu Budo y sol partido
public/gachapon/       gachapon y fantasy
public/cartas/         dibujos de las cartas (ID.png) y marcos por tier (marcos/TIER.png), cuando estén
```

## Formato de DraftCore (comprobado con drafts reales en septiembre de 2026)

Socket.IO en `https://ws.lol.draftcore.net` → `V3-joinDraft { draftId, url }`. Llegan `initializeDraft` / `V3-initialize` / `startDraft` con el draft completo (`ban1..ban5` azul y `ban6..ban10` rojo, `b1..b5`, `r1..r5`, `turn`, `hovered`), `V3-updateHover { hovered }` y `V2-timerTick { turn, timeLeft }`. Los campeones usan el id de Data Dragon.

Desde octubre de 2026 su servidor solo deja entrar a los clientes que mandan la versión de su web al conectarse (`auth: { clientVersion }`): sin ella contesta `CLIENT_VERSION_REQUIRED` y, con una antigua, `CLIENT_VERSION_OUTDATED`. Además, cada intento rechazado deja a esa IP penalizada un rato (HTTP 400 «Handshake throttled», que Socket.IO enseña como «websocket error»). Por eso `server/draftcore.js` lee la versión de su propio cliente antes de conectar (está en uno de los trozos de código de la página del draft; se recuerda un cuarto de hora), reintenta cada vez más despacio (de 2 s a un minuto) y, si rechazan la versión, la vuelve a leer y prueba una sola vez más. `DRAFTCORE_VERSION` la fija a mano si algún día no se puede leer. Lo que le pasa a la conexión sale en el panel, bajo el enlace del draft.

## Formato de la competición

Desde el 29/10/2026 la temporada la juegan **seis clanes** (SARU, KAIJU, KEMONO, ATSUI, TORA y BUSHI). Los clanes y las fechas están en `server/formato.js` (`TEMPORADA`); el formato, en `server/competicion.js`.

- **Liguilla (Bo1)**: 6 clanes en un único grupo, en cuatro jornadas de 3 partidas: **domingos 8, 15, 22 y 29 de noviembre de 2026**. Cada clan juega 4 partidas contra 4 de sus 5 rivales (sorteados, sin repetir). Los lados se reparten para que nadie tenga más azules de la cuenta.
- **Desempates**: si empatan dos clanes, cuenta el enfrentamiento directo. Si son más, cuenta la fuerza de calendario (suma de victorias de los rivales). En cualquier otro empate se ordena por sorteo con la semilla. Con 6 plazas para 6 clanes no hay corte, así que no se juega partida de desempate (el código sigue sabiendo hacerlo si algún día sobran clanes).
- **Playoffs (Bo3 fearless)**: entran los 6, **domingos 6 de diciembre (cuartos), 13 (semifinales) y 20 (final)**. El cuadro es fijo: el 1.º y el 2.º se saltan los cuartos, donde juegan 4.º–5.º y 3.º–6.º; en semifinales, el 1.º contra el ganador del 4-5 y el 2.º contra el del 3-6. El mejor clasificado elige lado en la partida 1; después elige el que perdió la partida anterior.

La web enseña las fechas desde el principio (pestañas de jornada, cabecera de cada ronda del cuadro y resumen de la liga), también antes de sortear los cruces. Para mover una fecha o cambiar los clanes basta con tocar `formato.js`.

### Sorteo y día de partida

1. **Sorteo en directo** (el del domingo): en el panel, apartado **Competición**, bloque **Sorteo en directo**. **Empezar el sorteo** saca el bombo en la zona de la liga de la web (el que no lo tenga abierto lo ve al entrar, con lo que ya haya salido). Cada **Sacar bola** deja salir una bola, o **Automático** las deja salir solas, una cada 5 a 30 s. Cada jornada es un bombo de seis bolas, una por clan, que salen de dos en dos (lado azul y lado rojo de cada cruce): 24 bolas en total. La semilla es opcional; con la misma semilla el sorteo sale igual. **Ensayo** hace lo mismo sin guardar nada (la web pone una etiqueta «Ensayo»).
   - El calendario se calcula entero al empezar, pero a la web solo viajan las bolas que ya han salido; ni las que faltan ni la semilla se ven antes de tiempo (la semilla sale al terminar). Se guarda al sacar la última bola y la liga de la web se repinta sola con él.
   - El estado del sorteo vive en la memoria del servidor: si la web se reinicia en mitad del sorteo, hay que empezarlo otra vez (con la misma semilla sale igual). La portada lo recibe por un canal propio del WebSocket (`/ws?canal=sorteo`), sin el estado del draft.
   - **En la web** (`public/sorteo.js`, `public/garapon.js`): el bombo es una garapon, el bombo octogonal de manivela de los sorteos japoneses, con las bolas movidas por una física propia. Gira, frena con la boca abajo y deja caer la bola en la bandeja; la bola sube a la diana, donde se descubre el clan con un trazo de tinta, y vuela a su hueco del tablero. Cada bola tarda unos 5 s. Si se sacan más deprisa, la web acelera las siguientes y, con más de tres esperando, las coloca sin animar hasta ponerse al día. Con la pestaña oculta, con «reducir movimiento» o si el navegador deja de dar fotogramas, la bola sale sin animar. El botón **Sonido** (apagado de entrada) enciende los golpes de las bolas y la campanilla. Mientras el sorteo va, a quien está en otra parte de la portada le sale un aviso que lleva al bombo.
   - **Sortear de golpe** (bloque de más abajo, mientras no hay calendario) hace lo mismo sin bombo, por si algo falla en directo.
2. El calendario se guarda en la pestaña **Calendario** de Google Sheets (y una copia en `data-proyecto/competicion.json`). Así sobrevive a los reinicios de Render y cualquiera que entre en la web lo ve.
3. Cada día de partida, elige en **Competición** la siguiente partida y pulsa **Cargar en el panel**. Se rellenan jornada, fase, formato, número de partida, clanes y jugadores. En playoffs te dice quién elige lado.

### Simulación

`npm run simular [semilla]` juega una temporada inventada entera (con los seis clanes de `formato.js`) y la guarda en `data-proyecto/simulacion.json`. Se ve en `/?simulacion#liga` sin tocar los datos reales.

## Qué se guarda en Google Sheets

- **Registro**: picks, bans, jugador, clan y resultado de cada partida (de aquí salen las estadísticas y la clasificación).
- **Calendario**: el sorteo de la liguilla.
- **Plantillas**: jugadores por rol, suplentes, lema y descripción de cada clan. Se puede editar a mano en la hoja; la web lo recoge en un minuto.
- **Ajustes**: lo que tiene que sobrevivir a un reinicio: el estado del panel (`estado_panel`), si las alineaciones están cerradas, las jornadas ya terminadas con sus premios, el código de directo en marcha y la conexión del canal de Twitch. No la edites a mano con la web encendida.
- **Tierlist**, **Estadisticas** y, de cada temporada del gachapon, su registro y sus alineaciones: **GachaponT2** y **AlineacionesT2** desde el 10/10/2026 (apartado «Empezar todos de cero: una temporada nueva»). **Gachapon** y **Alineaciones**, sin número, son las de la primera temporada y ya no cambian.

Las pestañas se crean solas la primera vez. Si Sheets no está configurado, todo se guarda en archivos locales, que en Render se borran al reiniciar.

**Plantillas y tiers dictadas** (`server/importaciones.js`): lo que el usuario da por el chat para la web publicada (los jugadores de una plantilla, sus tiers) va en `data-proyecto/importaciones.json`, con un nombre. Al arrancar, la web publicada aplica cada una una sola vez y la apunta en Ajustes (`importaciones_hechas`): lo que el staff cambie después desde el panel no se vuelve a pisar. En una plantilla, un puesto a `null` se queda como esté. Si la hoja falla a medias, no queda apuntada y se repite en el siguiente arranque. En local y en las pruebas no se aplica ninguna, salvo con `IMPORTACIONES=1`.

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
- **Línea por línea** (lo saca el panel durante 20 s, 45 s o hasta quitarlo): objetos, oro, KDA, súbditos, nivel y muertes de cada jugador contra su rival, con el logo de Tenka Ichi en medio y un brillo en el retrato de quien va en racha (3 asesinatos o más sin morir; más fuerte a partir de 5). Junto al nombre, el **shutdown aproximado** (≈, desde 100): el juego no lo da a los espectadores y desde el parche 14.21 depende de todo el oro ganado, así que `estimarRecompensas` en `server/partida.js` lo calcula con las reglas de 26.03 (base 300-420 según el nivel; 1 de recompensa por cada 3 de oro de asesinatos y asistencias y por cada 20 de súbditos; al morir baja 1 por cada 3,5 de oro repartido o se pierde entero si era shutdown; tope base + 700; pasadas las 6:00 se reduce si su equipo no va claramente por delante). Supone unos 22 de oro por súbdito y que el nivel y los súbditos crecen por igual; los números están en `RECOMPENSAS`. Cada jugador se empareja con su puesto por el nombre de la plantilla, el campeón del draft, la posición que da el cliente o Aplastar, en ese orden.
- **Cámaras de los casters en el línea por línea** (panel, apartado Partida): dos huecos transparentes de 320×180, uno a cada lado del panel, con marco de caster (el emblema de Koryu Budo y el nombre y el detalle que se escriban en el panel). Cada una se marca aparte; salen y se van con el línea por línea y, mientras tanto, el panel se encoge para hacerles sitio (`ESCALA_LINEAS_CON_CAMARAS` en `public/comun.js`: 0,78 en la A y 0,75 en la B). Las posiciones salen de `camarasLineas`, en el mismo archivo, y cambian con el estilo del marcador (A: x 16 y x 1584, y 856; B: x 18 y x 1582, y 842); el panel las enseña junto a cada cámara, y `/ingame/?guia=1` o `/overlay/?guia=1` pintan los huecos rayados con su medida. En OBS las cámaras van por debajo del overlay y por encima de la captura del juego. El hueco solo existe mientras el línea por línea está fuera, así que lo cómodo es una escena de juego con las cámaras ya colocadas y pasar a ella en ese rato.

Cómo llegan los datos:

1. En el PC que mira la partida como espectador corre el **puente** (`puente/`, se descarga desde la guía en `/puente/puente-tenka-ichi.zip`, que el servidor comprime al vuelo sin `clave.txt`). Es un script de PowerShell 5.1: no instala nada. Se abre al empezar la jornada y se queda **en espera** mandando un latido cada 3 s.
2. El puente solo lee el cliente cuando la web se lo pide: `estado.buscarPartida.activa`, que se enciende con **Buscar la partida** en el panel o sola cuando el draft se completa (si está marcado «Buscar sola al acabar el draft»), y se apaga sola cuando la partida termina (evento `GameEnd`) y el cliente se cierra.
3. Mientras busca, cada segundo lee la **Live Client Data API** del cliente (`https://127.0.0.1:2999/liveclientdata/gamestats`, `playerlist` y `eventdata?eventID=`), con el certificado propio de Riot aceptado solo para 127.0.0.1, y lo manda con `POST /api/partida` y la contraseña del panel en `X-Clave`. La respuesta le dice si seguir buscando (`buscar`), si ocultar el marcador del juego y si reenviar la partida entera porque la web se ha reiniciado. Cada arranque de la web tiene su `sesion`: si cambia en plena partida (una actualización o un reinicio de Render), el puente sigue mandándola con `continua` y la web retoma la búsqueda, salvo que el panel la haya parado a propósito desde el arranque. Un corte del cliente de unos segundos no quita el marcador: se queda con lo último hasta 20 s sin datos (el puente aguanta 4 fallos seguidos antes de dar la partida por terminada), y los sucesos que llegan repetidos con otro número cuentan una vez.
4. `server/partida.js` lo convierte en el marcador y lo reparte por WebSocket (mensaje `partida`). Si la **Replay API** está activada (`EnableReplayApi=1` en `[General]` de `game.cfg`), el puente oculta la barra de marcador del juego con `POST /replay/render {"interfaceScore":false}`.

Al terminar la partida, el panel rellena solo el KDA de las estadísticas del fantasy (si estaban vacías) con los datos de cada línea; también se puede hacer con **Rellenar con la partida**.

Límites: la API no da a los espectadores el oro sin gastar, así que el oro es el valor de los objetos (precios de `public/ddragon/objetos.json`, que genera `npm run ddragon`). Los tiempos de los objetivos están en `REGLAS` de `server/partida.js` (temporada 2026: sin Atakhan y Barón a los 20:00) y hay que revisarlos si un parche los cambia. Los eventos que no reconoce salen en el panel, en **Partida**, para añadirlos.

En el panel, **Partida** enseña en qué punto está (puente abierto, buscando, en juego, terminada), el resumen, los grafismos y una **partida de prueba** (seis veces más rápida) para montar la escena sin jugar; se para sola si llega una partida de verdad.

## Directo

La portada tiene un apartado **Directo** con el reproductor de twitch.tv/koryubudo. Cuando hay directo, al bajar por la página el vídeo pasa a una ventanita en la esquina (también en el gachapon). Twitch solo deja incrustar el reproductor en el dominio de la web, que la página le indica sola.

## Tier list

Se edita en el panel, apartado **Tier list**: cada jugador (por su puesto en la plantilla del clan) y cada equipo tiene una tier S, A, B, C o D. Se publica en la portada. Los jugadores sin nombre en la plantilla no salen. Se guarda en la pestaña **Tierlist** de Google Sheets.

## Gachapon

`/gachapon/`: cada espectador entra con su cuenta de Discord y recibe **3 sobres**. Cada sobre trae **4 cartas** (`CARTAS_POR_SOBRE`; hasta el 08/11/2026 eran 3), de dos clases:

- **Jugador:** los jugadores de la liga, con la rareza de su tier en la tier list (S, A, B, C; la D sigue funcionando mientras exista en la tier list).
- **BOOST:** personajes de fuera de los clanes, de tier **S+**, S, A o B (abajo). No tienen clan ni rol, así que no se alinean en el fantasy.

Aparte están las **LEGACY** (abajo): no salen entre las cuatro cartas; de vez en cuando un sobre trae una de regalo, como carta extra.

En el sorteo cada tier tiene su parte de las cartas que salen: **S+ 0,3 %, S 1,2 %, A 6,5 %, B 22 %, C 30 % y D 40 %**. Casi todo es de las tiers bajas y una S o una S+ es difícil de ver: 3 de cada 200 cartas; con cuatro por sobre, uno de cada 17 trae alguna. La parte de una tier se la reparten por igual sus cartas, sean de Jugador o BOOST, así que no cambia con cuántas haya en ella; si una tier no tiene ninguna carta, su parte se reparte entre las demás en proporción, y la página enseña las probabilidades que salen de verdad. Se cambia en `PESOS` de `server/gacha.js`. Dentro de un mismo sobre no sale dos veces la misma carta.

**Los sobres no se abren hasta que todos los jugadores de las plantillas tienen tier** (cada uno con nombre en su plantilla tiene que tener su tier en la tier list; un hueco sin nombre no cuenta). Con la tier list a medias, los sobres de todos saldrían de unos pocos clanes y de las BOOST. Mientras tanto cada uno conserva sus sobres, la página lo avisa y enseña el reparto con el que saldrán, y el panel dice cuántos jugadores faltan y de qué clanes. En cuanto el último tiene tier, se abren.

Más sobres, sin Twitch ni ser afiliado:

- **Código de directo** (panel, apartado «Código de directo»): se crea un código de 6 letras, sale en el overlay con su cuenta atrás y quien lo escribe en el gachapon mientras vale se lleva los sobres, una vez por persona. Se elige cuántos sobres da (1 a 5), cuántos minutos vale y, si se quiere, un máximo de canjes. Solo hay uno a la vez; los canjes quedan en la pestaña Gachapon como `codigo`.
- **Fundir repetidas** (en la colección): cada 5 copias que sobran se cambian por un sobre (`REPETIDAS_POR_SOBRE`). De cada carta se queda siempre una copia, y las BOOST puestas en la alineación no se tocan.
- **Premios de la jornada** del fantasy (abajo) y **Regalar sobres** desde el panel.

### Cartas BOOST

Van en `data-proyecto/cartas-boost.json` (de momento vacío):

```json
[
  { "id": "BOOST-KAMI", "nombre": "Kami", "tier": "S+", "subtitulo": "Guardián del Tenka Ichi" }
]
```

El `id` es el nombre del dibujo (mayúsculas, números y guiones) y `tier` es `S+`, `S`, `A` o `B`. El `subtitulo` sale en la caja de texto de la carta, donde las de Jugador llevan el rol y el clan. Con `"activa": false` deja de salir en los sobres y en el álbum (lo que ya se abrió sigue en el registro de la hoja). Qué hace cada BOOST en el fantasy está por decidir.

### Cartas LEGACY

Los jugadores del equipo Legacy (Amateratsu). Son **de colección**: no se alinean en el fantasy ni sirven de BOOST, y no están entre las cuatro cartas del sobre. De vez en cuando (un **5 %** de los sobres; `PROBABILIDAD_LEGACY`, de 0 a 1; hasta el 08/11/2026 era un 3 %) un sobre trae, además de sus cuatro cartas, una LEGACY de regalo: sale la última, con el aviso «Carta extra». Se pintan como las S+ a carta completa, con «LEGACY» en una placa de oro en lugar del sello de la tier y, debajo del nombre, solo su título (ni estrellas ni multiplicador); igual en la web que en las imágenes de Discord. Van las primeras en el álbum y las repetidas se funden como las demás.

Van en `data-proyecto/cartas-legacy.json`:

```json
[
  { "id": "LEGACY-GAATSU", "nombre": "GAATSU", "subtitulo": "DEMON", "clan": "AMATERATSU" }
]
```

`subtitulo` es el título de la carta y `clan` tiene que ser un equipo Legacy (pone su emblema y la carta sale en su ficha de la portada). Con `"activa": false` la carta queda guardada sin salir.

**Una LEGACY no existe hasta que tiene su dibujo**, el vertical de 1000×1400 en `public/cartas/fullart/<ID>.webp`. Mientras falte no sale en los sobres, en el álbum ni en la ficha del equipo, así nunca se ve con el splash de Riot; en cuanto se sube, entra sola. Para verlas antes de tener los dibujos, `npm run prueba-directo` las enseña con el splash de su campeón (`LEGACY_SIN_DIBUJO=1`) y saca la carta extra en la mitad de los sobres.

### Dibujos, marcos y reverso

- **Dibujo de cada carta:** `public/cartas/ID.png` (también `.webp` o `.jpg`), donde el ID es el puesto del jugador (`KAIJU-TOP`, `TORA-ADC`…) o el de la BOOST (`BOOST-KAMI`). Mientras no exista, la carta lleva el arte de su clan (y las BOOST, el sol partido).
- **Marcos:** en `public/cartas/marcos/jugador/` (S, A, B, C y D, en papel washi) y `boost/` (SP, que es la S+, S, A y B, en laca de armadura con cordones: oro, rojo, blanco y añil). Tienen la ventana del arte transparente (750×750 en x 125, y 282 de 1000×1400), y el sello con la letra y las estrellas ya dibujados. Sin marco, la carta se dibuja como antes.
- **Reversos** (desde el 08/11/2026): uno por familia en `public/cartas/reversos/<CLAVE>.webp` (el id del clan, `BOOST` o `TEMPORADA`; 1000×1400, de Flow): el mismo coche de noche tuneado al estilo de cada jefe y con el neón de su familia. Al abrir una tirada, el coche dice de qué familia es la carta, pero no quién ni de qué tier. El que falte lo pinta la página (`public/gachapon/reverso.js`). El reverso común de antes (`marcos/reverso.webp`, con el emblema de Koryu Budo) se quitó.
- **Jefes y conmemorativas:** `public/cartas/fullart/JEFE-<CLAN>.webp` (el oyabun de cada familia, premio por juntarla entera) y `TEMPORADA-T<n>.webp` (la conmemorativa). Reglas, API y reparto del frontend en `docs/gachapon-tiradas.md`.
- Los marcos se hacen en `diseno/marcos/`: `node diseno/marcos/generar.mjs` los dibuja en SVG y `node diseno/marcos/exportar.mjs` los pasa a PNG de 1000×1400 (originales, en `diseno/marcos/png/`, fuera del repositorio) y a WebP ligeros para la web (usa Chrome o Edge sin ventana). Ahí están también **guardados** para ediciones especiales la alternativa de laca completa, la S+ washi con torii, la S de Jugador anterior y la de pan de oro (`exportar.mjs --guardadas` los pasa a PNG). Con un trozo del nombre solo se exportan esas piezas: `node diseno/marcos/exportar.mjs jugador/S`.
- Las posiciones del nombre, el emblema y el rol sobre el marco se ajustan en el bloque «Carta con marco» de `public/gachapon/gachapon.css`.
- La web mira la carpeta cada minuto: los dibujos nuevos aparecen sin reiniciar. Las direcciones llevan la fecha del archivo, así que al cambiar un dibujo nadie ve el antiguo en caché.
- Para verlo sin tocar datos reales: `npm run vista-previa` (jugadores inventados, una BOOST de cada tier y los dibujos de `public/cartas`) y entra en `http://localhost:3055/auth/prueba?nombre=Ana`.

Más sobres: el staff los **regala** desde el panel (premios, sorteos). Opcionalmente, con la recompensa de puntos del canal **Sobre de Tenka Ichi** (apartado «Puntos del canal de Twitch» más abajo).

Todo se guarda como movimientos en la pestaña **Gachapon** de Google Sheets (altas, canjes, regalos, aperturas y cartas), así que ahí se ve quién tiene qué. Cada cuenta se identifica por `discord-` y su id de Discord (o por el id de Twitch, si entra con Twitch). La conexión del canal, si se usa, va cifrada en la pestaña **Ajustes**.

### Empezar todos de cero: una temporada nueva

El gachapon va por **temporadas** (`TEMPORADA` en `server/datos.js`). Al estrenar una, todos empiezan de cero: quien ya había entrado en la anterior conserva su cuenta (no tiene que volver a registrarse) y su Twitch vinculado, y se queda con los 3 sobres de bienvenida, haya ganado los que haya ganado. No arrastra cartas, sobres abiertos o conseguidos, historial ni alineación del fantasy. Las estadísticas de las partidas, las jornadas cerradas y todo lo demás siguen igual.

- **Nada se borra.** La temporada nueva guarda su registro y sus alineaciones en pestañas nuevas de la hoja («GachaponT2» y «AlineacionesT2» para la temporada 2) y las de la anterior («Gachapon» y «Alineaciones») se quedan como estaban: son la copia de lo que había. Desde entonces, quién tiene qué se mira en la pestaña de la temporada en curso.
- **La web publicada está en la temporada 2 desde el 10/10/2026**, con los porcentajes nuevos y antes de estrenar las cartas de los jugadores. En local y en las pruebas es la 1.
- El estreno se hace solo y **una sola vez**, al arrancar la web: lee las cuentas de la temporada anterior y apunta en el registro nuevo un movimiento `temporada` y el alta de cada una (con su vínculo de Twitch), todo en una sola escritura. Mientras esa marca esté ahí no se repite, por mucho que la web se reinicie. El panel, en el resumen del gachapon, dice cuándo se estrenó y cuántas cuentas empezaron de cero; si no ha podido (la hoja no respondía), dice por qué y se intenta otra vez en el siguiente arranque.
- **Para empezar otra vez de cero otro día:** subir el número en `server/datos.js`, o poner `GACHA_TEMPORADA=3` en Render.
- **Para deshacerlo:** `GACHA_TEMPORADA=1` en Render y la web vuelve a la temporada anterior tal como se quedó (lo conseguido en la 2 se queda en sus pestañas).

### Activarlo con Discord (gratis)

1. Entra en https://discord.com/developers/applications con tu cuenta de Discord y pulsa **New Application** (nombre: `Tenka Ichi`, o el que quieras). No hace falta crear ningún bot ni verificar la aplicación.
2. En el menú **OAuth2**:
   - Copia el **Client ID** y pulsa **Reset Secret** para sacar el **Client Secret**.
   - En **Redirects** añade `https://tenka-ichi.onrender.com/auth/discord/callback` y, para probar en local, `http://localhost:3030/auth/discord/callback`. Guarda los cambios.
3. En Render, en Environment del servicio, añade:
   - `DISCORD_CLIENT_ID`: el Client ID.
   - `DISCORD_CLIENT_SECRET`: el Client Secret.
   - `SESION_SECRETO`: una cadena larga al azar. Puedes sacar una con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Si la cambias, se cierran todas las sesiones.

La web pide a Discord solo el permiso **identify** (id, nombre y avatar). No guarda ningún token de Discord. Cualquiera con una cuenta de Discord puede entrar; no hay que estar en ningún servidor. El nombre se limpia al entrar (sin caracteres invisibles ni de control, máximo 32 caracteres y sin `=`, `+`, `-` o `@` al principio) para que en la hoja de Google no se interprete como una fórmula.

### Publicar en un canal de Discord

La colección y la alineación (botones en el gachapon) y la tier list (panel, apartado Tier list) se publican como imagen en un canal con un **webhook**, que no necesita bot:

1. En el servidor de Discord: **Ajustes del servidor › Integraciones › Webhooks › Nuevo webhook**, elige el canal y pulsa **Copiar URL del webhook**. No la pegues en ningún chat: quien la tenga puede publicar en ese canal.
2. En Render, en Environment: `DISCORD_WEBHOOK_URL` con esa dirección (las crónicas de las partidas van a `DISCORD_WEBHOOK_RESULTADOS` y el aviso de directo de Kick a `DISCORD_WEBHOOK_DIRECTO`, si están; si no, aquí). Si la tier list (la del staff y las de los espectadores) o la clasificación del fantasy van en otro canal, crea otro webhook ahí y ponlo en `DISCORD_WEBHOOK_TIERLIST` o `DISCORD_WEBHOOK_CLASIFICACION`; sin ellos, todo va al canal de `DISCORD_WEBHOOK_URL`.

Con el servidor montado por el bot (ver «El servidor de Discord de Gokudō» abajo), los webhooks los crea `npm run discord-aplicar`, que deja sus direcciones en el `.env`: de ahí se copian a Render. `DISCORD_WEBHOOK_ALINEACION` (opcional) manda la alineación a su propio canal.

El texto lo pone la web (menciona a quien publica sin enviarle aviso y no deja colar menciones a todo el servidor), y cada persona puede publicar su colección y su alineación una vez cada 10 minutos. Sin webhook, el botón de publicar no sale y la imagen se puede descargar igual.

Sin las variables de Discord, la página del gachapon dice que abre muy pronto. En local se puede probar sin Discord entrando en `/auth/prueba?nombre=Alguien`; esa entrada de prueba no existe en Render.

### El servidor de Discord de Gokudō

Cómo es el servidor (roles, categorías, canales con su emoji, permisos y webhooks) está en `discord/servidor.json`; las familias (por cada familia y Legacy: un rol, un chat de texto abierto, un canal de voz abierto y otro de voz privado que solo ve su rol) salen de `data-proyecto/familias.json`, que es el único sitio con sus nombres. El bot lo aplica con la API de Discord:

1. En https://discord.com/developers/applications, la aplicación **Gokudō** › **Bot** › **Reset Token**, y el token en el `.env` (nunca en el repo): `DISCORD_BOT_TOKEN=...`. El bot no necesita ningún *intent*.
2. Invitar el bot al servidor con Gestionar canales, Gestionar roles y Gestionar webhooks: si no está en ningún servidor, `npm run discord-aplicar` da el enlace. El rol del bot tiene que estar por encima de los roles que gestiona (al crearlos él, ya lo está). Si está en más de un servidor, `DISCORD_GUILD_ID` en el `.env`.
3. `npm run discord-aplicar -- --prueba` enseña lo que haría sin cambiar nada.
4. **Manda lo que hay en el servidor** (lo pidió Pacopepe el 10/11/2026: «deja los canales como los puse yo»). `npm run discord-aplicar` no renombra, no mueve, no reordena y no cambia permisos, descripciones, icono ni emojis de lo que ya existe: solo dice en qué se distingue de `servidor.json` («Se respeta…»). Lo único que crea por su cuenta son los webhooks que falten (y registra los comandos del bot). `-- --crear` crea además los roles, categorías, canales y emojis que falten, sin tocar lo que hay; `-- --forzar` impone `servidor.json` a lo que ya existe (lo que hacía antes: solo si se pide expresamente). No borra nada: lo que sobra solo lo avisa, y se borra con `-- --borrar-sobrantes`. Cada pasada guarda una foto del servidor tal como está (categorías en orden, canales, descripciones y roles, sin ids) en `discord/servidor-actual.json`; si se cambia algo a mano en Discord, se ajusta `servidor.json` a esa foto.
   - `--env <archivo>` usa el `.env` de otra carpeta: el bueno, con el token y los webhooks, está en `koryu-budo/draft-app-discord/.env`.
5. Las direcciones de los webhooks van al `.env` (`DISCORD_WEBHOOK_URL`, `DISCORD_WEBHOOK_ALINEACION`, `DISCORD_WEBHOOK_TIERLIST`, `DISCORD_WEBHOOK_CLASIFICACION`, `DISCORD_WEBHOOK_RESULTADOS` y `DISCORD_WEBHOOK_DIRECTO`); se copian a mano a Render. Los ids de lo creado se guardan en `discord/ids.json`, así que al cambiar el nombre de una familia se renombran su canal y su rol en vez de crear otros.

Los roles quedan en el orden de `roles` (Kumichō, el staff, arriba; luego Oyabun (los jefes de familia), las familias y Kobun): cada rol solo puede dar los que tiene por debajo, así que los Oyabun (pueden invitar, mover gente y dar roles) reparten los de las familias y Kobun, pero no el de Kumichō. **/reclutar** (comando del bot): un Oyabun escribe `/reclutar quien:@alguien` y el bot le da a esa persona el rol de la familia del Oyabun y el de Kobun, y lo anuncia en el canal. Solo deja reclutar para la familia propia, a quien no es de ninguna otra (sacarlo de una familia lo hace el staff). Por eso los Oyabun no tienen «Gestionar roles». Lo atiende la web (`server/discord-comandos.js`, ruta `POST /discord/interacciones`), que comprueba la firma de Discord con la Public Key; no hace falta tener el bot conectado. Para activarlo:

1. En Render: `DISCORD_PUBLIC_KEY` (discord.com/developers › Gokudō › General Information › Public Key; no es secreta) y `DISCORD_BOT_TOKEN` (el mismo del `.env`; secreto).
2. Con la web ya desplegada, en General Information › **Interactions Endpoint URL**: `https://tenka-ichi.onrender.com/discord/interacciones` y guardar (Discord la prueba en ese momento).
3. `npm run discord-aplicar` registra el comando en el servidor (los comandos están en `comandos` de `discord/servidor.json`).

Todo lo automático va con el bot, nunca con la cuenta de una persona. Para probar sin Discord: `npm run discord-api-falso` y `DISCORD_URL_API=http://localhost:4060/api/v10 DISCORD_BOT_TOKEN=token-prueba`.

### Tickets en Discord, con la IA de Gokudō

Lo pidió Pacopepe el 10/11/2026. Todo va con botones, y lo atiende la misma ruta que /reclutar (`POST /discord/interacciones`, `server/tickets.js`), así que el bot no necesita estar conectado todo el rato.

- **#🎫・tickets** (en Info): nadie escribe en él. Tiene un mensaje fijo del bot con el botón **Abrir ticket**, que abre una ventana: «¿Qué necesitas?».
- Al enviarla, la web abre un **hilo privado**. Dentro están esa persona y el bot. El staff (Kumichō, que tiene «Gestionar hilos» en el canal) ve todos los hilos. La IA contesta allí mismo.
- Debajo de cada respuesta hay tres botones:
  - **Preguntar otra cosa** abre otra ventana; la IA lee lo que ya se ha hablado en el hilo.
  - **Llamar al staff** solo menciona a @Kumichō en el hilo, como mucho una vez cada 10 minutos.
  - **Cerrar** archiva y bloquea el hilo. Puede cerrarlo quien lo abrió o el staff.
- En el hilo se puede escribir con normalidad para hablar con el staff. La IA no lee el chat: contesta cuando alguien pulsa un botón o cuando la mencionan.
- **SrDirector** es el nombre de la IA y del bot (lo pidió Pacopepe el 10/11). Su icono está en `discord/imagenes/srdirector.png`, a 512×512: un capo original al estilo Gokudō hecho en Flow (el original y el prompt están en `gokudo/diseno/srdirector/`).
- **Si lo mencionan (@SrDirector)**, contesta a ese mensaje en cualquier canal, no solo en los tickets (`server/discord-gateway.js` y `alMencionar` de `server/tickets.js`).
  - En un ticket contesta en el hilo y, si hace falta, llama al staff. En un canal público contesta allí y, si es cosa del staff, manda a abrir un ticket en vez de mencionaros delante de todos.
  - Lee los últimos mensajes del canal para entender de qué se habla. Contesta una vez a la vez por canal y como mucho una vez cada 5 segundos por persona, y gasta de los mismos topes.
  - Para enterarse de las menciones, la web abre una conexión permanente con Discord (el gateway). Solo pide los intents `GUILDS` y `GUILD_MESSAGES`: Discord siempre le da el texto de los mensajes que lo mencionan, así que **no hace falta** activar el permiso privilegiado «Message Content Intent».
  - Solo se conecta si hay `ANTHROPIC_API_KEY`. `DISCORD_GATEWAY=0` lo apaga; sirve para no tener dos conexiones a la vez, la de Render y la de un PC con el mismo token, que contestarían dos veces.
  - **Mientras la web duerme, el bot está desconectado** y no se entera de las menciones. Al despertar se conecta solo. Para que esté siempre despierto hace falta algo que visite la web cada pocos minutos (abajo, «Ojo»).
- **La IA** es Claude, con la API de Anthropic (`@anthropic-ai/sdk`). Solo habla de Gokudō.
  - **Su papel** (lo pidió Pacopepe el 10/11): es un kobun de Gokudō, uno de los nuestros. Habla de colegueo, con jerga de LoL y algún guiño yakuza, y nunca falta a nadie. De Pacopepe habla como de su jefe, un capo mafioso superpeligroso. Si le preguntan por KB o Koryu Budo, dice que son el demonio, con guasa. El papel no cambia las reglas: si no sabe algo, no se lo inventa. Está en `textoSistema` de `server/tickets.js`.
  - Lo que sabe está en **`discord/tickets-saber.md`**, que puede cambiar el staff: el formato, el gachapon, el fantasy, Kick y Discord, el lore y el aspecto de los siete oyabun (sacados de `gokudo/diseno/teasers-familias/LORE.md` y `personajes/personajes.md`) y los detalles de los dibujos.
  - **Va por ramas, para gastar menos** (`server/tickets-ramas.js`). En cada pregunta va siempre el núcleo: el papel, las reglas, qué es Gokudō, las familias y el jefe, unos 1400 tokens, y va en la caché. Lo demás solo va si la pregunta habla de ese tema. Las ramas se eligen por palabras, sin preguntar a la IA, así que elegirlas no cuesta nada.
    - Ramas de la ficha: liga, gachapon, tiradas, fantasy, lore, directo, discord, cartas y kb. Cada apartado de `tickets-saber.md` lleva su rama al lado del título (`## Fantasy <!-- fantasy -->`). Los de `nucleo` van siempre. Las palabras que despiertan cada rama están en `RAMAS`.
    - Ramas en vivo: la **liga** (fechas, cruces con su ganador, clasificación y cuadro, en texto corto); las **cartas** del gachapon (familia, rol, tier y campeón de cada una, las BOOST con su condición, las LEGACY y los jefes, con los puntos de fantasy de cada jugador); y **KB Stats**.
    - Si se nombra a un jugador, van su carta y su fila de KB Stats. Si se nombra una familia, van su lore y sus cartas, no los de las siete. Si no se nombra a nadie, de KB Stats van las 15 mejores notas, del rol que se diga si se dice.
    - Para «Preguntar otra cosa» se mira también el final de lo ya hablado en el hilo. Un «hola» va sin ramas, con unos 50 tokens además del núcleo.
  - **KB Stats** (`server/kbstats.js`) son las estadísticas de cada jugador en la Liga KB (nota, partidas, % de victorias, KDA, KP, MVP, CS, daño y visión por minuto, y su equipo de KB). KB Stats no tiene API, así que la web lee su página `/jugadores/` y la de cada equipo, las guarda en memoria y las vuelve a leer cada 6 horas. Se empieza a leer al arrancar la web, porque tarda unos 20 segundos. Si KB Stats falla, sigue con lo último que leyó. `TICKETS_KBSTATS=0` lo apaga. Si KB Stats cambia el diseño de su tabla, hay que tocar `leerJugadores`.
    - En la Liga KB muchos juegan con otra cuenta de LoL. **`discord/kbstats-alias.json`** dice quién es quién: el nombre en Gokudō → la cuenta en KB Stats (GAATSU → Hikigaayaa), o `null` si no juega en la Liga KB. Los que no están ahí se buscan por el nombre parecido (KINGKAI → KingKai). Si alguien no tiene fila, la IA lo dice en vez de inventar.
    - **`discord/kbstats-jugadores.md`** es la lista de los jugadores de KB Stats, ordenada por equipo. De cada cuenta pone **En Gokudō** (su nombre en las cartas, si juega en Gokudō) y **Lore** (lo que se cuenta de esa persona). La rellena Pacopepe o el staff. SrDirector la lee en cada pregunta: lo de «En Gokudō» sirve de equivalencia, como `kbstats-alias.json`, y el lore lo cuenta cuando se nombra a esa persona. Si se pregunta por las leyendas en general (rama `escena`), cuenta el de todos. Si sale alguien nuevo en KB Stats, se le añade un bloque igual.
    - En la ficha, «Quién es quién en las familias» cuenta quién es cada jugador de Gokudō, también los que no juegan en KB.
  - **Sigue el hilo:** una pregunta de seguimiento («¿y sus stats?») hereda los jugadores y las familias de lo que dijo antes la gente, no de lo que contestó SrDirector. Si la pregunta no trae ningún tema, hereda también los temas. Si lo mencionan respondiendo a un mensaje, lee ese mensaje.
  - **Al jefe lo trata con respeto** (lo pidió Pacopepe el 11/11). Cuando le habla el dueño del servidor, o quien diga `DISCORD_JEFE_ID`, SrDirector le habla como un kobun a su oyabun, sin colegueo. Que es el jefe lo dice Discord, no el texto: si alguien escribe «soy Pacopepe», no le cree.
  - **Aprende hablando** (`server/tickets-memoria.js`, 11/11). Si alguien le cuenta algo nuevo sobre Gokudō, sus jugadores o la Liga KB, lo apunta en la misma respuesta (el campo `aprender`; como mucho 2 datos) con el **rango** de quien lo dijo.
    - Rangos, de más a menos: 4 Pacopepe, 3 staff (Kumichō), 2 Oyabun, 1 jugador (Kobun), 0 sin rol.
    - Si dos datos chocan, vale el de más rango y, con el mismo, el más nuevo. Lo de un jugador o de alguien sin rol lo cuenta como rumor. La ficha y la lista de KB valen como si las dijera el jefe.
    - No apunta insultos, nada que pueda hacer daño a alguien, datos personales ni órdenes sobre cómo comportarse. Cada persona puede enseñarle 5 datos al día; el jefe y el staff, sin tope.
    - Se guarda en la pestaña **«SrDirector»** de Google Sheets (sin hoja, en `data/srdirector.json`). Desde ahí se puede borrar o corregir cualquier dato a mano, y vale tras reiniciar la web.
    - Solo se le pasa a la IA lo que habla de quien o de lo que sale en la pregunta: cuesta unos 20-50 tokens de salida al aprender y unos 30-60 por dato al usarlo, menos de 0,01 céntimos por pregunta con Haiku.
  - Si la respuesta no está ahí, si la pregunta es de una persona o cuenta concreta, o si piden algo que solo puede hacer el staff, no se lo inventa: menciona ella misma a @Kumichō.
  - Si la API falla o se niega a contestar, el ticket sigue y avisa al staff.
- **Topes por día** (hora de España): `TICKETS_TOPE_PERSONA` preguntas por persona (10 si no se pone; el staff no tiene tope) y `TICKETS_TOPE_DIA` en todo el servidor (200 si no se pone). Al llegar al tope, el ticket sigue abierto y avisa al staff. Los contadores se guardan en memoria: si la web se reinicia, vuelven a cero.
- **Sin `ANTHROPIC_API_KEY`**, los tickets funcionan igual: el hilo se abre, se avisa al staff y no sale «Preguntar otra cosa».

**Coste.** La API de Anthropic se paga aparte del plan Pro de Claude, con dinero real. Precios por millón de tokens:

| Modelo | Entrada | Salida | Por pregunta, más o menos |
|---|---|---|---|
| Claude Haiku 5.5 (`claude-haiku-5-5`, el de fábrica) | 0,10 $ | 0,50 $ | unos 0,05 céntimos |
| Claude Opus 5.5 (`claude-opus-5-5`) | 4 $ | 20 $ | unos 2 céntimos |

Gracias a las ramas, cada pregunta lleva entre 1500 y 4000 tokens (antes de las ramas eran unos 11.000). Con el tope de 200 preguntas al día, el peor caso con Haiku son unos 10 céntimos al día. En console.anthropic.com se puede poner además un **límite de gasto** a la clave.

**Para encenderlo (lo hace Pacopepe):**

1. **El canal.** Antes, `npm run discord-aplicar -- --prueba --crear --env ../draft-app-discord/.env`, que solo debería decir «Crearía el canal #🎫・tickets: en 📜 Info». Después, lo mismo sin `--prueba`. Crea solo ese canal, con sus permisos, y no toca nada más. Luego hay que hacer commit de `discord/ids.json`: la web publicada saca de ahí el id del canal y el del rol del staff.
2. **El mensaje del botón.** `npm run discord-tickets -- --env ../draft-app-discord/.env` (antes, con `--prueba` para ver qué haría). Lo publica en #tickets y guarda su id en `discord/ids.json` como `mensaje:tickets`. Si se vuelve a lanzar, actualiza ese mensaje en vez de poner otro. Commit de `ids.json` otra vez.
3. **La clave de la IA.** En console.anthropic.com › API Keys, crea una clave (puede ser la misma cuenta que usa el realizador). En Render › Environment, ponla como **`ANTHROPIC_API_KEY`**. Nunca la pegues en el chat ni en el repo. Opcional: `TICKETS_MODELO` (de fábrica, `claude-haiku-5-5`), `TICKETS_TOPE_PERSONA`, `TICKETS_TOPE_DIA`, `TICKETS_KBSTATS=0` para no leer KB Stats y `TICKETS_IA=0` para apagar la IA sin quitar la clave.
4. `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN` y la Interactions Endpoint URL son las mismas de /reclutar (arriba): si /reclutar funciona, no hay que tocar nada más.
5. **El nombre y el icono de SrDirector.** En discord.com/developers › la aplicación › **Bot**, pon **Username** `SrDirector` y, en **Icon**, sube `discord/imagenes/srdirector.png`. Discord deja cambiar el nombre del bot pocas veces por hora. Opcional: en General Information, el mismo icono como App Icon.

**Ojo:**
- Render gratis duerme la web a los 15 minutos sin uso, y Discord solo espera 3 segundos a que conteste. Si la web está dormida, el primer clic dará «Esta interacción ha fallado» y la despertará: a los 30-60 segundos ya funciona. A /reclutar le pasa lo mismo. Mientras duerme, SrDirector no ve las menciones.
- **Para que no se duerma** (gratis), un servicio como UptimeRobot o cron-job.org puede visitar `https://tenka-ichi.onrender.com/salud` cada 10 minutos. Render da 750 horas al mes por cuenta, que llegan para tener una web encendida todo el mes, pero no dos.
- Si al llamar al staff no os llega el aviso, mirad que el rol Kumichō tenga activado «Permitir que cualquiera @mencione este rol».

Las pruebas (`test/tickets.test.js`) usan el Discord falso de `scripts/discord-api-falso.js`, que ahora también hace de hilos y mensajes, y un Claude falso: no gastan nada.

### Tablón de scrims (#🔎・scrims)

Lo pidió Pacopepe el 11/11/2026 (fase 1). Es `server/scrims.js` y, como los tickets, funciona con botones que atiende `POST /discord/interacciones`. En **#🔎・scrims**, dentro de la categoría **⚔️ Scrims**, nadie escribe: hay un mensaje fijo de SrDirector con tres botones.

- **📣 Publicar scrim:** abre una ventana con equipo, cuándo, elo, formato, y contacto y notas.
  - Sale como tarjeta en #scrims, con la hora en el formato `<t:…>` de Discord, que cada uno ve en su hora.
  - La tarjeta tiene un botón **Retirar**, que pueden usar quien la puso o el staff.
  - **Se borra sola 15 minutos después de su hora.** La web lo comprueba cada 5 minutos.
  - Cada persona puede tener 3 a la vez; el staff, sin tope. Se admiten hasta 30 días de antelación.
- **🔎 Buscar scrim:** abre una ventana con cuándo y elo (opcional). Enseña las ofertas que empiezan una hora antes o después, con el enlace a cada tarjeta. Solo lo ve quien busca.
- **🔔 Avísame:** abre la misma ventana. Cuando alguien publica una oferta que encaja, SrDirector menciona solo a esa persona en #scrims, una vez. Cada persona tiene un aviso a la vez.
- **«Cuándo»** se escribe en hora de España: «jueves 20:00», «hoy 21h», «mañana 19.30», «14/11 19:30», «pasado mañana 22» o solo «20:00», que es hoy, o mañana si ya ha pasado.
- **No usa IA:** todo sale de los formularios, así que no cuesta nada.
- **Dónde se guarda:** las ofertas, en la pestaña **«Scrims»** de Google Sheets (sin hoja, en `data/scrims.json`), y vuelven tras un reinicio. Los avisos solo se guardan en memoria.

**Para encenderlo:**
1. `npm run discord-aplicar -- --prueba --crear --env ../draft-app-discord/.env`, que solo debería decir «Crearía la categoría ⚔️ Scrims» y «Crearía el canal #🔎・scrims». Después, lo mismo sin `--prueba`.
2. `npm run discord-scrims -- --env ../draft-app-discord/.env`, que publica el mensaje con los botones. Los ids quedan en `discord/ids.json` como `canal:scrims` y `mensaje:scrims`: hay que hacer commit de ese archivo.

**Fase 2: la central de solo lectura** (11/11). SrDirector lee también las ofertas de scrims de fuera y las mete en el tablón. Solo salen al **buscar** y en **Avísame**, nunca como tarjeta. Llevan «vía *origen*» y el enlace al mensaje original, para que cada uno escriba al equipo por su cuenta.
- **Solo lee.** Nunca escribe en las fuentes ni a nadie. Enviar algo fuera solo se hace con el permiso expreso de quien sea (regla de Pacopepe). Leer con una cuenta de persona (self-bot) está prohibido por Discord y no se hace.
- **Fuentes:**
  - **#📥・fuentes-scrims** (oculto, en Staff). Aquí llegan solos:
    - los **canales de anuncios que se siguen**: en el canal del otro servidor, «Seguir» y se elige este. Llegan como copia, y el enlace va al original;
    - la red **ScrimRéseau**, si se entra y se elige este canal como el de recepción.
  - Los canales de **otros servidores que hayan invitado a SrDirector** con permiso de solo lectura: sus ids van en `SCRIMS_FUENTES`, separados por comas.
- **Cómo lee cada mensaje:**
  1. Un filtro gratis exige una hora y alguna palabra de scrims (scrim, LFS, Bo3, elo…).
  2. Lo que pasa el filtro lo lee **Haiku**, con una respuesta en formato fijo: equipo, cuándo (en hora de España), elo, formato, región y contacto.
  3. Solo se quedan las de **EUW**, o las que no dicen región. Se descartan las ya pasadas y las repetidas (mismo equipo y misma hora).
  - Coste: unos 0,005 céntimos por mensaje leído. `SCRIMS_TOPE_LECTURAS` (1000 al día) pone el tope.
- **Para encenderlo:**
  1. Activar **Message Content Intent** en discord.com/developers › Bot. Es un interruptor: desde el 10/06/2026 no pide revisión mientras el bot lo vean menos de 10.000 personas.
  2. Poner `DISCORD_LEER_FUENTES=1` en Render. Si el portal no lo tiene activado, el bot se conecta igual sin ese permiso, las menciones siguen funcionando y deja un aviso en el registro.
  3. Crear #📥・fuentes-scrims con `discord-aplicar --crear`; ya está en `servidor.json`.

Pruebas: `test/scrims.test.js` (también la fase 2, con un Claude falso) y la del permiso de leer en `test/discord-gateway.test.js`.

### Inhouses y la red de Gokudō

Lo pidió Pacopepe el 11/11/2026. Son inhouses 5 contra 5 de LoL **abiertas a otros servidores**: se apuntan desde su propio servidor y todo se sincroniza. Sin IA.

**La red** (`server/red.js`) son los servidores que reciben las inhouses de Gokudō. Hacen falta las dos partes, que es el «permiso expreso»:
1. El staff del otro servidor (con «Gestionar servidor») invita a SrDirector y escribe `/gokudo-red unirse canal:#… tipo:inhouses`.
2. En **#staff** de Gokudō sale la petición con **Aprobar** y **Rechazar**. Solo decide el staff de Gokudō.
3. Al aprobarla, SrDirector escribe en su canal que ya está conectado y deja allí el mensaje con los botones.

`/gokudo-red salir` lo quita. Se guarda en la pestaña «Red» de Sheets. `/gokudo-red` es un **comando global**: lo registra `discord-aplicar` (con `comandosGlobales` de `servidor.json`).

**Las inhouses** (`server/inhouses.js`), en **#🎲・inhouses** (en ⚔️ Scrims) y en el canal de cada servidor de la red:
- **🎲 Convocar inhouse:** en Gokudō, solo los **Oyabun y el staff**; en la red, su staff. Se pone cuándo, elo orientativo y notas, y sale **una tarjeta en todos los servidores de la red**. Cada uno puede tener una abierta a la vez.
- **Apuntarse:** con el botón de cada rol (Top, Jungla, Medio, ADC y Support, **2 plazas por rol**). Al pulsarlo se pide el elo. Cualquiera puede **desapuntarse** mientras no esté llena. Todas las copias de la tarjeta se actualizan a la vez.
- **Con 10, equipos equilibrados:** un jugador de cada rol en cada lado, con la combinación que más iguala el elo (Hierro IV = 0 … Challenger = 36; entiende «Platino II», «plat 2», «D4», «Emerald 1»…). SrDirector menciona a cada uno en el canal de su servidor.
- **15 minutos antes:** abre dos canales de voz en Gokudō, **🔵 Azul** y **🔴 Rojo**, y avisa a los 10. Quien convocó crea la partida personalizada en el LoL. Riot solo deja crearlas solas con códigos de torneo, y eso necesita una clave aprobada por Riot.
- **Resultado:** quien convocó, o el staff de Gokudō, pulsa **Ganó Azul** o **Ganó Rojo**. Se apunta en el **🏆 Ranking**, que se ve con su botón, y se borran las voces.
- **Si no se llena** media hora después de su hora, se cancela sola. Si nadie pone el resultado en 4 horas, se cierra.
- **🔔 Avísame:** menciona a quien lo pidió, en el canal de su servidor, cuando se convoca una inhouse a su hora.
- **Dónde se guarda:** las abiertas, en la pestaña «Inhouses» de Sheets; el ranking, en «RankingInhouses» (sin hoja, en `data/`).

**Para encenderlo:**
1. `discord-aplicar --prueba --crear`, que solo debería decir «Crearía el canal #🎲・inhouses» y «Crearía el comando global /gokudo-red». Después, sin `--prueba`.
2. `npm run discord-inhouses -- --env …`, que publica el mensaje con los botones.
3. Para que otros servidores puedan invitar a SrDirector: en discord.com/developers › Bot, activar **Public Bot**. El enlace de invitación es `https://discord.com/oauth2/authorize?client_id=<ID de la app>&scope=bot%20applications.commands&permissions=84992`, que da ver canales, enviar mensajes, insertar enlaces y leer el historial.

Pruebas: `test/inhouses.test.js`, con un servidor de fuera falso.

### Puntos del canal de Twitch

Los espectadores ganan puntos del canal viendo el directo (los da Twitch: por tiempo de visualización, por seguir, por rachas…) y los canjean en Twitch por la recompensa **Sobre de Tenka Ichi**, que les da un sobre del gachapon. Solo existen en canales afiliados o partner.

Al gachapon se entra con Discord, y Twitch da el sobre a la cuenta de Twitch de quien canjea, así que cada espectador **vincula su Twitch** a su cuenta una vez: en el gachapon, ya dentro, «vincula tu Twitch» le lleva a Twitch a decir quién es y vuelve. Desde entonces los sobres de sus canjes le llegan a su colección de siempre, en un minuto. Si canjea antes de vincularse no pierde nada: el sobre se le guarda y le llega al vincular. Se puede desvincular (y vincular otro); un Twitch va a una sola cuenta y una cuenta lleva un solo Twitch. Con Discord activo no hay «Entrar con Twitch»: serían dos colecciones por persona.

Para activarlo:

1. Entra en https://dev.twitch.tv/console/apps con tu cuenta de Twitch y pulsa **Register Your Application**:
   - Name: `Tenka Ichi` (o el que quieras).
   - OAuth Redirect URLs: `https://tenka-ichi.onrender.com/auth/twitch/callback` y, para probar en local, `http://localhost:3030/auth/twitch/callback`.
   - Category: **Website Integration**. Client Type: **Confidential**.
2. En la app creada copia el **Client ID** y pulsa **New Secret** para sacar el **Client Secret**.
3. En Render añade `TWITCH_CLIENT_ID` y `TWITCH_CLIENT_SECRET` (y `SESION_SECRETO`, si no lo tenías ya).
4. En el panel, apartado **Gachapon**, pulsa **Conectar el canal de Twitch** y entra con la cuenta **koryubudo**. La web crea la recompensa «Sobre de Tenka Ichi» a 3000 puntos; el coste se cambia desde el panel. Si ya hay en Twitch una recompensa con ese nombre creada a mano, hay que borrarla antes: Twitch solo deja a cada app recoger los canjes de las recompensas que ha creado ella.

La web recoge los canjes de la cola de Twitch cada minuto (y cuando alguien entra en el gachapon), da el sobre y marca el canje como hecho. Si la web está dormida, los canjes esperan en Twitch y no se pierden. Cuántos puntos se ganan por ver el directo lo fija Twitch; lo que se ajusta es lo que cuesta el sobre, desde el panel. La cuenta del canal no puede canjear sus propias recompensas: para probarlo hace falta otra cuenta de Twitch.

En la pestaña Gachapon de la hoja, cada canje queda a nombre del id de Twitch de quien lo hizo y cada vínculo es un movimiento `vinculo` de la cuenta, con el id y el nombre de Twitch en el detalle (vacío al desvincular): al leer el registro, lo de un Twitch vinculado cuenta para su cuenta (`vincular` en `server/gacha.js`). «Regalar sobres» desde el panel también vale con el nombre de Twitch.

Como pide Twitch, los tokens guardados se validan al arrancar y cada hora (`/oauth2/validate`). Si el canal cambia la contraseña o retira el permiso, el panel avisa «vuelve a conectarlo» y deja de recoger canjes hasta que se conecte otra vez.

### Puntos del canal de Kick: la recompensa «Omamori»

Lo mismo que en Twitch, en el canal de Kick (kick.com/gokudo-zoku): los espectadores canjean sus puntos del canal por la recompensa **Omamori** y les llega un sobre del gachapon. Cada espectador **vincula su Kick** a su cuenta una vez («vincula tu Kick» en el gachapon, ya dentro con Discord); si canjea antes, el sobre se le guarda y le llega al vincular. Una cuenta puede llevar a la vez su Twitch y su Kick.

Para activarlo:

1. En Kick, con la cuenta **Gokudo_zoku**: **Ajustes › Developer** (kick.com/settings/developer) › **Create new app**:
   - Nombre: `Gokudō` (o el que quieras).
   - Redirect URL: `https://tenka-ichi.onrender.com/auth/kick/callback` (y, para probar en local, `http://localhost:3030/auth/kick/callback`).
   - Permisos (*scopes*): `user:read`, `channel:rewards:read`, `channel:rewards:write`, `events:subscribe`, `chat:write` y `kicks:read` (en Kick: leer la información del usuario, leer y gestionar las recompensas de puntos, suscribirse a eventos, escribir en el chat y leer lo de los KICKs).
   - **Enable Webhooks** encendido, con la Webhook URL `https://tenka-ichi.onrender.com/webhooks/kick`.
2. Copia el **Client ID** y el **Client Secret** de la app y ponlos en Render, en Environment: `KICK_CLIENT_ID` y `KICK_CLIENT_SECRET` (nunca en el chat ni en el repo).
3. En el panel, apartado **Gachapon**, pulsa **Conectar el canal de Kick** y entra con la cuenta **Gokudo_zoku**. La web crea la recompensa «Omamori» a 3000 puntos, en el bermellón de la marca; el coste se cambia desde el panel. Si en Kick ya hay una recompensa «Omamori» creada a mano, hay que borrarla antes: Kick solo deja a cada app aceptar los canjes de las recompensas que ha creado ella.

Los canjes llegan **solo por aviso de Kick** (el bot, abajo): la web da el sobre y acepta el canje. A diferencia de Twitch, la web **no pregunta a Kick cada minuto** (lo pidió Pacopepe el 08/11/2026). La recompensa no se salta la cola, así que un canje que no se pudo resolver (Kick falló al aceptarlo, la hoja no respondía, la web estaba dormida y Kick no llegó a reintentar) se queda **pendiente** en Kick y no se pierde: se recoge con el siguiente aviso de un Omamori (una sola vez, sin bucles; también con el primero tras arrancar la web) o a mano con **Recoger canjes pendientes** en el panel, que avisa si hay canjes sin resolver. Si el canal retira el permiso a la app, el panel avisa «vuelve a conectarlo».

En la hoja, los canjes de Kick quedan a nombre de `kick-` y el id de Kick de quien canjea, y cada vínculo es un movimiento `vinculo` con `kk:id:nombre` en el detalle (`kk:` al desvincular). Los ids de Kick y de Twitch son números distintos que pueden coincidir; por eso los de Kick llevan delante `kick-`.

Lo que no dice la documentación de Kick (docs.kick.com) y hay que mirar la primera vez: cuánto dura el token del canal (se renueva solo con el de refresco) y el tope de llamadas por minuto.

### El bot de Gokudō en Kick (webhooks): sobres por apoyar, anuncios y comandos en el chat, alertas en OBS y aviso de directo

El bot es la app de Kick en modo webhook (`server/kick-bot.js`): recibe los avisos y actúa por su cuenta. Solo llama a la API de Kick cuando llega un aviso (aceptar el canje, escribir en el chat, renovar el token); nunca pregunta nada cada cierto tiempo. Al conectar el canal, la web se suscribe a sus avisos de Kick (`server/canal-kick.js`, `EVENTOS_KICK`) y Kick se los manda a `POST /webhooks/kick` (`server/kick-bot.js`). Cada aviso viene **firmado**: la web comprueba la firma con la clave pública de Kick (la pide a `/public/v1/public-key` y la vuelve a pedir si Kick la cambia), atiende cada aviso una sola vez (`Kick-Event-Message-Id`) y contesta 200 al momento; lo demás lo hace después. Si el webhook falla durante más de un día, Kick da de baja la suscripción: la web se vuelve a suscribir al arrancar, al reconectar el canal o con **Volver a suscribir los avisos** en el panel, que además dice a cuántos está suscrita y cuándo llegó el último.

- **Omamori** (`channel.reward.redemption.updated`): el sobre al momento, se acepta el canje y se anuncia en el chat.
- **Tiradas por apoyar** (lo fijó Pacopepe el 08/11/2026, `SOBRES_APOYO`; en la web y en el chat cada sobre es una tirada de la tragaperras): sub nueva **3**, renovación **2**, cada sub regalada **2** a quien la regala y **1** a quien la recibe (si regala alguien anónimo, solo a quien la recibe) y **1 por cada 100 kicks** (redondeando hacia abajo). Seguir al canal no da sobres. Van a la temporada del gachapon en curso, apuntados como `apoyo` con el aviso en el detalle (`kk-sub:…`, `kk-regalo:…`, `kk-kicks:…`), así no se dan dos veces; quien aún no ha vinculado su Kick los tiene guardados como con los canjes.
- **Anuncios en el chat**: el bot anuncia las tiradas que da (Omamori, subs, renovaciones, subs regaladas y kicks) y el inicio del directo; a quien aún no ha vinculado su Kick le dice dónde hacerlo. Los seguidores solo salen en el overlay. Los mensajes salen de uno en uno, con un respiro entre ellos (`KICK_BOT_RESPIRO_MS`, 1,2 s).
- **Alertas en OBS**: fuente de navegador `/alertas/` a 1920×1080, con el fondo transparente. Seguidores, subs, renovaciones, subs regaladas y kicks salen como un rótulo de neón del callejón, uno detrás de otro. **Probar alerta** en el panel manda una de mentira; `/alertas/?prueba` las enseña todas en bucle para colocarla.
- **Aviso de directo** (`livestream.status.updated`): al empezar, el bot lo anuncia en el chat y el webhook de Discord publica «¡Gokudō está en directo en Kick!» con el título y el enlace, mencionando a **@everyone**, una vez por directo. Va al webhook `DISCORD_WEBHOOK_DIRECTO` o, si no lo hay, al de `DISCORD_WEBHOOK_URL`.
- **Comandos del chat** (`chat.message.sent`, `server/comandos-kick.js`): `!tiradas` (tiradas y cartas de quien lo escribe, o cómo vincular su Kick; `!sobres` sigue valiendo), `!clasificacion` (los 3 primeros del fantasy y su puesto), `!gachapon` (enlace y cómo vincular), `!partido` (el próximo cruce con su hora de España) y `!comandos`. Contesta respondiendo al mensaje; cada comando general, como mucho cada 15 s, y `!tiradas`, cada 30 s por persona.

**Con qué cuenta escribe el bot.** Sin más, con la del canal (**Gokudo_zoku**, tipo de mensaje «bot» de la API de chat): no hace falta nada más que conectar el canal. Si se prefiere que tenga nombre propio, se crea una cuenta de Kick aparte (por ejemplo **GokudoBot**), se hace moderadora del canal (para que no le afecten el modo lento ni el de solo seguidores) y en el panel se pulsa **Conectar la cuenta del bot** entrando en Kick con ella: desde entonces escribe como GokudoBot (tipo «user» en el canal de Gokudō; solo pide `user:read` y `chat:write`). Las recompensas y los avisos siguen yendo con la conexión del canal, que hace falta igual. Si Kick cierra la cuenta del bot, vuelve a escribir la del canal y el panel lo dice; **Quitar la cuenta del bot** vuelve a la del canal. La misma app de Kick sirve para las dos cuentas.

Render duerme la web gratuita si nadie entra en 15 minutos: el primer aviso la despierta y, si tarda en contestar, Kick lo reintenta.

### La sección Directo de la portada: Kick, Twitch, el tráiler y las redes

En la portada, la sección **Directo** es una pantalla grande con una columna de cartas al lado (`public/pantalla.js` y `pantalla.css`): **Kick** (el directo principal), **Twitch**, el **tráiler**, **X**, **TikTok** y **YouTube**. Al pasar el ratón por una carta (en el móvil, al tocarla; con el teclado, con las flechas) se levanta y brilla con el color de su red, como las cartas de familia, y la pantalla cambia a lo suyo. Lo pidió Pacopepe el 08/11/2026.

- Si hay directo en Kick sale Kick; si no, en Twitch; si no, el tráiler. La web sabe que Kick está en directo por el aviso `livestream.status.updated` del bot (`/api/directo`), sin preguntar a Kick; Twitch lo dice su propio reproductor.
- Si hay directo y la pantalla sale de la vista, el directo sigue en una ventanita en la esquina.
- **Tráiler**: va desde YouTube. Mientras no esté subido, la carta enseña la miniatura con «Muy pronto en YouTube»; cuando lo esté, se pone el id del vídeo en `REDES.trailerYoutube` de `public/pantalla.js`.
- **X** (últimos posts de @gokudozoku) y **TikTok** (perfil de @gokudo_zoku) usan los widgets oficiales, que solo se cargan al mirar su carta. Si no se ven (bloqueados, sin sesión en X, la cuenta sin publicaciones), queda una tarjeta de perfil con «Seguir». **YouTube** (@gokuzo) es una tarjeta con «Suscribirse».
- Las cuentas están en `REDES`, al principio de `public/pantalla.js`.

### Crónicas de las partidas: en la portada y en #resultados de Discord

En la zona de la liga, donde salía el anuncio del sorteo del calendario (ahora oculto: solo aparece si el staff lanza un sorteo en directo), está **Crónicas de la jornada** (`server/cronicas.js`, `public/cronicas.css`): los enfrentamientos del último día de partidas (en la liguilla, los tres de la jornada) con su resultado y la crónica del realizador. Cada crónica sale también en el canal **#resultados** del servidor de Discord. Se pensó primero como newsletter por correo; Pacopepe prefirió el canal de Discord (08/11/2026), así que la web no guarda ningún correo.

- **El realizador** manda, al acabar cada partida, `POST /api/cronicas/partida` con `Authorization: Bearer <CRONICAS_CLAVE>` y el cuerpo `{ "texto": "…", "resumen": "…", "titulo": "…", "azul": "Tsuki", "rojo": "Yasha" }` (texto o resumen obligatorio, hasta 20 000 letras cada uno; las familias, por su nombre o su id, en el orden que sea; sin ellas, es la última partida guardada). Contesta 202 con la partida a la que la ha unido y su ganador. **Falta configurarlo en el realizador** (su IA ya escribe el resumen final en `partidas\…\resumen.txt`).
- **En Discord** va como un embed con el color y el kamon de la familia ganadora: «Tsuki contra Yasha: gana Yasha», el título, el texto, el resumen y la jornada. Lo que no quepa (4096 letras el texto, 1024 el resumen) se corta con «Sigue en la web». Va al webhook `DISCORD_WEBHOOK_RESULTADOS` (canal #resultados; lo crea `npm run discord-aplicar`) o, si no lo hay, al de `DISCORD_WEBHOOK_URL`. Si Discord falla, la crónica se guarda igual y sale en la portada.
- **Para activarlo:** `npm run discord-aplicar` (crea los webhooks de #resultados y #avisos-directo y los deja en el `.env`), copiar `DISCORD_WEBHOOK_RESULTADOS` y `DISCORD_WEBHOOK_DIRECTO` a Render, y poner allí `CRONICAS_CLAVE` (una contraseña larga inventada que va también en el realizador).
- En la hoja, pestaña «Cronicas». El panel (Liga y gachapon › Crónicas de las partidas) dice cuántas hay, qué falta configurar y si la última se publicó.
- El botón «Entrar en el Discord» de la portada sale cuando se pone la invitación del servidor en `DISCORD_INVITACION` (`public/inicio.js`).

### Probarlo sin Discord ni Twitch de verdad

`npm test` arranca la web con datos temporales contra un **Discord falso** (`scripts/entrada-discord-falso.js`), un **Twitch falso** (`scripts/twitch-falso.js`), un **Kick falso** (`scripts/kick-falso.js`) y un **Google Sheets falso** (`scripts/sheets-falso.js`):

- Inicio de sesión con Discord (`test/entrada-discord.test.js`): entrar y recibir 3 sobres una sola vez, cancelar, estados y códigos inválidos, que `volver` no saque de la web, nombres que no puedan ser fórmulas, regalos por nombre, reinicio de la web y que en Render sin claves no haya ni inicio de sesión ni entrada de prueba.
- Twitch (`test/twitch.test.js`): entrar, abrir sobres, conectar el canal, canjes que dan sobres una sola vez, renovación de tokens, regalos, reinicio, permiso retirado y una partida del fantasy.
- Kick (`test/kick.test.js`): conectar el canal solo con su cuenta, crear «Omamori» sin saltarse la cola, vincular, canjes de varias páginas recogidos a mano que dan sobres una sola vez, los de antes de vincular, coste, token caducado, reinicio, desvincular y permiso retirado.
- Crónicas (`test/cronicas.test.js`, con un Discord falso): clave del realizador, crónica unida a su enfrentamiento por el nombre de las familias o a la última partida, el embed de #resultados (color, kamon, texto escapado, corte de los largos), la portada con los enfrentamientos del día, reinicio, Discord que falla y sin webhook.
- Bot de Kick (`test/kick-bot.test.js`, con avisos firmados por el Kick falso y un Discord falso): suscripción a los 8 avisos, firma mala, aviso repetido, sobres por sub, renovación, regalos (también anónimos) y kicks con su anuncio en el chat, seguidores, avisos de otro canal, que la web no pregunte a Kick por su cuenta, Omamori por aviso, canjes sin resolver que se arreglan con el siguiente, recogida a mano, aviso de directo una vez con @everyone, comandos del chat con su espera, la cuenta aparte del bot (GokudoBot), baja de una suscripción y alerta de prueba.
- Google Sheets (`test/sheets.test.js` y `test/temporada.test.js`): el estreno de una temporada del gachapon con la web entera, también cuando la hoja falla a medias (no se puede leer el registro de una u otra temporada, falla al escribir el estreno o se pierde la respuesta), con miles de filas en la temporada anterior y con la versión anterior de la web escribiendo todavía en su pestaña.

No tocan `data/`, las plantillas ni la hoja de Google de verdad.

Los falsos también se pueden arrancar sueltos y apuntar la web a ellos:

- Inicio de sesión con Discord (`npm run entrada-discord-falso`, puerto 4041): `DISCORD_URL_WEB=http://localhost:4041`, `DISCORD_URL_API=http://localhost:4041/api/v10` y `DISCORD_URL_CDN=http://localhost:4041/cdn`, con `DISCORD_CLIENT_ID=cliente-prueba` y `DISCORD_CLIENT_SECRET=secreto-prueba`. Sus usuarios son ana, beto (sin nombre visible ni avatar), carla (nombre con una fórmula) y dani (nombre con caracteres raros).
- Twitch (`npm run twitch-falso`, puerto 4040): `TWITCH_URL_ID=http://localhost:4040` y `TWITCH_URL_API=http://localhost:4040/helix`, con `TWITCH_CLIENT_ID=cliente-prueba` y `TWITCH_CLIENT_SECRET=secreto-prueba`. Sus usuarios son koryubudo (el canal, afiliado), ana, beto y carla.
- Google Sheets (`npm run sheets-falso`, puerto 4060): `GOOGLE_URL_SHEETS=http://localhost:4060`, con `GOOGLE_SHEET_ID=hoja-de-prueba` y `GOOGLE_CREDENTIALS=prueba`. Empieza vacía y se pierde al pararla. Hace lo que de la hoja de verdad puede dar un disgusto: toma por fechas, horas o números lo que lo parece, exige comillas en los nombres de pestaña con espacios (por eso las de la web son de letras y números) y no deja escribir de golpe más allá de las 1000 filas de una pestaña nueva. `GOOGLE_URL_SHEETS` solo vale si apunta a este mismo ordenador.

## Fantasy

En `/gachapon/`, cada coleccionista alinea **una carta por rol** (Top, Jungla, Medio, ADC y Support) entre las que tiene. Esos cinco jugadores suman los puntos que hacen en las partidas reales, con los datos de la pantalla final del LoL (`server/puntuacion.js`):

| | Puntos |
|---|---|
| Jugar la partida | +1 |
| Ganar | +3 |
| Cada asesinato | +2 |
| Cada asistencia | +1,5 |
| Cada muerte | −1 |
| No morir en toda la partida | +2 |
| Cada 30 de farmeo (súbditos y monstruos) | +1 |
| Cada 10 de puntuación de visión | +1 |
| Cada 5000 de daño a campeones | +1 |
| Primera sangre | +2 |
| Triple / cuádruple / pentakill | +2 / +5 / +10 |
| Participar en el 70 % o más de los asesinatos de su equipo | +2 |
| Cada torre que derriba o ayuda a derribar | +1 |
| MVP de la partida | +3 |

El reparto está pensado para que los cinco roles puntúen parecido: el apoyo compensa con asistencias y visión lo que el tirador hace con asesinatos, farmeo y daño (en una partida normal ganada, de 30 a 44 puntos según el rol). Cada regla solo cuenta si se tiene el dato: si en una partida no se apunta el daño, nadie suma por daño. Los multikills se cuentan como en el juego y en la API de Riot: un pentakill también es cuádruple y triple (2 + 3 + 5). Cambiar una regla recalcula todas las partidas guardadas.

- **Estadísticas:** al acabar cada partida, en el panel (apartado Resultado, después de marcar el ganador) se apuntan las de los diez jugadores y el MVP, y se pulsa **Guardar estadísticas**. Si el puente ha seguido la partida, se rellenan solos el KDA, el farmeo y la visión, y cuentan la primera sangre, los multikills y las torres que salen de los sucesos (si el puente entró con la partida empezada, esas tres no se saben y no cuentan). El **daño a campeones** no lo da el cliente en directo: se apunta de la pantalla final (mejor apuntarlo siempre o nunca). La participación en asesinatos se calcula sola. Al guardar, pasando el ratón por un jugador se ve su desglose. Si hay un error, se corrige y se vuelve a guardar. Van a la pestaña **Estadisticas** de Google Sheets, con una columna de desglose.
- **API de Riot:** `desdeMatchV5` de `server/puntuacion.js` ya traduce un participante de match-v5 a estas reglas. Riot no da las partidas personalizadas por la API salvo las creadas con códigos de torneo (clave de producción) o con el permiso de cada jugador (RSO), así que de momento no se usa.
- **Alineaciones:** cada cambio se guarda en la pestaña **Alineaciones**. Una partida puntúa a la alineación que tenía cada uno cuando se guardaron sus estadísticas.
- **Cerrar alineaciones:** se cierran **solas** con el primer pick o ban del draft o cuando empieza la partida, para que nadie cambie a un jugador sabiendo cómo le va (panel, apartado «Jornada del fantasy»; se puede desmarcar y hacerlo a mano).
- **Terminar la jornada** (mismo apartado): con las estadísticas de sus partidas ya guardadas, los tres primeros **de esa jornada** se llevan sobres (3, 2 y 1; se cambian ahí mismo), se vuelven a abrir las alineaciones y la clasificación se publica en Discord si hay webhook (también se puede descargar la imagen). Cada jornada se termina una sola vez; queda apuntada en Ajustes y los sobres, en la pestaña Gachapon como `premio`. Los empates se deshacen por los puntos de toda la liga.
- La clasificación (general y de cada jornada, con quién se llevó los sobres) y los puntos de cada jugador están en `/gachapon/` y en la portada, sección **Fantasy**. En la tier list y en la plantilla de cada clan, **Ver carta** enseña la carta del jugador con sus partidas, su KDA, sus campeones y sus puntos (`/api/jugador?id=CLAN-ROL`).
