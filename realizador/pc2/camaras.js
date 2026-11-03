// Cámaras de la escena de draft (PC 2). El overlay de TENKA ICHI (/overlay/) pinta su fondo con 0 a 4 huecos
// recortados durante el draft, según lo que tenga puesto su panel en «Cámaras». Debajo, en la escena «Draft» de
// OBS, van las fuentes «Camara draft 1…4»: aquí se encajan en esos huecos, se encienden las que tocan y se les pone
// el dispositivo que se eligió al configurar (página del PC 2, pestaña Cámaras).
//
// Se aplica solo al conectar OBS, al cambiar la cantidad en el panel de TENKA ICHI y al cambiar los dispositivos.

export const FUENTES = [1, 2, 3, 4].map(n => `Camara draft ${n}`);

// Los mismos huecos que el overlay (public/comun.js → disposicionCamaras de tenka-ichi), en un lienzo de 1920×1080.
// Si allí se mueven, hay que moverlos aquí también
export function disposicionCamaras(n) {
  const X = 620, W = 680;
  switch (n) {
    case 1: return [{ x: X, y: 320, w: 680, h: 383 }];
    case 2: return [{ x: X + 100, y: 224, w: 480, h: 270 }, { x: X + 100, y: 552, w: 480, h: 270 }];
    case 3: return [{ x: X + 60, y: 226, w: 560, h: 315 }, { x: X, y: 607, w: 334, h: 188 }, { x: X + W - 334, y: 607, w: 334, h: 188 }];
    case 4: return [0, 1, 2, 3].map(i => ({ x: i % 2 ? X + W - 334 : X, y: i < 2 ? 290 : 544, w: 334, h: 188 }));
    default: return [];
  }
}

// Qué dispositivo va en cada hueco: el elegido o, si no se eligió ninguno, las cámaras de OBS por orden
export function repartir(elegidos = [], disponibles = []) {
  const libres = disponibles.map(d => d.id).filter(id => !elegidos.includes(id));
  return FUENTES.map((_, i) => elegidos[i] || libres.shift() || '');
}

export class CamarasDraft {
  constructor({ obs, escena = 'Draft', registrar = () => {}, elegidos = [] }) {
    this.obs = obs;
    this.escena = escena;
    this.registrar = registrar;
    this.elegidos = [...elegidos];
    this.cantidad = 0;
    this.nombres = [];      // qué es cada cámara (lo que pone el panel de TENKA ICHI)
    this.disponibles = [];  // [{ id, nombre }] cámaras que ve OBS
    this.aplicado = null;
    this.error = null;
    this.ocupado = false;
  }

  // Desde el estado del panel de TENKA ICHI
  desdeTenka(e) {
    const c = e?.camaras;
    if (!c) return;
    const n = Number(c.cantidad);
    if (Number.isInteger(n) && n >= 0 && n <= 4) this.cantidad = n;
    this.nombres = (c.lista || []).map(x => x?.nombre || (x?.tipo === 'caster' ? 'Caster' : x?.tipo || ''));
  }

  elegir(lista) {
    this.elegidos = FUENTES.map((_, i) => String(lista?.[i] || ''));
    this.aplicado = null;
    this.reintentoEn = 0;
  }

  async leerDisponibles() {
    if (!this.obs?.listo) return this.disponibles;
    try {
      const r = await this.obs.pedir('GetInputPropertiesListPropertyItems', { inputName: FUENTES[0], propertyName: 'video_device_id' });
      this.disponibles = (r.propertyItems || []).filter(x => x.itemEnabled !== false && x.itemValue)
        .map(x => ({ id: String(x.itemValue), nombre: String(x.itemName || x.itemValue) }));
    } catch (e) { this.error = `No encuentro las cámaras de la escena ${this.escena} en OBS (${e.message}). Vuelve a configurar OBS.`; }
    return this.disponibles;
  }

  publico() {
    return {
      cantidad: this.cantidad, nombres: this.nombres.slice(0, 4), disponibles: this.disponibles,
      elegidos: this.elegidos, asignadas: repartir(this.elegidos, this.disponibles), error: this.error,
    };
  }

  // Cada vuelta del relé: solo hace algo si ha cambiado lo que hay que poner
  async paso() {
    if (!this.obs?.listo) { this.aplicado = null; return; }
    if (this.ocupado || Date.now() < (this.reintentoEn || 0)) return;
    this.ocupado = true;
    try {
      if (!this.aplicado || !this.disponibles.length) await this.leerDisponibles();
      const asignadas = repartir(this.elegidos, this.disponibles);
      const firma = JSON.stringify([this.cantidad, asignadas]);
      if (firma === this.aplicado) return;
      const huecos = disposicionCamaras(this.cantidad);
      for (let i = 0; i < FUENTES.length; i++) {
        const fuente = FUENTES[i];
        const h = huecos[i];
        const { sceneItemId } = await this.obs.pedir('GetSceneItemId', { sceneName: this.escena, sourceName: fuente });
        if (h) {
          if (asignadas[i]) await this.obs.pedir('SetInputSettings', { inputName: fuente, inputSettings: { video_device_id: asignadas[i] } });
          await this.obs.pedir('SetSceneItemTransform', {
            sceneName: this.escena, sceneItemId,
            sceneItemTransform: { positionX: h.x, positionY: h.y, alignment: 5, boundsType: 'OBS_BOUNDS_SCALE_OUTER', boundsAlignment: 0, boundsWidth: h.w, boundsHeight: h.h },
          });
        }
        await this.obs.pedir('SetSceneItemEnabled', { sceneName: this.escena, sceneItemId, sceneItemEnabled: Boolean(h && asignadas[i]) });
      }
      this.aplicado = firma;
      this.error = null;
      this.registrar(`[cámaras] escena ${this.escena}: ${this.cantidad} cámara${this.cantidad === 1 ? '' : 's'}${this.cantidad ? ` (${asignadas.slice(0, this.cantidad).map(id => this.disponibles.find(d => d.id === id)?.nombre || 'sin cámara').join(', ')})` : ''}`);
    } catch (e) {
      this.error = `Cámaras del draft: ${e.message}`;
      this.aplicado = null;
      this.reintentoEn = Date.now() + 10000;  // sin insistir cuatro veces por segundo
    } finally { this.ocupado = false; }
  }
}
