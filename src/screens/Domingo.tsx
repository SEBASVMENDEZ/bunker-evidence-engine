import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Play, Check, Lock, Film, Sparkles, Clock, CalendarCheck, Layers, Stamp, TriangleAlert } from 'lucide-react';
import { useStore } from '../store';
import { AreaIcon, Counter, Section, Sparkline, Glyph, Empty } from '../components/ui';
import { computeWeek, history, insights, shiftStats, trend } from '../lib/insights';
import { shiftType, type ShiftType } from '../lib/classify';
import { TurnosWeek } from '../components/Turnos';
import { buildFilm } from '../lib/film/edl';
import { TAG } from '../lib/film/draw';
import { DECISIONS, WEEKLY_QUESTIONS } from '../lib/content';
import { DAY_SHORT, dayKey, fmtDuration, shiftWeek, weekDays, weekKey, weekLabel, weekNumber } from '../lib/time';
import { sound } from '../lib/sound';
import type { Decision } from '../lib/types';

export default function Domingo() {
  const clips = useStore((s) => s.clips);
  const areas = useStore((s) => s.areas);
  const reviews = useStore((s) => s.reviews);
  const shifts = useStore((s) => s.shifts);
  const settings = useStore((s) => s.settings);
  const week = useStore((s) => s.reviewWeek);
  const setWeek = useStore((s) => s.setReviewWeek);
  const openFilm = useStore((s) => s.openFilm);
  const openClip = useStore((s) => s.openClip);
  const setSettings = useStore((s) => s.setSettings);
  const saveReview = useStore((s) => s.saveReview);
  const go = useStore((s) => s.go);
  const [sealing, setSealing] = useState(false);

  const current = weekKey(Date.now());
  const review = reviews[week];
  const prevReview = reviews[shiftWeek(week, -1)];
  const active = useMemo(() => areas.filter((a) => a.active).sort((a, b) => a.order - b.order), [areas]);
  const stats = useMemo(() => computeWeek(clips, areas, week), [clips, areas, week]);
  const past = useMemo(() => history(clips, areas, week, 4), [clips, areas, week]);
  const prev = past[0];
  const statements = useMemo(() => insights(stats, past, areas, clips, shifts), [stats, past, areas, clips, shifts]);
  const tr = useMemo(() => trend(clips, areas, week, 8), [clips, areas, week]);
  const film = useMemo(
    () =>
      buildFilm({
        week, clips: stats.clips, areas, stats, prevStats: prev, statements, review, prevReview,
        minutes: settings.filmMinutes, grouping: settings.filmGrouping, shifts,
      }),
    [week, stats, areas, prev, statements, review, prevReview, settings.filmMinutes, settings.filmGrouping, shifts],
  );
  const sessions = Object.values(stats.areas).reduce((s, a) => s + a.sessions, 0);
  const prevSessions = prev ? Object.values(prev.areas).reduce((s, a) => s + a.sessions, 0) : 0;
  const question = statements.find((s) => s.type === 'pregunta')?.text;
  const answered = WEEKLY_QUESTIONS.filter((q) => review?.answers?.[q.id]?.trim()).length;

  const steps = [
    { label: 'Evidencia', done: stats.total > 0 },
    { label: 'Procesada', done: stats.total > 0 && stats.pending === 0 },
    { label: 'Película', done: !!review?.watchedAt },
    { label: 'Revisada', done: answered >= 3 },
    { label: 'Sellada', done: !!review?.sealedAt },
  ];

  const seal = () => {
    if (!review?.priority?.trim()) {
      useStore.getState().toast('Define la prioridad de la siguiente semana antes de sellar.', 'info');
      document.getElementById('decision')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    saveReview(week, { sealedAt: Date.now() });
    setSealing(true);
    sound.play('seal');
    sound.vibrate([20, 40, 60]);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Revisión semanal</div>
          <h1 className="title">Domingo: una sola pieza que importa.</h1>
          <p className="subtitle">La película, métricas honestas y una observación útil para decidir la siguiente mejora.</p>
        </div>
        <div className="row">
          <button className="btn icon sm" onClick={() => setWeek(shiftWeek(week, -1))} aria-label="Semana anterior">
            <ChevronLeft size={16} />
          </button>
          <div style={{ textAlign: 'center', minWidth: 170 }}>
            <div style={{ fontFamily: 'var(--font-d)', fontWeight: 700 }}>Semana {weekNumber(week)}</div>
            <div className="tiny muted">{weekLabel(week)}</div>
          </div>
          <button className="btn icon sm" onClick={() => setWeek(shiftWeek(week, 1))} disabled={week === current} aria-label="Semana siguiente">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* estado del proceso */}
      <div className="row wrap" style={{ gap: 6, marginBottom: 18 }}>
        {steps.map((s, i) => (
          <div key={s.label} className="row" style={{ gap: 6 }}>
            <span className={`chip${s.done ? ' on' : ''}`} style={{ ['--c' as string]: '#34D399', pointerEvents: 'none' }}>
              <span style={{ width: 18, height: 18, borderRadius: 9, display: 'grid', placeItems: 'center', background: s.done ? 'var(--ok)' : 'rgba(255,255,255,.08)', color: '#04210f' }}>
                {s.done ? <Check size={12} strokeWidth={3} /> : <span className="tiny muted">{i + 1}</span>}
              </span>
              {s.label}
            </span>
            {i < steps.length - 1 && <span className="faint">→</span>}
          </div>
        ))}
      </div>

      {stats.total === 0 ? (
        <div className="card">
          <Empty icon={<Film />} title="Esta semana no tiene evidencia" text="Cuando grabes o sincronices tus videos, aquí aparecerá la película y las métricas." action={<button className="btn primary" onClick={() => go('evidencia')}>Ir a Evidencia</button>} />
        </div>
      ) : (
        <div className="grid" style={{ gap: 18 }}>
          {/* PELÍCULA */}
          <motion.section className="card" style={{ padding: 0, overflow: 'hidden' }} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)' }} className="film-hero">
              <button onClick={() => { sound.play('tap'); openFilm(week); }} style={{ position: 'relative', minHeight: 340, overflow: 'hidden', textAlign: 'left' }}>
                <Poster clips={stats.clips} areas={areas} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgba(5,7,13,.95), rgba(5,7,13,.2) 60%), linear-gradient(90deg, rgba(5,7,13,.6), transparent)' }} />
                <div style={{ position: 'absolute', left: 26, bottom: 24, right: 26 }}>
                  <div className="eyebrow" style={{ color: '#AFC0FF' }}>Película semanal · {fmtDuration(film.duration)}</div>
                  <h2 style={{ fontSize: 'clamp(26px,3vw,38px)', marginTop: 6 }}>Semana {weekNumber(week)}</h2>
                  <p className="muted small" style={{ marginTop: 4 }}>
                    {film.clipCount} evidencias · {fmtDuration(film.sourceSeconds, true)} de grabación condensados sin editar nada.
                  </p>
                </div>
                <motion.div
                  whileHover={{ scale: 1.08 }}
                  style={{ position: 'absolute', top: '42%', left: '50%', translate: '-50% -50%', width: 84, height: 84, borderRadius: 99, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.95)', color: '#05070d', boxShadow: '0 20px 60px -10px rgba(109,139,255,.8)' }}
                >
                  <Play size={30} fill="currentColor" style={{ marginLeft: 4 }} />
                </motion.div>
              </button>
              <div style={{ padding: 22, borderLeft: '1px solid var(--stroke)' }} className="col">
                <div className="card-title" style={{ marginBottom: 4 }}>
                  <h3>Capítulos</h3>
                  <span className="tiny muted">{film.chapters.length}</span>
                </div>
                <div className="col" style={{ gap: 4, maxHeight: 210, overflow: 'auto' }}>
                  {film.chapters.map((c, i) => (
                    <div key={i} className="row" style={{ padding: '6px 4px', gap: 10 }}>
                      <span style={{ width: 26, height: 26, borderRadius: 8, display: 'grid', placeItems: 'center', background: `${c.color}22` }}>
                        <Glyph icon={c.icon} size={15} color={c.color} />
                      </span>
                      <span className="small grow">{c.title}</span>
                      <span className="tiny mono muted">{fmtDuration(c.dur)}</span>
                    </div>
                  ))}
                </div>
                <div className="sep" style={{ margin: '8px 0' }} />
                <div className="field">
                  <label className="row between">
                    <span>Duración objetivo</span>
                    <span className="mono muted">{settings.filmMinutes} min</span>
                  </label>
                  <input type="range" min={3} max={20} value={settings.filmMinutes} onChange={(e) => setSettings({ filmMinutes: +e.target.value })} />
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button className={`chip${settings.filmGrouping === 'area' ? ' on' : ''}`} onClick={() => setSettings({ filmGrouping: 'area' })}>
                    <Layers size={14} /> Por área
                  </button>
                  <button className={`chip${settings.filmGrouping === 'dia' ? ' on' : ''}`} onClick={() => setSettings({ filmGrouping: 'dia' })}>
                    <CalendarCheck size={14} /> Por día
                  </button>
                </div>
              </div>
            </div>
          </motion.section>

          {/* KPIs */}
          <div className="grid g-4">
            <Kpi label="Evidencias" value={stats.total} delta={prev?.total ? stats.total - prev.total : null} />
            <Kpi label="Sesiones" value={sessions} delta={prev?.total ? sessions - prevSessions : null} />
            <Kpi label="Días activos" value={stats.activeDays} suffix="/7" delta={prev?.total ? stats.activeDays - prev.activeDays : null} />
            <Kpi label="Tiempo" text={fmtDuration(stats.seconds, true)} delta={null} sub={stats.dailyAreas.length > 1 ? `Rutina completa: ${stats.fullDays} días` : undefined} />
          </div>

          <div className="grid g-2">
            {/* MATRIZ */}
            <Section eyebrow="Matriz de evidencia" title="Áreas × días" right={<span className="tiny muted">Toca una celda para ver el clip</span>}>
              <div style={{ display: 'grid', gridTemplateColumns: `110px repeat(7, minmax(0,1fr))`, gap: 6, alignItems: 'center' }}>
                <span />
                {DAY_SHORT.map((d) => (
                  <span key={d} className="tiny muted" style={{ textAlign: 'center', fontWeight: 700 }}>{d}</span>
                ))}
                {active.map((a, r) => (
                  <MatrixRow key={a.id} area={a} row={r} cells={Array.from({ length: 7 }, (_, i) => stats.clips.filter((c) => c.areaId === a.id && new Date(c.takenAt).getDay() === (i + 1) % 7))} onOpen={openClip} />
                ))}
              </div>
              {stats.unassigned > 0 && (
                <p className="tiny" style={{ marginTop: 12, color: 'var(--warn)' }}>
                  <TriangleAlert size={12} style={{ verticalAlign: -2 }} /> {stats.unassigned} evidencias sin área.{' '}
                  <button className="tiny" style={{ textDecoration: 'underline', color: 'inherit' }} onClick={() => go('evidencia')}>Clasificar</button>
                </p>
              )}
            </Section>

            {/* TENDENCIA */}
            <Section eyebrow="Comparación y tendencia" title="Sesiones por área · 8 semanas">
              <div className="col" style={{ gap: 10 }}>
                {active.map((a) => {
                  const cur = stats.areas[a.id]?.sessions ?? 0;
                  const p = prev?.areas[a.id]?.sessions ?? 0;
                  const d = cur - p;
                  const pct = a.targetPerWeek ? Math.min(1, cur / a.targetPerWeek) : 0;
                  return (
                    <div key={a.id} className="row" style={{ gap: 12 }}>
                      <AreaIcon area={a} size={30} />
                      <div className="grow">
                        <div className="row between small">
                          <span style={{ fontWeight: 600 }}>{a.name}</span>
                          <span className="mono">
                            {cur}
                            <span className="muted">/{a.targetPerWeek}</span>
                            {prev?.total ? <span className={d > 0 ? 'up' : d < 0 ? 'down' : 'muted'} style={{ marginLeft: 8, fontSize: 12 }}>{d > 0 ? `+${d}` : d === 0 ? '=' : d}</span> : null}
                          </span>
                        </div>
                        <div style={{ height: 5, borderRadius: 5, background: 'rgba(255,255,255,.07)', marginTop: 5, overflow: 'hidden' }}>
                          <motion.div initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} style={{ height: '100%', background: a.color, borderRadius: 5 }} />
                        </div>
                      </div>
                      <Sparkline values={tr.map((t) => t.byArea[a.id] ?? 0)} color={a.color} w={90} h={30} />
                    </div>
                  );
                })}
              </div>
            </Section>
          </div>

          {/* INSIGHT */}
          <Section eyebrow="Insight Engine" title="Hechos primero. Inferencias, con cuidado." right={<Sparkles size={18} color="var(--warn)" />}>
            <div className="col" style={{ gap: 10 }}>
              {statements.map((s, i) => (
                <motion.div key={i} className="row" style={{ alignItems: 'flex-start', gap: 12 }} initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}>
                  <span className="badge" style={{ ['--c' as string]: TAG[s.type].color, minWidth: 104, justifyContent: 'center', marginTop: 1 }}>{TAG[s.type].label}</span>
                  <span style={{ color: s.type === 'sin-datos' ? 'var(--muted)' : s.type === 'inferencia' ? 'var(--text-2)' : 'var(--text)', fontStyle: s.type === 'inferencia' ? 'italic' : 'normal' }}>{s.text}</span>
                </motion.div>
              ))}
            </div>
            <p className="tiny faint" style={{ marginTop: 14 }}>Búnker nunca fabrica métricas psicológicas ni presenta una inferencia como hecho.</p>
          </Section>

          {/* REVISIÓN */}
          <section id="revision" className="card">
            <div className="card-title">
              <div>
                <div className="eyebrow">Revisión · Proyecto Maestro</div>
                <h3>Ocho preguntas. Responde las que tengan algo que decir.</h3>
              </div>
              <span className="badge" style={{ ['--c' as string]: answered >= 3 ? '#34D399' : '#6D8BFF' }}>{answered}/8</span>
            </div>
            {prevReview?.experiment && (
              <div className="card" style={{ background: 'rgba(245,185,74,.06)', borderColor: 'rgba(245,185,74,.25)', marginBottom: 16, padding: 16 }}>
                <div className="eyebrow" style={{ color: '#F5D08A' }}>Experimento de la semana</div>
                <p style={{ fontFamily: 'var(--font-d)', fontSize: 18, fontWeight: 600, margin: '4px 0 10px' }}>“{prevReview.experiment}”</p>
                <div className="row wrap" style={{ gap: 6 }}>
                  <span className="small muted">¿Lo ejecutaste?</span>
                  {(['si', 'parcial', 'no'] as const).map((r) => (
                    <button key={r} className={`chip${review?.experimentResult === r ? ' on' : ''}`} style={{ ['--c' as string]: r === 'si' ? '#34D399' : r === 'parcial' ? '#F5B94A' : '#FB7185' }} onClick={() => { sound.play('tap'); saveReview(week, { experimentResult: r }); }}>
                      {r === 'si' ? 'Sí' : r === 'parcial' ? 'Parcialmente' : 'No'}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {question && (
              <div className="row" style={{ gap: 10, padding: '12px 14px', borderRadius: 14, background: 'rgba(192,132,252,.08)', border: '1px solid rgba(192,132,252,.25)', marginBottom: 16 }}>
                <span className="badge" style={{ ['--c' as string]: '#C084FC' }}>PREGUNTA DE LA SEMANA</span>
                <span>{question}</span>
              </div>
            )}
            <div className="grid g-2" style={{ gap: 14 }}>
              {WEEKLY_QUESTIONS.map((q, i) => (
                <div key={q.id + week} className="field">
                  <label>
                    <span className="faint mono">{String(i + 1).padStart(2, '0')}</span> {q.q}
                  </label>
                  <textarea
                    className="textarea"
                    rows={2}
                    defaultValue={review?.answers?.[q.id] ?? ''}
                    onBlur={(e) => saveReview(week, { answers: { ...(useStore.getState().reviews[week]?.answers ?? {}), [q.id]: e.target.value } })}
                  />
                </div>
              ))}
            </div>
          </section>

          <NextWeekPlan week={week} />

          {/* DECISIÓN */}
          <section id="decision" className="card">
            <div className="card-title">
              <div>
                <div className="eyebrow">Decisión</div>
                <h3>¿Qué haces con lo que viste?</h3>
              </div>
            </div>
            <div className="grid g-4" style={{ gap: 10 }}>
              {DECISIONS.map((d) => {
                const on = review?.decision === d.id;
                return (
                  <motion.button
                    key={d.id}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => { sound.play('pop'); saveReview(week, { decision: d.id as Decision }); }}
                    className="card"
                    style={{ textAlign: 'left', padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', borderColor: on ? 'rgba(109,139,255,.6)' : undefined, background: on ? 'rgba(109,139,255,.12)' : undefined }}
                  >
                    <div className="row between">
                      <b>{d.name}</b>
                      {on && <Check size={16} color="var(--accent)" />}
                    </div>
                    <p className="tiny muted" style={{ marginTop: 6 }}>{d.desc}</p>
                  </motion.button>
                );
              })}
            </div>
            <div className="grid g-2" style={{ marginTop: 16, gap: 14 }}>
              <div className="field">
                <label>Prioridad de la siguiente semana</label>
                <input key={`p${week}`} className="input" defaultValue={review?.priority ?? ''} placeholder="Ej.: mantener físico y recuperar la lectura" onBlur={(e) => saveReview(week, { priority: e.target.value })} />
              </div>
              <div className="field">
                <label>Experimento: una sola variable que cambiarás</label>
                <input key={`e${week}`} className="input" defaultValue={review?.experiment ?? ''} placeholder="Ej.: dejar la ropa de entrenar lista la noche anterior" onBlur={(e) => saveReview(week, { experiment: e.target.value })} />
              </div>
            </div>
            <p className="tiny faint" style={{ marginTop: 10 }}>
              No cambies de vehículo ante el primer fracaso, ni lo mantengas solo por orgullo. El criterio es la evidencia acumulada y la alineación con tu dirección.
            </p>
            <div className="row wrap between" style={{ marginTop: 20 }}>
              <span className="small muted row" style={{ gap: 6 }}>
                <Clock size={14} /> {review?.sealedAt ? `Sellada el ${new Date(review.sealedAt).toLocaleString('es', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}` : 'Al sellar, la prioridad y el experimento te acompañan toda la semana.'}
              </span>
              <button className={`btn lg${review?.sealedAt ? '' : ' primary'}`} onClick={seal}>
                {review?.sealedAt ? <Lock size={18} /> : <Stamp size={18} />} {review?.sealedAt ? 'Semana sellada' : 'Sellar la semana'}
              </button>
            </div>
          </section>

          <History />
        </div>
      )}

      <AnimatePresence>{sealing && <SealCeremony week={week} priority={review?.priority} experiment={review?.experiment} onClose={() => setSealing(false)} />}</AnimatePresence>
      <style>{`@media (max-width: 860px){ .film-hero{ grid-template-columns: 1fr !important } .film-hero > div { border-left: 0 !important; border-top: 1px solid var(--stroke) } }`}</style>
    </div>
  );
}

function Kpi({ label, value, text, suffix, delta, sub }: { label: string; value?: number; text?: string; suffix?: string; delta: number | null; sub?: string }) {
  return (
    <motion.div className="card kpi" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="k">{label}</div>
      <div className="v">
        {text ?? <Counter value={value ?? 0} />}
        {suffix && <span className="muted" style={{ fontSize: '0.55em' }}>{suffix}</span>}
      </div>
      {delta !== null && delta !== undefined ? (
        <div className={`d ${delta > 0 ? 'up' : delta < 0 ? 'down' : 'muted'}`}>{delta > 0 ? `▲ ${delta}` : delta < 0 ? `▼ ${Math.abs(delta)}` : '= igual'} vs. semana anterior</div>
      ) : (
        <div className="d muted">{sub ?? '—'}</div>
      )}
    </motion.div>
  );
}

function MatrixRow({ area, cells, onOpen, row }: { area: ReturnType<typeof useStore.getState>['areas'][number]; cells: ReturnType<typeof useStore.getState>['clips'][]; onOpen: (id: string) => void; row: number }) {
  return (
    <>
      <div className="row small" style={{ gap: 8, fontWeight: 600, minWidth: 0 }}>
        <AreaIcon area={area} size={22} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{area.name}</span>
      </div>
      {cells.map((list, i) => {
        const c = list[0];
        return (
          <motion.button
            key={i}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: (row * 7 + i) * 0.012 }}
            onClick={() => c && onOpen(c.id)}
            title={list.length ? `${list.length} evidencia(s)` : 'Sin evidencia'}
            style={{
              aspectRatio: '1', borderRadius: 9, position: 'relative', overflow: 'hidden',
              background: c ? area.color : 'rgba(255,255,255,.04)',
              boxShadow: c ? `0 0 14px -4px ${area.color}` : undefined,
              cursor: c ? 'pointer' : 'default',
              border: c ? '1px solid rgba(255,255,255,.25)' : '1px dashed rgba(255,255,255,.08)',
            }}
          >
            {c?.thumb && <img src={c.thumb} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55, mixBlendMode: 'luminosity' }} />}
            {list.length > 1 && <span style={{ position: 'absolute', right: 3, bottom: 1, fontSize: 10, fontWeight: 800, color: '#fff', textShadow: '0 1px 3px #000' }}>{list.length}</span>}
          </motion.button>
        );
      })}
    </>
  );
}

function Poster({ clips, areas }: { clips: ReturnType<typeof useStore.getState>['clips']; areas: ReturnType<typeof useStore.getState>['areas'] }) {
  const list = clips.filter((c) => c.thumb).slice(0, 16);
  return (
    <div style={{ position: 'absolute', inset: '-6%', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, transform: 'rotate(-4deg) scale(1.05)' }}>
      {list.map((c, i) => (
        <motion.div
          key={c.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, scale: [1, 1.06, 1] }}
          transition={{ delay: i * 0.04, scale: { duration: 12 + (i % 5), repeat: Infinity } }}
          style={{ aspectRatio: '16/10', borderRadius: 10, overflow: 'hidden', borderBottom: `3px solid ${areas.find((a) => a.id === c.areaId)?.color ?? '#555'}` }}
        >
          <img src={c.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </motion.div>
      ))}
    </div>
  );
}

function History() {
  const reviews = useStore((s) => s.reviews);
  const setWeek = useStore((s) => s.setReviewWeek);
  const sealed = Object.values(reviews).filter((r) => r.sealedAt).sort((a, b) => b.week.localeCompare(a.week)).slice(0, 12);
  if (!sealed.length) return null;
  return (
    <Section eyebrow="Memoria" title="Semanas selladas">
      <div className="col" style={{ gap: 8 }}>
        {sealed.map((r) => (
          <button key={r.week} className="row" style={{ padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,.025)', border: '1px solid var(--stroke)', textAlign: 'left', gap: 14 }} onClick={() => { setWeek(r.week); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
            <span style={{ fontFamily: 'var(--font-d)', fontWeight: 700, width: 48 }}>S{weekNumber(r.week)}</span>
            <span className="grow small">
              <b>{r.priority || '—'}</b>
              {r.experiment && <span className="muted"> · Experimento: {r.experiment}</span>}
            </span>
            {r.experimentResult && (
              <span className="badge" style={{ ['--c' as string]: r.experimentResult === 'si' ? '#34D399' : r.experimentResult === 'parcial' ? '#F5B94A' : '#FB7185' }}>
                {r.experimentResult === 'si' ? 'CUMPLIDO' : r.experimentResult === 'parcial' ? 'PARCIAL' : 'NO'}
              </span>
            )}
          </button>
        ))}
      </div>
    </Section>
  );
}

function SealCeremony({ week, priority, experiment, onClose }: { week: string; priority?: string; experiment?: string; onClose: () => void }) {
  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} style={{ zIndex: 120 }}>
      <motion.div className="col" style={{ alignItems: 'center', textAlign: 'center', maxWidth: 560 }} initial={{ scale: 0.9 }} animate={{ scale: 1 }}>
        <div style={{ position: 'relative', width: 180, height: 180 }}>
          <motion.svg width="180" height="180" viewBox="0 0 180 180" style={{ position: 'absolute', inset: 0 }} initial={{ rotate: -90 }} animate={{ rotate: 270 }} transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}>
            <defs>
              <linearGradient id="sealg" x1="0" x2="1">
                <stop offset="0" stopColor="#6D8BFF" />
                <stop offset="1" stopColor="#34D399" />
              </linearGradient>
            </defs>
            <motion.circle cx="90" cy="90" r="80" fill="none" stroke="url(#sealg)" strokeWidth="6" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4 }} />
          </motion.svg>
          <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.9, type: 'spring', stiffness: 260, damping: 14 }} style={{ position: 'absolute', inset: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'radial-gradient(circle at 35% 30%, #8aa2ff, #4a55e8)', boxShadow: '0 20px 60px -10px rgba(109,139,255,.9)' }}>
            <Check size={64} strokeWidth={2.6} color="white" />
          </motion.div>
          {Array.from({ length: 14 }).map((_, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, x: 0, y: 0 }}
              animate={{ opacity: [0, 1, 0], x: Math.cos((i / 14) * Math.PI * 2) * 140, y: Math.sin((i / 14) * Math.PI * 2) * 140 }}
              transition={{ delay: 1.1, duration: 1.2 }}
              style={{ position: 'absolute', left: 88, top: 88, width: 5, height: 5, borderRadius: 5, background: i % 2 ? '#34D399' : '#A78BFA' }}
            />
          ))}
        </div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.3 }}>
          <div className="eyebrow" style={{ marginTop: 20 }}>Semana {weekNumber(week)} sellada</div>
          <h2 style={{ fontSize: 34, marginTop: 8 }}>Revisar → cambiar → seguir.</h2>
          {priority && <p style={{ marginTop: 12, fontSize: 17 }}>Prioridad: <b>{priority}</b></p>}
          {experiment && <p className="muted" style={{ marginTop: 4 }}>Experimento: {experiment}</p>}
          <p className="tiny faint" style={{ marginTop: 18 }}>Persona completa, no perfecta. Toca para continuar.</p>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

function NextWeekPlan({ week }: { week: string }) {
  const clips = useStore((s) => s.clips);
  const shifts = useStore((s) => s.shifts);
  const next = shiftWeek(week, 1);
  const ss = useMemo(() => shiftStats(clips, shifts, week), [clips, shifts, week]);
  const types = weekDays(next).map((d) => shiftType(shifts[dayKey(d)]));
  const count = (t: ShiftType) => types.filter((x) => x === t).length;
  const known = types.filter(Boolean).length;
  const label: Record<ShiftType, string> = { temprano: 'turno temprano', tarde: 'turno tarde', descanso: 'descanso' };
  const hist = (['temprano', 'tarde', 'descanso'] as ShiftType[]).filter((t) => ss[t].days >= 2 && count(t) > 0);
  return (
    <Section eyebrow={`Próxima semana · ${weekLabel(next)}`} title="Planea con tus turnos">
      <TurnosWeek week={next} />
      {known > 0 && (
        <div className="row wrap" style={{ gap: 8, marginTop: 14 }}>
          {(['temprano', 'tarde', 'descanso'] as ShiftType[]).filter((t) => count(t) > 0).map((t) => (
            <span key={t} className="badge" style={{ ['--c' as string]: t === 'descanso' ? '#FB7185' : t === 'temprano' ? '#F5B94A' : '#6D8BFF' }}>
              {count(t)} {count(t) === 1 ? 'día' : 'días'} de {label[t]}
            </span>
          ))}
        </div>
      )}
      {hist.length > 0 && (
        <div className="col" style={{ gap: 6, marginTop: 12 }}>
          {hist.map((t) => (
            <div key={t} className="row small" style={{ gap: 10 }}>
              <span className="badge" style={{ ['--c' as string]: '#2DD4BF', minWidth: 104, justifyContent: 'center' }}>OBSERVACIÓN</span>
              <span>Con {label[t]} sueles registrar <b>{ss[t].avg.toFixed(1)}</b> áreas por día ({ss[t].days} días de historial).</span>
            </div>
          ))}
        </div>
      )}
      <p className="small muted" style={{ marginTop: 12 }}>
        {count('temprano') > 0
          ? '¿Qué áreas son innegociables en tus días de turno temprano, y cuáles pasan a después del trabajo?'
          : known === 0
            ? 'Marca tus turnos de la próxima semana (o vincula tu hoja) y Búnker te mostrará qué esperar de cada día.'
            : '¿En qué días de la próxima semana tienes más espacio para lo que más te importa?'}
      </p>
    </Section>
  );
}
