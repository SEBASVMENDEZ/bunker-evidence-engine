import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Hand, ArrowRight } from 'lucide-react';
import { useStore } from '../store';
import { DECISIONS, EMOTIONS } from '../lib/content';
import { computeWeek } from '../lib/insights';
import { fmtDuration, shiftWeek, uid, weekKey } from '../lib/time';
import { sound } from '../lib/sound';
import type { Decision } from '../lib/types';

const STEPS = ['Parar', 'Observar', 'Regular', 'Revisar evidencia', 'Decidir', 'Continuar'];

export default function Calma() {
  const close = () => useStore.getState().setCalm(false);
  const addCalm = useStore((s) => s.addCalm);
  const clips = useStore((s) => s.clips);
  const areas = useStore((s) => s.areas);
  const reviews = useStore((s) => s.reviews);
  const [step, setStep] = useState(0);
  const [emotion, setEmotion] = useState<string[]>([]);
  const [thought, setThought] = useState('');
  const [impulse, setImpulse] = useState('');
  const [decision, setDecision] = useState<Decision | undefined>();
  const [next, setNext] = useState('');
  const week = weekKey(Date.now());
  const stats = useMemo(() => computeWeek(clips, areas, week), [clips, areas, week]);
  const last = reviews[shiftWeek(week, -1)];

  const advance = () => {
    sound.play('tap');
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const finish = () => {
    addCalm({ id: uid('calm_'), at: Date.now(), emotion, thought: [thought, impulse].filter(Boolean).join(' · '), decision, next });
    sound.play('saved');
    useStore.getState().toast('Protocolo completado. Siguiente experimento en marcha.', 'ok');
    close();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <motion.div className="overlay" style={{ zIndex: 110, background: 'radial-gradient(circle at 50% 40%, rgba(45,212,191,.12), rgba(2,4,9,.92) 60%)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button className="btn icon" style={{ position: 'absolute', top: 20, right: 20 }} onClick={close} aria-label="Cerrar">
        <X size={18} />
      </button>
      <div style={{ width: 'min(680px, 100%)' }}>
        <div className="row" style={{ justifyContent: 'center', gap: 6, marginBottom: 30, flexWrap: 'wrap' }}>
          {STEPS.map((s, i) => (
            <div key={s} className="row" style={{ gap: 6 }}>
              <span className="tiny" style={{ fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: i === step ? '#5EEAD4' : i < step ? 'var(--text-2)' : 'var(--faint)' }}>{s}</span>
              {i < STEPS.length - 1 && <span className="faint">·</span>}
            </div>
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.4 }} style={{ textAlign: 'center' }}>
            {step === 0 && (
              <div className="col" style={{ alignItems: 'center', gap: 16 }}>
                <motion.div animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 2.4, repeat: Infinity }} style={{ width: 120, height: 120, borderRadius: 36, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#2dd4bf,#0f766e)', boxShadow: '0 20px 60px -10px rgba(45,212,191,.6)' }}>
                  <Hand size={56} color="white" strokeWidth={1.6} />
                </motion.div>
                <h2 style={{ fontSize: 34 }}>Para un momento.</h2>
                <p className="muted" style={{ maxWidth: 480 }}>
                  Cuando aparece «tengo que hacer que esto funcione ya», no añadas automáticamente otra estrategia. Nada importante se decide en este estado.
                </p>
                <button className="btn primary lg" onClick={advance}>Ya paré <ArrowRight size={18} /></button>
              </div>
            )}
            {step === 1 && (
              <div className="col" style={{ gap: 14, textAlign: 'left' }}>
                <h2 style={{ fontSize: 28, textAlign: 'center' }}>Observa sin juzgar.</h2>
                <div className="label">¿Qué emoción hay?</div>
                <div className="row wrap" style={{ gap: 6 }}>
                  {EMOTIONS.map((e) => (
                    <button key={e} className={`chip${emotion.includes(e) ? ' on' : ''}`} style={{ ['--c' as string]: '#2DD4BF' }} onClick={() => { sound.play('tap'); setEmotion((x) => (x.includes(e) ? x.filter((y) => y !== e) : [...x, e])); }}>
                      {e}
                    </button>
                  ))}
                </div>
                <div className="field">
                  <label>¿Qué pensamiento aparece?</label>
                  <input className="input" value={thought} onChange={(e) => setThought(e.target.value)} placeholder="«Ya debería estar más avanzado…»" />
                </div>
                <div className="field">
                  <label>¿Qué estabas a punto de hacer?</label>
                  <input className="input" value={impulse} onChange={(e) => setImpulse(e.target.value)} placeholder="Cambiar de estrategia, abandonar, forzar…" />
                </div>
                <button className="btn primary lg" style={{ alignSelf: 'center', marginTop: 8 }} onClick={advance}>Siguiente <ArrowRight size={18} /></button>
              </div>
            )}
            {step === 2 && <Breathing onDone={advance} />}
            {step === 3 && (
              <div className="col" style={{ gap: 14 }}>
                <h2 style={{ fontSize: 28 }}>Esto es lo que realmente está ocurriendo.</h2>
                <p className="muted">Hechos de esta semana, no interpretaciones:</p>
                <div className="grid g-3" style={{ gap: 10 }}>
                  <Fact k="Días activos" v={`${stats.activeDays}/7`} />
                  <Fact k="Evidencias" v={String(stats.total)} />
                  <Fact k="Tiempo invertido" v={fmtDuration(stats.seconds, true)} />
                </div>
                {last?.priority && (
                  <p className="small" style={{ marginTop: 6 }}>
                    Tu prioridad esta semana: <b>{last.priority}</b>
                    {last.experiment && <span className="muted"> · experimento: {last.experiment}</span>}
                  </p>
                )}
                <p className="tiny muted">Un resultado aislado es información, no una sentencia. Regular emociones no significa ignorar la realidad.</p>
                <button className="btn primary lg" style={{ alignSelf: 'center' }} onClick={advance}>Decidir <ArrowRight size={18} /></button>
              </div>
            )}
            {step === 4 && (
              <div className="col" style={{ gap: 14 }}>
                <h2 style={{ fontSize: 28 }}>Decide con calma.</h2>
                <div className="grid g-2" style={{ gap: 10 }}>
                  {DECISIONS.map((d) => (
                    <button
                      key={d.id}
                      className="card"
                      style={{ textAlign: 'left', padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', borderColor: decision === d.id ? 'rgba(45,212,191,.6)' : undefined, background: decision === d.id ? 'rgba(45,212,191,.1)' : undefined }}
                      onClick={() => { sound.play('pop'); setDecision(d.id as Decision); }}
                    >
                      <b>{d.name}</b>
                      <p className="tiny muted" style={{ marginTop: 4 }}>{d.desc}</p>
                    </button>
                  ))}
                </div>
                {decision === 'evaluar-vehiculo' && <p className="small" style={{ color: 'var(--warn)' }}>Agéndalo para la revisión del domingo, con la evidencia acumulada delante. Hoy no.</p>}
                <button className="btn primary lg" style={{ alignSelf: 'center' }} onClick={advance} disabled={!decision}>Continuar <ArrowRight size={18} /></button>
              </div>
            )}
            {step === 5 && (
              <div className="col" style={{ gap: 14 }}>
                <h2 style={{ fontSize: 28 }}>¿Cuál es el siguiente paso pequeño y verificable?</h2>
                <input className="input" style={{ fontSize: 18, padding: 16, textAlign: 'center' }} autoFocus value={next} onChange={(e) => setNext(e.target.value)} placeholder="Algo que puedas hacer y grabar hoy" onKeyDown={(e) => e.key === 'Enter' && next.trim() && finish()} />
                <button className="btn primary lg" style={{ alignSelf: 'center' }} onClick={finish} disabled={!next.trim()}>Ejecutar el siguiente experimento</button>
                <p className="tiny muted">Revisar → cambiar → seguir.</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="card kpi" style={{ padding: 16 }}>
      <div className="k">{k}</div>
      <div className="v" style={{ fontSize: 30 }}>{v}</div>
    </div>
  );
}

const PHASES = [
  { name: 'Inhala', dur: 4, scale: 1 },
  { name: 'Sostén', dur: 2, scale: 1 },
  { name: 'Exhala', dur: 6, scale: 0.55 },
];

function Breathing({ onDone }: { onDone: () => void }) {
  const [cycle, setCycle] = useState(0);
  const [phase, setPhase] = useState(0);
  const total = 4;
  useEffect(() => {
    if (cycle >= total) return;
    const p = PHASES[phase];
    if (phase === 0) sound.play('breathIn', true);
    if (phase === 2) sound.play('breathOut', true);
    const t = window.setTimeout(() => {
      if (phase === PHASES.length - 1) {
        setPhase(0);
        setCycle((c) => c + 1);
      } else setPhase(phase + 1);
    }, p.dur * 1000);
    return () => window.clearTimeout(t);
  }, [phase, cycle]);
  const done = cycle >= total;
  const p = PHASES[phase];
  return (
    <div className="col" style={{ alignItems: 'center', gap: 18 }}>
      <h2 style={{ fontSize: 28 }}>Regula tu estado.</h2>
      <div style={{ position: 'relative', width: 260, height: 260, display: 'grid', placeItems: 'center' }}>
        <motion.div
          initial={{ scale: 0.55 }}
          animate={{ scale: done ? 0.8 : p.scale }}
          transition={{ duration: done ? 1 : p.dur, ease: 'easeInOut' }}
          style={{ position: 'absolute', width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle at 40% 35%, rgba(94,234,212,.55), rgba(45,212,191,.15) 60%, transparent 70%)', boxShadow: '0 0 80px rgba(45,212,191,.35)' }}
        />
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 24, repeat: Infinity, ease: 'linear' }} style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px dashed rgba(94,234,212,.25)' }} />
        <div style={{ position: 'relative', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-d)', fontSize: 30, fontWeight: 700 }}>{done ? 'Bien.' : p.name}</div>
          <div className="tiny muted">{done ? 'Más estable' : `Ciclo ${cycle + 1} de ${total}`}</div>
        </div>
      </div>
      <div className="row">
        {!done && <button className="btn ghost" onClick={onDone}>Saltar</button>}
        {done && <button className="btn primary lg" onClick={onDone}>Revisar la evidencia <ArrowRight size={18} /></button>}
      </div>
    </div>
  );
}
