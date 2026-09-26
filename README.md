# TENKA ICHI · Web y draft en directo

Web de la liga TENKA ICHI de Koryu Budo. Refleja en directo un draft de **DraftCore** (lol.draftcore.net) en un overlay para OBS y lleva el registro de picks y bans con porcentajes.

- **Portada pública:** `/` (los trece clanes en baraja, su plantilla, clasificación y campeones más presentes)
- **Panel de producción:** `/panel/` (con contraseña)
- **Guía de retransmisión:** `/guia/` (enlaces, montaje en OBS, dónde va cada cámara y los vídeos de inicio, transición y final para descargar; es lo que se le pasa a quien lleva OBS)
- **Overlay para OBS:** `/overlay/` (1920×1080, con fondo de tinta y de 0 a 4 cámaras; `?transparente=1` quita el fondo y `?guia=1` marca los huecos de las cámaras)

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
data-proyecto/         plantillas.json (va en el repositorio)
public/index.html      portada pública (inicio.css, inicio.js)
public/panel/          panel de producción
public/overlay/        overlay para OBS
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

`public/stream/` tiene los vídeos terminados (inicio, transición y final) que se descargan desde la guía. Se hacen en `koryu-budo/flow/` (prompts y montaje en `flow/bucles-stream.md`); si se rehacen, se copian aquí desde `flow/final/`.
