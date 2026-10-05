// Lector de hojas de horarios (.ods de LibreOffice / .xlsx de Excel).
// Busca la fila de una persona bajo cada encabezado de días (Lunes…Domingo), lee entrada/salida
// por día (vacío = descanso), el almuerzo de la fila de abajo y deduce la fecha de cada semana.
// Solo se conserva la fila de la persona indicada.
import { strFromU8, unzipSync } from 'fflate';
import type { Shifts } from './types';
import { addDays, dayKey, isoWeekday } from './time';

interface Cell {
  text: string;
  minutes: number | null;
  num: number | null;
  date: Date | null;
}

interface Sheet {
  name: string;
  rows: Cell[][];
}

const EMPTY: Cell = { text: '', minutes: null, num: null, date: null };
const DAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const LABELS = /^(nombre|almuerzo|horas?|total|semana|bodega|turno|dia|fecha|domingos?)\b/;

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function textMinutes(t: string): number | null {
  const m = t.trim().match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(?:([ap])\.?\s*m\.?)?$/i);
  if (!m) return null;
  let h = +m[1];
  const mi = +m[2];
  if (m[3]?.toLowerCase() === 'p' && h < 12) h += 12;
  if (m[3]?.toLowerCase() === 'a' && h === 12) h = 0;
  return h * 60 + mi;
}

function isoDurationMinutes(v: string): number | null {
  const m = v.match(/PT(\d+)H(\d+)M(\d+(?:\.\d+)?)S/);
  return m ? +m[1] * 60 + +m[2] + Math.round(+m[3] / 60) : null;
}

// ---------------- ODS ----------------
function parseOds(xml: string): Sheet[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const sheets: Sheet[] = [];
  for (const t of Array.from(doc.getElementsByTagName('table:table'))) {
    const rows: Cell[][] = [];
    for (const r of Array.from(t.getElementsByTagName('table:table-row'))) {
      const cells: Cell[] = [];
      for (const c of Array.from(r.children)) {
        if (c.tagName !== 'table:table-cell' && c.tagName !== 'table:covered-table-cell') continue;
        const rep = Math.min(64, +(c.getAttribute('table:number-columns-repeated') ?? 1));
        const type = c.getAttribute('office:value-type');
        const text = Array.from(c.getElementsByTagName('text:p')).map((p) => p.textContent ?? '').join(' ').trim();
        const cell: Cell = { text, minutes: null, num: null, date: null };
        if (type === 'time') cell.minutes = isoDurationMinutes(c.getAttribute('office:time-value') ?? '');
        else if (type === 'float' || type === 'percentage' || type === 'currency') {
          cell.num = Number(c.getAttribute('office:value'));
          if (cell.num > 0 && cell.num < 1) cell.minutes = Math.round(cell.num * 1440);
        } else if (type === 'date') {
          const v = c.getAttribute('office:date-value') ?? '';
          const d = new Date(v.length <= 10 ? `${v}T12:00:00` : v);
          if (!isNaN(+d)) cell.date = d;
        }
        if (cell.minutes === null && text) cell.minutes = textMinutes(text);
        if (cell.num === null && /^\d{1,2}$/.test(text)) cell.num = +text;
        for (let k = 0; k < rep; k++) cells.push(cell);
      }
      const rep = +(r.getAttribute('table:number-rows-repeated') ?? 1);
      const hasContent = cells.some((c) => c.text || c.minutes !== null);
      for (let k = 0; k < Math.min(rep, hasContent ? 50 : 2); k++) rows.push(cells);
    }
    sheets.push({ name: t.getAttribute('table:name') ?? '', rows });
  }
  return sheets;
}

// ---------------- XLSX ----------------
function colIndex(ref: string) {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? 'A';
  return letters.split('').reduce((s, ch) => s * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

function parseXlsx(files: Record<string, Uint8Array>): Sheet[] {
  const xml = (p: string) => (files[p] ? new DOMParser().parseFromString(strFromU8(files[p]), 'application/xml') : null);
  const shared = Array.from(xml('xl/sharedStrings.xml')?.getElementsByTagName('si') ?? []).map((si) =>
    Array.from(si.getElementsByTagName('t')).map((t) => t.textContent ?? '').join(''),
  );
  const rels = new Map(
    Array.from(xml('xl/_rels/workbook.xml.rels')?.getElementsByTagName('Relationship') ?? []).map((r) => [r.getAttribute('Id'), r.getAttribute('Target') ?? '']),
  );
  const sheets: Sheet[] = [];
  for (const s of Array.from(xml('xl/workbook.xml')?.getElementsByTagName('sheet') ?? [])) {
    const rid = s.getAttribute('r:id');
    let target = rels.get(rid) ?? '';
    target = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    const doc = xml(target);
    if (!doc) continue;
    const rows: Cell[][] = [];
    for (const r of Array.from(doc.getElementsByTagName('row'))) {
      const ri = +(r.getAttribute('r') ?? rows.length + 1) - 1;
      const cells: Cell[] = [];
      for (const c of Array.from(r.getElementsByTagName('c'))) {
        const ci = colIndex(c.getAttribute('r') ?? 'A');
        const t = c.getAttribute('t');
        const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
        let cell: Cell = { ...EMPTY };
        if (t === 's') cell.text = shared[+v] ?? '';
        else if (t === 'inlineStr') cell.text = Array.from(c.getElementsByTagName('t')).map((x) => x.textContent ?? '').join('');
        else if (t === 'str') cell.text = v;
        else if (v !== '') {
          const n = Number(v);
          cell = { text: v, num: n, minutes: n > 0 && n < 1 ? Math.round((n % 1) * 1440) : null, date: null };
          if (n > 30000 && n < 60000) cell.date = new Date(Math.round((n - 25569) * 864e5) + 12 * 3600e3);
        }
        if (cell.minutes === null && cell.text) cell.minutes = textMinutes(cell.text);
        if (cell.num === null && /^\d{1,2}$/.test(cell.text)) cell.num = +cell.text;
        cells[ci] = cell;
      }
      rows[ri] = Array.from(cells, (c) => c ?? EMPTY);
    }
    sheets.push({ name: s.getAttribute('name') ?? '', rows: Array.from(rows, (r) => r ?? []) });
  }
  return sheets;
}

export async function readWorkbook(file: Blob): Promise<Sheet[]> {
  const z = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (f) => f.name === 'content.xml' || f.name.startsWith('xl/'),
  });
  if (z['content.xml']) return parseOds(strFromU8(z['content.xml']));
  if (z['xl/workbook.xml']) return parseXlsx(z);
  throw new Error('No es una hoja de cálculo .ods o .xlsx');
}

// ---------------- interpretación ----------------
export interface DayShift {
  d: number; // 0 = lunes
  start: string;
  end: string;
  off: boolean;
  lunch?: string;
}

export interface Block {
  sheet: string;
  monday: Date | null;
  label: string;
  days: DayShift[];
}

export interface SheetResult {
  blocks: Block[];
  people: string[];
  dated: number;
}

const hm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const at = (rows: Cell[][], r: number, c: number): Cell => rows[r]?.[c] ?? EMPTY;

function monthIn(s: string): number | null {
  const n = norm(s);
  const i = MONTHS.findIndex((m) => n.includes(m));
  return i >= 0 ? i : null;
}

/** Busca (año, mes) donde los números de día coinciden con los días de la semana del encabezado. */
function resolveMonday(nums: (number | null)[], monthHint: number | null, yearHint: number): Date | null {
  const first = nums.findIndex((x) => x !== null);
  if (first < 0) return null;
  const now = new Date();
  const years = [...new Set([yearHint, now.getFullYear(), now.getFullYear() - 1, now.getFullYear() + 1])];
  // solo meses plausibles: el indicado (o el anterior, por semanas que empiezan a fin de mes); sin pista, cerca de hoy
  const ref = monthHint ?? now.getMonth();
  const months = (monthHint !== null ? [ref, ref - 1] : [ref, ref - 1, ref + 1, ref - 2, ref + 2]).map((m) => (m + 12) % 12);
  for (const y of years) {
    for (const m of months) {
      const d = new Date(y, m, nums[first]!, 12);
      if (d.getMonth() !== m || isoWeekday(d) !== first + 1) continue;
      const monday = addDays(d, -first);
      // el resto de días debe coincidir (incluye cambio de mes dentro de la semana)
      const okAll = nums.every((x, i) => x === null || addDays(monday, i).getDate() === x);
      if (okAll) return monday;
    }
  }
  return null;
}

export function extractShifts(sheets: Sheet[], person: string, fileName = ''): SheetResult {
  const who = norm(person);
  const blocks: Block[] = [];
  const people = new Set<string>();
  const yearHint = Number(fileName.match(/20\d{2}/)?.[0] ?? new Date().getFullYear());

  for (const sh of sheets) {
    const rows = sh.rows;
    const headers: { r: number; cols: Map<number, number> }[] = [];
    rows.forEach((row, r) => {
      const cols = new Map<number, number>();
      row.forEach((c, ci) => {
        const t = norm(c.text);
        const d = DAYS.findIndex((x) => t === x || t.startsWith(x + ' ') || t === x.slice(0, 3));
        if (d >= 0 && !cols.has(d)) cols.set(d, ci);
      });
      if (cols.size >= 3) headers.push({ r, cols });
    });

    headers.forEach((h, hi) => {
      const end = Math.min(rows.length, headers[hi + 1]?.r ?? h.r + 80);
      const firstDayCol = Math.min(...h.cols.values());
      let personRow = -1;
      for (let r = h.r + 1; r < end; r++) {
        for (let c = 0; c < Math.max(1, firstDayCol); c++) {
          const t = norm(at(rows, r, c).text);
          if (!t || t.length < 3 || LABELS.test(t) || /\d/.test(t)) continue;
          people.add(at(rows, r, c).text.trim());
          if (who.length >= 3 && personRow < 0 && (t === who || t.split(/\s+/)[0] === who.split(/\s+/)[0])) personRow = r;
        }
      }
      if (personRow < 0) return;

      const days: DayShift[] = [];
      for (const [d, c] of h.cols) {
        const a = at(rows, personRow, c).minutes;
        const b = at(rows, personRow, c + 1).minutes;
        const ta = at(rows, personRow, c).text;
        const tb = at(rows, personRow, c + 1).text;
        let lunch: string | undefined;
        for (let r = personRow + 1; r <= personRow + 2 && r < end; r++) {
          // si la fila ya es de otra persona, el almuerzo no es nuestro
          const label = norm(at(rows, r, 0).text || at(rows, r, 1).text);
          if (label && !LABELS.test(label) && !/\d/.test(label)) break;
          const t = at(rows, r, c).text;
          if (/^\d{1,2}(:\d{2})?\s*[-–]\s*\d{1,2}(:\d{2})?$/.test(t.trim())) {
            lunch = t.trim();
            break;
          }
        }
        if (a !== null && b !== null && a >= 180 && a < 1440 && b > a && b <= 1440 + 180) {
          days.push({ d, start: hm(a), end: hm(b), off: false, lunch });
        } else if (!ta && !tb) days.push({ d, start: '', end: '', off: true });
        else if (/descans|libre|off|vacac/i.test(`${ta} ${tb}`)) days.push({ d, start: '', end: '', off: true });
      }

      // fecha: fila de números sobre los días, celdas con fecha, o un título "Semana del 16 al 20 de junio"
      const nums: (number | null)[] = Array(7).fill(null);
      let monday: Date | null = null;
      for (let r = Math.max(0, h.r - 3); r < h.r; r++) {
        for (const [d, c] of h.cols) {
          for (const cc of [c, c + 1]) {
            const cell = at(rows, r, cc);
            if (cell.date && !monday) monday = addDays(cell.date, -d);
            if (cell.num !== null && Number.isInteger(cell.num) && cell.num >= 1 && cell.num <= 31 && nums[d] === null) nums[d] = cell.num;
          }
        }
      }
      let monthHint = monthIn(sh.name);
      let label = sh.name;
      for (let r = Math.max(0, h.r - 4); r < h.r && !monday; r++) {
        for (const cell of rows[r] ?? []) {
          const m = norm(cell.text).match(/semana\s+del?\s+(\d{1,2})(?:\s+de\s+([a-z]+))?\s+al?\s+(\d{1,2})(?:\s+de\s+([a-z]+))?/);
          if (m) {
            label = cell.text.trim();
            const mA = monthIn(m[2] ?? '') ?? monthIn(m[4] ?? '') ?? monthHint;
            const mB = monthIn(m[4] ?? '') ?? mA;
            monthHint = mA ?? monthHint;
            // "Semana del 16 al 20 de junio": el 16 no tiene por qué ser lunes (festivos); se ubica por calendario
            if (mA !== null && mB !== null && !nums.some((x) => x !== null)) {
              for (const y of [...new Set([yearHint, new Date().getFullYear()])]) {
                const dA = new Date(y, mA, +m[1], 12);
                const dB = new Date(mB < mA ? y + 1 : y, mB, +m[3], 12);
                const span = (dB.getTime() - dA.getTime()) / 864e5;
                const wA = isoWeekday(dA) - 1;
                const wB = isoWeekday(dB) - 1;
                if (span >= 0 && span < 7 && wB >= wA && h.cols.has(wA) && h.cols.has(wB)) {
                  monday = addDays(dA, -wA);
                  break;
                }
              }
            }
          }
          if (monthHint === null && cell.text) monthHint = monthIn(cell.text);
        }
      }
      if (!monday) monday = resolveMonday(nums, monthHint, yearHint);
      // una semana sin ningún día de trabajo (p. ej. hojas de dominicales) no es tu horario semanal
      if (days.some((d) => !d.off)) blocks.push({ sheet: sh.name, monday, label, days });
    });
  }
  return { blocks, people: [...people], dated: blocks.filter((b) => b.monday).length };
}

export function blocksToShifts(blocks: Block[], undatedMonday?: Date): Shifts {
  const out: Shifts = {};
  for (const b of blocks) {
    const monday = b.monday ?? undatedMonday;
    if (!monday) continue;
    for (const d of b.days) {
      out[dayKey(addDays(monday, d.d))] = { start: d.start, end: d.end, off: d.off, lunch: d.lunch, src: 'hoja' };
    }
  }
  return out;
}
