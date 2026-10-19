// Vehículos de ingreso (Paquete I-5): plantillas listas para la Brújula, apagadas por defecto.
// Cada una es una hipótesis con su evidencia, su fecha de revisión y su regla de corte: un vehículo
// es un experimento, no tu identidad. Sin cifras ni datos personales.
import type { Vehicle } from './types';

export type Plantilla = Pick<Vehicle, 'name' | 'hypothesis' | 'evidenceNeeded' | 'reviewOn' | 'corte'> & { key: string };

const CORTE = 'Si a fin de marzo no hay ingresos, se cierra.';
const REVISION = '2027-03-28'; // el último domingo de marzo
// ("Entrenar IA desde casa" se descartó el 18 oct 2026: generaba fricción; el foco es inglés y trading.)

export const PLANTILLAS: Plantilla[] = [
  {
    key: 'fotos-catalogos',
    name: 'Fotos y catálogos para tiendas',
    hypothesis: 'Si ofrezco fotos de producto y catálogos sencillos a tiendas pequeñas, con el celular y lo que sé de ventas, algunas pagarán por el servicio.',
    evidenceNeeded: 'Un catálogo de muestra hecho y al menos una tienda que pague por uno.',
    reviewOn: REVISION,
    corte: CORTE,
  },
  {
    key: 'mostrador',
    name: 'Mostrador',
    hypothesis: 'Si ayudo a negocios de barrio (que no compitan con mi empleador) a vender mejor en el mostrador, algunos pagarán por ese acompañamiento.',
    evidenceNeeded: 'Al menos un negocio que pruebe el servicio y pague por él.',
    reviewOn: REVISION,
    corte: CORTE,
  },
];
