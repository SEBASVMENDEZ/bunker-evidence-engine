// Contenido base extraído del Proyecto Maestro (CD1–CD11) y de la especificación del Búnker.
import type { Area, ClipKind, LifeArea, Moment, Settings, Compass } from './types';

// Sin horas fijas: Búnker usa el ORDEN de tu rutina, la duración típica y tus turnos.
export const DEFAULT_AREAS: Area[] = [
  {
    id: 'oracion', name: 'Oración', icon: 'oracion', color: '#F5B94A', life: 'identidad', kind: 'proceso',
    moment: 'antes', minutes: 10, windows: [], targetPerWeek: 7,
    aliases: ['oracion', 'orar', 'prayer', 'rezo'], order: 0, active: true,
  },
  {
    id: 'meditacion', name: 'Meditación', icon: 'meditacion', color: '#A78BFA', life: 'crecimiento', kind: 'proceso',
    moment: 'antes', minutes: 15, windows: [], targetPerWeek: 7,
    aliases: ['meditacion', 'meditar', 'medit'], order: 1, active: true,
  },
  {
    id: 'estiramiento', name: 'Estiramiento', icon: 'estiramiento', color: '#2DD4BF', life: 'salud', kind: 'proceso',
    moment: 'antes', minutes: 10, windows: [], targetPerWeek: 7,
    aliases: ['estiramiento', 'stretch', 'yoga', 'movilidad'], order: 2, active: true,
  },
  {
    id: 'lectura', name: 'Lectura', icon: 'lectura', color: '#38BDF8', life: 'crecimiento', kind: 'proceso',
    moment: 'antes', minutes: 25, windows: [], targetPerWeek: 7,
    aliases: ['lectura', 'leer', 'libro', 'read'], order: 3, active: true,
  },
  {
    id: 'ejercicio', name: 'Ejercicio', icon: 'ejercicio', color: '#FB7185', life: 'salud', kind: 'proceso',
    moment: 'antes', minutes: 50, windows: [], targetPerWeek: 6,
    aliases: ['ejercicio', 'gym', 'entreno', 'entrenamiento', 'workout', 'pesas', 'correr'], order: 4, active: true,
  },
  {
    id: 'trading', name: 'Trading', icon: 'trading', color: '#34D399', life: 'finanzas', kind: 'explicacion',
    moment: 'libre', minutes: 12, windows: [], targetPerWeek: 5,
    aliases: ['trading', 'trade', 'mercado', 'bolsa', 'forex', 'chart'], order: 5, active: true,
  },
  {
    id: 'proyecto', name: 'Proyecto', icon: 'proyecto', color: '#6D8BFF', life: 'trabajo', kind: 'explicacion',
    moment: 'libre', minutes: 20, windows: [], targetPerWeek: 5,
    aliases: ['proyecto', 'project', 'codigo', 'app', 'build'], order: 6, active: true,
  },
  {
    id: 'reflexion', name: 'Reflexión', icon: 'reflexion', color: '#FB923C', life: 'comunicacion', kind: 'reflexion',
    moment: 'despues', minutes: 3, windows: [], targetPerWeek: 3,
    aliases: ['reflexion', 'mensaje', 'cierre', 'diario', 'vlog'], order: 7, active: true,
  },
];

export const MOMENTS: { id: Moment; name: string; hint: string }[] = [
  { id: 'antes', name: 'Antes del turno', hint: 'Lo haces antes de entrar a trabajar (o en la mañana si descansas).' },
  { id: 'despues', name: 'Después del turno', hint: 'Lo haces al salir del trabajo o al cerrar el día.' },
  { id: 'libre', name: 'Cuando se pueda', hint: 'Antes o después, según el día.' },
];

export const AREA_COLORS = [
  '#F5B94A', '#A78BFA', '#2DD4BF', '#38BDF8', '#FB7185', '#34D399', '#6D8BFF', '#FB923C',
  '#F472B6', '#FACC15', '#4ADE80', '#22D3EE', '#C084FC', '#F87171', '#94A3B8', '#E2E8F0',
];

export const LIFE_AREAS: { id: LifeArea; name: string; hint: string }[] = [
  { id: 'finanzas', name: 'Finanzas', hint: 'Reducir deuda, estabilidad, generar y administrar dinero.' },
  { id: 'trabajo', name: 'Trabajo / proyecto', hint: 'Una vía cada vez más alineada con tu dirección.' },
  { id: 'crecimiento', name: 'Crecimiento', hint: 'Convertir aprendizaje en cambios observables.' },
  { id: 'comunicacion', name: 'Comunicación', hint: 'Oratoria, cámara, expresión, ayudar a otros.' },
  { id: 'salud', name: 'Salud', hint: 'Cuerpo atlético y hábitos sostenibles.' },
  { id: 'relaciones', name: 'Relaciones', hint: 'Tiempo, presencia y vínculos importantes.' },
  { id: 'identidad', name: 'Identidad', hint: 'Alguien que aprende, ejecuta, mide, adapta y continúa.' },
];

export const KIND_INFO: Record<ClipKind, { name: string; treatment: string; desc: string }> = {
  proceso: { name: 'Proceso largo', treatment: 'Acelerar', desc: 'Se condensa en un time-lapse con varios momentos.' },
  explicacion: { name: 'Explicación', treatment: 'Normal', desc: 'Se reproduce a velocidad normal, con audio.' },
  transicion: { name: 'Transición', treatment: 'Reducir', desc: 'Apenas un destello: preparar espacio, moverse.' },
  reflexion: { name: 'Reflexión', treatment: 'Completa', desc: 'Se respeta completa: es tu voz hablándole a tu yo futuro.' },
  repeticion: { name: 'Repetición', treatment: 'Agrupar', desc: 'Clips similares se agrupan en un montaje rápido.' },
};

export const PRINCIPLES = [
  'Aprender significa cambiar.',
  'Los fundamentos van antes que la complejidad.',
  'El deseo general no debe confundirse con un vehículo.',
  'Un vehículo es una hipótesis que se prueba.',
  'Un resultado negativo es información, no necesariamente una sentencia.',
  'No saber cómo no significa que sea imposible.',
  'Más acción no siempre significa más avance.',
  'No tomar decisiones importantes desde la frustración.',
  'Regular emociones no significa ignorar la realidad.',
  'La evidencia debe guiar los cambios.',
  'No abandonar el deseo solo porque un vehículo falla.',
  'Revisar → cambiar → seguir.',
  'Persona completa, no perfecta.',
];

export const CYCLE = [
  { id: 'direccion', name: 'Dirección', desc: 'Qué vida quieres construir y qué sentimientos importan.' },
  { id: 'vehiculo', name: 'Vehículo', desc: 'Una vía concreta: un experimento, no tu identidad.' },
  { id: 'experimento', name: 'Experimento', desc: 'Ejecutar los fundamentos con la menor fricción.' },
  { id: 'evidencia', name: 'Evidencia', desc: 'Registrar lo que ocurrió realmente.' },
  { id: 'revision', name: 'Revisión', desc: 'Qué funcionó, qué no, qué supuse mal.' },
  { id: 'cambio', name: 'Cambio', desc: 'Modificar una variable, hábito o —si la evidencia lo justifica— el vehículo.' },
  { id: 'continuar', name: 'Nuevo experimento', desc: 'Volver a ejecutar sin tomar un resultado aislado como sentencia.' },
];

export const WEEKLY_QUESTIONS = [
  { id: 'avance', q: '¿Qué avance real ocurrió esta semana?' },
  { id: 'capacidad', q: '¿Qué capacidad desarrollé aunque todavía no haya resultado material?' },
  { id: 'comportamiento', q: '¿Qué comportamiento repetí?' },
  { id: 'nofunciono', q: '¿Qué no funcionó?' },
  { id: 'suficiente', q: '¿Tengo suficiente evidencia para cambiar algo, o solo tuve un mal resultado aislado?' },
  { id: 'vehiculo', q: '¿Estoy confundiendo el vehículo con el deseo?' },
  { id: 'forzar', q: '¿Estoy actuando para avanzar o intentando forzar un resultado?' },
  { id: 'variable', q: '¿Qué variable cambiaré durante el próximo experimento?' },
];

export const DAILY_QUESTIONS = [
  { id: 'priority', q: '¿Cuál es mi prioridad de hoy?' },
  { id: 'action', q: '¿Qué acción concreta hice?' },
  { id: 'evidence', q: '¿Qué evidencia obtuve?' },
  { id: 'learned', q: '¿Qué aprendí?' },
  { id: 'tomorrow', q: '¿Qué voy a revisar o cambiar mañana?' },
] as const;

export const DECISIONS = [
  { id: 'mantener', name: 'Mantener', desc: 'La evidencia dice que vas bien. Sigue igual.' },
  { id: 'corregir', name: 'Corregir', desc: 'Ajustar la ejecución, no la estrategia.' },
  { id: 'cambiar-variable', name: 'Cambiar una variable', desc: 'Un solo cambio, medible, durante una semana.' },
  { id: 'evaluar-vehiculo', name: 'Evaluar el vehículo', desc: 'Solo si la evidencia acumulada lo justifica.' },
] as const;

export const EMOTIONS = [
  'Ansiedad', 'Frustración', 'Prisa', 'Miedo', 'Cansancio', 'Enojo', 'Duda', 'Tristeza', 'Saturación', 'Impaciencia',
];

export const DEFAULT_SETTINGS: Settings = {
  version: 2,
  userName: '',
  scheduleName: '',
  onboarded: false,
  sound: true,
  volume: 0.7,
  music: true,
  haptics: true,
  filmMinutes: 8,
  filmGrouping: 'area',
  importWeeks: 6,
  rhythmIntroSeen: true,
  camera: { facing: 'user', mode: 'auto', quality: 'hd', mic: true },
};

export const DEFAULT_COMPASS: Compass = {
  direction: '',
  feeling: '',
  why: '',
  vehicles: [],
};
