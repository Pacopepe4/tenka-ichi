# Resumen en vídeo al acabar la partida

Diseño aprobado por Pacopepe el 08/11/2026 (enfoque A).

## Qué se quiere

Cuando acaba la partida, en la emisión sale un **resumen en vídeo** con los clips de las jugadas destacadas, uno detrás de otro. El **resumen escrito** que ya hace la IA se queda como está: irá a una newsletter automática de la web, junto con las estadísticas de la partida.

- **Cuándo sale:** cuando el final llega a la antena, se pasa a la escena Casters y arranca una cuenta atrás de 2 minutos, el tiempo para que los casters se despidan. Al llegar a 0 sale el resumen. Si los casters acaban antes, lo lanzan con un botón.
- **Panel de casters (en la web de Gokudō):** muestra un aviso de «resumen listo» y la cuenta atrás, y tiene el botón para lanzarlo ya. También lleva un interruptor para mostrar u ocultar las webcams de los casters.
- **Qué jugadas entran:** depende de la partida. Entran todas las que pasen un mínimo de importancia, sin límite fijo.
- **Archivo:** además, se guarda un vídeo por partida para redes y la web.

## Enfoque

Es lo mismo que ya funciona con las repeticiones, ampliado a todas las jugadas destacadas. El PC 2 guarda el búfer de repetición de OBS al acabar cada jugada candidata. Al final, reproduce esos clips seguidos en una escena nueva, «Resumen». Para emitir no hace falta nada nuevo. ffmpeg solo sirve para montar el archivo, y si falta, el directo no se entera.

Se descartaron dos opciones:
- Grabar la partida entera y recortarla: obliga a tener ffmpeg incluso para emitir, y si el recorte falla no hay resumen.
- Usar una lista de VLC en OBS: hay que instalar VLC y no deja recortar bien cada clip.

## Piezas

### 1. Candidatas (PC 1, `pc1/cerebro.js`)

Cada jugada lleva una marca nueva, `j.resumen = true`, si cumple alguna de estas condiciones:
- es una pelea (2 muertes o más);
- tiene un objetivo grande (`reglas.resumen.objetivos`: dragón, Barón, heraldo, Atakhan, larvas, alma);
- tiene un ace;
- tiene un Multikill de 2 o más;
- tiene una muerte que corta una racha de 3 o más (*shutdown*), según las rachas que ya lleva el cerebro (`cerebro.rachas`);
- ya se iba a repetir (`j.repetir`).

Las torres, los inhibidores y las muertes sueltas sin nada especial no entran. Los criterios van en `reglas.resumen`, para poder ajustarlos sin tocar código.

### 2. Clips (PC 1 lo manda, PC 2 lo hace)

`Ejecutor.accionesObs()` ya manda `{ tipo: 'guardar', jugada }` para las jugadas con `repetir`. Ahora también lo manda para las que tienen `resumen`, en `j.fin + 1`. El PC 2 guarda el búfer igual que ahora (`estado.clips`). Una sola llamada `guardar` sirve para la repetición y para el resumen.

- El búfer pasa de 45 a **60 s** (`obs.segundosBufer`) para que quepan las peleas largas. Hay que volver a configurar OBS con `4-configurar-obs.bat`.
- Si dos jugadas acaban a menos de 3 s una de otra, se guarda una sola vez y las dos usan el mismo archivo con distinto recorte.

### 3. Lista del resumen (PC 1, al ver el final)

El PC 1 ve el final unos 2 minutos antes que la antena. En ese momento:
- **Con IA:** se amplía la llamada del resumen final (`Ia.resumenFinal`) con un campo más en el esquema JSON: `destacadas`, una lista de ids de jugada en el orden en que deben salir, elegidos solo entre las candidatas. No hace falta otra llamada. Se descartan los ids que no sean candidatos.
- **Sin IA, o si falla:** entran todas las candidatas, en orden de partida.
- Para cada jugada, el recorte va desde `inicio − 3 s` hasta `fin + 2 s`, con un máximo de 20 s (`reglas.resumen.maximoClip`). En una pelea larga se queda el final, donde está lo decisivo.

La lista va al PC 2 con el guion: `{ tipo: 'guion', …, resumen: [{ jugada, desde, hasta }] }`, en segundos de partida.

### 4. Emisión (PC 2, `pc2/emision.js` y un módulo nuevo, `pc2/resumen.js`)

Fases del resumen: `sin` → `preparando` → `listo` → `cuenta` → `emitiendo` → `hecho`.

1. **Preparando:** ha llegado la lista, pero faltan clips por guardar (las últimas jugadas aún no han pasado por la antena).
2. **Listo:** están todos los clips. Se calcula la duración total.
3. **Cuenta:** empieza cuando la emisión pasa a Casters porque ha acabado la partida, y dura `resumen.esperaSegundos` (120).
4. **Emitiendo:** al llegar a 0, o con la orden `lanzar`, se pasa a la escena `Resumen`.
   - Por cada clip se carga el archivo en la fuente `Resumen clip` (igual que `lanzarRepeticion`), se pone el cursor en el principio del recorte y, pasados los segundos del recorte, se pasa al siguiente.
   - Entre clips hay un corte seco y un fundido corto en la placa.
   - Al acabar, vuelve a `Casters`.
5. **Cancelaciones:**
   - Si empieza un draft (`draftDeTenka`) durante la cuenta, se cancela y queda `listo`; se puede lanzar a mano.
   - Si no hay clips, la fase queda en `sin` y el panel lo dice.
   - La orden `cancelar` para la cuenta o el resumen y vuelve a Casters.
   - La orden `repetir` lo pone otra vez.
6. **Clip que falla:** si un clip no carga, se salta ese y se apunta en el registro.

### 5. Escena `Resumen` (`instalar/configurar-obs.js`)

La escena nueva lleva:
- la fuente multimedia `Resumen clip`, a pantalla completa;
- la placa «RESUMEN», una fuente de navegador `obs/resumen.html` que hace el hilo de overlays en estilo Gokudō;
- un rótulo pequeño con el minuto de la jugada (`obs/resumen.html?t=12:34`, que se actualiza en cada clip).

No lleva el marcador: igual que en la repetición, solo la placa.

Las webcams de los casters se encienden y apagan con `SetSceneItemEnabled` sobre la fuente `Camara casters`, en todas las escenas donde esté.

### 6. Panel de casters (por la sala del servidor)

El panel de casters de la web entra en la misma sala del realizador que ya usa la sección «Realizador» del panel (`panelControl`, `panelEmision`…). No hace falta otro canal.

**Del PC 2 al panel:** el estado que ya manda cada segundo (`{ tipo: 'estado', … }`) lleva dos campos más:

```
resumen: { fase: 'sin'|'preparando'|'listo'|'cuenta'|'emitiendo'|'hecho', jugadas: 7, segundos: 84, faltan: 63, clipActual: 2 }
camarasCasters: true | false
```

**Del panel al PC 2:**

```
{ tipo: 'panelResumen', accion: 'lanzar' | 'cancelar' | 'repetir' }
{ tipo: 'panelCamarasCasters', visible: true | false }
```

**Del PC 1 al panel, al acabar la partida (para la newsletter):**

```
{ tipo: 'resumenPartida', partida, duracion, titular, resumen, hecho: 'ia'|'reglas', marcador, jugadas: [...], destacadas: [...] }
```

El realizador solo lo envía. Guardarlo y montar la newsletter con las estadísticas lo hace la web.

**Reparto:**
- **Este repo:** todo lo de arriba en el PC 1 y el PC 2.
- **Hilo de la web:** la página del panel de casters, el reenvío de estos mensajes en la sala y guardar `resumenPartida`.
- **Hilo de overlays:** `obs/resumen.html`.

### 7. Archivo de vídeo (PC 2, `pc2/montaje.js`)

Cuando la fase llega a `listo`, el PC 2 monta `Vídeos\Realizador\Resumen <fecha> <id de partida>.mp4` con ffmpeg:
- cada recorte se saca con `-ss`/`-t` sobre su clip;
- se juntan con el filtro `concat`;
- H.264 `-preset veryfast -crf 23` y AAC.

El proceso va con prioridad baja (`/LOW` en Windows), para no robar CPU al codificador de la emisión; en el portátil de la GTX 960M, OBS usa x264.

- **Dónde busca ffmpeg:** en el `PATH`, en la carpeta de WinGet `Gyan.FFmpeg_*\…\bin` y en `obs.ffmpeg` de `opciones.json`. Si no lo encuentra, lo avisa en la página del PC 2 y en el registro, y no hace nada más.
- El archivo no hace falta para emitir. Si el montaje falla, el resumen en directo sale igual.

## Opciones nuevas (`opciones.json`)

```
"reglas": { …, "resumen": { "activo": true, "objetivos": [...], "maximoClip": 20, "antes": 3, "despues": 2 } }
"resumen": { "esperaSegundos": 120, "archivo": true }
"obs": { …, "segundosBufer": 60, "escenaResumen": "Resumen", "fuenteResumen": "Resumen clip", "camaraCasters": "Camara casters", "ffmpeg": "" }
```

## Pruebas

- **Cerebro:** qué jugadas son candidatas (pelea sí, torre suelta no, shutdown sí, etc.).
- **Recortes:** los límites de cada recorte, el máximo de 20 s y el desplazamiento dentro de un clip guardado en `fin + 1` con un búfer de 60 s.
- **IA:** el esquema con `destacadas`, el descarte de ids que no son candidatos y, si la IA falla, todas las candidatas.
- **Secuenciador de `pc2/resumen.js`** con el OBS de mentira (`crearObsFalso`): las fases, la cuenta atrás, `lanzar`, `cancelar`, `repetir`, la cancelación por draft y el clip que falla y se salta.
- **Montaje:** la orden de ffmpeg que se genera, sin ejecutarla. Una prueba con ffmpeg de verdad solo si está instalado.
- **Sala:** que `estado` lleve `resumen` y `camarasCasters`, y que el PC 2 obedezca `panelResumen` y `panelCamarasCasters`.
- **Final:** la misma prueba «como en directo» del 08/11 (OBS real, sala de internet, margen de 120 s, LoL de mentira) con una partida de prueba con varias jugadas candidatas. Se comprueba la grabación: Casters → cuenta atrás → Resumen → Casters.

## Fuera de este trabajo

- La página del panel de casters y la newsletter: los hace el hilo de la web.
- La placa `obs/resumen.html`: la hace el hilo de overlays. Hasta que esté, se usa una provisional con el texto «RESUMEN».
- Subir el vídeo a redes.
