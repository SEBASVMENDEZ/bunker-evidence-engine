import { useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Flame, Play, Video, ChevronDown, Clapperboard, Wind, FolderSync, Sparkles, Quote, RefreshCw, Briefcase, Waves, X, Upload } from 'lucide-react';
import { useStore, needsConfirm } from '../store';
import { AreaIcon, RoutineRing, Counter, Section } from '../components/ui';
import { nextInRoutine } from '../lib/classify';
import { computeWeek, streak } from '../lib/insights';
import { DAILY_QUESTIONS, PRINCIPLES } from '../lib/content';
import { DAY_SHORT, dayKey, fmtDayLong, fmtDuration, greeting, hm, isoWeekday, weekDays, weekKey, weekNumber } from '../lib/time';
import { sound } from '../lib/sound';

export default function Hoy() {
  const settings = useStore((s) => s.settings);
  const areas = useStore((s) => s.areas);
  const clips = useStore((s) => s.clips);
  const reviews = useStore((s) => s.reviews);
  const go = useStore((s) => s.go);
  const openFilm = useStore((s) => s.openFilm);
  const setCalm = useStore((s) => s.setCalm);
  const loadDemo = useStore((s) => s.loadDemo);
  const linkFolder = useStore((s) => s.linkFolder);
  const importFiles = useStore((s) => s.importFiles);
  const fileRef = useRef<HTMLInputElement>(null);
  const supportsFolders = 'showDirectoryPicker' in window;
  const setSettings = useStore((s) => s.setSettings);
  const folders = useStore((s) => s.folders);
  const syncAll = useStore((s) => s.syncAll);
  const shifts = useStore((s) => s.shifts);
  const sheet = useStore((s) => s.sheet);
  const setTurnos = useStore((s) => s.setTurnos);
  const queue = useStore((s) => s.queue);
  const intents = useStore((s) => s.intents);
  const setIntent = useStore((s) => s.setIntent);

  const now = new Date();
  const today = dayKey(now);
  const week = weekKey(now);
  const active = useMemo(() => areas.filter((a) => a.active).sort((a, b) => a.order - b.order), [areas]);
  const todays = useMemo(() => clips.filter((c) => dayKey(c.takenAt) === today && !c.excluded), [clips, today]);
  const doneToday = useMemo(() => new Set(todays.map((c) => c.areaId).filter(Boolean) as string[]), [todays]);
  const stats = useMemo(() => computeWeek(clips, areas, week), [clips, areas, week]);
  const st = useMemo(() => streak(clips), [clips]);
  const shiftToday = shifts[today];
  const ns = nextInRoutine(areas, todays, shiftToday, now);
  const target = ns.next;
  const isSunday = isoWeekday(now) === 7;
  const review = reviews[week];
  // tras sellar el domingo, el experimento nuevo ya es el activo (empieza mañana)
  const prevWeekReview = review?.sealedAt ? review : reviews[weekKey(now.getTime() - 7 * 864e5)];
  const startsTomorrow = !!review?.sealedAt;
  const principle = PRINCIPLES[(Math.floor(now.getTime() / 864e5) + 3) % PRINCIPLES.length];
  const unsure = clips.filter(needsConfirm).length;
  const dayIndex = isoWeekday(now) - 1;
  const todayAreas = active;
  const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`);
  const shiftLine = !shiftToday
    ? 'Marcar el turno de hoy'
    : shiftToday.off
      ? 'Hoy descansas'
      : ns.minutesToStart !== null
        ? `Turno ${shiftToday.start}–${shiftToday.end} · entras en ${fmtMin(ns.minutesToStart)}`
        : ns.minutesToEnd !== null
          ? `En turno hasta las ${shiftToday.end}`
          : `Turno terminado (${shiftToday.start}–${shiftToday.end})`;
  const allDone = todayAreas.length > 0 && todayAreas.every((a) => doneToday.has(a.id));
  // frente al computador (trading, estudio, proyecto) la cámara ve lo mismo: un toque antes de grabar lo resuelve
  const deskAreas = active.filter((a) => a.moment === 'libre');
  const lastIntent = intents[intents.length - 1];
  const pendingIntent = lastIntent && Date.now() - lastIntent.at < 45 * 60000 ? lastIntent : null;

  const record = (areaId?: string) => {
    sound.play('tap');
    if (areaId) sessionStorage.setItem('bunker-area', areaId);
    go('camara');
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">
            {fmtDayLong(now.getTime())} · Semana {weekNumber(week)}
          </div>
          <h1 className="title" style={{ marginTop: 6 }}>
            {greeting(now)}
            {settings.userName ? `, ${settings.userName}` : ''}.
          </h1>
          <p className="subtitle row" style={{ gap: 8 }}>
            <Quote size={14} />
            {principle}
          </p>
        </div>
        <div className="row">
          {(folders.length > 0 || sheet?.handle) && (
            <button className="btn" disabled={queue.running} onClick={() => { sound.play('tap'); syncAll(true); }} title="Buscar videos nuevos y releer tu hoja de turnos">
              <RefreshCw size={16} className={queue.running ? 'spin' : ''} /> {queue.running ? `${queue.done}/${queue.total}` : 'Sincronizar'}
            </button>
          )}
          <button className="btn" onClick={() => setCalm(true)}>
            <Wind size={16} /> Modo calma
          </button>
          <button className="btn primary" onClick={() => record()}>
            <Video size={16} /> Grabar
          </button>
        </div>
      </div>

      <AnimatePresence>
        {!settings.rhythmIntroSeen && (
          <motion.div className="card gradient-border" style={{ marginBottom: 18 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }}>
            <div className="row wrap" style={{ gap: 16, alignItems: 'flex-start' }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent)', flexShrink: 0 }}>
                <Waves size={22} />
              </div>
              <div className="grow" style={{ minWidth: 240 }}>
                <div className="eyebrow">Novedad · ritmo en vez de reloj</div>
                <h3 style={{ fontSize: 19, marginTop: 4 }}>Ya no necesitas poner horarios a nada.</h3>
                <p className="muted small" style={{ marginTop: 6, maxWidth: 680 }}>
                  Búnker reconoce cada video por el <b style={{ color: 'var(--text-2)' }}>orden de tu rutina</b> y su duración típica, sin importar la hora. Si le das tus <b style={{ color: 'var(--text-2)' }}>turnos</b> (vinculando tu hoja de horarios o con 7 toques), sabe qué pasó antes, durante o después del trabajo y te muestra cómo te va según el tipo de turno.
                </p>
                <div className="row wrap" style={{ marginTop: 14 }}>
                  <button className="btn primary" onClick={() => { setTurnos(true); setSettings({ rhythmIntroSeen: true }); }}>
                    <Briefcase size={16} /> Configurar mis turnos
                  </button>
                  <button className="btn ghost" onClick={() => setSettings({ rhythmIntroSeen: true })}>
                    <X size={16} /> Entendido
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {clips.length === 0 && (
        <motion.div className="card gradient-border" style={{ marginBottom: 18 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="row wrap between" style={{ gap: 16 }}>
            <div className="grow">
              <div className="eyebrow">Primer paso</div>
              <h3 style={{ fontSize: 20, marginTop: 4 }}>
                {supportsFolders ? 'Conecta tu evidencia una sola vez. Después, nada más que grabar.' : 'Graba como siempre. Luego tráelos con un toque.'}
              </h3>
              <p className="muted small" style={{ marginTop: 6 }}>
                {supportsFolders
                  ? 'Vincula la carpeta donde llegan los videos de tu celular (Google Drive, OneDrive, Fotos de Windows…) o graba aquí mismo con la Búnker Camera.'
                  : 'Toca Importar y elige los videos del día en tu galería: Búnker los lee y los ordena sin copiarlos, así no te ocupa más espacio.'}
              </p>
            </div>
            <div className="row wrap">
              <button className="btn" onClick={() => loadDemo()}>
                <Sparkles size={16} /> Ver una semana demo
              </button>
              {supportsFolders ? (
                <button className="btn primary" onClick={() => linkFolder()}>
                  <FolderSync size={16} /> Vincular carpeta
                </button>
              ) : (
                <>
                  <input ref={fileRef} type="file" accept="video/*" multiple hidden onChange={(e) => { importFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
                  <button className="btn primary" onClick={() => fileRef.current?.click()}>
                    <Upload size={16} /> Importar videos
                  </button>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}

      <div className="grid g-3">
        {/* AHORA / DOMINGO */}
        {isSunday && !review?.sealedAt ? (
          <motion.section className="card span-2 gradient-border" style={{ overflow: 'hidden', minHeight: 300 }} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
            <SundayPoster week={week} />
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'flex-end', minHeight: 256 }}>
              <span className="badge" style={{ ['--c' as string]: '#34D399', alignSelf: 'flex-start' }}>DOMINGO DE REVISIÓN</span>
              <h2 style={{ fontSize: 'clamp(26px,3.4vw,40px)', marginTop: 10, maxWidth: 560 }}>Tu película de la semana está lista.</h2>
              <p className="muted" style={{ marginTop: 6, maxWidth: 520 }}>
                {stats.total} evidencias · {stats.activeDays}/7 días · {fmtDuration(stats.seconds, true)} condensados en una sola pieza.
              </p>
              <div className="row wrap" style={{ marginTop: 18 }}>
                <button className="btn primary lg" onClick={() => { sound.play('tap'); openFilm(week); }} disabled={!stats.total}>
                  <Play size={18} fill="currentColor" /> Ver mi película
                </button>
                <button className="btn lg" onClick={() => go('domingo')}>
                  <Clapperboard size={18} /> Revisión completa
                </button>
              </div>
            </div>
          </motion.section>
        ) : (
          <motion.section className="card span-2" style={{ overflow: 'hidden' }} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
            <div
              style={{
                position: 'absolute', inset: 0, borderRadius: 'inherit', pointerEvents: 'none',
                background: `radial-gradient(600px 300px at 15% 30%, ${target?.color ?? '#34D399'}33, transparent 70%)`,
              }}
            />
            <div className="row wrap" style={{ gap: 26, position: 'relative', minHeight: 236 }}>
              <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}>
                <AreaIcon area={target ?? { icon: 'chispa', color: '#34D399' }} size={128} />
              </motion.div>
              <div className="grow" style={{ minWidth: 220 }}>
                <button className="chip" onClick={() => setTurnos(true)} style={{ ['--c' as string]: shiftToday?.off ? '#FB7185' : '#34D399' }}>
                  <Briefcase size={14} /> {shiftLine}
                </button>
                <div className="eyebrow" style={{ marginTop: 14 }}>{ns.phase === 'durante' ? 'Al salir del trabajo' : allDone ? 'Hoy' : 'Siguiente en tu rutina'}</div>
                <h2 style={{ fontSize: 'clamp(30px,4vw,48px)', marginTop: 4 }}>{allDone ? 'Rutina completa' : target?.name ?? 'Día libre'}</h2>
                <p className="muted" style={{ marginTop: 4 }}>
                  {allDone
                    ? 'Registraste todas tus áreas hoy. Persona completa, no perfecta.'
                    : ns.phase === 'durante'
                      ? `Estás trabajando. Cuando salgas, sigue ${target?.name ?? 'tu rutina'}.`
                      : ns.minutesToStart !== null && ns.pendingBefore > 0
                        ? `${ns.pendingBefore === 1 ? 'Te falta 1 área' : `Te faltan ${ns.pendingBefore} áreas`} antes de entrar. Coloca el teléfono, un toque y continúa.`
                        : 'Coloca el teléfono, un toque y continúa. Búnker reconoce cada video por el orden de tu rutina, sin horarios.'}
                </p>
                <div className="row wrap" style={{ marginTop: 18 }}>
                  <button className="btn primary lg" onClick={() => record(target?.id)} style={{ background: 'linear-gradient(135deg,#ff8a9b,#f43f5e 55%,#be123c)', boxShadow: '0 14px 34px -10px rgba(244,63,94,.7), inset 0 1px 0 rgba(255,255,255,.35)' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 9, background: 'white' }} />
                    Grabar {allDone ? '' : target?.name ?? ''}
                  </button>
                  {unsure > 0 && (
                    <button className="btn lg" onClick={() => go('evidencia')}>
                      {unsure} por confirmar
                    </button>
                  )}
                </div>
                {deskAreas.length > 0 && (
                  <div className="col" style={{ gap: 6, marginTop: 16 }}>
                    <div className="tiny muted">¿Vas a grabar con la cámara del celular? Un toque y tu próximo video queda en su lugar:</div>
                    <div className="row wrap" style={{ gap: 6 }}>
                      {deskAreas.map((a) => (
                        <button key={a.id} className={`chip${pendingIntent?.areaId === a.id ? ' on' : ''}`} style={{ ['--c' as string]: a.color }} onClick={() => setIntent(a.id)}>
                          <span className="dot" /> {a.name}
                        </button>
                      ))}
                    </div>
                    {pendingIntent && (
                      <div className="tiny" style={{ color: 'var(--ok)' }}>
                        ✓ Tu próximo video será {areas.find((a) => a.id === pendingIntent.areaId)?.name} · marcado a las {hm(pendingIntent.at)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.section>
        )}

        {/* ANILLO DE HOY */}
        <motion.section className="card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
          <div className="card-title">
            <div>
              <div className="eyebrow">Rutina de hoy</div>
              <h3>Evidencia automática</h3>
            </div>
          </div>
          <div style={{ display: 'grid', placeItems: 'center' }}>
            <RoutineRing areas={todayAreas} done={doneToday} size={196}>
              <div>
                <div style={{ fontFamily: 'var(--font-d)', fontSize: 44, fontWeight: 700, lineHeight: 1 }}>
                  <Counter value={todayAreas.filter((a) => doneToday.has(a.id)).length} />
                  <span className="muted" style={{ fontSize: 22 }}>/{todayAreas.length}</span>
                </div>
                <div className="tiny muted" style={{ marginTop: 4, letterSpacing: '.14em' }}>ÁREAS HOY</div>
              </div>
            </RoutineRing>
          </div>
          <div className="row wrap" style={{ justifyContent: 'center', gap: 10, marginTop: 16 }}>
            {todayAreas.map((a) => (
              <button key={a.id} title={a.name} onClick={() => record(a.id)} style={{ borderRadius: 14 }}>
                <AreaIcon area={a} size={36} dim={!doneToday.has(a.id)} done={doneToday.has(a.id)} />
              </button>
            ))}
          </div>
        </motion.section>

        {/* SEMANA */}
        <Section eyebrow={`Semana ${weekNumber(week)}`} title="Tu semana hasta ahora" style={{ gridColumn: 'span 2' }}
          right={
            <div className="row" style={{ gap: 6, color: st ? '#FDBA74' : 'var(--muted)' }}>
              <Flame size={18} fill={st ? '#FB923C' : 'none'} />
              <b className="mono">{st}</b>
              <span className="small muted">{st === 1 ? 'día seguido' : 'días seguidos'}</span>
            </div>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 8 }}>
            {DAY_SHORT.map((d, i) => {
              const day = stats.perDay[i];
              const isToday = i === dayIndex;
              return (
                <motion.div
                  key={d}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.04 }}
                  style={{
                    borderRadius: 16, padding: '12px 6px', textAlign: 'center',
                    background: isToday ? 'rgba(109,139,255,.12)' : 'rgba(255,255,255,.025)',
                    border: `1px solid ${isToday ? 'rgba(109,139,255,.4)' : 'var(--stroke)'}`,
                    opacity: i > dayIndex ? 0.45 : 1,
                  }}
                >
                  <div className="small" style={{ fontWeight: 700, color: isToday ? 'var(--text)' : 'var(--muted)' }}>{d}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 4, margin: '10px auto 6px', minHeight: 26, maxWidth: 56 }}>
                    {active.filter((a) => day.areas.has(a.id)).map((a) => (
                      <span key={a.id} title={a.name} style={{ width: 9, height: 9, borderRadius: 9, background: a.color, boxShadow: `0 0 8px ${a.color}` }} />
                    ))}
                  </div>
                  <div className="tiny mono muted">{day.clips ? fmtDuration(day.seconds, true) : '—'}</div>
                  {(() => {
                    const sh = shifts[dayKey(weekDays(week)[i])];
                    if (!sh) return null;
                    return (
                      <div className="tiny mono" style={{ marginTop: 4, color: sh.off ? '#FDA4AF' : 'var(--faint)' }} title={sh.off ? 'Descanso' : `Turno ${sh.start}–${sh.end}`}>
                        {sh.off ? 'desc.' : sh.start}
                      </div>
                    );
                  })()}
                </motion.div>
              );
            })}
          </div>
          <div className="row wrap" style={{ marginTop: 16, gap: 18 }}>
            <Stat label="Evidencias" value={stats.total} />
            <Stat label="Días activos" value={stats.activeDays} suffix="/7" />
            <Stat label="Tiempo" text={fmtDuration(stats.seconds, true)} />
            <div className="grow" />
            <button className="btn sm" onClick={() => go('domingo')}>
              Ver métricas
            </button>
          </div>
        </Section>

        {/* EXPERIMENTO ACTIVO */}
        <Section eyebrow={startsTomorrow ? 'Experimento · empieza mañana' : 'Experimento activo'} title={prevWeekReview?.experiment ? 'Lo que estás probando' : 'Sin experimento aún'}>
          {prevWeekReview?.experiment ? (
            <>
              <p style={{ fontFamily: 'var(--font-d)', fontSize: 20, fontWeight: 600, lineHeight: 1.3 }}>“{prevWeekReview.experiment}”</p>
              {prevWeekReview.priority && (
                <p className="small muted" style={{ marginTop: 10 }}>
                  Prioridad de la semana: <span style={{ color: 'var(--text-2)' }}>{prevWeekReview.priority}</span>
                </p>
              )}
            </>
          ) : (
            <p className="muted small">
              El domingo, después de ver tu película, eliges <b style={{ color: 'var(--text-2)' }}>una sola variable</b> para cambiar. Aparecerá aquí toda la semana.
            </p>
          )}
        </Section>

        <DailyBoard date={today} />
        <TodayList todays={todays} />
      </div>
      {!settings.userName && (
        <div className="row" style={{ marginTop: 18 }}>
          <input className="input" style={{ maxWidth: 280 }} placeholder="¿Cómo te llamas?" onBlur={(e) => e.target.value && setSettings({ userName: e.target.value.trim() })} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, suffix, text }: { label: string; value?: number; suffix?: string; text?: string }) {
  return (
    <div>
      <div className="tiny muted" style={{ letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 650 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-d)', fontSize: 24, fontWeight: 700 }} className="mono">
        {text ?? <Counter value={value ?? 0} />}
        {suffix && <span className="muted" style={{ fontSize: 16 }}>{suffix}</span>}
      </div>
    </div>
  );
}

function SundayPoster({ week }: { week: string }) {
  const clips = useStore((s) => s.clips);
  const thumbs = clips.filter((c) => c.week === week && c.thumb && !c.excluded).slice(0, 18);
  return (
    <div style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: '-10%', display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8, transform: 'rotate(-6deg)', opacity: 0.55 }}>
        {thumbs.map((c, i) => (
          <motion.img
            key={c.id}
            src={c.thumb}
            alt=""
            style={{ width: '100%', aspectRatio: '16/10', objectFit: 'cover', borderRadius: 12 }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1, y: [0, i % 2 ? -10 : 10, 0] }}
            transition={{ delay: i * 0.05, y: { duration: 9 + (i % 4), repeat: Infinity, ease: 'easeInOut' } }}
          />
        ))}
      </div>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(6,9,18,.97) 30%, rgba(6,9,18,.55) 70%, rgba(6,9,18,.3)), linear-gradient(0deg, rgba(6,9,18,.9), transparent 60%)' }} />
    </div>
  );
}

function DailyBoard({ date }: { date: string }) {
  const log = useStore((s) => s.daily[date]);
  const save = useStore((s) => s.saveDaily);
  const [open, setOpen] = useState(true);
  const filled = DAILY_QUESTIONS.filter((q) => log?.[q.id]).length;
  return (
    <section className="card span-2" style={{ gridColumn: 'span 2' }}>
      <button className="card-title" style={{ width: '100%', marginBottom: open ? 16 : 0, textAlign: 'left' }} onClick={() => setOpen(!open)}>
        <div>
          <div className="eyebrow">Tablero diario mínimo · opcional</div>
          <h3>Cinco preguntas, sesenta segundos</h3>
        </div>
        <div className="row">
          <span className="badge" style={{ ['--c' as string]: filled === 5 ? '#34D399' : '#6D8BFF' }}>{filled}/5</span>
          <motion.span animate={{ rotate: open ? 180 : 0 }}>
            <ChevronDown size={18} />
          </motion.span>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
            <div className="grid g-2" style={{ gap: 12 }}>
              {DAILY_QUESTIONS.map((q) => (
                <div className="field" key={q.id}>
                  <label>{q.q}</label>
                  <input className="input" defaultValue={log?.[q.id] ?? ''} onBlur={(e) => save(date, { [q.id]: e.target.value })} />
                </div>
              ))}
              <div className="field">
                <label>Estado emocional antes → después de lo importante (1–10)</label>
                <div className="row">
                  <input type="range" min={1} max={10} defaultValue={log?.moodBefore ?? 5} onChange={(e) => save(date, { moodBefore: +e.target.value })} />
                  <span className="muted">→</span>
                  <input type="range" min={1} max={10} defaultValue={log?.moodAfter ?? 5} onChange={(e) => save(date, { moodAfter: +e.target.value })} />
                </div>
                <span className="tiny faint">La emoción es información; no sustituye la evidencia.</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function TodayList({ todays }: { todays: ReturnType<typeof useStore.getState>['clips'] }) {
  const areas = useStore((s) => s.areas);
  const openClip = useStore((s) => s.openClip);
  const sorted = [...todays].sort((a, b) => b.takenAt - a.takenAt).slice(0, 6);
  return (
    <Section eyebrow="Hoy" title="Última evidencia">
      {sorted.length ? (
        <div className="col" style={{ gap: 8 }}>
          {sorted.map((c) => {
            const a = areas.find((x) => x.id === c.areaId);
            return (
              <button key={c.id} className="row" style={{ padding: 6, borderRadius: 12, textAlign: 'left' }} onClick={() => openClip(c.id)}>
                {c.thumb ? (
                  <img src={c.thumb} alt="" style={{ width: 54, height: 36, objectFit: 'cover', borderRadius: 8, border: `1px solid ${a?.color ?? 'var(--stroke)'}` }} />
                ) : (
                  <AreaIcon area={a} size={36} />
                )}
                <div className="grow">
                  <div className="small" style={{ fontWeight: 600 }}>{a?.name ?? 'Sin clasificar'}</div>
                  <div className="tiny muted mono">{hm(c.takenAt)} · {fmtDuration(c.duration)}</div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="muted small">Todavía nada hoy. Un toque en grabar y listo.</p>
      )}
    </Section>
  );
}
