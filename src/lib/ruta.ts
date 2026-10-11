// Tu Ruta: el plan del día que se arma solo con tu turno, tu sueño y tu energía.
//
// Principios (salen de tu caso: en vacaciones todo cabía antes del mediodía; con turnos, no):
//  1. El sueño es el ancla. Primero se calcula a qué hora acostarte para tener mañana; el resto
//     se acomoda alrededor. Dormir tarde es lo que se come la rutina de la mañana.
//  2. Plan realista. Si vienes acostándote tarde, se planea con tu hora REAL y se adelanta
//     15 minutos por noche hasta llegar a la ideal (un cambio brusco no se sostiene).
//  3. Nunca cero. Si el día no da para todo, cada hábito baja a su mínimo antes de quitar alguno.
//  4. Los días libres recuperan: ahí vuelve la rutina completa, como en vacaciones.
import type { Area, DayPrefs, Energy, Shifts } from './types';
import { addDays, dayKey, parseHM, startOfDay } from './time';
import { lunchRange } from './classify';

export type { DayPrefs, Energy };
export type Level = 'minimo' | 'medio' | 'ideal';

export const DEFAULT_DAY: DayPrefs = { sleepHours: 7, sleepMin: 6, commute: 30, prep: 30, windDown: 40, morning: 30, wakeFree: '06:30' };

export interface HabitPlan {
  min: number; // la versión mínima: lo que mantiene viva la cadena
  ideal: number; // la versión completa
  energy: Energy; // cuánta energía pide
  portable?: boolean; // se puede hacer en el almuerzo del trabajo
}

export const HABIT_DEFAULTS: Record<string, HabitPlan> = {
  oracion: { min: 3, ideal: 10, energy: 'baja', portable: true },
  meditacion: { min: 3, ideal: 10, energy: 'baja', portable: true },
  estiramiento: { min: 5, ideal: 10, energy: 'baja' },
  lectura: { min: 5, ideal: 20, energy: 'baja', portable: true },
  ejercicio: { min: 12, ideal: 45, energy: 'alta' },
  trading: { min: 15, ideal: 45, energy: 'media' },
  proyecto: { min: 25, ideal: 60, energy: 'media' },
  estudio: { min: 15, ideal: 45, energy: 'media', portable: true },
  reflexion: { min: 1, ideal: 3, energy: 'baja', portable: true },
};

export const habitOf = (a: Area): HabitPlan => ({
  ...(HABIT_DEFAULTS[a.id] ?? { min: Math.max(3, Math.round(a.minutes / 4)), ideal: Math.max(5, a.minutes), energy: 'media' as Energy }),
  ...(a.minimum ? { min: a.minimum } : {}),
  ...(a.ideal ? { ideal: a.ideal } : {}),
  ...(a.energy ? { energy: a.energy } : {}),
});

export interface Step {
  areaId: string;
  start: number;
  minutes: number;
  level: Level;
  done: boolean;
  window: number; // índice de la ventana
  block?: boolean; // parte del bloque de la mañana (van seguidos)
}

export interface Win {
  start: number;
  end: number;
  label: 'mañana' | 'almuerzo' | 'tarde' | 'noche';
  portableOnly?: boolean;
}

export interface Night {
  bed: number;
  wake: number;
  ideal: number; // hora ideal para acostarse
  sleep: number; // minutos de sueño
  short: boolean;
  nudged: boolean; // se está adelantando poco a poco desde tu hora real
  floor: boolean; // se adelantó más para no dormir menos de tu mínimo
  real?: number; // tu hora real de acostarte (si la conocemos)
}

export interface Route {
  day: string;
  wake: number;
  tonight: Night; // la noche que viene (hora de acostarte hoy)
  lastNight: Night;
  work: { start: number; end: number; leave: number; back: number } | null;
  windows: Win[];
  steps: Step[];
  dropped: string[]; // ni el mínimo cupo hoy
  mode: 'completo' | 'equilibrado' | 'minimo' | 'recuperacion' | 'cierre';
  headline: string;
  reasons: string[];
  freeMin: number;
  planMin: number;
}

export interface RouteInput {
  day: Date;
  now: number;
  areas: Area[];
  shifts: Shifts;
  prefs: DayPrefs;
  energy?: Energy;
  done: Set<string>; // áreas ya hechas hoy (guiado, a mano o con evidencia)
  doneAt?: Record<string, number>;
  missedYesterday?: Set<string>; // nunca dos ceros seguidos
  habitualBed?: number; // minuto del día en que de verdad te acuestas (puede pasar de 1440)
  wokeAt?: number; // hora real de despertar hoy, si la marcaste
  postponed?: Record<string, number>; // "más tarde": no antes de esta hora
}

const M = 60000;

interface Work {
  start: number;
  end: number;
  leave: number;
  back: number;
  lunch?: [number, number];
}

function workOf(d: Date, shifts: Shifts, p: DayPrefs): Work | null {
  const s = shifts[dayKey(d)];
  if (!s || s.off) return null;
  const d0 = startOfDay(d).getTime();
  const a = parseHM(s.start);
  let e = parseHM(s.end);
  if (e <= a) e += 1440;
  const lr = lunchRange(s.lunch);
  return {
    start: d0 + a * M,
    end: d0 + e * M,
    leave: d0 + (a - p.commute) * M,
    back: d0 + (e + p.commute) * M,
    lunch: lr ? [d0 + lr[0] * M, d0 + lr[1] * M] : undefined,
  };
}

/** La noche que termina la mañana del día `d`. */
export function nightBefore(d: Date, shifts: Shifts, p: DayPrefs, habitualBed?: number): Night {
  const d0 = startOfDay(d).getTime();
  const prev = workOf(addDays(d, -1), shifts, p);
  const cur = workOf(d, shifts, p);
  const latestWake = cur ? cur.leave - p.prep * M : Infinity;
  // despertar a tu hora de siempre; si sales temprano, con tiempo para ti antes de salir
  const wakeTarget = Math.min(d0 + parseHM(p.wakeFree) * M, latestWake - p.morning * M);
  const earliestBed = prev ? prev.back + p.windDown * M : -Infinity;
  const ideal = Math.max(wakeTarget - p.sleepHours * 60 * M, earliestBed);
  let bed = ideal;
  let nudged = false;
  if (habitualBed !== undefined) {
    const real = d0 - 1440 * M + habitualBed * M;
    // vienes acostándote más tarde: se planea con tu hora real menos 15 min (cada noche un poco antes)
    if (real > ideal + 20 * M) {
      bed = Math.max(ideal, real - 15 * M);
      nudged = true;
    }
  }
  // nunca planear menos de tu sueño mínimo si mañana trabajas
  const cap = cur ? latestWake - p.sleepMin * 60 * M : Infinity;
  const floor = bed > cap;
  if (floor) bed = cap;
  const wake = Math.min(bed + p.sleepHours * 60 * M, latestWake);
  const sleep = Math.round((wake - bed) / M);
  return { bed, wake, ideal, sleep, short: sleep < p.sleepMin * 60, nudged, floor, real: habitualBed !== undefined ? d0 - 1440 * M + habitualBed * M : undefined };
}

const labelOf = (t: number): Win['label'] => {
  const h = new Date(t).getHours();
  return h < 12 ? 'mañana' : h < 18 ? 'tarde' : 'noche';
};

function subtract(wins: [number, number][], cut: [number, number]): [number, number][] {
  const out: [number, number][] = [];
  for (const [a, b] of wins) {
    if (cut[1] <= a || cut[0] >= b) out.push([a, b]);
    else {
      if (cut[0] > a) out.push([a, cut[0]]);
      if (cut[1] < b) out.push([cut[1], b]);
    }
  }
  return out;
}

export function planDay(inp: RouteInput): Route {
  const { day, prefs: p, shifts } = inp;
  const d0 = startOfDay(day).getTime();
  const key = dayKey(day);
  const isToday = dayKey(inp.now) === key;
  const work = workOf(day, shifts, p);
  const lastNight = nightBefore(day, shifts, p, inp.habitualBed);
  const tonight = nightBefore(addDays(day, 1), shifts, p, inp.habitualBed);
  const wake = inp.wokeAt ?? lastNight.wake;
  const bed = tonight.bed;

  // ---- ventanas libres ----
  let free: [number, number][] = [[wake, bed]];
  if (work) free = subtract(free, [work.leave - p.prep * M, work.back + p.windDown * M]);
  // comidas (solo si caen en tiempo libre)
  for (const [a, b] of [
    [12 * 60 + 30, 13 * 60 + 15],
    [19 * 60 + 30, 20 * 60],
  ])
    free = subtract(free, [d0 + a * M, d0 + b * M]);
  const windows: Win[] = free.filter(([a, b]) => b - a >= 8 * M).map(([a, b]) => ({ start: a, end: b, label: labelOf(a) }));
  // almuerzo del trabajo: solo hábitos que se hacen en cualquier parte
  if (work?.lunch) {
    const [la, lb] = work.lunch;
    if (lb - la >= 30 * M) windows.push({ start: la + 20 * M, end: lb - 5 * M, label: 'almuerzo', portableOnly: true });
  }
  windows.sort((a, b) => a.start - b.start);
  // replanear desde ahora
  const from = isToday ? inp.now : -Infinity;
  for (const w of windows) w.start = Math.max(w.start, from);
  const live = windows.map((w, i) => ({ ...w, i, cap: Math.max(0, (w.end - w.start) / M) })).filter((w) => w.cap >= 5);
  const freeMin = Math.round(live.reduce((s, w) => s + w.cap, 0));

  // ---- hábitos ----
  // dormiste poco: la ruta se vuelve suave aunque no lo digas
  const energy: Energy = inp.energy ?? (lastNight.short ? 'baja' : 'media');
  const buffer = energy === 'baja' ? 0.35 : energy === 'alta' ? 0.1 : 0.2; // aire entre cosas, más si estás cansado
  for (const w of live) w.cap = Math.floor(w.cap * (1 - buffer));
  const A = inp.areas.filter((a) => a.active).sort((a, b) => a.order - b.order);
  const todo = A.filter((a) => !inp.done.has(a.id));
  type Item = { a: Area; h: HabitPlan; minutes: number; level: Level; w: number; prio: number };
  const prio = (a: Area) => (a.priority ?? 2) + (inp.missedYesterday?.has(a.id) ? 1 : 0) + (a.id === 'reflexion' ? 0.5 : 0);
  const placed: Item[] = [];
  const dropped: string[] = [];
  const fits = (w: (typeof live)[number], a: Area, h: HabitPlan, mins: number) =>
    w.cap >= mins && (!w.portableOnly || h.portable) && (inp.postponed?.[a.id] ?? 0) <= w.end - mins * M;
  const take = (a: Area, h: HabitPlan, w: (typeof live)[number], mins: number) => {
    w.cap -= mins;
    placed.push({ a, h, minutes: mins, level: mins >= h.ideal ? 'ideal' : 'minimo', w: w.i, prio: prio(a) });
  };

  // 1) bloque de la mañana (oración → meditación → estiramiento → lectura): juntos y en orden
  const block = todo.filter((a) => a.moment === 'antes' && habitOf(a).energy === 'baja');
  const blockMin = block.reduce((s, a) => s + habitOf(a).min, 0);
  const firstFit = live.find((w) => !w.portableOnly && w.cap >= blockMin);
  for (const a of block) {
    const h = habitOf(a);
    const w = firstFit && fits(firstFit, a, h, h.min) ? firstFit : live.find((x) => fits(x, a, h, h.min));
    if (w) take(a, h, w, h.min);
    else dropped.push(a.id);
  }
  // 2) el resto, por prioridad: ejercicio lejos de la hora de dormir; reflexión al cierre del día
  const rest = todo.filter((a) => !block.includes(a)).sort((x, y) => prio(y) - prio(x) || x.order - y.order);
  for (const a of rest) {
    const h = habitOf(a);
    let cands = live.filter((w) => fits(w, a, h, h.min));
    if (h.energy === 'alta') {
      const early = cands.filter((w) => bed - w.end >= 90 * M || w.start + 60 * M < bed - 120 * M);
      if (early.length) cands = early;
    }
    let w: (typeof live)[number] | undefined;
    if (a.moment === 'despues') w = cands[cands.length - 1];
    else if (a.moment === 'antes') w = cands.find((x) => x.i === firstFit?.i) ?? cands[0];
    // como en vacaciones: en orden y lo antes posible (donde quepa completo; si no, el mínimo)
    else w = cands.find((x) => x.cap >= h.ideal) ?? cands[0];
    if (w) take(a, h, w, h.min);
    else dropped.push(a.id);
  }

  // 3) con lo que sobra, cada hábito crece hacia su versión completa (prioridad primero)
  const growable = [...placed].sort((x, y) => y.prio - x.prio || x.a.order - y.a.order);
  for (const it of growable) {
    if (energy === 'baja' && it.h.energy !== 'baja') continue;
    const w = live.find((x) => x.i === it.w)!;
    const extra = Math.min(it.h.ideal - it.minutes, w.cap);
    if (extra >= 5 || (extra > 0 && it.minutes + extra === it.h.ideal)) {
      const add = it.minutes + extra === it.h.ideal ? extra : Math.floor(extra / 5) * 5;
      it.minutes += add;
      w.cap -= add;
      it.level = it.minutes >= it.h.ideal ? 'ideal' : 'medio';
    }
  }

  // ---- horario: dentro de cada ventana, el bloque primero y la reflexión al final ----
  const steps: Step[] = [];
  for (const w of live) {
    const items = placed
      .filter((x) => x.w === w.i)
      .sort((x, y) => {
        const rank = (it: Item) => (it.a.moment === 'despues' ? 3 : block.includes(it.a) ? 0 : it.h.energy === 'alta' ? 1 : 2);
        return rank(x) - rank(y) || x.a.order - y.a.order;
      });
    let t = w.start;
    items.forEach((it, k) => {
      const isBlock = block.includes(it.a);
      if (k > 0 && !(isBlock && block.includes(items[k - 1].a))) t += 5 * M; // transición
      // la reflexión va al final de la ventana (cierre del día)
      if (it.a.moment === 'despues' && w.end - it.minutes * M > t) t = Math.max(t, w.end - (it.minutes + 10) * M);
      const pp = inp.postponed?.[it.a.id];
      if (pp && pp > t) t = pp;
      steps.push({ areaId: it.a.id, start: t, minutes: it.minutes, level: it.level, done: false, window: w.i, block: isBlock });
      t += it.minutes * M;
    });
  }
  for (const a of A.filter((x) => inp.done.has(x.id)))
    steps.push({ areaId: a.id, start: inp.doneAt?.[a.id] ?? wake, minutes: habitOf(a).min, level: 'minimo', done: true, window: -1 });
  steps.sort((a, b) => a.start - b.start);

  // ---- modo y mensaje ----
  const planMin = placed.reduce((s, x) => s + x.minutes, 0);
  const allIdeal = placed.every((x) => x.level === 'ideal') && !dropped.length;
  const allMin = placed.every((x) => x.level === 'minimo');
  const mode: Route['mode'] = dropped.length || lastNight.short ? 'recuperacion' : allIdeal ? 'completo' : allMin ? 'minimo' : 'equilibrado';
  const reasons: string[] = [];
  const t = (ms: number) => new Date(ms).toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit' });
  if (work) reasons.push(`Trabajas de ${t(work.start)} a ${t(work.end)}: sales ${t(work.leave)} y vuelves ${t(work.back)}.`);
  else reasons.push('Día libre: vuelve la rutina completa, como en vacaciones.');
  if (tonight.floor) reasons.push(`Esta noche a la cama a las ${t(tonight.bed)}: mañana trabajas temprano y menos de ${p.sleepMin} h te deja sin energía${tonight.real ? ` (vienes acostándote a las ${t(tonight.real)})` : ''}.`);
  else if (tonight.nudged) reasons.push(`Te vienes acostando tarde. Esta noche a las ${t(tonight.bed)} (15 min antes que tu hora real); la meta es ${t(tonight.ideal)}.`);
  else reasons.push(`Para dormir ${p.sleepHours} h, esta noche a la cama a las ${t(tonight.bed)}.`);
  if (lastNight.short) reasons.push(`Anoche dormiste ~${Math.floor(lastNight.sleep / 60)} h ${lastNight.sleep % 60} min: hoy la ruta es suave.`);
  if (energy === 'baja') reasons.push('Estás cansado: solo crecen los hábitos tranquilos y queda más aire entre cosas.');
  const closing = isToday && bed - inp.now < 3 * 3600000; // se acaba el día: cierre, no reproche
  if (dropped.length) reasons.push(closing ? 'Lo que no cupo hoy va primero mañana (nunca dos ceros seguidos).' : 'No cabe ni el mínimo de todo: lo que quede fuera sube de prioridad mañana (nunca dos ceros seguidos).');
  const pending = steps.filter((s) => !s.done).length;
  const shownMode: Route['mode'] = closing ? 'cierre' : mode;
  const headline = !pending
    ? inp.done.size
      ? 'Día cumplido. Ahora protege tu sueño.'
      : 'Ya no queda tiempo libre hoy: descansa y mañana arrancamos.'
    : closing
      ? `Cierre del día: ${planMin} min de lo esencial y a dormir a las ${t(bed)}.`
      : mode === 'completo'
      ? `Hoy cabe todo: ${planMin} min para ti.`
      : mode === 'equilibrado'
        ? `Todo en marcha: ${planMin} min, el mínimo de todo y más en lo importante.`
        : mode === 'minimo'
          ? `Día pesado: el mínimo de todo (${planMin} min). Eso mantiene la cadena viva.`
          : `Día de recuperación: lo esencial (${planMin} min) y a dormir temprano.`;
  return { day: key, wake, tonight, lastNight, work: work ? { start: work.start, end: work.end, leave: work.leave, back: work.back } : null, windows, steps, dropped, mode: shownMode, headline, reasons, freeMin, planMin };
}

/** Tu hora real de acostarte: promedio de las últimas noches (después de medianoche cuenta como 24:xx). */
export function habitualBed(beds: number[], now: number): number | undefined {
  const recent = beds.filter((b) => now - b < 8 * 86400000).slice(-5);
  if (recent.length < 2) return undefined;
  const mins = recent.map((b) => {
    const d = new Date(b);
    const m = d.getHours() * 60 + d.getMinutes();
    return m < 12 * 60 ? m + 1440 : m;
  });
  return Math.round(mins.reduce((s, x) => s + x, 0) / mins.length);
}
