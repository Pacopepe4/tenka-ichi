// «Haz tu tier list» de la portada: cada espectador coloca a los jugadores y a los equipos de S+ a D, la descarga o la
// publica en Discord. Con su cuenta de Discord se guarda en la web para siempre (server/mitierlist.js); sin cuenta, en
// este navegador, y al entrar pasa a su cuenta si allí no tenía ninguna.
// Se coloca arrastrando (con ratón) o tocando primero la ficha y después la tier (en el móvil).
import { cargarClanes, logo } from '/comun.js';
import { escapar } from '/carta.js';
import { imagenTierlist, descargar, publicar } from '/compartir.js';

const $ = s => document.querySelector(s);
const caja = $('#mitierlist');
const TIERS = ['S+', 'S', 'A', 'B', 'C', 'D'];
const varTier = t => `var(--tier-${t === 'S+' ? 'SP' : t})`;
const ROL = { TOP: 'Top', JUNGLA: 'Jungla', MEDIO: 'Medio', ADC: 'ADC', SUPPORT: 'Support' };
const LOCAL = 'tenka-mitierlist';

const [{ clanes }, info] = await Promise.all([cargarClanes(), fetch('/api/mitierlist', { cache: 'no-store' }).then(r => r.json())]);
const clan = id => clanes.find(c => c.id === id) || { nombre: id, color: '' };
let tipo = 'jugadores', rol = '', elegida = null;
const leerLocal = () => { try { return JSON.parse(localStorage.getItem(LOCAL) || 'null'); } catch { return null; } };
const vacia = m => !Object.keys(m?.jugadores || {}).length && !Object.keys(m?.equipos || {}).length;
let mia = { jugadores: { ...info.mia.jugadores }, equipos: { ...info.mia.equipos } };
const local = leerLocal();
if (!info.entrado && local) mia = { jugadores: local.jugadores || {}, equipos: local.equipos || {} };

// ---------- guardar ----------
const estado = caja.querySelector('.mi-tier-estado');
const decir = (texto, mal = false) => { estado.textContent = texto; estado.classList.toggle('mal', mal); };
let espera = null;
function guardar() {
  try { localStorage.setItem(LOCAL, JSON.stringify(mia)); } catch {}
  if (!info.entrado) return decir('Guardada en este navegador. Entra con Discord para guardarla en tu cuenta para siempre y publicarla.');
  decir('Guardando…');
  clearTimeout(espera);
  espera = setTimeout(async () => {
    const r = await fetch('/api/mitierlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mia) })
      .then(x => x.json()).catch(() => ({ ok: false, error: 'No hay conexión con la web' }));
    decir(r.ok ? 'Guardada en tu cuenta.' : `No se ha guardado: ${r.error || 'prueba otra vez'}`, !r.ok);
  }, 700);
}
// La que hizo sin cuenta pasa a su cuenta al entrar, si allí no tenía ninguna
if (info.entrado && vacia(info.mia) && !vacia(local)) { mia = { jugadores: local.jugadores || {}, equipos: local.equipos || {} }; guardar(); }

// ---------- pintar ----------
// Con un rol elegido, solo los jugadores de ese rol (la de equipos no tiene roles)
const lista = () => (tipo === 'jugadores' && rol ? info.jugadores.filter(j => j.rol === rol) : info[tipo]);
const ficha = x => {
  const c = tipo === 'jugadores' ? x.clan : x.id;
  return `<button type="button" class="ficha-tier" draggable="true" data-id="${x.id}" aria-pressed="${elegida === x.id}" style="--color:${clan(c).color}">
    <img src="${logo(c)}" alt=""><b>${escapar(x.nombre)}</b>${tipo === 'jugadores' ? `<small>${ROL[x.rol]}, ${escapar(clan(x.clan).nombre)}</small>` : ''}</button>`;
};
function pintar() {
  const tiers = mia[tipo];
  caja.querySelector('.mi-tier-filas').innerHTML = TIERS.map(t => `<div class="tier-fila" data-tier="${t}" data-destino="${t}" style="--color-tier: ${varTier(t)}">
    <span class="tier-letra">${t}</span><div class="tier-fichas">${lista().filter(x => tiers[x.id] === t).map(ficha).join('')}</div></div>`).join('');
  const sueltas = lista().filter(x => !tiers[x.id]);
  caja.querySelector('.mi-banco').innerHTML = `<span class="mi-banco-titulo">Sin colocar${sueltas.length ? ` (${sueltas.length})` : ''}</span>
    <div class="tier-fichas">${sueltas.map(ficha).join('') || '<span class="tier-vacia">Ya están todos colocados</span>'}</div>`;
  caja.classList.toggle('eligiendo', Boolean(elegida));
  caja.querySelector('.filtro-rol').hidden = tipo !== 'jugadores';
}
function mover(id, destino) {
  if (destino) mia[tipo][id] = destino; else delete mia[tipo][id];
  elegida = null;
  pintar();
  guardar();
}

// Tocar una ficha la elige; tocar después una tier (o «Sin colocar») la lleva allí
caja.addEventListener('click', e => {
  const f = e.target.closest('.ficha-tier'), zona = e.target.closest('[data-destino]');
  if (f && (!elegida || elegida === f.dataset.id)) { elegida = elegida === f.dataset.id ? null : f.dataset.id; return pintar(); }
  if (elegida && zona) mover(elegida, zona.dataset.destino);
});
caja.addEventListener('dragstart', e => {
  const f = e.target.closest('.ficha-tier');
  if (f) { e.dataTransfer.setData('text/plain', f.dataset.id); e.dataTransfer.effectAllowed = 'move'; }
});
caja.addEventListener('dragover', e => { const z = e.target.closest('[data-destino]'); if (z) { e.preventDefault(); z.classList.add('encima'); } });
caja.addEventListener('dragleave', e => e.target.closest('[data-destino]')?.classList.remove('encima'));
caja.addEventListener('drop', e => {
  const z = e.target.closest('[data-destino]'), id = e.dataTransfer.getData('text/plain');
  if (!z || !id) return;
  e.preventDefault();
  mover(id, z.dataset.destino);
});
caja.querySelectorAll('.mi-tier-pestanas button').forEach(b => b.addEventListener('click', () => {
  tipo = b.dataset.tipo;
  elegida = null;
  caja.querySelectorAll('.mi-tier-pestanas button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  pintar();
}));
caja.querySelectorAll('.filtro-rol button').forEach(b => b.addEventListener('click', () => {
  rol = b.dataset.rol;
  elegida = null;
  caja.querySelectorAll('.filtro-rol button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  pintar();
}));
// Empezar de nuevo: lo que se ve (con un rol elegido, solo ese rol)
caja.querySelector('.mi-vaciar').addEventListener('click', () => {
  const ids = lista().map(x => x.id).filter(id => mia[tipo][id]);
  if (!ids.length) return;
  for (const id of ids) delete mia[tipo][id];
  elegida = null;
  pintar();
  guardar();
});

// ---------- cuenta, imagen y Discord ----------
const entrar = caja.querySelector('.mi-entrar');
entrar.hidden = info.entrado || !info.login;
entrar.href = `/auth/discord?volver=${encodeURIComponent('/#mitierlist')}`;
const botonPublicar = caja.querySelector('.mi-publicar');
botonPublicar.hidden = !info.entrado || !info.publicarDiscord;
if (info.entrado) decir(`Entraste como ${info.nombre}: se guarda en tu cuenta.`);
else decir(info.login ? 'Sin cuenta se guarda solo en este navegador. Entra con Discord para guardarla para siempre y publicarla.' : 'Se guarda en este navegador.');

// Con un rol elegido, la imagen es la de ese rol; si no, jugadores y equipos
const imagen = () => {
  const deRol = tipo === 'jugadores' && rol;
  return imagenTierlist({
    jugadores: (deRol ? lista() : info.jugadores).map(j => ({ ...j, tier: mia.jugadores[j.id] || null })),
    equipos: deRol ? [] : info.equipos.map(e => ({ ...e, tier: mia.equipos[e.id] || null })),
    nombreClan: id => clan(id).nombre, tiers: TIERS, ruta: '/#mitierlist',
    titulo: `${info.entrado ? `Tier list de ${info.nombre}` : 'Mi tier list de Tenka Ichi'}${deRol ? ` · ${ROL[rol]}` : ''}`,
  });
};
async function hacer(boton, fn) {
  if (vacia(mia)) return decir('Coloca antes a alguien en una tier', true);
  boton.setAttribute('aria-busy', 'true');
  try { decir(await fn(await imagen())); } catch { decir('No se ha podido hacer la imagen', true); }
  boton.removeAttribute('aria-busy');
}
caja.querySelector('.mi-descargar').addEventListener('click', e => hacer(e.currentTarget, async img => { descargar(img, 'mi-tier-list-tenka-ichi.jpg'); return 'Imagen descargada.'; }));
botonPublicar.addEventListener('click', e => hacer(e.currentTarget, async img => {
  const r = await publicar('mitierlist', img);
  return r.ok ? '¡Publicada en Discord!' : r.error;
}));
pintar();
