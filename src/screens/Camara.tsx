import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { SwitchCamera, Star, Pause, Play, Monitor, Camera, ShieldCheck, Mic, MicOff, Settings2, CircleCheck, TriangleAlert } from 'lucide-react';
import { useStore } from '../store';
import { AreaIcon } from '../components/ui';
import { nextInRoutine } from '../lib/classify';
import { isMobile, openCamera, openScreen, SafeRecorder, type Quality } from '../lib/recorder';
import { sound } from '../lib/sound';
import { dayKey, fmtDuration, hm } from '../lib/time';
import type { Clip, ClipKind, Settings } from '../lib/types';

type Mode = Settings['camera']['mode'];

const MODES: { id: Mode; name: string; hint: string }[] = [
  { id: 'auto', name: 'Auto', hint: 'Búnker decide según el área y la duración' },
  { id: 'normal', name: 'Normal', hint: 'Explicación: se verá a velocidad real' },
  { id: 'proceso', name: 'Proceso', hint: 'Time-lapse: se acelera y ocupa menos espacio' },
  { id: 'reflexion', name: 'Reflexión', hint: 'Mensaje: se respeta completo' },
];

const QUALITIES: { id: Quality; name: string }[] = [
  { id: 'eco', name: 'Eco 360p' },
  { id: 'hd', name: 'HD 720p' },
  { id: 'fullhd', name: 'Full HD' },
];

export default function Camara() {
  const areas = useStore((s) => s.areas);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const saveRecording = useStore((s) => s.saveRecording);
  const toast = useStore((s) => s.toast);
  const openClip = useStore((s) => s.openClip);

  const cam = settings.camera;
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const recRef = useRef<SafeRecorder | null>(null);
  const [source, setSource] = useState<'camara' | 'pantalla'>('camara');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [chunks, setChunks] = useState(0);
  const [markers, setMarkers] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showOpts, setShowOpts] = useState(false);
  const [session, setSession] = useState<Clip[]>([]);
  const canScreen = !isMobile() && !!navigator.mediaDevices?.getDisplayMedia;

  // sin horarios: se propone la siguiente área de tu rutina según lo que ya grabaste hoy
  const suggest = () => {
    const st = useStore.getState();
    const today = dayKey(Date.now());
    return nextInRoutine(st.areas, st.clips.filter((c) => dayKey(c.takenAt) === today), st.shifts[today]).next?.id ?? null;
  };
  const [suggested, setSuggested] = useState<string | null>(suggest);
  const [areaId, setAreaId] = useState<string | null>(() => {
    const pre = sessionStorage.getItem('bunker-area');
    sessionStorage.removeItem('bunker-area');
    return pre ?? suggested;
  });
  const area = areas.find((a) => a.id === areaId);
  const activeAreas = areas.filter((a) => a.active).sort((a, b) => a.order - b.order);

  const stopStream = () => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
  };

  const attach = (s: MediaStream) => {
    streamRef.current = s;
    if (videoRef.current) {
      videoRef.current.srcObject = s;
      videoRef.current.play().catch(() => {});
    }
    setReady(true);
    setError(null);
  };

  // cámara
  useEffect(() => {
    if (source !== 'camara' || recording) return;
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Este navegador no da acceso a la cámara. Abre Búnker por HTTPS o desde localhost.');
      return;
    }
    openCamera(cam.facing, cam.quality, cam.mic)
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        attach(s);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.name === 'NotAllowedError' ? 'Permiso de cámara denegado. Actívalo en el candado de la barra de direcciones.' : 'No se encontró una cámara disponible.');
      });
    return () => {
      cancelled = true;
      if (!recRef.current) stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, cam.facing, cam.quality, cam.mic]);

  // al salir de la pantalla mientras se graba: guardar, nunca perder
  useEffect(() => {
    return () => {
      const r = recRef.current;
      if (r) {
        recRef.current = null;
        r.stop().then(({ blob, duration }) => saveRecording(blob, r.meta, duration)).finally(() => stopStream());
      } else stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!recording) return;
    const t = window.setInterval(() => {
      const r = recRef.current;
      if (!r) return;
      setElapsed(r.elapsed);
      setChunks(Math.floor(r.elapsed));
    }, 250);
    return () => window.clearInterval(t);
  }, [recording]);

  const kindFor = (): { kind: ClipKind; locked: boolean } => {
    if (cam.mode === 'normal') return { kind: 'explicacion', locked: true };
    if (cam.mode === 'proceso') return { kind: 'proceso', locked: true };
    if (cam.mode === 'reflexion') return { kind: 'reflexion', locked: true };
    return { kind: area?.kind ?? 'explicacion', locked: false };
  };

  const start = async () => {
    try {
      let stream = streamRef.current;
      if (source === 'pantalla') {
        const scr = await openScreen(cam.mic);
        stopStream();
        cleanupRef.current = scr.cleanup;
        attach(scr.stream);
        stream = scr.stream;
        scr.stream.getVideoTracks()[0]?.addEventListener('ended', () => recRef.current && stop());
      }
      if (!stream) return;
      const { kind, locked } = kindFor();
      const r = new SafeRecorder(stream, { areaId, kind, kindLocked: locked, source }, cam.mode === 'proceso' ? 'eco' : cam.quality);
      recRef.current = r;
      await r.start();
      sound.play('rec');
      sound.vibrate(40);
      setMarkers([]);
      setElapsed(0);
      setPaused(false);
      setRecording(true);
    } catch (e) {
      if ((e as Error).name !== 'NotAllowedError') toast('No se pudo iniciar la grabación.', 'error');
      sound.play('error');
    }
  };

  const stop = async () => {
    const r = recRef.current;
    if (!r) return;
    recRef.current = null;
    setRecording(false);
    setSaving(true);
    sound.play('stop');
    sound.vibrate([30, 60, 30]);
    try {
      const { blob, duration } = await r.stop();
      const clip = await saveRecording(blob, r.meta, duration);
      setSession((s) => [clip, ...s].slice(0, 8));
      // encadenar: la siguiente toma ya viene con la siguiente área de la rutina
      const nx = suggest();
      setSuggested(nx);
      if (nx) setAreaId(nx);
      sound.play('saved');
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch {
      toast('Hubo un problema al cerrar la grabación; los fragmentos se recuperarán al reabrir.', 'error');
    } finally {
      setSaving(false);
      if (source === 'pantalla') {
        stopStream();
        setSource('pantalla');
      }
    }
  };

  const mark = () => {
    const r = recRef.current;
    if (!r) return;
    const t = r.mark();
    setMarkers((m) => [...m, t]);
    sound.play('marker');
    sound.vibrate(20);
  };

  const togglePause = () => {
    const r = recRef.current;
    if (!r) return;
    if (paused) r.resume();
    else r.pause();
    setPaused(!paused);
    sound.play('tap');
  };

  const setCam = (p: Partial<Settings['camera']>) => setSettings({ camera: { ...cam, ...p } });

  // atajos: espacio = grabar/detener, M = marcar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (recRef.current) stop();
        else if (ready || source === 'pantalla') start();
      } else if (e.key.toLowerCase() === 'm') mark();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const mirror = source === 'camara' && cam.facing === 'user';

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Búnker Camera</div>
          <h1 className="title">Un toque. Sigue con tu vida.</h1>
          <p className="subtitle">Se guarda en este dispositivo cada segundo: sin internet, sin riesgo de perderlo.</p>
        </div>
        {canScreen && (
          <div className="row">
            <button className={`chip${source === 'camara' ? ' on' : ''}`} disabled={recording} onClick={() => setSource('camara')}>
              <Camera size={15} /> Cámara
            </button>
            <button
              className={`chip${source === 'pantalla' ? ' on' : ''}`}
              disabled={recording}
              onClick={() => {
                stopStream();
                setSource('pantalla');
              }}
            >
              <Monitor size={15} /> Pantalla
            </button>
          </div>
        )}
      </div>

      <div
        className="card"
        style={{
          padding: 0, overflow: 'hidden', position: 'relative', borderRadius: 30, background: '#000',
          height: 'min(72vh, 760px)', minHeight: 420,
          boxShadow: recording ? '0 0 0 2px rgba(244,63,94,.6), 0 30px 80px -30px rgba(244,63,94,.5)' : undefined,
          transition: 'box-shadow .4s',
        }}
      >
        <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: source === 'pantalla' ? 'contain' : 'cover', transform: mirror ? 'scaleX(-1)' : undefined }} />

        {!ready && !error && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            {source === 'pantalla' ? (
              <div className="col" style={{ alignItems: 'center', textAlign: 'center', padding: 24 }}>
                <Monitor size={48} color="var(--accent)" />
                <h3 style={{ fontSize: 22 }}>Graba tu sesión de trading o de proyecto</h3>
                <p className="muted small" style={{ maxWidth: 420 }}>Pulsa grabar, elige la ventana o pantalla, y sigue trabajando. Tu voz se mezcla con el audio del sistema.</p>
              </div>
            ) : (
              <div className="shimmer" style={{ position: 'absolute', inset: 0 }} />
            )}
          </div>
        )}
        {error && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
            <div className="col" style={{ alignItems: 'center' }}>
              <TriangleAlert size={40} color="var(--warn)" />
              <p style={{ maxWidth: 420 }}>{error}</p>
              <p className="muted small" style={{ maxWidth: 420 }}>Mientras tanto, puedes grabar con la cámara normal del celular: Búnker importará esos videos desde tu carpeta vinculada.</p>
            </div>
          </div>
        )}

        {/* barra superior */}
        <div style={{ position: 'absolute', top: 16, left: 16, right: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
          <button className="glass-pill" style={{ padding: '6px 14px 6px 6px', fontSize: 14, gap: 10 }} onClick={() => !recording && setShowPicker((v) => !v)}>
            <AreaIcon area={area} size={32} />
            <span style={{ textAlign: 'left' }}>
              <span className="tiny muted" style={{ display: 'block', fontWeight: 600 }}>{areaId ? (areaId === suggested ? 'Siguiente en tu rutina' : 'Elegida') : 'Automática'}</span>
              {area?.name ?? 'Clasificar sola'}
            </span>
          </button>
          <AnimatePresence>
            {recording && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass-pill" style={{ padding: '8px 16px', fontSize: 15, gap: 10, background: 'rgba(190,18,60,.55)' }}>
                <span className={paused ? '' : 'pulse'} style={{ width: 10, height: 10, borderRadius: 9, background: paused ? '#fbbf24' : '#fff' }} />
                <span className="mono" style={{ fontSize: 22, fontFamily: 'var(--font-d)', letterSpacing: '.02em' }}>{fmtDuration(elapsed)}</span>
                {paused && <span>PAUSA</span>}
              </motion.div>
            )}
          </AnimatePresence>
          {!recording && (
            <button className="glass-pill" style={{ padding: 9 }} onClick={() => setShowOpts((v) => !v)} aria-label="Opciones">
              <Settings2 size={18} />
            </button>
          )}
        </div>

        <AnimatePresence>
          {showPicker && !recording && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              style={{ position: 'absolute', top: 76, left: 16, right: 16, display: 'flex', flexWrap: 'wrap', gap: 8, padding: 12, borderRadius: 20, background: 'rgba(8,12,24,.86)', backdropFilter: 'blur(16px)', border: '1px solid var(--stroke-2)' }}
            >
              <button className={`chip${!areaId ? ' on' : ''}`} onClick={() => { setAreaId(null); setShowPicker(false); }}>Automática</button>
              {activeAreas.map((a) => (
                <button key={a.id} className={`chip${areaId === a.id ? ' on' : ''}`} style={{ ['--c' as string]: a.color }} onClick={() => { sound.play('tap'); setAreaId(a.id); setShowPicker(false); }}>
                  <span className="dot" /> {a.name}
                </button>
              ))}
            </motion.div>
          )}
          {showOpts && !recording && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              style={{ position: 'absolute', top: 76, right: 16, width: 300, padding: 16, borderRadius: 20, background: 'rgba(8,12,24,.9)', backdropFilter: 'blur(16px)', border: '1px solid var(--stroke-2)' }}
              className="col"
            >
              <div className="label">Calidad</div>
              <div className="row wrap" style={{ gap: 6 }}>
                {QUALITIES.map((q) => (
                  <button key={q.id} className={`chip${cam.quality === q.id ? ' on' : ''}`} onClick={() => setCam({ quality: q.id })}>{q.name}</button>
                ))}
              </div>
              <div className="row between" style={{ marginTop: 8 }}>
                <span className="row small">{cam.mic ? <Mic size={15} /> : <MicOff size={15} />} Micrófono</span>
                <button className={`switch${cam.mic ? ' on' : ''}`} onClick={() => setCam({ mic: !cam.mic })} />
              </div>
              <p className="tiny faint">En modo Proceso se graba en calidad ligera automáticamente para ahorrar espacio.</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* inferior */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '60px 16px 22px', background: 'linear-gradient(180deg, transparent, rgba(0,0,0,.75))' }}>
          {!recording && (
            <div className="row" style={{ justifyContent: 'center', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
              {MODES.map((m) => (
                <button key={m.id} title={m.hint} className={`chip${cam.mode === m.id ? ' on' : ''}`} onClick={() => { sound.play('tap'); setCam({ mode: m.id }); }} style={{ background: cam.mode === m.id ? undefined : 'rgba(0,0,0,.4)' }}>
                  {m.name}
                </button>
              ))}
            </div>
          )}
          {recording && (
            <div className="row" style={{ justifyContent: 'center', gap: 8, marginBottom: 14 }}>
              <span className="glass-pill">
                <ShieldCheck size={13} color="var(--ok)" /> Guardado seguro · {chunks} fragmentos
              </span>
              {markers.length > 0 && (
                <span className="glass-pill" style={{ color: '#F5B94A' }}>
                  <Star size={12} fill="#F5B94A" /> {markers.length} {markers.length === 1 ? 'momento' : 'momentos'}
                </span>
              )}
            </div>
          )}
          <div className="row" style={{ justifyContent: 'center', gap: 34 }}>
            <button
              className="glass-pill"
              style={{ width: 52, height: 52, justifyContent: 'center', borderRadius: 99 }}
              aria-label={recording ? 'Pausar' : 'Cambiar cámara'}
              onClick={() => (recording ? togglePause() : source === 'camara' && setCam({ facing: cam.facing === 'user' ? 'environment' : 'user' }))}
            >
              {recording ? paused ? <Play size={20} /> : <Pause size={20} /> : <SwitchCamera size={20} />}
            </button>
            <motion.button
              aria-label={recording ? 'Detener' : 'Grabar'}
              whileTap={{ scale: 0.92 }}
              disabled={saving || (!ready && source === 'camara')}
              onClick={() => (recording ? stop() : start())}
              style={{ width: 86, height: 86, borderRadius: '50%', border: '4px solid rgba(255,255,255,.9)', display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.25)', boxShadow: '0 10px 30px rgba(0,0,0,.5)' }}
            >
              <motion.span
                animate={recording ? { width: 30, height: 30, borderRadius: 8 } : { width: 64, height: 64, borderRadius: 40 }}
                transition={{ type: 'spring', stiffness: 400, damping: 26 }}
                style={{ background: 'radial-gradient(circle at 35% 30%, #ff8a9b, #f43f5e 55%, #be123c)', display: 'block' }}
              />
            </motion.button>
            <button
              className="glass-pill"
              style={{ width: 52, height: 52, justifyContent: 'center', borderRadius: 99, opacity: recording ? 1 : 0.35, color: '#F5B94A' }}
              aria-label="Marcar momento"
              disabled={!recording}
              onClick={mark}
            >
              <Star size={20} />
            </button>
          </div>
          {!recording && !isMobile() && (
            <p className="tiny" style={{ textAlign: 'center', marginTop: 12, color: 'rgba(255,255,255,.55)' }}>
              <span className="kbd">Espacio</span> grabar / detener · <span className="kbd">M</span> marcar un momento importante
            </p>
          )}
        </div>

        <AnimatePresence>
          {savedFlash && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(4,8,16,.55)', backdropFilter: 'blur(6px)' }}
            >
              <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }} className="col" style={{ alignItems: 'center' }}>
                <CircleCheck size={72} color="var(--ok)" strokeWidth={1.6} />
                <h3 style={{ fontSize: 24 }}>Evidencia guardada</h3>
                <p className="muted small">{area ? `Archivada en ${area.name}` : 'Se clasificará automáticamente'}</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {session.length > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="card-title">
            <h3>En esta sesión</h3>
          </div>
          <div className="row wrap" style={{ gap: 10 }}>
            {session.map((c) => {
              const a = areas.find((x) => x.id === c.areaId);
              return (
                <button key={c.id} className="chip" style={{ ['--c' as string]: a?.color }} onClick={() => openClip(c.id)}>
                  <span className="dot" /> {a?.name ?? 'Auto'} · {hm(c.takenAt)} · {fmtDuration(c.duration)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
