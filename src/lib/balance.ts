// La cuarta mirada del domingo (Paquete I-4): dinero y estudio en tres cifras.
// Regla del Insight Engine: si no hay datos, se dice "sin datos". Nunca se inventa una cifra.
import type { Clip, Hecho, WeekReview } from './types';
import { fechaPago, pagadoKey, pesos, type Pago } from './dinero';
import { faseDe, sesionesSemana } from './plan-estudio';
import { dayKey, weekDays, weekNumber } from './time';

/** Una cifra de la semana. valor null = sin datos. */
export interface Cifra {
  label: string;
  valor: string | null;
  detalle?: string;
}

/** Pagos que vencían esta semana: cuántos marcaste pagados a tiempo (antes de terminar su día). */
export function pagosSemana(week: string, pagos: Pago[], pagados: Record<string, number>, hoy: string) {
  const dias = weekDays(week).map((d) => dayKey(d));
  const meses = [...new Set(weekDays(week).map((d) => `${d.getFullYear()}-${d.getMonth()}`))].map((k) => k.split('-').map(Number));
  let total = 0;
  let aTiempo = 0;
  let pendientes = 0; // aún no vencen (semana en curso)
  for (const p of pagos) {
    for (const [y, m0] of meses) {
      const fecha = fechaPago(p, y, m0);
      if (!dias.includes(fecha) || fecha < p.desde) continue;
      const pagadoEl = pagados[pagadoKey(p.id, fecha.slice(0, 7))];
      if (!pagadoEl && fecha >= hoy) {
        pendientes++;
        continue;
      }
      total++;
      if (pagadoEl && pagadoEl <= new Date(fecha + 'T23:59:59.999').getTime()) aTiempo++;
    }
  }
  return { total, aTiempo, pendientes };
}

/** La deuda total más reciente que escribiste (de esta semana o de una anterior) y la anterior a esa. */
export function deudaHasta(week: string, reviews: Record<string, WeekReview>) {
  const conDeuda = Object.values(reviews)
    .filter((r) => r.week <= week && typeof r.deudaTotal === 'number')
    .sort((a, b) => (a.week < b.week ? 1 : -1));
  const [ultima, antes] = conDeuda;
  return ultima ? { valor: ultima.deudaTotal!, week: ultima.week, antes: antes ? { valor: antes.deudaTotal!, week: antes.week } : undefined } : null;
}

/** Sesiones de estudio de la semana frente a la meta de la fase (null si la semana está fuera del plan). */
export function estudioSemana(week: string, hechos: Hecho[], clips: Clip[]) {
  const lunes = dayKey(weekDays(week)[0]);
  const metas = faseDe(lunes)?.metas.filter((m) => m.areaId === 'estudio' && !m.opcional) ?? [];
  return { hechas: sesionesSemana('estudio', week, hechos, clips), meta: metas.length ? metas.reduce((s, m) => s + m.veces, 0) : null };
}

export function cuartaMirada(
  week: string,
  d: { pagos: Pago[]; pagados: Record<string, number>; reviews: Record<string, WeekReview>; hechos: Hecho[]; clips: Clip[] },
  hoy = dayKey(Date.now()),
): Cifra[] {
  const pg = pagosSemana(week, d.pagos, d.pagados, hoy);
  const deuda = deudaHasta(week, d.reviews);
  const est = estudioSemana(week, d.hechos, d.clips);
  const dif = deuda?.antes ? deuda.valor - deuda.antes.valor : null;
  return [
    {
      label: 'Pagos a tiempo',
      valor: pg.total ? `${pg.aTiempo} de ${pg.total}` : null,
      detalle: [pg.total > pg.aTiempo ? `${pg.total - pg.aTiempo} tarde o sin marcar` : '', pg.pendientes ? `${pg.pendientes} aún por vencer` : ''].filter(Boolean).join(' · ') || undefined,
    },
    {
      label: 'Deuda total',
      valor: deuda ? pesos(deuda.valor) : null,
      detalle: deuda
        ? [deuda.week !== week ? `escrita en la semana ${weekNumber(deuda.week)}` : '', dif !== null ? (dif === 0 ? 'igual que la anterior' : `${dif < 0 ? '−' : '+'}${pesos(Math.abs(dif))} frente a la anterior`) : ''].filter(Boolean).join(' · ') || undefined
        : undefined,
    },
    {
      label: 'Estudio',
      valor: est.hechas ? (est.meta ? `${est.hechas} de ${est.meta}` : `${est.hechas}`) : null,
      detalle: est.meta
        ? est.hechas
          ? 'sesiones frente a la meta de la semana'
          : `meta de la semana: ${est.meta} sesiones`
        : est.hechas
          ? 'sesiones (semana fuera del plan de estudio)'
          : undefined,
    },
  ];
}
