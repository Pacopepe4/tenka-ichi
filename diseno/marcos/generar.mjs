// Marcos de las cartas de Tenka Ichi (1000×1400, ventana del arte transparente de 750×750 en x 125, y 282).
// - Cartas de Jugador (S, A, B, C y D): «washi», papel y tinta.
// - Cartas BOOST (S+, S, A, B): «laca», laca y metal de armadura con cordones de colores; la S+ es toda de oro.
// - Reverso: el washi, igual para todas, para no desvelar nada al abrir el sobre.
// - Guardadas para ediciones especiales: la alternativa de laca completa y la S+ washi con torii.
// Salen en SVG en diseno/marcos/svg/. Las letras (S, A, B, C, S+) y 天下一 van aparte, en texto con la fuente
// de la marca: las pone exportar.mjs al pasarlos a PNG.
//   node diseno/marcos/generar.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SALIDA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'svg');
mkdirSync(path.join(SALIDA, 'guardadas'), { recursive: true });

const W = 1000, H = 1400;
const V = { x: 125, y: 282, x2: 875, y2: 1032 };
const n1 = v => Math.round(v * 10) / 10;
const rr = (x, y, w, h, r) => `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
const inset = (i, r) => rr(i, i, W - 2 * i, H - 2 * i, r);
const CARTA = inset(0, 36);
const VENTANA = `M${V.x} ${V.y}H${V.x2}V${V.y2}H${V.x}Z`;

const C = {
  tinta: '#1D1A17', papel: '#EDE4CF', papelClaro: '#F5EFE2', shu: '#C1272D', shuClaro: '#DE4A4F', shuOscuro: '#7E161B',
  oro: '#C9A24A', oroClaro: '#EBD28A', oroOscuro: '#7C5D1C',
  murasaki: '#5E3494', murasakiClaro: '#9A6AD0', murasakiOscuro: '#351C57',
};
// Cada tier: estrellas y su color (sello y estrellas)
const TIERS = {
  D: { estrellas: 1, color: '#8A8175' },
  C: { estrellas: 2, color: '#5E8C4A' },
  B: { estrellas: 3, color: '#A9B3BD' },
  A: { estrellas: 4, color: '#C9A24A' },
  S: { estrellas: 5, color: C.shu },
  SP: { estrellas: 6, color: C.murasaki },
};
// Estilos de laca: color de los cordones, metal y adorno (0 liso, 1 doble borde, 2 esquineras,
// 3 banda bermellón con puntos y rombos, 4 torii con laca morada y rayos de oro)
const LACA = {
  C: { cordon: '#5E8C4A', cordonOscuro: '#34512A', metal: 'hierro', nivel: 0 },
  B: { cordon: '#D5DBE0', cordonOscuro: '#8D98A2', metal: 'plata', nivel: 1 },
  A: { cordon: '#D2A640', cordonOscuro: '#7C5D1C', metal: 'oro', nivel: 2 },
  S: { cordon: C.shu, cordonOscuro: C.shuOscuro, metal: 'oro', nivel: 3 },
  SP: { cordon: '#7A4CC0', cordonOscuro: '#3E2163', metal: 'oro', nivel: 4 },
};
// BOOST: cordones añil (B), blancos (A), rojos (S) y de oro (S+, la laca A elegida para la S+)
const BOOST = {
  B: { cordon: '#3B5FA3', cordonOscuro: '#1D3057', metal: 'hierro', nivel: 1 },
  A: { cordon: '#E4E8EB', cordonOscuro: '#9AA5AF', metal: 'plata', nivel: 2 },
  S: LACA.S,
  SP: LACA.A,
};
const METALES = {
  hierro: { base: '#807A72', claro: '#B8B1A7', oscuro: '#3A3632', brillo: '#F0EAE0' },
  plata: { base: '#B9C2CA', claro: '#EEF2F5', oscuro: '#5C6670', brillo: '#FFFFFF' },
  oro: { base: '#C9A24A', claro: '#F0D48A', oscuro: '#6F5115', brillo: '#FFF4CC' },
};

// ---------- piezas ----------
function estrella(cx, cy, R, r = R * 0.42, puntas = 5) {
  let d = '';
  for (let i = 0; i < puntas * 2; i++) {
    const a = (-90 + i * 180 / puntas) * Math.PI / 180, q = i % 2 ? r : R;
    d += `${i ? 'L' : 'M'}${n1(cx + q * Math.cos(a))} ${n1(cy + q * Math.sin(a))}`;
  }
  return d + 'Z';
}
const rombo = (cx, cy, w, h) => `M${cx} ${cy - h}L${cx + w} ${cy}L${cx} ${cy + h}L${cx - w} ${cy}Z`;

// Olas seigaiha: abanicos de arcos concéntricos, cada fila tapa a la de arriba
function seigaiha(id, R, fondo, tinta, grosor, opacidad) {
  let c = '';
  for (const y of [-R / 2, 0, R / 2, R, 1.5 * R]) {
    const xs = Math.round(y / (R / 2)) % 2 === 0 ? [0, 2 * R] : [R];
    for (const x of xs) {
      c += `<circle cx="${x}" cy="${y}" r="${R}" fill="${fondo}" stroke="${tinta}" stroke-opacity="${opacidad}" stroke-width="${grosor}"/>`;
      for (const k of [0.76, 0.52, 0.28]) c += `<circle cx="${x}" cy="${y}" r="${n1(R * k)}" fill="none" stroke="${tinta}" stroke-opacity="${opacidad}" stroke-width="${grosor}"/>`;
    }
  }
  return `<pattern id="${id}" width="${2 * R}" height="${R}" patternUnits="userSpaceOnUse">${c}</pattern>`;
}

// Escamas de armadura (kozane) atadas con cordones verticales del color de la tier (kebiki odoshi)
function kozane(id, cordon, cordonOscuro) {
  return `<pattern id="${id}" width="48" height="40" patternUnits="userSpaceOnUse">`
    + `<rect width="48" height="40" fill="#0E0B0A"/>`
    + `<rect x="0" y="2" width="48" height="28" fill="#211A16"/><rect x="0" y="2" width="48" height="2" fill="#3B302A"/><rect x="0" y="28" width="48" height="2" fill="#080605"/>`
    + `<circle cx="24" cy="16" r="2.4" fill="#4A3E36"/><circle cx="2" cy="16" r="2.4" fill="#4A3E36"/><circle cx="46" cy="16" r="2.4" fill="#4A3E36"/>`
    + `<rect x="9" y="0" width="8" height="40" fill="${cordon}"/><rect x="31" y="0" width="8" height="40" fill="${cordon}"/>`
    + `<rect x="9" y="0" width="8" height="4" fill="${cordonOscuro}"/><rect x="31" y="0" width="8" height="4" fill="${cordonOscuro}"/>`
    + `<rect x="9" y="30" width="8" height="4" fill="${cordonOscuro}"/><rect x="31" y="30" width="8" height="4" fill="${cordonOscuro}"/>`
    + `<rect x="10" y="6" width="2" height="20" fill="#FFFFFF" fill-opacity="0.2"/><rect x="32" y="6" width="2" height="20" fill="#FFFFFF" fill-opacity="0.2"/>`
    + `</pattern>`;
}

function rayos(cx, cy, n, largo, color, opacidad, ancho = 0.5) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a0 = (i * 360 / n) * Math.PI / 180, a1 = ((i + ancho) * 360 / n) * Math.PI / 180;
    d += `M${cx} ${cy}L${n1(cx + largo * Math.cos(a0))} ${n1(cy + largo * Math.sin(a0))}L${n1(cx + largo * Math.cos(a1))} ${n1(cy + largo * Math.sin(a1))}Z`;
  }
  return `<path d="${d}" fill="${color}" fill-opacity="${opacidad}"/>`;
}

// Esquinera (kanagu): placa en L con remate en punta y un clavo
function esquina(x, y, sx, sy, L, g, relleno, borde) {
  const p = [[0, 0], [L, 0], [L - g * 0.9, g * 0.5], [L - g * 0.9 - 6, g], [g, g], [g, L - g * 0.9 - 6], [g * 0.5, L - g * 0.9], [0, L]];
  const d = p.map(([a, b], i) => `${i ? 'L' : 'M'}${n1(x + sx * a)} ${n1(y + sy * b)}`).join('') + 'Z';
  return `<path d="${d}" fill="${relleno}" stroke="${borde}" stroke-width="2.5" stroke-linejoin="round"/>`
    + `<circle cx="${n1(x + sx * g * 0.5)}" cy="${n1(y + sy * g * 0.5)}" r="${n1(g * 0.2)}" fill="${borde}"/>`;
}
const esquinasCarta = (d, L, g, relleno, borde) =>
  esquina(d, d, 1, 1, L, g, relleno, borde) + esquina(W - d, d, -1, 1, L, g, relleno, borde)
  + esquina(d, H - d, 1, -1, L, g, relleno, borde) + esquina(W - d, H - d, -1, -1, L, g, relleno, borde);
// En las esquinas de la ventana, por fuera
const esquinasVentana = (relleno, borde) =>
  esquina(V.x - 14, V.y - 14, 1, 1, 64, 14, relleno, borde) + esquina(V.x2 + 14, V.y - 14, -1, 1, 64, 14, relleno, borde)
  + esquina(V.x - 14, V.y2 + 14, 1, -1, 64, 14, relleno, borde) + esquina(V.x2 + 14, V.y2 + 14, -1, -1, 64, 14, relleno, borde);

// Torii de la S+: la carta entera es la puerta. El kasagi corona la carta, los pilares son los bordes,
// la barra del nombre hace de placa (gaku) y el nuki pasa por debajo
function torii() {
  return `<rect x="16" y="30" width="34" height="1340" fill="${C.shu}" stroke="${C.shuOscuro}" stroke-width="2"/>`
    + `<rect x="950" y="30" width="34" height="1340" fill="${C.shu}" stroke="${C.shuOscuro}" stroke-width="2"/>`
    + `<rect x="22" y="36" width="6" height="1330" fill="#FFFFFF" fill-opacity="0.16"/><rect x="956" y="36" width="6" height="1330" fill="#FFFFFF" fill-opacity="0.16"/>`
    + `<rect x="10" y="1316" width="46" height="58" rx="4" fill="${C.tinta}"/><rect x="944" y="1316" width="46" height="58" rx="4" fill="${C.tinta}"/>`
    + `<rect x="10" y="186" width="980" height="14" fill="${C.shu}" stroke="${C.shuOscuro}" stroke-width="2"/>`
    + `<path d="M14 26 Q500 48 986 26 L976 42 Q500 62 24 42 Z" fill="${C.shu}" stroke="${C.shuOscuro}" stroke-width="2"/>`
    + `<path d="M8 10 Q500 36 992 10 L986 26 Q500 48 14 26 Z" fill="${C.tinta}"/>`
    + `<path d="M12 12 Q500 37 988 12" fill="none" stroke="#FFFFFF" stroke-opacity="0.22" stroke-width="2"/>`;
}

const fibra = `<filter id="fibra" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9 0.3" numOctaves="3" seed="7" result="n"/>`
  + `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0.32  0 0 0 0 0.26  0 0 0 0 0.19  0 0 0 0.11 0" result="c"/><feComposite in="c" in2="SourceAlpha" operator="in"/></filter>`;
const fuera = `<clipPath id="fuera"><path clip-rule="evenodd" d="${CARTA} ${VENTANA}"/></clipPath>`;
const svg = (defs, cuerpo) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>${cuerpo}</svg>\n`;

// Estrellas alineadas a la derecha y el sello de la tier a la izquierda
function filaEstrellas(n, cy, pintar) {
  let s = '';
  for (let i = 0; i < n; i++) s += pintar(848 - i * 64, cy);
  return s;
}
const marcoVentana = color => `<path d="M122 279H878V1035H122Z" fill="none" stroke="${color}" stroke-width="6"/>`;

// ================= Alternativa 1: washi (papel y tinta) =================
function washi(tier) {
  const T = TIERS[tier], sp = tier === 'SP';
  const nivel = { D: 0, C: 0, B: 1, A: 2, S: 3, SP: 4 }[tier];
  const defs = fibra + fuera + seigaiha('olas', 30, C.papel, C.tinta, 2.2, tier === 'S' ? 0.5 : 0.3);
  let s = `<path d="${CARTA} ${VENTANA}" fill-rule="evenodd" fill="${C.papel}"/>`;
  // Olas en los márgenes desde la A; rayos de sol dorados en la S+
  if (nivel >= 2 && !sp) s += `<g clip-path="url(#fuera)"><rect x="44" y="44" width="912" height="1312" fill="url(#olas)"/></g>`;
  if (sp) s += `<g clip-path="url(#fuera)">${rayos(500, 657, 56, 1300, '#D8B254', 0.38)}</g>`;
  s += `<path d="${CARTA} ${VENTANA}" fill-rule="evenodd" fill="#000" filter="url(#fibra)"/>`;

  // Bordes: C lisa, B doble, A esquineras, S banda bermellón con puntos y rombos, S+ el torii
  if (tier === 'S') {
    s += `<path d="${inset(8, 30)} ${inset(40, 14)}" fill-rule="evenodd" fill="${C.shu}"/>`
      + `<path d="${inset(8, 30)}" fill="none" stroke="${C.tinta}" stroke-width="4"/><path d="${inset(40, 14)}" fill="none" stroke="${C.tinta}" stroke-width="3"/>`
      + `<path d="${inset(52, 8)}" fill="none" stroke="${C.tinta}" stroke-width="6" stroke-linecap="round" stroke-dasharray="0.1 17"/>`;
    for (const [x, y] of [[500, 24], [500, 1376], [24, 700], [976, 700], [250, 24], [750, 24], [250, 1376], [750, 1376], [24, 380], [24, 1020], [976, 380], [976, 1020]]) {
      s += `<path d="${rombo(x, y, 13, 11)}" fill="${C.oro}" stroke="${C.tinta}" stroke-width="2"/>`;
    }
  } else if (sp) {
    s += torii() + `<path d="${inset(58, 10)}" fill="none" stroke="${C.oro}" stroke-width="3"/>`;
  } else {
    s += `<path d="${inset(14, 26)}" fill="none" stroke="${C.tinta}" stroke-width="10"/>`;
    if (nivel >= 1) s += `<path d="${inset(32, 14)}" fill="none" stroke="${C.tinta}" stroke-width="3"/>`;
  }
  if (nivel >= 2 && !sp) s += esquinasCarta(tier === 'S' ? 58 : 38, 92, 22, C.oro, C.oroOscuro);

  // Barra del nombre y hueco del emblema (en la S+, placa del torii con el sello S+)
  if (sp) {
    s += `<path d="${rr(54, 58, 892, 130, 14)}" fill="${C.tinta}"/><path d="${rr(62, 66, 876, 114, 9)}" fill="${C.papelClaro}"/>`
      + `<path d="${rr(69, 73, 862, 100, 6)}" fill="none" stroke="${C.oro}" stroke-width="2.5"/>`
      + `<rect x="823" y="71" width="104" height="104" rx="6" fill="${C.murasaki}" stroke="${C.oro}" stroke-width="4"/>`
      + `<rect x="831" y="79" width="88" height="88" rx="3" fill="none" stroke="${C.oroClaro}" stroke-width="1.5"/>`;
  } else {
    s += `<path d="${rr(60, 64, 880, 118, 12)}" fill="${C.papelClaro}" stroke="${C.tinta}" stroke-width="4"/>`;
    if (nivel >= 2) s += `<path d="${rr(68, 72, 864, 102, 7)}" fill="none" stroke="${tier === 'S' ? C.shu : C.oro}" stroke-width="2.5"/>`;
    s += `<circle cx="875" cy="123" r="52" fill="${C.papel}" stroke="${C.tinta}" stroke-width="4"/><circle cx="875" cy="123" r="44" fill="none" stroke="${T.color}" stroke-width="3"/>`;
  }

  // Fila de estrellas: sello con la letra (o 天下一 en la S+) y estrellas del color de la tier
  const cy = sp ? 236 : 232;
  if (!sp) s += `<rect x="125" y="198" width="68" height="68" rx="6" fill="${T.color}" stroke="${C.tinta}" stroke-width="3"/>`
    + `<rect x="131" y="204" width="56" height="56" rx="3" fill="none" stroke="${C.papelClaro}" stroke-opacity="0.7" stroke-width="2"/>`;
  s += filaEstrellas(T.estrellas, cy, (x, y) => `<circle cx="${x}" cy="${y}" r="27" fill="${sp ? C.oro : T.color}" stroke="${C.tinta}" stroke-width="3"/>`
    + `<path d="${estrella(x, y, 17)}" fill="${C.papelClaro}"/>`);

  // Ventana del arte (transparente)
  if (sp) s += `<path d="M114 271H886V1043H114Z" fill="none" stroke="${C.oro}" stroke-width="3"/>`;
  s += marcoVentana(C.tinta);
  if (nivel >= 2 && !sp) s += esquinasVentana(C.oro, C.oroOscuro);

  // Caja de texto: rol y clan arriba, frase o datos abajo
  s += `<path d="${rr(90, 1062, 820, 272, 12)}" fill="${C.papelClaro}" stroke="${C.tinta}" stroke-width="4"/>`;
  if (sp) s += `<clipPath id="caja"><path d="${rr(98, 1070, 804, 256, 8)}"/></clipPath><g clip-path="url(#caja)">${rayos(500, 1340, 40, 520, '#D8B254', 0.16)}</g>`;
  if (nivel >= 2) s += `<path d="${rr(98, 1070, 804, 256, 8)}" fill="none" stroke="${sp || tier === 'A' ? C.oro : C.shu}" stroke-width="2"/>`;
  s += `<path d="M114 1146H886" stroke="${C.tinta}" stroke-width="2"/>`;
  return svg(defs, s);
}

// ================= Alternativa 2: laca (laca y metal de armadura) =================
function metalDefs(m) {
  const M = METALES[m];
  return `<linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${M.claro}"/><stop offset="0.45" stop-color="${M.base}"/><stop offset="0.8" stop-color="${M.oscuro}"/><stop offset="1" stop-color="${M.base}"/></linearGradient>`
    + `<radialGradient id="hoshi" cx="0.36" cy="0.3" r="0.75"><stop offset="0" stop-color="${M.brillo}"/><stop offset="0.35" stop-color="${M.base}"/><stop offset="1" stop-color="${M.oscuro}"/></radialGradient>`;
}
const murasakiDefs = `<linearGradient id="murasaki" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5E3494"/><stop offset="0.5" stop-color="#3E2163"/><stop offset="1" stop-color="#24123D"/></linearGradient>`;
const lacaDefs = `<linearGradient id="laca" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2B221D"/><stop offset="0.5" stop-color="#15110F"/><stop offset="1" stop-color="#0B0908"/></linearGradient>`;

// La tier pone las estrellas y el sello (en la S+, el sello S+ y 天下一); el estilo, el resto
function laca(tier, E) {
  const T = TIERS[tier], M = METALES[E.metal], sp = tier === 'SP';
  const nivel = E.nivel, conTorii = nivel === 4;
  const defs = fibra + fuera + lacaDefs + murasakiDefs + metalDefs(E.metal) + kozane('kozane', E.cordon, E.cordonOscuro);
  let s = `<path d="${CARTA} ${VENTANA}" fill-rule="evenodd" fill="url(#laca)"/>`;
  // Escamas atadas con cordones alrededor de todo; con torii, laca morada con rayos finos de oro (makie)
  if (conTorii) s += `<g clip-path="url(#fuera)"><path d="${inset(44, 12)}" fill="url(#murasaki)"/>${rayos(500, 657, 72, 1300, '#E6C56A', 0.6, 0.12)}</g>`;
  else s += `<g clip-path="url(#fuera)"><path d="${inset(44, 12)}" fill="url(#kozane)"/></g>`;

  if (nivel === 3) {
    s += `<path d="${inset(10, 30)} ${inset(40, 14)}" fill-rule="evenodd" fill="${C.shu}"/>`
      + `<path d="${inset(10, 30)}" fill="none" stroke="url(#metal)" stroke-width="5"/><path d="${inset(40, 14)}" fill="none" stroke="url(#metal)" stroke-width="4"/>`
      + `<path d="${inset(52, 8)}" fill="none" stroke="${M.claro}" stroke-width="6" stroke-linecap="round" stroke-dasharray="0.1 17"/>`;
    for (const [x, y] of [[500, 25], [500, 1375], [25, 700], [975, 700], [250, 25], [750, 25], [250, 1375], [750, 1375], [25, 380], [25, 1020], [975, 380], [975, 1020]]) {
      s += `<path d="${rombo(x, y, 12, 10)}" fill="url(#metal)" stroke="${M.oscuro}" stroke-width="1.5"/>`;
    }
  } else if (conTorii) {
    s += torii() + `<path d="${inset(58, 10)}" fill="none" stroke="url(#metal)" stroke-width="4"/>`;
  } else {
    s += `<path d="${inset(12, 28)}" fill="none" stroke="url(#metal)" stroke-width="9"/>`;
    if (nivel >= 1) s += `<path d="${inset(38, 12)}" fill="none" stroke="url(#metal)" stroke-width="3.5"/>`;
  }
  if (nivel >= 2 && !conTorii) s += esquinasCarta(nivel === 3 ? 58 : 40, 92, 22, 'url(#metal)', M.oscuro);

  // Barra del nombre: placa de washi en marco de metal (el nombre se escribe encima en tinta)
  s += `<path d="${rr(54, 58, 892, 130, 14)}" fill="url(#metal)"/><path d="${rr(62, 66, 876, 114, 9)}" fill="${C.papelClaro}"/>`
    + `<path d="${rr(62, 66, 876, 114, 9)}" fill="#000" filter="url(#fibra)"/>`;
  if (sp) {
    s += `<rect x="823" y="71" width="104" height="104" rx="6" fill="${C.murasaki}" stroke="url(#metal)" stroke-width="5"/>`
      + `<rect x="832" y="80" width="86" height="86" rx="3" fill="none" stroke="${M.claro}" stroke-width="1.5"/>`;
  } else {
    s += `<circle cx="875" cy="123" r="56" fill="url(#metal)"/><circle cx="875" cy="123" r="47" fill="${C.papel}"/>`
      + `<circle cx="875" cy="123" r="47" fill="none" stroke="${M.oscuro}" stroke-width="1.5"/>`;
  }

  // Banda de la fila de estrellas: laca lisa con remaches (hoshi, como los de los cascos) de metal
  s += `<path d="${rr(60, 194, 880, 76, 8)}" fill="#0F0C0B" stroke="url(#metal)" stroke-width="2.5"/>`;
  if (!sp) s += `<rect x="125" y="198" width="68" height="68" rx="6" fill="${T.color}" stroke="url(#metal)" stroke-width="3"/>`
    + `<rect x="131" y="204" width="56" height="56" rx="3" fill="none" stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="1.5"/>`;
  s += filaEstrellas(T.estrellas, 232, (x, y) => `<circle cx="${x}" cy="${y + 3}" r="25" fill="#000" fill-opacity="0.5"/>`
    + `<circle cx="${x}" cy="${y}" r="24" fill="url(#hoshi)" stroke="${M.oscuro}" stroke-width="2"/>`
    + `<ellipse cx="${x - 8}" cy="${y - 9}" rx="7" ry="4" fill="#FFFFFF" fill-opacity="0.55"/>`);

  // Ventana del arte (transparente) con marco de metal
  s += `<path d="M115 272H885V1042H115Z" fill="none" stroke="#000" stroke-width="3"/>` + marcoVentana('url(#metal)');
  if (nivel >= 2) s += esquinasVentana('url(#metal)', M.oscuro);

  // Caja de texto: placa de washi en marco de metal
  s += `<path d="${rr(84, 1056, 832, 284, 14)}" fill="url(#metal)"/><path d="${rr(92, 1064, 816, 268, 9)}" fill="${C.papelClaro}"/>`
    + `<path d="${rr(92, 1064, 816, 268, 9)}" fill="#000" filter="url(#fibra)"/>`;
  if (conTorii) s += `<clipPath id="caja"><path d="${rr(92, 1064, 816, 268, 9)}"/></clipPath><g clip-path="url(#caja)">${rayos(500, 1340, 40, 520, '#C9A24A', 0.16)}</g>`;
  s += `<path d="M116 1146H884" stroke="${C.tinta}" stroke-width="2"/>`;
  return svg(defs, s);
}

// ================= Reversos (iguales para todas las tiers) =================
function reversoWashi() {
  const defs = fibra + seigaiha('olas', 34, C.papel, C.tinta, 2.4, 0.42) + `<clipPath id="campo"><path d="${rr(60, 60, 880, 1280, 10)}"/></clipPath>`;
  let s = `<path d="${CARTA}" fill="${C.papel}"/>`
    + `<g clip-path="url(#campo)"><rect x="60" y="60" width="880" height="1280" fill="url(#olas)"/></g>`
    + `<path d="${CARTA}" fill="#000" filter="url(#fibra)"/>`
    + `<path d="${inset(14, 26)}" fill="none" stroke="${C.tinta}" stroke-width="10"/><path d="${inset(32, 14)}" fill="none" stroke="${C.tinta}" stroke-width="3"/>`
    + `<path d="${rr(60, 60, 880, 1280, 10)}" fill="none" stroke="${C.tinta}" stroke-width="4"/>`
    + esquinasCarta(60, 96, 22, C.shu, C.tinta)
    // Medallón para el sol partido
    + `<circle cx="500" cy="600" r="300" fill="${C.papelClaro}" stroke="${C.tinta}" stroke-width="8"/>`
    + `<circle cx="500" cy="600" r="284" fill="none" stroke="${C.shu}" stroke-width="4"/><circle cx="500" cy="600" r="272" fill="none" stroke="${C.tinta}" stroke-width="1.5"/>`
    // Cartela de 天下一 y placa del logo de Koryu Budo
    + `<path d="${rr(320, 948, 360, 108, 12)}" fill="${C.papelClaro}" stroke="${C.tinta}" stroke-width="5"/><path d="${rr(329, 957, 342, 90, 7)}" fill="none" stroke="${C.shu}" stroke-width="2.5"/>`
    + `<circle cx="500" cy="1192" r="96" fill="${C.papelClaro}" stroke="${C.tinta}" stroke-width="5"/><circle cx="500" cy="1192" r="86" fill="none" stroke="${C.shu}" stroke-width="2"/>`;
  return svg(defs, s);
}

function reversoLaca() {
  const defs = fibra + lacaDefs + metalDefs('oro') + kozane('kozane', C.shu, C.shuOscuro) + `<clipPath id="campo"><path d="${inset(44, 12)}"/></clipPath>`;
  let s = `<path d="${CARTA}" fill="url(#laca)"/>`
    + `<g clip-path="url(#campo)"><path d="${inset(44, 12)}" fill="url(#kozane)"/></g>`
    + `<path d="${inset(12, 28)}" fill="none" stroke="url(#metal)" stroke-width="9"/><path d="${inset(38, 12)}" fill="none" stroke="url(#metal)" stroke-width="3.5"/>`
    + esquinasCarta(40, 110, 26, 'url(#metal)', METALES.oro.oscuro)
    + `<circle cx="500" cy="600" r="306" fill="#000" fill-opacity="0.45"/>`
    + `<circle cx="500" cy="600" r="300" fill="url(#metal)"/><circle cx="500" cy="600" r="291" fill="none" stroke="${METALES.oro.oscuro}" stroke-width="2"/>`
    + `<circle cx="500" cy="600" r="282" fill="#0F0C0B"/><circle cx="500" cy="600" r="272" fill="${C.papelClaro}"/><circle cx="500" cy="600" r="272" fill="#000" filter="url(#fibra)"/>`
    + `<path d="${rr(316, 944, 368, 116, 12)}" fill="url(#metal)"/><path d="${rr(326, 954, 348, 96, 8)}" fill="#0F0C0B"/>`
    + `<circle cx="500" cy="1192" r="100" fill="url(#metal)"/><circle cx="500" cy="1192" r="89" fill="${C.papelClaro}"/><circle cx="500" cy="1192" r="89" fill="#000" filter="url(#fibra)"/>`;
  return svg(defs, s);
}

const guardar = (nombre, contenido) => writeFileSync(path.join(SALIDA, nombre), contenido);
for (const t of ['S', 'A', 'B', 'C', 'D']) guardar(`jugador-${t}.svg`, washi(t));
for (const t of ['SP', 'S', 'A', 'B']) guardar(`boost-${t}.svg`, laca(t, BOOST[t]));
guardar('reverso.svg', reversoWashi());
for (const t of ['SP', 'S', 'A', 'B', 'C']) guardar(`guardadas/laca-${t}.svg`, laca(t, LACA[t]));
guardar('guardadas/laca-reverso.svg', reversoLaca());
guardar('guardadas/washi-SP.svg', washi('SP'));
console.log('Marcos listos en', SALIDA);
