# TENKA ICHI · Draft en directo

Refleja en directo un draft de **DraftCore** (lol.draftcore.net) en un overlay para OBS con el diseño TENKA ICHI, y lleva el registro de picks y bans por jornada con porcentajes.

- **Panel de producción:** `/panel/` (con contraseña)
- **Overlay para OBS:** `/overlay/` (1920×1080, fondo transparente; `?fondo=1` para verlo sobre tinta)

## Arrancar en tu PC

```
cd "E:\ Escritorio\Claude\koryu-budo\draft-app"
npm install
npm start
```

Abre http://localhost:3000/panel/ . Contraseña por defecto: `tenkaichi` (cámbiala con la variable `PANEL_CLAVE`).

Cada parche de LoL: `npm run ddragon` (descarga los campeones nuevos de Data Dragon).

## Cómo se usa un día de partido

1. En DraftCore crea el draft como siempre y copia el enlace de **espectador** (`lol.draftcore.net/XXXXXXX`).
2. En el panel: pega el enlace y pulsa **Conectar**. Elige jornada, fase y formato (Bo1 / Bo3 fearless), los clanes y los jugadores.
3. En OBS: fuente de navegador 1920×1080 con la dirección `/overlay/`.
4. Cada pick y ban aparece solo. Al pickear sale una tarjeta con pick %, ban %, presencia, winrate e historial del jugador y del clan.
5. Al acabar: **Gana lado azul / rojo** (se guarda en el registro) y **Siguiente partida**. En Bo3 fearless los campeones usados quedan bloqueados y se muestran en el overlay. **Nueva serie** limpia los bloqueos.

Si DraftCore falla, cualquier hueco se puede corregir a mano desde el panel escribiendo el nombre del campeón.

## Publicarlo en internet (Render, gratis)

1. Crea una cuenta en GitHub y sube esta carpeta a un repositorio (sin `node_modules` ni `data`, ya están en `.gitignore`).
2. Crea una cuenta en https://render.com con GitHub → **New → Web Service** → elige el repositorio.
   - Build command: `npm install` · Start command: `npm start` · Plan: Free.
   - Variables de entorno: `PANEL_CLAVE` (tu contraseña) y, cuando lo tengas, las dos de Google (abajo).
3. Render te da una dirección tipo `https://tenka-ichi-draft.onrender.com`. Panel en `/panel/` y overlay en `/overlay/`.
4. El plan gratuito se duerme tras 15 min sin uso: abre el panel un minuto antes del directo.

## Google Sheets (registro en directo)

1. En https://console.cloud.google.com crea un proyecto, activa **Google Sheets API** y crea una **cuenta de servicio**. En ella, **Claves → Añadir clave → JSON** (se descarga un archivo; no lo compartas).
2. Crea una hoja de Google, añade una pestaña llamada **Registro** y compártela (Editor) con el correo de la cuenta de servicio (`...@...iam.gserviceaccount.com`).
3. En Render añade:
   - `GOOGLE_SHEET_ID`: el código largo de la dirección de la hoja (`docs.google.com/spreadsheets/d/<ESTO>/edit`).
   - `GOOGLE_CREDENTIALS`: el contenido completo del JSON de la clave.
4. Cada partida registrada añade 20 filas (una por pick y ban): Fecha, Jornada, Fase, Serie, Partida, Clan azul, Clan rojo, Ganador, Lado, Tipo, Orden, Rol, Jugador, Clan, Campeón. Con eso se pueden hacer tablas dinámicas en la propia hoja. Al arrancar, la app lee la pestaña para recalcular los porcentajes.

Sin Google configurado, el registro se guarda en `data/registro.json` (solo en local; en Render se perdería al reiniciar).

## Estructura

```
server/index.js      servidor HTTP + WebSocket, estado del enfrentamiento y acciones del panel
server/draftcore.js  conexión Socket.IO con DraftCore y traducción de su formato
server/registro.js   registro de partidas (archivo local y Google Sheets)
server/stats.js      pick %, ban %, presencia, winrate e historial
server/clanes.js     clanes, colores y roles
public/overlay/      overlay para OBS
public/panel/        panel de producción
public/ddragon/      datos e imágenes de Data Dragon (npm run ddragon)
public/logos/        logos de clan (copiados de logos-equipos)
public/marca/        logo de Koryu Budo y sol partido
```

## Formato de DraftCore (comprobado el 23/09/2026)

Socket.IO en `https://ws.lol.draftcore.net` → `V3-joinDraft { draftId, url }`. Llegan `initializeDraft` / `V3-initialize` / `startDraft` con el draft completo (`ban1..ban10`, `b1..b5`, `r1..r5`, `turn`, `hovered`), `V3-updateHover { hovered }` y `V2-timerTick { turn, timeLeft }`. Los campeones usan el id de Data Dragon.
