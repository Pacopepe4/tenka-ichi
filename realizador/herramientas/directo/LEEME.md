# Grafismos y música de las escenas de directo

Las pantallas de OBS que van fuera del juego: `obs/espera.html`, `obs/cabecera.html`, `obs/pausa.html`, `obs/postpartida.html` y `obs/cierre.html`. Usan los fondos de `obs/fondos/` y la música de `obs/musica/` (OBS pone la música en bucle).

## Procedencia

- **Música:** temas de **Flow Music** generados por **Pacopepe** para Gokudō, que ha confirmado que se pueden usar en directo. Son las versiones A de `E:\ Escritorio\Claude\gokudo\teaser\musica\`:

  | archivo | tema |
  |---|---|
  | `espera.opus` | `03-espera-a.wav` |
  | `intro.opus` | `02-intro-directo-a.wav` |
  | `pausa.opus` | `04-pausa-brb-a.wav` |
  | `victoria.opus` | `10-victoria-a.wav` |
  | `despedida.opus` | `05-despedida-a.wav` |

  Llevan `loudnorm` a dos pasadas (−18 LUFS integrados, pico real −1,5 dBTP), un fundido de entrada de 0,5 s y uno de salida de 1,5 s para que el bucle no salte, y van en Opus a 104 kbps.

- **Fondos:** del **kit de redes de Gokudō** (`E:\ Escritorio\Claude\gokudo\diseno\redes\kit\`):
  - `pausa.jpg` y `fin.jpg` son `salida\twitch\pausa.png` y `fin.png` en JPG.
  - `empezamos.jpg` es la pieza `empezamos` sin el subtítulo, porque la cuenta atrás va en ese sitio. La saca el propio `generar.js` del kit (layout `pantalla`) en una carpeta temporal, sin tocar el kit.
  - `noche.jpg` es `fondos\fondo-callejon-16x9.jpg`, desenfocado y oscurecido.
  - `sol-neon.png` es el logo actual de Gokudō: el sol cortado con neón, `diseno\logo-tenka\simbolo-neon-transparente-2K.png` a 720 px.

## Rehacerlo

```
node herramientas/directo/preparar.js                 fondos y música
node herramientas/directo/preparar.js --solo fondos   (o --solo musica)
node herramientas/directo/muestras.js                 fotos y vídeo en docs/muestras/directo/
```

Hace falta un ffmpeg con libopus (`--ffmpeg` o la variable `FFMPEG`). Para el fondo de la espera y las muestras también hace falta Chrome (`--chrome` o la variable `CHROME`), que se maneja por DevTools con `chrome.js`, sin dependencias.
