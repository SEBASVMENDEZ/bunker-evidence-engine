// La cuarta mirada del domingo: dinero y estudio en tres cifras honestas (sin datos = "sin datos").
import { useMemo } from 'react';
import { BookOpen, Landmark, Wallet } from 'lucide-react';
import { useStore } from '../store';
import { Section } from './ui';
import { cuartaMirada } from '../lib/balance';

const ICONS = [Wallet, Landmark, BookOpen];

export function CuartaMirada({ week }: { week: string }) {
  const pagos = useStore((s) => s.pagos);
  const pagados = useStore((s) => s.pagados);
  const reviews = useStore((s) => s.reviews);
  const hechos = useStore((s) => s.hechos);
  const clips = useStore((s) => s.clips);
  const saveReview = useStore((s) => s.saveReview);
  const cifras = useMemo(() => cuartaMirada(week, { pagos, pagados, reviews, hechos, clips }), [week, pagos, pagados, reviews, hechos, clips]);
  const deuda = reviews[week]?.deudaTotal;

  return (
    <Section eyebrow="Cuarta mirada" title="Dinero y estudio">
      <div className="grid g-3" style={{ gap: 14, alignItems: 'start' }}>
        {cifras.map((c, i) => {
          const Icon = ICONS[i];
          return (
            <div key={c.label} className="col" style={{ gap: 6, padding: 14, borderRadius: 16, background: 'rgba(255,255,255,.03)', border: '1px solid var(--stroke)' }}>
              <div className="row" style={{ gap: 8 }}>
                <Icon size={16} className="muted" />
                <span className="label" style={{ margin: 0 }}>{c.label}</span>
              </div>
              {c.valor ? <b style={{ fontSize: 26, fontFamily: 'var(--font-d)' }}>{c.valor}</b> : <span className="muted" style={{ fontSize: 20 }}>sin datos</span>}
              {c.detalle && <span className="tiny muted">{c.detalle}</span>}
              {i === 1 && (
                <label className="col tiny muted" style={{ gap: 4, marginTop: 4 }}>
                  Deuda total del último extracto (opcional)
                  <input
                    key={`${week}|${deuda ?? ''}`}
                    className="input"
                    inputMode="numeric"
                    placeholder="p. ej. 29.000.000"
                    defaultValue={deuda ? deuda.toLocaleString('es-CO') : ''}
                    onBlur={(e) => {
                      const v = Number(e.target.value.replace(/[^\d]/g, ''));
                      saveReview(week, { deudaTotal: v > 0 ? v : undefined });
                    }}
                  />
                </label>
              )}
            </div>
          );
        })}
      </div>
      <p className="tiny faint" style={{ marginTop: 10 }}>Pagos según lo que marcas en Hoy · deuda según lo que escribes aquí · estudio según tus sesiones. Si falta el dato, no se inventa.</p>
    </Section>
  );
}
