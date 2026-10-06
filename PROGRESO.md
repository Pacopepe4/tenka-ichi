# Estado del proyecto

## 25/09/2026
- Bans de DraftCore corregidos (posicionales: ban1-5 azul, ban6-10 rojo), comprobado por el usuario con un draft real.
- Portada pública con baraja de los 13 clanes, ficha con plantilla, clasificación y campeones más presentes.
- Panel y overlay rediseñados con la identidad TENKA ICHI (Shippori Mincho B1 + Zen Kaku Gothic New, sumi/washi/shu).
- Plantillas de clan en `data-proyecto/plantillas.json` (no van a Sheets, por decisión del usuario).
- Registro en Sheets con columna Resultado (Victoria/Derrota). Solo picks y bans van a la hoja.
- `render.yaml` listo; falta que el usuario suba el repositorio a GitHub y cree el servicio en Render.

## 23/09/2026, 23:50

## Hecho y probado
- Descarga de Data Dragon (173 campeones, iconos y splash) con `npm run ddragon`.
- Conexión en directo con DraftCore como espectador: probada con el draft de prueba `EN5AQ2N` (turnos, hover y temporizador llegan bien).
- Overlay OBS con el diseño del draft TENKA ICHI (variante A): picks con splash, hueco activo animado, bans, temporizador, fearless y tarjeta de estadísticas al pickear/banear.
- Panel de producción: conexión DraftCore, enfrentamiento, clanes y jugadores, corrección manual de huecos, ganador, siguiente partida, nueva serie, vista previa del overlay.
- Registro local (`data/registro.json`) y cálculo de pick %, ban %, presencia, winrate e historial de jugador y clan.

## Escrito pero sin probar (necesita credenciales)
- Escritura y lectura en Google Sheets (`server/registro.js`), se activa con `GOOGLE_SHEET_ID` + `GOOGLE_CREDENTIALS`.

## Pendiente
1. Probar un draft real completo en DraftCore (hacer picks de verdad) y comprobar el orden de bans 7-10 y los picks de la fase 2.
2. Publicar en Render y conectar Google Sheets (guía en README.md; lo tiene que hacer el usuario: cuentas y claves).
3. Plantillas por clan en la hoja (pestaña "Plantillas") para rellenar jugadores solos al elegir clan.
4. Revisar el diseño del overlay en OBS a tamaño real y ajustar (fuentes de marca, animaciones de entrada).
5. Posibles variantes B y C del overlay (como en Canva).

## 26/09: competición

- Hecho: motor de liguilla + desempates + cuadro de playoffs (`server/competicion.js`), sorteo con semilla (`server/calendario.js`), simulación completa (`npm run simular`), sección de liga en la portada (clasificación, jornadas, cuadro, campeón), apartado Competición en el panel (sorteo y cargar la siguiente partida), opción Desempate en Fase.
- Simulación visible en https://tenka-ichi.onrender.com/?simulacion#liga (semilla 1509, campeón Tora).
- Pendiente: marcador de la serie Bo3 en el overlay; hacer el sorteo real desde el panel cuando estén los 10 clanes (se guarda en Sheets).
- Calendario y plantillas persistentes en Google Sheets (pestañas Calendario y Plantillas); las plantillas se pueden editar desde la hoja.

## 26/09: reforma del frontend

- Overlay rehecho: placas de equipo cortadas en diagonal con el kanji del clan de fondo, marcador de la serie en Bo3, temporizador en un sello hanko, escenario central con 0 a 4 cámaras (huecos transparentes con placa de nombre), franja inferior con la tarjeta de estadísticas y los bloqueados en fearless. Fondo de tinta propio con los huecos recortados.
- Panel: apartado Cámaras (cuántas y qué es cada una, con su medida para OBS); vista previa con la guía de huecos; arreglados el campo de semilla y el desbordamiento del draft.
- Portada: papel con el sol partido cortado en diagonal, como la portada de Canva; nueva sección «El camino al trono» con el formato.

## 26/09 (noche): directo, tier list y gachapon

- Directo: reproductor de twitch.tv/koryubudo en la portada, con ventanita flotante cuando hay directo.
- Tier list de jugadores y equipos (S–D), editable en el panel y publicada en la portada. Pestaña Tierlist en Sheets.
- Gachapon en /gachapon/: entrar con Twitch, 2 sobres al empezar, 3 cartas por sobre con rareza según la tier, más sobres con puntos del canal (recompensa creada por la web), regalos desde el panel. Pestañas Gachapon y Ajustes en Sheets.
- Pendiente del usuario: registrar la app en dev.twitch.tv y poner TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET y SESION_SECRETO en Render; conectar el canal desde el panel.
- Fantasy: alineación de una carta por rol, puntos por partida (jugar +1, ganar +3, K +1, D −1, A +0,5, MVP +3) con el KDA apuntado en el panel, clasificación de coleccionistas y cierre de alineaciones durante la jornada. Pestañas Estadisticas y Alineaciones en Sheets.

## 27/09: marcador de partida (overlay in-game) y paquete del directo en Drive

- Marcador en `/ingame/` al estilo de Blue Bottle con la estética de Tenka Ichi: asesinatos, oro (valor de los objetos), torres, larvas, dragones y alma, reloj, diferencia de oro, cuentas atrás (dragón, ancestral, Barón, buffs, inhibidores) y aviso con sello cuando un clan se lleva un objetivo.
- Puente para el PC del espectador (`puente/`, PowerShell sin instalar nada): lee la Live Client Data API y lo manda a `/api/partida`; oculta la barra de marcador del juego si la Replay API está activada. Se descarga desde la guía (zip hecho al vuelo, sin `clave.txt`).
- Panel: apartado Partida (resumen, ocultar o mostrar, partida de prueba). Guía: sección «Marcador durante la partida».
- Probado de punta a punta en local con un cliente de LoL falso (puente → servidor → overlay). Falta probarlo con una partida real en modo espectador para confirmar los nombres de los eventos nuevos (larvas, Atakhan) y la Replay API.
- Vídeos y música del directo fuera del repositorio: `koryu-budo/paquete-stream/` sincronizado con Drive y enlazado desde la guía. Borrado `public/stream/`.
- Pendiente del usuario: compartir la carpeta paquete-stream de Drive como «Cualquier persona con el enlace · Lector» cuando termine de subir.

## 27/09 (tarde): partida automática, temporizadores y cara a cara por líneas

- El puente (versión 2) se queda en espera toda la jornada y solo busca la partida cuando el panel lo pide: botón «Buscar la partida» o solo al completarse el draft. Deja de buscar cuando la partida termina y el cliente se cierra. El panel enseña en qué punto está (puente abierto, buscando, en juego, terminada) y avisa si el puente es de la versión anterior.
- Al terminar la partida, el KDA de las estadísticas del fantasy se rellena solo con los datos de cada línea.
- Temporizadores con ensō de pincel y kanji debajo del reloj (dragón, larvas o heraldo, Barón), con las reglas de 2026 (sin Atakhan, Barón a los 20:00, larvas a los 6:00, heraldo a los 15:00).
- Debajo de cada clan: buff de Barón y ancestral, punto de alma o alma (sello con el kanji del elemento) e inhibidores caídos. Avisos con el kanji del elemento del dragón.
- Línea por línea (objetos, oro, KDA, súbditos, nivel, muertes y brillo en racha), que se saca desde el panel.
- Pendiente: probarlo con una partida real en modo espectador (nombres de los eventos de larvas y heraldo, `GameEnd` de los espectadores y Replay API).
- Correcciones del línea por línea: sin título ni roles, con el logo de Tenka Ichi pequeño en medio, los objetos de cada jugador (iconos de Data Dragon en `public/ddragon/objeto/`, los descarga `npm run ddragon`), barra de oro más corta, nombres más pequeños, KDA y súbditos más grandes, y brillo en el retrato de quien va en racha.
- Shutdown aproximado en el línea por línea (moneda con «≈» junto al nombre, desde 100): el juego no lo da, se estima con las reglas de 26.03 (`RECOMPENSAS` en `server/partida.js`). Falta compararlo con el del juego en una partida real.
- El marcador ya no parpadea: si el cliente deja de contestar unos segundos, sigue con los últimos datos (se retira a los 20 s sin datos o cuando el panel deja de buscar). Los sucesos repetidos (al volver atrás en una repetición) cuentan una vez. El puente aguanta 4 fallos seguidos antes de dar la partida por terminada.
- Si la web se reinicia en plena partida, el puente sigue con ella y la búsqueda se retoma sola (sesión de arranque y `continua`), salvo que el panel la haya parado a propósito. Hace falta el puente nuevo.
- En las repeticiones, los sucesos «del futuro» (los que el cliente conserva al volver atrás) no cuentan hasta que el reloj llega a ellos.
- Rachas y shutdowns correctos aunque se entre a mirar con la partida empezada (quien no ha muerto lleva de racha todos sus asesinatos; nadie más de los que tiene). El línea por línea va abajo en el centro, tocando el borde, al 84 %. Puente versión 3: también sigue buscando si la web se reinicia mientras el cliente carga; el panel avisa si el puente es anterior.
- Si se entra a mirar con la partida empezada (o se salta en una repetición), el cliente no da los objetivos de antes: los temporizadores que no se pueden saber (dragón, larvas, heraldo, Barón ya aparecidos) no salen hasta que cae el siguiente, y el panel lo explica.
- Overlay de partida más pequeño (lo de arriba al 86 %, con reloj y asesinatos más pequeños; el línea por línea al 72 %). Avisos con el logo del clan en lugar del kanji y nuevos avisos: torres (cuál y de qué línea), larvas (agrupadas), primera sangre, triple/quadra/pentakill y ace. Los avisos van por cuándo llegan, no por el reloj (en repeticiones aceleradas no se perdían). El panel enseña qué sucesos da el cliente.
- Como espectador, el cliente de LoL no da dragones, heraldo ni Barón (limitación conocida de la Live Client Data API). El panel los marca a mano (botones por clan y tipo de dragón, heraldo y Barón, y deshacer); los dragones de cada clan salen debajo del reloj con 4 huecos hasta el alma. Los temporizadores que ya han pasado su primer momento solo salen si se sabe algo (el cliente da esos sucesos o se están marcando). Los avisos propios van apagados por defecto: se ven los del propio LoL (se encienden en el panel).

## 28/09: base del gachapon sin cartas, Twitch simulado y puntuación con los datos de fin de partida

- Twitch: la web valida los tokens guardados al arrancar y cada hora, como exige Twitch; si el canal retira el permiso o cambia la contraseña, el panel avisa «vuelve a conectarlo» y deja de recoger canjes. El token de aplicación se renueva solo si Twitch lo rechaza.
- Twitch falso (`scripts/twitch-falso.js`) y `npm test`: 30 pruebas, entre ellas una de punta a punta con la web entera (entrar, sobres, canal, canjes, tokens caducados y retirados, regalos, reinicio y una partida del fantasy). Con ellas salió un fallo: quien recibía sobres regalados o canjeados antes de entrar por primera vez se quedaba sin los 2 de bienvenida. Arreglado.
- Cartas: tier S+ para personajes de fuera de los clanes (`data-proyecto/cartas-especiales.json`, vacío de momento), que pesa 0,5 en el sorteo (el sorteo ahora acepta decimales). Dibujo propio por carta en `public/cartas/ID.png` y marco por tier en `public/cartas/marcos/` (SP, S, A, B, C; la D usa el de la C); mientras no estén, las cartas se ven como hasta ahora. Probado con marcos de prueba en la vista previa (`npm run vista-previa`).
- Puntuación del fantasy (`server/puntuacion.js`): KDA, sin morir, farmeo, visión, daño, primera sangre, multikills, participación en asesinatos, torres y MVP, con desglose. El puente saca la visión, la primera sangre, los multikills y las torres; el daño se apunta en el panel. Hoja Estadisticas con columnas nuevas al final.
- Pendiente del usuario: el Excel con los campeones de cada carta; los marcos del chat web en `public/cartas/marcos/` (para ajustar dónde van el nombre, el emblema y el rol); registrar la app en dev.twitch.tv y conectar el canal para probar con Twitch de verdad.
- Pendiente: probar la puntuación con una partida real (¿da el cliente como espectador la primera sangre y los multikills?); leer la pantalla final del cliente (LCU `lol-end-of-game`) desde el puente para rellenar también el daño; animación nueva al abrir sobres con brillo especial de la S+.

## 30/09: marcos de las cartas, clases Jugador y BOOST, y reverso

- Dos alternativas de marco hechas en un lienzo de diseño: «washi» (papel y tinta) y «laca» (laca de armadura con cordones de colores), cada una con su reverso.
- Elegido: cartas de **Jugador** (S, A, B, C) en washi y cartas **BOOST** (S+, S, A, B) en laca: la S+ toda de oro (la laca A elegida por el usuario, con 6 remaches, 天下一 y el sello S+), la S roja, la A de plata con cordones blancos y la B de hierro con cordones añil. Reverso washi común para todas. Hecho también un marco D de Jugador por si la D se queda en la tier list.
- Guardadas para ediciones especiales: la laca completa y la S+ washi con torii (en el lienzo y en `diseno/marcos/svg/guardadas/`).
- Web: las cartas especiales pasan a ser BOOST (`data-proyecto/cartas-boost.json`, con tier S+, S, A o B); marcos por clase en `public/cartas/marcos/jugador|boost/` (WebP de 700 px: de 9 a 80 KB los marcos y 173 KB el reverso) y reverso común en la apertura de sobres. `diseno/marcos/generar.mjs` y `exportar.mjs` los rehacen.
- Pendiente del usuario: decidir si la D se queda en la tier list (las de Jugador son S, A, B, C) y qué hace cada BOOST en el fantasy; los dibujos de cada carta (Excel de campeones).

## 30/09 (noche): primeras cartas reales, campeón como fondo y BOOST vinculadas a un jugador

- Plantillas de SARU, KAIJU y TORA con sus cinco jugadores (`data-proyecto/plantillas.json`) y su tier (copia local `data/tierlist.json`, que no se sube a GitHub). Los otros 12 clanes siguen sin jugadores ni tier, así que sus cartas aún no existen.
- Campeón de cada carta, jugadores y BOOST, en `data-proyecto/campeones-cartas.json` (id de Data Dragon por id de carta; uno desconocido se descarta con un aviso en el log). **Solo decide el fondo**: la carta usa el splash del campeón (`/ddragon/splash/ID.jpg`) mientras no tenga un dibujo propio en `public/cartas/`, y nunca escribe su nombre. Orden del fondo: dibujo propio, splash del campeón, imagen del clan, sol partido. El campeón va con el puesto (CLAN-ROL), no con la persona.
- Cinco cartas BOOST en `data-proyecto/cartas-boost.json`: MAKITAH «El Titiritero» (Syndra), SONS «The CEO» (Sejuani), IGRID «Topfather» (Jayce) y LOLEX «El Pequeñísimo» (Zeri), S+ y ×3; GYPSICUACK «El Gitano» (Ornn), S y ×2. Cada una lleva `multiplicador` y `condicion` (`dano`, `participacion`, `dano-torres`, `cs` o `asistencias`); sin una condición conocida y más de ×1 no hay bonus. Sale en la carta como «×3 · más daño» y la frase entera al pasar el ratón.
- **Fantasy con BOOST** (`server/fantasy.js`): una alineación lleva 5 jugadores (uno por rol) y hasta **2 BOOST**; cada BOOST se vincula a uno de los jugadores alineados y un jugador solo lleva una. Hay que tener la BOOST (tantas veces en la alineación como copias). Si se deja vacío el hueco de un jugador, se suelta su BOOST. En la página hay dos huecos de BOOST bajo los de rol: se elige la carta y luego el jugador.
- Bonus: si el jugador vinculado es «el que más X» de los diez de la partida, sus puntos de esa partida se multiplican (el extra son sus puntos × (multiplicador − 1), y nunca resta). Un empate en lo más alto cuenta para todos los empatados; si a alguno de los diez le falta el dato, no se sabe y no hay bonus. Va con la alineación que se tenía cuando se guardaron las estadísticas de la partida. `yo.puntosBoost` dice cuántos puntos vienen de las BOOST.
- Daño a torres: columna nueva al final de Estadisticas («Daño a torres») y casilla «Torres» en el panel; solo sirve para la BOOST de IGRID, no puntúa. No lo da el puente (la Live Client Data API no lo tiene): se apunta a mano de la pantalla final o, si algún día se usa match-v5, sale de `damageDealtToTurrets`. Pestaña Alineaciones: cuatro columnas nuevas al final (Boost 1, Vinculada 1, Boost 2, Vinculada 2); las filas antiguas se leen sin BOOST.
- Pruebas: 36 (cartas con campeón y fondo, bonus de BOOST, condiciones, alineación con límites y bonus por partida). La prueba de Twitch usa ahora BOOST y campeones propios para no depender de los del proyecto.
- En Render los nombres y las tiers viven en Google Sheets (pestañas Plantillas y Tierlist), así que los de este día no llegan solos: hay que meterlos por el panel o pegarlos en la hoja. Los campeones y las BOOST sí llegan al desplegar, porque salen del repositorio. Las columnas nuevas de Sheets se crean solas al escribir (Estadisticas se reescribe entera); a la cabecera de Alineaciones, que ya existe, le faltarán los títulos de las cuatro nuevas (cosmético). **Estadisticas ya ocupa las 26 columnas A:Z** que lee y borra `server/sheets.js`: la próxima columna nueva exige ampliar ese rango.
- Pendiente: probar el formulario nuevo del panel con una partida (el resto se probó en pantalla con datos de prueba); decidir si el bonus de daño a torres se rellena con el LCU (`lol-end-of-game`) desde el puente.

## 30/09 (noche): inicio de sesión con Discord
- Con Twitch no se puede entrar, así que el gachapon y el fantasy usan **Discord** (OAuth2, permiso `identify`; cualquiera con Discord, sin exigir estar en un servidor). Módulo nuevo `server/entrada-discord.js`; rutas `/auth/discord` y `/auth/discord/callback` en `server/index.js` (`rutasTwitch` pasa a `rutasSesion`); botón «Entrar con Discord». La cuenta es `discord-<id>` y no se guarda ningún token de Discord.
- Twitch queda dormido pero no borrado: sin `TWITCH_*` no hace nada; si se configura, sale un segundo botón «Entrar con Twitch» y los sobres por puntos del canal llegan solo a quien entra con Twitch (son cuentas distintas, dos colecciones). El panel lo explica en la caja «Canal de Twitch (opcional)».
- Los nombres de Discord son texto libre: se limpian al entrar (sin caracteres invisibles, de control ni de dirección; máximo 32; sin `= + - @` al principio) porque Sheets escribe con `USER_ENTERED` y eso sería una fórmula.
- Arreglado de paso: `volver` aceptaba `//sitio.com` y `/\sitio.com` (redirección abierta tras entrar); ahora solo rutas de la propia web, también con Twitch.
- Pruebas: `test/entrada-discord.test.js` (16) con `scripts/entrada-discord-falso.js`; `npm test` 59 en verde. Probado en el navegador con el Discord falso (`tenka-entrada-discord` en launch.json).
- Pendiente del usuario: crear la app en discord.com/developers, añadir las redirecciones (`/auth/discord/callback` en Render y en local) y poner `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` y `SESION_SECRETO` en Render (pasos en el README).
- Pendiente: probarlo con Discord de verdad; decidir cómo se consiguen sobres extra sin los puntos del canal; los regalos por nombre toman al primero si hay dos personas con el mismo nombre. Las hojas de Sheets que ya existan conservan la cabecera «Twitch ID» (cosmético).

## 30/09 (noche): animaciones, panel más claro y Discord enganchado (SIN SUBIR: se sube mañana)

Todo está en commits locales en master; no se ha hecho push para no cambiar la web publicada mientras el usuario duerme. Mañana: revisar, `git push` y configurar Discord.

- Guardado en commits aparte el trabajo de las otras sesiones (entrar con Discord, campeones del Excel, BOOST con multiplicador) y la publicación en Discord.
- Animaciones: los botones de todas las páginas responden suave al pasar, pulsar y enfocar (marca.css). En el gachapon, las cartas salen del sobre en abanico, se levantan al girarlas, las boca abajo se asoman al pasar el ratón, las S y S+ se descubren con un destello que las cruza, y el álbum entra escalonado (solo la primera vez y al cambiar de filtro, no en cada refresco). Todo respeta «reducir movimiento».
- Panel: el índice de arriba marca el apartado que se está viendo, el botón pulsado espera la respuesta y hace un destello verde si ha ido bien, los avisos entran suaves y los apartados no quedan tapados por la barra al saltar a ellos.
- Discord enganchado: «Descargar imagen» y «Publicar en Discord» en Colección y en Fantasy (el de publicar solo sale si hay webhook), y en el panel, apartado Tier list, descargar y publicar la tier list (con la contraseña del panel). Ruta POST /api/discord/publicar. Sin webhook, avisa de que falta.

### Prueba general de mañana (lista)
1. `npm test` (61 pruebas en verde esta noche) y arrancar la prueba local (`tenka-prueba-cartas` en el panel de vista previa, http://localhost:3057/auth/prueba?nombre=Koryu).
2. Gachapon: abrir sobres (abanico, girar de una en una y «Descubrir todas», destello de S y S+), álbum y filtros, alinear jugadores y BOOST.
3. Descargar las imágenes de colección y alineación; mirar que la alineación salga bien con las BOOST vinculadas (la imagen de ahora solo pinta los cinco jugadores).
4. Panel: índice que marca el apartado al bajar (no se pudo comprobar esta noche con la ventana en segundo plano), destello verde al guardar, tier list descargada.
5. Discord: crear el webhook del canal (Ajustes del servidor › Integraciones › Webhooks), ponerlo en Render como DISCORD_WEBHOOK_URL (y DISCORD_WEBHOOK_TIERLIST si la tier list va en otro canal) y, para entrar con Discord, DISCORD_CLIENT_ID y DISCORD_CLIENT_SECRET (README). Probar a publicar colección, alineación y tier list.
6. `git push` cuando todo esté bien y comprobar la web publicada.

## 04/10: directo a prueba de reinicios, overlay automático, postdraft, pantalla final y jornada del fantasy

- **Estado guardado:** lo que el panel tiene puesto (enfrentamiento, equipos, draft, cámaras, resultados, vista del overlay, búsqueda de partida y pantalla final) se guarda en Ajustes y vuelve tras un reinicio; DraftCore se reconecta solo. Probado parando y arrancando la web de prueba: volvió con el draft, los equipos, la pantalla final y el código de directo en marcha.
- **Overlays que se recargan solos** cuando la web cambia de versión (el panel avisa con un botón). Estáticos con ETag y caché de un día para las imágenes. Puente versión 4: mismos datos, mensajes más claros y aviso cuando vuelve la conexión.
- **Overlay automático** (`server/vista.js`): draft → postdraft → partida → final, y el panel puede forzar cualquiera («En el overlay», arriba). Ya no hace falta la fuente de `/ingame/` aparte.
- **Postdraft:** cada jugador con su carta, su campeón y lo que lleva con él («FIRST PICK» si lo estrena), sus números de la liga y sus puntos del fantasy; en el centro, los dos clanes con su porcentaje de victorias, cara a cara, medias, racha y campeones más jugados (`server/previa.js`, `/api/previa`).
- **Pantalla final:** resultado, duración, tabla por líneas, totales de cada clan y MVP con su carta. Sale del marcador o, sin puente, del draft y de lo que apunte el staff.
- **Panel por fases** (Antes del partido, Draft, Partida, Resultado, Liga y gachapon, Todo), que sigue sola al overlay. Las estadísticas del fantasy van un clan debajo del otro (antes se montaban las columnas).
- **Gachapon:** sin repetidas dentro de un sobre; fundir 5 repetidas por un sobre; códigos de directo que salen en el overlay y se canjean en la web; emblema de Koryu Budo en el círculo de las BOOST; la imagen de la alineación lleva las BOOST. La carta es ahora un componente común (`public/carta.js` y `carta.css`).
- **Jornada del fantasy:** las alineaciones se cierran solas al empezar el draft o la partida; «Terminar la jornada» da 3, 2 y 1 sobres a los tres primeros de la jornada (se cambia en el panel), abre las alineaciones y publica la clasificación en Discord. Clasificación general y por jornada en el gachapon y en la portada (sección Fantasy).
- **Portada:** cabecera arreglada en el móvil; «Ver carta» en cada jugador (plantilla del clan y tier list) con su carta y sus números; campeones más jugados de cada clan.
- Pruebas: 74 (`test/vista.test.js` y `test/jornada.test.js` nuevas, con el flujo de paquetes del puente). Probado en pantalla con una liga de prueba: `npm run prueba-directo` (`tenka-prueba-directo` en launch.json, puerto 3060) arranca la web con partidas, estadísticas y coleccionistas inventados y el overlay ya en el postdraft.
- Premios de jornada confirmados por el usuario: 3, 2 y 1 sobres (el tercero, 1).
- Pantalla final: el daño de cada jugador va en una barra fina debajo de él, con la cifra en medio; se llena hacia el centro de la pantalla (la azul de izquierda a derecha y la roja en espejo: al usuario no le gustó que saliera del centro).
- Descartado por el usuario: marcar dragones con teclas o Stream Deck, la carta del jugador al hacer pick y una web de pruebas aparte.
- **Pendiente:** probarlo con una partida real como espectador (¿llega `GameEnd`? Si no llega, la pantalla final sale cuando el cliente se cierra); las cámaras no salen en el postdraft (el centro es para los clanes); webhook y login de Discord en Render.

## 04/10: dibujos propios de las 20 cartas

- Las 20 cartas que existen (SARU, KAIJU, TORA y las 5 BOOST) tienen ya su dibujo en `public/cartas/<ID>.webp` (1024 px, ~270 KB cada uno, 5,5 MB en total). Son el campeón de cada carta reinterpretado en Google Flow con la estética de Tenka Ichi (tinta irezumi y ukiyo-e, detalles en el color del clan; las BOOST en oro viejo). La web los usa solos en lugar del splash de Riot: no ha hecho falta tocar código.
- Los originales en 2K no están en el repositorio: `koryu-budo/gachapón/`. El método, los prompts y el script que los convierte, en `koryu-budo/flow/cartas/`.
- Comprobado en local con las 20 cartas dentro de su marco (ninguna imagen rota). Subido a GitHub el 04/10.
- Pendiente: los otros 12 clanes no tienen jugadores, tier ni campeón, así que no tienen carta ni dibujo.

## 04/10 (noche): las BOOST S+ a todo color y «full art»

- Decisión del usuario: las cartas de mayor rango destacan progresivamente, sobre todo las BOOST. Las de jugador se quedan con el estilo sobrio (tinta, hueso y el color del clan). Las cuatro BOOST S+ (MAKITAH, SONS, IGRID y LOLEX) tienen dibujo nuevo a todo color; MAKITAH, «El Titiritero», lleva hilos de marioneta. GYPSICUACK (S) sigue en tinta y oro.
- **Carta «full art»**: si una carta tiene un dibujo vertical en `public/cartas/fullart/<ID>.webp` (1000×1400), el catálogo lleva `fullart` y `cartaHTML` la pinta a carta completa, sin la imagen del marco: filo de oro, sello y emblema arriba, y estrellas, nombre, apodo y multiplicador abajo sobre el dibujo (`.carta-g.fullart` en `public/carta.css`, todo en cqw para que escale sola). `arte` (el cuadrado) y `marco` no cambian. De momento solo las cuatro S+; vale para cualquier carta con solo poner su archivo.
- En `public/gachapon/gachapon.css`, los tamaños fijos de la carta sin marco van con `:not(.con-marco):not(.fullart)`.
- Comprobado en local a 84, 142, 170, 300 y 380 px, y apagada (cuando no se tiene). 75 pruebas.
- Pendiente: las imágenes para Discord (`public/compartir.js`) siguen pintando estas cuatro con marco y el dibujo cuadrado.

## 04/10 (noche): Amateratsu pasa a equipo Legacy

- Amateratsu conserva logo, arte, lema, descripción y plantilla, pero queda apartada de la competición: `legacy: true` en `server/clanes.js`. No entra en el sorteo ni en la tier list (sin cartas ni fantasy) y en la portada sale debajo de la baraja con la etiqueta «Legacy». Se sigue pudiendo poner en el overlay desde el panel.
- La portada habla ahora de doce clanes («Los doce clanes», «Doce clanes, un solo reino», «Diez de los doce clanes juegan la temporada» y la descripción para buscadores).
- Imágenes de Discord: las cartas full art salen a carta completa, como en la web. Norma del usuario: lo que esté en la web y en Discord se cambia en los dos sitios en el mismo cambio.
- Pruebas: 78 (`test/clanes.test.js` nueva).

## 04/10 (noche): cartas LEGACY

- **Plantilla de Amateratsu:** GAATSU, DEXTYLE, MAKITAH, D4DT0R y SERGI (algunos compiten además con otro clan). En la web publicada la plantilla vive en la pestaña Plantillas de Google Sheets: hay que guardarla desde el panel.
- **Clase nueva de carta, LEGACY** (`data-proyecto/cartas-legacy.json`, `tipo: 'legacy'`): de colección, no se alinean ni sirven de BOOST. No entran en el sorteo de las tres cartas del sobre (peso 0): en el 3 % de los sobres (`PROBABILIDAD_LEGACY`) sale una, además, como carta extra (`sacarLegacy` en `server/gacha.js`; la apertura la enseña la última, con el aviso «Carta extra»). Van primero en el álbum y sus repetidas se funden como las demás.
- **Estética:** como las S+ a carta completa, con «LEGACY» en una placa de oro en lugar del sello y solo el título debajo del nombre (sin estrellas ni multiplicador). Igual en la web (`public/carta.js`, `carta.css`) y en las imágenes de Discord (`dibujarCompleta` en `public/compartir.js`).
- **Cartas:** GAATSU «DEMON» (Aatrox), MAKITAH «EL TITIRITERO» (Tristana), D4DT0R «THEBEAST» (Aphelios) y SERGI «THE ENGAGE» (Rell). DEXTYLE «JUNGAP» está guardada sin activar: el usuario dará su campeón más adelante (hay que pedírselo).
- **Sin dibujo no salen:** una LEGACY no existe hasta que tiene su vertical en `public/cartas/fullart/<ID>.webp`. El usuario no las quiere con el splash de Riot («ese es el splashart original, no el nuestro»): los dibujos los hace la sesión de las cartas (encargo enviado el 04/10) y, al subirlos, las cartas aparecen solas. `LEGACY_SIN_DIBUJO=1` (lo pone `npm run prueba-directo`) las deja salir con el splash para probar.
- **Portada:** la ficha de Amateratsu enseña sus cartas LEGACY (`cartas` en `/api/clan`) y cada una se abre en grande. El gachapon explica la carta extra debajo de la tabla de probabilidades.
- Comprobado en local con la demo (álbum, sobre con carta extra, ficha de Amateratsu y la carta de la web junto a la de las imágenes de Discord). Pruebas: 82 (`test/legacy.test.js` nueva).
- **Dibujos (04/10, noche):** los cuatro, en vertical de 1000×1400 (`public/cartas/fullart/LEGACY-<NOMBRE>.webp`) y con su cuadrado de reserva (`public/cartas/LEGACY-<NOMBRE>.webp`). Los hizo la sesión de las cartas con los colores de Amateratsu (negro, hueso y oro); los originales en 2K están en `koryu-budo/gachapón/fullart/`. Con ellos las cuatro LEGACY ya salen en la web. Comprobadas en la demo, la carta de la web junto a la de las imágenes de Discord: en la de SERGI el emblema cae sobre la punta de la lanza.
- **El nombre es GAATSU:** el usuario lo revisó el 04/10 («Gattsu» fue una errata suya y estuvo puesto unos minutos).
- **Dextyle (04/10, noche):** el usuario dio su campeón en la sesión de las cartas («haz la Qyana de Dextyle, el mote dejale JUNGAP»). Carta activada (`LEGACY-DEXTYLE`, Qiyana, «JUNGAP») y dibujo subido: ya son las cinco LEGACY.
- **Pendiente:** guardar la plantilla de Amateratsu desde el panel.

## 04/10 (noche): mejoras del marcador de partida (rama `ingame-mejoras`, sin unir)

Diseño aprobado en `docs/superpowers/specs/2026-10-04-ingame-mejoras-design.md`; plan en `docs/superpowers/plans/2026-10-04-ingame-mejoras.md`. Todo en la rama `ingame-mejoras`, con pull request en borrador hacia `master`: lo une el usuario cuando elija versión.

- **Dos versiones del marcador, elegibles desde el panel** («Estilo del marcador: A / B», se guarda con el estado del panel). Mismo HTML y mismos datos; `ingame.css` lleva lo común (estructura y animaciones) y `estilo-a.css` / `estilo-b.css` cada aspecto, acotado a `[data-estilo]`: para quedarse con una, se borra el archivo de la otra y su `<link>`. `?estilo=a|b` en `/overlay/` o `/ingame/` fuerza una versión (dos pestañas o dos fuentes de OBS para compararlas).
  - **A «retoque»:** la composición de siempre con más color: lavado del color del clan y su kanji de fondo en cada placa, oro viejo en filos y sellos, dragones como sellos bajo cada lado, diferencia de oro del color del clan que va por delante.
  - **B «full art»:** estandartes del color de cada clan con olas seigaiha y filo de oro redondeado (como `.carta-g.fullart`), asesinatos en sello redondo, reloj en ensō, temporizadores y módulos en píldoras, línea por línea con cada duelo en su pergamino y retratos redondos, ficha con el estandarte del clan.
- **Oro estimado por ingresos** (`INGRESOS` en `server/partida.js`): inicial, pasivo, súbditos, asesinatos y asistencias (del reparto que ya hacía `estimarRecompensas`), torres, Barón y heraldo; nunca por debajo del valor de los objetos (`oroObjetos` e `ingresos` van aparte en cada jugador y clan, también para la tanda 2). Comprobado en la wiki el 4/10: inicial (500), pasivo (20,4 cada 10 s desde 1:05) y oro de torres; sin comprobar: media por súbdito, Barón y heraldo. Siempre con «≈» en pantalla.
- **Puntos de fantasy provisionales** (`puntos` y `kp` de cada jugador): `puntuar` con lo que hay en vivo, sin daño, victoria, MVP ni BOOST. Salen en el línea por línea (en cada duelo, con el que va por delante resaltado) y en la ficha, marcados «pts ≈».
- **Resumen de pelea:** muertes a 12 s o menos de la anterior son la misma pelea; cerrada a los 12 s sin muertes y con tres o más, aviso con el marcador por clan y quien hizo dos asesinatos o más. Una vez por pelea; va por cuándo se cierra, como el resto de avisos.
- **Ficha de jugador** (panel: clan, jugador y «Sacar la ficha», con duración): carta del gachapon del puesto (`/api/jugador`) o, si no la tiene, el splash de su campeón; KDA, CS por minuto, participación, visión, nivel, oro, objetos y puntos provisionales.
- **Gráfica de oro** (panel: «Sacar la gráfica de oro», con duración): el servidor guarda la diferencia cada 15 s de partida (`grafica.muestras`; un retroceso corto del reloj tira las posteriores); área en SVG con el color de cada clan a su lado del cero, barras finas que entran escalonadas y eje en minutos. Con menos de dos minutos de datos el panel avisa y no saca nada.
- **Interruptores** en el apartado Partida, encendidos por defecto y guardados: resumen de pelea, puntos del fantasy y oro por ingresos (apagado vuelve al valor de los objetos). La ficha y la gráfica van con su botón.
- **Línea por línea nuevo:** más grande (sin texto por debajo de unos 20 px reales, salvo el rótulo «pts ≈» de la cabecera a 15 px), solo los objetos que se tienen y el abalorio aparte, diferencia de oro y puntos en el centro; se mantienen el logo de Tenka Ichi, KDA, súbditos, nivel, brillo de racha y el shutdown aproximado.
- **Acabado y animaciones:** duraciones y curvas en variables CSS; toda pieza entra y sale con animación (filas y barras de la gráfica escalonadas, cifras que cuentan hasta el valor nuevo con un latido); solo se anima `transform` y `opacity` (los brillos de racha y de objetivo vivo son halos que laten en opacidad, sin filtros ni sombras animadas). `?demo=aviso,multi,pelea` en la dirección encola avisos de muestra para colocar el overlay en OBS.
- Partida de prueba: compras cada 120 s y el apoyo compra menos de la mitad, para que el oro en objetos no se dispare.
- Pruebas: 92 (`test/ingame.test.js` nueva: oro por ingresos, puntos, peleas y muestras). Comprobado en pantalla a 1920×1080 con `npm run prueba-directo` en las dos versiones: barra, temporizadores, módulos, aviso, resumen de pelea, línea por línea, ficha (con carta y sin ella) y gráfica, con capturas (WebP) en `docs/capturas/ingame/` (también a mitad de animación y en partida larga: seis objetos, alma, Barón y ancestral a la vez, nombre largo y cifras de cinco dígitos).
- **No se ha podido comprobar:** las fuentes de marca (Google Fonts no era accesible desde el entorno de la sesión: las capturas usan Noto Serif/Sans CJK en su lugar, así que los pesos y anchos reales con Shippori Mincho y Zen Kaku Gothic pueden variar un poco); la fuente de navegador de OBS (se evitó `color-mix()` y se puso `-webkit-mask-image` junto a `mask-image` por si el Chromium de OBS es antiguo); una partida real (las peleas y el oro estimado solo se han visto con la partida de prueba y con las pruebas automáticas). El registro de npm tampoco era accesible: `ws`, `socket.io-client` y `google-auth-library` se cubrieron con sustitutos locales fuera del repositorio; `package.json` no cambia.
- Pendiente del usuario: elegir versión (y borrar la otra), probar con una partida real como espectador y, en la tanda 2, comparar el oro estimado con el real del LCU.

## 05/10: portada, versión B «Full art» (rama `web-frontend-b`)

- El usuario pidió dos versiones más refinadas de la web con el mismo estilo y eligió empezar por la portada. Esta es la B; la A («Tinta») está en `web-frontend-a`. El diseño, en `docs/superpowers/specs/2026-10-04-web-frontend-design.md` (añadido del 5/10). Ninguna toca `master`.
- **Estructura común a las dos:** kanji de cada sección, enlace «Ver la liga», cierre con el lema y enlaces en el pie (`index.html`); color del clan en filas, cruces, series y fichas de tier y aviso `clan-activo` de la baraja (`inicio.js`); `public/inicio-movimiento.js` (entrada de las secciones, sección activa en el menú, barra que se aparta al bajar en el móvil, baraja que se reparte y fichas que se cierran con transición); variables nuevas en `marca.css` (no cambia ninguna de las que había).
- **Versión B:** `inicio.css` rehecho con el lenguaje de las cartas a carta completa: portada enmarcada en oro, secciones cortadas en diagonal con el oro en el corte (formato sobre papel, fantasy alzado, cierre sobre laca), sello y kanji grande en cada cabecera, clasificación y cuadro en placas con el color del clan, podio del fantasy en oro, plata y bronce, y tier list teñida de cada tier. La sección de los clanes se tiñe del clan que sale de la baraja y su carta se inclina hacia el puntero (final de `inicio-movimiento.js`; `data-kanji` en las cabeceras).
- Comprobado en local con `tenka-web-b` (puerto 3062), a 1440 y 390 px, con la liga de prueba y con `?simulacion`: portada entera, ficha de clan, «Ver carta» y el gachapon (que carga `inicio.css`). Sin desplazamiento horizontal en el móvil. 82 pruebas. Capturas en `docs/capturas/web/`.
- No comprobado: el directo de Twitch encendido (ventanita flotante) y un navegador que no sea Edge/Chrome.
- Pendiente: que el usuario elija versión; después, gachapon y guía con la elegida.

## 05/10 (noche): la B es la elegida; gachapon, guía e imágenes de Discord (rama `web-frontend-b`)

- El usuario eligió la versión B («Full art»). Esta rama pasa a ser la de entrega; `web-frontend-a` queda sin tocar.
- **Gachapon** (`public/gachapon/`): mismo lenguaje que la portada B. Cabecera enmarcada en oro, sello y kanji por sección, fantasy y puntos en bandas cortadas en diagonal, podio en oro, plata y bronce, barra de progreso de la colección, repetidas con pastilla de oro. El menú y el pie, como los de la portada.
- **Apertura de sobres nueva:** el sobre llega (ahora con su banda y su filo), un trazo de oro lo corta con un fogonazo y las cartas salen en abanico. Las S, S+ y LEGACY se celebran al descubrirlas: destello, barrido, chispas (`celebrar` en `gachapon.js`) y fogonazo de su color; a las S+ y las LEGACY les queda un halo girando. «Descubrir todas» ya no vuelve a girar las que estaban descubiertas.
- **Arreglo de paso:** los filtros de rol de «Puntos de los jugadores» también cambiaban el filtro del álbum (el selector cogía todos los `.filtros button`). Ahora cada grupo de pestañas es solo suyo.
- **Guía** (`public/guia/`): carga también `inicio.css`. Misma barra y pie, sello en el título, índice que escribe `guia.js` con los títulos de las secciones, pasos unidos por una línea, notas como apartes y enlaces en placas.
- **Imágenes de Discord** (`public/compartir.js`), en el mismo cambio que la web: tier list (placa teñida, letra en diagonal, filo de oro en la S, color del clan en cada ficha; el color lo pide a `/api/clanes`), clasificación del fantasy (podio en oro, plata y bronce), raya de oro en la cabecera y pastilla de oro en las repetidas. `panel.js` no cambia.
- **Común:** `public/efectos.js` (`revelarAlAsomar` y `cierreSuave`), que usan `inicio-movimiento.js` y `gachapon.js`.
- Comprobado en local con `tenka-web-b` (puerto 3062), a 1440 y 390 px: portada (baraja, fichas), gachapon entrando con `/auth/prueba?nombre=Koryu` (abrir sobres con y sin carta extra, una S+ simulada cambiando la tier de una carta en la página, elegir carta, fundir, filtros), guía y las tres imágenes de Discord pintadas en la página. Sin desplazamiento horizontal en el móvil. 82 pruebas. Capturas en `docs/capturas/web/`.
- No comprobado: una S+ de verdad saliendo de un sobre, publicar en Discord de verdad, el directo de Twitch encendido, el modo de movimiento reducido en pantalla y navegadores que no sean Edge o Chrome.
- Pendiente: subir la rama a GitHub y abrir el pull request en borrador (cuando el usuario lo diga); el overlay y el panel no entran (rama `ingame-mejoras`).
