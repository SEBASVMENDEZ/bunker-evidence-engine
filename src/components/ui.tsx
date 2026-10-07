import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, CircleAlert, Info, Star, Zap, Play, Sparkles } from 'lucide-react';
import { iconInner } from '../lib/icons';
import type { Area, Clip } from '../lib/types';
import { useStore } from '../store';
import { fmtDuration, hm } from '../lib/time';
import { KIND_INFO } from '../lib/content';
import { sound } from '../lib/sound';

export function Glyph({ icon, size = 20, color = 'currentColor', stroke = 1.8 }: { icon: string; size?: number; color?: string; stroke?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: iconInner(icon) }}
    />
  );
}

export function AreaIcon({
  area, size = 44, dim = false, done = false, style,
}: { area?: Pick<Area, 'icon' | 'color'> | null; size?: number; dim?: boolean; done?: boolean; style?: CSSProperties }) {
  return (
    <div className={`area-icon${dim ? ' dim' : ''}`} style={{ width: size, height: size, ['--c' as string]: area?.color ?? '#94A3B8', ...style }}>
      <Glyph icon={area?.icon ?? 'chispa'} size={size * 0.56} color="#fff" stroke={size > 60 ? 1.6 : 1.9} />
      {done && (
        <span className="check">
          <Check size={12} strokeWidth={3.5} color="#05230F" />
        </span>
      )}
    </div>
  );
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8.5Z" stroke="white" strokeWidth="1.9" strokeLinejoin="round" />
      <circle cx="12" cy="14" r="2.6" fill="#fff" />
      <path d="M12 14h0" stroke="#3A3FD8" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Número que cuenta hasta su valor. */
export function Counter({ value, format = (v: number) => String(Math.round(v)), duration = 900 }: { value: number; format?: (v: number) => string; duration?: number }) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      setV(a + (value - a) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{format(v)}</>;
}

/** Anillo segmentado: un segmento por área, encendido si hay evidencia. */
export function RoutineRing({ areas, done, size = 210, children }: { areas: Area[]; done: Set<string>; size?: number; children?: ReactNode }) {
  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  const n = Math.max(1, areas.length);
  const gap = 10;
  const seg = c / n - gap;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
        <defs>
          <filter id="ringglow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {areas.map((a, i) => {
          const on = done.has(a.id);
          return (
            <motion.circle
              key={a.id}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={on ? a.color : 'rgba(255,255,255,0.08)'}
              strokeWidth={on ? 11 : 9}
              strokeLinecap="round"
              strokeDasharray={`${seg} ${c - seg}`}
              initial={{ strokeDashoffset: -i * (seg + gap) + seg, opacity: 0 }}
              animate={{ strokeDashoffset: -i * (seg + gap), opacity: 1 }}
              transition={{ delay: 0.15 + i * 0.07, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              filter={on ? 'url(#ringglow)' : undefined}
            />
          );
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{children}</div>
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`switch${on ? ' on' : ''}`}
      onClick={() => {
        sound.play('tap');
        onChange(!on);
      }}
    />
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            className="toast"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            <span
              className="ti"
              style={{
                background: t.kind === 'ok' ? 'rgba(52,211,153,.16)' : t.kind === 'error' ? 'rgba(251,113,133,.16)' : 'rgba(109,139,255,.16)',
                color: t.kind === 'ok' ? 'var(--ok)' : t.kind === 'error' ? 'var(--bad)' : 'var(--accent)',
              }}
            >
              {t.kind === 'ok' ? <Check size={16} /> : t.kind === 'error' ? <CircleAlert size={16} /> : <Info size={16} />}
            </span>
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function KindBadge({ kind }: { kind: Clip['kind'] }) {
  const colors: Record<Clip['kind'], string> = {
    proceso: '#38BDF8',
    explicacion: '#A5B4FC',
    transicion: '#94A3B8',
    reflexion: '#34D399',
    repeticion: '#C084FC',
  };
  return (
    <span className="badge" style={{ ['--c' as string]: colors[kind] }}>
      {kind === 'proceso' && <Zap size={10} />}
      {KIND_INFO[kind].treatment.toUpperCase()}
    </span>
  );
}

export function ClipThumb({ clip, area, onClick, showDate = false }: { clip: Clip; area?: Area; onClick?: () => void; showDate?: boolean }) {
  const analyzing = useStore((s) => (s.analyzing?.id === clip.id ? s.analyzing.p : null));
  return (
    <motion.div
      layout
      className="thumb"
      style={{ ['--c' as string]: area?.color ?? '#56617f' }}
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: clip.excluded ? 0.4 : 1, scale: 1 }}
      transition={{ duration: 0.35 }}
    >
      {clip.thumb ? (
        <img src={clip.thumb} alt="" loading="lazy" />
      ) : (
        <div className="placeholder">
          {clip.status === 'pendiente' ? <div className="shimmer" style={{ position: 'absolute', inset: 0 }} /> : <AreaIcon area={area} size={40} />}
        </div>
      )}
      <div className="tl">
        {area && (
          <span className="glass-pill">
            <span style={{ width: 7, height: 7, borderRadius: 9, background: area.color }} />
            {area.name}
          </span>
        )}
        {!area && clip.status === 'listo' && <span className="glass-pill">Sin área</span>}
      </div>
      <div className="tr row" style={{ gap: 4 }}>
        {clip.starred && (
          <span className="glass-pill" style={{ color: '#F5B94A' }}>
            <Star size={11} fill="#F5B94A" />
          </span>
        )}
        {clip.source === 'demo' && <span className="glass-pill">DEMO</span>}
        {clip.span && <span className="glass-pill" title="Parte de un video con varias actividades">TRAMO</span>}
        {clip.lapse && (
          <span className="glass-pill" style={{ color: '#7DD3FC' }} title="Time-lapse">
            ×{clip.realDuration && clip.duration ? Math.round(clip.realDuration / clip.duration) : clip.speed ?? '?'}
          </span>
        )}
        {clip.recovered && <span className="glass-pill" style={{ color: 'var(--ok)' }}>RECUPERADO</span>}
      </div>
      <div className="meta">
        <span className="mono">{showDate ? new Date(clip.takenAt).toLocaleDateString('es', { weekday: 'short', day: 'numeric' }) + ' · ' : ''}{hm(clip.takenAt)}</span>
        <span className="mono">
          {analyzing !== null ? <span className="pulse">buscando actividades {Math.round(analyzing * 100)}%</span> : clip.status === 'pendiente' ? <span className="pulse">procesando…</span> : clip.status === 'sin-acceso' ? 'sin acceso' : clip.status === 'error' ? 'error' : clip.lapse ? `≈ ${fmtDuration(clip.realDuration ?? clip.duration)}` : fmtDuration(clip.duration)}
        </span>
      </div>
      <span className="edge" />
    </motion.div>
  );
}

export function Empty({ icon = <Sparkles />, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div style={{ display: 'inline-grid', placeItems: 'center', width: 64, height: 64, borderRadius: 20, background: 'var(--accent-soft)', color: 'var(--accent)', marginBottom: 14 }}>
        {icon}
      </div>
      <h3 style={{ fontSize: 19, color: 'var(--text)' }}>{title}</h3>
      {text && <p className="small" style={{ maxWidth: 420, margin: '8px auto 0' }}>{text}</p>}
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  );
}

export function PlayGlyph() {
  return <Play size={18} fill="currentColor" />;
}

export function Sparkline({ values, color = 'var(--accent)', w = 120, h = 34 }: { values: number[]; color?: string; w?: number; h?: number }) {
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * (w - 4) + 2, h - 3 - (v / max) * (h - 8)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${d} L${w - 2},${h} L2,${h} Z`;
  const id = `sg${Math.abs(color.split('').reduce((a, c) => a + c.charCodeAt(0), 0))}`;
  return (
    <svg width={w} height={h} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <motion.path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1 }} />
      {pts.length > 0 && <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3" fill={color} />}
    </svg>
  );
}

export function Section({ eyebrow, title, right, children, style }: { eyebrow?: string; title: string; right?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <motion.section
      className="card"
      style={style}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="card-title">
        <div>
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h3>{title}</h3>
        </div>
        {right}
      </div>
      {children}
    </motion.section>
  );
}

export const pageMotion = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
};
