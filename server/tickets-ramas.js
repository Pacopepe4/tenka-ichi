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
  discord: ['discord', 'servidor', 'rol', 'canal', 'reclut', 'recluto', 'kobun', 'oyabun', 'kumicho', 'ticket', 'staff', 'hilo', 'izakaya', 'voz', 'entrar en'],
  kb: ['kb', 'koryu', 'budo'],
  // Preguntas por las leyendas de la Liga KB en general: va el lore de todos los de discord/kbstats-jugadores.md (si se
  // nombra a alguien, va solo el suyo, aunque no salga ninguna de estas palabras)
  escena: ['leyenda', 'legendari', 'antiguo', 'antiguos', 'veterano', 'historia de kb', 'quien es quien', 'cinturones', 'campeones de'],
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
// 'jugadores' son los nombres de Gokudō que salen en la pregunta: se buscan en KB Stats por su equivalencia
// (discord/kbstats-alias.json: nombre en Gokudō → cuenta en KB) o por el nombre parecido, y si no están se dice
export function filasKb(kb, pregunta, { jugadores = [], alias = {} } = {}) {
  if (!kb?.filas?.length) return '';
  const elegidas = new Set(kb.filas.filter(f => nombra(pregunta, f.nombre)));
  const sinFila = [];
  const noJuegan = [];
  for (const j of jugadores) {
    const clave = j in alias ? j : String(j).toUpperCase();
    // null en las equivalencias: no juega en la Liga KB (y no se busca por parecido, para no darle las stats de otro)
    if (clave in alias && alias[clave] === null) { noJuegan.push(j); continue; }
    const cuenta = alias[clave];
    const suyas = cuenta ? kb.filas.filter(f => compacto(f.nombre) === compacto(String(cuenta).replace(/#.*$/, '').replace(/^KB\s+/i, '')))
      : kb.filas.filter(f => nombra(j, f.nombre) || nombra(f.nombre, j));
    if (suyas.length) suyas.forEach(f => elegidas.add(f)); else sinFila.push(j);
  }
  if (elegidas.size || sinFila.length || noJuegan.length) {
    const filas = kb.filas.filter(f => elegidas.has(f)).map(f => f.texto);
    const avisos = [
      noJuegan.length && `No juegan en la Liga KB, así que no tienen estadísticas allí: ${noJuegan.join(', ')}. Dilo así y no inventes sus números.`,
      sinFila.length && `No aparecen en KB Stats con ese nombre (en la Liga KB juegan con su cuenta de LoL, que puede ser otra): ${sinFila.join(', ')}. Dilo así y no inventes sus números.`,
    ];
    return [kb.cabecera, ...filas, ...avisos].filter(Boolean).join('\n');
  }
  // No se nombra a nadie: las mejores notas (del rol que se diga)
  const t = normalizar(pregunta);
  const rol = Object.entries(ROLES).find(([, ps]) => ps.some(p => tiene(t, p)))?.[0];
  const filas = kb.filas.filter(f => !rol || f.rol === rol).slice(0, MAX_KB_GENERAL);
  return filas.length ? `${kb.cabecera}\nNo se nombra a nadie en concreto: van las ${filas.length} mejores notas${rol ? ` de ${rol}` : ''}.\n${filas.map(f => f.texto).join('\n')}` : '';
}

// discord/kbstats-jugadores.md: un bloque por jugador de KB Stats («### cuenta», «- En Gokudō: …», «- Lore: …»)
export function leerFichaKb(md) {
  return String(md || '').split(/^(?=### )/m).filter(b => b.startsWith('### ')).map(b => {
    const cuenta = b.split('\n')[0].slice(4).trim();
    const valor = clave => (new RegExp(`^- ${clave}:[ \\t]*(.*)$`, 'm').exec(b)?.[1] || '').trim();
    return { cuenta, nombre: cuenta.replace(/#.*$/, '').replace(/^KB\s+/i, '').trim(), gokudo: valor('En Gokudō'), lore: valor('Lore') };
  });
}

// Las equivalencias que salen de la lista: nombre en Gokudō → cuenta de KB
export const aliasDeFicha = ficha => Object.fromEntries(ficha.filter(f => f.gokudo).map(f => [f.gokudo.toUpperCase(), f.nombre]));

// El lore de la gente que se nombra (por su cuenta de KB o por su nombre en Gokudō); con 'general', el de todos
export function quienEs(ficha, texto, { general = false, max = 40 } = {}) {
  const conLore = ficha.filter(f => f.lore);
  const nombrados = texto ? conLore.filter(f => nombra(texto, f.nombre) || (f.gokudo && nombra(texto, f.gokudo))) : [];
  const lista = nombrados.length ? nombrados : general ? conLore.slice(0, max) : [];
  return lista.map(f => `- **${f.cuenta.replace(/#.*$/, '')}**${f.gokudo ? ` (en Gokudō, ${f.gokudo})` : ''}: ${f.lore}`).join('\n');
}

// De la conversación del ticket, solo lo que ha escrito la gente (para saber de quién o de qué se hablaba). Lo que
// contestó SrDirector no cuenta, salvo la pregunta que copia al principio («**❓ nombre:** pregunta → respuesta»)
export function loQueDijoLaGente(historia) {
  return String(historia || '').split('\n').map(l => {
    if (!l.startsWith('[SrDirector')) return l;
    return /\*\*❓ [^*]*:\*\* (.*?)(?: → |$)/.exec(l)?.[1] || '';
  }).filter(Boolean).join('\n');
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
