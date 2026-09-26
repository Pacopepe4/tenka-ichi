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
- Pendiente: marcador de la serie Bo3 en el overlay; hacer el sorteo real cuando estén los 10 clanes y subir `competicion.json` al repo.
