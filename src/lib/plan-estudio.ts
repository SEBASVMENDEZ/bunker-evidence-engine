// Ruta de estudio (Paquete I-2): las fases del plan de estudio y lo que pide cada semana.
// La fase cambia sola según la fecha; el conteo sale de lo que de verdad hiciste (hechos y videos).
// Sin datos personales: solo cursos, metas y fechas.
import type { Clip, Hecho } from './types';
import { dayKey, weekKey } from './time';

export interface Meta {
  name: string;
  areaId: string; // en qué paso de la ruta se cuenta
  veces: number; // sesiones por semana
  minutos: number;
  opcional?: boolean;
}

export interface Fase {
  n: number;
  desde: string; // YYYY-MM-DD (lunes)
  hasta: string; // YYYY-MM-DD (domingo)
  metas: Meta[];
}

export const FASES: Fase[] = [
  { n: 1, desde: '2026-10-19', hasta: '2027-01-03', metas: [{ name: 'Inglés', areaId: 'estudio', veces: 6, minutos: 20 }] },
  {
    n: 2,
    desde: '2027-01-04',
    hasta: '2027-03-28',
    metas: [
      { name: 'Inglés', areaId: 'estudio', veces: 6, minutos: 30 },
      { name: 'Trabajo virtual', areaId: 'estudio', veces: 3, minutos: 45 },
    ],
  },
  {
    n: 3,
    desde: '2027-03-29',
    hasta: '2027-06-27',
    metas: [
      { name: 'Inglés', areaId: 'estudio', veces: 5, minutos: 30 },
      { name: 'Trabajo virtual', areaId: 'estudio', veces: 2, minutos: 45 },
      { name: 'Riesgo y disciplina', areaId: 'trading', veces: 1, minutos: 45 },
      { name: 'Lectura', areaId: 'lectura', veces: 0, minutos: 0, opcional: true },
    ],
  },
];

export const HITOS: { day: string; text: string }[] = [
  { day: '2027-02-01', text: 'Aplicar a 2 plataformas de entrenamiento de IA' },
  { day: '2027-03-28', text: 'Decisión' },
  { day: '2027-06-27', text: 'Evaluación' },
];

/** La fase del día (YYYY-MM-DD), o null fuera del plan. */
export const faseDe = (day: string): Fase | null => FASES.find((f) => day >= f.desde && day <= f.hasta) ?? null;

/** El siguiente hito dentro de `dias` días (incluye hoy). */
export function proximoHito(day: string, dias = 14): { day: string; text: string } | null {
  const limite = dayKey(new Date(new Date(day + 'T12:00').getTime() + dias * 864e5));
  return HITOS.find((h) => h.day >= day && h.day <= limite) ?? null;
}

/** Sesiones de un paso en una semana: cada hecho cuenta (sesión guiada o "Ya lo hice");
 *  un día sin hecho pero con video de esa área cuenta como una sesión. */
export function sesionesSemana(areaId: string, week: string, hechos: Hecho[], clips: Clip[]): number {
  const porDia = new Map<string, number>();
  for (const h of hechos) if (h.areaId === areaId && weekKey(new Date(h.day + 'T12:00')) === week) porDia.set(h.day, (porDia.get(h.day) ?? 0) + 1);
  for (const c of clips) {
    if (c.excluded || c.areaId !== areaId || weekKey(c.takenAt) !== week) continue;
    const d = dayKey(c.takenAt);
    if (!porDia.has(d)) porDia.set(d, 1);
  }
  return [...porDia.values()].reduce((s, n) => s + n, 0);
}

/** "Esta semana: Inglés · 6 × 20 min · llevas 3" para un paso de la ruta (null si la fase no le pide nada). */
export function lineaSemana(areaId: string, day: string, hechos: Hecho[], clips: Clip[]): string | null {
  const metas = faseDe(day)?.metas.filter((m) => m.areaId === areaId && !m.opcional) ?? [];
  if (!metas.length) return null;
  const llevas = sesionesSemana(areaId, weekKey(new Date(day + 'T12:00')), hechos, clips);
  const _ = ' '; // espacio que no se parte: en el celular "llevas 3" no queda en dos renglones
  const meta = (m: Meta) => `${m.veces}${_}×${_}${m.minutos}${_}min`;
  if (metas.length === 1) return `Esta semana: ${metas[0].name} · ${meta(metas[0])} · llevas${_}${llevas}`;
  const total = metas.reduce((s, m) => s + m.veces, 0);
  return `Esta semana: ${metas.map((m) => `${m.name} ${meta(m)}`).join(' + ')} · llevas${_}${llevas}${_}de${_}${total}`;
}
