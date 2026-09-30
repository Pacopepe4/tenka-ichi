// Discord de mentira para las pruebas: hace de webhook de un canal. Recibe lo que se publica (el texto en
// payload_json y la imagen) y lo guarda para comprobarlo. Con estado.responder se simula un error de Discord.
// También se arranca suelto y guarda las imágenes en una carpeta para verlas:
//   node scripts/discord-webhook-falso.js [puerto] [carpeta]   → webhook: http://localhost:4050/api/webhooks/1/prueba
import http from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function crearDiscordFalso({ carpeta = null } = {}) {
  const estado = { mensajes: [], responder: null };
  const servidor = http.createServer(async (req, res) => {
    const trozos = [];
    for await (const t of req) trozos.push(t);
    const url = new URL(req.url, 'http://x');
    const ruta = /^\/api\/webhooks\/(\d+)\/([\w-]+)$/.exec(url.pathname);
    const responder = (codigo, cuerpo) => { res.writeHead(codigo, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(cuerpo)); };
    if (req.method !== 'POST' || !ruta) return responder(404, { message: 'Unknown Webhook', code: 10015 });
    if (estado.responder) { const r = estado.responder; estado.responder = null; return responder(r.estado, r.cuerpo || {}); }
    const datos = await new Response(Buffer.concat(trozos), { headers: { 'content-type': req.headers['content-type'] || '' } }).formData();
    const archivo = datos.get('files[0]');
    const mensaje = {
      id: String(estado.mensajes.length + 1), canal: ruta[2], wait: url.searchParams.get('wait'),
      payload: JSON.parse(datos.get('payload_json') || '{}'),
      archivo: archivo?.name || null, mime: archivo?.type || null, imagen: archivo ? Buffer.from(await archivo.arrayBuffer()) : null,
    };
    estado.mensajes.push(mensaje);
    if (carpeta && mensaje.imagen) {
      mkdirSync(carpeta, { recursive: true });
      const destino = path.join(carpeta, `${mensaje.id}-${mensaje.archivo}`);
      writeFileSync(destino, mensaje.imagen);
      console.log(`Publicado en #${mensaje.canal}: ${mensaje.payload.content}\n  imagen: ${destino}`);
    }
    responder(200, { id: mensaje.id, channel_id: ruta[1], content: mensaje.payload.content });
  });
  return { servidor, estado };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const puerto = Number(process.argv[2]) || 4050;
  const carpeta = path.resolve(process.argv[3] || 'discord-falso');
  const { servidor } = crearDiscordFalso({ carpeta });
  servidor.listen(puerto, () => console.log(`Discord falso: webhook http://localhost:${puerto}/api/webhooks/1/prueba (imágenes en ${carpeta})`));
}
