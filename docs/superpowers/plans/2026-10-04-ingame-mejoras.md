# Mejoras del marcador de partida (ingame) · plan

Fecha: 4 de octubre de 2026 · Rama: `ingame-mejoras` · Diseño: `docs/superpowers/specs/2026-10-04-ingame-mejoras-design.md`.

Sesión sin el usuario delante: las decisiones que no están en el diseño se toman aquí y se apuntan en `PROGRESO.md`.

## Orden

1. **Servidor, con pruebas primero** (`test/ingame.test.js` nuevo, `npm test` entero en verde).
   - R8 oro por ingresos: `INGRESOS` en `server/partida.js` junto a `RECOMPENSAS`, con el parche y qué se ha podido comprobar. `oro = max(objetos, ingresos)`; `oroObjetos` e `ingresos` en campos aparte de cada jugador y de cada clan. Interruptor del servidor (`ajustarIngame({ oroIngresos })`): apagado, `oro` vuelve a ser el valor de los objetos.
   - R4 puntos provisionales: `puntos` y `kp` en cada jugador, con `puntuar` de `puntuacion.js` sin daño, victoria ni MVP. Con `historiaIncompleta`, lo que sale de los sucesos no puntúa (ya llega en `null`).
   - R5 peleas: muertes encadenadas a ≤ 12 s; cerrada a los 12 s sin muertes; con 3 o más, aviso `pelea` con marcador por clan y el jugador con 2+ asesinatos. Una vez por pelea (id propio, llegada = cuándo se cierra).
   - R7 muestras: `grafica.muestras` = `[t, azul − rojo]` cada 15 s de partida, en `recibir`; si el reloj vuelve atrás se tiran las posteriores.
2. **Panel** (`server/index.js`, `estado-guardado.js`, `public/panel/`): `estado.ingame = { estilo, puntosFantasy, resumenPelea, oroIngresos }` guardado y restaurado; acción `ingame`; selector A/B; interruptores encendidos por defecto; `grafico` admite `ficha` (clan + jugador) y `oro`; aviso si hay menos de dos minutos de gráfica.
3. **Overlay, base común + versión A** (`public/ingame/`): `ingame.css` queda con la estructura, las variables de animación y lo común; `estilo-a.css` y `estilo-b.css` llevan cada versión acotada a `[data-estilo]`. HTML único. `?estilo=` fuerza una versión (también desde `/overlay/`). Barra con transiciones de cifras y dragones como sellos bajo cada lado; línea por línea nuevo (≥ 20 px, objetos sin huecos, puntos ≈ en el centro); resumen de pelea con los dos logos; ficha con `cartaHTML` o el retrato del campeón; gráfica de área en SVG.
4. **Versión B «full art»**: recomposición con seigaiha, filos de oro y el color del clan como protagonista.
5. **Repaso** a 1920×1080 con la partida de prueba en las dos versiones, capturas en `docs/capturas/ingame/` (Chromium sin ventana, herramienta fuera del repositorio) incluidas a mitad de animación.
6. `PROGRESO.md`, push y pull request en borrador hacia `master`.

## Decisiones tomadas en la sesión

- Los puntos y las peleas se calculan siempre en el servidor; sus interruptores solo deciden si el overlay los enseña. El de oro por ingresos sí cambia el cálculo (es lo que pide el diseño).
- Un retroceso del reloj de más de 5 s ya se trata como partida nueva (`recibir`), así que las muestras se reinician con todo lo demás; los retrocesos cortos tiran solo las muestras posteriores.
- Las constantes de oro que no se han podido comprobar en la wiki quedan marcadas en el propio objeto `INGRESOS`.
- Este entorno no tiene acceso al registro de npm: las dependencias (`ws`, `socket.io-client`, `google-auth-library`) se cubren con sustitutos locales en `node_modules` (no se suben). Las pruebas no los necesitan de verdad.
