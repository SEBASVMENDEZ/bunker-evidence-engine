import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronUp, Plus, Trash2, Volume2, FolderOpen, Download, Upload, Sparkles, ShieldCheck, Smartphone, X } from 'lucide-react';
import { useStore } from '../store';
import { AreaIcon, Glyph, Section, Switch } from '../components/ui';
import { AREA_COLORS, KIND_INFO, LIFE_AREAS, MOMENTS } from '../lib/content';
import { durationModels } from '../lib/classify';
import { SheetPanel, TurnosWeek } from '../components/Turnos';
import { AREA_ICONS } from '../lib/icons';
import { DAY_SHORT, fmtBytes, uid } from '../lib/time';
import { sound, type Sfx } from '../lib/sound';
import type { Area, ClipKind, LifeArea } from '../lib/types';
import { weekKey } from '../lib/time';
import * as DB from '../lib/db';

export default function Ajustes() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const folders = useStore((s) => s.folders);
  const unlinkFolder = useStore((s) => s.unlinkFolder);
  const linkFolder = useStore((s) => s.linkFolder);
  const storage = useStore((s) => s.storage);
  const loadDemo = useStore((s) => s.loadDemo);
  const clearDemo = useStore((s) => s.clearDemo);
  const hasDemo = useStore((s) => s.clips.some((c) => c.source === 'demo'));
  const fileRef = useRef<HTMLInputElement>(null);

  const exportBackup = async () => {
    const s = useStore.getState();
    const data = {
      app: 'bunker-evidence-engine',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: s.settings,
      areas: s.areas,
      compass: s.compass,
      samples: s.samples,
      calm: s.calm,
      reviews: Object.values(s.reviews),
      daily: Object.values(s.daily),
      clips: s.clips.filter((c) => c.source !== 'demo'),
    };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bunker-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  };

  const importBackup = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      if (data.app !== 'bunker-evidence-engine') throw new Error('formato');
      await DB.kvSet('settings', data.settings);
      await DB.kvSet('areas', data.areas);
      await DB.kvSet('compass', data.compass);
      await DB.kvSet('samples', data.samples ?? []);
      await DB.kvSet('calm', data.calm ?? []);
      for (const r of data.reviews ?? []) await DB.putReview(r);
      for (const d of data.daily ?? []) await DB.putDaily(d);
      await DB.putClips(data.clips ?? []);
      location.reload();
    } catch {
      useStore.getState().toast('Ese archivo no es un respaldo válido de Búnker.', 'error');
    }
  };

  const sfx: [Sfx, string][] = [
    ['rec', 'REC'], ['saved', 'Guardado'], ['ready', 'Procesado'], ['error', 'Error'], ['intro', 'Intro'], ['chapter', 'Capítulo'], ['seal', 'Sellar'],
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Ajustes</div>
          <h1 className="title">La complejidad, solo una vez.</h1>
          <p className="subtitle">Configura aquí; el día a día queda en un solo toque.</p>
        </div>
      </div>

      <div className="grid" style={{ gap: 18 }}>
        <AreasEditor />

        <Section eyebrow="Turnos" title="Tus turnos de trabajo (rotativos)">
          <div className="grid g-2" style={{ gap: 18 }}>
            <div>
              <div className="label" style={{ marginBottom: 8 }}>Esta semana</div>
              <TurnosWeek week={weekKey(Date.now())} />
            </div>
            <SheetPanel />
          </div>
        </Section>

        <div className="grid g-2">
          <Section eyebrow="Película" title="Motor de la película semanal">
            <div className="col" style={{ gap: 14 }}>
              <div className="field">
                <label className="row between"><span>Duración objetivo</span><span className="mono muted">{settings.filmMinutes} min</span></label>
                <input type="range" min={3} max={20} value={settings.filmMinutes} onChange={(e) => setSettings({ filmMinutes: +e.target.value })} />
              </div>
              <div className="row between">
                <span className="small">Capítulos</span>
                <div className="row" style={{ gap: 6 }}>
                  <button className={`chip${settings.filmGrouping === 'area' ? ' on' : ''}`} onClick={() => setSettings({ filmGrouping: 'area' })}>Por área</button>
                  <button className={`chip${settings.filmGrouping === 'dia' ? ' on' : ''}`} onClick={() => setSettings({ filmGrouping: 'dia' })}>Por día</button>
                </div>
              </div>
              <div className="row between">
                <span className="small">Banda sonora generativa</span>
                <Switch on={settings.music} onChange={(v) => setSettings({ music: v })} />
              </div>
              <div className="sep" style={{ margin: '4px 0' }} />
              <div className="col" style={{ gap: 6 }}>
                {(Object.keys(KIND_INFO) as ClipKind[]).map((k) => (
                  <div key={k} className="row small" style={{ gap: 10 }}>
                    <span className="badge" style={{ minWidth: 88, justifyContent: 'center' }}>{KIND_INFO[k].treatment.toUpperCase()}</span>
                    <span><b>{KIND_INFO[k].name}.</b> <span className="muted">{KIND_INFO[k].desc}</span></span>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          <Section eyebrow="Sonido" title="Sistema de sonido propio">
            <div className="col" style={{ gap: 14 }}>
              <div className="row between">
                <span className="small">Efectos de interfaz</span>
                <Switch on={settings.sound} onChange={(v) => setSettings({ sound: v })} />
              </div>
              <div className="row" style={{ gap: 10 }}>
                <Volume2 size={16} className="muted" />
                <input type="range" min={0} max={1} step={0.05} value={settings.volume} onChange={(e) => setSettings({ volume: +e.target.value })} />
              </div>
              <div className="row between">
                <span className="small">Vibración en el celular</span>
                <Switch on={settings.haptics} onChange={(v) => setSettings({ haptics: v })} />
              </div>
              <div className="label">Escuchar</div>
              <div className="row wrap" style={{ gap: 6 }}>
                {sfx.map(([id, name]) => (
                  <button key={id} className="chip" onClick={() => sound.play(id, true)}>
                    <Volume2 size={13} /> {name}
                  </button>
                ))}
              </div>
            </div>
          </Section>

          <Section eyebrow="Ingesta" title="Carpetas vinculadas">
            <div className="col" style={{ gap: 10 }}>
              {folders.map((f) => (
                <div key={f.id} className="row" style={{ gap: 10 }}>
                  <FolderOpen size={18} color="var(--accent)" />
                  <span className="grow small">{f.name}</span>
                  <span className="tiny muted">{f.found ?? 0} videos</span>
                  <button className="btn icon sm ghost" onClick={() => unlinkFolder(f.id)} aria-label="Desvincular">
                    <X size={14} />
                  </button>
                </div>
              ))}
              {'showDirectoryPicker' in window ? (
                <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => linkFolder()}>
                  <Plus size={14} /> Vincular carpeta
                </button>
              ) : (
                <p className="tiny muted">Vincular carpetas requiere Chrome o Edge en el computador.</p>
              )}
              <div className="field" style={{ marginTop: 6 }}>
                <label className="row between"><span>Importar videos de las últimas</span><span className="mono muted">{settings.importWeeks} semanas</span></label>
                <input type="range" min={1} max={26} value={settings.importWeeks} onChange={(e) => setSettings({ importWeeks: +e.target.value })} />
                <span className="tiny faint">Evita recorrer años de galería. Los originales nunca se copian, mueven ni borran.</span>
              </div>
            </div>
          </Section>

          <Section eyebrow="Datos" title="Tu información es tuya">
            <div className="col" style={{ gap: 12 }}>
              <div className="row small" style={{ gap: 8 }}>
                <ShieldCheck size={16} color={storage.persisted ? 'var(--ok)' : 'var(--warn)'} />
                {storage.persisted ? 'Almacenamiento persistente activado' : 'Almacenamiento estándar (el navegador podría liberar espacio)'}
              </div>
              <div>
                <div className="row between tiny muted"><span>{fmtBytes(storage.usage)} usados</span><span>{fmtBytes(storage.quota)} disponibles</span></div>
                <div style={{ height: 6, borderRadius: 6, background: 'rgba(255,255,255,.08)', marginTop: 6, overflow: 'hidden' }}>
                  <div style={{ width: `${storage.quota ? Math.max(1, (storage.usage / storage.quota) * 100) : 0}%`, height: '100%', background: 'var(--accent)' }} />
                </div>
              </div>
              <div className="row wrap" style={{ gap: 8 }}>
                <button className="btn sm" onClick={exportBackup}><Download size={14} /> Exportar respaldo</button>
                <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])} />
                <button className="btn sm" onClick={() => fileRef.current?.click()}><Upload size={14} /> Restaurar respaldo</button>
                {hasDemo ? (
                  <button className="btn sm danger" onClick={() => clearDemo()}><Trash2 size={14} /> Borrar demo</button>
                ) : (
                  <button className="btn sm" onClick={() => loadDemo()}><Sparkles size={14} /> Cargar demo</button>
                )}
              </div>
              <p className="tiny faint">El respaldo guarda configuración, revisiones y el índice de evidencias (no los videos). Todo vive solo en este dispositivo.</p>
            </div>
          </Section>

          <Section eyebrow="Perfil" title="Tú">
            <div className="field">
              <label>Nombre</label>
              <input className="input" defaultValue={settings.userName} onBlur={(e) => setSettings({ userName: e.target.value.trim() })} />
            </div>
          </Section>

          <Section eyebrow="Celular" title="Búnker en tu teléfono" right={<Smartphone size={18} className="muted" />}>
            <ol className="small" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
              <li><b>Opción simple:</b> sigue grabando con la cámara normal y activa la copia automática de videos (Google Drive, OneDrive o Google Fotos para PC) hacia una carpeta del computador. Vincúlala aquí y listo.</li>
              <li><b>Búnker Camera en el celular:</b> abre <a href="https://sebasvmendez.github.io/bunker-evidence-engine/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>sebasvmendez.github.io/bunker-evidence-engine</a> en Chrome del celular y elige “Agregar a pantalla de inicio”. Funciona sin internet. Los datos de cada dispositivo son independientes.</li>
              <li><b>Prueba rápida en tu Wi-Fi:</b> ejecuta <code>npm run movil</code> y abre la dirección https que aparece desde el celular.</li>
            </ol>
          </Section>
        </div>
      </div>
    </div>
  );
}

function AreasEditor() {
  const areas = useStore((s) => s.areas);
  const clips = useStore((s) => s.clips);
  const setAreas = useStore((s) => s.setAreas);
  const [open, setOpen] = useState<string | null>(null);
  const sorted = [...areas].sort((a, b) => a.order - b.order);
  const models = useMemo(() => durationModels(areas, clips), [areas, clips]);
  const upd = (id: string, p: Partial<Area>) => setAreas(areas.map((a) => (a.id === id ? { ...a, ...p } : a)));
  const move = (id: string, dir: -1 | 1) => {
    const i = sorted.findIndex((a) => a.id === id);
    const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    const next = [...sorted];
    [next[i], next[j]] = [next[j], next[i]];
    setAreas(next.map((a, k) => ({ ...a, order: k })));
    sound.play('tap');
  };
  const add = () => {
    const id = uid('a_');
    const a: Area = {
      id, name: 'Nueva área', icon: 'meta', color: AREA_COLORS[areas.length % AREA_COLORS.length], life: 'relaciones', kind: 'explicacion',
      moment: 'libre', minutes: 15, windows: [], targetPerWeek: 3, aliases: [], order: areas.length, active: true,
    };
    setAreas([...areas, a]);
    setOpen(id);
    sound.play('pop');
  };

  return (
    <Section eyebrow="Rutina" title="Tus áreas, en el orden en que las haces" right={<button className="btn sm" onClick={add}><Plus size={14} /> Añadir área</button>}>
      <p className="small muted" style={{ marginTop: -6, marginBottom: 14 }}>
        Sin horarios: Búnker reconoce cada video por este <b style={{ color: 'var(--text-2)' }}>orden</b>, la duración típica de cada área y si fue antes o después de tu turno. Ordénalas con las flechas.
      </p>
      <div className="col" style={{ gap: 8 }}>
        {sorted.map((a, i) => {
          const m = models[a.id];
          const learned = !!m && m.n > 0;
          return (
            <div key={a.id} style={{ borderRadius: 18, border: '1px solid var(--stroke)', background: open === a.id ? 'rgba(255,255,255,.03)' : 'transparent', opacity: a.active ? 1 : 0.55 }}>
              <div className="row" style={{ padding: 10, gap: 12 }}>
                <span className="mono faint" style={{ width: 18, textAlign: 'right', fontWeight: 700 }}>{i + 1}</span>
                <AreaIcon area={a} size={40} />
                <button className="grow" style={{ textAlign: 'left' }} onClick={() => setOpen(open === a.id ? null : a.id)}>
                  <div style={{ fontWeight: 650 }}>{a.name}</div>
                  <div className="tiny muted">
                    {MOMENTS.find((x) => x.id === a.moment)?.name} · ~{learned ? m.minutes : a.minutes} min{learned ? ' (aprendido)' : ''} · {a.targetPerWeek}/semana · {KIND_INFO[a.kind].treatment}
                    {a.windows.length ? ` · hora fija ${a.windows.map((w) => w.start).join(', ')}` : ''}
                  </div>
                </button>
                <div className="row" style={{ gap: 2 }}>
                  <button className="btn icon sm ghost" onClick={() => move(a.id, -1)} disabled={i === 0} aria-label="Subir"><ChevronUp size={15} /></button>
                  <button className="btn icon sm ghost" onClick={() => move(a.id, 1)} disabled={i === sorted.length - 1} aria-label="Bajar"><ChevronDown size={15} /></button>
                  <Switch on={a.active} onChange={(v) => upd(a.id, { active: v })} label="Activa" />
                </div>
              </div>
              <AnimatePresence initial={false}>
                {open === a.id && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                    <div className="grid g-2" style={{ padding: '6px 14px 16px', gap: 14 }}>
                      <div className="field">
                        <label>Nombre</label>
                        <input className="input" defaultValue={a.name} onBlur={(e) => upd(a.id, { name: e.target.value.trim() || a.name })} />
                      </div>
                      <div className="field">
                        <label>Palabras clave en nombres de archivo (separadas por coma)</label>
                        <input className="input" defaultValue={a.aliases.join(', ')} onBlur={(e) => upd(a.id, { aliases: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
                      </div>
                      <div className="field">
                        <label>¿Cuándo la haces respecto a tu turno?</label>
                        <div className="row wrap" style={{ gap: 6 }}>
                          {MOMENTS.map((mo) => (
                            <button key={mo.id} title={mo.hint} className={`chip${a.moment === mo.id ? ' on' : ''}`} style={{ ['--c' as string]: a.color }} onClick={() => upd(a.id, { moment: mo.id })}>
                              {mo.name}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="field">
                        <label className="row between">
                          <span>Duración típica de una sesión</span>
                          <span className="mono muted">{a.minutes} min</span>
                        </label>
                        <input type="range" min={1} max={120} value={a.minutes} onChange={(e) => upd(a.id, { minutes: +e.target.value })} />
                        <span className="tiny faint">
                          {learned ? `Aprendido de ${m.n} ${m.n === 1 ? 'video confirmado' : 'videos confirmados'}: ~${m.minutes} min.` : 'Es un punto de partida; Búnker la afina con tus videos confirmados.'}
                        </span>
                      </div>
                      <div className="field span-2">
                        <label>Si la grabas en time-lapse, ¿a qué velocidad sueles hacerlo?</label>
                        <div className="row wrap" style={{ gap: 6 }}>
                          {[0, 5, 10, 15, 30].map((f) => (
                            <button key={f} className={`chip${(a.lapseSpeed ?? 0) === f ? ' on' : ''}`} onClick={() => upd(a.id, { lapseSpeed: f || undefined })}>
                              {f === 0 ? 'Varía (×5 o ×10)' : `×${f}`}
                            </button>
                          ))}
                        </div>
                        <span className="tiny faint">Los videos sin audio se tratan como time-lapse: un archivo de 6 min a ×10 cuenta como 1 h real.</span>
                      </div>
                      <div className="field span-2">
                        <label>Icono</label>
                        <div className="row wrap" style={{ gap: 6 }}>
                          {Object.keys(AREA_ICONS).map((ic) => (
                            <button key={ic} title={ic} onClick={() => upd(a.id, { icon: ic })} style={{ width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', background: a.icon === ic ? a.color : 'rgba(255,255,255,.04)', border: '1px solid var(--stroke)' }}>
                              <Glyph icon={ic} size={18} color={a.icon === ic ? '#fff' : '#C5CEE8'} />
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="field">
                        <label>Color</label>
                        <div className="row wrap" style={{ gap: 6 }}>
                          {AREA_COLORS.map((c) => (
                            <button key={c} onClick={() => upd(a.id, { color: c })} style={{ width: 28, height: 28, borderRadius: 9, background: c, outline: a.color === c ? '2px solid #fff' : 'none', outlineOffset: 2 }} aria-label={c} />
                          ))}
                        </div>
                      </div>
                      <div className="field">
                        <label>Tratamiento por defecto en la película</label>
                        <div className="row wrap" style={{ gap: 6 }}>
                          {(Object.keys(KIND_INFO) as ClipKind[]).filter((k) => k !== 'repeticion' && k !== 'transicion').map((k) => (
                            <button key={k} className={`chip${a.kind === k ? ' on' : ''}`} onClick={() => upd(a.id, { kind: k })}>{KIND_INFO[k].name}</button>
                          ))}
                        </div>
                      </div>
                      <div className="field">
                        <label className="row between"><span>Meta de sesiones por semana</span><span className="mono muted">{a.targetPerWeek}</span></label>
                        <input type="range" min={0} max={14} value={a.targetPerWeek} onChange={(e) => upd(a.id, { targetPerWeek: +e.target.value })} />
                      </div>
                      <div className="field">
                        <label>Área de vida</label>
                        <select className="select" value={a.life} onChange={(e) => upd(a.id, { life: e.target.value as LifeArea })}>
                          {LIFE_AREAS.map((l) => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="field span-2">
                        <label>Hora fija (opcional · solo si esta área sí tiene hora, p. ej. la apertura del mercado)</label>
                        <div className="col" style={{ gap: 8 }}>
                          {a.windows.map((w, wi) => (
                            <div key={wi} className="row wrap" style={{ gap: 8 }}>
                              <input type="time" className="input" style={{ width: 150 }} value={w.start} onChange={(e) => upd(a.id, { windows: a.windows.map((x, k) => (k === wi ? { ...x, start: e.target.value } : x)) })} />
                              <span className="muted">→</span>
                              <input type="time" className="input" style={{ width: 150 }} value={w.end} onChange={(e) => upd(a.id, { windows: a.windows.map((x, k) => (k === wi ? { ...x, end: e.target.value } : x)) })} />
                              <div className="row" style={{ gap: 4 }}>
                                {DAY_SHORT.map((d, di) => {
                                  const on = w.days.includes(di + 1);
                                  return (
                                    <button
                                      key={d}
                                      onClick={() => upd(a.id, { windows: a.windows.map((x, k) => (k === wi ? { ...x, days: on ? x.days.filter((y) => y !== di + 1) : [...x.days, di + 1].sort() } : x)) })}
                                      style={{ width: 30, height: 30, borderRadius: 9, fontSize: 12, fontWeight: 700, background: on ? a.color : 'rgba(255,255,255,.05)', color: on ? '#05070d' : 'var(--muted)' }}
                                    >
                                      {d}
                                    </button>
                                  );
                                })}
                              </div>
                              <button className="btn icon sm ghost" onClick={() => upd(a.id, { windows: a.windows.filter((_, k) => k !== wi) })} aria-label="Quitar hora fija"><X size={14} /></button>
                            </div>
                          ))}
                          {a.windows.length === 0 && (
                            <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => upd(a.id, { windows: [{ start: '08:30', end: '10:00', days: [1, 2, 3, 4, 5] }] })}>
                              <Plus size={14} /> Añadir hora fija
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="span-2 row" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn sm danger" onClick={() => setAreas(areas.filter((x) => x.id !== a.id))}>
                          <Trash2 size={14} /> Eliminar área
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
