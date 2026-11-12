// El SDK de Anthropic (la IA de los tickets y de los scrims) tarda varios segundos en cargarse: son muchos archivos.
// Se carga la primera vez que se le pregunta algo a la IA, no al arrancar la web, que así no espera por él (ni las
// pruebas, que arrancan la web muchas veces y casi nunca usan la IA)
let sdk = null, cargado = null;
export const cargarSdk = () => (sdk ??= import('@anthropic-ai/sdk').then(m => (cargado = m.default)));
// La clase del SDK si ya se ha cargado (con un cliente de verdad, siempre que haya habido una pregunta); si no, null
export const sdkCargado = () => cargado;

// Un cliente con lo que se usa del de verdad (messages.create), que lo crea al primer uso
export function clientePerezoso(opciones) {
  let real = null;
  return {
    messages: {
      async create(...args) {
        real ??= new (await cargarSdk())(opciones);
        return real.messages.create(...args);
      },
    },
  };
}
