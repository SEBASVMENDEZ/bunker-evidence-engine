// Tu ruta de hoy: no una lista de pendientes, sino el siguiente paso, ya decidido, con un botón.
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Play, Check, Clock, Moon, BatteryLow, BatteryMedium, BatteryFull, SlidersHorizontal, Briefcase, Sparkles, X, Star } from 'lucide-react';
import { useStore, dayPrefsOf, needsConfirm } from '../store';
import { AreaIcon } from './ui';
import { AtlasBoton, AtlasPregunta } from './Atlas';
import { usaAtlas } from '../lib/atlas';
import { habitOf, habitualBed, planDay, type Step } from '../lib/ruta';
import { addDays, dayKey } from '../lib/time';
import type { Energy } from '../lib/types';

const t = (ms: number) => new Date(ms).toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit' });
const LEVEL: Record<Step['level'], { label: string; color: string }> = {
  minimo: { label: 'mínimo', color: '#F5B94A' },
  medio: { label: 'medio', color: '#7DD3FC' },
  ideal: { label: 'completo', color: '#34D399' },
};
const MODE: Record<string, { label: string; color: string }> = {
  completo: { label: 'DÍA COMPLETO', color: '#34D399' },
  equilibrado: { label: 'DÍA EQUILIBRADO', color: '#7DD3FC' },
  minimo: { label: 'DÍA PESADO · MÍNIMO DE TODO', color: '#F5B94A' },
  recuperacion: { label: 'DÍA DE RECUPERACIÓN', color: '#FB7185' },
  cierre: { label: 'CIERRE DEL DÍA', color: '#A78BFA' },
};

function useNow(ms = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

export function useRoute() {
  const now = useNow();
  const settings = useStore((s) => s.settings);
  const areas = useStore((s) => s.areas);
  const clips = useStore((s) => s.clips);
  const hechos = useStore((s) => s.hechos);
  const sleep = useStore((s) => s.sleep);
  const shifts = useStore((s) => s.shifts);
  const postponed = useStore((s) => s.postponed);
  return useMemo(() => {
    const today = dayKey(now);
    const yesterday = dayKey(addDays(new Date(now), -1));
    const doneOn = (d: string) => {
      const set = new Set<string>();
      const at: Record<string, number> = {};
      for (const h of hechos) if (h.day === d) (set.add(h.areaId), (at[h.areaId] ??= h.at));
      for (const c of clips) if (!c.excluded && c.areaId && dayKey(c.takenAt) === d) (set.add(c.areaId), (at[c.areaId] ??= c.takenAt));
      return { set, at };
    };
    const td = doneOn(today);
    const yd = doneOn(yesterday).set;
    const active = areas.filter((a) => a.active);
    const wake = sleep.wakes[today];
    const route = planDay({
      day: new Date(now),
      now,
      areas,
      shifts,
      prefs: dayPrefsOf(settings),
      energy: wake?.energy,
      done: td.set,
      doneAt: td.at,
      missedYesterday: new Set(active.filter((a) => !yd.has(a.id)).map((a) => a.id)),
      habitualBed: habitualBed(sleep.beds, now),
      wokeAt: wake?.at,
      postponed,
    });
    return { route, now, today, wake, shiftKnown: !!shifts[today] };
  }, [now, settings, areas, clips, hechos, sleep, shifts, postponed]);
}

export function RutaHoy() {
  const { route, now, today, wake, shiftKnown } = useRoute();
  const areas = useStore((s) => s.areas);
  const hechos = useStore((s) => s.hechos);
  const clips = useStore((s) => s.clips);
  const { openSesion, postpone, addHecho, removeHecho, logWake, logBed, setTurnos, setMiDia, go, setIntent } = useStore.getState();
  const intents = useStore((s) => s.intents);
  const planes = useStore((s) => s.planes);
  // la ruta que te propuso hoy queda guardada: así se puede medir si de verdad te sirve
  useEffect(() => {
    const snap = planes[today];
    if (!route.steps.length || route.mode === 'cierre' || (snap && snap.energy === wake?.energy)) return;
    useStore.getState().savePlan({ day: today, at: now, energy: wake?.energy, mode: route.mode, steps: route.steps.map((s) => ({ areaId: s.areaId, level: s.level, minutes: s.minutes })) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, wake?.energy, route.steps.length]);
  const areaOf = (id: string) => areas.find((a) => a.id === id);
  const pending = route.steps.filter((s) => !s.done);
  const first = pending[0];
  // el bloque de la mañana se hace de un tirón
  const group = first ? (first.block ? pending.filter((s) => s.block && s.window === first.window) : [first]) : [];
  const groupMin = group.reduce((s, x) => s + x.minutes, 0);
  const groupMinimal = group.reduce((s, x) => s + habitOf(areaOf(x.areaId)!).min, 0);
  const isNow = first && first.start <= now + 5 * 60000;
  const hour = new Date(now).getHours();
  const askMorning = !wake && hour >= 3 && hour < 15;
  const nearBed = now >= route.tonight.bed - 90 * 60000 || hour >= 21 || hour < 3;
  const unsure = clips.filter(needsConfirm).length;
  const deskAreas = areas.filter((a) => a.active && a.moment === 'libre');
  const lastIntent = intents[intents.length - 1];
  const pendingIntent = lastIntent && now - lastIntent.at < 45 * 60000 ? lastIntent : null;
  const mode = MODE[route.mode];

  const start = (steps: Step[], minimal = false) =>
    openSesion({
      title: steps.length > 1 ? (new Date().getHours() < 12 ? 'Bloque de la mañana' : 'Tu bloque esencial') : (areaOf(steps[0].areaId)?.name ?? 'Sesión'),
      steps: steps.map((s) => ({ areaId: s.areaId, minutes: minimal ? habitOf(areaOf(s.areaId)!).min : s.minutes })),
    });

  return (
    <motion.section className="card span-2" style={{ overflow: 'hidden' }} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', pointerEvents: 'none', background: `radial-gradient(620px 300px at 12% 0%, ${(first ? areaOf(first.areaId)?.color : mode.color) ?? '#6D8BFF'}2e, transparent 70%)` }} />
      <div className="col" style={{ position: 'relative', gap: 16 }}>
        {/* encabezado */}
        <div className="row wrap between" style={{ gap: 10 }}>
          <span className="badge" style={{ ['--c' as string]: mode.color }}>{mode.label}</span>
          <div className="row" style={{ gap: 6 }}>
            {!shiftKnown && (
              <button className="chip" style={{ ['--c' as string]: '#FB7185' }} onClick={() => setTurnos(true)}>
                <Briefcase size={13} /> ¿Trabajas hoy?
              </button>
            )}
            <button className="btn icon sm ghost" onClick={() => setMiDia(true)} aria-label="Ajustar mi día">
              <SlidersHorizontal size={16} />
            </button>
          </div>
        </div>
        <div>
          <h2 style={{ fontSize: 'clamp(22px,3vw,30px)', lineHeight: 1.2 }}>{route.headline}</h2>
          <p className="muted small" style={{ marginTop: 6 }}>{route.reasons.join(' ')}</p>
        </div>

        {/* ¿cómo amaneciste? (un toque: marca tu hora real de despertar y tu energía) */}
        {askMorning && (
          <div className="col" style={{ gap: 8, padding: 14, borderRadius: 18, background: 'rgba(255,255,255,.04)', border: '1px solid var(--line, rgba(255,255,255,.08))' }}>
            <b>Buenos días. ¿Cómo amaneciste?</b>
            <div className="row wrap" style={{ gap: 6 }}>
              {(
                [
                  ['baja', 'Cansado', BatteryLow, '#FB7185'],
                  ['media', 'Normal', BatteryMedium, '#7DD3FC'],
                  ['alta', 'Con energía', BatteryFull, '#34D399'],
                ] as [Energy, string, typeof BatteryLow, string][]
              ).map(([e, label, Icon, c]) => (
                <button key={e} className="chip" style={{ ['--c' as string]: c }} onClick={() => logWake(e)}>
                  <Icon size={15} /> {label}
                </button>
              ))}
            </div>
            <span className="tiny muted">Con esto ajusto la ruta a como estás hoy, no a como deberías estar.</span>
          </div>
        )}

        {/* al volver de Atlas: un toque */}
        <AtlasPregunta />

        {/* AHORA: el siguiente paso, ya decidido */}
        {first ? (
          <div className="col" style={{ gap: 12, padding: 16, borderRadius: 22, background: `linear-gradient(135deg, ${areaOf(first.areaId)?.color ?? '#6D8BFF'}22, rgba(255,255,255,.02))`, border: `1px solid ${areaOf(first.areaId)?.color ?? '#6D8BFF'}55` }}>
            <div className="row" style={{ gap: 14 }}>
              <div className="row">
                {group.slice(0, 4).map((s, i) => (
                  <div key={s.areaId} style={{ marginLeft: i ? -14 : 0 }}>
                    <AreaIcon area={areaOf(s.areaId)} size={i ? 40 : 56} />
                  </div>
                ))}
              </div>
              <div className="grow">
                <div className="eyebrow">{isNow ? 'Ahora' : `A las ${t(first.start)} · en ${Math.max(1, Math.round((first.start - now) / 60000))} min`}</div>
                <h3 style={{ fontSize: 22, marginTop: 2 }}>{group.map((s) => areaOf(s.areaId)?.name).join(' · ')}</h3>
                <div className="tiny muted">
                  {groupMin} min · {group.length > 1 ? 'seguidos, sin pensar' : LEVEL[first.level].label}
                </div>
              </div>
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <button className="btn primary lg" onClick={() => start(group)}>
                <Play size={18} fill="currentColor" /> Empezar
              </button>
              {groupMinimal < groupMin && (
                <button className="btn lg" onClick={() => start(group, true)} title="Cuando no da para más: la versión mínima">
                  Solo el mínimo · {groupMinimal} min
                </button>
              )}
              {group.length === 1 && <AtlasBoton areaId={first.areaId} />}
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              <button className="btn sm ghost" onClick={() => postpone(group.map((s) => s.areaId), 60)}>
                <Clock size={14} /> Más tarde
              </button>
              <button className="btn sm ghost" onClick={() => group.forEach((s) => addHecho(s.areaId, s.minutes, 'manual'))}>
                <Check size={14} /> Ya lo hice
              </button>
            </div>
          </div>
        ) : (
          <div className="row" style={{ gap: 12, padding: 16, borderRadius: 22, background: 'rgba(52,211,153,.08)', border: '1px solid rgba(52,211,153,.3)' }}>
            <Sparkles size={22} color="#34D399" />
            <div className="small">{route.headline}</div>
          </div>
        )}

        {/* la ruta completa del día */}
        <div className="col" style={{ gap: 2 }}>
          <div className="label">Tu ruta de hoy</div>
          {route.steps.map((s, i) => {
            const a = areaOf(s.areaId);
            const h = s.done ? hechos.find((x) => x.day === today && x.areaId === s.areaId) : undefined;
            return (
              <div key={s.areaId + i} style={{ borderBottom: '1px solid rgba(255,255,255,.05)', opacity: s.done ? 0.6 : 1 }}>
                <div className="row" style={{ gap: 10, padding: '7px 4px' }}>
                  <span className="mono tiny muted" style={{ width: 44 }}>{t(s.start)}</span>
                  <span style={{ width: 9, height: 9, borderRadius: 9, background: a?.color, flexShrink: 0 }} />
                  <span className="grow small" style={{ textDecoration: s.done ? 'line-through' : 'none' }}>
                    {a?.name}
                    {(a?.priority ?? 2) >= 3 && <Star size={11} style={{ marginLeft: 4, verticalAlign: -1 }} fill="#F5B94A" color="#F5B94A" />}
                  </span>
                  {!s.done && (
                    <span className="tiny" style={{ color: LEVEL[s.level].color, fontWeight: 600 }}>
                      {s.minutes} min · {LEVEL[s.level].label}
                    </span>
                  )}
                  {s.done ? (
                    <button className="btn icon sm ghost" onClick={() => h && removeHecho(h.id)} aria-label="Hecho" title={h ? 'Deshacer' : 'Hecho (con evidencia)'}>
                      <Check size={15} color="#34D399" />
                    </button>
                  ) : (
                    <button className="btn icon sm ghost" onClick={() => start([s])} aria-label={`Empezar ${a?.name}`}>
                      <Play size={14} />
                    </button>
                  )}
                </div>
                {/* Estudio y Lectura: el puente a Atlas, en su propia línea (en el celular la fila no da para más) */}
                {usaAtlas(s.areaId) && (
                  <div style={{ padding: '0 4px 8px 77px' }}>
                    <AtlasBoton areaId={s.areaId} size="fila" />
                  </div>
                )}
              </div>
            );
          })}
          {route.dropped.length > 0 && <div className="tiny muted" style={{ marginTop: 6 }}>Hoy no cupo: {route.dropped.map((id) => areaOf(id)?.name).join(', ')}. Mañana van primero.</div>}
        </div>

        {/* el ancla: la hora de dormir */}
        <div className="row wrap between" style={{ gap: 10, padding: '12px 14px', borderRadius: 16, background: 'rgba(167,139,250,.08)', border: '1px solid rgba(167,139,250,.25)' }}>
          <div className="row" style={{ gap: 10 }}>
            <Moon size={18} color="#A78BFA" />
            <div>
              <div className="small">
                Esta noche a la cama a las <b>{t(route.tonight.bed)}</b> · despiertas {t(route.tonight.wake)}
              </div>
              <div className="tiny muted">
                {Math.floor(route.tonight.sleep / 60)} h {route.tonight.sleep % 60 ? `${route.tonight.sleep % 60} min` : ''} de sueño · es lo que hace posible la mañana
              </div>
            </div>
          </div>
          {nearBed && (
            <button className="btn sm" onClick={logBed}>
              <Moon size={14} /> Me voy a dormir
            </button>
          )}
        </div>

        {/* grabar con la cámara del celular: un toque para que el video quede en su lugar */}
        <div className="row wrap" style={{ gap: 6, alignItems: 'center' }}>
          {deskAreas.length > 0 && <span className="tiny muted">¿Grabas con la cámara del celular?</span>}
          {deskAreas.map((a) => (
            <button key={a.id} className={`chip${pendingIntent?.areaId === a.id ? ' on' : ''}`} style={{ ['--c' as string]: a.color, fontSize: 12 }} onClick={() => setIntent(a.id)}>
              <span className="dot" /> {a.name}
            </button>
          ))}
          {unsure > 0 && (
            <button className="chip" style={{ marginLeft: 'auto' }} onClick={() => go('evidencia')}>
              {unsure} videos por confirmar
            </button>
          )}
        </div>
      </div>
    </motion.section>
  );
}

/** Mi día: con estos datos la ruta se calcula sola cada día. */
export function MiDia() {
  const settings = useStore((s) => s.settings);
  const areas = useStore((s) => s.areas);
  const { setDayPrefs, setAreas, setMiDia } = useStore.getState();
  const p = dayPrefsOf(settings);
  const close = () => setMiDia(false);
  const num = (label: string, hint: string, value: number, on: (v: number) => void, min: number, max: number, step = 5, unit = 'min') => (
    <div className="col" style={{ gap: 4 }}>
      <div className="row between">
        <span className="small">{label}</span>
        <b className="small">
          {value} {unit}
        </b>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => on(+e.target.value)} />
      <span className="tiny muted">{hint}</span>
    </div>
  );
  const setArea = (id: string, patch: Partial<(typeof areas)[number]>) => setAreas(areas.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  return (
    <motion.div className="overlay" style={{ zIndex: 96 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
      <motion.div className="modal" style={{ width: 'min(640px,100%)', padding: 22 }} initial={{ y: 24, scale: 0.97 }} animate={{ y: 0, scale: 1 }} onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <div>
            <div className="eyebrow">Mi día</div>
            <h2 style={{ fontSize: 24 }}>Con esto armo tu ruta cada día</h2>
          </div>
          <button className="btn icon" onClick={close} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <p className="tiny muted" style={{ marginTop: 6 }}>Tus turnos los tomo de “Marcar turno” o de tu hoja de horarios. El sueño va primero: es lo que hace posible todo lo demás.</p>
        <div className="col" style={{ gap: 14, marginTop: 14 }}>
          {num('Horas de sueño que necesitas', 'La ruta calcula tu hora de dormir con esto.', p.sleepHours, (v) => setDayPrefs({ sleepHours: v }), 5, 9, 0.5, 'h')}
          {num('Mínimo que aguantas bien', 'Nunca te planeo menos que esto antes de trabajar.', p.sleepMin, (v) => setDayPrefs({ sleepMin: v }), 4, 8, 0.5, 'h')}
          {num('Traslado al trabajo (cada trayecto)', '', p.commute, (v) => setDayPrefs({ commute: v }), 0, 120)}
          {num('Alistarte antes de salir', '', p.prep, (v) => setDayPrefs({ prep: v }), 10, 90)}
          {num('Al llegar: comer, bañarte, descansar', 'Ese rato no te lo lleno.', p.windDown, (v) => setDayPrefs({ windDown: v }), 10, 120)}
          {num('Tiempo para ti antes de salir', 'Si trabajas temprano, para esto conviene acostarte antes.', p.morning, (v) => setDayPrefs({ morning: v }), 0, 120)}
          <div className="row between">
            <span className="small">Despertar en días libres</span>
            <input type="time" value={p.wakeFree} onChange={(e) => setDayPrefs({ wakeFree: e.target.value })} style={{ width: 120 }} />
          </div>
        </div>
        <div className="sep" />
        <div className="label">Tus hábitos: versión mínima y completa</div>
        <p className="tiny muted">En un día pesado hago el mínimo de todo (nunca cero). Cuando hay tiempo, crecen hacia la completa. ★ = va primero.</p>
        <div className="col" style={{ gap: 6, marginTop: 8 }}>
          {areas
            .filter((a) => a.active)
            .sort((a, b) => a.order - b.order)
            .map((a) => {
              const h = habitOf(a);
              return (
                <div key={a.id} className="row" style={{ gap: 8 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 9, background: a.color }} />
                  <span className="grow small">{a.name}</span>
                  <label className="tiny muted row" style={{ gap: 4 }}>
                    mín
                    <input type="number" min={1} max={120} value={h.min} onChange={(e) => setArea(a.id, { minimum: Math.max(1, +e.target.value || 1) })} style={{ width: 54 }} />
                  </label>
                  <label className="tiny muted row" style={{ gap: 4 }}>
                    completo
                    <input type="number" min={1} max={240} value={h.ideal} onChange={(e) => setArea(a.id, { ideal: Math.max(h.min, +e.target.value || h.min) })} style={{ width: 58 }} />
                  </label>
                  <button className="btn icon sm ghost" onClick={() => setArea(a.id, { priority: (a.priority ?? 2) >= 3 ? 2 : 3 })} aria-label="Prioridad">
                    <Star size={15} fill={(a.priority ?? 2) >= 3 ? '#F5B94A' : 'none'} color="#F5B94A" />
                  </button>
                </div>
              );
            })}
        </div>
      </motion.div>
    </motion.div>
  );
}
