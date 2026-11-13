# Pipeline de producción: automatización OBS/vMix, cámara de observer, detección de eventos, visión por computador, latencia y fiabilidad (realizador assistant para LoL)

Fecha de la investigación: 2026-11-13. Contexto: producción amateur/semipro en español, pocos PCs, OBS, 1920x1080.

Nota de método y limitaciones de acceso: durante esta sesión el entorno solo permitió descargar páginas de github.com / raw.githubusercontent.com; developer.riotgames.com, hextechdocs.dev, vmix.com, arxiv.org, ijimai.org, pcgamer.com, lhm.gg, sky-csc.github.io y las docs de OBS/Companion NO fueron accesibles por WebFetch (error DNS). Por eso varias cifras/documentación oficial (Replay API de Riot, vMix, arXiv) solo se conocen por resúmenes de buscador. Todo lo que no tiene URL se marca como "conocimiento previo no verificado" en Inferences o Gaps.

---

## 1. Control de OBS y alternativas (obs-websocket v5, vMix, Companion, CasparCG, etc.) y automatización de replays

### Takeaway
obs-websocket v5 (incluido en OBS desde la 28) cubre todo lo necesario para un "realizador assistant" en OBS: cambio de escena/preview, transición de studio mode, visibilidad de fuentes, replay buffer (guardar y recuperar la ruta del último clip) y acciones de media sources, con soporte de lotes (batch) y eventos; hay clientes maduros (obs-websocket-js) y Companion/Stream Deck como capa de override manual. vMix tiene API HTTP/TCP equivalente con funciones de Instant Replay nativas, pero es de pago y solo Windows.

### Cited Findings
- obs-websocket v5: la autenticación usa `Hello` con `challenge` y `salt`; el cliente envía en `Identify` un hash base64 (SHA256 de password+salt, luego con el challenge); fallo = código 4009 `AuthenticationFailed`. La versión de RPC soportada es la 1 (negociada en `Identified.negotiatedRpcVersion`). — [obs-websocket protocol.md (raw)](https://raw.githubusercontent.com/obsproject/obs-websocket/master/docs/generated/protocol.md)
- Request batch (OpCode 8): `executionType` por defecto `SerialRealtime` (0); otros: `None` (-1), `SerialFrame` (1), `Parallel` (2); `haltOnFailure` por defecto false. La request `Sleep` (`sleepMillis` 0-50000 o `sleepFrames` 0-10000) solo sirve en lotes SERIAL_REALTIME/SERIAL_FRAME — permite secuenciar "cambiar escena, esperar N ms, ocultar fuente" en un solo mensaje. — [protocol.md](https://raw.githubusercontent.com/obsproject/obs-websocket/master/docs/generated/protocol.md)
- Requests concretas (todas "added v5.0.0"): `SetCurrentProgramScene` (sceneName o sceneUuid); `SetCurrentPreviewScene` (solo con studio mode activo); `TriggerStudioModeTransition` (sin campos); `SetStudioModeEnabled` (`studioModeEnabled`); `SetSceneItemEnabled` (`sceneName|sceneUuid`, `sceneItemId`, `sceneItemEnabled`); `SetCurrentSceneTransition` (`transitionName`); `SetCurrentSceneTransitionDuration` (50–20000 ms); `StartReplayBuffer`; `SaveReplayBuffer`; `GetLastReplayBufferReplay` (devuelve `savedReplayPath`); `TriggerMediaInputAction` (`inputName|inputUuid`, `mediaAction` = enum `ObsMediaInputAction`); `SetInputSettings` (`inputSettings`, `overlay` default true); `PressInputPropertiesButton` (p. ej. `refreshnocache` para recargar un browser source); `CallVendorRequest` (para plugins). — [protocol.md](https://raw.githubusercontent.com/obsproject/obs-websocket/master/docs/generated/protocol.md)
- Eventos relevantes: `ReplayBufferSaved` (con `savedReplayPath`) y `CurrentProgramSceneChanged` (`sceneName`, `sceneUuid`). — [protocol.md](https://raw.githubusercontent.com/obsproject/obs-websocket/master/docs/generated/protocol.md)
- obs-websocket-js (v5): `npm install obs-websocket-js`; `await obs.connect('ws://127.0.0.1:4455','password')` (puerto por defecto 4455); `obs.call('SetCurrentProgramScene',{sceneName})`; `obs.callBatch(requests,{executionType,haltOnFailure})`; eventos con `obs.on(...)`; tipos TypeScript `OBSRequestTypes/OBSResponseTypes`; codificación JSON (browser) o MessagePack (Node); repo con ~773 estrellas, último push 2026-10-26. — [obs-websocket-js README](https://github.com/obs-websocket-community-projects/obs-websocket-js); [búsqueda GitHub, 773★, push 2026-10-26](https://github.com/obs-websocket-community-projects/obs-websocket-js)
- Otros clientes/herramientas del ecosistema encontrados: `Niek/obs-web` (control remoto web, 1504★, push 2026-11-09); `lebaston100/node-red-contrib-obs-ws` (Node-RED, 10★) — [Niek/obs-web](https://github.com/Niek/obs-web), [node-red-contrib-obs-ws](https://github.com/lebaston100/node-red-contrib-obs-ws)
- Bitfocus Companion: el módulo `companion-module-obs-studio` exige OBS Studio v32.1 o superior y Companion 5.0.0+; cambia escenas, controla fuentes/audio, grabación/streaming y permite enviar comandos WebSocket personalizados; puerto WebSocket por defecto 4455. No lo he podido verificar que cubra replay buffer (la página no lo menciona). — [companion-module-obs-studio](https://github.com/bitfocus/companion-module-obs-studio)
- vMix: API HTTP en puerto 8088 con parámetro `Function`; API TCP en puerto 8099 (UTF-8, mensajes terminados en CRLF) con la misma funcionalidad y menor overhead; las funciones de Replay aceptan parámetro de canal (A, B, Current o vacío). Un hilo del foro advierte de comportamientos raros al mantener ReplayPlayBackward/ReplayFastBackward vía TCP. (Resumen de buscador; páginas no descargables en esta sesión.) — [vMix Developer API help29](https://free.vmix.com/help29/DeveloperAPI.html); [vMix TCP API](https://1.vmix.com/help26/TCPAPI.html); [foro vMix: replay quirk](https://forums.vmix.com/posts/t33349-vMix-Replay--rewinding--functions-quirk); referencia no oficial: [vmixapi.com](https://vmixapi.com)
- Replay en OBS - plugins/scripts encontrados: `seandotnet/ShadBuffer` (instant replay basado en OBS, 77★, push 2026-11-07); `tomaae/obs-instant-replay` (42★, abandonado desde 2019); `adocilesloth/InstantReplay` (plugin, 23★, último push 2024-04); `angeloruggieridj/obs-multireplay` (dock nativo, multicámara). — [búsqueda GitHub "obs instant replay"](https://github.com/seandotnet/ShadBuffer); [obs-multireplay](https://github.com/angeloruggieridj/obs-multireplay)
- obs-multireplay: hasta 8 ángulos en una línea de tiempo maestra, 2 "replay bays", velocidad 5%–200% con audio con pitch preservado, marcas In/Out, exportación MP4; requiere el plugin Branch Output; compatible con OBS 32.0–33.0.1 (binarios compilados contra 31.1.1); captura paquetes ya codificados en un anillo de RAM (latencia al borde en vivo ~140 ms en iGPU Intel 1080p30); todos los comandos se registran como hotkeys de OBS (disparables desde Stream Deck) y hay puentes Node.js vía obs-websocket para controladores JLCooper/ShuttlePRO; la página NO documenta una API websocket general del plugin; binarios sin firmar. — [obs-multireplay README](https://github.com/angeloruggieridj/obs-multireplay)
- `mltoo/ReplayWorkbench`: plugin de OBS para replay tipo deportes en vivo, marcado WIP (4★, push 2026-09-27). — [ReplayWorkbench (resultado de búsqueda)](https://github.com/mltoo/ReplayWorkbench)
- `0slvr/ObsToNvidia`: script Lua que reinicia el Replay Buffer tras cada guardado (útil como patrón: el buffer de OBS debe reiniciarse/gestionarse tras guardar para encadenar clips). — [ObsToNvidia](https://github.com/0slvr/ObsToNvidia)
- Ecosistema de overlays LoL: `RCVolus/league-prod-toolkit` (MIT, 163★) ofrece overlays integrados en OBS/vMix como browser source (scoreboard, killfeed, objetivos, timers de inhibidor, champ select, postgame) alimentados por un "Observer Tool" en el PC del observer; NO describe automatización de escenas. — [league-prod-toolkit](https://github.com/RCVolus/league-prod-toolkit)
- `floh22/LeagueBroadcast`: overlays como browser source local (puerto 9001, WebSocket `ws://localhost:9001/api`), MIT, pero deprecado: "ya no funciona por la introducción de Vanguard" (leía memoria del juego). — [LeagueBroadcast](https://github.com/floh22/LeagueBroadcast)
- `BlueBottleGG/leaguebroadcast-js-client` es un wrapper JS fino del websocket de LeagueBroadcast (12★, push 2026-10-22). — [leaguebroadcast-js-client](https://github.com/BlueBottleGG/leaguebroadcast-js-client)

### Inferences
- Arquitectura mínima viable: un proceso "director" (Node con obs-websocket-js o Python) que recibe estado de partida, calcula una "escena/shot deseado" y emite lotes `SetCurrentProgramScene` / `SetSceneItemEnabled`; con studio mode se puede hacer `SetCurrentPreviewScene` primero (modo "sugerir") y `TriggerStudioModeTransition` solo con confirmación humana (modo "asistido") o automáticamente (modo "auto"). Esto es diseño propuesto, no algo documentado como patrón estándar.
- Para replays en OBS "puro": flujo = detectar kill/pelea → esperar post-roll → `SaveReplayBuffer` → escuchar `ReplayBufferSaved` (o `GetLastReplayBufferReplay`) → `SetInputSettings` sobre un Media/VLC source con `savedReplayPath` → `TriggerMediaInputAction` (restart/play) → cambiar escena a "Replay" → volver a directo al terminar. Todas las requests existen en v5.0.0 según el protocolo, pero el patrón completo no lo he visto documentado en una fuente única; lo marco como inferencia. Limitación conocida del Replay Buffer nativo de OBS (conocimiento previo, no verificado aquí): solo guarda un clip de duración fija y es el mismo encoder del stream, sin slow-mo ni multiángulo; para eso existen plugins como obs-multireplay.
- Dado que Companion/Stream Deck pueden enviar los mismos comandos WebSocket, la forma más robusta de override manual es dejar Companion como UI de mando y que el "assistant" use la misma conexión/mismos nombres de escena.
- En equipos amateur sin licencia vMix, OBS+obs-websocket es suficiente; vMix aporta Instant Replay multicámara nativo y API TCP, pero cuesta licencia y requiere Windows (conocimiento previo, no verificado en esta sesión).

### Gaps
- No pude verificar en docs primarias: enum exacto de `ObsMediaInputAction` (p. ej. `OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART`), puerto/versión mínima de obs-websocket integrada en OBS 28+, ni las funciones exactas de Replay de vMix (ReplayMarkIn, ReplayPlayEvent, etc.) — hosts de OBS docs y vMix bloqueados en la sesión.
- No investigué CasparCG, Ross (DashBoard/OverDrive), TriCaster ni Singular.live (se agotó el presupuesto de búsquedas y varios hosts estaban bloqueados). Conocimiento previo no verificado: CasparCG es servidor de gráficos/playout con protocolo AMCP por TCP y plantillas HTML; Singular.live es un servicio cloud de overlays con API REST/"Control app"; Ross y TriCaster tienen sus propios protocolos de control. No usar sin verificar.
- No encontré proyectos GitHub específicos de "LoL → OBS scene switching automático"; las búsquedas de repos por "league of legends observer automation obs" devolvieron 0 resultados (sin evidencia de un proyecto maduro público).
- Reddit (r/obs, r/broadcasting) no fue consultado (sin acceso).

---

## 2. Automatización de la cámara del observer en LoL (Replay API, hotkeys, AutoHotkey) y qué es legítimo con Riot

### Takeaway
La Replay API local de Riot (https://127.0.0.1:2999/replay/...) permite controlar con precisión cámara, UI y reproducción, pero está pensada para REPLAYS (herramienta de referencia: League Director); para partidas en vivo de observer, la ruta documentada y segura es la combinación de hotkeys del cliente + automatización de teclado/ratón externa, mientras que cualquier lectura de memoria está muerta por Vanguard. No hay evidencia en lo encontrado de una API oficial para controlar la cámara del observer EN VIVO.

### Cited Findings
- League Director (Riot, Apache-2.0, 1026★) es la implementación de referencia de la Replay API: control de reproducción y velocidad, cámara en primera persona (opcionalmente enlazada a un campeón o minion), toggles de HUD/barras de vida/notificaciones, FOV, clipping, skyboxes, niebla, profundidad de campo, un "sequencer" con keyframes de cámara, captura de vídeo WebM/PNG; solo Windows; requiere `EnableReplayApi=1` bajo `[General]` en `Config/game.cfg` y reiniciar el replay; gráficos en Very High; Riot no acepta PRs. — [RiotGames/leaguedirector](https://github.com/RiotGames/leaguedirector)
- Endpoints de la Replay API según el código cliente de League Director (base `https://127.0.0.1:2999`): `/replay/game` (solo lectura), `/replay/recording`, `/replay/render`, `/replay/playback`, `/replay/particles`, `/replay/sequence` (solo escritura). — [leaguedirector/api.py](https://github.com/RiotGames/leaguedirector/blob/master/leaguedirector/api.py)
- Campos de `/replay/render` (de api.py): `cameraMode` (str), `cameraPosition {x,y,z}`, `cameraRotation {x,y,z}`, `cameraAttached` (bool), `cameraMoveSpeed`, `cameraLookSpeed`, `cameraLockX/Y/Z`, `fieldOfView`, `nearClip`, `farClip`, `fogOfWar`, `outlineSelect`, `outlineHover`, `floatingText`, y banderas de interfaz `interfaceAll`, `interfaceReplay`, `interfaceScore`, `interfaceScoreboard`, `interfaceFrames`, `interfaceMinimap`, `interfaceTimeline`, `interfaceChat`, `interfaceTarget`, `interfaceQuests`, `interfaceAnnounce`, `interfaceKillCallouts`, `interfaceNeutralTimers`; `healthBarChampions/Structures/Wards/Pets/Minions`; `environment`, `characters`, `champions`, `minions`, `particles`, `banners`. — [leaguedirector/api.py](https://github.com/RiotGames/leaguedirector/blob/master/leaguedirector/api.py)
- Campos de `/replay/playback`: `paused`, `seeking`, `time`, `speed`, `length`. `/replay/recording`: `recording`, `path`, `codec`, `startTime`, `endTime`, `currentTime`, `width`, `height`, `framesPerSecond`, `enforceFrameRate`, `replaySpeed`. — [leaguedirector/api.py](https://github.com/RiotGames/leaguedirector/blob/master/leaguedirector/api.py)
- `selectionName` NO aparece en el código de League Director (la herramienta que extrajo los campos lo señala explícitamente); no pude confirmar que exista en la API pública. — [leaguedirector/api.py](https://github.com/RiotGames/leaguedirector/blob/master/leaguedirector/api.py)
- Un fork comunitario, LeagueDirectorNG (LeagueOfPoro), replica funciones: reproducción/velocidad, cámara en primera persona, adjuntar cámara a campeón/minion, sequencer; "Windows only"; en el menú de cámara del juego hay que elegir "FPS Camera"; movimiento libre con numpad 4/5/6/8 + ratón; atajos de FPS camera en Hotkeys > First Person Camera. — [LeagueDirectorNG](https://www.github.com/LeagueOfPoro/LeagueDirectorNG)
- La Replay API oficial está documentada en el portal de desarrolladores de Riot (developer.riotgames.com/replay-apis.html) y fue presentada en PBE junto con League Director como "nuevas herramientas de creación de contenido" (resultado de búsqueda; contenido no descargable en esta sesión). — [Riot Replay APIs](https://developer.riotgames.com/replay-apis.html); [anuncio PBE (archivo)](https://archive.runeterra.net/na/developer-corner/AmtMIQB3)
- `RCVolus/league-observer-tool` (MIT, 43★, push 2026-03-02): complemento del league-prod-toolkit para el PC del observer; consulta LCU, Live Client y Replay API (para controles de tiempo; requiere `EnableReplayApi=1`), y una API de LiveEvents (puerto 34243 por defecto, configurada en `game.cfg` y `LiveEvents.ini`) que emite eventos de Dragón, Barón, Heraldo, Gusano, placas de torre y Alma de Dragón; desde v5.0.0 incluye lectura pasiva de memoria (basada en Farsight) pero está DESACTIVADA por Vanguard con aviso de "posible ban". NO automatiza la cámara. — [league-observer-tool](https://github.com/RCVolus/league-observer-tool)
- league-prod-toolkit indica que la API LiveEvents de Riot "ha sido eliminada", aunque level-ups, compras de items, killfeed e inhibidores deberían seguir funcionando. (Contradice parcialmente el README del observer tool, que aún describe LiveEvents en 34243: la fuente más reciente que he visto sobre el estado es la del toolkit; verificar en pruebas reales.) — [league-prod-toolkit](https://github.com/RCVolus/league-prod-toolkit); [league-observer-tool](https://github.com/RCVolus/league-observer-tool)
- Existen proyectos comunitarios que usan la Replay API para automatizar clips: `LeXeS2/lol-clip-maker` (extrae clips de .rofl con un evento de un invocador objetivo, 0★) — [lol-clip-maker](https://github.com/LeXeS2/lol-clip-maker); hay un fork para macOS `syaor4n/leaguedirector-mac` (Apache-2.0, no afiliado a Riot) — [leaguedirector-mac](https://github.com/syaor4n/leaguedirector-mac)
- Riot lanzó en su momento una revisión del modo espectador con controles de tiempo y cámara "dirigida por IA" (titular de PC Gamer; contenido no descargable aquí, fecha no verificada). — [PC Gamer: spectator mode revamp](https://pcgamer.com/league-of-legends-spectator-mode-revamp-adds-time-controls-and-ai-driven-camera)
- Un estudio académico (IJIMAI, 2026) usa un modelo visión-lenguaje + síntesis de voz para generar comentario y dirección de cámara en LoL; sincronizar comentario y cámara es el reto central (resumen de buscador, no leído). — [IJIMAI 6566](https://www.ijimai.org/index.php/ijimai/article/view/6566)

### Inferences
- Para observer EN VIVO, la Replay API (render/playback) probablemente NO está disponible: League Director y las herramientas citadas la usan sobre replays. Que `/replay/*` no responda en espectador en vivo es una inferencia basada en que todas las herramientas encontradas la aplican a replays; verificar con `curl -k https://127.0.0.1:2999/replay/render` en una partida custom real.
- Alternativa realista para cámara en vivo: el observer humano (o un "asistente" que envía teclas) usa hotkeys del cliente espectador (conocimiento previo no verificado: teclas 1–0/Q-W-E-R-T para seguir jugadores, flechas/ratón para cámara libre, F1–F5 etc.). Automatizar con AutoHotkey/pyautogui (envío de teclas/clics al cliente) está en la zona gris: no hay una API oficial, pero tampoco encontré en las fuentes una prohibición explícita para el cliente de observer; lo sensato es consultar las políticas de Riot (Vanguard puede bloquear inputs sintéticos en ciertas condiciones — conocimiento previo no verificado) y probar en entorno de torneo/custom.
- Todo lo que lea memoria (Farsight, LeagueBroadcast antiguo) debe descartarse: el propio README de ambos proyectos lo da por muerto/peligroso por Vanguard.
- Un enfoque Riot-compatible y barato: "asistente que sugiere" — mostrar al observer humano (en un segundo monitor/Stream Deck) qué jugador/objetivo seguir y dejar que él mueva la cámara; el "realizador" automático solo escoge entre escenas OBS ya hechas (observer cam, cams de jugadores, replay, grafismo).

### Gaps
- No pude abrir la documentación oficial de Riot (developer.riotgames.com) ni hextechdocs.dev: no verifiqué los valores válidos de `cameraMode` ("top", "fps", "path"...?), el significado de `selectionName`, ni si la API acepta escrituras en spectate en vivo.
- No encontré ejemplos públicos de AutoHotkey/pyautogui para dirigir la cámara de observer de LoL en GitHub/Reddit con las búsquedas realizadas; tampoco una lista oficial de hotkeys del espectador con URL citable.
- No hay evidencia citable sobre política de Riot respecto a input sintético en el cliente de espectador/Vanguard.

---

## 3. Lógica de detección de eventos (peleas, objetivos, interest score) y heurísticas de observers humanos

### Takeaway
La literatura y los productos existentes respaldan dos enfoques: reglas explícitas (clustering de kills/posiciones, timers de objetivos) y modelos aprendidos (learning-to-rank sobre eventos en Dota 2; clasificadores de highlight en vídeo para LoL). Las guías de observer disponibles aportan principios cualitativos (seguir lo que dicen los casters, contexto de objetivos), pero no hallé una guía oficial con umbrales cuantitativos.

### Cited Findings
- Revisión de la literatura (resumen de buscador): el control de cámara en eSports es más difícil que en deportes tradicionales porque los juegos suelen carecer de un único foco; existen enfoques basados en reglas (cámaras de Dota 2 y LoL) y enfoques aprendidos (más comunes en Dota 2); un estudio de Dota 2 usa AdaRank (learning-to-rank) para ordenar eventos de juego y reporta superar a un método ML previo y a un equipo de observers humanos en precisión; otra línea aplica detección de objetos a datos de espectado humano y reporta mejor estabilidad de cámara. — [búsqueda: automated camera control MOBA](https://arxiv.org/pdf/1706.03122) ("Off The Beaten Lane"); [Learning-to-Rank para control de cámara en eSports](https://ouci.dntb.gov.ua/works/4Yg3a5P9); [esports.gg sobre observer automático](https://esports.gg/news/esports/new-study-introduces-intelligent-automatic-observer-for-improved-esports-viewing-experience)
- "Real-Time Video Highlights for Yahoo Esports" (arXiv 1611.08780): detección en vivo de highlights en Heroes of the Storm, LoL y Dota 2 con un enfoque en cascada; 18 FPS en una sola CPU; precisión media de hasta 83.18%; parte desplegada en producción en Yahoo Esports (cifras de resumen de buscador, no verificadas en el PDF). — [arXiv 1611.08780](https://arxiv.org/pdf/1611.08780)
- Ringer et al. (Machine Learning with Applications, sep 2022) proponen extensiones a arquitecturas de detección de highlights basadas en ranking, centrado en LoL. — [DOAJ](https://doaj.org/article/3d714af74bd446cb916ccda6976327e5)
- LIGHTOR (arXiv 1910.12201): extracción de highlights de vídeos grabados de Twitch (Dota 2) mediante "implicit crowdsourcing" (señales del chat). — [arXiv 1910.12201](https://arxiv.org/pdf/1910.12201)
- Para Dota 2, la función de highlights automáticos desde replay existe pero es descrita como rudimentaria; se propone combinar datos de emotes del público con datos de replay. — [Off The Beaten Lane](https://arxiv.org/pdf/1706.03122)
- Prácticas de observers humanos (fuentes periodísticas): en cada emisión de LEC trabajan tres observers; escuchan a los casters para apuntar la cámara a lo que se comenta (hasta 10 personas pueden hablar en su oído); en LoL no se muestran POVs directos de jugadores; el overlay debe apoyar el plano del observer (p. ej. al cortar al Barón, el grafismo explica el estado del objetivo). — [Syfy: digital camera crews](https://www.syfy.com/syfy-wire/nerdy-jobs-digital-camera-crews-capture-esports-biggest-moments); [LHM: what makes a good LoL overlay](https://lhm.gg/blog/what-makes-a-good-lol-broadcast-overlay); [SVG: Esports Production Summit 2019](https://www.sportsvideo.org/2019/12/06/esports-production-summit-how-observers-and-remi-define-the-breakout-era-of-live-esports-production/?print=1)
- Riot "Pro View" (modo del cliente/web) permite elegir POVs de jugadores y su línea de tiempo marca kills y objetivos. — [PC Gamer: Pro View](https://pcgamer.com/league-of-legends-new-pro-view-mode-gives-me-all-the-stats-and-pov-options-i-want-for-watching-esports)
- Fuentes de eventos en vivo: la Live Client Data API local (127.0.0.1:2999, ruta `/liveclientdata/`, endpoints `allgamedata` y `eventdata`) — [irelia-cli (docs.rs)](https://docs.rs/irelia-cli/0.5.6/src/irelia_cli/in_game.rs.html); un post en el foro de Overwolf afirma que Riot cambió el puerto 2999 por uno aleatorio (reporte de un solo usuario, no confirmado). — [Overwolf forum](https://discuss.overwolf.com/t/lol-live-client-data-event-not-sending-updates/974)
- Proyectos recientes ya hacen "tracking automático de objetivos" y HUD de torneo sobre la Live Client Data API (ej. `Dachers/league-spectator-hud`, 0★, 2026-08). — [league-spectator-hud](https://github.com/Dachers/league-spectator-hud)

### Inferences
(Diseño propuesto; no hay una fuente que dé estos umbrales.)
- Detección de pelea por kills: ventana deslizante (p. ej. 8–15 s) sobre `eventdata` (ChampionKill, Multikill, Ace, TurretKilled, DragonKill, BaronKill, InhibKilled…): cuando hay ≥2 kills en la ventana o ≥1 kill + ≥3 campeones a <N unidades entre sí, se marca "teamfight". Umbrales a calibrar con datos grabados.
- Pre-posicionamiento por temporizadores: con los tiempos de reaparición de Dragón/Barón/Heraldo/Gusano (derivables de eventos + reglas conocidas) activar "modo objetivo" ~30–45 s antes y proponer la cámara al pit; el score sube si hay visión/campeones cerca.
- "Interest score" = suma ponderada de: kills recientes, daño reciente, oro en juego (diff), cercanía a objetivos, número de campeones en un radio, vida baja de un carry, y prioridad de objetivos; con histéresis y tiempo mínimo de permanencia (p. ej. 4–6 s) para no hacer saltos. La literatura (AdaRank, estabilidad de cámara) respalda que la estabilidad importa; los valores concretos no.
- El audio/guion de los casters es una señal usada por observers humanos (Syfy/LHM); un asistente amateur podría incluir un "botón de interés" manual del caster/realizador como entrada al score.
- Para 1080p amateur, empezar con reglas + botón de override es más barato que entrenar un modelo; el learning-to-rank sólo aporta si se dispone de datos de observers humanos etiquetados (no localizados públicamente para LoL).

### Gaps
- No encontré guía oficial de Riot ("observer guidelines") ni "Observing 101" comunitaria ni charla GDC con prioridades de plano cuantificadas; solo notas periodísticas generales.
- No pude abrir los PDFs de arXiv ni el artículo de learning-to-rank (hosts bloqueados): las cifras de AP/FPS salen de resúmenes de buscador. Tampoco hallé "Observer AI Dota" específico (OpenAI Five/Valve) ni el paper de Tot et al. 2021.
- No hay datasets públicos de decisiones de observers LoL localizados.
- Estado actual de la API LiveEvents (34243) contradictorio entre repos: requiere prueba práctica.

---

## 4. Visión por computador / OCR sobre el HUD del espectador (killfeed, scoreboard, minimapa, timers, oro)

### Takeaway
Existen prototipos de visión pura para LoL (minimapa por detección de objetos y por CV clásico), pero ninguno listo para producción en HUD de observer; la precisión reportada es parcial, requiere calibración por resolución y sufre con niebla/oclusión. Como complemento a una API local es útil (p. ej. para leer el reloj o detectar kill-feed/anuncios), pero como fuente única es frágil.

### Cited Findings
- `ryancole/spectral-sight` (2★, push 2026-10-08): extracción de estado "solo visión", sin APIs de Riot ni interacción con procesos; entrada = VOD en primera persona capturado de una ventana (no feed de observer); técnicas: Hough para círculos, máscaras de color, template matching, flujo óptico; no usa red neuronal ni OCR (dígitos con plantillas aprendidas); extrae minimapa (posición y equipo de campeones), reloj de juego, muertes aliadas, nameplates; NO lee killfeed ni scoreboard. Resultados (muestras pequeñas, partidas contra bots): 87% de frames con los 5 aliados detectados en minimapa; reloj leído en 100% de 14.744 frames; 97,5% de filas de muertes aliadas con veredicto; ~8 ms/frame de detección pero identificación a ~17 fps ("no suficientemente rápido para correr en vivo junto al juego"); calibración manual por resolución; todos los enemigos conocidos solo en 36% de frames por niebla. — [spectral-sight](https://github.com/ryancole/spectral-sight)
- `eidus/AAAI26_LoL_MinimapDetection` (AAAI-26 Student Abstract): modelo RT-DETRv2 afinado (`aaai26_minimap_v1`), pre-entrenado con datos sintéticos (imágenes 256px) y afinado con replays reales; mejor mAP@[.50:.95] = 0.699 (scratch, sin augmentación) frente a 0.620 solo replay con COCO y 0.382 solo replay desde cero; requiere API key de Riot y descarga de datasets/pesos desde Hugging Face; clases no listadas. — [AAAI26_LoL_MinimapDetection](https://github.com/eidus/AAAI26_LoL_MinimapDetection)
- Yahoo Esports (arXiv 1611.08780): detección de highlights en vídeo en vivo para LoL, Dota 2 y HotS con ~18 FPS en CPU y AP hasta 83,18% (resumen de buscador). — [arXiv 1611.08780](https://arxiv.org/pdf/1611.08780)
- Memoria del juego: descartada por Vanguard (LeagueBroadcast deprecado; observer tool deshabilita Farsight con aviso de ban). — [LeagueBroadcast](https://github.com/floh22/LeagueBroadcast); [league-observer-tool](https://github.com/RCVolus/league-observer-tool)
- En el lado de OCR/YOLO: no localicé proyectos específicos de OCR del killfeed/scoreboard de LoL con PaddleOCR/Tesseract en esta sesión (las búsquedas de repos "lol spectator hud ocr kill feed" no devolvieron resultados).

### Inferences
- Ventajas de visión: independiente de cambios de API/parches y de Vanguard (solo lee píxeles de una captura, aunque con un espejo de salida del observer), y capta lo que ve el espectador (anuncios, timers del HUD). Contras: calibración por resolución/skin/idioma, errores de OCR en cifras pequeñas, coste de CPU/GPU en un PC ya cargado con OBS, latencia añadida, y menos fiabilidad que un campo estructurado.
- Recomendación práctica: usar la API/eventos como fuente primaria; visión solo para señales que la API no da (p. ej. verificar el reloj/estado del juego, detectar anuncios "Ace/Baron" en pantalla como confirmación) y, si se hace, en una segunda máquina que reciba la salida del observer (NDI/capture) para no robar rendimiento al PC de juego. Es una recomendación mía, no fuente.
- Para el minimapa, un detector tipo RT-DETR/YOLO puede dar posiciones de campeones del minimapa del observer (que no tiene niebla), útil para clustering de peleas cuando no hay datos de posición por API; es una extrapolación: el trabajo AAAI reporta mAP de 0.70, que sin más validación no garantiza tracking de identidad robusto.

### Gaps
- No hay cifras de precisión para OCR de killfeed/scoreboard/oro en LoL (no se encontraron proyectos).
- No verificado: qué datos posicionales expone la Live Client Data API en modo espectador (en mi conocimiento previo, la Live Client Data API da datos limitados del jugador local y no es completa para observer — no verificado aquí).
- Tesseract/PaddleOCR benchmarks sobre fuentes de LoL: sin fuentes.

---

## 5. Latencia y sincronía (delay de espectador, vídeo retrasado vs datos adelantados)

### Takeaway
En partidas normales/ranked el espectador sufre un retraso de unos 3 minutos; en custom games el host puede desactivarlo (hay una afirmación explícita de Riot para Wild Rift y guías no oficiales para PC). Para sincronizar datos y vídeo, la solución estándar es retrasar uno de los dos flujos (vídeo en OBS o eventos en el director) por la diferencia medida.

### Cited Findings
- Spectate normal/ranked tiene 3 min de retraso (guías de terceros: para evitar ghosting); en custom games el host puede deshabilitarlo; la página de soporte de Riot para Wild Rift dice que "en partidas custom no hay retraso de 3 minutos: el feed es en vivo" (es Wild Rift, no PC). — [Riot Support Wild Rift: Spectate & Replay](https://support.riotgames.com/en-us/wild-rift/gameplay/spectate-replay); [guía no oficial](https://lol-esports-streams.pages.dev/posts/spectate-game-league)
- Fuentes de terceros afirman que las emisiones oficiales usan modo espectador customizado con retraso mínimo de producción; no hay documentación oficial para PC del retraso en LEC. — [guía no oficial](https://lol-esports-streams.pages.dev/posts/spectate-game-league)
- obs-multireplay reporta ~140 ms de latencia al borde en vivo (1080p30, iGPU Intel) y que todos los paquetes llevan el mismo reloj del sistema: alineación multicámara "leída, no estimada". — [obs-multireplay](https://github.com/angeloruggieridj/obs-multireplay)
- LeagueBroadcast permitía retrasar el champ select (delay configurable) para acortar la espera in-game; ejemplo de patrón "retraso configurable" en overlays. — [LeagueBroadcast](https://github.com/floh22/LeagueBroadcast)
- obs-websocket ofrece `Sleep` en lotes para secuenciar acciones con tiempos; la request `SetCurrentSceneTransitionDuration` (50–20000 ms) fija la duración de transición. — [protocol.md](https://raw.githubusercontent.com/obsproject/obs-websocket/master/docs/generated/protocol.md)

### Inferences
- Dos estrategias: (a) "datos adelantados": si los eventos vienen del PC observer en tiempo real (cliente local), están adelantados respecto al vídeo transmitido (por encoder/CDN/latencia del stream); el director decide con datos y OBS retrasa la salida. (b) "vídeo retrasado": insertar un retardo (filtro "Render Delay" de OBS en la fuente de juego — conocimiento previo no verificado — o un buffer SRT/NDI) y emitir las decisiones con el mismo desfase. Debe medirse con un test de "clap" (evento conocido en juego vs. frame en OBS).
- Si el realizador trabaja a partir de la API de espectador con 3 min de retraso en una partida no-custom, los datos no son "adelantados": la ventaja del asistente desaparece; en la liga amateur lo normal es usar lobbies custom con espectador sin delay (verificar en la configuración del torneo).
- El directo al público (Twitch/YouTube) añade su propio retraso, irrelevante para la sincronía interna pero sí para interacción con chat.

### Gaps
- No encontré documentación oficial de Riot sobre el retraso exacto en PC custom/torneo (Tournament Realm) ni del "spectator delay" configurable para torneos.
- No pude verificar el nombre/ajustes del filtro de retardo en OBS.

---

## 6. Ingeniería de fiabilidad (override manual, failover, watchdogs, logging, ensayo con datos grabados)

### Takeaway
Las fuentes de este tema son escasas en lo investigado; los puntos citables vienen de la propia arquitectura de las herramientas (hotkeys de OBS accesibles desde Stream Deck, eventos y reconexión de obs-websocket, `haltOnFailure`) y de lecciones de deprecación (dependencias de APIs no oficiales). El resto son recomendaciones de ingeniería marcadas como tales.

### Cited Findings
- obs-multireplay registra todos sus comandos como hotkeys de OBS, así que un Stream Deck los dispara sin plugin; incluye "pre-flight check" (espacio en disco, ancho de banda, buffer en RAM) y una vista de salud (paquetes, frames perdidos, cámaras caídas) que no saca fuentes del aire automáticamente. — [obs-multireplay](https://github.com/angeloruggieridj/obs-multireplay)
- obs-websocket: `haltOnFailure` en lotes detiene el procesamiento al primer fallo; obs-websocket-js expone eventos `ConnectionOpened/Closed/Error` para implementar reconexión; depuración con `DEBUG=obs-websocket-js:*`. — [protocol.md](https://raw.githubusercontent.com/obsproject/obs-websocket/master/docs/generated/protocol.md); [obs-websocket-js](https://github.com/obs-websocket-community-projects/obs-websocket-js)
- Riesgo de dependencia de datos no oficiales: LeagueBroadcast quedó inoperativo por Vanguard; la API LiveEvents fue retirada según league-prod-toolkit; los offsets de memoria necesitaban actualización tras cada parche (~24 h o más). Lección: tener fallback manual. — [LeagueBroadcast](https://github.com/floh22/LeagueBroadcast); [league-prod-toolkit](https://github.com/RCVolus/league-prod-toolkit)
- spectral-sight genera un timeline JSONL + feed SSE y descarta frames si el proceso se retrasa (no los encola); es un ejemplo de grabación de estado reproducible. — [spectral-sight](https://github.com/ryancole/spectral-sight)
- Existen replays (.rofl) reproducibles solo dentro del cliente y que caducan al cambiar de parche; sirve para ensayos solo dentro del mismo parche. — [Clip.dor.gg replay guide](https://clip.dor.gg/en/blog/league-of-legends-replay-guide)
- League Director/Replay API permite reproducir un replay con cámara controlada, útil para ensayar la lógica del asistente contra partidas conocidas (mismo parche). — [leaguedirector](https://github.com/RiotGames/leaguedirector)

### Inferences
(Recomendaciones de ingeniería propias, no de fuente.)
- Modos: AUTO / ASISTIDO (propone en preview, humano confirma) / MANUAL (el asistente se desconecta; Companion/Stream Deck con escenas fijas). Un único botón "kill switch" que desactiva el envío de comandos.
- Watchdog: heartbeat entre el proceso director y OBS (`GetVersion` periódico), reconexión con backoff, y si el feed de datos falla >N s, volver a una escena segura ("Observer cam") y avisar al realizador humano.
- Logging: registrar cada evento entrante con timestamp de juego + reloj del sistema, cada decisión y su score, y cada comando enviado a OBS (JSONL), para postmortem y ajuste de umbrales.
- Ensayo: grabar el stream de eventos de partidas reales (como hace spectral-sight con JSONL) y reproducirlos a velocidad x1/x4 contra un OBS de pruebas; complementar con replays .rofl del mismo parche mediante la Replay API y un mock server del endpoint `eventdata` para pruebas sin partida.
- Mantener nombres de escena/IDs en un fichero de configuración; usar `sceneUuid` donde sea posible (el protocolo lo admite) para evitar fallos por renombrar escenas.
- Dos PCs: juego/observer y producción (OBS); el director corre en el PC de producción con datos por red; planear que el PC de OBS funcione sin el director.

### Gaps
- No hay fuentes de ingeniería de fiabilidad específicas de broadcast de esports (p. ej. runbooks, MCR) consultadas; las recomendaciones anteriores son criterio propio.
- No se verificó el comportamiento real de reconexión/auto-reconnect de obs-websocket-js más allá de los eventos de conexión documentados.
- No encontré un mock/replayer público de la Live Client Data API para LoL.

---

## Resumen de huecos globales para el redactor
- Hosts bloqueados durante la sesión: developer.riotgames.com, hextechdocs.dev, vmix.com, arxiv.org, ijimai.org, pcgamer.com, lhm.gg, sky-csc.github.io, docs de OBS y Companion. Las fuentes de esos dominios aparecen citadas desde snippets de buscador y deben tratarse como no verificadas en detalle.
- No cubiertos: CasparCG, Ross, TriCaster, Singular.live, Reddit, charlas GDC, guías "Observing 101".
- Cifras académicas (AP 83,18%, 18 FPS, AdaRank superando a observers) provienen de resúmenes de buscador.
