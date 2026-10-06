import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X, Star, EyeOff, Eye, Trash2, Calendar, HardDrive, Info, KeyRound, Upload } from 'lucide-react';
import { useStore } from '../store';
import { AreaIcon } from '../components/ui';
import { clipFile } from '../lib/db';
import { KIND_INFO } from '../lib/content';
import { fmtBytes, fmtDayLong, fmtDuration, hm } from '../lib/time';
import type { ClipKind } from '../lib/types';
import { sound } from '../lib/sound';

const BY: Record<string, string> = {
  rutina: 'por el orden de tu rutina, su duración y tu turno',
  horario: 'por su hora fija',
  aprendido: 'por lo aprendido de tus correcciones',
  nombre: 'por el nombre del archivo',
  manual: 'elegida por ti',
  camara: 'elegida al grabar',
  ninguno: 'sin pistas suficientes',
};

const DATE_BY: Record<string, string> = {
  nombre: 'leída del nombre del archivo',
  metadatos: 'leída de los metadatos del video',
  archivo: 'fecha de modificación del archivo',
  grabacion: 'momento de la grabación',
};

export default function ClipModal({ id }: { id: string }) {
  const clip = useStore((s) => s.clips.find((c) => c.id === id));
  const areas = useStore((s) => s.areas);
  const close = () => useStore.getState().openClip(null);
  const assignArea = useStore((s) => s.assignArea);
  const updateClip = useStore((s) => s.updateClip);
  const removeClip = useStore((s) => s.removeClip);
  const importFiles = useStore((s) => s.importFiles);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [needsPerm, setNeedsPerm] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const load = async (ask: boolean) => {
    if (!clip || clip.source === 'demo') return;
    const f = await clipFile(clip, ask);
    if (f) {
      setUrl(URL.createObjectURL(f));
      setNeedsPerm(false);
    } else setNeedsPerm(true);
  };

  useEffect(() => {
    load(false);
    return () => setUrl((u) => (u && URL.revokeObjectURL(u), null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!clip) return null;
  const area = areas.find((a) => a.id === clip.areaId);
  const own = !!clip.blobKey; // hay una copia dentro de la app (grabaciones propias o importaciones antiguas)

  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
      <motion.div className="modal" initial={{ y: 30, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ position: 'relative', background: '#000', borderRadius: '28px 28px 0 0', overflow: 'hidden', aspectRatio: '16/9', maxHeight: '56vh', width: '100%' }}>
          {url ? (
            <video ref={videoRef} src={url} controls autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : clip.thumb ? (
            <img src={clip.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'brightness(.6)' }} />
          ) : null}
          {needsPerm && clip.handleKey && (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
              <button className="btn primary" onClick={() => load(true)}>
                <KeyRound size={16} /> Permitir acceso al archivo original
              </button>
            </div>
          )}
          {needsPerm && !clip.handleKey && !clip.blobKey && (
            // importado desde la galería: el video no se copió; elegirlo de nuevo lo reconecta
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: '16px 56px 16px 16px', textAlign: 'center' }}>
              <div className="col" style={{ gap: 8, alignItems: 'center', maxWidth: 340 }}>
                <div style={{ fontSize: 12.5, lineHeight: 1.4, color: '#fff', background: 'rgba(0,0,0,.6)', borderRadius: 14, padding: '7px 12px' }}>
                  Sigue en tu galería, no se copió.
                  <div style={{ opacity: 0.7, fontSize: 11.5, wordBreak: 'break-all' }}>{clip.name}</div>
                </div>
                <input ref={galleryRef} type="file" accept="video/*" multiple hidden onChange={async (e) => { await importFiles([...(e.target.files ?? [])]); e.target.value = ''; load(false); }} />
                <button className="btn primary sm" onClick={() => galleryRef.current?.click()}>
                  <Upload size={15} /> Elegir en la galería
                </button>
              </div>
            </div>
          )}
          {clip.source === 'demo' && (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
              <span className="glass-pill" style={{ fontSize: 13, padding: '8px 14px' }}>Clip de demostración · se ve completo en la película</span>
            </div>
          )}
          <button className="btn icon" style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(0,0,0,.5)' }} onClick={close} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: 24 }} className="col">
          <div className="row wrap between">
            <div className="row" style={{ gap: 14 }}>
              <AreaIcon area={area} size={52} />
              <div>
                <h2 style={{ fontSize: 24 }}>{area?.name ?? 'Sin clasificar'}</h2>
                <div className="muted small">
                  {fmtDayLong(clip.takenAt)} · {hm(clip.takenAt)} · {fmtDuration(clip.duration)}
                </div>
              </div>
            </div>
            <div className="row">
              <button
                className={`btn sm${clip.starred ? ' primary' : ''}`}
                onClick={() => {
                  sound.play('marker');
                  updateClip(clip.id, { starred: !clip.starred });
                }}
              >
                <Star size={14} fill={clip.starred ? 'currentColor' : 'none'} /> {clip.starred ? 'Destacado' : 'Destacar'}
              </button>
              <button className="btn sm" onClick={() => updateClip(clip.id, { excluded: !clip.excluded })}>
                {clip.excluded ? <Eye size={14} /> : <EyeOff size={14} />} {clip.excluded ? 'Incluir en la película' : 'Excluir de la película'}
              </button>
            </div>
          </div>

          <div className="sep" />
          <div className="label">Área</div>
          <div className="row wrap" style={{ gap: 6 }}>
            {areas.filter((a) => a.active).sort((a, b) => a.order - b.order).map((a) => (
              <button
                key={a.id}
                className={`chip${clip.areaId === a.id ? ' on' : ''}`}
                style={{ ['--c' as string]: a.color }}
                onClick={() => {
                  sound.play('pop');
                  assignArea(clip.id, a.id);
                }}
              >
                <span className="dot" /> {a.name}
              </button>
            ))}
          </div>
          <div className="tiny muted row" style={{ gap: 6 }}>
            <Info size={12} /> Asignada {BY[clip.areaBy]}
            {clip.areaBy !== 'manual' && clip.areaBy !== 'camara' && ` · confianza ${Math.round(clip.confidence * 100)}%`}
          </div>

          <div className="label" style={{ marginTop: 10 }}>Tratamiento en la película</div>
          <div className="row wrap" style={{ gap: 6 }}>
            {(Object.keys(KIND_INFO) as ClipKind[]).map((k) => (
              <button key={k} className={`chip${clip.kind === k ? ' on' : ''}`} title={KIND_INFO[k].desc} onClick={() => updateClip(clip.id, { kind: k, kindBy: 'manual' })}>
                {KIND_INFO[k].name} · <span className="muted">{KIND_INFO[k].treatment}</span>
              </button>
            ))}
          </div>
          <p className="tiny muted">{KIND_INFO[clip.kind].desc}</p>

          {clip.source !== 'demo' && clip.source !== 'camara' && clip.source !== 'pantalla' && (
            <>
              <div className="label" style={{ marginTop: 10 }}>Velocidad de grabación</div>
              <div className="row wrap" style={{ gap: 6 }}>
                {[1, 5, 10, 15, 30].map((f) => {
                  const cur = clip.lapse ? Math.round((clip.realDuration ?? clip.duration) / Math.max(1, clip.duration)) : 1;
                  return (
                    <button
                      key={f}
                      className={`chip${cur === f ? ' on' : ''}`}
                      onClick={() => updateClip(clip.id, { speed: f, lapse: f > 1, speedBy: 'manual' })}
                    >
                      {f === 1 ? 'Normal' : `Time-lapse ×${f}`}
                    </button>
                  );
                })}
              </div>
              <p className="tiny muted">
                {clip.lapse
                  ? `Archivo de ${fmtDuration(clip.duration)} → sesión real de ≈ ${fmtDuration(clip.realDuration ?? clip.duration, true)}${clip.speedBy === 'manual' ? ' (velocidad elegida por ti)' : clip.speed ? ' (velocidad leída de los metadatos)' : ' (time-lapse detectado: el video no tiene audio)'}.`
                  : 'Si lo grabaste en time-lapse, elige la velocidad: así cuenta el tiempo real y se clasifica mejor.'}
              </p>
            </>
          )}

          {clip.markers.length > 0 && (
            <>
              <div className="label" style={{ marginTop: 10 }}>Momentos marcados</div>
              <div className="row wrap" style={{ gap: 6 }}>
                {clip.markers.map((m) => (
                  <button key={m} className="chip" style={{ ['--c' as string]: '#F5B94A' }} onClick={() => videoRef.current && (videoRef.current.currentTime = Math.max(0, m - 3))}>
                    <Star size={12} fill="#F5B94A" color="#F5B94A" /> {fmtDuration(m)}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="field" style={{ marginTop: 10 }}>
            <label>Nota (opcional)</label>
            <input className="input" defaultValue={clip.note ?? ''} placeholder="Algo que quieras recordar el domingo…" onBlur={(e) => updateClip(clip.id, { note: e.target.value })} />
          </div>

          <div className="sep" />
          <div className="row wrap between">
            <div className="col tiny muted" style={{ gap: 4 }}>
              <span className="row" style={{ gap: 6 }}>
                <Calendar size={12} /> Fecha {DATE_BY[clip.dateBy]}
              </span>
              <span className="row" style={{ gap: 6 }}>
                <HardDrive size={12} />
                {clip.source === 'carpeta' ? `Original en tu carpeta: ${clip.relPath}` : clip.source === 'demo' ? 'Demostración' : `${fmtBytes(clip.size)} guardados en este dispositivo`}
              </span>
            </div>
            {confirmDel ? (
              <div className="row">
                <span className="small muted">{own ? '¿Borrar este video de Búnker?' : 'Se quita de Búnker; el archivo original se conserva.'}</span>
                <button className="btn sm" onClick={() => setConfirmDel(false)}>Cancelar</button>
                <button className="btn sm danger" onClick={() => removeClip(clip.id)}>Confirmar</button>
              </div>
            ) : (
              <button className="btn sm danger" onClick={() => setConfirmDel(true)}>
                <Trash2 size={14} /> Quitar
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
