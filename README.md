# TENKA ICHI · Web y draft en directo

Web de la liga TENKA ICHI de Koryu Budo. Refleja en directo un draft de **DraftCore** (lol.draftcore.net) en un overlay para OBS y lleva el registro de picks y bans con porcentajes.

- **Portada pública:** `/` (los doce clanes que compiten en baraja, Amateratsu aparte como equipo Legacy, su plantilla, clasificación y campeones más presentes)
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

## Plantillas de los clanes

Lema, descripción y jugadores de cada clan están en `data-proyecto/plantillas.json` y se ven en la portada. Se pueden editar desde el panel (**Guardar en la plantilla del clan**). En la web publicada, lo que se edite desde el panel dura hasta que Render reinicie; para dejarlo fijo, edita el archivo y súbelo a GitHub.

### Equipos Legacy

Un equipo **Legacy** es de la organización y lo conserva todo (logo, arte, lema, descripción y plantilla), pero está apartado de la competición de Tenka Ichi. Ahora mismo lo es **Amateratsu** (`legacy: true` en `server/clanes.js`; `enCompeticion` dice quién compite). En la práctica:

- En la portada sale debajo de la baraja, con la etiqueta «Legacy», y su ficha dice que está fuera de la competición.
- No entra en el sorteo del calendario (ni en el panel ni en el servidor) ni en la tier list, así que sus jugadores no tienen carta de Jugador ni puntúan en el fantasy, y tampoco sale en la imagen de la tier list de Discord. Lo que tienen son las **cartas LEGACY**, de colección (apartado «Cartas LEGACY» del gachapon), que se ven también en su ficha.
- En el panel se puede seguir eligiendo para el overlay (un amistoso o una exhibición) y se puede guardar su plantilla.

Para que otro clan pase a Legacy (o vuelva a competir) basta con poner o quitar `legacy: true` en su línea de `server/clanes.js`; los textos de la portada que cuentan los clanes («Los doce clanes», «Doce clanes, un solo reino» y «Diez de los doce clanes») están escritos a mano en `public/index.html`.

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
server/gacha.js        sobres, cartas de Jugador y BOOST, arte, marcos y reverso, y el sorteo
server/entrada-discord.js   inicio de sesión de los espectadores con Discord (OAuth2, permiso identify; no guarda ningún token)
server/twitch.js       API Helix y, si se configura, inicio de sesión con Twitch (con validación de tokens cada hora)
server/canal.js        recompensa de puntos del canal y recogida de canjes
server/sesion.js       sesiones firmadas y cifrado de los tokens del canal
server/fantasy.js      alineaciones, estadísticas de cada partida y clasificación
server/jornada.js      cierre de cada jornada del fantasy: sobres para los tres primeros
server/codigos.js      códigos de directo que se canjean por sobres
server/discord.js      publicar imágenes en un canal de Discord con un webhook
server/puntuacion.js   reglas de puntuación del fantasy
server/datos.js        carpeta de datos locales (data/, o CARPETA_DATOS en las pruebas)
scripts/twitch-falso.js   Twitch de mentira para las pruebas (npm run twitch-falso)
scripts/entrada-discord-falso.js   Discord de mentira para las pruebas del inicio de sesión (npm run entrada-discord-falso)
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
- **Ajustes**: lo que tiene que sobrevivir a un reinicio: el estado del panel (`estado_panel`), si las alineaciones están cerradas, las jornadas ya terminadas con sus premios, el código de directo en marcha y la conexión del canal de Twitch. No la edites a mano con la web encendida.

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

`/gachapon/`: cada espectador entra con su cuenta de Discord y recibe **2 sobres**. Cada sobre trae **3 cartas**, de dos clases:

- **Jugador:** los jugadores de la liga, con la rareza de su tier en la tier list (S, A, B, C; la D sigue funcionando mientras exista en la tier list).
- **BOOST:** personajes de fuera de los clanes, de tier **S+**, S, A o B (abajo). No tienen clan ni rol, así que no se alinean en el fantasy.

Aparte están las **LEGACY** (abajo): no salen entre las tres cartas; de vez en cuando un sobre trae una de regalo, como carta extra.

En el sorteo cada carta pesa según su tier, sea de la clase que sea: S+ 0,5, S 1, A 3, B 6, C 10 y D 15 (una S sale 15 veces menos que una D; una S+, el doble de poco que una S). La página enseña las probabilidades reales, que dependen de cuántas cartas hay en cada tier. Los pesos se cambian en `PESOS` de `server/gacha.js`. Dentro de un mismo sobre no sale dos veces la misma carta.

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

Los jugadores del equipo Legacy (Amateratsu). Son **de colección**: no se alinean en el fantasy ni sirven de BOOST, y no están entre las tres cartas del sobre. De vez en cuando (un **3 %** de los sobres; `PROBABILIDAD_LEGACY`, de 0 a 1) un sobre trae, además de sus tres cartas, una LEGACY de regalo: sale la última, con el aviso «Carta extra». Se pintan como las S+ a carta completa, con «LEGACY» en una placa de oro en lugar del sello de la tier y, debajo del nombre, solo su título (ni estrellas ni multiplicador); igual en la web que en las imágenes de Discord. Van las primeras en el álbum y las repetidas se funden como las demás.

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
- **Reverso:** `public/cartas/marcos/reverso.webp`, el mismo para las dos clases y todas las tiers: al abrir el sobre las tres cartas salen boca abajo y no se sabe qué ha tocado hasta darles la vuelta.
- Los marcos se hacen en `diseno/marcos/`: `node diseno/marcos/generar.mjs` los dibuja en SVG y `node diseno/marcos/exportar.mjs` los pasa a PNG de 1000×1400 (originales, en `diseno/marcos/png/`, fuera del repositorio) y a WebP ligeros para la web (usa Chrome o Edge sin ventana). Ahí están también **guardados** para ediciones especiales la alternativa de laca completa, la S+ washi con torii, la S de Jugador anterior y la de pan de oro (`exportar.mjs --guardadas` los pasa a PNG). Con un trozo del nombre solo se exportan esas piezas: `node diseno/marcos/exportar.mjs jugador/S`.
- Las posiciones del nombre, el emblema y el rol sobre el marco se ajustan en el bloque «Carta con marco» de `public/gachapon/gachapon.css`.
- La web mira la carpeta cada minuto: los dibujos nuevos aparecen sin reiniciar. Las direcciones llevan la fecha del archivo, así que al cambiar un dibujo nadie ve el antiguo en caché.
- Para verlo sin tocar datos reales: `npm run vista-previa` (jugadores inventados, una BOOST de cada tier y los dibujos de `public/cartas`) y entra en `http://localhost:3055/auth/prueba?nombre=Ana`.

Más sobres: el staff los **regala** desde el panel (premios, sorteos). Opcionalmente, con la recompensa de puntos del canal **Sobre de Tenka Ichi** (apartado «Puntos del canal de Twitch» más abajo).

Todo se guarda como movimientos en la pestaña **Gachapon** de Google Sheets (altas, canjes, regalos, aperturas y cartas), así que ahí se ve quién tiene qué. Cada cuenta se identifica por `discord-` y su id de Discord (o por el id de Twitch, si entra con Twitch). La conexión del canal, si se usa, va cifrada en la pestaña **Ajustes**.

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
2. En Render, en Environment: `DISCORD_WEBHOOK_URL` con esa dirección. Si la tier list o la clasificación del fantasy van en otro canal, crea otro webhook ahí y ponlo en `DISCORD_WEBHOOK_TIERLIST` o `DISCORD_WEBHOOK_CLASIFICACION`.

El texto lo pone la web (menciona a quien publica sin enviarle aviso y no deja colar menciones a todo el servidor), y cada persona puede publicar su colección y su alineación una vez cada 10 minutos. Sin webhook, el botón de publicar no sale y la imagen se puede descargar igual.

Sin las variables de Discord, la página del gachapon dice que abre muy pronto. En local se puede probar sin Discord entrando en `/auth/prueba?nombre=Alguien`; esa entrada de prueba no existe en Render.

### Puntos del canal de Twitch (opcional)

Las cuentas de Discord y de Twitch son distintas: los sobres de los puntos del canal se dan a la cuenta del id de Twitch, así que solo los recibe quien entre en el gachapon con el botón «Entrar con Twitch». Ese botón solo sale si se configura la app de Twitch, y una misma persona tendría dos colecciones, una por cada forma de entrar. Para activarlo:

1. Entra en https://dev.twitch.tv/console/apps con tu cuenta de Twitch y pulsa **Register Your Application**:
   - Name: `Tenka Ichi` (o el que quieras).
   - OAuth Redirect URLs: `https://tenka-ichi.onrender.com/auth/twitch/callback` y, para probar en local, `http://localhost:3030/auth/twitch/callback`.
   - Category: **Website Integration**. Client Type: **Confidential**.
2. En la app creada copia el **Client ID** y pulsa **New Secret** para sacar el **Client Secret**.
3. En Render añade `TWITCH_CLIENT_ID` y `TWITCH_CLIENT_SECRET` (y `SESION_SECRETO`, si no lo tenías ya).
4. En el panel, apartado **Gachapon**, pulsa **Conectar el canal de Twitch** y entra con la cuenta **koryubudo**. La web crea la recompensa «Sobre de Tenka Ichi» a 3000 puntos; el coste se cambia desde el panel.

La web recoge los canjes de la cola de Twitch cada minuto (y cuando alguien entra en el gachapon), da el sobre y marca el canje como hecho. Si la web está dormida, los canjes esperan en Twitch y no se pierden. Los puntos del canal solo existen en canales afiliados o partner de Twitch.

Como pide Twitch, los tokens guardados se validan al arrancar y cada hora (`/oauth2/validate`). Si el canal cambia la contraseña o retira el permiso, el panel avisa «vuelve a conectarlo» y deja de recoger canjes hasta que se conecte otra vez.

### Probarlo sin Discord ni Twitch de verdad

`npm test` arranca la web con datos temporales contra un **Discord falso** (`scripts/entrada-discord-falso.js`) y un **Twitch falso** (`scripts/twitch-falso.js`):

- Inicio de sesión con Discord (`test/entrada-discord.test.js`): entrar y recibir 2 sobres una sola vez, cancelar, estados y códigos inválidos, que `volver` no saque de la web, nombres que no puedan ser fórmulas, regalos por nombre, reinicio de la web y que en Render sin claves no haya ni inicio de sesión ni entrada de prueba.
- Twitch (`test/twitch.test.js`): entrar, abrir sobres, conectar el canal, canjes que dan sobres una sola vez, renovación de tokens, regalos, reinicio, permiso retirado y una partida del fantasy.

No tocan `data/`, las plantillas ni Google Sheets.

Los falsos también se pueden arrancar sueltos y apuntar la web a ellos:

- Inicio de sesión con Discord (`npm run entrada-discord-falso`, puerto 4041): `DISCORD_URL_WEB=http://localhost:4041`, `DISCORD_URL_API=http://localhost:4041/api/v10` y `DISCORD_URL_CDN=http://localhost:4041/cdn`, con `DISCORD_CLIENT_ID=cliente-prueba` y `DISCORD_CLIENT_SECRET=secreto-prueba`. Sus usuarios son ana, beto (sin nombre visible ni avatar), carla (nombre con una fórmula) y dani (nombre con caracteres raros).
- Twitch (`npm run twitch-falso`, puerto 4040): `TWITCH_URL_ID=http://localhost:4040` y `TWITCH_URL_API=http://localhost:4040/helix`, con `TWITCH_CLIENT_ID=cliente-prueba` y `TWITCH_CLIENT_SECRET=secreto-prueba`. Sus usuarios son koryubudo (el canal, afiliado), ana, beto y carla.

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
