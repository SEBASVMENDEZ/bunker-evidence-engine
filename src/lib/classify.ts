// Inteligencia de captura por RITMO, no por reloj.
// Cada día se alinea la secuencia de videos con el orden de tu rutina (programación dinámica),
// usando la duración típica de cada área, tu turno (antes / durante / después), la cámara (frontal =
// hablarle a la cámara), la firma visual del lugar y las palabras del nombre del archivo. Las áreas
// que no son de la rutina de la mañana (reflexión, trading, proyecto) son libres: caen en cualquier
// punto del día sin romper el orden. Los videos que tú confirmas (o grabas con el área elegida) son
// anclas fijas que enseñan duraciones, cámara y lugar. Solo se pregunta cuando hay duda real.
import type { Area, AreaBy, Clip, ClipKind, Moment, Shift, Shifts } from './types';
import { dayKey, isoWeekday, minuteOfDay, parseHM } from './time';
import { sigSimilarity } from './media';

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
  shortW: 0.15, // peso de la duración en clips cortos (< 2 min reales)
  blockGap: 12, // minutos: tomas más seguidas que esto se consideran el mismo bloque
  morningClose: 0, // costo de un área "después" antes del mediodía cuando no hay turno (0: la reflexión puede ser a cualquier hora)
  camW: 1.8, // peso de la cámara usada (frontal = hablarle a la cámara)
  visW: 4, // peso de la firma visual del lugar (aprendida de tus confirmaciones)
  visBase: 0.45, // similitud supuesta con un área que aún no tiene ejemplos
  free: 0.15, // entrar a un área libre (reflexión, trading, proyecto) en cualquier momento
  under: 0.1, // un clip más corto que lo típico es un fragmento de la sesión: pesa poco en contra
  startSkip: 0.05, // el primer video del día puede caer en cualquier punto de la rutina
};

// ---------------- señales aprendidas: cámara y lugar ----------------
export type Cam = 'frontal' | 'trasera';
export const camOf = (rot?: number | null): Cam | null => (rot === 270 ? 'frontal' : rot === 90 ? 'trasera' : null);

export interface Signals {
  cam: Record<string, Record<Cam, number>>; // P(cámara | área)
  sigs: Record<string, number[][]>; // firmas de lugares confirmados por área
}

export function learnSignals(areas: Area[], clips: Clip[]): Signals {
  const cam: Signals['cam'] = {};
  const sigs: Signals['sigs'] = {};
  for (const a of areas) {
    // punto de partida: reflexión = cámara frontal; actividades = trasera (teléfono apoyado)
    const prior = a.kind === 'reflexion' ? { frontal: 3, trasera: 0.6 } : { frontal: 0.6, trasera: 3 };
    const anchored = clips.filter((c) => c.areaId === a.id && isAnchor(c) && !c.excluded && c.source !== 'demo');
    for (const c of anchored) {
      const k = camOf(c.rotation);
      if (k) prior[k] += 1;
    }
    const tot = prior.frontal + prior.trasera;
    cam[a.id] = { frontal: prior.frontal / tot, trasera: prior.trasera / tot };
    sigs[a.id] = anchored.filter((c) => c.sig?.length).slice(-40).map((c) => c.sig!);
  }
  return { cam, sigs };
}

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

function durCost(seconds: number, m: DurModel, asym = true) {
  const d = (Math.log(seconds + 10) - m.mu) / m.sigma;
  const z = Math.min(4, Math.abs(d));
  // grabas fragmentos: más corto que lo típico casi no descarta un área; mucho más largo, sí
  return 0.5 * z * z * (asym && d < 0 ? RHYTHM.under : 1);
}

/** Velocidad que mejor explica el clip dentro de un área. */
export function bestSpeed(c: Clip, a: Area, m?: DurModel, learned?: number): number {
  const cands = speedCandidates(c, a, learned);
  if (cands.length === 1 || !m) return cands[0];
  return cands.reduce((best, f) => (durCost(c.duration * f, m, false) < durCost(c.duration * best, m, false) ? f : best), cands[0]);
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
  signals?: Signals,
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

  // similitud de lugar: promedio de las 2 firmas confirmadas más parecidas de cada área
  const visual = clips.map((c) => {
    if (!signals || !c.sig) return null;
    const byArea: Record<string, number> = {};
    let max = -1;
    for (const a of A) {
      const sims = (signals.sigs[a.id] ?? []).map((g) => sigSimilarity(c.sig, g)).filter((x): x is number => x !== null).sort((x, y) => y - x);
      if (!sims.length) continue;
      const v = sims.slice(0, 2).reduce((s, x) => s + x, 0) / Math.min(2, sims.length);
      byArea[a.id] = v;
      if (v > max) max = v;
    }
    return max > -1 ? { byArea, max } : null;
  });

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
        // un clip corto es un momento, no la sesión completa: su duración dice poco
        const real = c.duration * (c.speed || 1);
        const durScale = real < 120 ? RHYTHM.shortW : real < 300 ? (RHYTHM.shortW + 1) / 2 : 1;
        e += RHYTHM.durW * durScale * (unsureSpeed[i] ? 0.5 : 1) * dc;
      }
      e += MOMENT_COST[a.moment][phases[i]];
      if (signals) {
        const cm = camOf(c.rotation);
        if (cm) e += RHYTHM.camW * -Math.log(signals.cam[a.id]?.[cm] ?? 0.5);
        const vis = visual[i];
        if (vis) e += RHYTHM.visW * Math.max(0, vis.max - (vis.byArea[a.id] ?? RHYTHM.visBase));
      }
      // sin turno conocido: un cierre del día ("después") es poco probable en la mañana
      if (phases[i] === 'libre' && a.moment === 'despues' && minuteOfDay(c.takenAt) < 12 * 60) e += RHYTHM.morningClose;
      if (a.windows.length) {
        const min = minuteOfDay(c.takenAt);
        const inside = a.windows.some((w) => w.days.includes(wd) && min >= parseHM(w.start) - 10 && min <= parseHM(w.end) + 10);
        e += inside ? -1.5 : 0.8;
      }
      return e;
    });
  });

  // Rutina ordenada = áreas "antes" (la secuencia de la mañana). Las demás (cuando se pueda / después)
  // son libres: pueden aparecer en cualquier punto del día sin romper el orden.
  const ordered = A.map((a) => a.moment === 'antes');
  const skipCost = (from: number, to: number, i: number) => {
    const w = from < 0 ? RHYTHM.startSkip : RHYTHM.skip;
    let s = 0;
    for (let k = from + 1; k < to; k++) if (ordered[k] && compatible(A[k].moment, phases[i])) s += w;
    return s;
  };
  const gapOf = (i: number) => (clips[i].takenAt - (clips[i - 1].takenAt + (clips[i - 1].duration || 0) * 1000)) / 60000;
  // transición hacia un área ordenada k desde la última ordenada p (-1 = aún ninguna hoy)
  const transOrdered = (p: number, k: number, i: number) => {
    if (p < 0) return skipCost(-1, k, i);
    const gapMin = gapOf(i);
    let t: number;
    if (k > p) t = skipCost(p, k, i);
    else if (k === p) t = gapMin < RHYTHM.blockGap ? RHYTHM.repeatClose : RHYTHM.repeat;
    else t = (RHYTHM.back + 0.2 * (p - k)) * (phases[i] !== phases[i - 1] && phases[i] !== 'libre' ? RHYTHM.phaseRelax : 1);
    if (gapMin > 180) t *= k < p ? 0.6 : 0.5; // un bloque nuevo del día (p. ej. después del trabajo)
    return t;
  };

  // estados: (área, última área ordenada)
  const states: { k: number; o: number }[] = [];
  for (let k = 0; k < K; k++) {
    if (ordered[k]) states.push({ k, o: k });
    else for (let o = -1; o < K; o++) if (o < 0 || ordered[o]) states.push({ k, o });
  }
  const S = states.length;
  const stepCost = (s1: number, s2: number, i: number) => {
    const a = states[s1];
    const b = states[s2];
    if (ordered[b.k]) return transOrdered(a.o, b.k, i);
    if (b.o !== a.o) return INF;
    return a.k === b.k && gapOf(i) < RHYTHM.blockGap ? RHYTHM.repeatClose : RHYTHM.free;
  };
  const startCost = (s: number) => {
    const st = states[s];
    if (ordered[st.k]) return skipCost(-1, st.k, 0);
    return st.o < 0 ? RHYTHM.free : INF;
  };

  // hacia adelante y hacia atrás (min-sum) para obtener marginales y confianza
  const F = Array.from({ length: n }, () => new Array<number>(S).fill(INF));
  const back = Array.from({ length: n }, () => new Array<number>(S).fill(-1));
  for (let s = 0; s < S; s++) F[0][s] = E[0][states[s].k] >= INF ? INF : startCost(s) + E[0][states[s].k];
  for (let i = 1; i < n; i++) {
    for (let s2 = 0; s2 < S; s2++) {
      const em = E[i][states[s2].k];
      if (em >= INF) continue;
      let best = INF;
      let arg = -1;
      for (let s1 = 0; s1 < S; s1++) {
        if (F[i - 1][s1] >= INF) continue;
        const v = F[i - 1][s1] + stepCost(s1, s2, i);
        if (v < best) {
          best = v;
          arg = s1;
        }
      }
      F[i][s2] = best + em;
      back[i][s2] = arg;
    }
  }
  const B = Array.from({ length: n }, () => new Array<number>(S).fill(0));
  for (let i = n - 2; i >= 0; i--) {
    for (let s1 = 0; s1 < S; s1++) {
      let best = INF;
      for (let s2 = 0; s2 < S; s2++) {
        const em = E[i + 1][states[s2].k];
        if (em >= INF) continue;
        const v = stepCost(s1, s2, i + 1) + em + B[i + 1][s2];
        if (v < best) best = v;
      }
      B[i][s1] = best;
    }
  }
  // mejor camino (por estados)
  const pathS = new Array<number>(n).fill(0);
  let last = 0;
  for (let s = 1; s < S; s++) if (F[n - 1][s] < F[n - 1][last]) last = s;
  pathS[n - 1] = last;
  for (let i = n - 1; i > 0; i--) pathS[i - 1] = back[i][pathS[i]] >= 0 ? back[i][pathS[i]] : pathS[i - 1];

  clips.forEach((c, i) => {
    // marginal por área = mejor estado con esa área
    const marg = A.map((_, k) => {
      let m = INF;
      for (let s = 0; s < S; s++) if (states[s].k === k) m = Math.min(m, F[i][s] + B[i][s]);
      return m;
    });
    const min = Math.min(...marg);
    const weights = marg.map((m) => (m >= INF ? 0 : Math.exp(-(m - min) * (unsureSpeed[i] ? 1 : RHYTHM.temp))));
    const total = weights.reduce((s, w) => s + w, 0) || 1;
    const k = states[pathS[i]].k;
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
  const signals = learnSignals(areas, all);
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
    const r = classifyDay(list, areas, shifts[d], models, speeds, signals);
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
