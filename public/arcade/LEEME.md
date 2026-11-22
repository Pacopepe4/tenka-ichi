# Gokudō · Arcade: tu partida con el overlay de Gokudō

Para emitir tus partidas normales del LoL en tu canal con el marco de Gokudō: tu cámara abajo a la izquierda, con tu nombre y tu @, y la marca 極道. Sin estadísticas ni nada de la liga.

## Una vez

1. Descarga la colección: https://gokudo.es/arcade/gokudo-arcade-livir.json
2. En OBS, ve a **Colección de escenas → Importar**, elige ese archivo y pulsa **Importar**.
3. Elige la colección **Gokudō · Arcade (Livir)** en el menú **Colección de escenas**.
4. **Tu cámara:** haz doble clic en **Camara Livir** y elige tu webcam. Ponla en 16:9 (1280×720 o 1920×1080) si puede.
   - Ya está encajada en su hueco: x 16, y 856, 320×180.
   - Si es 4:3, se recorta sola (con OBS 30.1 o posterior).
   - Para comprobar que encaja, abre una vez la fuente **Overlay Gokudō arcade** y añade `&guia=1` al final de la URL: sale el hueco rayado con su medida. Quítalo antes de emitir.
5. **Tus alertas:** son las de tu canal. Añade en la escena **Partida** la fuente de navegador que te dé tu servicio de alertas, por encima de todo.

## Cada directo

Abre OBS con la colección **Gokudō · Arcade (Livir)**, entra en tu partida del LoL y emite. No hay que preparar nada más.

## Notas

- **La captura del juego** es la de la ventana del LoL (League of Legends.exe). Si sale en negro, prueba la captura en modo «Capturar cualquier ventana a pantalla completa».
- **Juega a 1920×1080** con la interfaz de serie. El marco tapa el chat del juego (abajo a la izquierda), pero no las habilidades, ni los objetos, ni el minimapa.
- **Otro sitio o tamaño para la cámara:** se cambia en la URL del overlay con `&x=…&y=…&ancho=…`. Después hay que mover la fuente **Camara Livir** al mismo hueco.

## Marcos de Gokudō alrededor de la interfaz del LoL

El overlay pone el marco de Gokudō (filo fino, placa de noche y tubo bermellón) **por fuera** del minimapa, de la barra de habilidades y objetos y del marcador pequeño de arriba a la derecha. No tapa nada de dentro.

**En tu colección (Livir) ya van ajustados a tu interfaz**, medidos en tu directo del 22/11: la barra de 528 a 1274 desde y 944, el minimapa (con sus botones) de x 1645 e y 835 a la esquina, y el marcador de arriba. Para otros, de serie van colocados para la interfaz a 1920×1080 con la escala de serie.

1. **Si cambias la escala de tu interfaz o de tu minimapa**, mándanos otra foto de una partida (tecla **F12**; se guarda en la carpeta `Screenshots` del LoL) y los volvemos a ajustar.
2. **O ajústalos tú** en la URL de la fuente **Overlay Gokudō arcade** (doble clic, campo URL). Añade `&guia=1` para ver las zonas rayadas con su medida:
   - `&hud=1.1`: si tu escala de interfaz es mayor (o menor, con 0.9). Mueve la barra y el marcador.
   - `&minimapa=0.9`: si tu minimapa es más pequeño (o más grande, con 1.1). Crece o encoge desde la esquina.
   - `&mapa=x,y,ancho,alto`, `&barra=x,y,ancho,alto` y `&marcador=x,y,ancho,alto`: la caja exacta de cada uno.
   - `&marcos=0`: sin marcos.
3. Cuando cuadren, quita `&guia=1`.
