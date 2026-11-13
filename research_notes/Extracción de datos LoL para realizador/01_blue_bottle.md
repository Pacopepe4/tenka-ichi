# Blue Bottle (BlueBottle / "League Broadcast") en broadcast de League of Legends

Fecha de investigación: 2026-11-13. Idioma de las notas: español (nombres de producto y campos de código en inglés).

**Nota metodológica (importante para el redactor):** en esta sesión WebFetch y curl no pudieron abrir bluebottle.gg, leaguebroadcast.gg, riotgames.com, link.springer.com, pitchbook.com, munich-startup.de ni cbinsights.com (bloqueo de red del entorno: ENOTFOUND / 403 del proxy). Por tanto:
- Lo marcado **[VERIFICADO EN CÓDIGO]** procede de clonar y leer directamente los repos públicos de GitHub `BlueBottleGG/leaguebroadcast-js-client` y `BlueBottleGG/leaguebroadcast-js-client-demo` (HEAD de ambos: 2026-10-22), y de lecturas directas de los README de `floh22/LeagueBroadcast`, `RCVolus/league-observer-tool` y `LeagueOfPoro/LeagueDirectorNG` en GitHub.
- Lo marcado **[RESUMEN DE BUSCADOR]** procede de resúmenes generados por la herramienta de búsqueda sobre páginas que no pude abrir yo mismo (sitio de BlueBottle, leaguebroadcast.gg, LinkedIn, Munich Startup, PitchBook). Es información de segunda mano: confianza media y mayormente autodeclarada por el proveedor.

---

## 1. ¿Qué es "Blue Bottle" y cuál es su identidad (desarrollador, fecha, licencia, precio, plataforma, estado, usuarios)?

### Takeaway
Sí existe: **BlueBottle** (bluebottle.gg; GitHub org `BlueBottleGG`) es una pequeña empresa alemana (BlueBottle GmbH, fundada en 2024 según listados) cuyo producto es **"League Broadcast"**, una aplicación Windows de pago freemium para producir emisiones de League of Legends (gráficos de champion select, in-game y post-game, cámaras cinemáticas, multi-view). Es el sucesor comercial del proyecto open source `floh22/LeagueBroadcast`. Confianza alta en que es la entidad que el usuario busca (el nombre "Blue Bottle" aparece literalmente en el código: `blue-bottle-ipc`); confianza media en los datos corporativos/de precios (solo vía resúmenes).

### Cited Findings
- No se encontró ninguna herramienta llamada exactamente "Blue Bottle" distinta de esta en búsquedas en inglés y español (incluyendo "Blue Bottle League of Legends observer / broadcast / overlay / production tool", "Bluebottle esports", "herramienta realizador League of Legends datos en vivo Blue Bottle"). Las búsquedas generales devolvieron solo herramientas distintas (LHM, league-prod-toolkit, OSL, etc.; ver sección 7), hasta que la búsqueda "Bluebottle esports live production" devolvió el sitio de BlueBottle — [bluebottle.gg](https://bluebottle.gg/) (resultado de búsqueda; página no abierta directamente).
- El paquete oficial se llama `@bluebottle_gg/league-broadcast-client`, autor "BlueBottleGG", versión 1.13.0, licencia GPL-3.0-only, descrito como "TypeScript client library for League Broadcast game data" **[VERIFICADO EN CÓDIGO]** — [package.json en el repo](https://github.com/BlueBottleGG/leaguebroadcast-js-client) (HEAD fechado 2026-10-22, commit "chore: bump Node to 26.12.1").
- El código del cliente contiene tipos generados en una ruta `types/flatbuffers/blue-bottle-ipc/league-broadcast/...` (módulos `cinematics`, `sequencer`, `scene`, `entity`, `commands`), lo que confirma que "Blue Bottle" es el nombre interno de la empresa/producto y que el motor de cinemáticas/escena usa un IPC FlatBuffers **[VERIFICADO EN CÓDIGO]** — [repo](https://github.com/BlueBottleGG/leaguebroadcast-js-client).
- El repo original `floh22/LeagueBroadcast` (autor Lars Eble, licencia MIT) está deprecado, dice que "ya no funciona por la introducción de Vanguard" y apunta como sucesor a la web/Discord de bluebottle.gg; sus Issues ya no se mantienen **[VERIFICADO: README leído]** — [floh22/LeagueBroadcast](https://github.com/floh22/LeagueBroadcast).
- Empresa: BlueBottle GmbH, fundada en 2024, sede en Bruckmühl (Baviera, Alemania); 4 empleados según PitchBook, 1–10 según Munich Startup; Munich Startup la lista como B2B mientras que el anuncio en LinkedIn llama a League Broadcast un producto "B2C"; hay vínculo declarado con TU Munich **[RESUMEN DE BUSCADOR]** — [Munich Startup](https://www.munich-startup.de/en/startups/bluebottle-gmbh/), [PitchBook](https://pitchbook.com/profiles/company/756844-75), [bluebottle.gg](https://bluebottle.gg/).
- Producto "League Broadcast": gráficos de champion select, in-game y post-game para LoL; overlays como browser source, herramientas de cámara cinemática, soporte de mando (controller), multi-view desde una sola app Windows; existe tier Enterprise por contacto **[RESUMEN DE BUSCADOR]** — [leaguebroadcast.gg](https://leaguebroadcast.gg/), [leaguebroadcast.gg/features](https://leaguebroadcast.gg/features).
- Precios (EUR, autodeclarados): Free 0 EUR; Basic 29,95 EUR/mes (299,95 EUR/año); Pro 99,95 EUR/mes (999,95 EUR/año); Enterprise a medida. Multi-view es Pro; el control de cámara con mando es Basic; las páginas "features" y "changelog" no coinciden del todo sobre en qué tier está el editor cinemático (el changelog 1.9.0 dice que las cinemáticas in-world pasaron a Basic) **[RESUMEN DE BUSCADOR]** — [leaguebroadcast.gg/pricing](https://leaguebroadcast.gg/pricing), [changelog](https://leaguebroadcast.gg/changelog).
- Coherente con los precios: el overlay demo oficial marca elementos como "[Free]" y "[Basic]" y avisa de que un servidor Free-tier no envía datos como Gold Graph **[VERIFICADO: README del demo leído]** — [leaguebroadcast-js-client-demo](https://github.com/BlueBottleGG/leaguebroadcast-js-client-demo); el código del cliente tiene tipos `Tier` y `userFeaturesUpdatedMessage` y endpoints REST de cuenta/licencias/facturación (`rest/account`, `billing_cycle`) **[VERIFICADO EN CÓDIGO]** — [repo](https://github.com/BlueBottleGG/leaguebroadcast-js-client).
- Estado/versión: el changelog muestra la versión 1.9.0 con fecha 16 julio 2026 (reduce crashes, nueva barra lateral, modo caster, Style Editor v2 opt-in); 1.0.0 añadió planificación de torneos, hotkeys de casters, gráficos in-game y estadísticas post-game; puede haber versiones posteriores no visibles **[RESUMEN DE BUSCADOR]** — [changelog](https://leaguebroadcast.gg/changelog).
- Clientes/usuarios declarados en el sitio de BlueBottle: SK Gaming, Prime League, SPORTDANMARK y Zenos (lista autodeclarada; Zenos es una empresa distinta de 3D en tiempo real sobre Unreal Engine, sin integración técnica confirmada) **[RESUMEN DE BUSCADOR]** — [bluebottle.gg](https://bluebottle.gg/), [Zenos](https://zenosinteractive.com/). No encontré ninguna fuente independiente que confirme uso en una liga concreta (LEC, LVP, etc.).
- Plataforma: aplicación Windows (se ejecuta en el PC observador/producción junto al cliente de espectador de LoL) **[RESUMEN DE BUSCADOR]** — [leaguebroadcast.gg](https://leaguebroadcast.gg/), [guía de torneo](https://leaguebroadcast.gg/guides/tournament-broadcast). El demo exige Node.js 20+ solo para el overlay de ejemplo **[VERIFICADO]**.
- Open source parcial: BlueBottle publica bajo GPLv3 una librería cliente JS/TS (`leaguebroadcast-js-client`; 38 commits, 12 estrellas según WebFetch) y un overlay demo Vue 3 bajo licencia MIT (`leaguebroadcast-js-client-demo`) **[VERIFICADO]**; un anuncio de LinkedIn habla de abrir la "Frontend Library" bajo GPLv3 y advierte que podrían reconsiderarlo si se usa para recolección masiva de datos o scraping comercial **[RESUMEN DE BUSCADOR, fecha de post no confirmada]**. El backend/app es propietario (no hay repo). Hay un módulo de Bitfocus Companion `companion-module-bluebottle-leaguebroadcast` listado en el sitio (sin repo localizado; licencia no verificada) **[RESUMEN DE BUSCADOR]**.

### Inferences
- "Blue Bottle" = BlueBottle GmbH; lo que el realizador probablemente ha oído es "League Broadcast (by BlueBottle)". Es una herramienta de **producción de gráficos y cámaras**, no una herramienta de "extracción de datos para el realizador" en sentido analítico; los datos son el insumo de sus overlays y se exponen por WebSocket.
- Es un producto muy joven (empresa de 2024, v1.0 posterior) y pequeño (equipo de ~4); la evidencia de uso en ligas es solo autodeclarada.

### Gaps
- No pude abrir bluebottle.gg, leaguebroadcast.gg ni LinkedIn: fecha exacta de lanzamiento de la v1.0, licencia del backend, términos de licencia comerciales y precios actuales no están confirmados de primera mano.
- No hay confirmación independiente (prensa, Riot, ligas) de los clientes (SK Gaming, Prime League, SPORTDANMARK, Zenos) ni de uso en producciones de habla hispana (LVP, Superliga, etc.).
- La fecha del anuncio de LinkedIn (lanzamiento B2C y GPLv3) es incierta (metadatos inconsistentes).

---

## 2. ¿Cómo obtiene los datos y qué extrae exactamente?

### Takeaway
Según el vendedor, lee "estado de juego frame-accurate" **localmente en el PC observador**, sin API key de Riot, sin límite de tasa y sin lectura de píxeles, con una fuente "compatible con Vanguard". El mecanismo exacto NO está documentado públicamente en lo que pude leer; la evidencia indirecta apunta a la Replay API / LiveEvents del cliente de espectador más LCU para champ select, pero eso es inferencia. Lo que extrae está muy bien documentado en los tipos del cliente.

### Cited Findings
- Afirmación del vendedor: League Broadcast "reads frame-accurate game state on the observer PC. No Riot API key or pixel reading is needed", usa una "Vanguard-compatible game-state source" y no hay API key ni rate limit porque los datos son locales; es autodeclarado y no probado independientemente **[RESUMEN DE BUSCADOR]** — [leaguebroadcast.gg/how-it-works](https://leaguebroadcast.gg/how-it-works).
- Contexto del predecesor: `floh22/LeagueBroadcast` usaba lectura de memoria (con repositorio de offsets por parche) para datos que la API de Riot no expone, además de Riot LiveEvents y Replay API y DataDragon; la lectura de memoria dejó de funcionar con Vanguard **[VERIFICADO: README]** — [floh22/LeagueBroadcast](https://github.com/floh22/LeagueBroadcast).
- El tipo `ingameFrontendData` incluye `gameTime`, `utcTime`, `playbackSpeed`, `isTestingEnvironment`, `gameVersion`, `patch`, equipos y miembros, `gameStatus`, `scoreboard`, pestañas por equipo (`tabs`), `scoreboardBottom`, temporizadores de foso de Barón y Dragón, inhibidores, panel lateral, **gold graph, damage graph, teamfight damage overview, damage recap, damage split, gold efficiency, teamfight timeline, objective DPS, kill participation, damage composition, damage flow, skin display, championDetail**, runas, y estados de votación Twitch **[VERIFICADO EN CÓDIGO]** — [types/ingame/ingameFrontendData.ts](https://github.com/BlueBottleGG/leaguebroadcast-js-client).
- Eventos en tiempo real vía WebSocket: `onPlayerEvent` (compras/ventas de objetos, subidas de nivel, K/D/A), `onTeamEvent`, `onObjectiveEvent`, `onFirstTowerEvent`, `onAnnouncementEvent`, `onKillFeedEvent` (killer, víctima, asistentes) **[VERIFICADO EN CÓDIGO]** — [README y types](https://github.com/BlueBottleGG/leaguebroadcast-js-client).
- Tipos de objetivo: Grubs, Herald, Baron, dragones por elemento (Water, Air, Earth, Fire, Hextech, Chemtech, Elder, Classic) e inhibidores; también `turretPlatingFallEvent` (caída de placas de torre) **[VERIFICADO EN CÓDIGO]** — `types/ingame/objective/IngameObjectiveType.ts`, `types/ingame/event/`, [repo](https://github.com/BlueBottleGG/leaguebroadcast-js-client).
- Teamfights: `ingameTeamfightTimelineData` con inicio/fin, muestras de daño por jugador y acumulado por equipo, kills, daño total y kills por equipo azul/rojo **[VERIFICADO EN CÓDIGO]** — [repo](https://github.com/BlueBottleGG/leaguebroadcast-js-client).
- Champion select (ruta `/ws/pre`): `champSelectStateData` con timer/fase, slots de picks y bans por equipo, acciones hover/lock/ban, inicio/fin de champ select **[VERIFICADO EN CÓDIGO]**.
- Post-game: tipos para overview de equipo/jugador, daño, oro, runas/objetos, muertes con posición (`playerDeath`, `vector3`) **[VERIFICADO EN CÓDIGO]** — `types/postgame/`.
- Estados de partida: OutOfGame, Loading, Running, Paused, Mocking, GameOver, ChampionSelect; causas de fin de partida: NexusDestroyed, ProcessExited, ClientDisconnected, RemakeSuspected; mensaje `ingameRewindMessage` (fromTime/toTime) — consistente con sincronización de replay/rewind **[VERIFICADO EN CÓDIGO]** — `types/shared/GameState.ts`, `GameEndCause.ts`, `types/message/ingame/`.
- El comentario de código en el tipo de cinemáticas dice que el host "escribe en el replay render endpoint" para reproducir cinemáticas, lo que indica uso del endpoint de render de la Replay API de Riot (puerto local del juego) para controlar la cámara del cliente **[VERIFICADO EN CÓDIGO]** — `types/flatbuffers/blue-bottle-ipc/league-broadcast/cinematics/cinematic-hud-element.ts`, [repo](https://github.com/BlueBottleGG/leaguebroadcast-js-client). Los tipos `sequencer` (CameraPosition, CameraRotation, CameraFov, CameraLookAtTarget...) reflejan las propiedades de cámara de la Replay API.
- Referencias de Riot: la Replay API está desactivada por defecto y se habilita con `EnableReplayApi=1` en `[General]` de `game.cfg`; el cliente de LoL y herramientas de observador usan además LiveEvents (puerto configurable, p. ej. 34243 en league-observer-tool) **[VERIFICADO: README]** — [LeagueOfPoro/LeagueDirectorNG](https://github.com/LeagueOfPoro/LeagueDirectorNG), [RCVolus/league-observer-tool](https://github.com/RCVolus/league-observer-tool). El README del observer tool indica que LeagueBroadcast usa más LiveEvents que él, por lo que sus configs pueden entrar en conflicto — es evidencia de que League Broadcast (v1 o sucesor) también se apoya en LiveEvents/Replay API, aunque no del mecanismo exacto actual.
- No se menciona la Live Client Data API del puerto 2999 ni OCR/visión por computador ni proveedores de datos de terceros (GRID/Bayes) en ninguna fuente de BlueBottle que pude leer. El código del cliente no contiene referencias a Riot API, LCU, 2999 ni Vanguard (búsqueda grep en README/src/types).

### Inferences
- Probable arquitectura (NO confirmada): app Windows en el PC observador, que (a) usa el cliente de espectador oficial con Replay API/LiveEvents locales y probablemente LCU para champ select, (b) calcula estadísticas derivadas (teamfights, gold efficiency, damage flow) en un núcleo nativo ("lblib" aparece en comentarios del código), y (c) expone todo por WebSocket (`/ws/in`, `/ws/pre`, puerto 58869) y REST (`/api`, `/cache`) a overlays HTML/browser source.
- La afirmación "fuente compatible con Vanguard" encaja con que Riot indica que las apps basadas en servicios de spectator/replay deberían seguir funcionando (ver sección 5), pero cómo obtiene exactamente posiciones o cooldowns que la API pública no da no está explicado.

### Gaps
- Mecanismo exacto de captura (Live Client Data API, Replay API, LiveEvents, qué parte usa cada una) no confirmado; la página "How it works" no pudo abrirse.
- No se confirmó si extrae posiciones de campeones, cooldowns de ultis, hechizos de invocador o mapa; hay `championAbilityData`, `ingameAbilityInfo`, `summonerSpellData` y `SpellSlotIndex` en los tipos (indicio de cooldowns/habilidades) pero sin documentación de qué se rellena. Hay `playerDeath` con `vector3` solo en post-game.
- No hay documentación pública de latencia/frecuencia de actualización (el README solo dice que el timestamp se corrige por el tiempo de llegada y que la frecuencia es la del backend).

---

## 3. ¿Cómo entrega los datos al realizador/operador (dashboard, overlays, OBS, WebSocket/REST, vMix, motores gráficos)?

### Takeaway
Doble vía: (1) overlays HTML como **browser sources** (OBS Studio u otro software con browser sources, vMix citado en el demo) y (2) una **API WebSocket/REST local** con cliente TypeScript para construir overlays propios; control manual mediante hotkeys, "modo caster", Stream Deck/Companion y telestrator.

### Cited Findings
- WebSocket: puerto por defecto 58869; rutas `/ws/in` (in-game) y `/ws/pre` (champion select), más `/api` y `/cache` REST; `useHttps` opcional; reconexión automática **[VERIFICADO EN CÓDIGO]** — [README del cliente](https://github.com/BlueBottleGG/leaguebroadcast-js-client).
- API reactiva framework-agnóstica (React, Vue, Svelte, Solid, Angular, vanilla) con snapshots versionados; el backend envía un snapshot completo en cada actualización y `null` significa "no mostrar" **[VERIFICADO]** — mismo README.
- El overlay demo (Vue 3) renderiza sobre un lienzo transparente 1920x1080 "para herramientas como OBS o vMix", con escenas `/ingame`, `/pregame`, `/pregame-3d`, `/pregame-hybrid`, `/postgame` y elementos individuales en `/ingame/element/<name>`; incluye depuración con registro de eventos **[VERIFICADO]** — [demo](https://github.com/BlueBottleGG/leaguebroadcast-js-client-demo).
- Gráficos del demo: scoreboard superior, filas por jugador (campeón, nivel, KDA, objetos, hechizos), temporizadores de Barón/Dragón; en tier Basic: gold graph, gold efficiency, damage composition/flow, objective damage, kill participation, kill feed, skins, reacción de smite, tiras de cámaras de jugador (VDO.Ninja), teamfight recap, paneles de votación/predicción de Twitch **[VERIFICADO]** — mismo README.
- Cámaras de jugador vía VDO.Ninja con compensación de retardo (`&buffer`) para alinear con el delay de la emisión **[VERIFICADO]** — mismo README.
- Control operativo: hotkeys de casters (`casterActionDefinitionDto`, páginas de caster), hotkeys de "multicam take" por rol (`singleMulticamTakeHotkeyConfigDto`), telestrator (pinceles/trazos), sincronización "mirror-sync", conexión a servidor/salas remotas con `authToken` y roles remoto-caster, webhooks, emparejamiento de "companion" **[VERIFICADO EN CÓDIGO]** — carpetas `types/hotkey`, `types/config`, `types/rest/webhooks`, `types/rest/companion`, [repo](https://github.com/BlueBottleGG/leaguebroadcast-js-client).
- Control desde Stream Deck vía Bitfocus Companion (módulo `companion-module-bluebottle-leaguebroadcast`) **[RESUMEN DE BUSCADOR]** — [bluebottle.gg](https://bluebottle.gg/). Elgato Marketplace tiene además un plugin para el *otro* proyecto League Observer Tool (no Blue Bottle) — [Elgato](https://marketplace.elgato.com/product/league-observer-tool-4395394c-af56-4c5c-b05d-529553066422).
- Guía de producción de BlueBottle: PC de producción con cliente de espectador + OBS (o similar), escenas separadas para champion select, in-game, descanso y post-game; el observador crea la lobby y controla la cámara; los casters deben ver la vista con delay del espectador; un segundo PC es recomendable para encoder **[RESUMEN DE BUSCADOR]** — [guía de torneo](https://leaguebroadcast.gg/guides/tournament-broadcast).
- No encontré evidencia de integración nativa con Tricaster, Ross, CasparCG, Singular ni Unreal (más allá de que Zenos figura como cliente/socio listado). vMix solo se cita como destino posible del overlay HTML.

### Inferences
- Para un realizador con mezclador hardware/vMix, el flujo realista es: overlay HTML (browser source/Web Browser input) para gráficos, y/o consumir el WebSocket para alimentar un motor gráfico propio (p. ej. mediante un adaptador) — el cliente GPLv3 está pensado para esto, ojo con la licencia copyleft.

### Gaps
- No hay documentación pública (que pudiera leer) de formato JSON/mensajes exactos más allá de los tipos, ni de salida NDI/SDI o integración con motores gráficos broadcast tradicionales.

---

## 4. ¿Incluye dirección automatizada o asistida (planos sugeridos, auto-switching, scoring de "qué mirar")?

### Takeaway
No hay evidencia de un "director automático" con puntuación de interés ni sugerencias de plano. Lo que sí hay es **asistencia a la dirección manual**: control de cámara del juego (modos dirigido/libre/dolly con mando, spline/cinemáticas), multi-view, hotkeys de "multicam take" y gráficos disparados por eventos (reglas de prioridad).

### Cited Findings
- Control de cámara con mando (modos directed/free/dolly), editor cinemático con tracks de cámara (posición, rotación, zoom, FOV, look-at a objetivo/equipo/entidad, blend de apuntado) y multi-view sincronizado en un cliente **[RESUMEN DE BUSCADOR]** — [features](https://leaguebroadcast.gg/features), [pricing](https://leaguebroadcast.gg/pricing); estructura del secuenciador **[VERIFICADO EN CÓDIGO]** — `types/flatbuffers/.../sequencer`, [repo](https://github.com/BlueBottleGG/leaguebroadcast-js-client).
- Disparo automático de gráficos con prioridades: el demo documenta que ciertos gráficos tienen prioridad (p. ej. recap de objetivo, smite, Twitch) sobre otros paneles y se muestran tras eventos de juego (kill feed, objetivos, teamfights) **[VERIFICADO]** — [README del demo](https://github.com/BlueBottleGG/leaguebroadcast-js-client-demo).
- No hay en el código del cliente ni en el demo ningún concepto de "score de interés", "cámara sugerida" o auto-switching de cámara de observador **[VERIFICADO por grep en tipos/README; no se auditó el backend propietario]**.
- Contraste: Riot anunció una revisión del modo espectador con controles de tiempo y cámara con IA (ese producto es oficial de Riot, no de BlueBottle) — [PC Gamer](https://pcgamer.com/league-of-legends-spectator-mode-revamp-adds-time-controls-and-ai-driven-camera) (solo titular visto en resultados; página no abierta; fecha no verificada).
- Contraste académico: un paper de 2023 (Springer/HCI) describe un sistema de "resúmenes visuales para casting y dirección asistidos por ordenador en LoL" que ayuda al realizador a usar datos para construir planos — [Springer](https://link.springer.com/chapter/10.1007/978-3-031-35930-9_10); **no hay relación demostrada con BlueBottle**.
- `LeagueOfPoro/LeagueDirectorNG` es una herramienta manual de puesta en escena/grabación de replays con secuenciador de cámara, no un director automático — [GitHub](https://github.com/LeagueOfPoro/LeagueDirectorNG).

### Inferences
- Si el realizador entendió que "Blue Bottle" sugiere planos o puntúa qué ver, no hay evidencia de ello; lo más cercano es la capa de datos (teamfight timeline, kill feed, objetivos) que un realizador o un desarrollo propio podría usar para construir alertas.

### Gaps
- No pude revisar la página de features completa ni el backend propietario: no puedo descartar funciones de asistencia no documentadas en el cliente.

---

## 5. Documentación, repos y charlas; compatibilidad con política de Riot / Vanguard / ToS

### Takeaway
La documentación pública está sobre todo en leaguebroadcast.gg (guías, changelog, comparativa, how-it-works), en los dos repos de GitHub y en publicaciones de LinkedIn; no encontré charlas (GDC, blog técnico de Riot), hilos de Reddit ni tutoriales de terceros sobre su funcionamiento interno. En cuanto a Vanguard, el vendedor afirma compatibilidad; Riot ha dicho que las apps basadas en servicios de spectator/replay deberían seguir funcionando; no hay confirmación independiente de que Riot apruebe este producto concreto.

### Cited Findings
- Repos de BlueBottleGG: `leaguebroadcast-js-client` (GPL-3.0, "Thin JS wrapper around the LeagueBroadcast Websocket") y `leaguebroadcast-js-client-demo` (MIT, Vue 3) **[VERIFICADO]** — [cliente](https://github.com/BlueBottleGG/leaguebroadcast-js-client), [demo](https://github.com/BlueBottleGG/leaguebroadcast-js-client-demo). Paquete npm `@bluebottle_gg/league-broadcast-client` **[VERIFICADO en package.json; no consulté el registro npm]**.
- Páginas oficiales (no abiertas directamente): [how-it-works](https://leaguebroadcast.gg/how-it-works), [features](https://leaguebroadcast.gg/features), [pricing](https://leaguebroadcast.gg/pricing), [changelog](https://leaguebroadcast.gg/changelog), [alternatives](https://leaguebroadcast.gg/alternatives), [guía de torneo](https://leaguebroadcast.gg/guides/tournament-broadcast) **[RESUMEN DE BUSCADOR]**.
- Vanguard FAQ de Riot (resumen de buscador, página no abierta): las apps desarrolladas con servicios de spectator y replay deberían seguir funcionando; las herramientas externas que leen memoria dejan de funcionar y deben cambiar de método **[RESUMEN DE BUSCADOR]** — [Vanguard FAQ for Third Party Applications](https://www.riotgames.com/en/DevRel/vanguard-faq).
- Vanguard llegó a LoL con el parche 14.9 (2024) — [Forbes](https://www.forbes.com/sites/mikestubbs/2024/04/30/league-of-legends-149-patch-notes-bring-vanguard-and-lee-sin-asu/) (solo título/resumen de búsqueda).
- El README de `league-observer-tool` (RCVolus) advierte que su lectura de memoria opcional "podría resultar en ban" con Vanguard y se va a desactivar **[VERIFICADO: README]** — [RCVolus/league-observer-tool](https://github.com/RCVolus/league-observer-tool); el README de LeagueBroadcast original dice que ya no funciona por Vanguard — [floh22/LeagueBroadcast](https://github.com/floh22/LeagueBroadcast).
- Disclaimer típico: el predecesor y las herramientas de la comunidad indican que no están respaldadas por Riot Games **[VERIFICADO]**. No encontré un disclaimer equivalente de BlueBottle (no pude abrir su sitio).
- Anuncio de Riot sobre modo streamer: el espectado en el cliente seguirá funcionando y los sitios de terceros de "live spectate" se desactivarán (relevante para el ecosistema de espectador, no específico de BlueBottle) — [@LeagueOfLegends en X](https://x.com/LeagueOfLegends/status/1980434309736771638) (snippet de búsqueda; fecha aprox. oct 2025 por el ID del tweet, no verificada).

### Inferences
- Si BlueBottle realmente solo usa servicios oficiales del cliente de espectador (Replay API/LiveEvents/LCU), debería ser compatible con Vanguard; si usara lectura de memoria no lo sería. Su documentación dice "compatible con Vanguard" pero no explica el método, por lo que el riesgo de ToS/ban no es evaluable desde fuentes públicas. Para uso en producción profesional conviene preguntar a BlueBottle y a Riot (DevRel / organizador de la liga) por escrito.

### Gaps
- No hay política de Riot específica sobre "League Broadcast"; no se leyó el texto íntegro del Vanguard FAQ ni de los términos de la Developer Policy (riotgames.com no accesible).
- No encontré charlas (GDC, Riot tech blog), hilos de Reddit/Discord públicos ni tutoriales de terceros sobre el funcionamiento interno.

---

## 6. Otras entidades candidatas que podrían ser lo que el usuario llama "Blue Bottle" (no confirmadas)

### Takeaway
La candidata principal es BlueBottle/League Broadcast. Si el usuario recuerda un nombre distinto, las alternativas reales del ecosistema LoL son las siguientes; ninguna se llama "Blue Bottle". Blue Bottle Coffee (marca de café) no tiene relación y no se investigó.

### Cited Findings
- **LeagueBroadcast (floh22), original open source**: overlays de pick/ban e in-game; MIT; memoria + LiveEvents + Replay API + DataDragon; deprecado por Vanguard; sucesor = BlueBottle — [GitHub](https://github.com/floh22/LeagueBroadcast).
- **league-prod-toolkit + league-observer-tool (RCVolus, "Riot Community Volunteers")**: toolkit open source (MIT) con módulos como lower thirds para casters, y herramienta de observador que consulta LCU, API in-game, LiveEvents (puerto por defecto 34243) y Replay API y envía datos al toolkit (puerto por defecto 3003); la comparativa de BlueBottle dice que el toolkit requiere API key de Riot y observer tool (comparativa autointeresada) — [prod-toolkit](https://www.github.com/RCVolus/league-prod-toolkit), [observer tool](https://github.com/RCVolus/league-observer-tool), [comparativa BlueBottle](https://leaguebroadcast.gg/alternatives).
- **LHM (Lexogrine HUD Manager)**: plataforma comercial multi-juego (CS2, LoL, Dota 2, Valorant...) con HUDs premium ("Ultra LoL HUD"), gestión de torneos/overlays y "Signals" para disparar acciones en Companion — [lhm.gg](https://lhm.gg/features/premium-hud/league-of-legends), [pricing](https://lhm.gg/pricing), [Signals](https://lhm.gg/features/signals).
- **OSL (Overlay Spectator Live, Sky-CSC)**: overlay open source para espectar LoL — [GitHub](https://github.com/Sky-CSC/OSL).
- **LeagueDirectorNG (League of Poro)**: herramienta manual para grabar/escenificar replays con secuenciador de cámara (Apache-2.0) — [GitHub](https://github.com/LeagueOfPoro/LeagueDirectorNG).
- **Riot Data Portal / GRID (ex Bayes)**: fuente oficial de datos de esports de LoL para equipos (no es herramienta de overlay) — [Riot dev diary](https://lolesports.com/news/dev-diary-introducing-the-new-lol-esports-data-portal).
- **wTVision**: proveedor de gráficos en directo con datos para Riot (case study) — [PDF wTVision](https://www.wtvision.com/files/case_studies/riot_games_en.pdf).
- **BLOB Productions (blocbeats)**: plataforma de HUD en vivo para Valorant/CS2/Rocket League (no LoL) — [Contra](https://contra.com/p/XbseQeOr-real-time-esports-hud-builder-and-broadcast-engine-architecture).
- **Investigación académica de dirección asistida en LoL** (Springer 2023): sistema end-to-end de datos para realizador y comentarios automáticos — [Springer](https://link.springer.com/chapter/10.1007/978-3-031-35930-9_10) (abstract visto solo en resumen de búsqueda).

### Inferences
- El realizador puede estar mezclando "BlueBottle" con una de estas; la que mejor encaja con "extrae datos de LoL en vivo" y con el nombre es BlueBottle League Broadcast.

### Gaps
- No se ha confirmado qué herramienta usa/menciona realmente el usuario; conviene preguntarle dónde oyó el nombre (liga, productora, Discord).
