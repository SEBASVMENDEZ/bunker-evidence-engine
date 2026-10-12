// Del cumplir al aprender (retroalimentación de tu maestro, oct 2026):
//  · una línea de aprendizaje después de cada hábito, con la pregunta que le sirve a esa área
//    (no otra tarea agotadora: opcional, una línea, se puede dictar);
//  · patrones de tus propios datos, presentados como observaciones con su tamaño de muestra —
//    lo que el sistema investiga, no conclusiones dadas por ciertas.
import type { Area, Clip, Energy, Shifts, Statement } from './types';
import { addDays, dayKey, minuteOfDay } from './time';
import { shiftType, type ShiftType } from './classify';

export interface Aprendizaje {
  id: string;
  day: string;
  areaId: string;
  at: number;
  kind: 'idea' | 'decision' | 'mejora' | 'nota';
  text: string;
  outcome?: string; // decisiones: qué pasó después
}

export interface Dificultad {
  day: string;
  areaId?: string;
  tag: string;
  at: number;
}

export interface PlanSnapshot {
  day: string;
  at: number;
  energy?: Energy;
  mode: string;
  steps: { areaId: string; level: string; minutes: number }[];
}

/** La pregunta que convierte el hábito en aprendizaje, por área. */
export const PROMPTS: Record<string, { q: string; hint: string; kind: Aprendizaje['kind'] }> = {
  lectura: { q: '¿Qué idea entendiste y cómo la aplicarías?', hint: 'Una idea + una aplicación posible', kind: 'idea' },
  trading: { q: '¿Qué decisión tomaste y por qué?', hint: 'El domingo revisas qué pasó', kind: 'decision' },
  ejercicio: { q: '¿Qué hiciste mejor que la vez pasada?', hint: 'Carga, repeticiones, técnica o sensación', kind: 'mejora' },
  estudio: { q: '¿Qué concepto entendiste hoy?', hint: 'Dilo con tus palabras, en una línea', kind: 'idea' },
  proyecto: { q: '¿Qué avanzaste o qué te bloqueó?', hint: 'Un avance concreto o el bloqueo', kind: 'nota' },
  reflexion: { q: '¿Qué te llevas de hoy?', hint: 'Una frase', kind: 'idea' },
  meditacion: { q: '¿Qué notaste en tu mente hoy?', hint: 'Sin juzgar', kind: 'nota' },
  estiramiento: { q: '¿Qué sentiste más libre o más rígido?', hint: 'Una zona del cuerpo', kind: 'mejora' },
  oracion: { q: '¿Algo que quieras recordar de hoy?', hint: 'Opcional', kind: 'nota' },
};

export const promptOf = (a?: Area) => (a && PROMPTS[a.id]) || { q: '¿Qué aprendiste o qué mejoraste?', hint: 'Una línea', kind: 'nota' as const };

/** Cuál hábito de la sesión vale la pena preguntar (el que más enseña). */
export const LEARN_ORDER = ['trading', 'estudio', 'lectura', 'ejercicio', 'proyecto', 'reflexion', 'meditacion', 'estiramiento', 'oracion'];

export const DIFICULTADES = ['Cansancio', 'Poco tiempo', 'Interrupción', 'Distracción', 'Sin ganas'];

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

interface PatternInput {
  now: number;
  areas: Area[];
  clips: Clip[];
  hechos: { day: string; areaId: string }[];
  planes: Record<string, PlanSnapshot>;
  wakes: Record<string, { energy: Energy }>;
  beds: number[];
  dificultades: Dificultad[];
  shifts: Shifts;
}

/** Patrones de las últimas 4 semanas, cada uno con su tamaño de muestra. */
export function patterns(p: PatternInput, days = 28): Statement[] {
  const out: Statement[] = [];
  const A = p.areas.filter((a) => a.active);
  const range = Array.from({ length: days }, (_, i) => dayKey(addDays(new Date(p.now), -i - 1))).reverse(); // días cerrados
  const doneBy = new Map<string, Set<string>>();
  const mark = (d: string, a: string) => (doneBy.get(d) ?? doneBy.set(d, new Set()).get(d)!).add(a);
  for (const h of p.hechos) mark(h.day, h.areaId);
  for (const c of p.clips) if (!c.excluded && c.areaId && c.source !== 'demo') mark(dayKey(c.takenAt), c.areaId);
  const done = (d: string) => doneBy.get(d) ?? new Set<string>();
  const activeDays = range.filter((d) => done(d).size > 0);

  // 1) ¿la ruta se cumple? lo propuesto frente a lo hecho
  const planned = range.filter((d) => p.planes[d]);
  if (planned.length >= 3) {
    const rows = A.map((a) => {
      const prop = planned.filter((d) => p.planes[d].steps.some((s) => s.areaId === a.id));
      const hit = prop.filter((d) => done(d).has(a.id));
      return { a, prop: prop.length, hit: hit.length };
    }).filter((r) => r.prop >= 3);
    if (rows.length) {
      const tot = rows.reduce((s, r) => ({ prop: s.prop + r.prop, hit: s.hit + r.hit }), { prop: 0, hit: 0 });
      out.push({ type: 'metrica', text: `Haces el ${pct(tot.hit, tot.prop)} % de lo que la ruta te propone (${tot.hit} de ${tot.prop} propuestas en ${planned.length} días).` });
      const sorted = [...rows].sort((x, y) => y.hit / y.prop - x.hit / x.prop);
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];
      if (sorted.length > 1 && best.hit / best.prop - worst.hit / worst.prop >= 0.3)
        out.push({ type: 'observacion', text: `${best.a.name} es lo que más sostienes (${best.hit} de ${best.prop}); ${worst.a.name}, lo que más se queda (${worst.hit} de ${worst.prop}).`, areaId: worst.a.id });
    }
  } else out.push({ type: 'sin-datos', text: `Para saber si la ruta te sirve necesito al menos 3 días con ruta (llevo ${planned.length}).` });

  // 2) días difíciles: qué mantienes cuando estás cansado
  const hard = range.filter((d) => p.wakes[d]?.energy === 'baja' || p.planes[d]?.mode === 'recuperacion');
  const normal = range.filter((d) => !hard.includes(d) && (p.wakes[d] || p.planes[d]));
  if (hard.length >= 3 && normal.length >= 3) {
    const rate = (ds: string[], id: string) => ds.filter((d) => done(d).has(id)).length / ds.length;
    const kept = A.filter((a) => rate(hard, a.id) >= 0.6).map((a) => a.name);
    const drop = A.map((a) => ({ a, h: rate(hard, a.id), n: rate(normal, a.id) }))
      .filter((r) => r.n - r.h >= 0.35)
      .sort((x, y) => y.n - y.h - (x.n - x.h))[0];
    if (kept.length) out.push({ type: 'observacion', text: `En días de cansancio sigues haciendo ${kept.slice(0, 3).join(', ')} (${hard.length} días cansados registrados).` });
    if (drop) out.push({ type: 'observacion', text: `${drop.a.name} es lo primero que cae con cansancio: ${Math.round(drop.h * 100)} % frente a ${Math.round(drop.n * 100)} % en días normales.`, areaId: drop.a.id });
  } else if (hard.length < 3) out.push({ type: 'sin-datos', text: `Aún no hay suficientes días de cansancio marcados para ver qué mantienes (llevo ${hard.length}; necesito 3).` });

  // 3) según el turno
  const byType: Partial<Record<ShiftType, string[]>> = {};
  for (const d of activeDays.length ? range : []) {
    const t = shiftType(p.shifts[d]);
    if (t) (byType[t] ??= []).push(d);
  }
  const typeRows = (Object.entries(byType) as [ShiftType, string[]][]).filter(([, ds]) => ds.length >= 3).map(([t, ds]) => ({ t, n: ds.length, avg: ds.reduce((s, d) => s + done(d).size, 0) / ds.length }));
  if (typeRows.length >= 2) {
    const label: Record<ShiftType, string> = { temprano: 'turno temprano', tarde: 'turno de tarde', descanso: 'días de descanso' };
    const count: Record<ShiftType, string> = { temprano: 'de turno temprano', tarde: 'de turno de tarde', descanso: 'de descanso' };
    const s = [...typeRows].sort((x, y) => y.avg - x.avg);
    out.push({ type: 'observacion', text: `Con ${label[s[0].t]} haces ${s[0].avg.toFixed(1).replace(".", ",")} áreas al día; con ${label[s[s.length - 1].t]}, ${s[s.length - 1].avg.toFixed(1).replace(".", ",")} (${s.map((r) => `${r.n} días ${count[r.t]}`).join(', ')}).` });
  }

  // 4) volver después de cortar: cuántos días tardas en retomar cada área
  const gaps: { a: Area; d: number }[] = [];
  for (const a of A) {
    let lastDone = -1;
    range.forEach((d, i) => {
      if (done(d).has(a.id)) {
        if (lastDone >= 0 && i - lastDone > 1) gaps.push({ a, d: i - lastDone - 1 });
        lastDone = i;
      }
    });
  }
  if (gaps.length >= 3) {
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const per = A.map((a) => ({ a, g: gaps.filter((x) => x.a.id === a.id).map((x) => x.d) })).filter((r) => r.g.length >= 2);
    const slow = [...per].sort((x, y) => avg(y.g) - avg(x.g))[0];
    out.push({ type: 'metrica', text: `Cuando cortas un hábito, lo retomas en ${avg(gaps.map((g) => g.d)).toFixed(1).replace(".", ",")} días en promedio (${gaps.length} cortes).` });
    if (slow && avg(slow.g) >= 2) out.push({ type: 'observacion', text: `${slow.a.name} es el que más te cuesta retomar: ${avg(slow.g).toFixed(1).replace(".", ",")} días por corte.`, areaId: slow.a.id });
  }

  // 5) dificultades que se repiten
  const recent = p.dificultades.filter((x) => range.includes(x.day));
  const tally = new Map<string, number>();
  for (const x of recent) tally.set(x.tag, (tally.get(x.tag) ?? 0) + 1);
  const top = [...tally].sort((a, b) => b[1] - a[1]).filter(([, n]) => n >= 2);
  if (top.length) out.push({ type: 'observacion', text: `La dificultad que más se repite: ${top.slice(0, 2).map(([t, n]) => `${t.toLowerCase()} (${n} veces)`).join(', ')}.` });

  // 6) sueño: hora real de acostarte, esta semana frente a la anterior
  const bedMin = (b: number) => {
    const m = minuteOfDay(b);
    return m < 12 * 60 ? m + 1440 : m;
  };
  const wk = p.beds.filter((b) => p.now - b < 7 * 864e5);
  const prevWk = p.beds.filter((b) => p.now - b >= 7 * 864e5 && p.now - b < 14 * 864e5);
  if (wk.length >= 3) {
    const avg = wk.reduce((s, b) => s + bedMin(b), 0) / wk.length;
    const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
    let t = `Esta semana te acostaste en promedio a las ${hhmm(avg)} (${wk.length} noches marcadas)`;
    if (prevWk.length >= 3) {
      const diff = Math.round(prevWk.reduce((s, b) => s + bedMin(b), 0) / prevWk.length - avg);
      t += diff >= 5 ? `, ${diff} min antes que la semana pasada` : diff <= -5 ? `, ${-diff} min más tarde que la semana pasada` : ', igual que la semana pasada';
    }
    out.push({ type: 'metrica', text: t + '.' });
  }
  if (!out.length) out.push({ type: 'sin-datos', text: `Con ${activeDays.length} días de datos aún no hay patrones confiables. Sigue usando la ruta: aquí aparecerán.` });
  return out;
}
