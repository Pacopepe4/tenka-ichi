# Estado actual del proyecto TENKA ICHI / Gokudō: extracción de datos de LoL y realizador automático (auditoría del repositorio local)

Alcance: auditoría de solo lectura de `/home/user/tenka-ichi` (commit más reciente `860fb2c`, copia del realizador con `VERSION.txt` = `27fb6e6 2026-11-14T00:27:29+01:00`). Todas las citas son `ruta:línea` relativas a la raíz del repo (salvo que se indique). No hay fuentes web: es un inventario del código y de la documentación propia. Se distingue entre lo que **el código hace** (verificable en las líneas citadas) y lo que **la documentación afirma haber probado** o deja pendiente.

Nombres: el proyecto se llama TENKA ICHI en el repo y la marca de cara al público pasó a Gokudō (`PROGRESO.md:357`). El "realizador" es un sub-proyecto (repo externo `Pacopepe4/realizador`) copiado en `realizador/` (`README.md:59`, `scripts/traer-realizador.js:1-3`).

Convención de lectura: "PC 1" = ordenador explorador/cerebro; "PC 2" = ordenador de emisión (OBS + relé + LoL de la antena); "puente" = script PowerShell que lee el cliente LoL y lo manda a la web.

---

## 1. ¿Qué datos lee el "puente", con qué frecuencia, qué manda al servidor y cómo los consume el overlay `/ingame/`?

### Takeaway
El puente (`puente/puente-tenka-ichi.ps1`, PowerShell 5.1, versión 4) lee **solo la Live Client Data API local** (`https://127.0.0.1:2999/liveclientdata/{gamestats,playerlist,eventdata}`) **una vez por segundo** y la reenvía tal cual (JSON crudo sin transformar) con `POST /api/partida` a la web (Node en Render); el servidor (`server/partida.js`) construye el marcador y lo difunde por WebSocket (`tipo:'partida'`) al overlay `/ingame/`, que solo pinta. No se usa `allgamedata`, `activeplayer`, ni ninguna API de Riot en la nube para la partida en vivo. Casi todo lo "inteligente" (oro estimado, shutdown, objetivos, peleas) se calcula en el servidor, no en el puente.

### Cited Findings

**Qué endpoints lee y con qué cadencia**
- Cabecera del script: "Lee la partida del cliente de League of Legends (Live Client Data API, https://127.0.0.1:2999) y la manda cada segundo a la web" — `puente/puente-tenka-ichi.ps1:2-3`. Versión del puente = 4 — `puente/puente-tenka-ichi.ps1:11`.
- Lectura local con timeout de 2 s a `https://127.0.0.1:2999{ruta}` — `puente/puente-tenka-ichi.ps1:52-55`.
- Bucle: cada vuelta lee `/liveclientdata/gamestats` (extrae `gameTime`), `/liveclientdata/playerlist` y `/liveclientdata/eventdata?eventID=<último+1>` (solo eventos nuevos) — `puente/puente-tenka-ichi.ps1:177-186`. El ritmo se fija a 1000 ms por vuelta (`$resto = 1000 - transcurrido`) — `puente/puente-tenka-ichi.ps1:251-252`.
- Cliente de certificado: se acepta el certificado autofirmado de Riot solo si el host es `127.0.0.1`; el resto de conexiones se valida normal — `puente/puente-tenka-ichi.ps1:19-34`.
- Si `gameTime` retrocede más de 5 s se asume partida nueva y se piden eventos desde 0 — `puente/puente-tenka-ichi.ps1:179-181`.

**Qué manda y adónde (payload)**
- `POST {Servidor}/api/partida` con cabecera `X-Clave: <contraseña del panel>`, `Content-Type: application/json`, timeout 15 s — `puente/puente-tenka-ichi.ps1:58-61`.
- Forma del cuerpo en partida: `{"version":4[,"continua":true],"juego":<gamestats>,"jugadores":<playerlist>,"eventosData":<respuesta de eventdata>,"desde":<id inicial>}` — `puente/puente-tenka-ichi.ps1:194`.
- Latido sin partida: `{"sinPartida":true,"version":4[,"espera":true]}` — `puente/puente-tenka-ichi.ps1:109-111`; en espera (nadie ha pedido buscar) se manda cada 3 s y **no toca el cliente LoL** — `puente/puente-tenka-ichi.ps1:153-174`; documentado en `README.md:232-233`.
- Respuesta del servidor: `{ok, sesion, tiempo, buscar, ocultarMarcador, reenviar, sinReconocer}` — `server/index.js:1185-1186`. Con `buscar` el puente sabe si seguir; con `reenviar`, si reenviar todos los eventos tras un reinicio de la web — `puente/puente-tenka-ichi.ps1:195-210`; el servidor lo calcula si falta el evento anterior a `desde` — `server/partida.js:114-117`.
- Control de arranque/parada: `estado.buscarPartida.activa` se enciende con el botón del panel o sola al completarse el draft, y se apaga al terminar la partida (`GameEnd`/cliente cerrado) — `README.md:233`, `server/index.js:248-251`, `server/index.js:1177-1182`.
- Robustez: tolera 4 fallos seguidos del cliente antes de dar la partida por terminada — `puente/puente-tenka-ichi.ps1:225-229`; reintenta la web sin cerrarse (mensajes distintos para 401, ≥500, sin red, aviso cada 20 s) — `puente/puente-tenka-ichi.ps1:90-106`; si la web se reinicia (cambia `sesion`) sigue enviando con `continua:true` y se reenvía el historial — `puente/puente-tenka-ichi.ps1:113-125,195-210`; `README.md:234`.
- Sin dependencias: la contraseña va en `clave.txt` junto al script — `puente/puente-tenka-ichi.ps1:37-45`, `puente/LEEME.txt:18-19`.
- Replay API usada por el puente solo para ocultar la barra de marcador nativa: `POST https://127.0.0.1:2999/replay/render {"interfaceScore":false|true}` (requiere `EnableReplayApi=1` en `game.cfg`) — `puente/puente-tenka-ichi.ps1:70-85`, `puente/LEEME.txt:29-39`. El servidor ordena ocultarla con `ocultarMarcador: estado.partidaVisible` — `server/index.js:1185`, `server/index.js:79-80`.
- Herramienta adicional de volcado de `playerlist` (hechizos, runas, objetos con hueco) para diagnóstico: `puente/volcado-jugadores.ps1:33-43`, `puente/LEEME.txt:41-47`.

**Qué hace el servidor con ello (`server/partida.js`)**
- Cabecera del módulo: "La API no da el oro de cada jugador: se estima por sus ingresos" — `server/partida.js:6`.
- Recepción: guarda `tiempo`, `jugadores`, deduplica eventos por `EventID` y por firma (`ChampionKill`, `DragonKill`, `TurretKilled`… repetidos con otro id al saltar en una repetición) — `server/partida.js:82-86,97-133`.
- Latido/estado del puente (`conectado` si hubo noticias en los últimos 10 s; la partida se considera parada tras 20 s sin datos) — `server/partida.js:51-52,606-610`; vigilante cada 3 s en `server/index.js:170-173`.
- Cada paquete recalcula `resumen()`: por jugador campeón, nivel, K/D/A, CS, visión (`wardScore`), objetos (por huecos 0-6, hueco 7 = misión de rol), hechizos de invocador, runa clave, muerto/respawn; por equipo kills, oro, torres, inhibidores, dragones/alma, larvas, heraldos, barones — `server/partida.js:366-395,351-624`.
- Eventos de la Live Client Data que procesa: `TurretKilled`, `InhibKilled`, `InhibRespawned`, `DragonKill`, `BaronKill`, `HeraldKill`, `GameEnd`, `ChampionKill`, `FirstBlood`, `Multikill`, `Ace`, y por patrón larvas/Atakhan — `server/partida.js:420-520`. Eventos no reconocidos se devuelven en `eventosSinReconocer` y salen en el panel — `server/partida.js:518,620`, `README.md:239`.
- Peleas (para el aviso "resumen de pelea"): muertes a ≤12 s de la anterior son la misma pelea; se anuncia con ≥3 muertes y se destaca a quien tenga ≥2 asesinatos — `server/partida.js:42-44,560-570`.
- Temporizadores de objetivos neutrales con reglas fijas de temporada 2026 (primer dragón 300 s, Barón a 1200 s, larvas 360 s, heraldo 900-1185 s, inhibidor 300 s…) — `server/partida.js:29-40,572-604`.
- Gráfica de oro: diferencia azul-rojo muestreada cada 15 s de partida — `server/partida.js:135-145`.
- Avisos: salen por **hora de llegada** al servidor (ventana de 8 s), no por reloj de partida, y no se muestran si el suceso tiene >60 s de antigüedad de partida — `server/partida.js:128,619`.
- Oro (la API no lo da a espectadores): estimado por ingresos (oro inicial 500, pasivo 20,4/10 s desde 1:05, súbditos ≈22 de media, kills/asistencias, torres, Barón, heraldo), siempre ≥ valor de los objetos (`oroObjetos`) — `server/partida.js:255-270,278-283,372-383`; los precios de objeto vienen de Data Dragon (`public/ddragon/objetos.json`) — `server/partida.js:20-22`, `README.md:239`.
- "Shutdown" aproximado (recompensa por matar a cada jugador) con reglas de 26.03 reimplementadas: `estimarRecompensas` — `server/partida.js:238-253,272-349`; `README.md:227`. Se declara aproximada ("el juego no se la da a los espectadores").
- Los eventos de objetivos que no da el cliente a espectadores pueden venir de: marcación manual en el panel (`marcarObjetivo`) — `server/partida.js:63-78`, `server/index.js:593-597`; o del "adelanto" del PC 1 (LiveEvents) — ver pregunta 2.

**Cómo llega al overlay `/ingame/`**
- Broadcast: `emitirPartida()` envía `{tipo:'partida', partida}` por WebSocket `/ws` a todos los clientes no "sueltos" — `server/index.js:161-168`; en conexión inicial también se envía el resumen actual — `server/index.js:1250`.
- Cliente: `conectarDirecto({alPartida})` (WebSocket con reconexión exponencial 1,5→15 s) — `public/comun.js:60-100`; `public/ingame/ingame.js:708-711` guarda `partida` y `recibidaEn` y repinta.
- Reloj local: el overlay extrapola el reloj entre paquetes (máximo 3 s sin paquetes) — `public/ingame/ingame.js:45`; refresca temporizadores/módulos cada 250 ms — `public/ingame/ingame.js:721-726`.
- Avisos con cola y duraciones (aviso 5000 ms, pelea 6500 ms, racha 2300 ms) — `public/ingame/ingame.js:33,208`. Los avisos propios (objetivos) están **apagados por defecto**: se ven los del propio LoL salvo que el panel los encienda — `PROGRESO.md:76`, `public/ingame/ingame.js:208`.
- Módulos que dibuja: marcador (kills, oro, torres, larvas, dragones, diferencia de oro), temporizadores con ensō, buffs/inhibidores, avisos con sello, "línea por línea" (objetos, oro, KDA, CS, nivel, muertes, shutdown ≈, brillo en racha), ficha de jugador, gráfica de oro, cámara del caster, marco de minimapa — `README.md:219-228`. Panel manda `grafico` (`lineas|ficha|oro`) — `server/index.js:571-572`.
- Reservas de pantalla: zona del minimapa `ZONA_MINIMAPA = {x:1620,y:780,w:300,h:300}` — `public/comun.js:136`; hueco de cámara de caster 320×180 en (16,856) — `README.md:228`, `public/comun.js:137`.
- Vista del overlay (`/overlay/`): `draft | postdraft | partida | final | replay`; cambia sola según el estado (`vistaAutomatica`), salvo `replay` que solo la fuerza el panel — `server/vista.js:1-20`.

### Inferences
- El puente es un "tubo tonto": cero lógica de dominio, 1 Hz fijo. La latencia añadida por el puente es ≤1 s de muestreo + RTT al servidor (Render, plan gratuito, que duerme a los 15 min sin uso según `README.md:429`, `render.yaml:5`) + difusión WebSocket; el overlay extrapola hasta 3 s, así que visualmente el reloj es continuo pero los datos de estado (kills, CS) llegan con saltos de ~1 s más la granularidad de la API.
- Como el puente corre en el PC 2 (el de emisión) en el sistema de dos PCs (`realizador/README.md:57`), el marcador queda sincronizado con la antena retrasada: el reloj que lee es el del cliente que está 120 s por detrás (ver preg. 2). Esto es una consecuencia de diseño (el puente lee el cliente local de PC 2), no algo verificado con una medición en el repo.
- No hay transformación ni validación en el puente: cualquier cambio de formato de la Live Client Data API (por ejemplo, nombres de eventos) se manifiesta en el servidor como `eventosSinReconocer`, no como fallo en el puente.

### Gaps
- No hay medición documentada de la latencia extremo a extremo (cliente LoL → overlay) en el repo; solo las constantes.
- `PROGRESO.md:56,67,148` dicen "Falta probarlo con una partida real en modo espectador" para nombres de eventos de larvas/heraldo, `GameEnd` para espectadores y Replay API; entradas posteriores (p. ej. `PROGRESO.md:415-416`, `README.md` realizador `:133`) hablan de pruebas reales sin que se actualice la casilla. El estado real de validación en espectador en vivo no es unívoco.
- No se documenta cuánto retraso tiene de por sí el modo espectador de un cliente LoL (ver `realizador/README.md:208`, casilla sin marcar "Cuánto retraso añade el servidor de espectadores en partidas personalizadas").

---

## 2. ¿Cómo decide el realizador cámara, repeticiones, zoom, peleas, banner REPLAY, etc.? Arquitectura, flujo de datos, parámetros

### Takeaway
Es un sistema de **dos PC con un margen deliberado de 120 s** (`margenSegundos: 120`, `realizador/opciones.json:2`): el PC 1 observa la partida casi en directo, convierte sucesos en "jugadas" (peleas/objetivos/muertes/estructuras) con reglas deterministas y calcula un **guion de planos con antelación**; el PC 2 mantiene su propio cliente LoL (la "antena") 120 s por detrás mediante la **Replay API** (pausa/seek) y mueve la cámara y OBS cuando la antena llega a cada plano. La IA (Claude, opcional) **solo** elige qué gráfico mostrar en huecos tranquilos, qué repetición va si coinciden varias, y redacta titular/resumen; **nunca** controla la cámara. La decisión se apoya exclusivamente en el flujo de sucesos (kills, objetivos, estructuras) y en el reloj: no hay posiciones de campeones ni de equipo.

### Cited Findings

**Procesos y roles**
- PC 1 = "agente": explorador + cerebro + ejecutor + panel de supervisión; PC 2 = "relé": no decide, mantiene la antena 120 s por detrás y mueve cámara/OBS — `realizador/README.md:3-6`; cabecera de `realizador/pc2/rele.js:1-6`; `realizador/pc1/agente.js:1-2`.
- Puertos: panel PC 1 `4600`, panel PC 2 `4601`, relé `4610` — `realizador/opciones.json:15,47,51`.
- Comunicación PC 1 ↔ PC 2: (a) sala WebSocket en el servidor de Gokudō `wss://…/realizador` (el servidor solo reenvía mensajes; la sala se nombra con el sha256 de la contraseña) o (b) HTTP directo en la red local (`/estado`, `/guion`, `/orden`, `/emision`, `/resumen`) — `server/realizador.js:1-12,42-82`, `realizador/comun/sala.js:1-9`, `realizador/pc2/rele.js:720-746`, `realizador/README.md:55-59`. La sala se descubre apuntándola en la web (`salaRealizador`) — `server/index.js:603-611`, `realizador/pc1/agente.js:88-103`.
- OBS lo maneja el relé del PC 2 en local por obs-websocket 5 (cliente propio sin dependencias; eventos de escena y salidas) — `realizador/pc1/obs.js:1-3,53-58`, `realizador/pc2/rele.js:104-110,117-136`; el PC 1 manda las acciones OBS con el guion como lista (`obs: accionesObs`) — `realizador/pc1/ejecutor.js:133-142,221-236`.
- Contraseña: en el relé HTTP se compara la huella (`ficha`) con la cabecera de contraseña de la petición — `realizador/pc2/rele.js:719-723`; en la sala solo circula el sha256 — `realizador/README.md:55`.

**Fuentes de datos del PC 1 (explorador)** — `realizador/pc1/explorador.js`
- Dos fuentes "oficiales del cliente": Live Client Data (jugadores, reloj, sucesos) y **LiveEvents (TCP 34243, solo en espectador)** para dragones, Barón, heraldo y larvas, "que la Live Client Data no da a los espectadores. Riot pudo quitarla en algún parche: si no conecta, se sigue sin ella" — `realizador/pc1/explorador.js:1-6`.
- Sondeo cada `cadaMs: 1000` de `gamestats` (timeout 2 s), `playerlist` (en cada vuelta, para CS) y `eventdata?eventID=` — `realizador/pc1/explorador.js:79-126`, `realizador/opciones.json:6-11`.
- Fin de partida: evento `GameEnd` o `finTrasSegundos: 10` sin datos del cliente — `realizador/pc1/explorador.js:33-35,117-122,136-142`; el reloj retrocede >30 s = partida nueva — `realizador/pc1/explorador.js:83`; protege contra "pantalla final" reutilizando la firma de jugadores — `realizador/pc1/explorador.js:84-91`.
- Reloj "conocido": extrapola con `Date.now()` entre lecturas y se congela a los 3 s sin datos — `realizador/pc1/explorador.js:71-77,130-134`.
- Jungla detectada por posición `JUNGLE` o por llevar Castigo (Smite) en los hechizos, "aunque el juego no dé la posición (pasa en espectador)" — `realizador/pc1/explorador.js:153-171` (en `:160-162`).
- LiveEvents: stream de objetos JSON concatenados sin separador (se cortan contando llaves) — `realizador/pc1/explorador.js:236-260,263-285`; mapea `dragonsoul|dragon|worm|baron|herald|horde|voidgrub|atakhan` — `realizador/pc1/explorador.js:16-23`; se activan en `LiveEvents.ini` los eventos `OnChampionKill, OnKillDragon_Spectator, OnKillRiftHerald_Spectator, OnKillWorm_Spectator, OnDragonSoulGiven, OnTurretPlateDestroyed` — `realizador/instalar/configurar-lol.js:16-19,97-109`.
- Deduplicación de la misma fuente por dos canales: clave `nombre@round(t/3)` — `realizador/pc1/explorador.js:212-219`.
- Instalación: `EnableReplayApi=1` en `[General]` de `game.cfg` y `PersistedSettings.json` (respetando solo-lectura); `[LiveEvents] Enable=1 Port=34243` en PC 1 — `realizador/instalar/configurar-lol.js:1-33,78-109`.

**Cerebro: sucesos → jugadas → guion** — `realizador/pc1/cerebro.js` (sin red; "se prueba solo")
- Tipos de jugada: `pelea`, `objetivo`, `muerte`, `estructura`. Una muerte nueva abre una `muerte`; si hay ≥2 muertes **o** ≥3 campeones implicados pasa a `pelea` — `cerebro.js:134-146`. Un objetivo dentro de una jugada abierta la fusiona (muerte→pelea) — `cerebro.js:165-173`. Una torre/inhibidor se une a una pelea/objetivo abierta o crea `estructura`; "solo hay plano si la tira un campeón" — `cerebro.js:182-190`.
- Ventana de agrupación: una jugada está abierta si el evento cae a ≤`ventanaPelea` (12 s) de su último suceso — `cerebro.js:90-97`, `opciones.json:74`. README doc dice "menos de 12 s" — `realizador/README.md:85`.
- Anticipación (aprovecha el margen): `anticipacion` 7 s (muerte/estructura), `anticipacionPelea` 12 s, `anticipacionObjetivo` 10 s; `cola` 3 s tras el último suceso — `cerebro.js:99-116,149`, `opciones.json:69,70,72,73`. **Deriva de documentación**: el README dice 5 s y 10 s (`realizador/README.md:87`) y 6 s para "algo más importante" (`:88`, el código usa `planoMinimo: 8`, `opciones.json:75`).
- Prioridad: `pelea 5 > objetivo 4 > muerte 3 > estructura 2` (+0,5 si hay `BaronKill`, +0,05 por muerte hasta 5) — `cerebro.js:255-258`, `opciones.json:79-84`.
- Selección de cámara: `quedarseConLaPrimera: true`: se queda con la jugada que empezó antes hasta que acaba (no salta entre dos simultáneas); una `estructura` cede ante muerte/pelea; con "inminente" de mayor prioridad en <`planoMinimo` s se va ya a esa — `cerebro.js:409-450`.
- Foco/seguido: a quien hace la primera muerte (o a la víctima si no hay asesino); si cae el seguido, pasa al implicado vivo con más participación; no se cambia de seguido más a menudo que `focoMinimo: 6` s — `cerebro.js:134-143,150-156,451-467`, `opciones.json:78`.
- Inicio de partida guionizado (`reglas.inicio`): tramos 0-90 s bot (azul primero), 90-170 junglas cada 20 s, 170-200 bot, 200-245 junglas cada 10 s, 245-300 junglas cada 20 s — `cerebro.js:333-363`, `opciones.json:107-116`.
- "Calmas": pasados 300 s, en vez de plano general, rotación jungla 25 s / línea 15 s (TOP, MIDDLE, BOTTOM), mínimo 12 s de hueco — `cerebro.js:369-407`, `opciones.json:117`.
- Sin datos de jugadores: plano general — `cerebro.js:373,339`.
- Zoom por tamaño de pelea: `zoomPelea {muchos:6, pocos:2}`: ≥6 campeones implicados → zoom `general` (sin soltar al seguido); ≤2 y no objetivo → `cerca`; si no `abierto` — `cerebro.js:275-283`, `opciones.json:71`. Zoom in "cerca" tras muerte/objetivo con calma de 10 s después, 4 s sobre el autor, retraso 0,5 s; solo si la jugada está en antena y plano tipo `seguir`; mínimo 1,5 s — `cerebro.js:287-327`, `opciones.json:118-123`.
- Todo se recalcula: `planificar(desde, conocidoHasta)` y el zoom in nunca se decide sin haber visto la calma posterior ("conocidoHasta") — `cerebro.js:266-270,287-303`.
- Congelado: lo que está a `congelarSegundos` (3 s) de la antena no se rehace — `realizador/pc1/ejecutor.js:121-127`, `opciones.json:76` (`congelarSegundos: 3`).

**Repeticiones, REPLAY banner, overlay de Gokudō**
- Candidatas a repetición: pelea con ≥`minimoMuertes` 3, objetivos `BaronKill`/`Ace`, multikill ≥3; además "sueltas" (muertes solas) si `sueltas.activo`, con más calma (25 s) y separación de 90 s entre repeticiones — `cerebro.js:157-159,192-201,501-528`, `opciones.json:85-94`.
- Regla del Barón: no se repite el Barón sino la pelea previa, y solo si hubo `Ace` (si no, `baron-sin-ace`) — `cerebro.js:503-510`.
- Se programa la repetición solo si, tras la jugada, hay `calmaNecesaria` (15 s; `max` con la duración 12 s) sin jugadas de prioridad ≥ objetivo ni otras acciones, buscando en pasos de 2 s hasta 60 s después — `cerebro.js:511-528`. Solo se decide con lo "conocido" (el PC 1 ve el futuro respecto a la antena) — `cerebro.js:518`.
- Acción de repetición: guardar el clip (búfer OBS + clip limpio con ffmpeg) en `fin+1` y lanzarla; la repetición muestra los últimos `segundos: 12` s de la jugada con `colchon: 1,5` s de antelación — `realizador/pc1/ejecutor.js:221-236`, `realizador/pc1/obs.js:176-180`, `opciones.json:88-89`.
- Ejecución de la repetición (OBS): fuente "Overlay REPLAY" (cartel) visible → transición stinger "Repeticion entrada" → clip en la fuente multimedia "Repeticion clip" en su cursor → al cabo de `segundos` transición "Repeticion salida" a "Juego" → overlay REPLAY oculto 2 s después — `realizador/pc1/obs.js:100-166,137-146`, `realizador/pc2/rele.js:302-315`. Si la repetición llega >10 s tarde, se salta — `realizador/pc2/rele.js:284`, `realizador/pc1/ejecutor.js:161`.
- Banner REPLAY: dos implementaciones. (1) Fuente de navegador OBS `realizador/obs/replay.html` (cartel de neón, animación "REPLAY rebobinado", `?retraso=0.80` para esperar al stinger) — `realizador/obs/replay.html:1-15`; (2) vista `replay` del overlay web (`server/vista.js:6,10`, `public/overlay/replay.js:1-43`), que solo la fuerza el panel. Stingers `repeticion-entrada/salida.webm` (1 s, OBS cambia de escena a los 400 ms) — `realizador/README.md:105`.
- Clips: búfer de OBS (60 s) con el marcador dentro + **grabador ffmpeg** independiente del LoL del PC 2 (captura `ddagrab` de un monitor, 60 fps, 15 Mbps, trozos de 2 s, guarda 120 s, clip 60 s; codificadores `h264_amf → h264_nvenc → h264_qsv → libx264`) para repeticiones "limpias" — `realizador/pc2/grabador.js:1-40`, `realizador/opciones.json:4`, `realizador/README.md:125`.
- Overlay de Gokudō desde el PC 1: base siempre `lineas`; "ficha" de jugador en racha (rachas 3, 5, 8; 10 s; retraso 3 s; busca hueco 45 s; máx 1 por jugador/120 s) y "gráfica de oro" (desde 480 s, calma 35 s, 15 s, máx 1/180 s) — `cerebro.js:535-588`, `opciones.json:124-142`, `realizador/pc1/ejecutor.js:175-206` (acción `grafico` al panel por WebSocket).
- Rachas: se cuentan por campeón (suma kills, se pone a 0 al morir) — `cerebro.js:69-78`.

**El margen de 120 s: cómo lo mantiene el relé (PC 2)** — `realizador/pc2/rele.js`
- La antena es el cliente LoL del PC 2 espectando la misma partida, controlado por Replay API local (`/replay/playback`, `/replay/render`, `/replay/sequence`) — `rele.js:82,320-321,364`, `opciones.json:16`.
- Objetivo de antena: el segundo que veía el PC 1 hace `margenSegundos` de reloj (`segundoHace(historial, ahora-120 s)`); sin historial, `playback.length - 120` — `rele.js:55-69,538-544`.
- Control: si `meta<0` → pausa hasta tener el margen; si pausado y `meta≥0` → `playback {paused:false,time:meta,speed:1}`; si `|time-meta| > toleranciaSegundos (4)` y han pasado >3 s desde el último salto → seek a `meta`; si velocidad≠1 → la normaliza — `rele.js:561-580`, `opciones.json:18`.
- Cámara: sigue un jugador con `cameraMode:'fps'`, `cameraAttached:true`, `selectionName` (por jugador por defecto), `selectionOffset` y `fieldOfView`; el plano general suelta la cámara (`cameraMode:'top'`) o, con `generalSigueAlUltimo`, sigue al último seguido con zoom más abierto — `rele.js:338-347,485-533`, `opciones.json:19,21-22`.
- Zoom: niveles `general` (fov 57, dist 1,1), `abierto` (51, 0,95), `cerca` (42, 0,8) — `opciones.json:24-27`. Transición suave: secuencia nativa de la Replay API (`/replay/sequence`, `smoothStep`, ~2 s) o, si no hay (pausa/aceleración/API), órdenes escalonadas 60/s — `rele.js:355-451`. Al cambiar de jugador: corte directo (`abrirAlCambiar:false`) — `rele.js:499-531`, `opciones.json:34-35`. **Deriva de documentación**: `realizador/README.md:137` cita niveles "54°/1,1, 48°/0,95, 42°/0,8" frente a los 57/51/42 del JSON.
- Interfaz del LoL de la antena: se oculta marcos de campeones, timeline, controles, recuadro del seguido y anuncios del centro (`interfaceFrames/Timeline/Replay/Target/Announce = false`), reenviado cada 5 s — `rele.js:30-43,582-587`, `opciones.json:20`; minimapa al 26 % (`MinimapScale 0.78` en `[HUD]`) — `opciones.json:3`, `realizador/instalar/configurar-lol.js:95-100`.
- Bordes del mapa (ajuste de cámara cerca de bordes, estima la posición del seguido restando el offset a `cameraPosition` de `/replay/render`): **desactivado** (`activo:false`) tras provocar "tirones" — `realizador/pc2/bordes.js:69-73`, `opciones.json:37-43`, `realizador/README.md:133`. Es el **único** punto del realizador que toca una "posición" (la del seguido, indirecta).
- Modo degradado: sin mensajes del PC 1 en `degradadoTrasSegundos: 15` s, suelta/plano general (`aplicar(null)`) y no hace nada más hasta que vuelva — `rele.js:590-598`, `opciones.json:23`.
- Modo manual: "Tomar el control" en el panel PC 1 o en el panel web (secciones "Realizador"); el cerebro sigue planificando pero no manda nada — `realizador/pc1/ejecutor.js:313-325`, `realizador/pc2/rele.js:712-717`, `public/panel/realizador.js:148-152`, `realizador/README.md:78`.

**Emisión, escenas y resumen en vídeo (PC 2)**
- Escenas OBS: `Juego, Repeticion, Casters, Pausa, Draft, Resumen`; botón "Empezar directo" arma; `previaSegundos` 10 s antes del segundo 0 pone `Pausa` y arranca OBS; al segundo 0 → `Juego`; al fin (+`segundosTrasFin` 5) → `Casters`; draft detectado vía el estado del panel (`vistaOverlay`) → `Draft` — `realizador/pc2/emision.js:1-26`, `realizador/README.md:61-74`, `realizador/pc2/rele.js:45-50`, `opciones.json:54-62,145-170`.
- Búfer de repetición vigilado y rearrancado si se para — `realizador/pc2/emision.js:122-139`, `realizador/README.md:131`.
- Multi-destino (Kick principal + Twitch con plugin Multiple RTMP) — `realizador/README.md:139-141`.
- Resumen en vídeo al terminar la partida: candidatas = pelea ≥2 muertes, objetivo grande, ace, multikill ≥2, muerte que corta una racha ≥3, o repetición programada; recorte `inicio−3` a `fin+2` (máx 20 s); la jugada final siempre entra; lista de la IA (`destacadas`) o todas las candidatas; sale tras `esperaSegundos` 120 en `Casters` — `cerebro.js:203-253`, `realizador/pc2/resumen.js:1-41`, `opciones.json:64-66,95-106`, `realizador/README.md:149-185`. Estado: "**Sin probar todavía** con OBS de verdad… ni una partida real" — `realizador/README.md:177`.
- Modos auxiliares: captura de datos (`herramientas/capturar.js`: `allgamedata`, `activeplayer`, `swagger/openapi`, `/replay/game|playback|render|recording|sequence`, escribe jsonl) — `realizador/herramientas/capturar.js:1-38`; partida grabada de un solo PC (explora la repetición a x8 y luego realiza con el guion completo) — `realizador/pc1/grabada.js:1-10`, `opciones.json:202-206`.

**Modo IA (opcional, solo PC 1)**
- Claude (SDK oficial, `@anthropic-ai/sdk`) con salida JSON estructurada, `effort: low` por defecto, modelo `claude-sonnet-5-5` (rápido `claude-haiku-5-5`), timeout 20 s, 1 reintento — `realizador/pc1/ia.js:19,265,275-283`, `realizador/package.json:27-29`, `opciones.json:208-220`.
- Cada 25 s manda un resumen de la partida (marcador en antena vs real, rachas, jugadas aún no emitidas, huecos tranquilos, overlay reciente y programado) y recibe `oro|ficha|lineas` + titular; elige repetición si varias jugadas acaban en 30 s; escribe resumen final y `destacadas` — `realizador/pc1/ia.js:2-8,144-171,188-221`. Si no contesta/falla, reglas; tras 3 fallos descansa 2 min — `realizador/README.md:242`; clave leída de `Documentos\realizado` o `clave-ia.txt`, nunca sale del PC 1 — `realizador/pc1/ia.js:10-11,38-47`.
- Principio explícito: la cámara, cortes, repeticiones y transiciones **son reglas**; la IA no las toca — `realizador/pc1/ia.js:1-8,190`.

**"Adelanto" hacia la web (PC 1 → marcador del PC 2)**
- Como el marcador sale del puente del PC 2 (retrasado) y la Live Client Data a espectadores no da dragón/heraldo/Barón y da el CS "de 10 en 10", el PC 1 manda a la web (`tenka.accion('adelanto', …)`, cada 5 s y en cada objetivo) los saltos de CS `[gameTime, CS]` por jugador y los objetivos con minuto y elemento de dragón; la web reparte el CS al ritmo real entre saltos y saca los objetivos cuando la emisión llega a ese minuto — `realizador/pc1/adelanto.js:1-4,57-67`, `realizador/pc1/agente.js:157-166`, `server/adelanto.js:1-14,25-49,58-70,76-79`, `server/partida.js:363-365,405-412`, `PROGRESO.md:415-421`. Vigencia 10 min, y solo si coinciden ≥ mitad de nombres — `server/adelanto.js:14,52-56`.

### Diagrama de flujo de datos (ASCII)

```
                    ┌───────────────────────────── ESPECTADOR EN VIVO (partida real) ─────────────────────────────┐
                    │                                                                                             │
        PC 1 (explorador, "casi en directo")                                         PC 2 (emisión, 120 s por detrás)
 ┌────────────────────────────────────────────┐                      ┌────────────────────────────────────────────────────┐
 │ Cliente LoL (espectador)                   │                      │ Cliente LoL (antena) — misma partida               │
 │  · Live Client Data :2999 (HTTPS 1 Hz)     │                      │  · Replay API :2999 /replay/playback|render|sequence│
 │    gamestats / playerlist / eventdata      │                      │    ↑ pausa, seek a (reloj PC1 − 120 s), cámara,    │
 │  · LiveEvents TCP :34243 (dragón/Barón/…)  │                      │      fov, offset, interfaz oculta  (rele.js)       │
 └───────────────┬────────────────────────────┘                      │  · Live Client Data :2999 (lo que SE EMITE)        │
                 │ explorador.js (1 s)                               │       ▲                                            │
                 ▼                                                   │       │ lee cada 1 s                               │
 ┌────────────────────────────────────────────┐   guion (planos,     │ ┌─────┴─────────────┐   POST /api/partida          │
 │ cerebro.js: sucesos → jugadas → planos     │   acciones OBS,      │ │ puente (PowerShell)│────────────────────────┐    │
 │  (prioridad, foco, zoom, calmas, repeticio-│   tFin, resumen) ──► │ └───────────────────┘                         │    │
 │  nes, ficha, gráfica oro, resumen vídeo)   │   (WS sala o HTTP)   │  rele.js: aplica plano al llegar tAntena       │    │
 │  [opcional: ia.js → Claude (JSON)]         │ ◄── estado antena ───│  hacerObs(): guardar clip / lanzar repetición  │    │
 │ ejecutor.js: planifica cada 0,5 s          │      (cada 1 s)      │  emision.js: escenas Draft/Pausa/Juego/Casters │    │
 └──────┬─────────────────────┬───────────────┘                      │  grabador.js (ffmpeg) + búfer OBS → clips      │    │
        │ grafico (lineas/    │ adelanto (CS,                        │  resumen.js: escena Resumen al acabar          │    │
        │ ficha/oro) WS /ws   │ objetivos+minuto) WS /ws             └───────────┬─────────────────────────────────────┘    │
        ▼                     ▼                                                  │ obs-websocket 5 (local)                  │
 ┌──────────────────────────────────────────────────────────────┐               ▼                                          │
 │ WEB TENKA ICHI / Gokudō (Node en Render)                     │◄──────────────────────────────────────────────────────────┘
 │  server/index.js  /api/partida  /ws  /realizador (sala)      │               OBS: Juego (captura LoL + overlay web
 │  server/partida.js: resumen(): marcador, oro estimado,       │               /overlay/ + /ingame/), Repeticion, Casters,
 │   objetivos, peleas, shutdown ≈ ; adelanto.js: CS+objetivos  │               Pausa, Draft, Resumen ──► RTMP (Kick/Twitch)
 │  vista.js: draft|postdraft|partida|final|replay              │
 └───────────────┬───────────────────────────────────────────────┘
                 │ WebSocket {tipo:'partida'|'estado'} (1 Hz)
                 ▼
        /ingame/ y /overlay/ (navegador en OBS, 1920×1080 transparente)

 Paralelo: DraftCore (Socket.IO no oficial) ──► server/draftcore.js ──► estado.draft ──► /overlay/ (vista draft/postdraft)
           Panel humano (/panel/): botones "Buscar la partida", forzar vista, línea por línea, marcar objetivos a mano
```

### Parámetros y heurísticas configurables (resumen; todos en `realizador/opciones.json` salvo indicación)
| Parámetro | Valor por defecto | Línea |
|---|---|---|
| `margenSegundos` (retraso de antena) | 120 | 2 |
| `explorador.cadaMs` / `finTrasSegundos` / `liveEventsPuerto` | 1000 / 10 / 34243 | 7-10 |
| `rele.cadaMs` (bucle del relé) / `toleranciaSegundos` / `degradadoTrasSegundos` | 250 / 4 / 15 | 17-18, 23 |
| `rele.seleccionarPor` | `jugador` (alternativa `campeon`) | 19 |
| `rele.desplazamientoCamara` | x0, y1911,85, z−1200 | 22 |
| `rele.zoom.general/abierto/cerca` | fov 57/51/42; distancia 1,1/0,95/0,8 | 25-27 |
| `rele.zoom.modo`, `transicionSegundos`, `pasosPorSegundo`, `abrirAlCambiar`, `zoomEnLosCortes` | secuencia, 2, 60, false, true | 28-35 |
| `rele.bordes.activo` | false | 38 |
| `reglas.anticipacion/anticipacionPelea/anticipacionObjetivo/cola` | 7 / 12 / 10 / 3 s | 69-73 |
| `reglas.zoomPelea` (muchos/pocos) | 6 / 2 | 71 |
| `reglas.ventanaPelea` / `planoMinimo` / `congelarSegundos` / `focoMinimo` | 12 / 8 / 3 / 6 s | 74-78 |
| `reglas.quedarseConLaPrimera` | true | 77 |
| `reglas.prioridades` | pelea 5, objetivo 4, muerte 3, estructura 2 | 79-84 |
| `reglas.repeticion` (minimoMuertes, objetivos, segundos, colchon, calmaNecesaria, grupoSegundos, esperaIaSegundos, sueltas) | 3, [BaronKill,Ace], 12, 1,5, 15, 30, 15, {activo, 25, 90} | 85-94 |
| `reglas.resumen` | minimoMuertes 2, multikill 2, rachaCortada 3, antes 3, despues 2, maximoClip 20, finalSegundos 30, nexoSegundos 12 | 95-106 |
| `reglas.inicio.tramos` | 5 tramos (bot/junglas) hasta 300 s | 107-116 |
| `reglas.calma` | desde 300 s; mínimo 12; jungla 25; línea 15 | 117 |
| `reglas.cerca` | calma 10 s; 4 s; retraso 0,5 | 118-123 |
| `reglas.overlay.oro/ficha` | oro desde 480 s, calma 35, 15 s, cada 180; ficha rachas [3,5,8], 10 s, retraso 3, buscar 45, cada 120 | 124-142 |
| `emision` (modo, previaSegundos, segundosTrasFin, sinJuegoSegundos, pararAlAcabar…) | emitir, 10, 5, 8, false | 54-62 |
| `resumen.esperaSegundos` | 120 | 64-66 |
| `obs.segundosBufer`, `codificador`, `bitrateEmision`, `minimapa` | 60, auto, 6000, {x1640,y804,lado250} | 163-166, 168 |
| `clips` (fps, bitrate kbps, guardarSegundos, clipSegundos) | 60, 15000, 120, 60 | 4 |
| `ia` (modelo, esfuerzo, cadaSegundos, repreguntarSegundos, tiempoSegundos) | claude-sonnet-5-5, low, 25, 180, 20 | 208-220 |
| `perfilMinimo` (ventana 640×360, calidad 0, sin sonido) para PC 1 | — | 182-200 |
| Servidor: `REGLAS` de objetivos, `REGLAS_PELEA`, `RECOMPENSAS`, `INGRESOS`, `SIN_DATOS_MS`, `GRACIA_PARTIDA_MS` | ver `server/partida.js` | `server/partida.js:31-52,242-270` |

### Inferences
- El "realizador" es un **director de eventos de kills/objetivos**, no de visión de juego: detecta peleas solo después de ver una muerte (`cerebro.js:134-146`); el único modo en que "anticipa" una pelea es porque el PC 1 va 120 s por delante y la cámara llega 12 s antes del primer kill. No puede cubrir escaramuzas sin muerte, rotaciones previas a un objetivo, ni "set-ups" (no hay posiciones ni cooldowns).
- Parte de las prioridades (baja de estructura, prioridad al Barón) son heurísticas de "mesa de realización"; no hay scoring continuo/probabilístico sino umbrales y ventanas fijas.
- El diseño de margen fijo convierte el problema de "predecir" en "leer el futuro": todo lo que decide la cámara es determinista sobre datos ya sucedidos. La contrapartida es obligar a dos clientes espectando y 2 minutos de retraso editorial.
- Aunque la documentación del realizador describe la regla "La cámara llega 5 s antes…" (`realizador/README.md:87`), el comportamiento real es 7/10/12 s según `opciones.json`; la fuente de verdad es el JSON (y el comentario de `cerebro.js:147-149` "14/11: llegaba justo").

### Gaps
- Casillas "Por comprobar en la primera prueba real (fase 0)" sin marcar (Replay API en espectador en vivo y `playback.length` creciente, `selectionName`, LiveEvents vigente, que el explorador lea con la ventana minimizada, perfil mínimo, zoom, retraso del espectador) — `realizador/README.md:197-208`; contradicho en parte por comentarios del código sobre pruebas reales ("Probado el 09/11 en un LoL real", `rele.js:358-359`; "3.ª prueba real", `realizador/README.md:133`). Estado de validación real no unívoco.
- Resumen en vídeo: sin probar con OBS real ni partida real — `realizador/README.md:177`.
- La carpeta `realizador/` de este repo no incluye `test/` ni `simulador/` (los excluye `scripts/traer-realizador.js:16`), aunque `package.json` y README los citan (`realizador/package.json:20-22`, `realizador/README.md:12-15,230-231`): las pruebas del realizador no son auditables aquí. El repo web sí tiene `test/realizador.test.js`, `test/sala-realizador.test.js`, `test/adelanto.test.js`, `test/ingame.test.js`, etc.
- No hay ninguna métrica de calidad del guion (cobertura de eventos, tiempo en plano muerto) ni evaluación de la IA; el registro es por buzón de jugadas y `_registro/registro.jsonl` — `realizador/README.md:193-195`.
- Pendientes declarados del resumen: archivo de vídeo por partida, interruptor de webcams de casters, mensaje `resumenPartida` para newsletter, placa definitiva — `realizador/README.md:179-185`.

---

## 3. ¿Qué APIs de Riot/terceros y técnicas se usan? (Live Client Data, Replay API, spectator, OCR, DraftCore, Data Dragon, etc.)

### Takeaway
En el flujo en vivo solo se usan **APIs locales del cliente de LoL** (Live Client Data `:2999`, Replay API `:2999/replay/*`, y el flujo **LiveEvents** TCP `:34243`), más **obs-websocket** y **ffmpeg** para la emisión/clips. **No se usa** ninguna API de Riot en la nube para la partida en vivo (ni Spectator-V4, ni Match-V5), **ni OCR ni visión por computador**. Para el draft se usa **DraftCore** mediante un cliente Socket.IO no oficial; para activos, **Data Dragon**; para valoración de jugadores, Riot Account/League v4 (opcional) y WhatIsMyMMR; y se scrapean KB Stats para estadísticas de liga.

### Cited Findings
- **Live Client Data API local** (`/liveclientdata/gamestats|playerlist|eventdata`): puente y explorador — `puente/puente-tenka-ichi.ps1:177-186`, `realizador/pc1/explorador.js:79-126`. Herramienta de captura también pide `allgamedata`, `activeplayer` y el `swagger/v3/openapi.json` y `swagger/v2/swagger.json` del cliente — `realizador/herramientas/capturar.js:24-38` (para descubrir qué da el juego; no se usa en producción).
- **Replay API del cliente** (`/replay/playback` con `paused/time/speed`, `/replay/render` con `cameraMode, cameraAttached, selectionName, selectionOffset, fieldOfView, interface*`, `/replay/sequence` con marcas `smoothStep`): relé — `realizador/pc2/rele.js:320-321,364,391-393,546-580`; puente (solo `interfaceScore`) — `puente/puente-tenka-ichi.ps1:70-85`. Activación requiere editar `game.cfg`/`PersistedSettings.json` (`EnableReplayApi=1`) — `realizador/instalar/configurar-lol.js:78-109`, `puente/LEEME.txt:29-39`.
- **LiveEvents** (TCP 34243, solo espectador) para objetivos épicos — `realizador/pc1/explorador.js:1-6,222-260`, `realizador/instalar/configurar-lol.js:16-19`. Documentación propia sobre su vigencia: "hay quien dice que Riot la quitó en el parche 14.1. Sin ella no hay dragones ni Barón" — `realizador/README.md:204`.
- **No hay uso de la API Spectator ni de Match-V5**: la búsqueda en el código de los términos `spectator-v`, `match-v5`, `RGAPI`, `OCR`, `tesseract` no arroja usos (solo `RIOT_API_KEY` en valoración). La partida se "encuentra" porque el usuario abre el espectador en el cliente local (mensaje del puente "entra a mirarla como espectador") — `puente/puente-tenka-ichi.ps1:244`; el cliente espectador carga la partida desde el sistema de espectador de Riot, pero el proyecto no interactúa con él directamente.
- **Data Dragon (`ddragon.leagueoflegends.com`)**: `npm run ddragon` descarga campeones (es_ES), iconos, splash, objetos y hechizos a `public/ddragon/…` — `scripts/ddragon.js:9,29-58`, `scripts/ddragon-sums.js:10`, `scripts/ddragon-definitivas.js:14`; los precios de objeto alimentan el oro por objetos — `server/partida.js:18-22`.
- **DraftCore (`lol.draftcore.net`)**: cliente Socket.IO de solo lectura contra `https://ws.lol.draftcore.net`, `V3-joinDraft {draftId,url}`, `auth:{clientVersion}` leída del bundle JS de su web, cabecera `Origin` fijada a su web; formato `ban1..ban10, b1..b5, r1..r5, turn, hovered`, eventos `timerTick`, `updateHover` — `server/draftcore.js:1-10,12-18,77-87,105-130,150-165`, `README.md:158-163`. Fallo de versión/limitación ("Handshake throttled") y fallback manual — `server/draftcore.js:131-147`, `PROGRESO.md:246-250`. El realizador además usa DraftCore indirectamente: el PC 2 mira `vistaOverlay`/`fuente.conectado` del panel para poner la escena Draft — `realizador/pc2/rele.js:45-50`; los enlaces de DraftCore se crean por adelantado desde la web — `realizador/README.md:191`.
- **obs-websocket 5** (WebSocket de Node 22, sin dependencias) para escenas, búfer de repetición (`SaveReplayBuffer`, `GetLastReplayBufferReplay`), fuente multimedia (`SetMediaInputCursor`), cámara virtual y capturas — `realizador/pc1/obs.js:1-3,100-171`.
- **ffmpeg** (`ddagrab`, AMF/NVENC/QSV/x264) para grabar el monitor del LoL en trozos y generar clips limpios — `realizador/pc2/grabador.js:1-40`; el instalador baja ffmpeg 9.0.2 "essentials" con huella SHA-256 — `realizador/README.md:125`.
- **Anthropic API** (Claude Sonnet 5.5 / Haiku 5.5) para el modo IA del realizador y para otras funciones de la web (tickets de Discord: no auditado aquí) — `realizador/pc1/ia.js:19,265-283`, `README.md:368-435` (sección tickets).
- **Riot API en la nube (solo valoración de jugadores, opcional)**: `account/v1/accounts/by-riot-id` y `league/v4/entries/by-puuid` con `RIOT_API_KEY`; y WhatIsMyMMR (`euw.whatismymmr.com/api/v1/summoner`) con User-Agent propio y tope de 60 consultas/min; el repo declara que se evita calcular MMR propio por las normas de Riot y muestra el aviso "no respaldado por Riot Games" — `server/valoracion.js:47,61,64`, `README.md:501-521`.
- **Scraping**: KB Stats (liga KB) leído por HTML, refresco cada 6 h — `server/kbstats.js:1-26`, `README.md:394`. Google Sheets como base de datos de la web — `README.md:93-105`.
- **OCR / visión**: ninguno. Las posiciones/estados que no da la API simplemente no se muestran (ver preg. 4). Una mención al LCU `lol-end-of-game` para el daño aparece solo como idea pendiente — `PROGRESO.md:85,105`.
- **Técnica de retraso**: no se usa un servicio de "observer delay" propio; se usa el reproductor del cliente (pausa + seek vía Replay API) sobre la misma partida espectada — `realizador/pc2/rele.js:561-580`.

### Inferences
- Todo el pipeline depende de que el cliente LoL del espectador exponga localmente Live Client Data + Replay API (requiere ajustar `game.cfg`) y LiveEvents; ninguna parte sale a servidores de Riot salvo la valoración opcional. Es el mismo conjunto "client-side" que usan herramientas tipo overlays de espectador, pero aquí combinado con control de cámara por Replay API.
- La dependencia de LiveEvents para objetivos se compensa con un mecanismo de respaldo humano (marcado manual) más el "adelanto" automático; si LiveEvents desapareciera, el realizador perdería objetivos (dragón/Barón) en el guion, pero seguiría con kills, torres e inhibidores de la Live Client Data (`realizador/README.md:204`, `server/partida.js:63-78`).

### Gaps
- No se documenta ninguna revisión de los Términos de Servicio de Riot / política de la API para la lectura del cliente espectador, la edición de `game.cfg`/`PersistedSettings.json`, ni para la captura de pantalla con ffmpeg; la única mención de normas de Riot es sobre MMR (`README.md:511`). No verificable desde el repo.
- No se documenta uso de la API Riot oficial de espectador/live data en la nube; no se evaluó como alternativa.

---

## 4. Huecos y riesgos concretos visibles en el código (latencia/sincronización, failover, ToS, datos ausentes como posiciones y cooldowns)

### Takeaway
Los puntos débiles principales son: (1) **datos no disponibles para espectadores** (oro real, cooldowns, vida, posiciones, objetivos épicos fuera de LiveEvents, CS con granularidad 10) obligan a estimaciones y a canales alternativos; (2) **dependencia de varios elementos frágiles** (LiveEvents, Replay API, DraftCore no oficial, Render gratuito que duerme, PowerShell + certificados locales, edición de ficheros de configuración del juego); (3) **sincronización con tolerancia de 4 s** entre dos clientes y sin medición de retardo; (4) **sin failover automático** del PC 1 (si cae, el relé pasa a plano general a los 15 s); (5) **validación real incompleta**; (6) sin ToS/legal documentado para varias técnicas.

### Cited Findings

**Datos que faltan (confirmados por la propia documentación/código)**
- Oro no disponible en la API para espectadores: se estima por ingresos y objetos — `server/partida.js:6,255-270`, `README.md:239`.
- Shutdown (recompensa) tampoco: aproximación con reglas de 26.03, supuestos de 22 de oro por súbdito y nivel/CS repartidos linealmente en el tiempo — `server/partida.js:238-253,272-282,45-47`, `README.md:227`.
- CS actualizado de 10 en 10 (granularidad de la API) → parcheado repartiendo según saltos del PC 1 — `PROGRESO.md:415-418`, `server/adelanto.js:58-70`.
- Dragón/heraldo/Barón no los da el cliente a espectadores — `PROGRESO.md:76`, `server/partida.js:64-65`, `server/adelanto.js:11`, `realizador/pc1/explorador.js:3-6`; fallback manual y LiveEvents.
- "No se puede (la API no lo da a los espectadores): enfriamientos de los sums, anillo de la ult y barras de vida" — `PROGRESO.md:335`.
- Daño de campeones/torres no disponible en la Live Client Data: se apunta a mano o con idea pendiente de LCU — `PROGRESO.md:85,102,105`.
- Posiciones de campeones/unidades: **no se consumen en ninguna parte** del cerebro. Única "posición" indirecta: la del seguido a partir de `cameraPosition` de `/replay/render` (`realizador/pc2/bordes.js:69-73`), desactivada (`opciones.json:38`).
- Posición de línea (`position`) puede venir vacía en espectador: se infiere jungla por Castigo — `realizador/pc1/explorador.js:160-162`, `realizador/pc1/cerebro.js:331`; los puestos de la web se emparejan por nombre de plantilla, campeón del draft, posición o Aplastar — `README.md:227`.
- Misión de rol (hueco 7, TP desatado/Aplastar mejorado): "sin confirmar con una partida real" — `PROGRESO.md:334`, `server/partida.js:167-169,197-200`.
- Historia incompleta si se entra a mirar con la partida empezada: kills/objetivos previos no se ven y se marcan `historiaIncompleta` con campos fantasy en `null` — `server/partida.js:537-550`.

**Latencia / sincronización**
- Tolerancia de desvío de antena 4 s y correcciones como mucho cada 3 s; el relé corrige solo cuando `pb.seeking` es falso — `realizador/pc2/rele.js:574-577`, `opciones.json:18`. La meta es el reloj del PC 1 menos 120 s de **reloj de pared**, calculado con historial de muestras recibidas por red (latencia de la sala incluida en esas muestras) — `rele.js:55-69,538-544,693-699`.
- El PC 1 solo "ve el futuro" en la medida en que su cliente espectador va por delante del de PC 2; si ambos clientes tuvieran retraso distinto de espectador, el margen real se desviaría (el panel muestra `margenReal = tDirecto − tAntena`) — `realizador/pc1/agente.js:229`.
- Cadena puente→web→overlay: 1 s de muestreo + HTTP a Render (plan gratuito, hibernación a 15 min; el puente avisa "si estaba dormida tarda un minuto en despertar") — `puente/puente-tenka-ichi.ps1:104`, `README.md:429`, `render.yaml:5`; eventos usan la hora de llegada (no la del juego) para los avisos — `server/partida.js:128,619`.
- Mensajes entre PCs vía servidor en Render: la sala reenvía JSON; si Render se reinicia, ambos PC reintentan (`Sala` empieza con una espera de 2 s, `esperaMs = 2000`) — `realizador/comun/sala.js:21,29-31`, `server/realizador.js:85-93` (ping cada 25 s para mantener conexiones).
- Prevención de retraso por falta de contacto: ejecutor descarta acciones que "llegan tarde" (>10 s) en lugar de ejecutarlas — `realizador/pc1/ejecutor.js:161`, `realizador/pc2/rele.js:284`. El guion se manda con >100 s de antelación — `realizador/README.md:56`.
- El ejecutor replanifica cada 0,5 s y reenvía el guion cada 3 s aunque no haya cambios — `realizador/pc1/ejecutor.js:46-52,121`.
- El control del zoom con `secuencia` solo funciona con la antena a velocidad 1 y sin pausa; en caso contrario cae a "pasos" (60 órdenes/s) que provocaron tirones en pruebas — `realizador/pc2/rele.js:384-388,406-423,445`, `realizador/README.md:133,137`.
- Un cliente de espectador puede ver la partida "caer" de una repetición: el PC 2 puede dejar de responder a la Replay API al acabar la partida; se contempla con `finEsperado` y `sinJuegoSegundos` — `realizador/pc2/emision.js:156-162`, `realizador/pc2/rele.js:630-633`, `realizador/README.md:160`.

**Failover y robustez**
- Puente: reintentos sin cierre, avisos de contraseña/red, sobrevive a reinicio de la web — `puente/puente-tenka-ichi.ps1:90-106,113-125`; el servidor retira el marcador a los 20 s sin datos — `server/partida.js:52,609`.
- Servidor: el estado del panel (partido, draft, vista, búsqueda) se guarda en Google Sheets pestaña Ajustes y se restaura al reiniciar si es <6 h — `README.md:53`, `server/estado-guardado.js`.
- PC 1 caído: el relé espera `degradadoTrasSegundos` 15 s y se queda en plano general/último seguido — `realizador/pc2/rele.js:590-598`; los planos ya enviados se mantienen mientras duran (el guion llega con antelación) — `realizador/pc2/rele.js:701`. No hay réplica del PC 1 ni explorador secundario. (inferencia; no hay código de failover).
- OBS caído: el relé lo abre en la bandeja (máx 1 vez/min) y avisa si no contesta 45 s — `realizador/pc2/rele.js:137-158`; búfer de repetición re-armado — `realizador/pc2/emision.js:122-139`; ffmpeg se reinicia pasado un rato — `realizador/pc2/grabador.js:9-10,28`.
- IA caída: la cámara no depende de ella; 3 fallos → descanso de 2 min — `realizador/README.md:242`.
- Toma de control manual desde el panel de la web o del PC 1 (los botones de cada campeón / plano general / escenas) — `realizador/README.md:78`, `realizador/pc2/rele.js:168-189`.
- Antivirus: Kaspersky cortó la actualización el 11/11; se movió el proceso a un lanzador sin procesos ocultos — `realizador/README.md:123`.
- Lectura de `eventdata` pierde eventos si el puente se reinicia y el cliente no mantiene ID: se reenvía todo con `reenviar` — `puente/puente-tenka-ichi.ps1:207-210`, `server/partida.js:114-117`.

**ToS / seguridad / legal (visible en el código)**
- Modificación de `game.cfg` y `PersistedSettings.json` del cliente (incluso quitando temporalmente el solo-lectura) para activar Replay API/LiveEvents y aplicar perfil mínimo — `realizador/instalar/configurar-lol.js:9-33,35-58,78-109`; con copia de seguridad `realizador-copia` — `realizador/instalar/configurar-lol.js:15,112-135`.
- Aceptación de certificado TLS no validado solo para `127.0.0.1` — `puente/puente-tenka-ichi.ps1:19-34`, `realizador/comun/http.js:22`.
- Captura de pantalla del monitor del juego con ffmpeg `ddagrab` (graba toda la pantalla; aviso: no tener nada encima del LoL) — `realizador/README.md:125`, `realizador/pc2/grabador.js:34`.
- DraftCore: cliente no oficial que imita la versión de su cliente (`auth.clientVersion` extraída del JS de su web) y fija `Origin`; DraftCore ya penalizó IPs por handshake rechazado — `server/draftcore.js:12-18,105-130`, `README.md:161-163`, `PROGRESO.md:246-250`. Riesgo de ToS y de rotura frente a cambios de su protocolo (no verificado con DraftCore).
- Valoración de jugadores: se evita calcular MMR propio "porque las normas de Riot prohíben los calculadores de MMR" y se cita a WhatIsMyMMR (CC BY 4.0) — `README.md:501-515`.
- Contraseña del panel viaja por cabecera en cada petición al puente y por el WebSocket del realizador (se envía huella sha256 como sala, no la contraseña) — `puente/puente-tenka-ichi.ps1:60-61`, `realizador/README.md:55`; la clave de la API de Anthropic va en un archivo local de PC 1 (nunca al servidor) — `realizador/pc1/ia.js:10-11`; clave de emisión RTMP en `opciones.local.json` local — `realizador/README.md:141`.

**Otras limitaciones/TODOs declarados**
- "Pendiente de la prueba real" y casillas de fase 0 sin marcar — `realizador/README.md:197-208`.
- Resumen en vídeo sin validar con OBS real — `realizador/README.md:177`; pendientes `README.md:179-185`.
- "La jugada de pelea con zoom/anticipación afinada el 14/11" (`opciones.json` `zoomPelea`, `anticipacionPelea` recientes) — `realizador/pc1/cerebro.js:147-149,272-274`; indica que el comportamiento se está ajustando con pruebas.
- Repetición solo se hace si luego hay calma: en partidas con peleas constantes, las repeticiones se saltan (`sin-hueco`) — `realizador/pc1/cerebro.js:527`.
- Modo "grabada" (un solo PC) funciona con repeticiones .rofl: exploración rápida x8 + realización — `realizador/README.md:30-39`.
- No hay overlay vertical 9:16, ni cámara de caster con interruptor (pendiente) — `PROGRESO.md:400`, `realizador/README.md:181`.
- Single points: web en Render gratuito (servidor + sala + overlays + Sheets); el PC 2 concentra OBS, relé, puente, grabador; el PC 1 concentra explorador + cerebro + IA.

### Inferences
- **Riesgo operativo más alto** (por el código): que LiveEvents deje de funcionar o que la Replay API no se comporte en espectador en vivo; el realizador depende de ambos (casillas sin marcar en `realizador/README.md:201,204`) y no hay detección automática de degradación más allá del punto rojo de LiveEvents en el panel.
- **Calidad de decisión limitada por los datos**: sin posiciones, la cámara no puede "pre-colocarse" en jugadas sin kill; el diseño de margen de 120 s compensa solo hacia el pasado inmediato (12 s antes del primer kill), no para jugadas que no terminan en muerte (por ejemplo, un Barón robado sin muertes se trata como `objetivo`, con 10 s de anticipación).
- **Sincronía del marcador con la antena** depende de que el puente corra en PC 2; si se arrancase en PC 1 el marcador adelantaría 120 s (la documentación lo advierte: "tiene que ir con lo que se ve en antena", `realizador/README.md:57`).
- **Escalabilidad/mantenimiento**: parámetros diseminados (`opciones.json`, `REGLAS` en `server/partida.js`, `RECOMPENSAS`, `INGRESOS`) requieren revisión cada parche (el propio README lo reconoce: `README.md:239`); y hay deriva entre documentación y JSON (zoom, anticipaciones).

### Gaps
- No hay datos de rendimiento ni de errores reales (latencia medida, tasa de fallos de la Replay API, fiabilidad de LiveEvents) en el repo; los `partidas/` y `capturas/` se excluyen del repositorio.
- No se sabe si existe documentación de Riot sobre el uso de Replay API en espectador (no se consultó: el alcance era solo el repo).
- No se pudo verificar el funcionamiento (no se ejecutó nada): todo lo dicho es lectura de código y de documentación; las afirmaciones de "probado" son del propio proyecto.
