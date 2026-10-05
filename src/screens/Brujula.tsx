import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Wind, Trash2, Car } from 'lucide-react';
import { useStore } from '../store';
import { Section } from '../components/ui';
import { CYCLE, LIFE_AREAS, PRINCIPLES } from '../lib/content';
import { computeWeek } from '../lib/insights';
import { isoWeekday, uid, weekKey } from '../lib/time';
import { sound } from '../lib/sound';
import type { Vehicle } from '../lib/types';

const STATUS: { id: Vehicle['status']; name: string; c: string }[] = [
  { id: 'probando', name: 'Probando', c: '#6D8BFF' },
  { id: 'mantener', name: 'Mantener', c: '#34D399' },
  { id: 'pausado', name: 'Pausado', c: '#F5B94A' },
  { id: 'descartado', name: 'Descartado', c: '#94A3B8' },
];

export default function Brujula() {
  const compass = useStore((s) => s.compass);
  const setCompass = useStore((s) => s.setCompass);
  const clips = useStore((s) => s.clips);
  const areas = useStore((s) => s.areas);
  const reviews = useStore((s) => s.reviews);
  const setCalm = useStore((s) => s.setCalm);
  const week = weekKey(Date.now());
  const sealed = !!reviews[week]?.sealedAt;
  const stage = isoWeekday(new Date()) === 7 ? (sealed ? 6 : 4) : 3;
  const [sel, setSel] = useState(stage);

  const stats = useMemo(() => computeWeek(clips, areas, week), [clips, areas, week]);
  const wheel = LIFE_AREAS.map((l) => {
    const mapped = areas.filter((a) => a.active && a.life === l.id);
    const sessions = mapped.reduce((s, a) => s + (stats.areas[a.id]?.sessions ?? 0), 0);
    const target = mapped.reduce((s, a) => s + a.targetPerWeek, 0);
    return { ...l, sessions, target, value: target ? Math.min(1, sessions / target) : sessions ? 1 : 0, mapped };
  });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Brújula</div>
          <h1 className="title">Dirección clara, vehículos flexibles.</h1>
          <p className="subtitle">Información → conocimiento → aplicación constante → cambio.</p>
        </div>
        <button className="btn" onClick={() => setCalm(true)}>
          <Wind size={16} /> Protocolo de frustración
        </button>
      </div>

      <div className="grid g-2">
        <Section eyebrow="El ciclo" title="Dónde estás ahora">
          <Cycle stage={stage} sel={sel} onSel={setSel} />
          <AnimatePresence mode="wait">
            <motion.div key={sel} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ textAlign: 'center', marginTop: 8 }}>
              <h3 style={{ fontSize: 20 }}>{CYCLE[sel].name}</h3>
              <p className="muted small" style={{ maxWidth: 420, margin: '4px auto 0' }}>{CYCLE[sel].desc}</p>
            </motion.div>
          </AnimatePresence>
        </Section>

        <Section eyebrow="Persona completa, no perfecta" title="Rueda de evidencia · esta semana">
          <Radar items={wheel.map((w) => ({ label: w.name, value: w.value, sessions: w.sessions }))} />
          <p className="tiny muted" style={{ textAlign: 'center', marginTop: 6 }}>
            Cada área de vida se alimenta de las rutinas que le asignas en Ajustes. Un área vacía no es un fracaso: es información.
          </p>
        </Section>

        <Section eyebrow="Dirección" title="Qué vida quieres construir" style={{ gridColumn: 'span 2' }}>
          <div className="grid g-3" style={{ gap: 14 }}>
            <div className="field">
              <label>Deseo general (la dirección)</label>
              <textarea className="textarea" defaultValue={compass.direction} placeholder="Ej.: libertad financiera, un cuerpo atlético y una familia presente." onBlur={(e) => setCompass({ direction: e.target.value })} />
            </div>
            <div className="field">
              <label>El sentimiento que quieres vivir</label>
              <textarea className="textarea" defaultValue={compass.feeling} placeholder="Ej.: calma, orgullo, seguridad, energía." onBlur={(e) => setCompass({ feeling: e.target.value })} />
            </div>
            <div className="field">
              <label>¿Por qué lo quieres? (para no confundir resultado con método)</label>
              <textarea className="textarea" defaultValue={compass.why} placeholder="Lo que de verdad importa detrás del objetivo." onBlur={(e) => setCompass({ why: e.target.value })} />
            </div>
          </div>
        </Section>

        <Vehicles />

        <Section eyebrow="No negociables" title="Principios del proyecto">
          <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
            {PRINCIPLES.map((p, i) => (
              <motion.li key={p} className="row" style={{ alignItems: 'flex-start', gap: 12 }} initial={{ opacity: 0, x: -6 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.03 }}>
                <span className="mono faint" style={{ width: 22, fontWeight: 700 }}>{String(i + 1).padStart(2, '0')}</span>
                <span className="small">{p}</span>
              </motion.li>
            ))}
          </ol>
        </Section>
      </div>
    </div>
  );
}

function Cycle({ stage, sel, onSel }: { stage: number; sel: number; onSel: (i: number) => void }) {
  const size = 330;
  const r = 122;
  const cx = size / 2;
  return (
    <div style={{ display: 'grid', placeItems: 'center' }}>
      <svg width="100%" viewBox={`0 0 ${size} ${size}`} style={{ maxWidth: size, overflow: 'visible' }}>
        <defs>
          <linearGradient id="cyc" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#6D8BFF" />
            <stop offset="1" stopColor="#2DD4BF" />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="2" />
        {(() => {
          // arco desde la etapa anterior hasta la actual: el tramo que estás recorriendo
          const step = (Math.PI * 2) / 7;
          const at = (i: number) => (i / 7) * Math.PI * 2 - Math.PI / 2 + Math.PI / 7;
          const a0 = at(stage) - step;
          const a1 = at(stage);
          const p = (a: number) => `${cx + Math.cos(a) * r} ${cx + Math.sin(a) * r}`;
          return (
            <motion.path
              d={`M ${p(a0)} A ${r} ${r} 0 0 1 ${p(a1)}`}
              fill="none" stroke="url(#cyc)" strokeWidth="3.5" strokeLinecap="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
              transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            />
          );
        })()}
        {CYCLE.map((c, i) => {
          const a = (i / 7) * Math.PI * 2 - Math.PI / 2 + Math.PI / 7;
          const x = cx + Math.cos(a) * r;
          const y = cx + Math.sin(a) * r;
          const on = i === stage;
          return (
            <g key={c.id} onClick={() => { sound.play('tap'); onSel(i); }} style={{ cursor: 'pointer' }}>
              {on && (
                <motion.circle cx={x} cy={y} r={26} fill="none" stroke="#6D8BFF" strokeWidth="2" animate={{ r: [22, 32], opacity: [0.8, 0] }} transition={{ duration: 1.8, repeat: Infinity }} />
              )}
              <circle cx={x} cy={y} r={on ? 22 : 17} fill={on ? '#6D8BFF' : sel === i ? 'rgba(109,139,255,.3)' : '#121a30'} stroke={on ? '#AFC0FF' : 'rgba(255,255,255,.18)'} strokeWidth="1.5" />
              <text x={x} y={y + 5} textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff" style={{ fontFamily: 'var(--font-d)' }}>
                {i + 1}
              </text>
              <text x={cx + Math.cos(a) * (r + 44)} y={cx + Math.sin(a) * (r + 44) + 4} textAnchor="middle" fontSize="11.5" fontWeight={sel === i ? 700 : 500} fill={sel === i || on ? '#EEF2FF' : '#8A94B2'}>
                {c.name}
              </text>
            </g>
          );
        })}
        <text x={cx} y={cx - 4} textAnchor="middle" fontSize="12" fill="#8A94B2" letterSpacing="3">HOY</text>
        <text x={cx} y={cx + 20} textAnchor="middle" fontSize="20" fontWeight="700" fill="#EEF2FF" style={{ fontFamily: 'var(--font-d)' }}>
          {CYCLE[stage].name}
        </text>
      </svg>
    </div>
  );
}

function Radar({ items }: { items: { label: string; value: number; sessions: number }[] }) {
  const size = 320;
  const c = size / 2;
  const R = 112;
  const n = items.length;
  const pt = (i: number, v: number) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return [c + Math.cos(a) * R * v, c + Math.sin(a) * R * v];
  };
  const poly = items.map((it, i) => pt(i, Math.max(0.04, it.value)).join(',')).join(' ');
  return (
    <div style={{ display: 'grid', placeItems: 'center' }}>
      <svg width="100%" viewBox={`0 0 ${size} ${size}`} style={{ maxWidth: size, overflow: 'visible' }}>
        <defs>
          <radialGradient id="rad">
            <stop offset="0" stopColor="#6D8BFF" stopOpacity=".55" />
            <stop offset="1" stopColor="#A78BFA" stopOpacity=".25" />
          </radialGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((k) => (
          <polygon key={k} points={items.map((_, i) => pt(i, k).join(',')).join(' ')} fill="none" stroke="rgba(255,255,255,.07)" />
        ))}
        {items.map((_, i) => {
          const [x, y] = pt(i, 1);
          return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="rgba(255,255,255,.06)" />;
        })}
        <motion.polygon points={poly} fill="url(#rad)" stroke="#8AA2FF" strokeWidth="2" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ originX: '50%', originY: '50%' }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
        {items.map((it, i) => {
          const [x, y] = pt(i, Math.max(0.04, it.value));
          const [lx, ly] = pt(i, 1.28);
          return (
            <g key={it.label}>
              <circle cx={x} cy={y} r="4" fill={it.sessions ? '#fff' : '#56617f'} />
              <text x={lx} y={ly} textAnchor="middle" fontSize="11.5" fill={it.sessions ? '#C5CEE8' : '#56617f'} fontWeight="600">{it.label}</text>
              <text x={lx} y={ly + 14} textAnchor="middle" fontSize="10.5" fill="#8A94B2">{it.sessions ? `${it.sessions} ses.` : 'sin evidencia'}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Vehicles() {
  const compass = useStore((s) => s.compass);
  const setCompass = useStore((s) => s.setCompass);
  const [draft, setDraft] = useState({ name: '', hypothesis: '', evidenceNeeded: '', reviewOn: '' });
  const add = () => {
    if (!draft.name.trim()) return;
    sound.play('pop');
    setCompass({ vehicles: [...compass.vehicles, { id: uid('v_'), ...draft, status: 'probando', createdAt: Date.now() }] });
    setDraft({ name: '', hypothesis: '', evidenceNeeded: '', reviewOn: '' });
  };
  const upd = (id: string, p: Partial<Vehicle>) => setCompass({ vehicles: compass.vehicles.map((v) => (v.id === id ? { ...v, ...p } : v)) });
  return (
    <Section eyebrow="Vehículos" title="Hipótesis que estás probando" right={<Car size={18} className="muted" />}>
      <div className="col" style={{ gap: 10 }}>
        {compass.vehicles.length === 0 && (
          <p className="small muted">
            Un vehículo es una vía concreta (un negocio, un empleo, una estrategia de trading). No es tu identidad: es un experimento con evidencia necesaria y una fecha de revisión.
          </p>
        )}
        {compass.vehicles.map((v) => {
          const s = STATUS.find((x) => x.id === v.status)!;
          return (
            <motion.div key={v.id} layout className="card" style={{ padding: 14, background: 'rgba(255,255,255,.02)' }}>
              <div className="row between">
                <b>{v.name}</b>
                <div className="row" style={{ gap: 4 }}>
                  {STATUS.map((x) => (
                    <button key={x.id} className={`chip${v.status === x.id ? ' on' : ''}`} style={{ ['--c' as string]: x.c, height: 26, fontSize: 11.5, padding: '0 9px' }} onClick={() => upd(v.id, { status: x.id })}>
                      {x.name}
                    </button>
                  ))}
                  <button className="btn icon sm ghost" onClick={() => setCompass({ vehicles: compass.vehicles.filter((x) => x.id !== v.id) })} aria-label="Eliminar">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {v.hypothesis && <p className="small" style={{ marginTop: 6 }}><span className="muted">Hipótesis:</span> {v.hypothesis}</p>}
              {v.evidenceNeeded && <p className="small"><span className="muted">Evidencia necesaria:</span> {v.evidenceNeeded}</p>}
              {v.reviewOn && <p className="tiny" style={{ color: s.c, marginTop: 4 }}>Revisar el {new Date(v.reviewOn + 'T12:00').toLocaleDateString('es', { day: 'numeric', month: 'long' })}</p>}
            </motion.div>
          );
        })}
        <div className="grid g-2" style={{ gap: 8 }}>
          <input className="input" placeholder="Vehículo (ej.: trading intradía)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input className="input" type="date" value={draft.reviewOn} onChange={(e) => setDraft({ ...draft, reviewOn: e.target.value })} title="Fecha de revisión" />
          <input className="input" placeholder="Hipótesis: si hago X, espero Y" value={draft.hypothesis} onChange={(e) => setDraft({ ...draft, hypothesis: e.target.value })} />
          <input className="input" placeholder="¿Qué evidencia decide si sigue?" value={draft.evidenceNeeded} onChange={(e) => setDraft({ ...draft, evidenceNeeded: e.target.value })} />
        </div>
        <button className="btn" onClick={add} disabled={!draft.name.trim()} style={{ alignSelf: 'flex-start' }}>
          <Plus size={16} /> Añadir vehículo
        </button>
      </div>
    </Section>
  );
}
