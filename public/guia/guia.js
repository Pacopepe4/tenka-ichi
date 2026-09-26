// Guía de retransmisión: enlaces de esta misma web y huecos de las cámaras del overlay
import { disposicionCamaras } from '/comun.js';

const origen = location.origin;
const enlaces = {
  overlay: `${origen}/overlay/`,
  guia: `${origen}/overlay/?guia=1`,
  transparente: `${origen}/overlay/?transparente=1`,
  panel: `${origen}/panel/`,
};

document.querySelectorAll('.url[data-enlace]').forEach(el => { el.textContent = enlaces[el.dataset.enlace]; });

document.querySelectorAll('.copiar').forEach(boton => boton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(enlaces[boton.dataset.enlace]);
    boton.textContent = 'Copiado';
  } catch {
    boton.textContent = 'Cópialo a mano';
  }
  setTimeout(() => { boton.textContent = 'Copiar'; }, 2000);
}));

// Miniatura del lienzo en porcentajes y tabla con los números que se escriben en OBS
const pc = (v, total) => `${(v / total * 100).toFixed(2)}%`;
document.querySelector('.disposiciones').innerHTML = [1, 2, 3, 4].map(n => {
  const huecos = disposicionCamaras(n);
  const titulo = `${n} ${n === 1 ? 'cámara' : 'cámaras'}`;
  return `<figure class="disposicion">
    <h3>${titulo}</h3>
    <div class="miniatura" role="img" aria-label="Posición de ${n === 1 ? 'la cámara' : `las ${n} cámaras`} entre los picks">
      <i class="izq"></i><i class="der"></i>
      ${huecos.map((h, i) => `<span style="left:${pc(h.x, 1920)}; top:${pc(h.y, 1080)}; width:${pc(h.w, 1920)}; height:${pc(h.h, 1080)}">${i + 1}</span>`).join('')}
    </div>
    <table>
      <thead><tr><th scope="col">Cámara</th><th scope="col">Posición (x, y)</th><th scope="col">Tamaño</th></tr></thead>
      <tbody>${huecos.map((h, i) => `<tr><td>${i + 1}</td><td>${h.x}, ${h.y}</td><td>${h.w} × ${h.h}</td></tr>`).join('')}</tbody>
    </table>
  </figure>`;
}).join('');
