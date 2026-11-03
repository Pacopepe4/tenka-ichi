// Lo que hace falta para empezar el directo, en palabras sencillas y con qué hacer si falta.
// Lo usan los dos PCs (cada uno con lo que sabe) y el relé del PC 2 para decidir si arranca.
//
// datos: { papel: 'pc1'|'pc2', pc1: bool (el agente del PC 1 está conectado), pc2: bool (el relé del PC 2),
//          partidaPc1: bool, partidaPc2: bool, obs: bool|null, bufer: bool|null }
export function condiciones(d) {
  const enPc1 = d.papel === 'pc1';
  const lista = [
    {
      id: 'pcs', texto: 'Los dos PCs conectados', ok: Boolean(d.pc1 && d.pc2), bloquea: true,
      ayuda: enPc1 ? 'Abre «Realizador PC2» en el PC de emisión, con la misma contraseña.' : 'Abre «Realizador PC1» en el otro PC, con la misma contraseña.',
    },
    {
      id: 'obs', texto: 'OBS abierto (PC 2)', ok: d.obs === true, bloquea: true,
      ayuda: d.pc2 === false ? 'Primero tiene que estar conectado el PC 2.' : 'Abre OBS en el PC 2 (se abre solo con «Realizador PC2»). Si ya está abierto, vuelve a pasar «INSTALAR-PC2.bat» con OBS cerrado.',
    },
    {
      id: 'partidaPc1', texto: 'Partida en el LoL del PC 1', ok: Boolean(d.partidaPc1), bloquea: true,
      ayuda: 'En el PC 1, espectea la partida en LoL (o espera a que cargue).',
    },
    {
      id: 'partidaPc2', texto: 'Partida en el LoL del PC 2', ok: Boolean(d.partidaPc2), bloquea: true,
      ayuda: 'En el PC 2, espectea la misma partida en LoL.',
    },
    {
      id: 'bufer', texto: 'Búfer de repeticiones', ok: d.bufer === true, bloquea: false,
      ayuda: 'Sin él no hay repeticiones. Se pone en marcha solo al empezar el directo.',
    },
  ];
  return { lista, listo: lista.every(c => c.ok || !c.bloquea) };
}
