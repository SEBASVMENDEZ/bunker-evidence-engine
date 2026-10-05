import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FileSpreadsheet, RefreshCw, X, Coffee, Copy, Moon, Check, Link2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useStore } from '../store';
import type { Shift } from '../lib/types';
import { addDays, DAY_NAMES, DAY_SHORT, dayKey, shiftWeek, weekDays, weekKey, weekLabel, weekNumber } from '../lib/time';
import { sound } from '../lib/sound';

// Turnos que aparecen en tu hoja; se reordenan según los que más usas.
const DEFAULT_SHIFTS: [string, string, string?][] = [
  ['10:00', '19:00', '12-1'],
  ['11:00', '20:00', '2-3'],
  ['13:00', '20:00'],
  ['14:00', '20:30'],
  ['10:00', '18:30', '12-1'],
  ['13:00', '19:00'],
];

export function shiftLabel(s?: Shift) {
  if (!s) return '—';
  if (s.off) return 'Descanso';
  return `${s.start}–${s.end}`;
}

function useFrequentShifts() {
  const shifts = useStore((s) => s.shifts);
  return useMemo(() => {
    const count = new Map<string, { n: number; s: [string, string, string?] }>();
    for (const s of Object.values(shifts)) {
      if (s.off || !s.start) continue;
      const k = `${s.start}|${s.end}`;
      const cur = count.get(k) ?? { n: 0, s: [s.start, s.end, s.lunch] as [string, string, string?] };
      cur.n++;
      count.set(k, cur);
    }
    for (const d of DEFAULT_SHIFTS) {
      const k = `${d[0]}|${d[1]}`;
      if (!count.has(k)) count.set(k, { n: 0, s: d });
    }
    return [...count.values()].sort((a, b) => b.n - a.n).slice(0, 8).map((x) => x.s);
  }, [shifts]);
}

/** Los 7 días de una semana; un toque por día. */
export function TurnosWeek({ week, compact = false }: { week: string; compact?: boolean }) {
  const shifts = useStore((s) => s.shifts);
  const setShift = useStore((s) => s.setShift);
  const frequent = useFrequentShifts();
  const [open, setOpen] = useState<string | null>(null);
  const [custom, setCustom] = useState({ start: '10:00', end: '19:00', lunch: '' });
  const days = weekDays(week);
  const today = dayKey(Date.now());

  const pick = (day: string, s: Shift | null) => {
    sound.play('pop');
    setShift(day, s);
    setOpen(null);
  };

  const copyPrev = () => {
    const prev = weekDays(shiftWeek(week, -1));
    prev.forEach((d, i) => {
      const s = shifts[dayKey(d)];
      if (s) setShift(dayKey(days[i]), { ...s, src: 'manual' });
    });
    sound.play('pop');
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 6 }}>
        {days.map((d, i) => {
          const k = dayKey(d);
          const s = shifts[k];
          const isOpen = open === k;
          return (
            <button
              key={k}
              onClick={() => setOpen(isOpen ? null : k)}
              style={{
                borderRadius: 14,
                padding: compact ? '8px 4px' : '10px 4px',
                textAlign: 'center',
                background: isOpen ? 'rgba(109,139,255,.18)' : s?.off ? 'rgba(251,113,133,.08)' : s ? 'rgba(52,211,153,.07)' : 'rgba(255,255,255,.03)',
                border: `1px solid ${isOpen ? 'rgba(109,139,255,.6)' : k === today ? 'rgba(109,139,255,.4)' : 'var(--stroke)'}`,
              }}
            >
              <div className="tiny" style={{ fontWeight: 700, color: k === today ? 'var(--text)' : 'var(--muted)' }}>
                {DAY_SHORT[i]} {d.getDate()}
              </div>
              {s?.off ? (
                <div className="small" style={{ fontWeight: 650, color: '#FDA4AF', marginTop: 4 }}>Descanso</div>
              ) : s ? (
                <div style={{ marginTop: 4, lineHeight: 1.15 }}>
                  <div className="small mono" style={{ fontWeight: 700 }}>{s.start}</div>
                  <div className="tiny mono muted">{s.end}</div>
                </div>
              ) : (
                <div className="small faint" style={{ marginTop: 4 }}>+</div>
              )}
              {!compact && s && <div className="tiny faint" style={{ marginTop: 2 }}>{s.src === 'hoja' ? 'hoja' : s.src === 'demo' ? 'demo' : 'manual'}</div>}
            </button>
          );
        })}
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ marginTop: 10, padding: 12, borderRadius: 16, background: 'rgba(255,255,255,.03)', border: '1px solid var(--stroke)' }}>
              <div className="small" style={{ fontWeight: 650, marginBottom: 8 }}>
                {DAY_NAMES[(new Date(open + 'T12:00').getDay() + 6) % 7]} {new Date(open + 'T12:00').getDate()}
              </div>
              <div className="row wrap" style={{ gap: 6 }}>
                {frequent.map(([a, b, l]) => (
                  <button key={`${a}${b}`} className="chip" onClick={() => pick(open, { start: a, end: b, lunch: l, off: false, src: 'manual' })}>
                    <span className="mono">{a}–{b}</span>
                    {l && <span className="tiny muted"><Coffee size={11} style={{ verticalAlign: -1 }} /> {l}</span>}
                  </button>
                ))}
                <button className="chip" style={{ ['--c' as string]: '#FB7185' }} onClick={() => pick(open, { start: '', end: '', off: true, src: 'manual' })}>
                  <Moon size={13} /> Descanso
                </button>
                {shifts[open] && (
                  <button className="chip" onClick={() => pick(open, null)}>
                    <X size={13} /> Quitar
                  </button>
                )}
              </div>
              <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
                <span className="tiny muted">Otro:</span>
                <input type="time" className="input" style={{ width: 130, padding: '6px 10px' }} value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} />
                <span className="muted">→</span>
                <input type="time" className="input" style={{ width: 130, padding: '6px 10px' }} value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} />
                <input className="input" style={{ width: 110, padding: '6px 10px' }} placeholder="Almuerzo 2-3" value={custom.lunch} onChange={(e) => setCustom({ ...custom, lunch: e.target.value })} />
                <button className="btn sm" onClick={() => pick(open, { start: custom.start, end: custom.end, lunch: custom.lunch || undefined, off: false, src: 'manual' })}>
                  <Check size={14} /> Guardar
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!compact && (
        <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={copyPrev}>
          <Copy size={14} /> Copiar la semana anterior
        </button>
      )}
    </div>
  );
}

/** Vincular la hoja de horarios (.ods / .xlsx) y elegir tu nombre en ella. */
export function SheetPanel() {
  const sheet = useStore((s) => s.sheet);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const linkSheet = useStore((s) => s.linkSheet);
  const importSheetFile = useStore((s) => s.importSheetFile);
  const readSheet = useStore((s) => s.readSheet);
  const unlinkSheet = useStore((s) => s.unlinkSheet);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastFile = useRef<File | null>(null);
  const canLink = 'showOpenFilePicker' in window;
  const person = settings.scheduleName || settings.userName;

  const choose = () => {
    if (canLink) linkSheet();
    else fileRef.current?.click();
  };

  const setPerson = async (name: string) => {
    setSettings({ scheduleName: name });
    sound.play('pop');
    // releer con el nombre elegido
    if (sheet?.handle) await readSheet(true);
    else if (lastFile.current) await importSheetFile(lastFile.current);
  };

  return (
    <div className="col" style={{ gap: 10 }}>
      <input
        ref={fileRef}
        type="file"
        accept=".ods,.xlsx,application/vnd.oasis.opendocument.spreadsheet,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            lastFile.current = f;
            importSheetFile(f);
          }
          e.target.value = '';
        }}
      />
      {sheet ? (
        <div className="row" style={{ gap: 10, padding: 12, borderRadius: 14, background: 'rgba(52,211,153,.06)', border: '1px solid rgba(52,211,153,.25)' }}>
          <FileSpreadsheet size={22} color="var(--ok)" />
          <div className="grow">
            <div className="small" style={{ fontWeight: 650 }}>{sheet.name}</div>
            <div className="tiny muted">
              {sheet.error ? 'No encontré tu fila todavía' : `${sheet.weeks} ${sheet.weeks === 1 ? 'semana leída' : 'semanas leídas'}`}
              {sheet.lastRead ? ` · ${new Date(sheet.lastRead).toLocaleString('es', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
              {sheet.handle ? ' · se actualiza sola al abrir Búnker' : ''}
            </div>
          </div>
          {sheet.handle && (
            <button className="btn sm" onClick={() => readSheet(true)} title="Leer de nuevo">
              <RefreshCw size={14} />
            </button>
          )}
          <button className="btn sm ghost" onClick={unlinkSheet} title="Desvincular">
            <X size={14} />
          </button>
        </div>
      ) : (
        <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={choose}>
          <Link2 size={16} /> Vincular mi hoja de horarios (.ods / .xlsx)
        </button>
      )}
      <div className="field">
        <label>Tu nombre tal como aparece en la hoja</label>
        <input className="input" defaultValue={person} key={person} placeholder="Ej.: Sebastian" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== person && setPerson(e.target.value.trim())} />
      </div>
      {sheet?.error && (sheet.people?.length ?? 0) > 0 && (
        <div>
          <div className="small" style={{ marginBottom: 6 }}>¿Cuál eres tú?</div>
          <div className="row wrap" style={{ gap: 6 }}>
            {sheet.people!.slice(0, 20).map((p) => (
              <button key={p} className="chip" onClick={() => setPerson(p)}>{p}</button>
            ))}
          </div>
        </div>
      )}
      {sheet && !sheet.handle && (
        <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={choose}>
          <FileSpreadsheet size={14} /> Cargar una versión nueva de la hoja
        </button>
      )}
      <p className="tiny faint">Solo se lee tu fila: entrada, salida, almuerzo y días de descanso. Nada sale de este dispositivo.</p>
    </div>
  );
}

/** Ventana de turnos: semana actual / siguiente + hoja vinculada. */
export function TurnosModal() {
  const close = () => useStore.getState().setTurnos(false);
  const [week, setWeek] = useState(weekKey(Date.now()));
  const current = weekKey(Date.now());
  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} style={{ zIndex: 95 }}>
      <motion.div className="modal" style={{ width: 'min(720px,100%)', padding: 24 }} initial={{ y: 24, scale: 0.97 }} animate={{ y: 0, scale: 1 }} onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <div>
            <div className="eyebrow">Turnos</div>
            <h2 style={{ fontSize: 24 }}>Tu semana de trabajo</h2>
          </div>
          <button className="btn icon" onClick={close} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <p className="muted small" style={{ margin: '6px 0 16px' }}>
          Con tus turnos, Búnker entiende qué grabaste antes, durante o después del trabajo, y compara tus días según el tipo de turno.
        </p>
        <div className="row between" style={{ marginBottom: 10 }}>
          <button className="btn icon sm" onClick={() => setWeek(shiftWeek(week, -1))} aria-label="Semana anterior">
            <ChevronLeft size={16} />
          </button>
          <div style={{ textAlign: 'center' }}>
            <b>Semana {weekNumber(week)}{week === current ? ' · actual' : week === shiftWeek(current, 1) ? ' · próxima' : ''}</b>
            <div className="tiny muted">{weekLabel(week)}</div>
          </div>
          <button className="btn icon sm" onClick={() => setWeek(shiftWeek(week, 1))} aria-label="Semana siguiente">
            <ChevronRight size={16} />
          </button>
        </div>
        <TurnosWeek week={week} />
        <div className="sep" />
        <SheetPanel />
      </motion.div>
    </motion.div>
  );
}

export function todayShift(shifts: Record<string, Shift>, d = new Date()) {
  return shifts[dayKey(d)];
}

export function tomorrowKey() {
  return dayKey(addDays(new Date(), 1));
}
