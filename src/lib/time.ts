// Utilidades de fecha: semanas ISO (lunes → domingo), formato en español.

export const DAY_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const MONTHS_LONG = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** 1 = lunes … 7 = domingo */
export function isoWeekday(d: Date): number {
  const w = d.getDay();
  return w === 0 ? 7 : w;
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function weekKey(ts: number | Date): string {
  const d = startOfDay(new Date(ts));
  // jueves de la semana actual decide el año ISO
  const thursday = addDays(d, 4 - isoWeekday(d));
  const year = thursday.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const week1Monday = addDays(startOfDay(jan4), 1 - isoWeekday(jan4));
  const week = Math.round((startOfDay(thursday).getTime() - week1Monday.getTime()) / (7 * 864e5)) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Lunes 00:00 de la semana indicada. */
export function weekStart(key: string): Date {
  const [y, w] = key.split('-W').map(Number);
  const jan4 = new Date(y, 0, 4);
  const week1Monday = addDays(startOfDay(jan4), 1 - isoWeekday(jan4));
  return addDays(week1Monday, (w - 1) * 7);
}

export function weekDays(key: string): Date[] {
  const s = weekStart(key);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

export function shiftWeek(key: string, n: number): string {
  return weekKey(addDays(weekStart(key), n * 7 + 3));
}

export function weekNumber(key: string): number {
  return Number(key.split('-W')[1]);
}

export function weekLabel(key: string): string {
  const days = weekDays(key);
  const a = days[0];
  const b = days[6];
  const left = a.getMonth() === b.getMonth() ? `${a.getDate()}` : `${a.getDate()} ${MONTHS[a.getMonth()]}`;
  return `${left} – ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
}

export function dayKey(ts: number | Date): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function minuteOfDay(ts: number): number {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}

export function hm(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function parseHM(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function fmtDuration(sec: number, long = false): string {
  if (!isFinite(sec) || sec <= 0) return long ? '0 min' : '0:00';
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (long) {
    if (h) return `${h} h ${String(m).padStart(2, '0')} min`;
    if (m) return `${m} min`;
    return `${r} s`;
  }
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function fmtHours(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function fmtDayLong(ts: number): string {
  const d = new Date(ts);
  return `${DAY_NAMES[isoWeekday(d) - 1]} ${d.getDate()} de ${MONTHS_LONG[d.getMonth()]}`;
}

export function fmtDayShort(ts: number): string {
  const d = new Date(ts);
  return `${DAY_NAMES[isoWeekday(d) - 1].slice(0, 3)} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export function uid(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}
