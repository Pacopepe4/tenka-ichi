// Las ramas de lo que sabe la IA de los tickets, para gastar menos tokens: en cada pregunta va siempre el núcleo (quién
// es, cómo habla, las familias y el jefe) y, además, solo las ramas de las que habla la pregunta. Se eligen por palabras,
// sin preguntar a la IA: sale gratis. KB Stats va solo con las filas de los jugadores que se nombran (o de un rol).
//   ramas de discord/tickets-saber.md: cada «## Título <!-- rama -->» es de una rama
//   ramas en vivo: liga (calendario y clasificación), cartas (todas las del gachapon y los puntos del fantasy) y stats
//   (KB Stats)

// Las palabras que despiertan cada rama, sin tildes y en minúsculas. Cuentan como principio de palabra: «tirad»
// vale para «tirada» y «tiradas»
export const RAMAS = {
  liga: ['liga', 'jornada', 'calendario', 'horario', 'hora', 'cuando', 'que dia', 'partido', 'partida', 'juega', 'enfrent', 'contra', 'rival',
    'clasific', 'tabla', 'puesto', 'lider', 'primero', 'playoff', 'cuarto', 'semi', 'final', 'bo1', 'bo3', 'fearless', 'desempate', 'formato',
    'sorteo', 'bombo', 'lado', 'resultado', 'gano', 'gana', 'perdi', 'cronica', 'como va', 'como van', 'temporada'],
  gachapon: ['gacha', 'tirad', 'tirar', 'sobre', 'moneda', 'tragaperras', 'probab', 'porcentaje', 'garantia', 'segura', 'legacy', 'fundir', 'repetid',
    'mejorar', 'coleccion', 'album', 'conmemorativ', 'temporada', 'familia completa', 'jefe', 's+', 'abrir'],
  tiradas: ['tirad', 'conseguir', 'ganar', 'omamori', 'canje', 'canjear', 'recompensa', 'puntos del canal', 'puntos de canal', 'sub', 'suscri',
    'regal', 'kicks', 'codigo', 'vincul', 'premio', 'mas sobres', 'gratis'],
  fantasy: ['fantasy', 'fantasi', 'alinea', 'alinear', 'puntos', 'puntua', 'boost', 'mvp', 'premio', 'clasificacion del fantasy'],
  cartas: ['carta', 'tier', 'jugador', 'plantilla', 'quien juega', 'quienes', 'roster', 'dibujo', 'campeon', 'boost', 'legacy', 'jefe', 'top', 'jungla',
    'jungler', 'jungle', 'mid', 'medio', 'adc', 'tirador', 'support', 'supp', 'apoyo'],
  stats: ['stats', 'estadistic', 'kda', 'nota', 'winrate', 'wr', 'victorias', 'mvp', 'cs', 'farm', 'dano', 'vision', 'kbstats', 'kb stats', 'mejor',
    'peor', 'rendimiento', 'numeros', 'kills', 'muertes', 'asistencias', 'kp'],
  lore: ['lore', 'historia', 'oyabun', 'personaje', 'aspecto', 'mito', 'leyenda', 'shinigami', 'tatuaje', 'mascara'],
  directo: ['kick', 'twitch', 'directo', 'stream', 'emision', 'emite', 'ver el', '!', 'comando', 'chat', 'youtube', 'tiktok', 'redes', 'twitter',
    'instagram', 'avisos'],
  discord: ['discord', 'servidor', 'rol', 'canal', 'reclutar', 'kobun', 'oyabun', 'kumicho', 'ticket', 'staff', 'hilo', 'izakaya', 'voz', 'entrar en'],
  kb: ['kb', 'koryu', 'budo'],
};
const ROLES = { Top: ['top'], Jungla: ['jungla', 'jungler', 'jungle', 'jgl', 'jg'], Medio: ['mid', 'medio'], ADC: ['adc', 'tirador', 'bot'],
  Support: ['support', 'supp', 'sup', 'apoyo'] };
const MAX_KB_GENERAL = 15;   // si no se nombra a nadie, las mejores notas (del rol, si se dice)

export const normalizar = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9+!ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const compacto = s => normalizar(s).replace(/ /g, '');
const tiene = (texto, palabra) => (palabra === '!' ? /![a-z]/.test(texto) : new RegExp(`(^| )${palabra.replace(/[+]/g, '\\+')}`).test(texto));

function parecidas(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i);
}

// ¿Nombra la pregunta a este jugador? Por su nombre junto o con una letra de diferencia («jlgend» por «jlegend»)
export function nombra(pregunta, nombre) {
  const n = compacto(nombre);
  if (n.length < 3) return false;
  const palabras = normalizar(pregunta).split(' ');
  if (palabras.includes(n)) return true;
  if (n.length >= 4 && compacto(pregunta).includes(n)) return true;
  return n.length >= 5 && palabras.some(p => p.length >= 5 && parecidas(p, n));
}

// Las ramas de la pregunta. 'nombres' son los de los jugadores y 'familias' los de las familias: si salen, van las
// cartas y las estadísticas (jugadores) o el lore y las cartas (familias)
export function elegirRamas(pregunta, { nombres = [], familias = [] } = {}) {
  const t = normalizar(pregunta);
  const ramas = new Set(Object.entries(RAMAS).filter(([, palabras]) => palabras.some(p => tiene(t, p))).map(([r]) => r));
  const jugadores = nombres.filter(n => nombra(pregunta, n));
  if (jugadores.length) { ramas.add('cartas'); ramas.add('stats'); }
  const deFamilias = familias.filter(f => tiene(t, normalizar(f)));
  if (deFamilias.length) { ramas.add('lore'); ramas.add('cartas'); }
  // Con las estadísticas van las cartas: así la IA sabe de qué familia es cada uno
  if (ramas.has('stats')) ramas.add('cartas');
  return { ramas, jugadores, familias: deFamilias };
}

// Del lore, solo lo de las familias que se nombran (con la entradilla); si no se nombra ninguna, entero
export function recortarLore(texto, familias) {
  if (!familias.length) return texto;
  const deFamilia = l => /^- \*\*/.test(l);
  return texto.split('\n').filter(l => !deFamilia(l) || familias.some(f => l.startsWith(`- **${f}**`))).join('\n');
}

// discord/tickets-saber.md por apartados: [{ rama, texto }] (lo de antes del primer «##» es una nota para el staff)
export function seccionesSaber(md) {
  return md.split(/^(?=## )/m).filter(s => s.startsWith('## ')).map(s => {
    const rama = /<!--\s*([a-z]+)\s*-->/.exec(s.split('\n')[0])?.[1] || 'nucleo';
    return { rama, texto: s.replace(/\s*<!--[^>]*-->/, '').trim() };
  });
}

// Las filas de KB Stats que hacen falta: las de los jugadores nombrados o, si no, las mejores notas (del rol que se diga)
export function filasKb(kb, pregunta) {
  if (!kb?.filas?.length) return '';
  let filas = kb.filas.filter(f => nombra(pregunta, f.nombre));
  if (!filas.length) {
    const t = normalizar(pregunta);
    const rol = Object.entries(ROLES).find(([, ps]) => ps.some(p => tiene(t, p)))?.[0];
    filas = kb.filas.filter(f => !rol || f.rol === rol).slice(0, MAX_KB_GENERAL);
    if (filas.length) return `${kb.cabecera}\nNo se nombra a nadie en concreto: van las ${filas.length} mejores notas${rol ? ` de ${rol}` : ''}.\n${filas.map(f => f.texto).join('\n')}`;
  }
  return filas.length ? `${kb.cabecera}\n${filas.map(f => f.texto).join('\n')}` : '';
}

// La liga en vivo en texto corto (y no en JSON): fechas, cruces con su ganador, clasificación y cuadro
export function textoLiga(liga, clanes) {
  if (!liga) return 'No hay datos de la liga ahora mismo.';
  const nom = id => clanes.find(c => c.id === id)?.nombre || id;
  const f = liga.formato || {};
  const lineas = [];
  if (f.liguilla?.length) lineas.push(`Fechas de la liguilla: ${f.liguilla.map(j => `${j.nombre || `Jornada ${j.jornada}`} el ${j.fecha}`).join(', ')}.`);
  if (f.playoffs?.length) lineas.push(`Playoffs: ${f.playoffs.map(p => `${p.nombre || p.ronda} el ${p.fecha}`).join(', ')}.`);
  if (f.hora) lineas.push(`El primer partido de cada día es a las ${f.hora} (hora de España) y los demás, cada ${f.margen || 45} minutos.`);
  if (!liga.calendario) {
    lineas.push('El calendario de cruces todavía no se ha sorteado (se sortea en directo).');
    return lineas.join('\n');
  }
  const filas = liga.clasificacion?.filas || [];
  const gano = (a, b) => filas.find(x => x.clan === a)?.ganados?.includes(b);
  const fechaJ = n => f.liguilla?.find(j => j.jornada === n)?.fecha;
  for (const jornada of liga.calendario.jornadas || []) {
    const n = jornada[0]?.jornada;
    lineas.push(`Jornada ${n}${fechaJ(n) ? ` (${fechaJ(n)})` : ''}: ${jornada.map(p => {
      const r = gano(p.azul, p.rojo) ? `gana ${nom(p.azul)}` : gano(p.rojo, p.azul) ? `gana ${nom(p.rojo)}` : 'por jugar';
      return `${nom(p.azul)} (azul) vs ${nom(p.rojo)} (rojo), ${r}`;
    }).join('; ')}.`);
  }
  if (filas.length) lineas.push(`Clasificación: ${filas.map(x => `${x.puesto}.º ${nom(x.clan)} ${x.victorias}-${x.derrotas}`).join(' · ')}.`);
  const series = Object.values(liga.cuadro || {}).flatMap(x => (Array.isArray(x) ? x : x ? [x] : []));
  for (const s of series) {
    if (!s?.alto && !s?.bajo) continue;
    const v = s.victorias || {};
    lineas.push(`${s.ronda}${s.fecha ? ` (${s.fecha})` : ''}: ${nom(s.alto) || 'por decidir'} vs ${nom(s.bajo) || 'por decidir'}${s.alto && s.bajo ? ` ${v[s.alto] ?? 0}-${v[s.bajo] ?? 0}` : ''}${s.ganador ? `, gana ${nom(s.ganador)}` : ''}.`);
  }
  return lineas.join('\n');
}
