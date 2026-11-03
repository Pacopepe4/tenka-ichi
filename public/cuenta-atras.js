// Cuenta atrás hasta el siguiente día de partidos (portada, en la liga, y gachapon): cada [data-cuenta] de la página.
// Los días salen del formato de la temporada (/api/competicion) y la hora es la de España, la mire quien la mire.
// Cuando llega, salta sola al siguiente día; acabada la temporada, se esconde.
import { horaEspana, horasDelDia } from '/comun.js';

const cajas = [...document.querySelectorAll('[data-cuenta]')];
const { formato } = await fetch('/api/competicion', { cache: 'no-store' }).then(r => r.json()).catch(() => ({}));
const dos = n => String(n).padStart(2, '0');

if (cajas.length && formato) {
  const partidos = Math.floor((formato.clanes?.length || 6) / 2);
  const dias = [
    ...formato.liguilla.map(j => ({ nombre: j.nombre, fecha: j.fecha, horas: horasDelDia(partidos, formato.hora, formato.margen) })),
    ...formato.playoffs.map(r => ({ nombre: r.nombre, fecha: r.fecha, horas: [formato.hora] })),
  ].map(d => ({ ...d, inicio: horaEspana(d.fecha, formato.hora) }));
  const fechaLarga = d => d.inicio.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });

  for (const caja of cajas) {
    caja.innerHTML = `<span class="cuenta-titulo"></span>
      <span class="cuenta-numeros" aria-hidden="true">${['días', 'horas', 'min', 'seg'].map(u => `<span><b>00</b><small>${u}</small></span>`).join('')}</span>
      <span class="cuenta-horas"></span>`;
  }
  let pintado = null;
  const tic = () => {
    const ahora = Date.now(), d = dias.find(x => x.inicio.getTime() > ahora);
    for (const caja of cajas) caja.hidden = !d;
    if (!d) return;
    let s = Math.floor((d.inicio.getTime() - ahora) / 1000);
    const partes = [Math.floor(s / 86400), Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60];
    for (const caja of cajas) {
      if (pintado !== d) {
        caja.querySelector('.cuenta-titulo').textContent = `${d.nombre}: ${fechaLarga(d)}`;
        caja.querySelector('.cuenta-horas').textContent = d.horas.length > 1 ? `Partidos a las ${d.horas.slice(0, -1).join(', ')} y ${d.horas.at(-1)}` : `Desde las ${d.horas[0]}`;
        caja.setAttribute('aria-label', `${d.nombre}, ${fechaLarga(d)} a las ${d.horas[0]}`);
      }
      caja.querySelectorAll('.cuenta-numeros b').forEach((b, i) => { b.textContent = dos(partes[i]); });
    }
    pintado = d;
  };
  tic();
  setInterval(tic, 1000);
}
