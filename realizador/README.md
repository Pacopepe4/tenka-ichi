# Realizador · beta

Realizador automático para directos de League of Legends. Decide la cámara del observer, lanza repeticiones y saca el línea por línea de TENKA ICHI, con **2 minutos de margen**: un cliente ve la partida casi en directo y otro la emite 120 s después, así que cuando algo sale en antena el realizador ya sabe cómo acaba.

- **PC 1 (el tuyo, poco potente):** el **agente**. Mira la partida en directo en segundo plano, agrupa los sucesos en jugadas, escribe el guion de planos y lleva el panel de supervisión.
- **PC 2 (el de emisión, potente):** el **relé**. No decide nada: mantiene la antena 120 s por detrás y mueve la cámara cuando llega cada plano del guion. OBS y el overlay de TENKA ICHI siguen como siempre.

Node 22 o superior, sin dependencias: `npm install` no hace falta.

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
4. **Realización:** la deja al principio en pausa. Dale al play: la cámara sigue el guion según el segundo de la repetición, aunque la pausas, la muevas o la aceleras. OBS (repeticiones) y TENKA ICHI (línea por línea) van igual que en directo, y el panel en http://localhost:4600/.

El guion completo queda en `partidas/<fecha>_<partida>/guion.json`. En `opciones.json` → `grabada`: `velocidadExploracion`, `desde` (segundo desde el que empezar) y `reproducirAlAcabar` (darle al play solo al acabar la exploración). Sin LoL: `npm run demo-grabada`.

## Montarlo en los dos PCs (directo)

Se descarga de la guía de TENKA ICHI (`/guia/#realizador`): **Realizador PC 1** y **Realizador PC 2** (este ya trae dentro el puente del marcador). La contraseña es la del panel de TENKA ICHI, la misma en los dos PCs y en el puente.

Una vez en cada PC:

1. **PC 2 (emisión):** cierra OBS, descomprime la carpeta y doble clic en `INSTALAR-PC2.bat`. Pide la contraseña, activa la Replay API en LoL, deja OBS configurado (escenas, búfer de repetición y WebSocket con esa contraseña) deja el puente del marcador con la misma contraseña y crea en el escritorio **Realizador PC2**. Si no encuentra el overlay de TENKA ICHI en tus escenas, pone el del servidor (`/overlay/`).
2. **PC 1 (explorador):** descomprime la carpeta y doble clic en `INSTALAR-PC1.bat`. Pide la misma contraseña, activa la Replay API y LiveEvents y crea **Realizador PC1**.
3. Si el cliente de LoL estaba abierto, reinícialo en los dos.

Si falta Node.js, el instalador intenta ponerlo con winget; si no puede, abre nodejs.org.

Cada directo: abre **Realizador PC2** (abre OBS con el búfer en marcha, el puente del marcador y el relé) y **Realizador PC1** (el agente y su panel en http://localhost:4600/). Los dos se encuentran solos en la sala del realizador del servidor de TENKA ICHI (`puente.url`, `wss://tenka-ichi.onrender.com/realizador`) con la contraseña, aunque estén en redes distintas. Luego, espectead la partida en los dos: el PC 1 la encuentra y empieza a realizar solo, y el PC 2 pone la antena 2 minutos por detrás.

- La contraseña no viaja: solo su huella (sha256), que hace de nombre de sala. El servidor no entiende nada, solo pasa mensajes de un PC al otro.
- OBS lo maneja el relé del PC 2 en local: el PC 1 le manda con el guion qué clip guardar y qué repetición lanzar, y en qué segundo de antena. Las repeticiones no viajan: se graban y se emiten en el PC 2. Con 2 minutos de margen sobra tiempo (el guion llega con más de 100 s de antelación).
- **El puente de TENKA ICHI (marcador) va en el PC 2**, no en el PC 1: tiene que ir con lo que se ve en antena.

Otros modos (en `opciones.local.json`): `"puente": { "modo": "red" }` con los dos PCs en la misma red (el PC 2 se anuncia y el PC 1 lo encuentra con `"rele": { "ip": "auto" }`), o la IP del PC 2 a mano en `rele.ip`. Por órdenes: `npm run configurar-pc1|pc2`, `npm run rele`, `npm run agente` (o `agente-ligero` con el perfil mínimo del juego).

## Empezar el directo con un botón

«Realizador PC1» y «Realizador PC2» abren cada uno su ventana (PC 1: http://localhost:4600/, PC 2: http://localhost:4601/). Las dos enseñan lo mismo en la pestaña **Directo**: qué falta para empezar (los dos PCs conectados, OBS, la partida en los dos LoL y el búfer de repeticiones), con qué hacer si falta algo, y el botón **Empezar directo**.

- Se puede pulsar en cualquiera de los dos PCs (o desde el panel de TENKA ICHI con el mensaje `panelEmision`), aunque falten cosas y antes de que empiece la partida. Queda **armado**.
- Cuando está todo, sale la cuenta atrás hasta que la partida llegue a la antena (los 2 minutos de margen). `emision.previaSegundos` (10) antes, el PC 2 pone la escena `Pausa`, arranca el búfer de repetición si no lo estaba y OBS empieza a emitir. Cuando la antena arranca en el segundo 0, pasa a `Juego`: la partida se emite desde el principio.
- Al acabar la partida (el PC 1 dice en qué segundo acabó; o el LoL del PC 2 deja de responder), pasa a `Casters` sin cortar la emisión, y la siguiente partida entra sola. **Terminar emisión** (dos clics) la corta.
- **Prueba: solo grabar** hace lo mismo pero grabando en el disco en vez de emitir.
- Si OBS no puede emitir (por ejemplo, sin clave de emisión en el perfil), sale el aviso en rojo y lo reintenta cada 10 s.

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
8. Desde el minuto 4, en un rato de 40 s sin nada, sale el línea por línea de TENKA ICHI (20 s, como mucho cada 3 min).

Todos los tiempos están en `reglas` de `opciones.json`.

## OBS (escenas, repeticiones y WebSocket)

En el PC donde va OBS (el PC 2, o el mismo PC en las pruebas), con OBS **cerrado**: doble clic en `windows/4-configurar-obs.bat` (o `npm run configurar-obs`). Deja hecho:

- **Colección de escenas `Realizador`** con `Juego` (captura de la ventana de LoL + overlay de TENKA ICHI), `Repeticion` (fuente multimedia `Repeticion clip`, overlay y rótulo REPETICIÓN), `Casters` (fondo, cámara y rótulo) y `Pausa` (fondo y rótulo). Los nombres salen de `obs` en `opciones.json`.
- **Perfil `Realizador`**: copia del perfil que usas ahora (clave de emisión, codificador, resolución) con el búfer de repetición activado (`obs.segundosBufer`, 45 s), el codificador x264 (`obs.codificador`; pon `""` para dejar el de tu perfil) y los clips en `Vídeos\Realizador`. Si no tenías perfil, uno nuevo a 1080p60.
- **Servidor WebSocket** activado en el puerto de `obs.url` con contraseña. La contraseña se apunta en `opciones.local.json` (`obs.clave`, `obs.activo: true`). Si el agente va en el otro PC, copia allí la contraseña que sale en pantalla y pon `"url": "ws://IP-DEL-PC-2:4455"`.
- OBS arranca con esa colección y ese perfil.

Tus colecciones y perfiles de siempre no se tocan (siguen en los menús de OBS), y lo que se cambia se copia antes en `%APPDATA%\obs-studio\realizador-copia\<fecha>\`. Se puede repetir las veces que haga falta: mantiene la contraseña.

Queda a mano: la URL del overlay si no la encuentra en tus escenas (doble clic en `Overlay TENKA ICHI`, o `obs.overlay` en `opciones.json`, o `--overlay URL`) y elegir la cámara en `Camara casters`.

Para cada directo, `windows/5-abrir-obs.bat` abre OBS con el búfer de repetición ya en marcha: sin búfer no hay repeticiones.

Al acabar la jugada, el agente guarda el búfer. Cuando llega el hueco tranquilo, carga el clip, salta a `Repeticion` y vuelve a `Juego` al terminar. La repetición enseña los últimos 12 s de la jugada y arranca `reglas.repeticion.colchon` segundos antes (1,5 por defecto), por si OBS tarda un poco en guardar el clip.

## TENKA ICHI (opcional)

`"tenkaIchi": { "activo": true, "url": "wss://TU-WEB/ws", "clave": "contraseña del panel" }`. El agente manda las mismas acciones que el panel (de momento, el línea por línea). El draft, el overlay y el marcador siguen funcionando igual.

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
opciones.json              margen, puertos, reglas, OBS, TENKA ICHI y perfil mínimo
comun/                     opciones, peticiones HTTP y buzón de la partida
pc1/agente.js              arranque del PC 1
pc1/explorador.js          Live Client Data + LiveEvents → sucesos
pc1/cerebro.js             sucesos → jugadas → guion de planos y acciones (sin red: se prueba solo)
pc1/ejecutor.js            guion al relé, acciones en OBS y TENKA ICHI, jugadas al buzón
pc1/panel.js, pc1/panel/   panel de supervisión
pc1/obs.js, pc1/tenka.js   clientes de obs-websocket y del panel de TENKA ICHI
pc1/grabada.js             modo partida grabada (explora la repetición y luego la realiza)
pc2/rele.js                relé del PC 2 (antena, cámara con zoom, OBS en local)
comun/sala.js, puente.js   puente entre PCs: sala de TENKA ICHI por internet, o anuncio en la red local
instalar/instalar.js       instalación de cada PC (lo usan INSTALAR-PC1.bat e INSTALAR-PC2.bat)
herramientas/capturar.js   captura de datos del juego (fase 1)
instalar/configurar-lol.js game.cfg, PersistedSettings.json, LiveEvents.ini y perfil mínimo
instalar/configurar-obs.js colección de escenas, perfil con búfer y WebSocket de OBS
windows/                   archivos .bat para hacer todo con doble clic
simulador/                 LoL de mentira y demo
test/                      pruebas
```
