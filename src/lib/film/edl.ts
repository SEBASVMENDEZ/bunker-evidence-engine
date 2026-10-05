// Motor de edición determinista: convierte la evidencia de la semana en una lista de decisiones de edición (EDL).
// Reglas simples y predecibles; los originales nunca se modifican.
import type { Area, Clip, Shifts, Statement, WeekReview } from '../types';
import type { WeekStats } from '../insights';
import { DAY_NAMES, dayKey, fmtDuration, isoWeekday, weekDays } from '../time';
import { realSecs } from '../classify';

export type Badge = 'acelerado' | 'momento' | 'completo' | 'normal' | 'destello' | 'montaje';

interface Base {
  start: number;
  dur: number;
  chapter: number;
}

export type Seg = Base &
  (
    | { t: 'intro' }
    | { t: 'resumen' }
    | { t: 'experimento'; text: string }
    | { t: 'capitulo'; title: string; subtitle: string; color: string; icon: string; areaId?: string; dayIndex?: number; days: boolean[]; count: number }
    | { t: 'clip'; clipId: string; from: number; to: number; rate: number; factor: number; audio: boolean; badge: Badge; part: [number, number]; index: number; ofArea: number }
    | { t: 'comparacion' }
    | { t: 'metricas' }
    | { t: 'insight'; statements: Statement[] }
    | { t: 'pregunta'; text: string }
    | { t: 'final'; priority?: string; experiment?: string }
  );

export interface Chapter {
  title: string;
  color: string;
  icon: string;
  start: number;
  dur: number;
}

export interface Film {
  week: string;
  segs: Seg[];
  chapters: Chapter[];
  duration: number;
  clipCount: number;
  sourceSeconds: number;
}

interface Piece {
  from: number;
  to: number;
  rate: number;
  audio: boolean;
  badge: Badge;
}

type SegInput = Seg extends infer S ? (S extends Seg ? Omit<S, 'start' | 'chapter'> : never) : never;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Cuánto viene ya acelerado el archivo (time-lapse del celular). */
export const lapseFactor = (c: Clip) => (c.lapse && c.duration > 0 ? Math.max(1, realSecs(c) / c.duration) : 1);

function planClip(c: Clip, scale: number): Piece[] {
  const dur = c.duration > 0 ? c.duration : 10;
  const f = lapseFactor(c);
  const real = dur * f; // un time-lapse ×10 de 6 min representa 1 h
  const pieces: Piece[] = [];
  const s = clamp(scale, 0.15, 1.6);

  const timelapse = (from: number, to: number, outTotal: number, maxPieces = 8): Piece[] => {
    const span = to - from;
    if (span <= 0.5) return [];
    let k = clamp(Math.round(outTotal / 2.6), 1, maxPieces);
    let outPer = outTotal / k;
    // objetivo ≈ ×8 efectivo; si el archivo ya viene acelerado, no se vuelve a acelerar de más
    let rate = Math.max(1, 8 / f);
    if (k * outPer * rate > span * 0.92) rate = Math.max(f > 1 ? 1 : 1.25, (span * 0.92) / (k * outPer));
    if (rate < 2 && k > 1 && f === 1) {
      k = 1;
      outPer = outTotal;
      rate = clamp(span / outTotal, 1.25, 16);
    }
    rate = Math.min(16, Number(rate.toFixed(2)));
    const srcSpan = Math.min(span, outPer * rate);
    const margin = Math.min(span * 0.03, 3);
    const usable = span - 2 * margin;
    const res: Piece[] = [];
    for (let i = 0; i < k; i++) {
      const center = from + margin + (usable * (i + 0.5)) / k;
      const a = clamp(center - srcSpan / 2, from, to - srcSpan);
      res.push({ from: a, to: a + srcSpan, rate, audio: false, badge: 'acelerado' });
    }
    return res;
  };

  for (const m of c.markers.slice(0, 3)) {
    pieces.push({ from: Math.max(0, m - 4), to: Math.min(dur, m + 8), rate: 1, audio: true, badge: 'momento' });
  }

  switch (c.kind) {
    case 'reflexion': {
      const cap = (c.starred ? 300 : 180) * Math.max(0.3, s);
      if (dur <= cap) pieces.unshift({ from: 0, to: dur, rate: 1, audio: true, badge: 'completo' });
      else {
        pieces.unshift({ from: 0, to: cap * 0.72, rate: 1, audio: true, badge: 'normal' });
        pieces.push({ from: dur - cap * 0.28, to: dur, rate: 1, audio: true, badge: 'normal' });
      }
      break;
    }
    case 'explicacion': {
      const cap = (c.starred ? 90 : 40) * Math.max(0.3, s);
      if (dur <= cap * 1.25) pieces.unshift({ from: 0, to: dur, rate: 1, audio: true, badge: 'completo' });
      else {
        pieces.unshift({ from: 0, to: cap, rate: 1, audio: true, badge: 'normal' });
        if (!c.markers.length) pieces.push(...timelapse(cap, dur, clamp(3 + Math.log2(dur / 60 + 1) * 1.5, 3, 8) * s, 3));
      }
      break;
    }
    case 'proceso': {
      let out = clamp(4 + 3.2 * Math.log2(1 + real / 60), 5, 24) * s;
      if (c.starred) out *= 1.5;
      out = Math.max(2.2, out);
      if (dur <= out * 1.3) pieces.unshift({ from: 0, to: dur, rate: Math.max(1, dur / out), audio: false, badge: 'acelerado' });
      else pieces.unshift(...timelapse(0, dur, out));
      break;
    }
    case 'transicion': {
      const to = Math.min(dur, 3);
      pieces.unshift({ from: 0, to, rate: 2, audio: false, badge: 'destello' });
      break;
    }
    case 'repeticion': {
      const a = Math.min(dur * 0.3, Math.max(0, dur - 2.4));
      pieces.unshift({ from: a, to: Math.min(dur, a + 2.4), rate: 1.25, audio: false, badge: 'montaje' });
      break;
    }
  }
  // ordenar cronológicamente y fusionar solapes
  pieces.sort((x, y) => x.from - y.from);
  const merged: Piece[] = [];
  for (const p of pieces) {
    if (p.to - p.from < 0.3) continue;
    const last = merged[merged.length - 1];
    if (last && p.from < last.to) {
      if (p.badge === 'momento' || last.badge === 'momento') {
        // el momento marcado manda: velocidad normal con audio
        last.to = Math.max(last.to, p.to);
        last.rate = 1;
        last.audio = true;
        last.badge = 'momento';
      } else last.to = Math.max(last.to, p.to);
    } else merged.push({ ...p });
  }
  return merged;
}

const outOf = (ps: Piece[]) => ps.reduce((s, p) => s + (p.to - p.from) / p.rate, 0);

const FIXED = { intro: 4.4, resumen: 7.5, experimento: 5.5, capitulo: 3.4, comparacion: 7, metricas: 7, pregunta: 6.5, final: 7.5 };

export interface FilmInput {
  week: string;
  clips: Clip[];
  areas: Area[];
  stats: WeekStats;
  prevStats?: WeekStats;
  statements: Statement[];
  review?: WeekReview;
  prevReview?: WeekReview;
  minutes: number;
  grouping: 'area' | 'dia';
  shifts?: Shifts;
}

export function buildFilm(inp: FilmInput): Film {
  const clips = inp.clips.filter((c) => !c.excluded && (c.status === 'listo' || c.source === 'demo')).sort((a, b) => a.takenAt - b.takenAt);
  const areaMap = new Map(inp.areas.map((a) => [a.id, a]));

  // grupos (capítulos)
  type Group = { title: string; subtitle: string; color: string; icon: string; areaId?: string; dayIndex?: number; days: boolean[]; clips: Clip[] };
  const groups: Group[] = [];
  if (inp.grouping === 'dia') {
    const days = weekDays(inp.week);
    for (let i = 0; i < 7; i++) {
      const cs = clips.filter((c) => isoWeekday(new Date(c.takenAt)) - 1 === i);
      if (!cs.length) continue;
      const ar = new Set(cs.map((c) => c.areaId).filter(Boolean));
      const d = days[i];
      groups.push({
        title: DAY_NAMES[i],
        subtitle: `${(() => {
          const sh = inp.shifts?.[dayKey(d)];
          return sh ? (sh.off ? 'Descanso · ' : `Turno ${sh.start}–${sh.end} · `) : '';
        })()}${ar.size} ${ar.size === 1 ? 'área' : 'áreas'} · ${cs.length} ${cs.length === 1 ? 'evidencia' : 'evidencias'}`,
        color: '#6D8BFF',
        icon: i === 6 ? 'noche' : 'amanecer',
        dayIndex: i,
        days: Array.from({ length: 7 }, (_, j) => j === i),
        clips: cs,
      });
    }
  } else {
    const sorted = [...inp.areas].sort((a, b) => a.order - b.order);
    for (const a of sorted) {
      const cs = clips.filter((c) => c.areaId === a.id);
      if (!cs.length) continue;
      const st = inp.stats.areas[a.id];
      groups.push({
        title: a.name,
        subtitle: `${st?.sessions ?? cs.length} ${st?.sessions === 1 ? 'sesión' : 'sesiones'} · ${fmtDuration(st?.seconds ?? 0, true)} registrados`,
        color: a.color,
        icon: a.icon,
        areaId: a.id,
        days: st?.days ?? Array(7).fill(false),
        clips: cs,
      });
    }
    const loose = clips.filter((c) => !c.areaId || !areaMap.has(c.areaId));
    if (loose.length) {
      groups.push({ title: 'Sin clasificar', subtitle: `${loose.length} evidencias`, color: '#94A3B8', icon: 'chispa', days: Array(7).fill(false), clips: loose });
    }
  }

  const hasPrev = !!inp.prevStats && inp.prevStats.total > 0;
  const pick = (t: Statement['type'], n: number) => inp.statements.filter((s) => s.type === t).slice(0, n);
  const filmStatements = [...pick('metrica', 2), ...pick('observacion', 3), ...pick('inferencia', 2), ...pick('sin-datos', 2)];
  const insightDur = clamp(4 + filmStatements.length * 1.5, 8, 17);
  const fixed =
    FIXED.intro + FIXED.resumen + (inp.prevReview?.experiment ? FIXED.experimento : 0) + groups.length * FIXED.capitulo +
    (hasPrev ? FIXED.comparacion : 0) + FIXED.metricas + insightDur + FIXED.pregunta + FIXED.final;
  const budget = Math.max(30, inp.minutes * 60 - fixed);

  // ajustar la escala hasta caber en la duración objetivo
  let scale = 1;
  let plans = new Map<string, Piece[]>();
  for (let it = 0; it < 6; it++) {
    plans = new Map(clips.map((c) => [c.id, planClip(c, scale)]));
    const total = [...plans.values()].reduce((s, ps) => s + outOf(ps), 0);
    if (total <= budget * 1.04 || scale <= 0.16) break;
    scale *= Math.max(0.35, budget / total);
  }

  const segs: Seg[] = [];
  const chapters: Chapter[] = [];
  let t = 0;
  let ch = 0;
  const push = (s: SegInput) => {
    segs.push({ ...(s as Seg), start: t, chapter: ch });
    t += s.dur;
  };
  const openChapter = (title: string, color: string, icon: string) => {
    if (chapters.length) chapters[chapters.length - 1].dur = t - chapters[chapters.length - 1].start;
    ch = chapters.length;
    chapters.push({ title, color, icon, start: t, dur: 0 });
  };

  openChapter('Apertura', '#6D8BFF', 'chispa');
  push({ t: 'intro', dur: FIXED.intro });
  push({ t: 'resumen', dur: FIXED.resumen });
  if (inp.prevReview?.experiment) push({ t: 'experimento', dur: FIXED.experimento, text: inp.prevReview.experiment });

  for (const g of groups) {
    openChapter(g.title, g.color, g.icon);
    push({ t: 'capitulo', dur: FIXED.capitulo, title: g.title, subtitle: g.subtitle, color: g.color, icon: g.icon, areaId: g.areaId, dayIndex: g.dayIndex, days: g.days, count: g.clips.length });
    g.clips.forEach((c, idx) => {
      const ps = plans.get(c.id) ?? [];
      ps.forEach((p, pi) => {
        push({
          t: 'clip', dur: (p.to - p.from) / p.rate, clipId: c.id, from: p.from, to: p.to, rate: p.rate, factor: lapseFactor(c),
          audio: p.audio, badge: p.badge, part: [pi + 1, ps.length], index: idx + 1, ofArea: g.clips.length,
        });
      });
    });
  }

  openChapter('Balance', '#E2E8F0', 'meta');
  if (hasPrev) push({ t: 'comparacion', dur: FIXED.comparacion });
  push({ t: 'metricas', dur: FIXED.metricas });
  push({ t: 'insight', dur: insightDur, statements: filmStatements });
  const q = inp.statements.find((s) => s.type === 'pregunta')?.text ?? '¿Qué variable cambiarás en el próximo experimento?';
  push({ t: 'pregunta', dur: FIXED.pregunta, text: q });
  push({ t: 'final', dur: FIXED.final, priority: inp.review?.priority, experiment: inp.review?.experiment });
  chapters[chapters.length - 1].dur = t - chapters[chapters.length - 1].start;

  return {
    week: inp.week,
    segs,
    chapters,
    duration: t,
    clipCount: clips.length,
    sourceSeconds: clips.reduce((s, c) => s + (realSecs(c) || 0), 0),
  };
}

export function segAt(film: Film, time: number): number {
  let lo = 0;
  let hi = film.segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (film.segs[mid].start <= time) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
