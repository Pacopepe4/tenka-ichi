// Publicar en Discord con un webhook (scripts/discord-webhook-falso.js hace de Discord): el texto, la imagen, el canal
// de cada cosa, el límite para no llenar el canal y los errores de Discord explicados.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { crearDiscordFalso } from '../scripts/discord-webhook-falso.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('resto de la imagen')]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('resto de la foto')]);
let discord, d;

before(async () => {
  discord = crearDiscordFalso();
  await new Promise(r => discord.servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${discord.servidor.address().port}/api/webhooks`;
  process.env.DISCORD_WEBHOOK_URL = `${base}/1/general`;
  process.env.DISCORD_WEBHOOK_TIERLIST = `${base}/2/tierlist`;
  d = await import('../server/discord.js');
});
after(() => discord?.servidor.close());

const ultimo = () => discord.estado.mensajes.at(-1);

test('publica la imagen con su texto, a nombre de Tenka Ichi y sin menciones', async () => {
  await d.publicarEnDiscord({ tipo: 'coleccion', imagen: PNG, texto: '**Ana** enseña su colección', quien: 'ana', avatar: 'https://tenka/logo.png' });
  const m = ultimo();
  assert.equal(m.canal, 'general');
  assert.equal(m.wait, 'true');
  assert.equal(m.payload.content, '**Ana** enseña su colección');
  assert.equal(m.payload.username, 'Tenka Ichi');
  assert.equal(m.payload.avatar_url, 'https://tenka/logo.png');
  assert.deepEqual(m.payload.allowed_mentions, { parse: [] }, 'nadie puede colar un @everyone');
  assert.equal(m.archivo, 'coleccion.png');
  assert.equal(m.mime, 'image/png');
  assert.ok(m.imagen.equals(PNG));
});

test('acepta JPEG y la tier list va a su propio canal', async () => {
  await d.publicarEnDiscord({ tipo: 'tierlist', imagen: JPEG, texto: 'Tier list', quien: 'staff-directo' });
  const m = ultimo();
  assert.equal(m.canal, 'tierlist');
  assert.equal(m.archivo, 'tierlist.jpg');
  assert.equal(m.mime, 'image/jpeg');
});

test('no deja publicar lo mismo dos veces seguidas, pero sí otra cosa o a otra persona', async () => {
  const antes = discord.estado.mensajes.length;
  await assert.rejects(d.publicarEnDiscord({ tipo: 'coleccion', imagen: PNG, texto: 'otra vez', quien: 'ana' }),
    e => e.estado === 429 && /dentro de 10 minutos/.test(e.message));
  await d.publicarEnDiscord({ tipo: 'alineacion', imagen: PNG, texto: 'alineación', quien: 'ana' });
  await d.publicarEnDiscord({ tipo: 'coleccion', imagen: PNG, texto: 'la de Beto', quien: 'beto' });
  assert.equal(discord.estado.mensajes.length, antes + 2);
  assert.ok(d.esperaDiscord('coleccion', 'ana') > 9 * 60000);
});

test('solo publica imágenes PNG o JPEG y lo que se puede publicar', async () => {
  await assert.rejects(d.publicarEnDiscord({ tipo: 'coleccion', imagen: Buffer.from('<svg></svg>'), texto: 'x', quien: 'carla' }), /no es válida/);
  await assert.rejects(d.publicarEnDiscord({ tipo: 'otra-cosa', imagen: PNG, texto: 'x', quien: 'carla' }), /No se puede publicar/);
  const enorme = Buffer.concat([PNG, Buffer.alloc(d.MAXIMO_IMAGEN)]);
  await assert.rejects(d.publicarEnDiscord({ tipo: 'coleccion', imagen: enorme, texto: 'x', quien: 'carla' }), /demasiado grande/);
});

test('explica los errores de Discord y no cuenta el intento para el límite', async () => {
  discord.estado.responder = { estado: 404, cuerpo: { message: 'Unknown Webhook', code: 10015 } };
  await assert.rejects(d.publicarEnDiscord({ tipo: 'coleccion', imagen: PNG, texto: 'x', quien: 'dani' }), /crearlo otra vez y cambiarlo en Render/);
  discord.estado.responder = { estado: 429, cuerpo: { message: 'You are being rate limited.', retry_after: 2.4 } };
  await assert.rejects(d.publicarEnDiscord({ tipo: 'coleccion', imagen: PNG, texto: 'x', quien: 'dani' }), /esperar 3 segundos/);
  assert.equal(d.esperaDiscord('coleccion', 'dani'), 0, 'los intentos fallidos no cuentan');
  await d.publicarEnDiscord({ tipo: 'coleccion', imagen: PNG, texto: 'ahora sí', quien: 'dani' });
  assert.equal(ultimo().payload.content, 'ahora sí');
});

test('los nombres no cambian el formato del mensaje', () => {
  assert.equal(d.escaparMarkdown('ana_la*mejor'), 'ana\\_la\\*mejor');
  assert.equal(d.escaparMarkdown('[enlace](x)'), '\\[enlace\\]\\(x\\)');
});

test('con los webhooks puestos, las tres cosas se pueden publicar', () => {
  assert.equal(d.discordActivo('coleccion'), true);
  assert.equal(d.discordActivo('alineacion'), true);
  assert.equal(d.discordActivo('tierlist'), true);
});

test('el texto lo pone el servidor: a quien entró con Discord se le menciona y a los demás, en negrita', () => {
  assert.equal(d.textoDiscord('coleccion', { usuario: { id: 'discord-300000000000000001', nombre: 'Ana' }, tiene: 12, total: 20, enlace: 'https://tenka/gachapon/' }),
    '<@300000000000000001> enseña su colección de Tenka Ichi: 12 de 20 cartas.\n<https://tenka/gachapon/>');
  assert.equal(d.textoDiscord('alineacion', { usuario: { id: '123', nombre: 'beto_lol' }, puntos: 43.5, puesto: 2 }),
    '**beto\\_lol** presenta su alineación del fantasy de Tenka Ichi: 43,5 puntos, 2.º en la clasificación.');
  assert.equal(d.textoDiscord('tierlist', {}), 'Tier list de Tenka Ichi.');
});

// Una petición de la página: la imagen tal cual en el cuerpo
const peticion = cuerpo => Readable.from([cuerpo]);

test('la ruta comprueba quién publica: la colección con sesión y la tier list solo el staff', async () => {
  const ana = { id: 'discord-300000000000000009', nombre: 'Ana' };
  let r = await d.atenderPublicacion({ tipo: 'coleccion', req: peticion(PNG), usuario: null });
  assert.equal(r.estado, 401);
  r = await d.atenderPublicacion({ tipo: 'tierlist', req: peticion(PNG), usuario: ana, staff: false });
  assert.equal(r.estado, 401);
  assert.match(r.cuerpo.error, /solo la publica el staff/);
  r = await d.atenderPublicacion({ tipo: 'coleccion', req: peticion(PNG), usuario: ana, datos: { tiene: 3, total: 20 }, enlace: 'https://tenka/gachapon/' });
  assert.deepEqual(r, { estado: 200, cuerpo: { ok: true } });
  assert.equal(ultimo().payload.content, '<@300000000000000009> enseña su colección de Tenka Ichi: 3 de 20 cartas.\n<https://tenka/gachapon/>');
  r = await d.atenderPublicacion({ tipo: 'tierlist', req: peticion(JPEG), staff: true });
  assert.equal(r.estado, 200);
  assert.equal(ultimo().canal, 'tierlist');
  r = await d.atenderPublicacion({ tipo: 'coleccion', req: peticion(PNG), usuario: ana, datos: { tiene: 3, total: 20 } });
  assert.equal(r.estado, 429, 'y el límite también cuenta por la ruta');
});
