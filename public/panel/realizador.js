// Sección «Realizador automático» del panel: se une a la sala del realizador (/realizador) con la huella de su
// contraseña, pinta lo que manda su PC 1 (foto, cada segundo) y le manda tomar el control u órdenes de cámara.
const $ = s => document.querySelector(s);
const esc = t => String(t ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const reloj = t => (t === null || t === undefined ? '--:--' : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`);
const ZOOM = { cerca: ' · zoom in', general: '', abierto: '' };
const plano = p => (p.tipo === 'general' ? 'Plano general' : `Sigue a ${esc(p.objetivo?.campeon)}${ZOOM[p.zoom] || ''}`);

const input = $('#claveRealizador');
try { input.value = localStorage.getItem('tenka-realizador') || ''; } catch {}

let ws = null, foto = null, presentes = { pc1: false, pc2: false }, espera = 2000, temporizador = null;

async function huella(clave) {
  const datos = new TextEncoder().encode(`realizador:${clave}`);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', datos))].map(b => b.toString(16).padStart(2, '0')).join('');
}

function estadoConexion(texto, vivo) {
  const p = $('#realizadorConexion');
  p.textContent = texto;
  p.classList.toggle('vivo', Boolean(vivo));
}

async function conectar() {
  clearTimeout(temporizador);
  const viejo = ws;
  ws = null;
  viejo?.close();
  foto = null;
  pintar();
  const clave = input.value.trim();
  if (!clave) return estadoConexion('Sin contraseña');
  const sala = await huella(clave);
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const yo = new WebSocket(`${proto}://${location.host}/realizador`);
  ws = yo;
  estadoConexion('Conectando…');
  yo.onopen = () => { espera = 2000; yo.send(JSON.stringify({ tipo: 'unirse', sala, papel: 'panel' })); };
  yo.onmessage = m => {
    let d;
    try { d = JSON.parse(m.data); } catch { return; }
    if (d.tipo === 'unido') estadoConexion('Conectado', true);
    else if (d.tipo === 'presentes') { presentes = d; if (!d.pc1) foto = null; pintar(); }
    else if (d.tipo === 'foto') { foto = d; pintar(); }
  };
  yo.onclose = () => {
    if (ws !== yo) return;
    estadoConexion('Sin conexión, reintentando…');
    temporizador = setTimeout(conectar, espera);
    espera = Math.min(espera * 1.5, 15000);
  };
}

function mandar(mensaje) {
  if (ws?.readyState !== 1 || !presentes.pc1) return alertar('El PC 1 del realizador no está conectado');
  ws.send(JSON.stringify(mensaje));
}

function alertar(texto) {
  const a = $('#aviso');
  if (!a) return;
  a.textContent = texto;
  a.hidden = false;
  setTimeout(() => { a.hidden = true; }, 2600);
}

function pintar() {
  const f = foto;
  const c = f?.conexiones || {};
  const puntos = [['PC 1', presentes.pc1], ['PC 2', presentes.pc2], ['Partida', c.explorador], ['OBS', c.obs]];
  $('#realizadorPuntos').innerHTML = puntos.filter(([, v]) => v !== null && v !== undefined)
    .map(([n, v]) => `<span><i class="${v ? 'si' : 'no'}"></i>${n}</span>`).join('');
  $('#realizadorDirecto').textContent = reloj(f?.tDirecto);
  $('#realizadorAntena').textContent = reloj(f?.tAntena);
  $('#realizadorMargen').textContent = f?.margenReal === null || f?.margenReal === undefined ? '--' : `${Math.round(f.margenReal)} s`;
  $('#realizadorPlano').textContent = '';
  $('#realizadorPlano').innerHTML = !f ? (presentes.pc1 ? 'Esperando datos del PC 1' : 'Esperando al PC 1')
    : f.manual ? 'Control manual' : f.planoActual ? plano(f.planoActual) : (f.tAntena === null ? 'Esperando partida' : 'Sin plano');
  const b = $('#realizadorControl');
  b.textContent = f?.manual ? 'Devolver el control' : 'Tomar el control';
  b.classList.toggle('manual', Boolean(f?.manual));
  $('#realizadorJugadores').innerHTML = (f?.jugadores || []).map((j, i) =>
    `<button type="button" class="${j.equipo === 'rojo' || j.equipo === 'CHAOS' ? 'rojo' : 'azul'}" data-i="${i}">${esc(j.campeon)}<small>${esc(j.jugador)}</small></button>`).join('');
  const lista = (id, items, fila, vacio) => { $(id).innerHTML = items?.length ? items.map(fila).join('') : `<li class="ayuda">${vacio}</li>`; };
  lista('#realizadorProximos', f?.proximos?.slice(0, 6), x => `<li><span class="t">${f.tAntena === null ? reloj(x.inicio) : '+' + Math.round(x.inicio - f.tAntena) + ' s'}</span><span>${plano(x)}</span></li>`, 'Nada aún');
  lista('#realizadorAcciones', f?.acciones, a => `<li><span class="t">${reloj(a.t)}</span><span>${a.tipo === 'repeticion' ? 'Repetición' : 'Línea por línea'} · ${a.segundos} s</span></li>`, 'Ninguna');
  lista('#realizadorRegistro', f?.registro?.slice(0, 8), r => `<li><span class="t">${esc(r.hora?.slice(11, 19))}</span><span>${esc(r.quien)} · ${esc(r.que)}${r.motivo ? ' (' + esc(r.motivo) + ')' : ''}</span></li>`, 'Sin decisiones');
}

input.addEventListener('change', () => { try { localStorage.setItem('tenka-realizador', input.value.trim()); } catch {} conectar(); });
$('#realizadorControl').onclick = () => mandar({ tipo: 'panelControl', manual: !foto?.manual });
$('#realizadorGeneral').onclick = () => mandar({ tipo: 'panelOrden', orden: { tipo: 'general' } });
$('#realizadorJugadores').onclick = e => {
  const b = e.target.closest('button');
  const j = b && foto?.jugadores?.[Number(b.dataset.i)];
  if (j) mandar({ tipo: 'panelOrden', orden: { tipo: 'seguir', objetivo: { jugador: j.jugador, campeon: j.campeon, equipo: j.equipo } } });
};

pintar();
conectar();
