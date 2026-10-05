import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, FolderSync, Video, Sparkles, Check, ChevronUp, ChevronDown } from 'lucide-react';
import { useStore } from '../store';
import { AreaIcon, Logo, Switch } from '../components/ui';
import { sound } from '../lib/sound';
import { weekKey } from '../lib/time';
import { MOMENTS } from '../lib/content';
import { SheetPanel, TurnosWeek } from '../components/Turnos';

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [path, setPath] = useState<'carpeta' | 'camara' | 'demo'>('carpeta');
  const areas = useStore((s) => s.areas);
  const setAreas = useStore((s) => s.setAreas);
  const setSettings = useStore((s) => s.setSettings);
  const settings = useStore((s) => s.settings);
  const sorted = [...areas].sort((x, y) => x.order - y.order);
  const move = (id: string, dir: -1 | 1) => {
    const i = sorted.findIndex((x) => x.id === id);
    const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    const next = [...sorted];
    [next[i], next[j]] = [next[j], next[i]];
    setAreas(next.map((x, k) => ({ ...x, order: k })));
    sound.play('tap');
  };
  const linkFolder = useStore((s) => s.linkFolder);
  const loadDemo = useStore((s) => s.loadDemo);
  const go = useStore((s) => s.go);
  const openFilm = useStore((s) => s.openFilm);
  const supportsFolders = 'showDirectoryPicker' in window;

  const finish = async () => {
    setSettings({ onboarded: true, userName: name.trim() || settings.userName });
    sound.play('seal');
    if (path === 'demo') {
      await loadDemo();
      go('hoy');
      setTimeout(() => openFilm(weekKey(Date.now())), 600);
    } else if (path === 'camara') go('camara');
    else go('evidencia');
  };

  return (
    <div style={{ minHeight: '100%', display: 'grid', placeItems: 'center', padding: 20, position: 'relative', zIndex: 1 }}>
      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div key="s0" className="col" style={{ alignItems: 'center', textAlign: 'center', maxWidth: 760, gap: 0 }} exit={{ opacity: 0, y: -20 }}>
            <motion.div initial={{ scale: 0.4, opacity: 0, rotate: -20 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 180, damping: 14 }} className="brand-mark" style={{ width: 92, height: 92, borderRadius: 28 }}>
              <Logo size={50} />
            </motion.div>
            <motion.h1 initial={{ opacity: 0, letterSpacing: '0.6em' }} animate={{ opacity: 1, letterSpacing: '0.22em' }} transition={{ delay: 0.3, duration: 1.2, ease: [0.22, 1, 0.36, 1] }} style={{ fontSize: 'clamp(44px,8vw,84px)', marginTop: 26, paddingLeft: '0.22em' }}>
              BÚNKER
            </motion.h1>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }} className="eyebrow" style={{ letterSpacing: '.5em', color: '#AFC0FF' }}>
              EVIDENCE ENGINE
            </motion.div>
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.3 }} style={{ fontSize: 'clamp(18px,2.4vw,24px)', marginTop: 28, fontFamily: 'var(--font-d)' }}>
              “Yo grabo. El sistema hace el resto.”
            </motion.p>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.7 }} className="grid g-3" style={{ marginTop: 36, gap: 12, width: '100%' }}>
              {[
                { t: 'Graba', d: 'Un toque. El video se guarda solo y se clasifica por tu rutina.', c: '#F43F5E', i: 'camara' },
                { t: 'Olvídate', d: 'Búnker organiza, analiza y edita en segundo plano.', c: '#6D8BFF', i: 'energia' },
                { t: 'Domingo', d: 'Una película de tu semana, métricas honestas y una mejora.', c: '#34D399', i: 'meta' },
              ].map((x, i) => (
                <motion.div key={x.t} className="card" style={{ textAlign: 'left', padding: 18 }} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.8 + i * 0.12 }}>
                  <AreaIcon area={{ icon: x.i, color: x.c }} size={40} />
                  <h3 style={{ fontSize: 18, marginTop: 12 }}>{x.t}</h3>
                  <p className="small muted" style={{ marginTop: 4 }}>{x.d}</p>
                </motion.div>
              ))}
            </motion.div>
            <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.3 }} className="btn primary lg" style={{ marginTop: 34 }} onClick={() => { sound.play('intro'); setStep(1); }}>
              Construir mi sistema <ArrowRight size={18} />
            </motion.button>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.6 }} className="tiny faint" style={{ marginTop: 14 }}>
              Todo se guarda solo en este dispositivo. Sin cuentas, sin nube, sin anuncios.
            </motion.p>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div key="s1" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="card" style={{ width: 'min(760px,100%)', padding: 28 }}>
            <div className="eyebrow">Paso 1 de 3 · tu rutina</div>
            <h2 style={{ fontSize: 30, marginTop: 6 }}>Sin horarios. Solo el orden.</h2>
            <p className="muted" style={{ marginTop: 6 }}>
              Tus turnos cambian, así que Búnker no usa el reloj: reconoce cada video por el <b style={{ color: 'var(--text-2)' }}>orden</b> en que haces tu rutina y si fue antes o después del trabajo.
            </p>
            <div className="field" style={{ marginTop: 18 }}>
              <label>¿Cómo te llamas?</label>
              <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" />
            </div>
            <div className="col" style={{ marginTop: 16, gap: 6, maxHeight: '44vh', overflow: 'auto', paddingRight: 4 }}>
              {sorted.map((a, i) => (
                <motion.div key={a.id} layout className="row wrap" style={{ gap: 10, padding: '8px 10px', borderRadius: 14, background: 'rgba(255,255,255,.025)', opacity: a.active ? 1 : 0.5 }}>
                  <div className="col" style={{ gap: 0 }}>
                    <button className="btn icon sm ghost" style={{ height: 18 }} onClick={() => move(a.id, -1)} disabled={i === 0} aria-label="Subir"><ChevronUp size={14} /></button>
                    <button className="btn icon sm ghost" style={{ height: 18 }} onClick={() => move(a.id, 1)} disabled={i === sorted.length - 1} aria-label="Bajar"><ChevronDown size={14} /></button>
                  </div>
                  <AreaIcon area={a} size={36} />
                  <b className="grow" style={{ minWidth: 100 }}>{a.name}</b>
                  <div className="row" style={{ gap: 4 }}>
                    {MOMENTS.map((m) => (
                      <button key={m.id} title={m.hint} className={`chip${a.moment === m.id ? ' on' : ''}`} style={{ ['--c' as string]: a.color, height: 28, fontSize: 12, padding: '0 10px' }} onClick={() => setAreas(areas.map((x) => (x.id === a.id ? { ...x, moment: m.id } : x)))}>
                        {m.id === 'antes' ? 'Antes' : m.id === 'despues' ? 'Después' : 'Cuando sea'}
                      </button>
                    ))}
                  </div>
                  <Switch on={a.active} onChange={(v) => setAreas(areas.map((x) => (x.id === a.id ? { ...x, active: v } : x)))} />
                </motion.div>
              ))}
            </div>
            <p className="tiny faint" style={{ marginTop: 8 }}>Antes / Después = respecto a tu turno de trabajo. En días de descanso todo vale.</p>
            <div className="row between" style={{ marginTop: 22 }}>
              <button className="btn ghost" onClick={() => setStep(0)}>Atrás</button>
              <button className="btn primary lg" onClick={() => { sound.play('pop'); setSettings({ userName: name.trim(), scheduleName: settings.scheduleName || name.trim() }); setStep(2); }}>
                Siguiente <ArrowRight size={18} />
              </button>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="s2" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="card" style={{ width: 'min(760px,100%)', padding: 28 }}>
            <div className="eyebrow">Paso 2 de 3 · tus turnos</div>
            <h2 style={{ fontSize: 30, marginTop: 6 }}>¿Trabajas por turnos rotativos?</h2>
            <p className="muted" style={{ marginTop: 6 }}>
              Vincula tu hoja de horarios y Búnker leerá solo tu fila, cada vez que la actualices. O marca la semana con un toque por día. Es opcional, pero hace más precisa la clasificación y te muestra cómo rinde tu rutina según el turno.
            </p>
            <div style={{ marginTop: 18 }}>
              <SheetPanel />
            </div>
            <div className="sep" />
            <div className="label" style={{ marginBottom: 8 }}>O márcala a mano (esta semana)</div>
            <TurnosWeek week={weekKey(Date.now())} compact />
            <div className="row between" style={{ marginTop: 22 }}>
              <button className="btn ghost" onClick={() => setStep(1)}>Atrás</button>
              <button className="btn primary lg" onClick={() => { sound.play('pop'); setStep(3); }}>
                Siguiente <ArrowRight size={18} />
              </button>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div key="s3" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="card" style={{ width: 'min(760px,100%)', padding: 28 }}>
            <div className="eyebrow">Paso 3 de 3 · captura</div>
            <h2 style={{ fontSize: 30, marginTop: 6 }}>¿Cómo vas a grabar?</h2>
            <div className="col" style={{ marginTop: 18, gap: 10 }}>
              {[
                { id: 'carpeta' as const, icon: <FolderSync size={22} />, t: 'Con la cámara de mi celular', d: supportsFolders ? 'Tus videos se sincronizan a una carpeta del computador (Drive, OneDrive, Fotos). Búnker la vigila y los importa solo.' : 'Importarás los videos desde tu galería con un toque.' },
                { id: 'camara' as const, icon: <Video size={22} />, t: 'Con la Búnker Camera', d: 'Grabas dentro de la app: área preseleccionada, guardado seguro cada segundo, marcadores de momentos.' },
                { id: 'demo' as const, icon: <Sparkles size={22} />, t: 'Primero muéstrame una semana demo', d: 'Carga 3 semanas de ejemplo y abre la película para que veas el resultado final.' },
              ].map((o) => (
                <button key={o.id} className="card row" style={{ textAlign: 'left', gap: 16, padding: 18, borderColor: path === o.id ? 'rgba(109,139,255,.6)' : undefined, background: path === o.id ? 'rgba(109,139,255,.1)' : undefined }} onClick={() => { sound.play('tap'); setPath(o.id); }}>
                  <span style={{ width: 46, height: 46, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent)', flexShrink: 0 }}>{o.icon}</span>
                  <span className="grow">
                    <b>{o.t}</b>
                    <p className="small muted" style={{ marginTop: 3 }}>{o.d}</p>
                  </span>
                  {path === o.id && <Check size={20} color="var(--accent)" />}
                </button>
              ))}
            </div>
            {path === 'carpeta' && supportsFolders && (
              <button className="btn" style={{ marginTop: 14 }} onClick={() => linkFolder()}>
                <FolderSync size={16} /> Vincular la carpeta ahora (opcional)
              </button>
            )}
            <div className="row between" style={{ marginTop: 22 }}>
              <button className="btn ghost" onClick={() => setStep(2)}>Atrás</button>
              <button className="btn primary lg" onClick={finish}>
                Activar mi Búnker <ArrowRight size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
