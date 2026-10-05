// Métricas honestas + Insight Engine. Nunca presentar una inferencia como hecho.
import type { Area, Clip, Shifts, Statement } from './types';
import { realSecs, shiftType, type ShiftType } from './classify';
import { DAY_NAMES, addDays, dayKey, fmtDuration, isoWeekday, minuteOfDay, shiftWeek, startOfDay, weekDays, weekStart } from './time';

export interface AreaStat {
  areaId: string;
  sessions: number;
  clips: number;
  seconds: number;
  days: boolean[];
  lastDay: number; // 0..6, -1 si no hay
}

export interface DayStat {
  clips: number;
  seconds: number;
  areas: Set<string>;
  firstMinute: number | null;
}

export interface WeekStats {
  week: string;
  clips: Clip[];
  total: number;
  seconds: number;
  activeDays: number;
  perDay: DayStat[];
  areas: Record<string, AreaStat>;
  fullDays: number;
  dailyAreas: string[];
  unassigned: number;
  pending: number;
}

const SESSION_GAP = 25 * 60 * 1000;

export function computeWeek(all: Clip[], areas: Area[], week: string): WeekStats {
  const clips = all.filter((c) => c.week === week && !c.excluded).sort((a, b) => a.takenAt - b.takenAt);
  const perDay: DayStat[] = Array.from({ length: 7 }, () => ({ clips: 0, seconds: 0, areas: new Set<string>(), firstMinute: null }));
  const stats: Record<string, AreaStat> = {};
  for (const a of areas) stats[a.id] = { areaId: a.id, sessions: 0, clips: 0, seconds: 0, days: Array(7).fill(false), lastDay: -1 };
  const lastEnd = new Map<string, number>();
  let unassigned = 0;
  let pending = 0;
  for (const c of clips) {
    const di = isoWeekday(new Date(c.takenAt)) - 1;
    const d = perDay[di];
    d.clips++;
    d.seconds += realSecs(c) || 0;
    const m = minuteOfDay(c.takenAt);
    if (d.firstMinute === null || m < d.firstMinute) d.firstMinute = m;
    if (c.status === 'pendiente') pending++;
    if (!c.areaId || !stats[c.areaId]) {
      unassigned++;
      continue;
    }
    d.areas.add(c.areaId);
    const s = stats[c.areaId];
    s.clips++;
    s.seconds += realSecs(c) || 0;
    s.days[di] = true;
    s.lastDay = Math.max(s.lastDay, di);
    const prev = lastEnd.get(c.areaId);
    if (prev === undefined || c.takenAt - prev > SESSION_GAP) s.sessions++;
    lastEnd.set(c.areaId, c.takenAt + (realSecs(c) || 0) * 1000);
  }
  const dailyAreas = areas.filter((a) => a.active && a.targetPerWeek >= 7).map((a) => a.id);
  const fullDays = dailyAreas.length ? perDay.filter((d) => dailyAreas.every((id) => d.areas.has(id))).length : 0;
  return {
    week,
    clips,
    total: clips.length,
    seconds: clips.reduce((s, c) => s + (realSecs(c) || 0), 0),
    activeDays: perDay.filter((d) => d.clips > 0).length,
    perDay,
    areas: stats,
    fullDays,
    dailyAreas,
    unassigned,
    pending,
  };
}

export function history(all: Clip[], areas: Area[], week: string, n = 8): WeekStats[] {
  return Array.from({ length: n }, (_, i) => computeWeek(all, areas, shiftWeek(week, -(i + 1))));
}

function hmLabel(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export function insights(cur: WeekStats, past: WeekStats[], areas: Area[], all?: Clip[], shifts?: Shifts): Statement[] {
  const out: Statement[] = [];
  const active = areas.filter((a) => a.active).sort((a, b) => a.order - b.order);
  const name = (id: string) => areas.find((a) => a.id === id)?.name ?? id;
  const prev = past[0];
  const prevHas = prev && prev.total > 0;

  if (cur.total === 0) {
    out.push({ type: 'sin-datos', text: 'Esta semana todavía no tiene evidencia. Graba o vincula tu carpeta de videos.' });
    return out;
  }

  // ---------- MÉTRICAS ----------
  out.push({
    type: 'metrica',
    text: `${plural(cur.total, 'evidencia', 'evidencias')} en ${cur.activeDays}/7 días · ${fmtDuration(cur.seconds, true)} registrados.`,
  });
  const end = addDays(weekStart(cur.week), 7).getTime();
  if (Date.now() < end) {
    const left = Math.ceil((end - Date.now()) / 864e5);
    out.push({
      type: 'sin-datos',
      text: left <= 1 ? 'Semana en curso: lo que falta de hoy aún no está registrado; las comparaciones son provisionales.' : `Semana en curso: quedan ${left} días; las comparaciones son provisionales.`,
    });
  }
  const top = active
    .map((a) => cur.areas[a.id])
    .filter((s) => s && s.sessions > 0)
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 3);
  for (const s of top) {
    const a = areas.find((x) => x.id === s.areaId)!;
    out.push({
      type: 'metrica',
      areaId: s.areaId,
      text: `${a.name}: ${plural(s.sessions, 'sesión', 'sesiones')}${a.targetPerWeek ? ` de ${a.targetPerWeek} previstas` : ''} · ${fmtDuration(s.seconds, true)}.`,
    });
  }
  if (cur.dailyAreas.length > 1) {
    out.push({ type: 'metrica', text: `Rutina diaria completa: ${cur.fullDays} de 7 días.` });
  }

  // ---------- OBSERVACIONES ----------
  if (prevHas) {
    const deltas = active
      .map((a) => ({ a, d: (cur.areas[a.id]?.sessions ?? 0) - (prev.areas[a.id]?.sessions ?? 0) }))
      .filter((x) => x.d !== 0)
      .sort((x, y) => Math.abs(y.d) - Math.abs(x.d))
      .slice(0, 3);
    for (const { a, d } of deltas) {
      const n = cur.areas[a.id]?.sessions ?? 0;
      out.push({
        type: 'observacion',
        areaId: a.id,
        text: `${a.name}: ${plural(n, 'sesión', 'sesiones')}, ${Math.abs(d)} ${d > 0 ? 'más' : 'menos'} que la semana anterior.`,
      });
    }
    const dd = cur.activeDays - prev.activeDays;
    if (dd !== 0) out.push({ type: 'observacion', text: `Días activos: ${cur.activeDays}, ${Math.abs(dd)} ${dd > 0 ? 'más' : 'menos'} que la semana anterior.` });
  }
  const missing = active.filter((a) => a.targetPerWeek > 0 && (cur.areas[a.id]?.sessions ?? 0) === 0);
  if (missing.length) {
    out.push({ type: 'observacion', text: `Sin evidencia esta semana: ${missing.map((a) => a.name).join(', ')}.` });
  }
  const emptyDays = cur.perDay.map((d, i) => (d.clips === 0 ? DAY_NAMES[i].toLowerCase() : null)).filter(Boolean) as string[];
  if (emptyDays.length && emptyDays.length < 7) out.push({ type: 'observacion', text: `Días sin registros: ${emptyDays.join(', ')}.` });
  for (const a of active) {
    const s = cur.areas[a.id];
    if (s && s.sessions > 0 && s.lastDay >= 0 && s.lastDay <= 3 && a.targetPerWeek >= 5) {
      out.push({ type: 'observacion', areaId: a.id, text: `${a.name}: el último registro fue el ${DAY_NAMES[s.lastDay].toLowerCase()}.` });
    }
  }

  // ---------- INFERENCIAS (solo con evidencia suficiente) ----------
  const weeksWithData = [cur, ...past].filter((w) => w.total > 0);
  let inferred = false;
  if (past[0]?.total && past[1]?.total) {
    for (const a of active) {
      const seq = [past[1].areas[a.id]?.sessions ?? 0, past[0].areas[a.id]?.sessions ?? 0, cur.areas[a.id]?.sessions ?? 0];
      if (seq[0] < seq[1] && seq[1] < seq[2]) {
        out.push({ type: 'inferencia', areaId: a.id, text: `La consistencia en ${a.name} parece estar aumentando (3 semanas seguidas al alza).` });
        inferred = true;
      } else if (seq[0] > seq[1] && seq[1] > seq[2]) {
        out.push({ type: 'inferencia', areaId: a.id, text: `La consistencia en ${a.name} parece estar disminuyendo (3 semanas seguidas a la baja).` });
        inferred = true;
      }
    }
  }
  // ¿Empezar temprano se relaciona con días más completos?
  const days = [cur, ...past.slice(0, 3)].flatMap((w) => w.perDay).filter((d) => d.firstMinute !== null && d.areas.size > 0);
  if (days.length >= 8) {
    const sorted = [...days].map((d) => d.firstMinute!).sort((a, b) => a - b);
    const cut = sorted[Math.floor(sorted.length / 2)];
    const early = days.filter((d) => d.firstMinute! < cut);
    const late = days.filter((d) => d.firstMinute! >= cut);
    if (early.length >= 3 && late.length >= 3) {
      const me = early.reduce((s, d) => s + d.areas.size, 0) / early.length;
      const ml = late.reduce((s, d) => s + d.areas.size, 0) / late.length;
      if (Math.abs(me - ml) >= 1) {
        out.push({
          type: 'inferencia',
          text: `Los días que empezaste antes de las ${hmLabel(cut)} registraste en promedio ${me.toFixed(1)} áreas, frente a ${ml.toFixed(1)}. Es una relación observada en ${days.length} días, no una causa demostrada.`,
        });
        inferred = true;
      }
    }
  }
  // Según el tipo de turno (temprano / tarde / descanso)
  if (all && shifts) {
    const ss = shiftStats(all, shifts, cur.week);
    const groups = (['temprano', 'tarde', 'descanso'] as ShiftType[]).filter((t) => ss[t].days >= 2);
    if (groups.length >= 2) {
      const label: Record<ShiftType, string> = { temprano: 'turno temprano', tarde: 'turno tarde', descanso: 'descanso' };
      out.push({
        type: 'observacion',
        text: `Áreas registradas por día, últimas 4 semanas: ${groups.map((t) => `${label[t]} ${ss[t].avg.toFixed(1)} (${ss[t].days} días)`).join(' · ')}.`,
      });
      const e = ss.temprano;
      const l = ss.tarde;
      if (e.days >= 3 && l.days >= 3 && Math.abs(l.avg - e.avg) >= 1.5) {
        out.push({
          type: 'inferencia',
          text: l.avg > e.avg
            ? `Los turnos tempranos parecen recortar tu rutina (${e.avg.toFixed(1)} frente a ${l.avg.toFixed(1)} áreas). Es una relación observada, no una causa demostrada.`
            : `Curiosamente, con turno temprano registras más áreas (${e.avg.toFixed(1)} frente a ${l.avg.toFixed(1)}). Es una relación observada, no una causa demostrada.`,
        });
        inferred = true;
      }
    }
  }
  if (!inferred) {
    out.push({
      type: 'sin-datos',
      text:
        weeksWithData.length < 3
          ? `No hay datos suficientes para concluir tendencias (hay ${plural(weeksWithData.length, 'semana', 'semanas')} con evidencia; se necesitan 3).`
          : 'No aparece una tendencia clara: no hay base para concluir más que los hechos.',
    });
  }

  // ---------- PREGUNTA ----------
  out.push({ type: 'pregunta', text: reviewQuestion(cur, prev, active, name) });
  return out;
}

function reviewQuestion(cur: WeekStats, prev: WeekStats | undefined, active: Area[], name: (id: string) => string): string {
  if (prev && prev.total > 0) {
    let best: { id: string; d: number } | null = null;
    let worst: { id: string; d: number } | null = null;
    for (const a of active) {
      const d = (cur.areas[a.id]?.sessions ?? 0) - (prev.areas[a.id]?.sessions ?? 0);
      if (!best || d > best.d) best = { id: a.id, d };
      if (!worst || d < worst.d) worst = { id: a.id, d };
    }
    if (worst && worst.d <= -2) return `¿Qué cambió en los días sin ${name(worst.id)}: fue una condición, una decisión o un obstáculo?`;
    if (best && best.d >= 2) return `¿Qué condición estuvo presente en los días de mayor consistencia en ${name(best.id)}?`;
  }
  const bestDay = cur.perDay.reduce((bi, d, i, arr) => (d.areas.size > arr[bi].areas.size ? i : bi), 0);
  if (cur.perDay[bestDay].areas.size > 0) {
    return `El ${DAY_NAMES[bestDay].toLowerCase()} fue tu día más completo. ¿Qué lo hizo posible y cómo lo repites?`;
  }
  return '¿Qué variable cambiarías si repitieras esta semana?';
}

/** Sesiones por área en las últimas n semanas (más antigua primero). */
export function trend(all: Clip[], areas: Area[], week: string, n = 8): { week: string; total: number; byArea: Record<string, number>; activeDays: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const w = shiftWeek(week, -(n - 1 - i));
    const s = computeWeek(all, areas, w);
    const byArea: Record<string, number> = {};
    for (const a of areas) byArea[a.id] = s.areas[a.id]?.sessions ?? 0;
    return { week: w, total: s.total, byArea, activeDays: s.activeDays };
  });
}

export function streak(all: Clip[]): number {
  const days = new Set(all.filter((c) => !c.excluded).map((c) => new Date(c.takenAt).toDateString()));
  let n = 0;
  const d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1); // hoy aún puede completarse
  while (days.has(d.toDateString())) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export interface ShiftStat {
  days: number;
  avg: number;
}

/** Promedio de áreas registradas por día según el tipo de turno (solo días ya terminados). */
export function shiftStats(all: Clip[], shifts: Shifts, week: string, weeks = 4): Record<ShiftType, ShiftStat> {
  const perDay = new Map<string, Set<string>>();
  for (const c of all) {
    if (c.excluded || !c.areaId) continue;
    const d = dayKey(c.takenAt);
    const set = perDay.get(d) ?? new Set<string>();
    set.add(c.areaId);
    perDay.set(d, set);
  }
  const today = startOfDay(new Date()).getTime();
  const acc: Record<ShiftType, { n: number; sum: number }> = { temprano: { n: 0, sum: 0 }, tarde: { n: 0, sum: 0 }, descanso: { n: 0, sum: 0 } };
  for (let w = 0; w < weeks; w++) {
    for (const d of weekDays(shiftWeek(week, -w))) {
      if (d.getTime() >= today) continue;
      const k = dayKey(d);
      const t = shiftType(shifts[k]);
      if (!t) continue;
      acc[t].n++;
      acc[t].sum += perDay.get(k)?.size ?? 0;
    }
  }
  const out = {} as Record<ShiftType, ShiftStat>;
  for (const t of Object.keys(acc) as ShiftType[]) out[t] = { days: acc[t].n, avg: acc[t].n ? acc[t].sum / acc[t].n : 0 };
  return out;
}
