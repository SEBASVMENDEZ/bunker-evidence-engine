import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Play, Pause, SkipBack, SkipForward, Music, Music2, Maximize, Download, RotateCcw, ClipboardCheck, Volume2, Loader2 } from 'lucide-react';
import { useStore } from '../store';
import { computeWeek, history, insights } from '../lib/insights';
import { buildFilm } from '../lib/film/edl';
import { FilmEngine, type EngineState } from '../lib/film/engine';
import { exportFilm, saveBlob, type ExportJob } from '../lib/film/export';
import type { Scene } from '../lib/film/draw';
import { clipFile } from '../lib/db';
import { fmtDuration, shiftWeek, weekNumber } from '../lib/time';
import { sound } from '../lib/sound';
import { Glyph } from '../components/ui';

export default function FilmPlayer({ week }: { week: string }) {
  const clips = useStore((s) => s.clips);
  const areas = useStore((s) => s.areas);
  const settings = useStore((s) => s.settings);
  const reviews = useStore((s) => s.reviews);
  const shifts = useStore((s) => s.shifts);
  const setSettings = useStore((s) => s.setSettings);
  const saveReview = useStore((s) => s.saveReview);
  const close = () => useStore.getState().openFilm(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<FilmEngine | null>(null);
  const [st, setSt] = useState<EngineState | null>(null);
  const [ui, setUi] = useState(true);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const [exporting, setExporting] = useState<{ job: ExportJob; p: number } | null>(null);
  const [askExport, setAskExport] = useState(false);
  const [music, setMusic] = useState(settings.music);
  const hideTimer = useRef(0);

  // los datos se congelan al abrir: la película no cambia mientras se ve
  const data = useMemo(() => {
    const stats = computeWeek(clips, areas, week);
    const past = history(clips, areas, week, 4);
    const statements = insights(stats, past, areas, clips, shifts);
    const film = buildFilm({
      week, clips: stats.clips, areas, stats, prevStats: past[0], statements,
      review: reviews[week], prevReview: reviews[shiftWeek(week, -1)],
      minutes: settings.filmMinutes, grouping: settings.filmGrouping, shifts,
    });
    return { stats, past, statements, film };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);

  useEffect(() => {
    let disposed = false;
    const canvas = canvasRef.current!;
    const thumbs = new Map<string, HTMLImageElement>();
    const loadThumbs = Promise.all(
      data.stats.clips.filter((c) => c.thumb).map(
        (c) =>
          new Promise<void>((res) => {
            const img = new Image();
            img.onload = () => {
              thumbs.set(c.id, img);
              res();
            };
            img.onerror = () => res();
            img.src = c.thumb!;
          }),
      ),
    );
    const scene: Scene = {
      film: data.film,
      stats: data.stats,
      prevStats: data.past[0],
      areas,
      clips: new Map(data.stats.clips.map((c) => [c.id, c])),
      thumbs,
      userName: settings.userName,
      shifts,
    };
    const engine = new FilmEngine(canvas, scene, {
      music: settings.music,
      fileFor: (c) => clipFile(c),
      onState: (s) => !disposed && setSt(s),
    });
    engineRef.current = engine;
    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.min(1920, Math.round(window.innerWidth * dpr));
      engine.resize(w, Math.round((w * 9) / 16));
    };
    loadThumbs.then(async () => {
      if (disposed) return;
      size();
      await engine.init();
      if (disposed) return;
      engine.play();
    });
    saveReview(week, { watchedAt: Date.now() });
    const onResize = () => !exportingRef.current && size();
    window.addEventListener('resize', onResize);
    return () => {
      disposed = true;
      window.removeEventListener('resize', onResize);
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const exportingRef = useRef(false);
  exportingRef.current = !!exporting;

  const poke = () => {
    setUi(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => engineRef.current?.isPlaying && setUi(false), 2600);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const en = engineRef.current;
      if (!en || exportingRef.current) return;
      poke();
      if (e.code === 'Space') {
        e.preventDefault();
        en.toggle();
      } else if (e.key === 'ArrowRight') en.nextChapter();
      else if (e.key === 'ArrowLeft') en.prevChapter();
      else if (e.key.toLowerCase() === 'f') fullscreen();
      else if (e.key.toLowerCase() === 'm') toggleMusic();
      else if (e.key === 'Escape' && !document.fullscreenElement) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else wrapRef.current?.requestFullscreen?.().catch(() => {});
  };

  const toggleMusic = () => {
    const v = !music;
    setMusic(v);
    engineRef.current?.setMusic(v);
    setSettings({ music: v });
  };

  const startExport = (hd: boolean) => {
    const en = engineRef.current;
    const canvas = canvasRef.current;
    if (!en || !canvas) return;
    setAskExport(false);
    en.pause();
    en.resize(hd ? 1920 : 1280, hd ? 1080 : 720);
    const job = exportFilm(en, canvas, (s) => setExporting((x) => (x ? { ...x, p: s.time / s.duration } : x)));
    setExporting({ job, p: 0 });
    job.done
      .then(async ({ blob, ext }) => {
        setExporting(null);
        sound.play('saved');
        const y = week.split('-W')[0];
        await saveBlob(blob, `Bunker_Semana_${weekNumber(week)}_${y}.${ext}`);
        useStore.getState().toast('Película exportada.', 'ok');
      })
      .catch(() => {
        setExporting(null);
      })
      .finally(() => {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = Math.min(1920, Math.round(window.innerWidth * dpr));
        en.resize(w, Math.round((w * 9) / 16));
      });
  };

  const film = data.film;
  const time = st?.time ?? 0;
  const chapter = film.chapters[st?.chapter ?? 0];
  const seekFrom = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    return p * film.duration;
  };

  return (
    <motion.div
      ref={wrapRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onPointerMove={poke}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#000', cursor: ui ? 'default' : 'none', display: 'grid', placeItems: 'center' }}
    >
      <canvas ref={canvasRef} onClick={() => !exporting && engineRef.current?.toggle()} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />

      {/* barra superior */}
      <AnimatePresence>
        {(ui || !st?.playing) && !exporting && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '18px 22px 40px', background: 'linear-gradient(180deg, rgba(0,0,0,.7), transparent)', display: 'flex', alignItems: 'center', gap: 14 }}
          >
            <div className="grow">
              <div className="eyebrow" style={{ color: 'rgba(255,255,255,.6)' }}>Película · Semana {weekNumber(week)}</div>
              <div className="row" style={{ gap: 8, fontWeight: 650, fontSize: 17 }}>
                {chapter && <Glyph icon={chapter.icon} size={18} color={chapter.color} />}
                {chapter?.title}
              </div>
            </div>
            <span className="tiny" style={{ color: 'rgba(255,255,255,.55)' }}>
              {film.clipCount} evidencias · {fmtDuration(film.sourceSeconds, true)} → {fmtDuration(film.duration)}
            </span>
            <button className="btn icon" style={{ background: 'rgba(255,255,255,.08)' }} onClick={close} aria-label="Cerrar">
              <X size={18} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* controles */}
      <AnimatePresence>
        {(ui || !st?.playing) && !exporting && !st?.ended && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 14 }}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '50px 22px 20px', background: 'linear-gradient(0deg, rgba(0,0,0,.8), transparent)' }}
          >
            <div
              style={{ position: 'relative', height: 26, display: 'flex', alignItems: 'center', cursor: 'pointer' }}
              onPointerDown={(e) => engineRef.current?.seek(seekFrom(e))}
              onPointerMove={(e) => setHover({ x: e.clientX - e.currentTarget.getBoundingClientRect().left, t: seekFrom(e) })}
              onPointerLeave={() => setHover(null)}
            >
              {film.chapters.map((c, i) => {
                const p = Math.max(0, Math.min(1, (time - c.start) / c.dur));
                return (
                  <div key={i} style={{ position: 'absolute', left: `${(c.start / film.duration) * 100}%`, width: `calc(${(c.dur / film.duration) * 100}% - 4px)`, height: 6, borderRadius: 4, background: 'rgba(255,255,255,.16)', overflow: 'hidden' }}>
                    <div style={{ width: `${p * 100}%`, height: '100%', background: c.color, boxShadow: `0 0 12px ${c.color}` }} />
                  </div>
                );
              })}
              {hover && (
                <div style={{ position: 'absolute', bottom: 26, left: hover.x, transform: 'translateX(-50%)', padding: '5px 10px', borderRadius: 10, background: 'rgba(10,14,26,.92)', border: '1px solid var(--stroke-2)', fontSize: 12, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                  {film.chapters.find((c) => hover.t >= c.start && hover.t < c.start + c.dur)?.title} · {fmtDuration(hover.t)}
                </div>
              )}
            </div>
            <div className="row" style={{ marginTop: 8, gap: 6 }}>
              <button className="btn icon ghost" onClick={() => engineRef.current?.prevChapter()} aria-label="Capítulo anterior">
                <SkipBack size={18} fill="currentColor" />
              </button>
              <button className="btn icon" style={{ width: 52, height: 52, borderRadius: 99, background: 'white', color: '#000' }} onClick={() => engineRef.current?.toggle()} aria-label={st?.playing ? 'Pausa' : 'Reproducir'}>
                {st?.loading ? <Loader2 size={20} className="spin" /> : st?.playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
              </button>
              <button className="btn icon ghost" onClick={() => engineRef.current?.nextChapter()} aria-label="Capítulo siguiente">
                <SkipForward size={18} fill="currentColor" />
              </button>
              <span className="mono small" style={{ marginLeft: 8, color: 'rgba(255,255,255,.8)' }}>
                {fmtDuration(time)} / {fmtDuration(film.duration)}
              </span>
              <div className="grow" />
              <div className="row" style={{ gap: 6, width: 130 }}>
                <Volume2 size={16} />
                <input type="range" min={0} max={1} step={0.05} defaultValue={settings.volume} onChange={(e) => setSettings({ volume: +e.target.value })} />
              </div>
              <button className="btn icon ghost" title="Música (M)" onClick={toggleMusic} style={{ color: music ? 'var(--accent)' : undefined }}>
                {music ? <Music2 size={18} /> : <Music size={18} style={{ opacity: 0.5 }} />}
              </button>
              <button className="btn sm" style={{ background: 'rgba(255,255,255,.08)' }} onClick={() => { engineRef.current?.pause(); setAskExport(true); }}>
                <Download size={15} /> Exportar
              </button>
              <button className="btn icon ghost" title="Pantalla completa (F)" onClick={fullscreen}>
                <Maximize size={18} />
              </button>
            </div>
            <div className="tiny" style={{ marginTop: 6, color: 'rgba(255,255,255,.4)' }}>
              <span className="kbd">Espacio</span> pausa · <span className="kbd">←</span> <span className="kbd">→</span> capítulos · <span className="kbd">F</span> pantalla completa · <span className="kbd">M</span> música
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* fin */}
      <AnimatePresence>
        {st?.ended && !exporting && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(3,5,10,.6)', backdropFilter: 'blur(8px)' }}>
            <motion.div initial={{ y: 20, scale: 0.96 }} animate={{ y: 0, scale: 1 }} className="col" style={{ alignItems: 'center', textAlign: 'center', gap: 14 }}>
              <div className="eyebrow">Fin de la película</div>
              <h2 style={{ fontSize: 'clamp(28px,4vw,44px)' }}>Ahora: revisar → cambiar → seguir.</h2>
              <p className="muted" style={{ maxWidth: 520 }}>Responde las preguntas mientras lo que viste está fresco. Toma unos minutos.</p>
              <div className="row wrap" style={{ justifyContent: 'center', marginTop: 8 }}>
                <button className="btn lg" onClick={() => engineRef.current?.play()}>
                  <RotateCcw size={18} /> Ver de nuevo
                </button>
                <button className="btn lg" onClick={() => setAskExport(true)}>
                  <Download size={18} /> Exportar video
                </button>
                <button
                  className="btn primary lg"
                  onClick={() => {
                    close();
                    const s = useStore.getState();
                    s.setReviewWeek(week);
                    s.go('domingo');
                    setTimeout(() => document.getElementById('revision')?.scrollIntoView({ behavior: 'smooth' }), 400);
                  }}
                >
                  <ClipboardCheck size={18} /> Ir a la revisión
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* exportar */}
      <AnimatePresence>
        {askExport && (
          <motion.div className="overlay" style={{ position: 'absolute' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAskExport(false)}>
            <motion.div className="modal" style={{ width: 'min(480px,100%)', padding: 26 }} initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ fontSize: 22 }}>Exportar la película</h3>
              <p className="muted small" style={{ marginTop: 8 }}>
                Se graba en tiempo real ({fmtDuration(film.duration)}). Mantén esta ventana visible mientras termina. Obtendrás un archivo de video para guardar como memoria de la semana.
              </p>
              <div className="row" style={{ marginTop: 18, gap: 10 }}>
                <button className="btn grow" onClick={() => startExport(false)}>720p · más ligero</button>
                <button className="btn primary grow" onClick={() => startExport(true)}>1080p · máxima calidad</button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {exporting && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'absolute', left: '50%', bottom: 28, transform: 'translateX(-50%)', width: 'min(520px, calc(100% - 32px))' }}>
            <div className="card" style={{ padding: 18 }}>
              <div className="row between">
                <div className="row small" style={{ fontWeight: 650 }}>
                  <span className="pulse" style={{ width: 9, height: 9, borderRadius: 9, background: '#f43f5e' }} /> Exportando · {Math.round(exporting.p * 100)}%
                </div>
                <button className="btn sm danger" onClick={() => exporting.job.cancel()}>Cancelar</button>
              </div>
              <div style={{ height: 6, borderRadius: 6, background: 'rgba(255,255,255,.1)', marginTop: 12, overflow: 'hidden' }}>
                <div style={{ width: `${exporting.p * 100}%`, height: '100%', background: 'linear-gradient(90deg,#6d8bff,#a78bfa)', transition: 'width .25s' }} />
              </div>
              <p className="tiny muted" style={{ marginTop: 8 }}>No cambies de pestaña: el navegador pausa el dibujo en segundo plano.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
