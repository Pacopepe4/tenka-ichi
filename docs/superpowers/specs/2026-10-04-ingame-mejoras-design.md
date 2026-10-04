# Mejoras del marcador de partida (ingame) · diseño

Fecha: 4 de octubre de 2026 · Rama: `ingame-mejoras` · Aprobado por el usuario en conversación el 4/10.

## Objetivo

El marcador de partida es la parte más floja del directo de Tenka Ichi. Esta tanda lo mejora en tres frentes:

1. **Aspecto:** dos versiones del marcador para que el usuario elija viéndolas en pantalla.
2. **Contenido nuevo:** puntos de fantasy en directo, resumen de pelea, ficha de jugador y gráfica de oro.
3. **Datos:** una estimación del oro más cercana a la real.

Todo lo de esta tanda se comprueba sin League of Legends, con la partida de prueba y con pruebas automáticas.

## Qué se sabe de los datos (investigado el 4/10/2026)

No falta ninguna fuente por enchufar. Para un espectador de una partida personalizada:

- **Live Client Data API** (lo que usa el puente): da objetos, nivel, KDA, súbditos, visión, reaparición y los sucesos de asesinatos, torres e inhibidores. **No da** dragones, heraldo ni Barón (incidencia abierta de Riot desde 2020: <https://github.com/RiotGames/developer-relations/issues/236>), ni oro real, ni daño.
- **Live Events API** (puerto 34243): consta como retirada desde el parche 14.1.
- **API de Riot con clave de desarrollador:** nada en vivo, y las personalizadas no salen en match-v5.
- **Leer la memoria del juego:** descartado, es motivo de baneo desde Vanguard.
- **Cliente (LCU) al acabar la partida:** daño, oro y visión reales de los diez. Es la tanda 2 y no entra aquí.

Decisión del usuario: camino «lo permitido». Los objetivos se siguen marcando a mano desde el panel y el oro en vivo es una estimación, siempre marcada con «≈».

## Alcance

**Entra (esta tanda, en la nube):** los requisitos R1 a R9 de abajo.

**No entra:**

- Cambios en el puente (`puente/puente-tenka-ichi.ps1`) ni lectura del LCU: es la tanda 2 y se hace en el PC del usuario, con LoL abierto.
- OCR de la pantalla del juego y League Broadcast como fuente.
- Marcar dragones con teclas o Stream Deck (descartado por el usuario).
- Draft, postdraft, pantalla final, gachapon, portada y Discord, salvo lo imprescindible para que sigan funcionando.

## Cómo es hoy

- `server/partida.js`: recibe los paquetes del puente (`recibir`) y calcula la foto de la partida (`resumen`): equipos, `jugadores`, `lineas` (cada rol, azul contra rojo), objetivos, buffs y `avisos`. El oro de cada jugador es el valor de sus objetos (`oroObjetos`). Incluye la partida de prueba (`empezarPrueba`).
- `server/index.js`: estado del panel (`estado.grafico`, `estado.avisosPropios`, `estado.partidaVisible`…), acciones del panel (`case 'grafico'`, `'partidaPrueba'`…) y estado guardado en Ajustes.
- `server/vista.js`: qué vista toca en el overlay (draft, postdraft, partida, final).
- `server/puntuacion.js`: reglas del fantasy (`REGLAS_PUNTOS`, `puntuar`, `participacion`).
- `public/ingame/` (`ingame.js`, `ingame.css`) y `public/overlay/`: pintan el marcador, los temporizadores, los avisos y el línea por línea (`pintarLineas`).
- `public/panel/panel.js`: botones del panel (`#verLineas`, partida de prueba…).
- `public/carta.js` y `carta.css`: componente común de la carta del gachapon (`cartaHTML`).
- Pruebas: `npm test` (`node --test test/*.test.js`). Web de prueba con liga inventada: `npm run prueba-directo [puerto]`; en el panel (contraseña local por defecto del servidor), «Empezar una partida de prueba» pasa al marcador.

## Requisitos

### R1. Dos versiones del aspecto, elegibles desde el panel

- El panel tiene un selector **«Estilo del marcador: A / B»**. Por defecto, A. Se guarda con el resto del estado del panel y vuelve tras un reinicio.
- El overlay aplica el estilo con un atributo en la raíz (por ejemplo `data-estilo="a|b"`) y las reglas de cada versión van acotadas a ese atributo. El parámetro `?estilo=a|b` en la dirección del overlay fuerza una versión, para comparar las dos en dos pestañas o dos fuentes de OBS.
- Las dos versiones enseñan **los mismos datos** y comparten el servidor y, en lo posible, el mismo HTML. Lo que cambia es el aspecto. Lo que piden R3 a R7 (qué se enseña y cuándo) vale para las dos.
- **Versión A, «retoque»:** la composición de hoy, pulida (R2 y R3).
- **Versión B, «rediseño»:** propuesta más atrevida dentro del estilo de Koryu Budo, con libertad para recomponer la barra, los temporizadores y el línea por línea. Tiene que diferenciarse de A a simple vista; si no, no sirve para elegir.
- Cuando el usuario elija, la otra versión se borra. Hay que dejarlas separadas de forma que borrar una sea fácil.

### R2. Barra de arriba y temporizadores (versión A)

- Las cifras que cambian (asesinatos, oro, torres) lo hacen con una transición corta, sin saltos.
- Entrada y salida de los avisos más suaves.
- El oro va marcado con «≈». La diferencia de oro toma el color del clan que va por delante.
- Los dragones de cada clan salen como sellos bajo su lado, en lugar de la fila de rombos suelta del centro.
- Números de ancho fijo (`font-variant-numeric: tabular-nums` o equivalente) para que no bailen.
- Se mantiene lo que ya hay: logos, kanji, reloj, ensō de los temporizadores, buffs, alma e inhibidores.

### R3. Línea por línea nuevo

- Más grande y legible en un directo a 1080p: ningún texto por debajo de unos 20 px reales en 1920×1080.
- Solo los objetos que se tienen, sin huecos vacíos. El abalorio, aparte.
- En el centro de cada duelo: la diferencia de oro (≈) y los **puntos de fantasy provisionales** de los dos jugadores (R4), con el que va por delante resaltado.
- Se mantiene: sin título ni roles, logo de Tenka Ichi pequeño en el centro, KDA, súbditos, nivel, brillo de quien va en racha y la moneda del shutdown aproximado.

### R4. Puntos de fantasy en directo (provisionales)

- Cada jugador de la foto de la partida lleva sus puntos provisionales, calculados con `puntuar` de `server/puntuacion.js` a partir de lo que hay en vivo: K, D, A, súbditos, visión, primera sangre, multikills, torres y participación.
- El daño no existe en vivo: no puntúa hasta el final. Tampoco entran la victoria, el MVP ni los multiplicadores de las BOOST, que son de cada coleccionista.
- Si falta el principio de la partida (`historiaIncompleta`), los datos que salen de los sucesos quedan vacíos y no puntúan, como hoy.
- En pantalla se marcan como provisionales (por ejemplo «pts ≈»), para que nadie los tome por los definitivos.

### R5. Resumen de pelea (automático)

- Una pelea es una serie de muertes de campeones en la que cada una llega como mucho 12 s de partida después de la anterior. Se cierra cuando pasan 12 s sin muertes.
- Si la pelea cerrada tiene **tres muertes o más**, sale un aviso con el marcador de la pelea por clan (por ejemplo «Saru 3 – 1 Kaiju») y, si alguien hizo dos asesinatos o más, su nombre.
- Una muerte por torre o súbditos cuenta para el clan contrario al de la víctima.
- Sale una sola vez por pelea y sigue las reglas de los avisos de hoy: por cuándo llega, no por el reloj, y sin anunciar cosas de hace más de un minuto de partida (saltos en repeticiones).
- Interruptor propio en el panel, encendido por defecto. Es independiente de `avisosPropios`.

### R6. Ficha de jugador (la saca el staff)

- En el panel, apartado Partida: elegir clan y jugador y «Sacar la ficha», con duración en segundos, igual que el línea por línea.
- En el overlay: la carta del gachapon del jugador (componente `public/carta.js`; id `<CLAN>-<ROL>`), su campeón, KDA, súbditos por minuto, participación en asesinatos, visión, nivel y puntos provisionales.
- Si el jugador no tiene carta (clanes sin cartas todavía), sale el retrato del campeón en su lugar. Nunca una imagen rota.
- Usa el mecanismo de `estado.grafico` (un gráfico a la vez).

### R7. Gráfica de oro (la saca el staff)

- El servidor guarda la diferencia de oro (azul menos rojo, con la estimación de R8) cada 15 s de partida.
- Si el reloj vuelve atrás (repeticiones), se descartan las muestras posteriores. Si se entra con la partida empezada o la web se reinicia, la gráfica empieza donde haya datos.
- En el panel: «Sacar la gráfica de oro», con duración. En el overlay: gráfica de área en SVG, con el color de cada clan a su lado del cero, el eje de tiempo en minutos y el rótulo «oro estimado ≈».
- Con menos de dos minutos de datos, el panel avisa de que aún no hay gráfica y no saca nada.

### R8. Oro estimado por ingresos

- Hoy el oro es el valor de los objetos y se queda corto con el oro sin gastar. Pasa a estimarse por ingresos de cada jugador: oro inicial, oro pasivo por tiempo, súbditos, asesinatos y asistencias (reutilizando el valor de cada muerte que ya calcula `estimarRecompensas`) y torres.
- **Nunca baja del valor de los objetos:** el oro de cada jugador es el mayor de los dos.
- Las constantes van juntas en un objeto con comentarios, como `RECOMPENSAS`, y con el parche del que salen. Son aproximadas: si hay acceso a la wiki del juego, comprobarlas con el parche actual; si no, dejar dicho cuáles no se han podido comprobar.
- La foto de la partida conserva el valor de los objetos en un campo aparte, para la tanda 2 y para el panel.
- La partida de prueba tiene que seguir dando cifras razonables.

### R9. Interruptores en el panel

- Petición del usuario: lo nuevo viene **encendido** y el interruptor sirve para ocultarlo si no funciona bien, no para tener que activarlo.
- Interruptores, en el apartado Partida y guardados con el estado del panel: puntos de fantasy en el línea por línea, resumen de pelea, y oro estimado por ingresos (apagado vuelve al valor de los objetos).
- La ficha y la gráfica no llevan interruptor: se sacan con su botón.

## Restricciones

- **Rama:** todo en `ingame-mejoras`. No tocar `master` ni hacer push a `master`: Render despliega desde ahí. Otra sesión trabaja a la vez en `master` (web, stream y gachapon), así que conviene tocar lo justo fuera del ingame y del apartado Partida del panel.
- **Sin dependencias nuevas** en el servidor ni en las páginas: Node sin framework y JS y CSS a mano, como el resto. Las herramientas para sacar capturas no se añaden a `package.json`.
- **Estilo de Koryu Budo:** samurái japonés con toque fantástico y mitológico; negro, rojo y azul; tinta, hueso y el color de cada clan. Los logos son los originales del usuario: nunca generarlos, recolorearlos ni invertirlos. Nada de arte original de Riot como definitivo en las cartas.
- **Pantalla:** el overlay es una fuente de navegador de OBS a 1920×1080 con fondo transparente.
- **Compatibilidad:** un overlay abierto con la versión anterior no debe romperse con la foto nueva (los campos de hoy se mantienen).
- **Idioma:** textos, comentarios y mensajes de commit en español, con el estilo del código que ya hay.
- **Secretos:** no hacen falta. La web de prueba ya quita Google, Discord, Twitch y Render del entorno.

## Pruebas y comprobación

- Pruebas nuevas en `test/` (ampliar `partida.test.js` o archivos nuevos con nombre propio): oro por ingresos (nunca por debajo de los objetos, crece con el tiempo y los súbditos), detección de peleas (umbral de tres, cierre a los 12 s, una sola vez, muertes por torre), muestras de la gráfica (cada 15 s, vuelta atrás del reloj) y puntos provisionales (sin daño, con historia incompleta).
- `npm test` tiene que pasar entero.
- Comprobación en pantalla con `npm run prueba-directo` y la partida de prueba, en las dos versiones: barra, temporizadores, línea por línea, resumen de pelea, ficha y gráfica.
- Si en el entorno se puede usar un navegador sin ventana, guardar capturas a 1920×1080 de cada pieza en las dos versiones en `docs/capturas/ingame/`. Si no se puede, decirlo en la entrega.

## Entrega

- Commits pequeños y con mensaje claro en `ingame-mejoras`, subidos a GitHub.
- Una entrada nueva en `PROGRESO.md` con lo hecho, lo comprobado y lo que no se ha podido comprobar.
- Un pull request **en borrador** hacia `master` con el resumen y las capturas de las dos versiones. No unirlo: lo decide el usuario después de ver las dos versiones.

## Tanda 2 (después, en el PC del usuario)

- El puente lee del cliente (LCU, `lol-end-of-game`) el daño, el oro y la visión reales al acabar la partida y los manda a la web, para la pantalla final y el fantasy. Falta comprobar que el cliente se los da a un espectador.
- Con el oro real, el panel dice tras cada partida cuánto se desvió la estimación de R8.
- Comprobación de dos minutos de la Live Events API, por descarte.
