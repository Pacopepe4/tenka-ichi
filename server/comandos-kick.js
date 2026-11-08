// Comandos del chat de Kick (los eligió Pacopepe el 08/11/2026): !sobres, !clasificacion, !gachapon, !partido y !comandos.
// Llegan con el aviso chat.message.sent (server/kick-eventos.js) y la web contesta en el chat como la cuenta del canal.
// Aquí solo se decide qué contestar: lo que hace falta saber (la cuenta de quien escribe, el fantasy, el calendario)
// llega en «ctx», así se prueba sin Kick.

export const COMANDOS = ['sobres', 'clasificacion', 'gachapon', 'partido'];
// Lo que se contesta igual a todos se contesta como mucho cada 15 s; lo de cada uno (!sobres), cada 30 s por persona
export const ESPERA_COMANDO_MS = { general: 15000, personal: 30000 };
const PERSONALES = new Set(['sobres']);
const ALIAS = { clasificación: 'clasificacion', ranking: 'clasificacion', gacha: 'gachapon', omamori: 'gachapon', proximo: 'partido',
  próximo: 'partido', ayuda: 'comandos' };

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// El comando de un mensaje («!Sobres», «!clasificación por favor»…) o null si no es uno de los nuestros
export function comandoDe(texto) {
  const m = /^\s*!([\p{L}]+)/u.exec(String(texto || ''));
  if (!m) return null;
  const c = m[1].toLowerCase();
  const nombre = ALIAS[c] || c;
  return COMANDOS.includes(nombre) || nombre === 'comandos' ? nombre : null;
}
export const esPersonal = comando => PERSONALES.has(comando);

// ctx: { web, coste, cuenta(userId), clasificacion(), puesto(idCuenta), partido() }
export function responderComando(comando, quien, ctx) {
  const gachapon = `${ctx.web}/gachapon/`;
  if (comando === 'comandos') return `Comandos de Gokudō: ${COMANDOS.map(c => `!${c}`).join(' · ')}`;
  if (comando === 'gachapon') {
    return `Gachapon de Gokudō: ${gachapon} · Entra con Discord y vincula tu Kick: el Omamori${ctx.coste ? ` (${ctx.coste} puntos)` : ''}, `
      + 'las subs y los kicks te dan sobres de cartas.';
  }
  if (comando === 'sobres') {
    const c = ctx.cuenta(quien.user_id);
    if (c.vinculada) return `@${quien.username} tienes ${plural(c.sobres, 'sobre', 'sobres')} sin abrir y ${plural(c.cartas, 'carta', 'cartas')} en el gachapon: ${gachapon}`;
    if (c.sobres > 0) return `@${quien.username} tienes ${plural(c.sobres, 'sobre esperándote', 'sobres esperándote')}: vincula tu Kick en ${gachapon} y te llegan a tu colección.`;
    return `@${quien.username} aún no has vinculado tu Kick: entra en ${gachapon} con Discord y pulsa «vincula tu Kick».`;
  }
  if (comando === 'clasificacion') {
    const lista = ctx.clasificacion().filter(c => c.puntos > 0);
    if (!lista.length) return 'El fantasy de Gokudō aún no tiene puntos: se suman desde la primera jornada de liga.';
    const top = lista.slice(0, 3).map(c => `${c.puesto}.º ${c.nombre} (${c.puntos})`).join(' · ');
    const c = ctx.cuenta(quien.user_id);
    const puesto = c.vinculada ? ctx.puesto(c.id) : null;
    return `Fantasy de Gokudō: ${top}${puesto ? ` · @${quien.username} vas ${puesto}.º` : ''}`;
  }
  if (comando === 'partido') return ctx.partido();
  return null;
}

// ---------- el próximo partido ----------
// La hora de España de un día y una hora (igual que public/comun.js)
export function horaEspana(fecha, hora = '00:00') {
  const supuesto = new Date(`${fecha}T${hora}:00Z`);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hourCycle: 'h23', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(supuesto).map(x => [x.type, x.value]));
  const enMadrid = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return new Date(supuesto.getTime() - (enMadrid - supuesto.getTime()));
}
function horasDelDia(cuantos, primera, margen) {
  const [h, m] = primera.split(':').map(Number);
  return Array.from({ length: cuantos }, (_, i) => {
    const t = h * 60 + m + i * margen;
    return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  });
}
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const dia = fecha => { const [a, m, d] = fecha.split('-').map(Number); return `${DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${d}/${m}`; };

// formato: el de la temporada (formatoTemporada()); calendario: el sorteado o null; nombre: id del clan → nombre de su familia
export function textoPartido({ formato, calendario, nombre }, ahora = Date.now()) {
  const partidos = [];
  for (const j of formato.liguilla) {
    const cruces = calendario?.jornadas?.[j.jornada - 1] || null;
    const horas = horasDelDia(cruces?.length || 1, formato.hora, formato.margen);
    if (cruces) cruces.forEach((c, k) => partidos.push({ ronda: j.nombre, fecha: j.fecha, hora: horas[k], cruce: `${nombre(c.azul)} contra ${nombre(c.rojo)}` }));
    else partidos.push({ ronda: j.nombre, fecha: j.fecha, hora: horas[0], cruce: null });
  }
  for (const r of formato.playoffs) partidos.push({ ronda: r.nombre, fecha: r.fecha, hora: formato.hora, cruce: null });
  for (const p of partidos) p.inicio = horaEspana(p.fecha, p.hora).getTime();

  const enJuego = partidos.find(p => p.cruce && p.inicio <= ahora && ahora < p.inicio + formato.margen * 60000);
  const siguiente = partidos.find(p => p.inicio > ahora);
  const cuando = p => `${p.ronda}, ${dia(p.fecha)} a las ${p.hora} (hora de España)`;
  const describir = p => (p.cruce ? `${p.cruce}: ${cuando(p)}` : `${cuando(p)}${calendario ? '' : '. Los cruces salen en el sorteo del calendario'}`);
  if (enJuego) return `Ahora: ${enJuego.cruce} (${enJuego.ronda})${siguiente ? ` · Después: ${describir(siguiente)}` : ''}`;
  if (siguiente) return `Próximo partido de Gokudō · ${describir(siguiente)}`;
  return 'La temporada de Gokudō ha terminado: ¡gracias por verla!';
}
