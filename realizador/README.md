# Realizador · beta

Realizador automático para directos de League of Legends. Decide la cámara del observer, lanza repeticiones y saca el línea por línea de Gokudō, con **2 minutos de margen**: un cliente ve la partida casi en directo y otro la emite 120 s después, así que cuando algo sale en antena el realizador ya sabe cómo acaba.

- **PC 1 (el tuyo, poco potente):** el **agente**. Mira la partida en directo en segundo plano, agrupa los sucesos en jugadas, escribe el guion de planos y lleva el panel de supervisión.
- **PC 2 (el de emisión, potente):** el **relé**. No decide nada: mantiene la antena 120 s por detrás y mueve la cámara cuando llega cada plano del guion. OBS y el overlay de Gokudō siguen como siempre.

Node 22 o superior. Sin dependencias salvo el modo IA (opcional), que usa la librería oficial de Anthropic: `INSTALAR-IA.bat` la instala si falta.

## Probarlo sin LoL

```
npm test        # pruebas, incluida una partida simulada de punta a punta (unos 40 s)
npm run demo    # partida de mentira con 20 s de margen; mientras corre, abre http://localhost:4600/
```

## Fase 1 · sacar los datos de una partida (captura)

En Windows, sin terminal: en la carpeta `windows/` hay archivos para abrir con doble clic, en orden: `1-configurar-lol.bat`, `2-capturar-datos.bat` y `3-partida-grabada.bat`; para OBS, `4-configurar-obs.bat` (una vez) y `5-abrir-obs.bat` (cada directo). No abras los `.js` con doble clic: Windows los abre con otro programa y da error.

Para ver qué da el juego de verdad antes de fiarse del realizador. No decide ni toca nada: solo apunta.

1. Una vez: `npm run configurar-pc1` (activa la Replay API y LiveEvents) y reinicia el cliente de LoL.
2. Abre una repetición cualquiera (Perfil → Historial → Ver repetición) o espectea una partida.
3. `npm run capturar` y déjala ver la partida (o un buen trozo: mejor si pasa alguna pelea y un dragón). Puedes mover la repetición, pausarla o acelerarla: también se apunta.
4. Ctrl+C para cerrar. Escribe en pantalla el resumen y lo deja todo en `capturas/<fecha-hora>/`.

Lo que hay en la carpeta: `resumen.md` (qué funciona y qué no), `primeras/` (la primera respuesta entera de cada dirección del juego, incluido el mapa de la API), `sucesos.jsonl`, `liveevents.jsonl`, `ritmo.jsonl`, `fotos.jsonl` (allgamedata cada 5 s) y `camara.jsonl`. Comprime la carpeta y súbela al proyecto para revisarla.

## Partidas grabadas (un solo PC)

Realiza una repetición (.rofl) en el mismo PC, sin PC 2 ni margen: como el realizador la ve entera antes, ya sabe todo lo que pasa.

1. Una vez: `npm run configurar-pc1` y reinicia el cliente.
2. Abre la repetición en el cliente y `npm run grabada`.
3. **Exploración:** la pone al principio y la pasa a x8 apuntándose los sucesos (una partida de 30 min tarda unos 4). No la toques mientras tanto.
4. **Realización:** la deja al principio en pausa. Dale al play: la cámara sigue el guion según el segundo de la repetición, aunque la pausas, la muevas o la aceleras. OBS (repeticiones) y Gokudō (línea por línea) van igual que en directo, y el panel en http://localhost:4600/.

El guion completo queda en `partidas/<fecha>_<partida>/guion.json`. En `opciones.json` → `grabada`: `velocidadExploracion`, `desde` (segundo desde el que empezar) y `reproducirAlAcabar` (darle al play solo al acabar la exploración). Sin LoL: `npm run demo-grabada`.

## Montarlo en los dos PCs (directo)

Se descarga de la guía de Gokudō (`/guia/#realizador`): **Realizador PC 1** y **Realizador PC 2** (este ya trae dentro el puente del marcador). La contraseña es la del panel de Gokudō, la misma en los dos PCs y en el puente.

Una vez en cada PC:

1. **PC 2 (emisión):** cierra OBS, descomprime la carpeta y doble clic en `INSTALAR-PC2.bat`. Pide la contraseña, activa la Replay API en LoL, deja OBS configurado (escenas, búfer de repetición y WebSocket con esa contraseña) deja el puente del marcador con la misma contraseña y crea en el escritorio **Realizador PC2**. Si no encuentra el overlay de Gokudō en tus escenas, pone el del servidor (`/overlay/`).
2. **PC 1 (explorador):** descomprime la carpeta y doble clic en `INSTALAR-PC1.bat`. Pide la misma contraseña, activa la Replay API y LiveEvents y crea **Realizador PC1**.
3. Si el cliente de LoL estaba abierto, reinícialo en los dos.

Si el PC no tiene Node.js 22 o superior, cualquier `.bat` lo baja solo: la versión LTS portátil oficial de nodejs.org (comprobada con su suma SHA-256) en la carpeta `node` del realizador, sin pedir permisos ni instalar nada en el PC. Solo si no hay internet abre nodejs.org.

Cada directo: abre **Realizador PC2** (abre OBS con el búfer en marcha, el puente del marcador y el relé) y **Realizador PC1** (el agente y su panel en http://localhost:4600/). Los dos se encuentran solos en la sala del realizador del servidor de Gokudō (`puente.url`, `wss://tenka-ichi.onrender.com/realizador`) con la contraseña, aunque estén en redes distintas. Luego, espectead la partida en los dos: el PC 1 la encuentra y empieza a realizar solo, y el PC 2 pone la antena 2 minutos por detrás.

- La contraseña no viaja: solo su huella (sha256), que hace de nombre de sala. El servidor no entiende nada, solo pasa mensajes de un PC al otro.
- OBS lo maneja el relé del PC 2 en local: el PC 1 le manda con el guion qué clip guardar y qué repetición lanzar, y en qué segundo de antena. Las repeticiones no viajan: se graban y se emiten en el PC 2. Con 2 minutos de margen sobra tiempo (el guion llega con más de 100 s de antelación).
- **El puente de Gokudō (marcador) va en el PC 2**, no en el PC 1: tiene que ir con lo que se ve en antena.

Otros modos (en `opciones.local.json`): `"puente": { "modo": "red" }` con los dos PCs en la misma red (el PC 2 se anuncia y el PC 1 lo encuentra con `"rele": { "ip": "auto" }`), o la IP del PC 2 a mano en `rele.ip`. Por órdenes: `npm run configurar-pc1|pc2`, `npm run rele`, `npm run agente` (o `agente-ligero` con el perfil mínimo del juego).

## Empezar el directo con un botón

«Realizador PC1» y «Realizador PC2» abren cada uno su ventana (PC 1: http://localhost:4600/, PC 2: http://localhost:4601/). Las dos enseñan lo mismo en la pestaña **Directo**: qué falta para empezar (los dos PCs conectados, OBS, la partida en los dos LoL y el búfer de repeticiones), con qué hacer si falta algo, y el botón **Empezar directo**.

- Se puede pulsar en cualquiera de los dos PCs (o desde el panel de Gokudō con el mensaje `panelEmision`), aunque falten cosas y antes de que empiece la partida. Queda **armado**.
- Cuando está todo, sale la cuenta atrás hasta que la partida llegue a la antena (los 2 minutos de margen). `emision.previaSegundos` (10) antes, el PC 2 pone la escena `Pausa`, arranca el búfer de repetición si no lo estaba y OBS empieza a emitir. Cuando la antena arranca en el segundo 0, pasa a `Juego`: la partida se emite desde el principio.
- Al acabar la partida (el PC 1 dice en qué segundo acabó; o el LoL del PC 2 deja de responder), pasa a `Casters` sin cortar la emisión, y la siguiente partida entra sola. **Terminar emisión** (dos clics) la corta.
- **Prueba: solo grabar** hace lo mismo pero grabando en el disco en vez de emitir.
- Si OBS no puede emitir (por ejemplo, sin clave de emisión en el perfil), sale el aviso en rojo y lo reintenta cada 10 s.

- **Draft:** si el panel de Gokudō tiene un draft en marcha (DraftCore conectado), el PC 2 pone la escena `Draft` (el overlay del draft con las cámaras en sus huecos). Si se pulsa el botón durante el draft, la emisión empieza ya, con el draft. Al cerrar el draft y salir de su pantalla pasa a `Pausa`, y la partida entra sola como siempre. Entre partidas de una serie: `Casters` → `Draft` → `Pausa` → `Juego`.
- Lo único que no hace solo es **empezar**: el botón, o empezar a emitir a mano en OBS (entonces el realizador se arma solo y se encarga de las escenas). Si se corta la emisión en OBS, deja de cambiar escenas.

Todo lo hace el relé del PC 2, que es donde está OBS (`pc2/emision.js`). Opciones en `emision` de `opciones.json`: `modo`, `previaSegundos`, `segundosTrasFin`, `sinJuegoSegundos`, `pararAlAcabar` y `pararTrasSegundos`. Sin LoL: `npm run demo` y abre las dos páginas.

## El panel (pestaña Realización del PC 1)

- **En antena:** el plano que está saliendo y el botón **Tomar el control**. Con el control tomado, el realizador sigue planificando y apuntando, pero no manda nada; los botones de cada campeón y **Plano general** mueven la cámara a mano. **Devolver el control** lo devuelve.
- **Próximos planos** y **Acciones programadas** (repeticiones y línea por línea), con cuánto falta para que salgan.
- **Jugadas** con su estado: pendiente, en guion, en antena, emitida o descartada.
- **Registro** de cada decisión, del realizador o de una persona.

## Cómo decide

1. Las muertes seguidas (menos de 12 s entre una y otra) forman una pelea. Un objetivo en mitad de una pelea forma parte de ella.
2. Prioridad: pelea > objetivo > muerte suelta > torre o inhibidor. Una torre que tiran los súbditos no tiene plano.
3. La cámara llega 5 s antes del primer suceso (10 s en un objetivo) y se queda 3 s después.
4. Si algo más importante empieza en menos de 6 s, la cámara va ya a eso en vez de enseñar un plano corto.
5. La cámara sigue al que hace la primera muerte. Si cae, pasa al implicado vivo que más ha participado.
6. Una pelea de 3 muertes o más, un Barón o un ace se repiten, pero solo si después vienen 15 s sin nada importante. Como hay margen, eso ya se sabe al decidirlo.
7. **Zoom.** De base, un poco más abierto que el del juego (`abierto`). El plano general, más abierto todavía (`general`). Zoom in (`cerca`) solo justo después de una muerte o un objetivo hecho por un campeón, y solo si en los 10 s siguientes no pasa nada más: 4 s sobre quien lo ha hecho y vuelta. Cada cambio de zoom se hace poco a poco (1,2 s). Valores en `rele.zoom` (campo de visión `fov` y `distancia` de la cámara al seguido) y `reglas.cerca`.
7b. **Interfaz del juego en la emisión.** El PC 2 quita del LoL de la antena los campeones de los lados (`interfaceFrames` de la Replay API), porque ya los enseña el overlay. Va en cada orden de cámara, así que se mantiene aunque alguien pulse una tecla del espectador. Para quitar o dejar otras partes: `rele.interfaz` en `opciones.json` (por ejemplo `"interfaceMinimap": false`).
8. **Overlay de Gokudō.** De base, siempre el línea por línea (con el marcador y el reloj de arriba). Se cambia un rato por otra cosa y luego vuelve solo:
   - **Ficha del jugador en racha:** cuando alguien llega a 3, 5 u 8 asesinatos sin morir, su ficha (carta y números) durante 10 s en el primer hueco tranquilo de los 45 s siguientes, después de la repetición si la hay. Como mucho una por jugador cada 2 min.
   - **Gráfica de oro:** desde el minuto 8, en un rato de 35 s sin nada, 15 s (como mucho cada 3 min).
   - Al acabar la partida se quita. Con el control tomado, no se toca. Lo manda el PC 1 al panel de Gokudō en el segundo de antena que toca. Valores en `reglas.overlay`.

Todos los tiempos están en `reglas` de `opciones.json`.

## OBS (escenas, repeticiones y WebSocket)

En el PC donde va OBS (el PC 2, o el mismo PC en las pruebas), con OBS **cerrado**: doble clic en `windows/4-configurar-obs.bat` (o `npm run configurar-obs`). Deja hecho:

- **Colección de escenas `Realizador`** con `Juego` (captura de la ventana de LoL + overlay de Gokudō), `Repeticion` (fuente multimedia `Repeticion clip`, overlay y `Overlay REPLAY`, la placa REPETICIÓN de `obs/replay.html`), `Casters` (fondo, cámara y rótulo), `Pausa` (fondo y rótulo) y `Draft` (cuatro cámaras `Camara draft 1…4` debajo del overlay). Los nombres salen de `obs` en `opciones.json`.
- **Transiciones `Repeticion entrada` y `Repeticion salida`**: stingers de `obs/repeticion-entrada.webm` y `obs/repeticion-salida.webm` (0,9 s con transparencia; tapan la pantalla a los 400 ms, que es cuando OBS cambia de escena). Se usan desde la carpeta del realizador: si la mueves, vuelve a ejecutar el instalador.
- **Cámaras del draft:** se eligen una vez en la página del PC 2 (http://localhost:4601/, pestaña **Cámaras**): qué cámara del PC va en cada hueco. Cuántas salen y qué es cada una se pone en el panel de Gokudō (apartado Cámaras); el relé las encaja solo en los huecos del overlay. Sin elegir nada, van las cámaras del PC por orden.
- **Perfil `Realizador`**: copia del perfil que usas ahora (clave de emisión, codificador, resolución) con el búfer de repetición activado (`obs.segundosBufer`, 45 s), el codificador según la tarjeta gráfica (`obs.codificador: "auto"`: NVENC con una NVIDIA GTX 10 o RTX, el de AMD con una RX 5000 o más nueva, QuickSync con una Intel Arc, UHD o Iris, siempre que OBS lo dé como disponible en su último registro; si no, x264. También se puede fijar `"x264"`, `"nvenc"`, `"amd"` o `"qsv"`, o `""` para dejar el de tu perfil) y los clips en `Vídeos\Realizador`. Si no tenías perfil, uno nuevo a 1080p60.
- **Servidor WebSocket** activado en el puerto de `obs.url` con contraseña. La contraseña se apunta en `opciones.local.json` (`obs.clave`, `obs.activo: true`). Si el agente va en el otro PC, copia allí la contraseña que sale en pantalla y pon `"url": "ws://IP-DEL-PC-2:4455"`.
- OBS arranca con esa colección y ese perfil.

Tus colecciones y perfiles de siempre no se tocan (siguen en los menús de OBS), y lo que se cambia se copia antes en `%APPDATA%\obs-studio\realizador-copia\<fecha>\`. Se puede repetir las veces que haga falta: mantiene la contraseña.

**Todo lo de OBS viene en la descarga:** las transiciones y el cartel REPLAY (`obs/`), sus fuentes (`obs/fuentes`: Dela Gothic One, Yuji Boku y Zen Kaku Gothic New, recortadas a lo que se usa, licencia OFL), que `configurar-obs` instala para el usuario sin pedir permisos para que los rótulos de Casters y Pausa salgan con la letra de Gokudō, el overlay de la web (`/overlay/`) y las **alertas de Kick** (`/alertas/`, encima de todo en todas las escenas; `obs.alertas` en `opciones.json` para otra dirección o `""` para quitarlas).

**Marco del minimapa:** `obs/minimapa.html` (diseño del hilo de overlays, en Gokudō) va en la escena `Juego`, encima del juego y debajo del overlay, y solo pinta por fuera del mapa. Por defecto el hueco es de 280 px, abajo a la derecha; para ajustarlo al minimapa del PC 2, `obs.minimapa` en `opciones.json` (`lado` o `ancho`/`alto`, `x`, `y`, `margen`, `grosor`, `rotulo: 0` para quitar la pestaña y `guia: 1` para calibrar) y volver a configurar OBS.

**Audio de las repeticiones:** el perfil `Realizador` va en salida avanzada con tres pistas: la 1 es la emisión (juego y micro), la 2 solo el juego y la 3 juego y micro. El búfer de repetición graba la 2 y la 3, así que al repetir un clip suena el juego sin los casters (la 3 queda para el resumen). La escena `Repeticion` solo lleva el clip y el cartel REPLAY.

**Zoom de la cámara:** lo hace el propio LoL con una secuencia de la Replay API (`rele.zoom.modo: "secuencia"`, unos 2 s con arranque y frenada suaves); si no se puede, órdenes de 0,1° a 60 por segundo. Al cambiar de jugador, corte directo con el zoom nuevo; en la vista de arriba, zoom fijo. El LoL de la antena va sin campeones a los lados, sin línea de tiempo, sin los controles del espectador, sin el recuadro del seguido y sin los anuncios del centro (primera sangre, multikills, objetivos: los saca el overlay si el panel tiene marcado «Avisos propios»; el listado de kills de la derecha se deja) (`rele.interfaz`, se vuelve a mandar cada 5 s).

**Kick y Twitch a la vez:** OBS solo emite a un sitio, así que la emisión principal va a Kick y Twitch va con el complemento gratuito «Multiple RTMP outputs» (github.com/sorayuki/obs-multi-rtmp, versión fija en `instalar/multi-rtmp.js`). Si en `INSTALAR-PC2.bat` se escribe la clave de Twitch, el instalador baja el complemento de su página oficial, comprueba su huella SHA-256 y lo deja en `%ProgramData%obs-studiopluginsobs-multi-rtmp`, sin pedir administrador. Después pone en el perfil `Realizador` el destino de Twitch (`obs-multi-rtmp.json`), que arranca y para a la vez que la emisión principal y usa su mismo codificador. La clave solo queda en `opciones.local.json` de ese PC (`obs.emision.twitch.clave`). Está hecho para OBS 32.2: si no carga en otra versión, OBS lo ignora y Kick se emite igual.

**Clave de retransmisión (Kick):** `INSTALAR-PC2.bat` la pide (Enter para dejar la que ya tenga OBS) y la guarda solo en `opciones.local.json` de ese PC (`obs.emision.clave`), que nunca va en las descargas ni en git; `configurar-obs` la pone en el `service.json` del perfil `Realizador` con el servidor de `obs.emision.servidor` (el de Kick por defecto). No sale nunca en pantalla.

Queda a mano: la URL del overlay si no la encuentra en tus escenas (doble clic en `Overlay Gokudō`, o `obs.overlay` en `opciones.json`, o `--overlay URL`) y elegir la cámara en `Camara casters`.

Para cada directo, `windows/5-abrir-obs.bat` abre OBS con el búfer de repetición ya en marcha: sin búfer no hay repeticiones.

Al acabar la jugada, el agente guarda el búfer. Cuando llega el hueco tranquilo, carga el clip, salta a `Repeticion` y vuelve a `Juego` al terminar. La repetición enseña los últimos 12 s de la jugada y arranca `reglas.repeticion.colchon` segundos antes (1,5 por defecto), por si OBS tarda un poco en guardar el clip.

## Gokudō (opcional)

Los instaladores lo dejan activado en los dos PCs con la contraseña del panel (`"tenkaIchi": { "activo": true, "url": "wss://tenka-ichi.onrender.com/ws", "clave": "…" }`). El PC 1 manda al panel lo que enseña el overlay (línea por línea, gráfica de oro, ficha); el PC 2 solo mira si hay draft y cuántas cámaras lleva.

Los **enlaces de DraftCore** los crea la web de Gokudō por adelantado (todas las partidas del calendario que quedan, sin cuenta en DraftCore) y, al cargar una partida en el panel, se conecta sola a su draft: en el apartado DraftCore salen los enlaces de azul, rojo y espectador para copiarlos.

## El registro de cada partida

En `partidas/<fecha>_<partida>/`, al estilo del buzón de Planos embalaje: una carpeta por estado (`pendientes`, `guion`, `en-curso`, `emitidos`, `descartadas`) con un JSON por jugada, y `_registro/registro.jsonl` con una línea por decisión y por suceso.

## Por comprobar en la primera prueba real (fase 0)

Esto está hecho según la documentación y otros proyectos, pero hay que verlo con el juego:

- [ ] La Replay API funciona en un espectador en vivo (no solo en repeticiones) y `playback.length` crece con la partida.
- [ ] Seguir a un jugador: `selectionName` con el nombre del jugador (`rele.seleccionarPor: "jugador"`) o con el del campeón (`"campeon"`).
- [ ] El ángulo de la cámara al seguir (`rele.desplazamientoCamara`) y si `cameraMode: "top"` sirve de plano general.
- [ ] LiveEvents sigue funcionando (hay quien dice que Riot la quitó en el parche 14.1). Sin ella no hay dragones ni Barón: el panel muestra el punto de LiveEvents en rojo.
- [ ] El explorador sigue leyendo datos con la ventana minimizada.
- [ ] El perfil mínimo: los nombres de las claves de `perfilMinimo` y que con `PersistedSettings.json` en solo lectura se aplica y se restaura bien.
- [ ] Zoom: que `fieldOfView` y la distancia de `selectionOffset` cambian la vista como se espera, y ajustar los tres niveles de `rele.zoom`.
- [ ] Cuánto retraso añade el servidor de espectadores en partidas personalizadas.

## Estructura

```
opciones.json              margen, puertos, reglas, OBS, Gokudō y perfil mínimo
comun/                     opciones, peticiones HTTP y buzón de la partida
pc1/agente.js              arranque del PC 1
pc1/explorador.js          Live Client Data + LiveEvents → sucesos
pc1/cerebro.js             sucesos → jugadas → guion de planos y acciones (sin red: se prueba solo)
pc1/ejecutor.js            guion al relé, acciones en OBS y Gokudō, jugadas al buzón
pc1/panel.js, pc1/panel/   panel de supervisión
pc1/obs.js, pc1/tenka.js   clientes de obs-websocket y del panel de Gokudō
pc1/grabada.js             modo partida grabada (explora la repetición y luego la realiza)
pc2/rele.js                relé del PC 2 (antena, cámara con zoom, OBS en local)
comun/sala.js, puente.js   puente entre PCs: sala de Gokudō por internet, o anuncio en la red local
instalar/instalar.js       instalación de cada PC (lo usan INSTALAR-PC1.bat e INSTALAR-PC2.bat)
herramientas/capturar.js   captura de datos del juego (fase 1)
instalar/configurar-lol.js game.cfg, PersistedSettings.json, LiveEvents.ini y perfil mínimo
instalar/configurar-obs.js colección de escenas, perfil con búfer y WebSocket de OBS
windows/                   archivos .bat para hacer todo con doble clic
simulador/                 LoL de mentira y demo
test/                      pruebas
```

## Modo IA (opcional, solo PC 1)

Claude ayuda al realizador en lo que no es mecánico. **La cámara, los cortes, las transiciones y cuándo cabe cada cosa siguen siendo reglas**; la IA solo elige:

- **Overlay en los ratos tranquilos:** cada 25 s recibe un resumen de la partida (marcador en antena y real, rachas, jugadas que aún no se han emitido, ratos tranquilos por venir) y dice qué sale en el próximo hueco: gráfica de oro, ficha de un jugador o dejar el línea por línea porque se prepara una pelea.
- **Qué repetición va** si acaban a la vez varias jugadas que la merecen (en 30 s): solo se repite la que elige. Sin IA se repiten todas, como antes.
- **Titulares** y un **resumen final** al acabar la partida (en la pestaña Realización y en `partidas/<partida>/resumen.txt`).

Si la IA no contesta a tiempo (15 s para la repetición), falla o no hay clave, el realizador hace lo de siempre. Tras 3 fallos seguidos descansa 2 minutos. Si desde la última pregunta no ha cambiado nada (ni jugadas ni rachas) y su consejo aún no se ha usado, no vuelve a preguntar: el consejo sigue valiendo (por ejemplo, durante los 2 minutos de espera antes de que la partida llegue a la antena). Por si acaso, pregunta igual cada `repreguntarSegundos` (180).

Para encenderla: guarda la clave de la API en un archivo llamado `realizado` en Documentos del PC 1 y doble clic en `INSTALAR-IA.bat`. Pregunta el modelo (Sonnet 5.5 recomendado, Haiku 5.5 más rápido y barato), instala la librería si falta y hace una prueba. Vuelve a abrirlo para cambiar de modelo o apagarla. En `opciones.json` → `ia`: `cadaSegundos`, `repreguntarSegundos`, `esfuerzo`, `titulares`, `resumenFinal`, `archivoClave`.

La clave solo se lee en el PC 1 y solo va a la API de Anthropic: no se escribe en `opciones.local.json`, no sale en el registro ni en el panel, y no va al PC 2 ni al servidor de Gokudō. Si la pegas en el instalador, queda en `clave-ia.txt` (fuera de git).
