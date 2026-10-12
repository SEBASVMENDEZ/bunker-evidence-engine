// La semana en tres miradas (retroalimentación de tu maestro): lo que hiciste, lo que aprendiste y
// lo que estás construyendo. Más los patrones de tus datos (observaciones con su muestra, no
// conclusiones) y la memoria de experimentos (lo comprobado frente a lo supuesto).
import { useMemo, useState } from 'react';
import { Trash2, FlaskConical, Plus, ShieldCheck } from 'lucide-react';
import { useStore } from '../store';
import { Section } from './ui';
import { LIFE_AREAS } from '../lib/content';
import { patterns, promptOf } from '../lib/aprendizaje';
import { TAG } from '../lib/film/draw';
import { realSecs } from '../lib/classify';
import { dayKey, shiftWeek, weekDays, weekLabel, weekNumber } from '../lib/time';

const KIND_LABEL = { idea: 'idea', decision: 'decisión', mejora: 'mejora', nota: 'nota' } as const;

export function TresMiradas({ week }: { week: string }) {
  const areas = useStore((s) => s.areas);
  const clips = useStore((s) => s.clips);
  const hechos = useStore((s) => s.hechos);
  const aprendizajes = useStore((s) => s.aprendizajes);
  const dificultades = useStore((s) => s.dificultades);
  const compass = useStore((s) => s.compass);
  const planes = useStore((s) => s.planes);
  const { setOutcome, removeAprendizaje, addAprendizaje, go } = useStore.getState();
  const days = useMemo(() => weekDays(week).map((d) => dayKey(d)), [week]);
  const active = useMemo(() => areas.filter((a) => a.active).sort((a, b) => a.order - b.order), [areas]);

  // 1) lo que hiciste: días y minutos por área (la sesión guiada y su evidencia no se cuentan dos veces)
  const perArea = useMemo(
    () =>
      active.map((a) => {
        const byDay = new Map<string, { h: number; c: number }>();
        for (const h of hechos) if (h.areaId === a.id && days.includes(h.day)) (byDay.get(h.day) ?? byDay.set(h.day, { h: 0, c: 0 }).get(h.day)!).h += h.minutes;
        for (const c of clips) {
          const d = dayKey(c.takenAt);
          if (c.areaId === a.id && !c.excluded && c.source !== 'demo' && days.includes(d)) (byDay.get(d) ?? byDay.set(d, { h: 0, c: 0 }).get(d)!).c += realSecs(c) / 60;
        }
        return { a, days: byDay.size, minutes: Math.round([...byDay.values()].reduce((s, x) => s + Math.max(x.h, x.c), 0)), set: new Set(byDay.keys()) };
      }),
    [active, hechos, clips, days],
  );
  const doneOn = (d: string, id: string) => perArea.find((r) => r.a.id === id)?.set.has(d) ?? false;
  const plannedDays = days.filter((d) => planes[d]);
  const prop = plannedDays.reduce((s, d) => s + planes[d].steps.length, 0);
  const hit = plannedDays.reduce((s, d) => s + planes[d].steps.filter((st) => doneOn(d, st.areaId)).length, 0);

  // 2) lo que aprendiste
  const learned = aprendizajes.filter((x) => days.includes(x.day)).sort((a, b) => a.at - b.at);
  const tally = new Map<string, number>();
  for (const d of dificultades) if (days.includes(d.day)) tally.set(d.tag, (tally.get(d.tag) ?? 0) + 1);

  // 3) lo que estás construyendo: tus áreas agrupadas por lo que buscan en tu vida
  const byLife = LIFE_AREAS.map((l) => {
    const rows = perArea.filter((r) => r.a.life === l.id && (r.days > 0 || learned.some((x) => x.areaId === r.a.id)));
    return { l, rows, notes: learned.filter((x) => rows.some((r) => r.a.id === x.areaId)).length };
  }).filter((g) => g.rows.length);
  const probando = compass.vehicles.filter((v) => v.status === 'probando');

  const [addArea, setAddArea] = useState(active.find((a) => a.id === 'lectura')?.id ?? active[0]?.id ?? '');
  const [addText, setAddText] = useState('');
  const col = (id: string) => areas.find((a) => a.id === id)?.color ?? '#94A3B8';
  const name = (id: string) => areas.find((a) => a.id === id)?.name ?? id;

  return (
    <Section eyebrow="Tu semana en tres miradas" title="Lo que hiciste, lo que aprendiste y lo que estás construyendo">
      <div className="grid g-3" style={{ gap: 18, alignItems: 'start' }}>
        {/* LO QUE HICISTE */}
        <div className="col" style={{ gap: 8 }}>
          <div className="label">1 · Lo que hiciste</div>
          {perArea.map((r) => (
            <div key={r.a.id} className="row small" style={{ gap: 8, opacity: r.days ? 1 : 0.45 }}>
              <span style={{ width: 8, height: 8, borderRadius: 8, background: r.a.color }} />
              <span className="grow">{r.a.name}</span>
              <span className="tiny muted">{r.days ? `${r.days} ${r.days === 1 ? 'día' : 'días'} · ${r.minutes} min` : 'sin registro'}</span>
            </div>
          ))}
          {prop > 0 && (
            <p className="tiny muted" style={{ marginTop: 4 }}>
              La ruta te propuso {prop} hábitos en {plannedDays.length} días: hiciste {hit} ({Math.round((hit / prop) * 100)} %).
            </p>
          )}
        </div>

        {/* LO QUE APRENDISTE */}
        <div className="col" style={{ gap: 8 }}>
          <div className="label">2 · Lo que aprendiste</div>
          {learned.length === 0 && <p className="tiny muted">Aún no hay aprendizajes esta semana. Al terminar una sesión, una línea basta; también puedes anotarlo aquí.</p>}
          {learned.map((x) => (
            <div key={x.id} className="col" style={{ gap: 4, padding: '8px 10px', borderRadius: 12, background: 'rgba(255,255,255,.03)', borderLeft: `3px solid ${col(x.areaId)}` }}>
              <div className="row between tiny muted">
                <span>
                  {name(x.areaId)} · {KIND_LABEL[x.kind]}
                </span>
                <button className="btn icon sm ghost" onClick={() => removeAprendizaje(x.id)} aria-label="Quitar">
                  <Trash2 size={12} />
                </button>
              </div>
              <span className="small">{x.text}</span>
              {x.kind === 'decision' && (
                <input className="input" style={{ height: 32, fontSize: 13 }} defaultValue={x.outcome ?? ''} placeholder="¿Qué pasó después? (lo revisas aquí)" onBlur={(e) => setOutcome(x.id, e.target.value)} />
              )}
            </div>
          ))}
          <div className="row" style={{ gap: 6 }}>
            <select className="input" style={{ height: 34, width: 'auto', fontSize: 13 }} value={addArea} onChange={(e) => setAddArea(e.target.value)}>
              {active.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <input className="input grow" style={{ height: 34, fontSize: 13 }} value={addText} placeholder={promptOf(areas.find((a) => a.id === addArea)).q} onChange={(e) => setAddText(e.target.value)} />
            <button
              className="btn icon sm"
              aria-label="Anotar"
              onClick={() => {
                addAprendizaje(addArea, addText, promptOf(areas.find((a) => a.id === addArea)).kind);
                setAddText('');
              }}
            >
              <Plus size={15} />
            </button>
          </div>
          {tally.size > 0 && (
            <div className="row wrap" style={{ gap: 6 }}>
              <span className="tiny muted">Lo que lo hizo difícil:</span>
              {[...tally].sort((a, b) => b[1] - a[1]).map(([t, n]) => (
                <span key={t} className="chip" style={{ ['--c' as string]: '#F5B94A', fontSize: 12, pointerEvents: 'none' }}>
                  {t} ×{n}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* LO QUE ESTÁS CONSTRUYENDO */}
        <div className="col" style={{ gap: 8 }}>
          <div className="label">3 · Lo que estás construyendo</div>
          {compass.direction ? (
            <p className="small" style={{ fontStyle: 'italic' }}>“{compass.direction}”</p>
          ) : (
            <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => go('brujula')}>
              Escribe tu dirección en la Brújula
            </button>
          )}
          {byLife.map((g) => (
            <div key={g.l.id} className="col" style={{ gap: 2 }}>
              <b className="small">{g.l.name}</b>
              <span className="tiny muted">
                {g.rows.map((r) => `${r.a.name} ${r.days} ${r.days === 1 ? 'día' : 'días'}`).join(' · ')}
                {g.notes ? ` · ${g.notes} ${g.notes === 1 ? 'aprendizaje' : 'aprendizajes'}` : ''}
              </span>
            </div>
          ))}
          {probando.length > 0 && (
            <div className="col" style={{ gap: 4, marginTop: 4 }}>
              <span className="tiny muted">Vehículos que estás probando:</span>
              {probando.map((v) => (
                <span key={v.id} className="small">
                  <b>{v.name}</b>
                  {v.hypothesis ? <span className="muted"> — {v.hypothesis}</span> : null}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

/** Patrones de 4 semanas: lo que tus datos sugieren, siempre con su tamaño de muestra. */
export function Patrones() {
  const st = useStore();
  const list = useMemo(
    () =>
      patterns({
        now: Date.now(),
        areas: st.areas,
        clips: st.clips,
        hechos: st.hechos,
        planes: st.planes,
        wakes: st.sleep.wakes,
        beds: st.sleep.beds,
        dificultades: st.dificultades,
        shifts: st.shifts,
      }),
    [st.areas, st.clips, st.hechos, st.planes, st.sleep, st.dificultades, st.shifts],
  );
  return (
    <Section eyebrow="Lo que muestran tus datos" title="Patrones de las últimas 4 semanas">
      <div className="col" style={{ gap: 10 }}>
        {list.map((s, i) => (
          <div key={i} className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
            <span className="badge" style={{ ['--c' as string]: TAG[s.type].color, minWidth: 104, justifyContent: 'center', marginTop: 1 }}>
              {TAG[s.type].label}
            </span>
            <span style={{ color: s.type === 'sin-datos' ? 'var(--muted)' : 'var(--text)' }}>{s.text}</span>
          </div>
        ))}
      </div>
      <p className="tiny faint" style={{ marginTop: 12 }}>Son observaciones para investigar, no conclusiones: cada una dice con cuántos días se calculó.</p>
    </Section>
  );
}

/** Memoria de experimentos: situación → posible explicación → prueba → observación → conclusión. */
export function MemoriaExperimentos() {
  const reviews = useStore((s) => s.reviews);
  const rows = Object.values(reviews)
    .filter((r) => r.experiment?.trim())
    .sort((a, b) => (a.week < b.week ? 1 : -1))
    .map((r) => ({ r, next: reviews[shiftWeek(r.week, 1)] }));
  const NEXT = { continuar: 'Continuar', modificar: 'Modificar la prueba', otra: 'Investigar otra explicación' } as const;
  const RES = { si: 'La ejecuté', parcial: 'A medias', no: 'No la ejecuté' } as const;
  return (
    <Section eyebrow="Memoria de experimentos" title="Lo que has comprobado y lo que solo supones" right={<FlaskConical size={18} className="muted" />}>
      {rows.length === 0 ? (
        <p className="small muted">Cada domingo, al sellar la semana, defines un experimento. Aquí queda su historia: la situación, tu posible explicación, la prueba, lo que observaste y qué decidiste.</p>
      ) : (
        <div className="col" style={{ gap: 12 }}>
          {rows.map(({ r, next }) => {
            const comprobado = !!next?.experimentObs?.trim();
            return (
              <div key={r.week} className="col" style={{ gap: 4, padding: 12, borderRadius: 14, background: 'rgba(255,255,255,.03)', border: `1px solid ${comprobado ? 'rgba(52,211,153,.3)' : 'rgba(255,255,255,.08)'}` }}>
                <div className="row between tiny muted">
                  <span>
                    Semana {weekNumber(r.week)} · {weekLabel(r.week)}
                  </span>
                  <span style={{ color: comprobado ? 'var(--ok)' : 'var(--muted)' }}>{comprobado ? 'Comprobado' : 'Por observar'}</span>
                </div>
                {r.experimentWhy && <span className="small muted">Situación y posible explicación: {r.experimentWhy}</span>}
                <span className="small">
                  <b>Prueba:</b> {r.experiment}
                </span>
                {next?.experimentResult && <span className="small muted">Ejecución: {RES[next.experimentResult]}</span>}
                {next?.experimentObs && (
                  <span className="small">
                    <b>Observé:</b> {next.experimentObs}
                  </span>
                )}
                {next?.experimentNext && <span className="small muted">Conclusión provisional: {NEXT[next.experimentNext]}</span>}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

/** Guarda un respaldo completo (lo comparte en el celular o lo descarga en el computador). */
export async function guardarRespaldo(withRecordings = false) {
  const st = useStore.getState();
  try {
    const R = await import('../lib/respaldo');
    const { file } = await R.makeBackup({ withRecordings });
    const how = await R.deliverBackup(file);
    st.setSettings({ lastBackup: Date.now() });
    st.toast(how === 'compartido' ? 'Respaldo listo: elige Drive o Archivos para guardarlo.' : `Respaldo descargado (${(file.size / 1048576).toFixed(1)} MB).`, 'ok');
  } catch (e) {
    if ((e as Error).name !== 'AbortError') st.toast('No se pudo crear el respaldo.', 'error');
  }
}

/** Un recordatorio suave si hace una semana que no guardas copia. */
export function BackupNudge() {
  const last = useStore((s) => s.settings.lastBackup);
  const [busy, setBusy] = useState(false);
  const days = last ? Math.floor((Date.now() - last) / 864e5) : null;
  if (days !== null && days < 6) return null;
  return (
    <div className="card row wrap" style={{ gap: 12, padding: 16, borderColor: 'rgba(109,139,255,.35)' }}>
      <ShieldCheck size={20} color="#6D8BFF" />
      <div className="grow small">
        <b>Protege tu historial.</b> {days === null ? 'Aún no tienes copia de seguridad.' : `Tu última copia fue hace ${days} días.`} Un solo archivo con tu rutina, aprendizajes, revisiones, experimentos y huellas; guárdalo en Drive.
      </div>
      <button
        className="btn sm primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await guardarRespaldo();
          setBusy(false);
        }}
      >
        {busy ? 'Preparando…' : 'Guardar copia'}
      </button>
    </div>
  );
}
