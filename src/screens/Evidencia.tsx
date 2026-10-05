import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, FolderSync, Upload, RefreshCw, HelpCircle, FolderOpen, Sparkles, Trash2 } from 'lucide-react';
import { useStore, needsConfirm } from '../store';
import { AreaIcon, ClipThumb, Empty, Section } from '../components/ui';
import { DAY_NAMES, fmtDuration, hm, isoWeekday, shiftWeek, weekDays, weekKey, weekLabel, weekNumber } from '../lib/time';
import { sound } from '../lib/sound';

export default function Evidencia() {
  const clips = useStore((s) => s.clips);
  const areas = useStore((s) => s.areas);
  const folders = useStore((s) => s.folders);
  const ignoreClip = useStore((s) => s.ignoreClip);
  const updateClip = useStore((s) => s.updateClip);
  const linkFolder = useStore((s) => s.linkFolder);
  const scanAll = useStore((s) => s.scanAll);
  const importFiles = useStore((s) => s.importFiles);
  const assignArea = useStore((s) => s.assignArea);
  const openClip = useStore((s) => s.openClip);
  const queue = useStore((s) => s.queue);
  const clearDemo = useStore((s) => s.clearDemo);
  const [week, setWeek] = useState(weekKey(Date.now()));
  const [filter, setFilter] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const supportsFolders = 'showDirectoryPicker' in window;
  const hasDemo = clips.some((c) => c.source === 'demo');

  const inbox = useMemo(() => clips.filter(needsConfirm).sort((a, b) => b.takenAt - a.takenAt), [clips]);
  const weekClips = useMemo(
    () => clips.filter((c) => c.week === week && (!filter || (filter === 'none' ? !c.areaId : c.areaId === filter))).sort((a, b) => a.takenAt - b.takenAt),
    [clips, week, filter],
  );
  const days = weekDays(week);
  const byDay = days.map((_, i) => weekClips.filter((c) => isoWeekday(new Date(c.takenAt)) - 1 === i));
  const active = areas.filter((a) => a.active).sort((a, b) => a.order - b.order);
  const isCurrent = week === weekKey(Date.now());

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Archivo de evidencia</div>
          <h1 className="title">Todo llega solo, todo en su lugar.</h1>
          <p className="subtitle">Sin etiquetar, sin renombrar, sin mover archivos. Los originales nunca se tocan.</p>
        </div>
        <div className="row wrap">
          <input ref={fileRef} type="file" accept="video/*" multiple hidden onChange={(e) => { importFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <Upload size={16} /> Importar videos
          </button>
          {supportsFolders && (
            <button className="btn primary" onClick={() => linkFolder()}>
              <FolderSync size={16} /> Vincular carpeta
            </button>
          )}
        </div>
      </div>

      {/* carpetas vinculadas */}
      {folders.length > 0 && (
        <div className="card" style={{ marginBottom: 18, padding: 16 }}>
          <div className="row wrap between">
            <div className="row wrap" style={{ gap: 14 }}>
              {folders.map((f) => (
                <div key={f.id} className="row" style={{ gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                    <FolderOpen size={18} />
                  </div>
                  <div>
                    <div className="small" style={{ fontWeight: 650 }}>{f.name}</div>
                    <div className="tiny muted">
                      {f.lastScan ? `Revisada ${new Date(f.lastScan).toLocaleString('es', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Sin revisar'} · {f.found ?? 0} importados
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn sm" onClick={() => { sound.play('tap'); scanAll(true); }} disabled={queue.running}>
              <RefreshCw size={14} className={queue.running ? 'spin' : ''} /> {queue.running ? `Procesando ${queue.done}/${queue.total}` : 'Sincronizar ahora'}
            </button>
          </div>
        </div>
      )}

      {hasDemo && (
        <div className="card row wrap between" style={{ marginBottom: 18, padding: 14, borderColor: 'rgba(245,185,74,.3)' }}>
          <div className="row small">
            <Sparkles size={16} color="var(--warn)" /> Estás viendo datos de demostración mezclados con tu evidencia.
          </div>
          <button className="btn sm danger" onClick={() => clearDemo()}>
            <Trash2 size={14} /> Borrar demo
          </button>
        </div>
      )}

      {/* bandeja por confirmar */}
      <AnimatePresence>
        {inbox.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
            <Section
              eyebrow="Solo cuando hay duda real"
              title={`${inbox.length} ${inbox.length === 1 ? 'evidencia necesita' : 'evidencias necesitan'} un toque`}
              right={<span className="row tiny muted"><HelpCircle size={14} /> Cada respuesta ordena el resto del día y enseña duraciones</span>}
              style={{ marginBottom: 18, borderColor: 'rgba(245,185,74,.25)' }}
            >
              <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 6 }}>
                <AnimatePresence>
                  {inbox.slice(0, 12).map((c) => {
                    const order = [...new Set([...(c.alts ?? []), ...(c.areaId ? [c.areaId] : []), ...active.map((a) => a.id)])];
                    return (
                      <motion.div
                        key={c.id}
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8, y: -20 }}
                        style={{ width: 260, flexShrink: 0 }}
                      >
                        <ClipThumb clip={c} area={areas.find((a) => a.id === c.areaId)} onClick={() => openClip(c.id)} showDate />
                        <div className="tiny muted" style={{ margin: '8px 2px 6px' }}>
                          {DAY_NAMES[isoWeekday(new Date(c.takenAt)) - 1]} {hm(c.takenAt)} · {fmtDuration(c.duration)} — ¿qué es?
                        </div>
                        <div className="row wrap" style={{ gap: 6 }}>
                          {order.slice(0, 5).map((id) => {
                            const a = areas.find((x) => x.id === id)!;
                            if (!a) return null;
                            return (
                              <button
                                key={id}
                                className="chip"
                                style={{ ['--c' as string]: a.color, height: 30, fontSize: 12.5 }}
                                onClick={() => {
                                  sound.play('pop');
                                  assignArea(c.id, id);
                                }}
                              >
                                <span className="dot" /> {a.name}
                              </button>
                            );
                          })}
                          <button
                            className="chip"
                            style={{ height: 30, fontSize: 12.5, color: 'var(--muted)' }}
                            title="Videos personales que llegaron de la galería: no entran a la película"
                            onClick={() => {
                              sound.play('tap');
                              ignoreClip(c.id);
                            }}
                          >
                            No es de mi rutina
                          </button>
                        </div>
                        {c.lapse && !c.speed && (
                          <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                            <span className="tiny muted">Time-lapse, ¿a qué velocidad?</span>
                            {[5, 10, 15].map((f) => (
                              <button
                                key={f}
                                className="chip"
                                style={{ height: 26, fontSize: 12, padding: '0 9px', ['--c' as string]: '#38BDF8' }}
                                onClick={() => {
                                  sound.play('tap');
                                  updateClip(c.id, { speed: f, lapse: true, speedBy: 'manual' });
                                }}
                              >
                                ×{f}
                              </button>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </Section>
          </motion.div>
        )}
      </AnimatePresence>

      {/* semana */}
      <div className="row wrap between" style={{ marginBottom: 14, gap: 12 }}>
        <div className="row">
          <button className="btn icon sm" onClick={() => setWeek(shiftWeek(week, -1))} aria-label="Semana anterior">
            <ChevronLeft size={16} />
          </button>
          <div style={{ minWidth: 200, textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-d)', fontWeight: 700, fontSize: 18 }}>Semana {weekNumber(week)}{isCurrent ? ' · actual' : ''}</div>
            <div className="tiny muted">{weekLabel(week)}</div>
          </div>
          <button className="btn icon sm" onClick={() => setWeek(shiftWeek(week, 1))} disabled={isCurrent} aria-label="Semana siguiente">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          <button className={`chip${!filter ? ' on' : ''}`} onClick={() => setFilter(null)}>Todas</button>
          {active.map((a) => (
            <button key={a.id} className={`chip${filter === a.id ? ' on' : ''}`} style={{ ['--c' as string]: a.color }} onClick={() => setFilter(filter === a.id ? null : a.id)}>
              <span className="dot" /> {a.name}
            </button>
          ))}
          <button className={`chip${filter === 'none' ? ' on' : ''}`} onClick={() => setFilter(filter === 'none' ? null : 'none')}>Sin área</button>
        </div>
      </div>

      {weekClips.length === 0 ? (
        <div className="card">
          <Empty
            icon={<FolderSync />}
            title="Sin evidencia en esta semana"
            text={supportsFolders ? 'Vincula la carpeta donde se sincronizan los videos de tu celular, arrastra videos a esta ventana, o graba con la Búnker Camera.' : 'Importa videos o graba con la Búnker Camera.'}
            action={
              supportsFolders ? (
                <button className="btn primary" onClick={() => linkFolder()}>
                  <FolderSync size={16} /> Vincular carpeta
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="col" style={{ gap: 22 }}>
          {byDay.map((list, i) =>
            list.length ? (
              <div key={i}>
                <div className="row" style={{ marginBottom: 10, gap: 12 }}>
                  <h3 style={{ fontSize: 17 }}>{DAY_NAMES[i]}</h3>
                  <span className="muted small">{days[i].getDate()}/{days[i].getMonth() + 1}</span>
                  <div className="row" style={{ gap: 4 }}>
                    {[...new Set(list.map((c) => c.areaId))].map((id) => {
                      const a = areas.find((x) => x.id === id);
                      return a ? <AreaIcon key={id} area={a} size={20} /> : null;
                    })}
                  </div>
                  <span className="tiny muted mono" style={{ marginLeft: 'auto' }}>
                    {list.length} · {fmtDuration(list.reduce((s, c) => s + c.duration, 0), true)}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
                  {list.map((c) => (
                    <ClipThumb key={c.id} clip={c} area={areas.find((a) => a.id === c.areaId)} onClick={() => openClip(c.id)} />
                  ))}
                </div>
              </div>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
