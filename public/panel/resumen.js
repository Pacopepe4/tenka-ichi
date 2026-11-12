// Resumen final de la partida (la «replay final» del realizador): qué se enseña en el panel con el campo `resumen` de
// la foto del PC 1. Sin el DOM, para poder probarlo en Node (test/resumen-panel.test.js); lo pinta realizador.js.
//   resumen: { fase: 'sin'|'preparando'|'listo'|'cuenta'|'emitiendo'|'hecho', jugadas, segundos, faltan, clipActual }
// Al panel le toca: el texto, qué botones van (Lanzar, Cancelar, Repetir), el aviso de la barra y si el apartado del
// realizador sube arriba. Los botones mandan { tipo: 'panelResumen', accion: 'lanzar' | 'cancelar' | 'repetir' }.
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
// 84 → «1:24». La cuenta atrás redondea hacia arriba (con 71,3 s quedan «1:12»)
export const minutos = (s, redondeo = Math.round) => {
  const t = Math.max(0, redondeo(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
const jugadasTexto = n => `${n} ${n === 1 ? 'jugada' : 'jugadas'}`;
const detalle = r => [num(r.jugadas) !== null && jugadasTexto(r.jugadas), num(r.segundos) !== null && minutos(r.segundos)].filter(Boolean).join(', ');

const NADA = { lanzar: false, cancelar: false, repetir: false };

export function vistaResumen(foto) {
  // Sin foto del PC 1 no se sabe nada: el bloque no sale (el resto del apartado ya dice que espera al PC 1)
  if (!foto) return { visible: false, botones: false, ...NADA, texto: '', aviso: null, arriba: false, fase: null };
  const r = foto.resumen;
  // Un PC 1 de antes del resumen final no manda el campo
  if (!r || typeof r !== 'object') {
    return { visible: true, botones: false, ...NADA, texto: 'Este realizador no hace el resumen final: actualízalo desde la guía', aviso: null, arriba: false, fase: null };
  }
  const v = { visible: true, botones: true, ...NADA, texto: '', aviso: null, arriba: false, fase: r.fase };
  const d = detalle(r);
  switch (r.fase) {
    case 'sin':
      v.texto = 'Esta partida no tiene jugadas para el resumen';
      break;
    case 'preparando':
      v.texto = `Preparando: faltan clips${num(r.jugadas) ? ` · ${jugadasTexto(r.jugadas)} de momento` : ''}`;
      break;
    case 'listo':
      v.texto = `Listo: ${d || 'sin datos'}`;
      v.lanzar = v.repetir = true;
      break;
    case 'cuenta': {
      const faltan = num(r.faltan);
      v.texto = `Sale en ${faltan === null ? 'breve' : minutos(faltan, Math.ceil)}${d ? ` · ${d}` : ''}`;
      v.aviso = `sale en ${faltan === null ? 'breve' : minutos(faltan, Math.ceil)}`;
      v.lanzar = v.cancelar = true;
      v.arriba = true;
      break;
    }
    case 'emitiendo': {
      const clip = num(r.clipActual), total = num(r.jugadas);
      v.texto = `En antena${clip !== null ? `: clip ${clip}${total !== null ? ` de ${total}` : ''}` : ''}`;
      v.aviso = 'en antena';
      v.cancelar = true;
      v.arriba = true;
      break;
    }
    case 'hecho':
      v.texto = `Hecho${d ? `: ${d}` : ''}`;
      v.repetir = true;
      break;
    default:
      v.texto = 'Resumen final: estado desconocido';
      v.botones = false;
  }
  return v;
}
