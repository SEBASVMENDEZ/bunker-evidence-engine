// Dinero hoy: la tarjeta de Hoy (solo si hay pagos en los próximos días) y la lista de pagos en Ajustes.
import { useRef } from 'react';
import { motion } from 'motion/react';
import { Check, Plus, ShieldCheck, Trash2, Upload, Wallet, X } from 'lucide-react';
import { useStore } from '../store';
import { Section, Switch } from './ui';
import { cuando, fechaPago, leerPagos, pagadoKey, pesos, porPagar, type Pago } from '../lib/dinero';
import { dayKey, uid } from '../lib/time';

/** En Hoy: los pagos de los próximos 3 días y lo vencido, con un toque para marcar "pagado". Sin pagos, no aparece. */
export function DineroHoy() {
  const pagos = useStore((s) => s.pagos);
  const pagados = useStore((s) => s.pagados);
  const marcarPagado = useStore((s) => s.marcarPagado);
  const lista = porPagar(pagos, pagados, dayKey(Date.now()));
  if (!lista.length) return null;
  const vencidos = lista.some((v) => v.dias < 0);
  const total = lista.reduce((s, v) => s + v.pago.valor, 0);
  return (
    <motion.section
      className="card span-2"
      style={{ borderColor: vencidos ? 'color-mix(in srgb, var(--bad) 60%, transparent)' : undefined }}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="row between wrap" style={{ gap: 8 }}>
        <div className="row" style={{ gap: 8 }}>
          <Wallet size={18} color={vencidos ? 'var(--bad)' : 'var(--warn)'} />
          <b>Dinero hoy</b>
        </div>
        <span className="tiny muted">{pesos(total)} en {lista.length} {lista.length === 1 ? 'pago' : 'pagos'}</span>
      </div>
      <div className="col" style={{ gap: 2, marginTop: 10 }}>
        {lista.map((v) => (
          <div key={v.pago.id + v.ciclo} className="row" style={{ gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
            {v.pago.protegido ? <ShieldCheck size={15} color="var(--ok)" aria-label="Protegido" /> : <span style={{ width: 15 }} />}
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="small">{v.pago.name}</div>
              <div className="tiny" style={{ color: v.dias < 0 ? 'var(--bad)' : v.dias === 0 ? 'var(--warn)' : 'var(--text-2)', fontWeight: v.dias <= 0 ? 700 : 500 }}>
                {cuando(v.dias)}
              </div>
            </div>
            <span className="small mono" style={{ whiteSpace: 'nowrap' }}>{pesos(v.pago.valor)}</span>
            <button className="btn sm" onClick={() => marcarPagado(v.pago.id, v.ciclo)} aria-label={`Marcar pagado ${v.pago.name}`}>
              <Check size={14} /> Pagado
            </button>
          </div>
        ))}
      </div>
      <p className="tiny faint" style={{ marginTop: 8 }}>Día de pago: primero se separan las cuotas protegidas.</p>
    </motion.section>
  );
}

/** En Ajustes: la lista editable de pagos. Vacía por defecto; se puede importar de un archivo de tu dispositivo. */
export function PagosEditor() {
  const pagos = useStore((s) => s.pagos);
  const pagados = useStore((s) => s.pagados);
  const { setPagos, marcarPagado, toast } = useStore.getState();
  const fileRef = useRef<HTMLInputElement>(null);
  const hoy = dayKey(Date.now());
  const [y, m] = hoy.split('-').map(Number);
  const upd = (id: string, p: Partial<Pago>) => setPagos(pagos.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const add = () => setPagos([...pagos, { id: uid('p_'), name: '', valor: 0, dia: 1, protegido: true, desde: hoy }]);

  const importar = async (f: File) => {
    try {
      const nuevos = leerPagos(await f.text());
      if (!nuevos.length) throw new Error('vacío');
      // por nombre: actualiza los que ya tienes y agrega los nuevos (sin duplicar)
      const next = [...pagos];
      for (const n of nuevos) {
        const i = next.findIndex((x) => x.name.toLowerCase() === n.name.toLowerCase());
        if (i >= 0) next[i] = { ...next[i], ...n };
        else next.push({ id: uid('p_'), desde: hoy, ...n });
      }
      setPagos(next);
      toast(`Listo: ${nuevos.length} pagos importados.`, 'ok');
    } catch {
      toast('Ese archivo no tiene pagos que pueda leer.', 'error');
    }
  };

  return (
    <Section
      eyebrow="Pagos"
      title="Dinero hoy: tus pagos del mes"
      right={
        <div className="row" style={{ gap: 6 }}>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = ''; // permite volver a elegir el mismo archivo
              if (f) importar(f);
            }}
          />
          <button className="btn sm" onClick={() => fileRef.current?.click()}>
            <Upload size={14} /> Importar
          </button>
          <button className="btn sm" onClick={add}>
            <Plus size={14} /> Añadir
          </button>
        </div>
      }
    >
      <p className="small muted" style={{ marginTop: -6, marginBottom: 12 }}>
        En <b style={{ color: 'var(--text-2)' }}>Hoy</b> te aviso de lo que vence en los próximos 3 días y de lo vencido sin marcar. Tus pagos viven solo en este dispositivo y en tu respaldo, nunca en el código.
      </p>
      {!pagos.length && <p className="tiny faint">Aún no tienes pagos. Añádelos uno por uno o importa un archivo .json con tus pagos.</p>}
      <div className="col" style={{ gap: 8 }}>
        {pagos.map((p) => {
          const ciclo = fechaPago(p, y, m - 1).slice(0, 7);
          const pagadoEl = pagados[pagadoKey(p.id, ciclo)];
          return (
            // la clave incluye los valores: si un archivo importado los cambia, los campos se refrescan
            <div key={`${p.id}|${p.name}|${p.valor}|${p.dia}`} className="col" style={{ gap: 8, padding: 10, borderRadius: 14, border: '1px solid var(--stroke)' }}>
              <div className="row" style={{ gap: 8 }}>
                <input className="input grow" placeholder="Nombre (p. ej. Tarjeta)" defaultValue={p.name} onBlur={(e) => upd(p.id, { name: e.target.value.trim() })} />
                <button className="btn icon sm ghost" onClick={() => setPagos(pagos.filter((x) => x.id !== p.id))} aria-label={`Borrar ${p.name}`}>
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="row wrap" style={{ gap: 10 }}>
                <label className="tiny muted row" style={{ gap: 4 }}>
                  valor $
                  <input className="input" type="number" min={0} step={1000} defaultValue={p.valor || ''} onBlur={(e) => upd(p.id, { valor: Math.max(0, Math.round(+e.target.value || 0)) })} style={{ width: 110 }} />
                </label>
                <label className="tiny muted row" style={{ gap: 4 }}>
                  día
                  <input className="input" type="number" min={1} max={31} defaultValue={p.dia} onBlur={(e) => upd(p.id, { dia: Math.min(31, Math.max(1, Math.round(+e.target.value || 1))) })} style={{ width: 64 }} />
                </label>
                <span className="tiny muted row" style={{ gap: 6 }}>
                  protegido <Switch on={p.protegido} onChange={(v) => upd(p.id, { protegido: v })} label="Protegido" />
                </span>
                {pagadoEl && (
                  <button className="chip" style={{ fontSize: 12, height: 28 }} onClick={() => marcarPagado(p.id, ciclo, false)} title="Deshacer">
                    <Check size={13} color="var(--ok)" /> pagado este mes <X size={12} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
