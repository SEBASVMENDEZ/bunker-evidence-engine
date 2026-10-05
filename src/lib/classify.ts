// Inteligencia de captura por RITMO, no por reloj.
// Cada día se alinea la secuencia de videos con el orden de tu rutina (programación dinámica),
// usando la duración típica de cada área, tu turno (antes / durante / después) y las palabras del
// nombre del archivo. Los videos que tú confirmas (o grabas con el área elegida) son anclas fijas
// que enseñan las duraciones y ordenan a sus vecinos. Solo se pregunta cuando hay duda real.
import type { Area, AreaBy, Clip, ClipKind, Moment, Shift, Shifts } from './types';
import { dayKey, isoWeekday, minuteOfDay, parseHM } from './time';

export const CONFIRM_THRESHOLD = 0.6;

/** Parámetros del modelo de ritmo (calibrados con días de prueba). */
export const RHYTHM = {
  skip: 0.3, // saltar un área de la rutina
  repeat: 1.0, // otra toma de la misma área
  repeatClose: 0.2, // otra toma casi seguida (el mismo bloque)
  back: 3, // volver a un área anterior
  phaseRelax: 0.3, // al cambiar de momento (mañana → almuerzo → noche) retomar áreas pendientes es normal
  sigma0: 0.45, // dispersión inicial de la duración típica (en log)
  durW: 1.4, // peso de la duración
  temp: 2, // nitidez de la confianza
  outlier: 1.9, // si ninguna área encaja mejor que esto, se pregunta
  sigmaMin: 0.45, // incertidumbre mínima aun con mucho aprendizaje (evita exceso de confianza)
};

const INF = 1e9;

function norm(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export const isAnchor = (c: Clip) => c.areaBy === 'manual' || c.areaBy === 'camara';

/** Duración real (un time-lapse ×10 de 6 min es una sesión de 1 h). */
export const realSecs = (c: Pick<Clip, 'duration' | 'realDuration'>) => c.realDuration ?? c.duration;

/** Velocidades posibles de un clip para un área: la conocida, la habitual del área o ×5/×10 si es time-lapse sin dato. */
export function speedCandidates(c: Clip, a: Area, learned?: number): number[] {
  if (c.speed && c.speed > 0) return [c.speed];
  if (!c.lapse) return [1];
  if (a.lapseSpeed && a.lapseSpeed > 0) return [a.lapseSpeed];
  if (learned) return [learned];
  return [5, 10];
}

/** ¿Se conoce de verdad la duración real? (para aprender solo de datos ciertos) */
const speedKnown = (c: Clip, a?: Area) => !c.lapse || !!c.speed || !!a?.lapseSpeed;

/** Velocidad habitual aprendida: la que más eliges a mano para el time-lapse de un área. */
export function learnedSpeeds(areas: Area[], clips: Clip[]): Record<string, number | undefined> {
  const out: Record<string, number | undefined> = {};
  for (const a of areas) {
    const counts = new Map<number, number>();
    for (const c of clips) {
      if (c.areaId !== a.id || !c.lapse || c.speedBy !== 'manual' || !c.speed || c.speed < 2) continue;
      counts.set(c.speed, (counts.get(c.speed) ?? 0) + 1);
    }
    const best = [...counts.entries()].sort((x, y) => y[1] - x[1])[0];
    out[a.id] = best && best[1] >= 2 ? best[0] : undefined;
  }
  return out;
}

function durCost(seconds: number, m: DurModel) {
  const z = Math.min(4, Math.abs((Math.log(seconds + 10) - m.mu) / m.sigma));
  return 0.5 * z * z;
}

/** Velocidad que mejor explica el clip dentro de un área. */
export function bestSpeed(c: Clip, a: Area, m?: DurModel, learned?: number): number {
  const cands = speedCandidates(c, a, learned);
  if (cands.length === 1 || !m) return cands[0];
  return cands.reduce((best, f) => (durCost(c.duration * f, m) < durCost(c.duration * best, m) ? f : best), cands[0]);
}

// ---------------- duraciones aprendidas ----------------
export interface DurModel {
  mu: number; // media de log(segundos + 10)
  sigma: number;
  n: number; // cuántos videos confirmados la respaldan
  minutes: number; // típica, para mostrar
}

export function durationModels(areas: Area[], clips: Clip[]): Record<string, DurModel> {
  const out: Record<string, DurModel> = {};
  for (const a of areas) {
    const prior = Math.log(Math.max(1, a.minutes) * 60 + 10);
    const xs = clips
      .filter((c) => c.areaId === a.id && isAnchor(c) && !c.excluded && c.duration > 15 && c.source !== 'demo' && speedKnown(c, a))
      .map((c) => Math.log(realSecs(c) + 10));
    const k0 = 3; // peso del valor inicial frente a lo aprendido
    const n = xs.length;
    const mean = n ? xs.reduce((s, x) => s + x, 0) / n : prior;
    const mu = (prior * k0 + mean * n) / (k0 + n);
    const varData = n > 1 ? xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1) : RHYTHM.sigma0 ** 2;
    const sigma = Math.max(RHYTHM.sigmaMin, Math.sqrt((RHYTHM.sigma0 ** 2 * k0 + varData * n) / (k0 + n)));
    out[a.id] = { mu, sigma, n, minutes: Math.round((Math.exp(mu) - 10) / 60) };
  }
  return out;
}

// ---------------- turno ----------------
export type Phase = 'antes' | 'durante' | 'pausa' | 'despues' | 'libre';

/** "2-3" → [14:00, 15:00]; "12-1" → [12:00, 13:00] (horas de la tarde si son menores a 8). */
export function lunchRange(lunch?: string): [number, number] | null {
  const m = lunch?.match(/(\d{1,2})(?::(\d{2}))?\s*[-–a]\s*(\d{1,2})(?::(\d{2}))?/);
  if (!m) return null;
  const fix = (h: number) => (h < 8 ? h + 12 : h);
  const a = fix(+m[1]) * 60 + (+m[2] || 0);
  const b = fix(+m[3]) * 60 + (+m[4] || 0);
  return b > a ? [a, b] : null;
}

export function phaseOf(startMin: number, durMin: number, shift?: Shift): Phase {
  if (!shift || shift.off) return 'libre';
  const s = parseHM(shift.start);
  let e = parseHM(shift.end);
  if (e <= s) e += 1440;
  const l = lunchRange(shift.lunch);
  if (l && startMin >= l[0] - 5 && startMin + durMin <= l[1] + 10) return 'pausa';
  if (startMin + durMin <= s + 20) return 'antes';
  if (startMin >= e - 20) return 'despues';
  return 'durante';
}

const MOMENT_COST: Record<Moment, Record<Phase, number>> = {
  // en el almuerzo es normal retomar lo pendiente de la mañana o adelantar algo
  antes: { antes: 0, durante: 3, pausa: 0.6, despues: 2.2, libre: 0 },
  despues: { antes: 1.8, durante: 3, pausa: 0.7, despues: 0, libre: 0 },
  libre: { antes: 0, durante: 2, pausa: 0.4, despues: 0, libre: 0 },
};

function compatible(m: Moment, p: Phase) {
  return MOMENT_COST[m][p] < 1;
}

// ---------------- alineación del día ----------------
export interface DayResult {
  areaId: string;
  confidence: number;
  by: AreaBy;
  alts: string[];
}

export function classifyDay(
  dayClips: Clip[],
  areas: Area[],
  shift: Shift | undefined,
  models: Record<string, DurModel>,
  speeds: Record<string, number | undefined> = {},
): Map<string, DayResult> {
  const A = areas.filter((a) => a.active).sort((a, b) => a.order - b.order);
  const res = new Map<string, DayResult>();
  const clips = [...dayClips].sort((a, b) => a.takenAt - b.takenAt);
  const n = clips.length;
  if (!n || !A.length) return res;
  const K = A.length;
  const wd = isoWeekday(new Date(clips[0].takenAt));

  const phases = clips.map((c) => phaseOf(minuteOfDay(c.takenAt), (c.duration || 0) / 60, shift));
  // time-lapse de velocidad desconocida: su duración dice poco (12 min pueden ser 1 h o 2 h)
  const unsureSpeed = clips.map((c) => c.lapse && !c.speed && A.some((a) => speedCandidates(c, a, speeds[a.id]).length > 1));
  const names = clips.map((c) => norm(c.name));
  const kw = A.map((a) => [norm(a.name), ...a.aliases.map(norm)].filter((w) => w.length >= 3));

  // costo de emisión: qué tan bien encaja el video i con el área k
  const E: number[][] = clips.map((c, i) => {
    const anchored = isAnchor(c) && A.some((a) => a.id === c.areaId);
    const hits = A.map((_, k) => kw[k].some((w) => names[i].includes(w)));
    const anyHit = hits.some(Boolean);
    return A.map((a, k) => {
      if (anchored) return a.id === c.areaId ? 0 : INF;
      let e = 0;
      if (anyHit) e += hits[k] ? -4 : 3;
      const m = models[a.id];
      if (m && c.duration > 0) {
        const cands = speedCandidates(c, a, speeds[a.id]);
        const dc = Math.min(...cands.map((f) => durCost(c.duration * f, m))) + (cands.length > 1 ? 0.1 : 0);
        e += (c.duration < 15 ? 0.15 : RHYTHM.durW) * (unsureSpeed[i] ? 0.5 : 1) * dc;
      }
      e += MOMENT_COST[a.moment][phases[i]];
      if (a.windows.length) {
        const min = minuteOfDay(c.takenAt);
        const inside = a.windows.some((w) => w.days.includes(wd) && min >= parseHM(w.start) - 10 && min <= parseHM(w.end) + 10);
        e += inside ? -1.5 : 0.8;
      }
      return e;
    });
  });

  // costos de transición: avanzar en el orden es natural; saltar áreas cuesta poco; retroceder cuesta mucho
  const skipCost = (from: number, to: number, i: number) => {
    let s = 0;
    for (let k = from + 1; k < to; k++) if (compatible(A[k].moment, phases[i])) s += RHYTHM.skip;
    return s;
  };
  const trans = (p: number, k: number, i: number) => {
    const gapMin = (clips[i].takenAt - (clips[i - 1].takenAt + (clips[i - 1].duration || 0) * 1000)) / 60000;
    let t: number;
    if (k > p) t = skipCost(p, k, i);
    else if (k === p) t = gapMin < 5 ? RHYTHM.repeatClose : RHYTHM.repeat;
    else t = (RHYTHM.back + 0.2 * (p - k)) * (phases[i] !== phases[i - 1] && phases[i] !== 'libre' ? RHYTHM.phaseRelax : 1);
    if (gapMin > 180) t *= k < p ? 0.6 : 0.5; // un bloque nuevo del día (p. ej. después del trabajo)
    return t;
  };
  const start = (k: number) => skipCost(-1, k, 0);

  // hacia adelante y hacia atrás (min-sum) para obtener marginales y confianza
  const F = Array.from({ length: n }, () => new Array<number>(K).fill(INF));
  const back = Array.from({ length: n }, () => new Array<number>(K).fill(-1));
  for (let k = 0; k < K; k++) F[0][k] = start(k) + E[0][k];
  for (let i = 1; i < n; i++) {
    for (let k = 0; k < K; k++) {
      if (E[i][k] >= INF) continue;
      let best = INF;
      let arg = -1;
      for (let p = 0; p < K; p++) {
        if (F[i - 1][p] >= INF) continue;
        const v = F[i - 1][p] + trans(p, k, i);
        if (v < best) {
          best = v;
          arg = p;
        }
      }
      F[i][k] = best + E[i][k];
      back[i][k] = arg;
    }
  }
  const B = Array.from({ length: n }, () => new Array<number>(K).fill(0));
  for (let i = n - 2; i >= 0; i--) {
    for (let p = 0; p < K; p++) {
      let best = INF;
      for (let k = 0; k < K; k++) {
        if (E[i + 1][k] >= INF) continue;
        const v = trans(p, k, i + 1) + E[i + 1][k] + B[i + 1][k];
        if (v < best) best = v;
      }
      B[i][p] = best;
    }
  }
  // mejor camino
  const path = new Array<number>(n).fill(0);
  let last = 0;
  for (let k = 1; k < K; k++) if (F[n - 1][k] < F[n - 1][last]) last = k;
  path[n - 1] = last;
  for (let i = n - 1; i > 0; i--) path[i - 1] = back[i][path[i]] >= 0 ? back[i][path[i]] : path[i - 1];

  clips.forEach((c, i) => {
    const marg = A.map((_, k) => F[i][k] + B[i][k]);
    const min = Math.min(...marg);
    const weights = marg.map((m) => (m >= INF ? 0 : Math.exp(-(m - min) * (unsureSpeed[i] ? 1 : RHYTHM.temp))));
    const total = weights.reduce((s, w) => s + w, 0) || 1;
    const k = path[i];
    let conf = weights[k] / total;
    // si ni la mejor área encaja (p. ej. un video corto en pleno turno), no se asume: se pregunta
    const bestFit = Math.min(...E[i].filter((e) => e < INF));
    if (bestFit > RHYTHM.outlier) conf = Math.min(conf, 0.45);
    const order = A.map((a, j) => ({ id: a.id, w: weights[j] })).sort((x, y) => y.w - x.w);
    const hit = kw[k].some((w) => names[i].includes(w));
    res.set(c.id, {
      areaId: A[k].id,
      confidence: isAnchor(c) ? 1 : Math.round(conf * 100) / 100,
      by: hit ? 'nombre' : A[k].windows.length ? 'horario' : 'rutina',
      alts: order.slice(0, 5).map((o) => o.id),
    });
  });
  return res;
}

/** Reclasifica los días indicados. Devuelve solo los clips que cambian. */
export function reclassify(all: Clip[], areas: Area[], shifts: Shifts, days: Set<string> | 'all'): Clip[] {
  const models = durationModels(areas, all);
  const speeds = learnedSpeeds(areas, all);
  const byDay = new Map<string, Clip[]>();
  for (const c of all) {
    if (c.source === 'demo' || c.excluded || c.status !== 'listo') continue;
    const d = dayKey(c.takenAt);
    if (days !== 'all' && !days.has(d)) continue;
    const arr = byDay.get(d) ?? [];
    arr.push(c);
    byDay.set(d, arr);
  }
  const changed: Clip[] = [];
  for (const [d, list] of byDay) {
    const r = classifyDay(list, areas, shifts[d], models, speeds);
    for (const c of list) {
      const g = r.get(c.id);
      const areaId = isAnchor(c) ? c.areaId : g?.areaId ?? c.areaId;
      const area = areas.find((a) => a.id === areaId);
      const real = c.lapse && area ? Math.round(c.duration * bestSpeed(c, area, models[area.id], speeds[area.id])) : undefined;
      if (isAnchor(c)) {
        const kind = c.kindBy === 'auto' ? inferKind(real ?? c.duration, area, c.lapse) : c.kind;
        if (real !== c.realDuration || kind !== c.kind) changed.push({ ...c, realDuration: real, kind });
        continue;
      }
      if (!g) continue;
      const kind = c.kindBy === 'auto' ? inferKind(real ?? c.duration, area, c.lapse) : c.kind;
      if (g.areaId !== c.areaId || g.confidence !== c.confidence || g.by !== c.areaBy || kind !== c.kind || real !== c.realDuration || g.alts.join() !== (c.alts ?? []).join()) {
        changed.push({ ...c, areaId: g.areaId, confidence: g.confidence, areaBy: g.by, alts: g.alts, kind, realDuration: real });
      }
    }
  }
  return changed;
}

export function inferKind(duration: number, area: Area | undefined, lapse = false): ClipKind {
  const base = area?.kind ?? 'explicacion';
  if (lapse) return 'proceso'; // ya viene acelerado y sin voz
  if (base === 'reflexion') return duration > 900 ? 'proceso' : 'reflexion';
  if (duration > 0 && duration < 12) return 'transicion';
  if (base === 'proceso') return duration < 50 ? 'explicacion' : 'proceso';
  if (duration > 480) return 'proceso';
  return base;
}

/** Varias tomas cortas de la misma área el mismo día → se agrupan en montaje. */
export function markRepetitions(clips: Clip[]): Clip[] {
  const groups = new Map<string, Clip[]>();
  for (const c of clips) {
    if (!c.areaId || c.excluded || c.kindBy === 'manual') continue;
    const k = `${c.areaId}|${dayKey(c.takenAt)}`;
    const arr = groups.get(k) ?? [];
    arr.push(c);
    groups.set(k, arr);
  }
  const changed: Clip[] = [];
  for (const arr of groups.values()) {
    const shorts = arr.filter((c) => c.duration < 75 && c.kind !== 'reflexion');
    const isRep = shorts.length >= 3;
    for (const c of shorts) {
      if (isRep && c.kind !== 'repeticion') changed.push({ ...c, kind: 'repeticion' });
    }
    if (!isRep) {
      for (const c of arr) if (c.kind === 'repeticion') changed.push({ ...c, kind: 'explicacion' });
    }
  }
  return changed;
}

// ---------------- qué sigue ahora ----------------
export interface NowState {
  next: Area | null;
  phase: Phase;
  shift?: Shift;
  minutesToStart: number | null; // si aún no entras
  minutesToEnd: number | null; // si estás en turno
  pendingBefore: number; // áreas "antes" que faltan
  done: Set<string>;
}

/** La siguiente área de tu rutina según lo que ya registraste hoy y el momento del turno. */
export function nextInRoutine(areas: Area[], todays: Clip[], shift: Shift | undefined, now = new Date()): NowState {
  const A = areas.filter((a) => a.active).sort((a, b) => a.order - b.order);
  const min = now.getHours() * 60 + now.getMinutes();
  const phase = phaseOf(min, 0, shift);
  const done = new Set(todays.filter((c) => !c.excluded && c.areaId).map((c) => c.areaId!));
  const last = [...todays].filter((c) => c.areaId && !c.excluded).sort((a, b) => b.takenAt - a.takenAt)[0];
  const lastIdx = last ? A.findIndex((a) => a.id === last.areaId) : -1;
  const ok = (a: Area) => !done.has(a.id) && (phase === 'durante' || phase === 'pausa' ? a.moment !== 'antes' : compatible(a.moment, phase));
  const next = A.find((a, i) => i > lastIdx && ok(a)) ?? A.find(ok) ?? null;
  let minutesToStart: number | null = null;
  let minutesToEnd: number | null = null;
  if (shift && !shift.off) {
    const s = parseHM(shift.start);
    let e = parseHM(shift.end);
    if (e <= s) e += 1440;
    if (min < s) minutesToStart = s - min;
    else if (min < e) minutesToEnd = e - min;
  }
  const pendingBefore = A.filter((a) => a.moment === 'antes' && !done.has(a.id)).length;
  return { next, phase, shift, minutesToStart, minutesToEnd, pendingBefore, done };
}

// ---------------- tipos de turno (para métricas) ----------------
export type ShiftType = 'descanso' | 'temprano' | 'tarde';

export function shiftType(s?: Shift): ShiftType | null {
  if (!s) return null;
  if (s.off) return 'descanso';
  return parseHM(s.start) < 12 * 60 ? 'temprano' : 'tarde';
}

export const SHIFT_TYPE_LABEL: Record<ShiftType, string> = {
  descanso: 'descanso',
  temprano: 'turno temprano (entrada antes de 12:00)',
  tarde: 'turno tarde (entrada desde 12:00)',
};
