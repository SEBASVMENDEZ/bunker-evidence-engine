// Puente a Atlas: el botón (solo en Estudio y Lectura) y la pregunta de un toque al volver.
import { BrainCircuit, Check } from 'lucide-react';
import { useStore } from '../store';
import { ATLAS_URL, usaAtlas } from '../lib/atlas';
import { dayKey } from '../lib/time';

/** "Repasar en Atlas": abre Atlas en otra pestaña. Fuera de Estudio y Lectura no aparece.
 *  lg = botón grande · sm = secundario · fila = chip, en su propia línea bajo el paso de la ruta. */
export function AtlasBoton({ areaId, size = 'lg' }: { areaId?: string | null; size?: 'lg' | 'sm' | 'fila' }) {
  const repasoHoy = useStore((s) => s.repasos[dayKey(Date.now())]);
  if (!usaAtlas(areaId)) return null;
  const done = !!repasoHoy?.si;
  const icon = size === 'lg' ? 18 : 14;
  return (
    <a
      className={size === 'fila' ? 'chip' : `btn ${size === 'lg' ? 'lg' : 'sm ghost'}`}
      href={ATLAS_URL}
      target="_blank"
      rel="noopener noreferrer"
      style={size === 'fila' ? { textDecoration: 'none', fontSize: 12, height: 28 } : { color: 'inherit', textDecoration: 'none' }}
      aria-label="Repasar en Atlas"
      title={done ? 'Ya repasaste hoy: puedes volver cuando quieras' : 'Abre Atlas en otra pestaña; al volver te pregunto si repasaste'}
      onClick={() => useStore.getState().abrirAtlas(areaId!)}
    >
      {done ? <Check size={icon} color="#34D399" /> : <BrainCircuit size={icon} />}
      Repasar en Atlas
    </a>
  );
}

/** Al volver de Atlas: "¿Repasaste tus conceptos?" (opcional, un toque). Solo el día que lo abriste. */
export function AtlasPregunta() {
  const abierto = useStore((s) => s.atlasAbierto);
  if (!abierto || abierto.day !== dayKey(Date.now())) return null;
  const { responderRepaso } = useStore.getState();
  return (
    <div className="col" style={{ gap: 8, width: '100%', textAlign: 'left', padding: 14, borderRadius: 18, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
      <b className="small">¿Repasaste tus conceptos?</b>
      <div className="row wrap" style={{ gap: 6 }}>
        <button className="chip" style={{ ['--c' as string]: '#34D399' }} onClick={() => responderRepaso(true)}>
          <Check size={14} /> Sí
        </button>
        <button className="chip" style={{ ['--c' as string]: '#94A3B8' }} onClick={() => responderRepaso(false)}>
          Hoy no
        </button>
      </div>
    </div>
  );
}
