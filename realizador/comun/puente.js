// Puente entre los dos PCs con una sola contraseña.
//  - El PC 2 (relé) se anuncia cada 2 s por difusión UDP en la red local, firmado con la contraseña.
//  - El PC 1 (agente) escucha, comprueba la firma con su contraseña y así sabe la IP del PC 2 sin escribirla.
//  - Todas las peticiones al relé llevan la ficha de la contraseña: sin ella, el relé no obedece.
// La contraseña no viaja nunca: solo su huella (sha256) y firmas HMAC.
import dgram from 'node:dgram';
import { networkInterfaces } from 'node:os';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { EventEmitter } from 'node:events';

export const PUERTO_ANUNCIO = 4611;
export const CABECERA = 'x-realizador';

export const ficha = clave => createHash('sha256').update(`realizador:${clave}`).digest('hex');
const firma = (clave, texto) => createHmac('sha256', clave).update(texto).digest('hex');

export function igual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

// Cabeceras para hablar con el relé (vacías si no hay contraseña: modo de pruebas en un solo PC)
export const cabeceras = clave => (clave ? { [CABECERA]: ficha(clave) } : {});

// Direcciones de difusión de cada red del PC (255.255.255.255 en Windows solo sale por una tarjeta)
export function difusiones() {
  const r = new Set(['255.255.255.255']);
  for (const lista of Object.values(networkInterfaces())) {
    for (const i of lista || []) {
      if (i.family !== 'IPv4' || i.internal || !i.netmask) continue;
      const ip = i.address.split('.').map(Number);
      const mascara = i.netmask.split('.').map(Number);
      r.add(ip.map((b, k) => (b & mascara[k]) | (~mascara[k] & 255)).join('.'));
    }
  }
  return [...r];
}

export function mensajeAnuncio(clave, puerto) {
  return JSON.stringify({ app: 'realizador', papel: 'pc2', puerto, firma: firma(clave, `pc2:${puerto}`) });
}

export function leerAnuncio(texto, clave) {
  try {
    const m = JSON.parse(texto);
    if (m.app !== 'realizador' || m.papel !== 'pc2' || !Number.isInteger(m.puerto)) return null;
    if (!igual(m.firma, firma(clave, `pc2:${m.puerto}`))) return { contrasenaDistinta: true };
    return { puerto: m.puerto };
  } catch { return null; }
}

// PC 2: se anuncia hasta que se pare
export function anunciar({ clave, puerto, puertoAnuncio = PUERTO_ANUNCIO, cadaMs = 2000 }) {
  const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const enviar = () => {
    const m = Buffer.from(mensajeAnuncio(clave, puerto));
    for (const d of difusiones()) s.send(m, puertoAnuncio, d, () => {});
  };
  s.bind(() => { s.setBroadcast(true); enviar(); });
  const t = setInterval(enviar, cadaMs);
  return { parar() { clearInterval(t); s.close(); } };
}

// PC 1: escucha los anuncios. Emite 'encontrado' ({ ip, puerto }) y 'otraContrasena' (ip) una vez por IP.
export function buscar({ clave, puertoAnuncio = PUERTO_ANUNCIO }) {
  const ev = new EventEmitter();
  const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  let actual = null;
  const avisadas = new Set();
  s.on('message', (m, info) => {
    const r = leerAnuncio(m.toString('utf8'), clave);
    if (!r) return;
    if (r.contrasenaDistinta) {
      if (!avisadas.has(info.address)) { avisadas.add(info.address); ev.emit('otraContrasena', info.address); }
      return;
    }
    const k = `${info.address}:${r.puerto}`;
    if (k === actual) return;
    actual = k;
    ev.emit('encontrado', { ip: info.address, puerto: r.puerto });
  });
  s.on('error', e => ev.emit('error', e));
  s.bind(puertoAnuncio);
  ev.parar = () => s.close();
  return ev;
}
