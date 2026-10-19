// Puente a Atlas (Paquete I-1): Atlas es la app de recuperación activa donde repasas los
// conceptos de tus cursos. Búnker no le manda nada (Atlas es para otras personas: ni rutina ni
// datos personales); solo la abre en otra pestaña y, al volver, te pregunta con un toque si
// repasaste. La respuesta queda como un hecho más del día y entra al respaldo.

export const ATLAS_URL = 'https://atlas-recuerda.vercel.app';

/** Los pasos de la ruta que se repasan en Atlas. */
const ATLAS_AREAS = new Set(['estudio', 'lectura']);
export const usaAtlas = (areaId?: string | null) => !!areaId && ATLAS_AREAS.has(areaId);

/** "¿Repasaste tus conceptos?": una respuesta por día (la última manda). */
export interface Repaso {
  day: string;
  at: number;
  areaId: string; // desde qué paso abriste Atlas
  si: boolean;
}

/** Abriste Atlas y aún no respondes: la pregunta te espera al volver (solo ese día). */
export interface AtlasAbierto {
  day: string;
  at: number;
  areaId: string;
}
