/** Tratamiento que recibe un clip dentro de la película semanal. */
export type ClipKind = 'proceso' | 'explicacion' | 'transicion' | 'reflexion' | 'repeticion';

export type ClipSource = 'camara' | 'pantalla' | 'carpeta' | 'importado' | 'demo';

export type AreaBy = 'rutina' | 'horario' | 'aprendido' | 'nombre' | 'manual' | 'camara' | 'ninguno';

/** Cuándo ocurre un área respecto al turno de trabajo. */
export type Moment = 'antes' | 'despues' | 'libre';

/** Turno de un día. Horas en "HH:MM". */
export interface Shift {
  start: string;
  end: string;
  off: boolean;
  lunch?: string;
  src: 'hoja' | 'manual' | 'demo';
}

export type Shifts = Record<string, Shift>; // clave: YYYY-MM-DD

export type LifeArea =
  | 'finanzas'
  | 'trabajo'
  | 'crecimiento'
  | 'comunicacion'
  | 'salud'
  | 'relaciones'
  | 'identidad';

/** Hora fija opcional (avanzado). days: 1 = lunes … 7 = domingo. */
export interface ScheduleWindow {
  start: string; // "05:00"
  end: string; // "05:20"
  days: number[];
}

export interface Area {
  id: string;
  name: string;
  icon: string;
  color: string;
  life: LifeArea;
  kind: ClipKind;
  moment: Moment;
  minutes: number; // duración típica de una sesión REAL (se afina con lo aprendido)
  lapseSpeed?: number; // velocidad habitual si la grabas en time-lapse (vacío = automático ×5/×10)
  windows: ScheduleWindow[];
  targetPerWeek: number;
  aliases: string[];
  order: number;
  active: boolean;
}

export interface Clip {
  id: string;
  source: ClipSource;
  blobKey?: string; // grabaciones propias / copias guardadas en IndexedDB
  handleKey?: string; // referencia a un archivo original (no se copia)
  folderId?: string;
  relPath?: string;
  fingerprint: string;
  name: string;
  mime: string;
  size: number;
  takenAt: number;
  dateBy: 'nombre' | 'metadatos' | 'archivo' | 'grabacion';
  duration: number; // duración del archivo
  lapse?: boolean; // time-lapse / acelerado (sin audio o con metadatos de captura)
  speed?: number; // factor de aceleración conocido (metadatos o elegido por ti)
  speedBy?: 'auto' | 'manual';
  realDuration?: number; // duración real estimada (archivo × velocidad)
  width: number;
  height: number;
  thumb?: string;
  areaId: string | null;
  confidence: number;
  areaBy: AreaBy;
  alts?: string[]; // áreas alternativas sugeridas cuando hay duda
  kind: ClipKind;
  kindBy: 'auto' | 'manual';
  starred: boolean;
  markers: number[];
  note?: string;
  excluded: boolean;
  week: string;
  addedAt: number;
  status: 'pendiente' | 'listo' | 'error' | 'sin-acceso';
  error?: string;
  recovered?: boolean;
  demoSeed?: number;
}

export type Decision = 'mantener' | 'corregir' | 'cambiar-variable' | 'evaluar-vehiculo';

export interface WeekReview {
  week: string;
  answers: Record<string, string>;
  decision?: Decision;
  priority?: string;
  experiment?: string;
  experimentResult?: 'si' | 'parcial' | 'no';
  energy?: number;
  sealedAt?: number;
  watchedAt?: number;
}

export interface DailyLog {
  date: string; // YYYY-MM-DD
  priority?: string;
  action?: string;
  evidence?: string;
  learned?: string;
  tomorrow?: string;
  moodBefore?: number;
  moodAfter?: number;
}

export interface Vehicle {
  id: string;
  name: string;
  hypothesis: string;
  evidenceNeeded: string;
  reviewOn?: string;
  status: 'probando' | 'mantener' | 'pausado' | 'descartado';
  createdAt: number;
}

export interface Compass {
  direction: string;
  feeling: string;
  why: string;
  vehicles: Vehicle[];
}

export interface CalmLog {
  id: string;
  at: number;
  emotion: string[];
  thought: string;
  decision?: Decision;
  next?: string;
}

export interface LinkedFolder {
  id: string;
  name: string;
  handle: FileSystemDirectoryHandle;
  addedAt: number;
  lastScan?: number;
  found?: number;
}

export interface LearnSample {
  minute: number; // minuto del día
  weekday: number; // 1..7
  duration: number;
  areaId: string;
  at: number;
}

export interface Settings {
  version: number;
  userName: string;
  scheduleName: string; // cómo apareces en la hoja de horarios
  onboarded: boolean;
  sound: boolean;
  volume: number;
  music: boolean;
  haptics: boolean;
  filmMinutes: number;
  filmGrouping: 'area' | 'dia';
  importWeeks: number;
  rhythmIntroSeen: boolean;
  camera: {
    facing: 'user' | 'environment';
    mode: 'auto' | 'normal' | 'proceso' | 'reflexion';
    quality: 'eco' | 'hd' | 'fullhd';
    mic: boolean;
  };
}

export interface SheetLink {
  name: string;
  handle?: FileSystemFileHandle;
  lastRead?: number;
  weeks?: number;
  people?: string[];
  error?: string;
}

export type Statement = {
  type: 'metrica' | 'observacion' | 'inferencia' | 'pregunta' | 'sin-datos';
  text: string;
  areaId?: string;
};
