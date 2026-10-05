import { useEffect, useRef, useState, type ReactElement } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Clapperboard, Compass, House, LayoutGrid, Settings2, Video, Wind, Upload, Loader2 } from 'lucide-react';
import { useStore, needsConfirm, type Route } from './store';
import { Logo, Toasts, pageMotion } from './components/ui';
import { sound } from './lib/sound';
import { fmtBytes, isoWeekday, weekKey } from './lib/time';
import Hoy from './screens/Hoy';
import Camara from './screens/Camara';
import Evidencia from './screens/Evidencia';
import Domingo from './screens/Domingo';
import Brujula from './screens/Brujula';
import Ajustes from './screens/Ajustes';
import Onboarding from './screens/Onboarding';
import FilmPlayer from './screens/FilmPlayer';
import ClipModal from './screens/ClipModal';
import Calma from './screens/Calma';
import { TurnosModal } from './components/Turnos';

const NAV: { id: Route; label: string; icon: typeof House }[] = [
  { id: 'hoy', label: 'Hoy', icon: House },
  { id: 'camara', label: 'Cámara', icon: Video },
  { id: 'evidencia', label: 'Evidencia', icon: LayoutGrid },
  { id: 'domingo', label: 'Domingo', icon: Clapperboard },
  { id: 'brujula', label: 'Brújula', icon: Compass },
  { id: 'ajustes', label: 'Ajustes', icon: Settings2 },
];

function Nav() {
  const route = useStore((s) => s.route);
  const go = useStore((s) => s.go);
  const clips = useStore((s) => s.clips);
  const queue = useStore((s) => s.queue);
  const storage = useStore((s) => s.storage);
  const reviews = useStore((s) => s.reviews);
  const setCalm = useStore((s) => s.setCalm);
  const pending = clips.filter(needsConfirm).length;
  const isSunday = isoWeekday(new Date()) === 7;
  const sealed = !!reviews[weekKey(Date.now())]?.sealedAt;
  return (
    <nav className="nav">
      <div className="brand">
        <div className="brand-mark">
          <Logo />
        </div>
        <div>
          <div className="brand-name">BÚNKER</div>
          <div className="brand-sub">Evidence Engine</div>
        </div>
      </div>
      {NAV.map((n) => (
        <button
          key={n.id}
          className={`nav-item${route === n.id ? ' active' : ''}`}
          onClick={() => {
            sound.play('tap');
            go(n.id);
          }}
        >
          {route === n.id && <motion.span layoutId="navpill" className="pill-bg" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
          <n.icon size={19} strokeWidth={1.9} />
          {n.label}
          {n.id === 'evidencia' && pending > 0 && <span className="badge" style={{ ['--c' as string]: '#F5B94A' }}>{pending}</span>}
          {n.id === 'domingo' && isSunday && !sealed && <span className="badge pulse" style={{ ['--c' as string]: '#34D399' }}>HOY</span>}
        </button>
      ))}
      <button className="nav-item" style={{ marginTop: 14 }} onClick={() => setCalm(true)}>
        <Wind size={19} strokeWidth={1.9} />
        Modo calma
      </button>
      <div className="nav-foot">
        {queue.running ? (
          <div className="row" style={{ color: 'var(--text-2)' }}>
            <Loader2 size={15} className="spin" />
            Procesando {queue.done}/{queue.total}
          </div>
        ) : (
          <div className="row">
            <span style={{ width: 7, height: 7, borderRadius: 9, background: 'var(--ok)', boxShadow: '0 0 10px var(--ok)' }} />
            Sistema al día
          </div>
        )}
        <div className="tiny faint" style={{ marginTop: 6 }}>
          {fmtBytes(storage.usage)} en este dispositivo · {clips.length} evidencias
        </div>
      </div>
    </nav>
  );
}

function MobileBar() {
  const route = useStore((s) => s.route);
  const go = useStore((s) => s.go);
  const items = NAV.filter((n) => n.id !== 'ajustes');
  return (
    <div className="mobile-bar">
      {items.map((n) =>
        n.id === 'camara' ? (
          <button key={n.id} className="rec-fab" aria-label="Grabar" onClick={() => { sound.play('tap'); go('camara'); }}>
            <Video size={24} />
          </button>
        ) : (
          <button key={n.id} className={route === n.id ? 'active' : ''} onClick={() => { sound.play('tap'); go(n.id); }}>
            <n.icon size={21} strokeWidth={1.9} />
            {n.label}
          </button>
        ),
      )}
    </div>
  );
}

function DropZone() {
  const importFiles = useStore((s) => s.importFiles);
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current++;
      setOver(true);
    };
    const leave = () => {
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setOver(false);
    };
    const overFn = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = async (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      const items = [...(e.dataTransfer?.items ?? [])].filter((i) => i.kind === 'file');
      type WithHandle = DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> };
      // con handles se enlaza el original sin copiarlo
      const handles = await Promise.all(items.map((i) => (i as WithHandle).getAsFileSystemHandle?.() ?? Promise.resolve(null)));
      const out: (File | FileSystemFileHandle)[] = [];
      handles.forEach((h, idx) => {
        if (h && h.kind === 'file') out.push(h as FileSystemFileHandle);
        else {
          const f = items[idx].getAsFile();
          if (f) out.push(f);
        }
      });
      if (out.length) {
        sound.play('pop');
        importFiles(out);
      }
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', overFn);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', overFn);
      window.removeEventListener('drop', drop);
    };
  }, [importFiles]);
  return (
    <AnimatePresence>
      {over && (
        <motion.div className="overlay" style={{ zIndex: 150, pointerEvents: 'none' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            className="card gradient-border"
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            style={{ padding: '48px 64px', textAlign: 'center', borderRadius: 32 }}
          >
            <Upload size={40} color="var(--accent)" />
            <h2 style={{ marginTop: 14, fontSize: 28 }}>Suelta tus videos</h2>
            <p className="muted" style={{ marginTop: 6 }}>Búnker detecta la fecha, el área y el tratamiento de cada uno.</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Splash() {
  return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="col" style={{ alignItems: 'center' }}>
        <div className="brand-mark" style={{ width: 64, height: 64, borderRadius: 20 }}>
          <Logo size={34} />
        </div>
        <div className="brand-name" style={{ fontSize: 22, marginTop: 10 }}>BÚNKER</div>
      </motion.div>
    </div>
  );
}

export default function App() {
  const ready = useStore((s) => s.ready);
  const onboarded = useStore((s) => s.settings.onboarded);
  const route = useStore((s) => s.route);
  const init = useStore((s) => s.init);
  const filmWeek = useStore((s) => s.filmWeek);
  const clipModal = useStore((s) => s.clipModal);
  const calmOpen = useStore((s) => s.calmOpen);
  const turnosOpen = useStore((s) => s.turnosOpen);

  useEffect(() => {
    init();
  }, [init]);

  // primer gesto: desbloquear el audio
  useEffect(() => {
    const unlock = () => {
      sound.ensure();
      window.removeEventListener('pointerdown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  const screens: Record<Route, ReactElement> = {
    hoy: <Hoy />,
    camara: <Camara />,
    evidencia: <Evidencia />,
    domingo: <Domingo />,
    brujula: <Brujula />,
    ajustes: <Ajustes />,
  };

  return (
    <>
      <div className="ambience">
        <div className="grid" />
      </div>
      {!ready ? (
        <Splash />
      ) : !onboarded ? (
        <Onboarding />
      ) : (
        <div className="app">
          <Nav />
          <main className="main">
            <AnimatePresence mode="wait">
              <motion.div key={route} {...pageMotion}>
                {screens[route]}
              </motion.div>
            </AnimatePresence>
          </main>
          <MobileBar />
          <DropZone />
        </div>
      )}
      <AnimatePresence>{filmWeek && <FilmPlayer key="film" week={filmWeek} />}</AnimatePresence>
      <AnimatePresence>{clipModal && <ClipModal key="clip" id={clipModal} />}</AnimatePresence>
      <AnimatePresence>{calmOpen && <Calma key="calm" />}</AnimatePresence>
      <AnimatePresence>{turnosOpen && <TurnosModal key="turnos" />}</AnimatePresence>
      <Toasts />
    </>
  );
}
