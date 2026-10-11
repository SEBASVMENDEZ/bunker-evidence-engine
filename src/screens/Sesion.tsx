// Sesión guiada: un toque y Búnker te lleva de un hábito al siguiente con voz, campana y
// cronómetro. No tienes que mirar el teléfono: te avisa cuándo cambiar. Al terminar, cada
// hábito queda hecho en tu ruta (aunque no hayas grabado video).
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Pause, Play, Check, SkipForward, Plus, Volume2, VolumeX } from 'lucide-react';
import { useStore } from '../store';
import { AreaIcon } from '../components/ui';
import { sound } from '../lib/sound';

const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

function speak(text: string, on: boolean) {
  if (!on || !('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    const v = speechSynthesis.getVoices().find((x) => x.lang.toLowerCase().startsWith('es'));
    if (v) u.voice = v;
    u.lang = v?.lang ?? 'es-ES';
    u.rate = 0.95;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch {
    /* sin voz */
  }
}

export default function Sesion() {
  // copia fija al abrir: al cerrar, la animación de salida sigue dibujando sin datos nuevos
  const [sesion] = useState(() => useStore.getState().sesion!);
  const areas = useStore((s) => s.areas);
  const addHecho = useStore((s) => s.addHecho);
  const close = () => useStore.getState().openSesion(null);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [voice, setVoice] = useState(true);
  const [extra, setExtra] = useState<number[]>(() => sesion.steps.map(() => 0));
  const [done, setDone] = useState<{ areaId: string; minutes: number }[]>([]);
  const [now, setNow] = useState(Date.now());
  // tiempo transcurrido por paso, robusto si el teléfono pone la app en segundo plano
  const startRef = useRef(Date.now());
  const pausedAcc = useRef(0);
  const pausedAt = useRef<number | null>(null);
  const wake = useRef<WakeLockSentinel | null>(null);
  const finished = idx >= sesion.steps.length;
  const step = sesion.steps[Math.min(idx, sesion.steps.length - 1)];
  const area = areas.find((a) => a.id === step.areaId);
  const total = (step.minutes + extra[idx]) * 60;
  const elapsed = (now - startRef.current - pausedAcc.current - (pausedAt.current ? now - pausedAt.current : 0)) / 1000;
  const left = total - elapsed;
  const invested = useMemo(() => done.reduce((s, d) => s + d.minutes, 0), [done]);

  const announce = (i: number) => {
    const st = sesion.steps[i];
    const a = areas.find((x) => x.id === st?.areaId);
    if (!a) return;
    sound.play('chapter', true);
    navigator.vibrate?.([120, 80, 120]);
    speak(`${i === 0 ? 'Empezamos' : 'Ahora'}: ${a.name}. ${st.minutes} ${st.minutes === 1 ? 'minuto' : 'minutos'}.`, voice);
  };

  const goNext = (logIt: boolean) => {
    if (finished) return;
    const mins = Math.max(1, Math.round(elapsed / 60));
    if (logIt) {
      addHecho(step.areaId, mins, 'guiado');
      setDone((d) => [...d, { areaId: step.areaId, minutes: mins }]);
    }
    const n = idx + 1;
    startRef.current = Date.now();
    pausedAcc.current = 0;
    pausedAt.current = null;
    setPaused(false);
    setIdx(n);
    if (n < sesion.steps.length) announce(n);
    else {
      sound.play('seal', true);
      navigator.vibrate?.([200, 100, 200, 100, 300]);
      speak('Listo. Lo hiciste. Un paso más en tu camino.', voice);
    }
  };

  useEffect(() => {
    announce(0);
    (async () => {
      try {
        wake.current = (await navigator.wakeLock?.request('screen')) ?? null;
      } catch {
        /* sin wake lock */
      }
    })();
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => {
      window.clearInterval(t);
      wake.current?.release().catch(() => {});
      if ('speechSynthesis' in window) speechSynthesis.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // se acabó el tiempo del hábito: campana y al siguiente
  useEffect(() => {
    if (!finished && !paused && left <= 0) goNext(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left <= 0, paused, finished]);

  // aviso suave 30 s antes de cambiar
  const warned = useRef(-1);
  useEffect(() => {
    if (!finished && !paused && left <= 30 && left > 0 && warned.current !== idx && total > 90) {
      warned.current = idx;
      sound.play('tick', true);
    }
  }, [left, idx, paused, finished, total]);

  const togglePause = () => {
    if (paused) {
      pausedAcc.current += Date.now() - (pausedAt.current ?? Date.now());
      pausedAt.current = null;
      setPaused(false);
    } else {
      pausedAt.current = Date.now();
      setPaused(true);
    }
    sound.play('tap');
  };

  const R = 120;
  const C = 2 * Math.PI * R;
  const prog = Math.min(1, Math.max(0, elapsed / Math.max(1, total)));
  const col = area?.color ?? '#6D8BFF';

  return (
    <motion.div
      className="overlay"
      style={{ zIndex: 120, background: `radial-gradient(circle at 50% 38%, ${col}26, rgba(2,4,9,.96) 62%)`, padding: 20 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="row" style={{ position: 'absolute', top: 18, right: 18, gap: 8 }}>
        <button className="btn icon" onClick={() => setVoice((v) => !v)} aria-label={voice ? 'Silenciar voz' : 'Activar voz'}>
          {voice ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
        <button className="btn icon" onClick={close} aria-label="Cerrar">
          <X size={18} />
        </button>
      </div>

      <div className="col" style={{ alignItems: 'center', gap: 18, width: 'min(520px, 100%)', textAlign: 'center' }}>
        <div className="eyebrow">{sesion.title}</div>
        {/* progreso de la sesión */}
        <div className="row" style={{ gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
          {sesion.steps.map((s, i) => {
            const a = areas.find((x) => x.id === s.areaId);
            return (
              <span key={i} className="tiny" style={{ padding: '4px 10px', borderRadius: 99, fontWeight: 700, background: i < idx ? `${a?.color}33` : i === idx ? a?.color : 'rgba(255,255,255,.06)', color: i === idx ? '#0A0F1E' : i < idx ? a?.color : 'var(--muted)' }}>
                {i < idx ? '✓ ' : ''}
                {a?.name}
              </span>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          {!finished ? (
            <motion.div key={idx} className="col" style={{ alignItems: 'center', gap: 14 }} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.04 }} transition={{ duration: 0.35 }}>
              <div style={{ position: 'relative', width: 280, height: 280 }}>
                <svg width="280" height="280" viewBox="0 0 280 280" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
                  <circle cx="140" cy="140" r={R} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="12" />
                  <circle cx="140" cy="140" r={R} fill="none" stroke={col} strokeWidth="12" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - prog)} style={{ transition: 'stroke-dashoffset .25s linear', filter: `drop-shadow(0 0 14px ${col}88)` }} />
                </svg>
                <div className="col" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <motion.div animate={paused ? {} : { scale: [1, 1.05, 1] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}>
                    <AreaIcon area={area} size={72} />
                  </motion.div>
                  <div style={{ fontFamily: 'var(--font-d)', fontSize: 52, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{fmt(left)}</div>
                  <div className="tiny muted">{paused ? 'En pausa' : `de ${step.minutes + extra[idx]} min`}</div>
                </div>
              </div>
              <h2 style={{ fontSize: 34 }}>{area?.name}</h2>
              {sesion.steps[idx + 1] && <div className="muted small">Después: {areas.find((a) => a.id === sesion.steps[idx + 1].areaId)?.name}</div>}
              <div className="row wrap" style={{ gap: 8, justifyContent: 'center', marginTop: 6 }}>
                <button className="btn lg" onClick={togglePause}>
                  {paused ? <Play size={18} /> : <Pause size={18} />} {paused ? 'Seguir' : 'Pausa'}
                </button>
                <button className="btn primary lg" onClick={() => goNext(true)}>
                  <Check size={18} /> Listo
                </button>
              </div>
              <div className="row wrap" style={{ gap: 8, justifyContent: 'center' }}>
                <button className="btn sm ghost" onClick={() => setExtra((e) => e.map((x, i) => (i === idx ? x + 2 : x)))}>
                  <Plus size={14} /> 2 min
                </button>
                <button className="btn sm ghost" onClick={() => goNext(false)}>
                  <SkipForward size={14} /> Saltar
                </button>
              </div>
              <p className="tiny muted" style={{ maxWidth: 380 }}>Deja el teléfono a un lado: te aviso con voz y campana cuando sea hora de cambiar.</p>
            </motion.div>
          ) : (
            <motion.div key="fin" className="col" style={{ alignItems: 'center', gap: 14 }} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <motion.div initial={{ scale: 0.6, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 14 }} style={{ width: 120, height: 120, borderRadius: 38, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#34d399,#059669)', boxShadow: '0 20px 60px -12px rgba(52,211,153,.7)' }}>
                <Check size={60} color="white" strokeWidth={2.4} />
              </motion.div>
              <h2 style={{ fontSize: 32 }}>Hecho.</h2>
              <p className="muted">
                {invested} min invertidos en ti · {done.length} {done.length === 1 ? 'hábito' : 'hábitos'}. Eso cuenta, aunque el día esté pesado.
              </p>
              <button className="btn primary lg" onClick={close}>
                Volver a mi ruta
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
