// Renderizador de la película semanal (canvas 1920×1080 lógico).
import type { Area, Clip, Shifts, Statement } from '../types';
import type { WeekStats } from '../insights';
import type { Film, Seg } from './edl';
import { iconImageSync } from '../icons';
import { addDays, dayKey, weekStart, DAY_SHORT, fmtDuration, hm, DAY_NAMES, isoWeekday, weekLabel, weekNumber, MONTHS } from '../time';

export const W = 1920;
export const H = 1080;
export const FONT_D = '"Space Grotesk Variable", "Space Grotesk", "Segoe UI", system-ui, sans-serif';
export const FONT_U = '"Inter Variable", Inter, "Segoe UI", system-ui, sans-serif';

const C = {
  bg0: '#04060B',
  bg1: '#0A0F1E',
  text: '#F1F5FF',
  muted: '#8A94B2',
  faint: 'rgba(241,245,255,0.08)',
  accent: '#6D8BFF',
  glass: 'rgba(16,22,40,0.62)',
  stroke: 'rgba(255,255,255,0.10)',
};

export const TAG: Record<Statement['type'], { label: string; color: string }> = {
  metrica: { label: 'MÉTRICA', color: '#6D8BFF' },
  observacion: { label: 'OBSERVACIÓN', color: '#2DD4BF' },
  inferencia: { label: 'INFERENCIA', color: '#F5B94A' },
  'sin-datos': { label: 'SIN DATOS', color: '#94A3B8' },
  pregunta: { label: 'PREGUNTA', color: '#C084FC' },
};

export interface Scene {
  film: Film;
  stats: WeekStats;
  prevStats?: WeekStats;
  areas: Area[];
  clips: Map<string, Clip>;
  thumbs: Map<string, HTMLImageElement>;
  userName: string;
  shifts?: Shifts;
}

// ---------------- utilidades ----------------
const dayKeyOf = (week: string, i: number) => dayKey(addDays(weekStart(week), i));
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeInOut = (x: number) => {
  const t = clamp01(x);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
const easeBack = (x: number) => {
  const t = clamp01(x);
  const c1 = 1.5;
  return 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
/** 0→1 entre a y b */
const ramp = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
/** envolvente de aparición/desaparición de una escena */
export function envelope(t: number, dur: number, fin = 0.45, fout = 0.45) {
  return Math.min(easeOut(t / fin), easeOut((dur - t) / fout));
}

function hexA(hex: string, a: number) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function font(ctx: CanvasRenderingContext2D, size: number, weight = 600, display = true) {
  ctx.font = `${weight} ${size}px ${display ? FONT_D : FONT_U}`;
}

function text(
  ctx: CanvasRenderingContext2D, s: string, x: number, y: number,
  o: { size?: number; weight?: number; color?: string; align?: CanvasTextAlign; display?: boolean; alpha?: number; spacing?: number; baseline?: CanvasTextBaseline } = {},
) {
  font(ctx, o.size ?? 32, o.weight ?? 600, o.display ?? true);
  ctx.fillStyle = o.color ?? C.text;
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = o.baseline ?? 'alphabetic';
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * (o.alpha ?? 1);
  if (o.spacing) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${o.spacing}px`;
  ctx.fillText(s, x, y);
  if (o.spacing) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
  ctx.globalAlpha = prev;
}

export function wrap(ctx: CanvasRenderingContext2D, s: string, maxW: number): string[] {
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function glass(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 28, tint?: string, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  rr(ctx, x, y, w, h, r);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, tint ? hexA(tint, 0.16) : 'rgba(30,38,64,0.66)');
  g.addColorStop(1, 'rgba(10,14,28,0.72)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 1.5;
  const sg = ctx.createLinearGradient(x, y, x, y + h);
  sg.addColorStop(0, 'rgba(255,255,255,0.18)');
  sg.addColorStop(1, 'rgba(255,255,255,0.03)');
  ctx.strokeStyle = sg;
  ctx.stroke();
  ctx.restore();
}

/** Icono "3D ligero": placa de vidrio con degradado, brillo y halo de color. */
export function iconTile(ctx: CanvasRenderingContext2D, icon: string, color: string, cx: number, cy: number, size: number, alpha = 1, glow = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  const x = cx - size / 2;
  const y = cy - size / 2;
  const r = size * 0.28;
  // halo
  ctx.shadowColor = hexA(color, 0.55 * glow);
  ctx.shadowBlur = size * 0.5;
  ctx.shadowOffsetY = size * 0.08;
  rr(ctx, x, y, size, size, r);
  const g = ctx.createLinearGradient(x, y, x + size, y + size);
  g.addColorStop(0, hexA(color, 0.95));
  g.addColorStop(1, hexA(color, 0.45));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  // capa oscura para profundidad
  const d = ctx.createLinearGradient(x, y, x, y + size);
  d.addColorStop(0, 'rgba(255,255,255,0.28)');
  d.addColorStop(0.45, 'rgba(255,255,255,0.02)');
  d.addColorStop(1, 'rgba(0,0,0,0.28)');
  rr(ctx, x, y, size, size, r);
  ctx.fillStyle = d;
  ctx.fill();
  ctx.lineWidth = Math.max(1, size * 0.012);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.stroke();
  const img = iconImageSync(icon, '#ffffff', 256);
  if (img) {
    const s = size * 0.56;
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = size * 0.06;
    ctx.shadowOffsetY = size * 0.03;
    ctx.drawImage(img, cx - s / 2, cy - s / 2, s, s);
  }
  ctx.restore();
}

// ---------------- fondo ----------------
let grain: HTMLCanvasElement | null = null;
function grainCanvas() {
  if (grain) return grain;
  grain = document.createElement('canvas');
  grain.width = grain.height = 256;
  const g = grain.getContext('2d')!;
  const im = g.createImageData(256, 256);
  for (let i = 0; i < im.data.length; i += 4) {
    const v = Math.random() * 255;
    im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
    im.data[i + 3] = 18;
  }
  g.putImageData(im, 0, 0);
  return grain;
}

export function background(ctx: CanvasRenderingContext2D, time: number, tint = C.accent, tint2 = '#A78BFA') {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, C.bg1);
  g.addColorStop(1, C.bg0);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const blobs: [number, number, number, string, number][] = [
    [0.2 + 0.08 * Math.sin(time * 0.13), 0.25 + 0.06 * Math.cos(time * 0.11), 900, tint, 0.2],
    [0.85 + 0.06 * Math.cos(time * 0.09), 0.8 + 0.05 * Math.sin(time * 0.15), 1000, tint2, 0.14],
    [0.55 + 0.1 * Math.sin(time * 0.07 + 2), 0.1, 700, '#2DD4BF', 0.07],
  ];
  for (const [bx, by, r, col, a] of blobs) {
    const rg = ctx.createRadialGradient(bx * W, by * H, 0, bx * W, by * H, r);
    rg.addColorStop(0, hexA(col, a));
    rg.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }
  // rejilla técnica sutil
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.025)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 96) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += 96) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();
  vignette(ctx);
}

function vignette(ctx: CanvasRenderingContext2D, k = 0.65) {
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, `rgba(0,0,0,${k})`);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

export function grainOverlay(ctx: CanvasRenderingContext2D) {
  const g = grainCanvas();
  ctx.save();
  ctx.globalAlpha = 0.5;
  const ox = Math.floor(Math.random() * 256);
  const oy = Math.floor(Math.random() * 256);
  ctx.translate(-ox, -oy);
  ctx.fillStyle = ctx.createPattern(g, 'repeat')!;
  ctx.fillRect(0, 0, W + 256, H + 256);
  ctx.restore();
}

// ---------------- escenas ----------------
function logo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha = 1, align: CanvasTextAlign = 'left') {
  text(ctx, 'BÚNKER', x, y, { size, weight: 700, spacing: size * 0.22, align, alpha });
}

export function drawIntro(ctx: CanvasRenderingContext2D, sc: Scene, t: number, dur: number) {
  background(ctx, t, '#6D8BFF', '#A78BFA');
  const env = envelope(t, dur, 0.2, 0.6);
  ctx.save();
  ctx.globalAlpha = env;
  const cx = W / 2;
  // línea de luz
  const lw = easeInOut(ramp(t, 0.1, 1.2)) * 1100;
  const lg = ctx.createLinearGradient(cx - lw / 2, 0, cx + lw / 2, 0);
  lg.addColorStop(0, 'rgba(109,139,255,0)');
  lg.addColorStop(0.5, 'rgba(180,200,255,0.95)');
  lg.addColorStop(1, 'rgba(109,139,255,0)');
  ctx.fillStyle = lg;
  ctx.fillRect(cx - lw / 2, H / 2 + 10, lw, 2);
  // destello
  const flash = Math.max(0, 1 - Math.abs(t - 1.3) / 0.35);
  if (flash > 0) {
    const fg = ctx.createRadialGradient(cx, H / 2, 0, cx, H / 2, 700);
    fg.addColorStop(0, `rgba(170,190,255,${0.35 * flash})`);
    fg.addColorStop(1, 'rgba(170,190,255,0)');
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, W, H);
  }
  const a = easeOut(ramp(t, 0.5, 1.5));
  const spacing = 70 - 40 * a;
  text(ctx, 'BÚNKER', cx + spacing / 2, H / 2 - 30, { size: 150, weight: 700, align: 'center', spacing, alpha: a });
  text(ctx, 'EVIDENCE ENGINE', cx + 9, H / 2 + 62, { size: 30, weight: 500, align: 'center', spacing: 18, color: '#AFC0FF', alpha: easeOut(ramp(t, 1.0, 1.8)) });
  const b = easeOut(ramp(t, 1.9, 2.7));
  text(ctx, `SEMANA ${weekNumber(sc.film.week)}`, cx, H / 2 + 200 + (1 - b) * 20, { size: 46, weight: 600, align: 'center', spacing: 10, alpha: b });
  text(ctx, weekLabel(sc.film.week), cx, H / 2 + 252 + (1 - b) * 20, { size: 28, weight: 400, align: 'center', color: C.muted, display: false, alpha: b });
  const c = easeOut(ramp(t, 2.6, 3.3));
  text(ctx, '“Yo grabo. El sistema hace el resto.”', cx, H - 110, { size: 26, weight: 400, align: 'center', color: '#8FA0D0', display: false, alpha: c });
  ctx.restore();
}

function compactTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

function counter(v: number, p: number) {
  return Math.round(v * easeOut(p));
}

function mosaic(ctx: CanvasRenderingContext2D, sc: Scene, t: number, x: number, y: number, w: number, h: number) {
  const imgs = sc.stats.clips.map((c) => sc.thumbs.get(c.id)).filter(Boolean) as HTMLImageElement[];
  const demo = sc.stats.clips.filter((c) => c.source === 'demo');
  const n = Math.min(24, Math.max(imgs.length, demo.length ? Math.min(24, sc.stats.clips.length) : 0));
  if (!n) return;
  // la rejilla que da miniaturas más grandes manteniendo proporción 16:10
  const gap = 14;
  let best = { cols: 2, cw: 0, chh: 0, rows: 1 };
  for (let cols = 1; cols <= 8; cols++) {
    const rows = Math.ceil(n / cols);
    let cw = (w - gap * (cols - 1)) / cols;
    let chh = cw * 0.625;
    const totalH = rows * chh + gap * (rows - 1);
    if (totalH > h) {
      chh = (h - gap * (rows - 1)) / rows;
      cw = chh / 0.625;
    }
    if (cw * chh > best.cw * best.chh) best = { cols, cw, chh, rows };
  }
  const { cols, cw, chh, rows } = best;
  const ox = x + (w - (cols * cw + gap * (cols - 1))) / 2;
  const oy = y + (h - (rows * chh + gap * (rows - 1))) / 2;
  for (let i = 0; i < n; i++) {
    const p = easeBack(ramp(t, 0.4 + i * 0.06, 1.0 + i * 0.06));
    if (p <= 0) continue;
    const cx = ox + (i % cols) * (cw + gap);
    const cy = oy + Math.floor(i / cols) * (chh + gap);
    ctx.save();
    ctx.globalAlpha *= clamp01(p);
    const s = 0.85 + 0.15 * p;
    ctx.translate(cx + cw / 2, cy + chh / 2);
    ctx.scale(s, s);
    rr(ctx, -cw / 2, -chh / 2, cw, chh, 16);
    ctx.clip();
    const img = imgs[i];
    const clip = sc.stats.clips[i];
    const area = sc.areas.find((a) => a.id === clip?.areaId);
    if (img) {
      const ir = img.width / img.height;
      const tr = cw / chh;
      const k = 1.08 + 0.04 * Math.sin(t * 0.4 + i);
      let dw = cw * k;
      let dh = chh * k;
      if (ir > tr) dw = dh * ir;
      else dh = dw / ir;
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    } else {
      const g = ctx.createLinearGradient(-cw / 2, -chh / 2, cw / 2, chh / 2);
      g.addColorStop(0, hexA(area?.color ?? C.accent, 0.7));
      g.addColorStop(1, hexA(area?.color ?? C.accent, 0.15));
      ctx.fillStyle = g;
      ctx.fillRect(-cw / 2, -chh / 2, cw, chh);
      const ic = iconImageSync(area?.icon ?? 'chispa', '#ffffff', 256);
      if (ic) {
        ctx.globalAlpha *= 0.85;
        const is = Math.min(cw, chh) * 0.42;
        ctx.drawImage(ic, -is / 2, -is / 2, is, is);
      }
    }
    if (area) {
      ctx.fillStyle = area.color;
      ctx.fillRect(-cw / 2, chh / 2 - 5, cw, 5);
    }
    ctx.restore();
  }
}

export function drawResumen(ctx: CanvasRenderingContext2D, sc: Scene, t: number, dur: number) {
  background(ctx, t + 4);
  const env = envelope(t, dur, 0.5, 0.5);
  ctx.save();
  ctx.globalAlpha = env;
  const st = sc.stats;
  const a = easeOut(ramp(t, 0.1, 0.8));
  text(ctx, 'TU SEMANA EN EVIDENCIA', 120, 170, { size: 26, weight: 600, spacing: 8, color: '#AFC0FF', alpha: a });
  text(ctx, weekLabel(sc.film.week), 120, 240, { size: 64, weight: 700, alpha: a });
  const sessions = Object.values(st.areas).reduce((s, x) => s + x.sessions, 0);
  const p = ramp(t, 0.6, 2.4);
  const kpis: [string, string][] = [
    ['EVIDENCIAS', String(counter(st.total, p))],
    ['TIEMPO', compactTime(st.seconds * easeOut(p))],
    ['DÍAS ACTIVOS', `${counter(st.activeDays, p)}/7`],
    ['SESIONES', String(counter(sessions, p))],
  ];
  kpis.forEach(([k, v], i) => {
    const x = 120 + (i % 2) * 380;
    const y = 320 + Math.floor(i / 2) * 230;
    const ap = easeOut(ramp(t, 0.4 + i * 0.12, 1.0 + i * 0.12));
    glass(ctx, x, y + (1 - ap) * 30, 350, 200, 28, undefined, ap);
    text(ctx, k, x + 32, y + 62 + (1 - ap) * 30, { size: 20, weight: 600, spacing: 4, color: C.muted, display: false, alpha: ap });
    text(ctx, v, x + 32, y + 158 + (1 - ap) * 30, { size: 84, weight: 700, alpha: ap });
  });
  // tira de días
  const dy = 860;
  DAY_SHORT.forEach((d, i) => {
    const x = 120 + i * 104;
    const ap = easeOut(ramp(t, 1.4 + i * 0.08, 2.0 + i * 0.08));
    const day = st.perDay[i];
    text(ctx, d, x + 40, dy, { size: 22, weight: 600, align: 'center', color: day.clips ? C.text : C.muted, alpha: ap });
    const areasDone = sc.areas.filter((ar) => day.areas.has(ar.id));
    areasDone.slice(0, 8).forEach((ar, j) => {
      ctx.save();
      ctx.globalAlpha *= ap;
      ctx.fillStyle = ar.color;
      ctx.shadowColor = hexA(ar.color, 0.8);
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(x + 22 + (j % 4) * 12, dy + 30 + Math.floor(j / 4) * 14, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
    const sh = sc.shifts?.[dayKeyOf(sc.film.week, i)];
    if (sh) text(ctx, sh.off ? 'desc.' : sh.start, x + 40, dy + 86, { size: 18, weight: 500, align: 'center', display: false, color: sh.off ? '#FDA4AF' : '#6B7699', alpha: ap });
    if (!day.clips) {
      ctx.save();
      ctx.globalAlpha *= ap * 0.5;
      ctx.strokeStyle = C.muted;
      ctx.beginPath();
      ctx.arc(x + 40, dy + 36, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  });
  mosaic(ctx, sc, t, 980, 150, 820, 780);
  ctx.restore();
}

export function drawExperimento(ctx: CanvasRenderingContext2D, _sc: Scene, t: number, dur: number, exp: string) {
  background(ctx, t + 9, '#F5B94A', '#6D8BFF');
  const env = envelope(t, dur);
  ctx.save();
  ctx.globalAlpha = env;
  text(ctx, 'LA SEMANA PASADA DECIDISTE', W / 2, 330, { size: 26, weight: 600, spacing: 8, align: 'center', color: '#F5D08A' });
  font(ctx, 72, 600);
  const lines = wrap(ctx, `“${exp}”`, 1400);
  const p = easeOut(ramp(t, 0.3, 1.2));
  lines.slice(0, 3).forEach((l, i) => text(ctx, l, W / 2, 470 + i * 92 + (1 - p) * 20, { size: 72, weight: 600, align: 'center', alpha: p }));
  text(ctx, 'Veamos qué muestra la evidencia.', W / 2, 820, { size: 32, weight: 400, align: 'center', display: false, color: C.muted, alpha: easeOut(ramp(t, 1.6, 2.4)) });
  ctx.restore();
}

export function drawCapitulo(ctx: CanvasRenderingContext2D, sc: Scene, t: number, dur: number, seg: Extract<Seg, { t: 'capitulo' }>) {
  background(ctx, t + seg.start * 0.1, seg.color, seg.color);
  const env = envelope(t, dur, 0.35, 0.4);
  ctx.save();
  ctx.globalAlpha = env;
  const chapterNo = sc.film.chapters.findIndex((c) => c.title === seg.title);
  // aro de luz
  const ring = easeOut(ramp(t, 0, 1.2));
  ctx.save();
  ctx.strokeStyle = hexA(seg.color, 0.35 * (1 - ring * 0.6));
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(560, H / 2, 140 + ring * 260, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  const ip = easeBack(ramp(t, 0.1, 0.8));
  iconTile(ctx, seg.icon, seg.color, 560, H / 2, 260 * ip, clamp01(ip));
  const a = easeOut(ramp(t, 0.3, 1.0));
  const dx = (1 - a) * 40;
  text(ctx, `CAPÍTULO ${String(chapterNo).padStart(2, '0')}`, 820 + dx, 400, { size: 26, weight: 600, spacing: 10, color: hexA(seg.color, 1), alpha: a });
  text(ctx, seg.title, 812 + dx, 540, { size: 150, weight: 700, alpha: a });
  text(ctx, seg.subtitle, 820 + dx, 610, { size: 34, weight: 400, display: false, color: '#B9C3E0', alpha: easeOut(ramp(t, 0.5, 1.2)) });
  // días
  DAY_SHORT.forEach((d, i) => {
    const on = seg.days[i];
    const p = easeBack(ramp(t, 0.7 + i * 0.07, 1.2 + i * 0.07));
    const x = 846 + i * 86;
    const y = 720;
    ctx.save();
    ctx.globalAlpha *= clamp01(p);
    ctx.beginPath();
    ctx.arc(x, y, 30 * Math.max(0.3, p), 0, Math.PI * 2);
    if (on) {
      ctx.fillStyle = seg.color;
      ctx.shadowColor = hexA(seg.color, 0.8);
      ctx.shadowBlur = 24;
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
    text(ctx, d, x, y + 9, { size: 24, weight: 700, align: 'center', color: on ? '#0A0F1E' : C.muted, alpha: clamp01(p) });
  });
  ctx.restore();
}

/** Escena virtual para clips de demostración (sin archivo de video). */
export function drawDemo(ctx: CanvasRenderingContext2D, clip: Clip, area: Area | undefined, src: number) {
  const col = area?.color ?? C.accent;
  const seed = clip.demoSeed ?? 1;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, hexA(col, 0.55));
  g.addColorStop(1, '#070A14');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2 - 40);
  for (let i = 0; i < 5; i++) {
    ctx.rotate(src * 0.08 * (i % 2 ? 1 : -1) + seed);
    ctx.strokeStyle = hexA(col, 0.12 + i * 0.05);
    ctx.lineWidth = 3;
    ctx.setLineDash([30 + i * 10, 24]);
    ctx.beginPath();
    ctx.arc(0, 0, 180 + i * 70, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
  for (let i = 0; i < 40; i++) {
    const a = (i * 137.5 + seed * 50) * (Math.PI / 180);
    const r = 260 + ((src * 18 + i * 37) % 520);
    ctx.fillStyle = hexA('#ffffff', 0.25 * (1 - r / 800));
    ctx.beginPath();
    ctx.arc(W / 2 + Math.cos(a) * r, H / 2 - 40 + Math.sin(a) * r * 0.62, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  iconTile(ctx, area?.icon ?? 'chispa', col, W / 2, H / 2 - 40, 220, 1, 0.8);
  text(ctx, `${fmtDuration(src)}  /  ${fmtDuration(clip.duration)}`, W / 2, H / 2 + 170, { size: 30, weight: 500, align: 'center', color: 'rgba(255,255,255,0.7)', display: false });
  text(ctx, 'CLIP DE DEMOSTRACIÓN', W / 2, H / 2 + 215, { size: 18, weight: 600, align: 'center', color: 'rgba(255,255,255,0.4)', spacing: 6, display: false });
}

let blurCanvas: HTMLCanvasElement | null = null;

/** Dibuja un fotograma: horizontal → a pantalla completa; vertical → centrado con fondo difuminado. */
export function drawVideoFrame(ctx: CanvasRenderingContext2D, v: HTMLVideoElement, t: number) {
  const vw = v.videoWidth;
  const vh = v.videoHeight;
  if (!vw || !vh) return;
  const r = vw / vh;
  if (r >= 1.45) {
    const k = 1.0 + 0.012 * Math.sin(t * 0.3);
    let dw = W * k;
    let dh = dw / r;
    if (dh < H * k) {
      dh = H * k;
      dw = dh * r;
    }
    ctx.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
    return;
  }
  if (!blurCanvas) {
    blurCanvas = document.createElement('canvas');
    blurCanvas.width = 48;
    blurCanvas.height = 27;
  }
  const b = blurCanvas.getContext('2d')!;
  const bw = 48;
  const bh = bw / r;
  b.drawImage(v, 0, (27 - bh) / 2, bw, bh);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(blurCanvas, -40, -40, W + 80, H + 80);
  ctx.fillStyle = 'rgba(4,6,12,0.55)';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  const dh = H - 80;
  const dw = dh * r;
  const x = (W - dw) / 2;
  const y = 40;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 60;
  rr(ctx, x, y, dw, dh, 28);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.clip();
  ctx.drawImage(v, x, y, dw, dh);
  ctx.restore();
}

const BADGES: Record<string, { label: string; color: string }> = {
  acelerado: { label: 'ACELERADO', color: '#38BDF8' },
  momento: { label: '★ MOMENTO', color: '#F5B94A' },
  completo: { label: 'COMPLETO', color: '#34D399' },
  normal: { label: 'VELOCIDAD REAL', color: '#A5B4FC' },
  destello: { label: 'TRANSICIÓN', color: '#94A3B8' },
  montaje: { label: 'MONTAJE', color: '#C084FC' },
};

export function drawClipOverlay(ctx: CanvasRenderingContext2D, sc: Scene, seg: Extract<Seg, { t: 'clip' }>, local: number, src: number) {
  const clip = sc.clips.get(seg.clipId);
  if (!clip) return;
  const area = sc.areas.find((a) => a.id === clip.areaId);
  const col = area?.color ?? '#94A3B8';
  // degradado inferior para legibilidad
  const g = ctx.createLinearGradient(0, H - 340, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = g;
  ctx.fillRect(0, H - 340, W, 340);

  const first = seg.part[0] === 1;
  const a = first ? easeOut(ramp(local, 0, 0.45)) : 1;
  const y0 = H - 196 + (1 - a) * 40;
  const date = new Date(clip.takenAt);
  const line2 = `${DAY_NAMES[isoWeekday(date) - 1]} ${date.getDate()} ${MONTHS[date.getMonth()]} · ${hm(clip.takenAt)}`;
  font(ctx, 46, 700);
  const nameW = ctx.measureText(area?.name ?? 'Sin clasificar').width;
  font(ctx, 26, 500, false);
  const l2w = ctx.measureText(line2).width;
  const boxW = Math.max(nameW, l2w) + 200;
  ctx.save();
  ctx.globalAlpha = a;
  glass(ctx, 64, y0, boxW, 136, 30, col);
  iconTile(ctx, area?.icon ?? 'chispa', col, 64 + 70, y0 + 68, 84, 1, 0.6);
  text(ctx, area?.name ?? 'Sin clasificar', 64 + 134, y0 + 64, { size: 46, weight: 700 });
  text(ctx, line2, 64 + 136, y0 + 106, { size: 26, weight: 500, display: false, color: '#C5CEE8' });
  // insignia
  const b = BADGES[seg.badge];
  const r = seg.rate * (seg.factor || 1);
  const rateTxt = r >= 10 || Math.abs(r - Math.round(r)) < 0.1 ? String(Math.round(r)) : r.toFixed(1);
  const label = seg.badge === 'acelerado' ? `×${rateTxt}  ${(seg.factor || 1) > 1 ? 'TIME-LAPSE' : b.label}` : b.label;
  font(ctx, 22, 700, false);
  const bw = ctx.measureText(label).width + 44;
  const bx = 64 + boxW + 18;
  const by = y0 + 44;
  rr(ctx, bx, by, bw, 48, 24);
  ctx.fillStyle = hexA(b.color, 0.18);
  ctx.fill();
  ctx.strokeStyle = hexA(b.color, 0.6);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  text(ctx, label, bx + 22, by + 32, { size: 22, weight: 700, display: false, color: b.color, spacing: 1 });
  if (seg.badge === 'acelerado') {
    // flechas animadas
    for (let i = 0; i < 3; i++) {
      const ph = (local * 3 + i * 0.33) % 1;
      ctx.save();
      ctx.globalAlpha *= 1 - ph;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 3;
      const ax = bx + bw + 20 + i * 16 + ph * 10;
      ctx.beginPath();
      ctx.moveTo(ax, by + 14);
      ctx.lineTo(ax + 10, by + 24);
      ctx.lineTo(ax, by + 34);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();

  // esquina superior derecha: posición y tiempo del original
  ctx.save();
  ctx.globalAlpha = 0.95;
  const tr = `${seg.index}/${seg.ofArea}`;
  const fx = seg.factor || 1;
  const tc = `${fmtDuration(src * fx)} / ${fx > 1 ? '≈ ' : ''}${fmtDuration(clip.realDuration ?? clip.duration)}`;
  font(ctx, 22, 600, false);
  const tw = ctx.measureText(tc).width + 96;
  glass(ctx, W - 64 - tw, 52, tw, 52, 26);
  text(ctx, tr, W - 64 - tw + 22, 86, { size: 22, weight: 700, display: false, color: col });
  text(ctx, tc, W - 64 - 22, 86, { size: 22, weight: 500, display: false, color: '#C5CEE8', align: 'right' });
  if (clip.starred) text(ctx, '★', W - 64 - tw - 30, 88, { size: 30, color: '#F5B94A', align: 'center' });
  ctx.restore();
}

export function drawProgress(ctx: CanvasRenderingContext2D, sc: Scene, time: number) {
  const f = sc.film;
  const y = 18;
  const pad = 64;
  const w = W - pad * 2;
  ctx.save();
  ctx.globalAlpha = 0.9;
  f.chapters.forEach((c) => {
    const x = pad + (c.start / f.duration) * w;
    const cw = Math.max(2, (c.dur / f.duration) * w - 6);
    rr(ctx, x, y, cw, 5, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fill();
    const p = clamp01((time - c.start) / c.dur);
    if (p > 0) {
      rr(ctx, x, y, cw * p, 5, 3);
      ctx.fillStyle = c.color;
      ctx.fill();
    }
  });
  ctx.restore();
  text(ctx, `BÚNKER · S${weekNumber(f.week)}`, W - pad, H - 36, { size: 18, weight: 700, align: 'right', spacing: 5, color: 'rgba(255,255,255,0.35)' });
}

export function drawComparacion(ctx: CanvasRenderingContext2D, sc: Scene, t: number, dur: number) {
  background(ctx, t + 20, '#2DD4BF', '#6D8BFF');
  const env = envelope(t, dur);
  ctx.save();
  ctx.globalAlpha = env;
  text(ctx, 'COMPARACIÓN', 120, 150, { size: 26, weight: 600, spacing: 8, color: '#8EE6D8' });
  text(ctx, 'Esta semana vs. la anterior', 120, 220, { size: 60, weight: 700 });
  const areas = sc.areas.filter((a) => a.active).sort((a, b) => a.order - b.order);
  const max = Math.max(1, ...areas.map((a) => Math.max(sc.stats.areas[a.id]?.sessions ?? 0, sc.prevStats?.areas[a.id]?.sessions ?? 0)));
  const rowH = Math.min(88, 700 / Math.max(1, areas.length));
  areas.forEach((a, i) => {
    const y = 300 + i * rowH;
    const p = easeOut(ramp(t, 0.4 + i * 0.1, 1.4 + i * 0.1));
    const cur = sc.stats.areas[a.id]?.sessions ?? 0;
    const prv = sc.prevStats?.areas[a.id]?.sessions ?? 0;
    iconTile(ctx, a.icon, a.color, 150, y + rowH * 0.4, rowH * 0.62, p);
    text(ctx, a.name, 210, y + rowH * 0.48, { size: 30, weight: 600, alpha: p });
    const bx = 560;
    const bw = 1000;
    rr(ctx, bx, y + rowH * 0.18, Math.max(6, (prv / max) * bw * p), rowH * 0.2, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fill();
    rr(ctx, bx, y + rowH * 0.44, Math.max(6, (cur / max) * bw * p), rowH * 0.28, 8);
    ctx.fillStyle = a.color;
    ctx.save();
    ctx.shadowColor = hexA(a.color, 0.6);
    ctx.shadowBlur = 16;
    ctx.fill();
    ctx.restore();
    const d = cur - prv;
    text(ctx, `${cur}`, bx + bw + 40, y + rowH * 0.62, { size: 34, weight: 700, alpha: p });
    text(ctx, d === 0 ? '=' : d > 0 ? `+${d}` : `${d}`, bx + bw + 110, y + rowH * 0.62, {
      size: 28, weight: 700, alpha: p, color: d > 0 ? '#34D399' : d < 0 ? '#FB7185' : C.muted,
    });
  });
  text(ctx, '▬ semana anterior', 560, 1010, { size: 22, weight: 500, display: false, color: C.muted });
  text(ctx, '▬ esta semana', 820, 1010, { size: 22, weight: 500, display: false, color: '#E2E8F0' });
  ctx.restore();
}

export function drawMetricas(ctx: CanvasRenderingContext2D, sc: Scene, t: number, dur: number) {
  background(ctx, t + 30);
  const env = envelope(t, dur);
  ctx.save();
  ctx.globalAlpha = env;
  const st = sc.stats;
  text(ctx, 'MÉTRICAS OBJETIVAS', 120, 150, { size: 26, weight: 600, spacing: 8, color: '#AFC0FF' });
  text(ctx, 'Lo que realmente ocurrió', 120, 220, { size: 60, weight: 700 });
  const areas = sc.areas.filter((a) => a.active).sort((a, b) => a.order - b.order);
  const gx = 120;
  const gy = 300;
  const cell = Math.min(84, 640 / Math.max(1, areas.length));
  DAY_SHORT.forEach((d, i) => text(ctx, d, gx + 320 + i * (cell + 14) + cell / 2, gy, { size: 24, weight: 600, align: 'center', color: C.muted }));
  areas.forEach((a, r) => {
    const y = gy + 30 + r * (cell + 10);
    text(ctx, a.name, gx, y + cell * 0.62, { size: 28, weight: 600 });
    for (let i = 0; i < 7; i++) {
      const on = st.areas[a.id]?.days[i];
      const p = easeBack(ramp(t, 0.3 + (r * 7 + i) * 0.018, 0.8 + (r * 7 + i) * 0.018));
      const x = gx + 320 + i * (cell + 14);
      ctx.save();
      ctx.globalAlpha *= clamp01(p);
      const s = cell * (0.6 + 0.4 * p);
      rr(ctx, x + (cell - s) / 2, y + (cell - s) / 2, s, s, 14);
      if (on) {
        ctx.fillStyle = a.color;
        ctx.shadowColor = hexA(a.color, 0.6);
        ctx.shadowBlur = 14;
      } else ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fill();
      ctx.restore();
    }
  });
  const kx = 1300;
  const p = ramp(t, 0.5, 2.0);
  const sessions = Object.values(st.areas).reduce((s, x) => s + x.sessions, 0);
  const tiles: [string, string][] = [
    ['DÍAS ACTIVOS', `${counter(st.activeDays, p)}/7`],
    ['SESIONES', String(counter(sessions, p))],
    ['TIEMPO REGISTRADO', fmtDuration(st.seconds * easeOut(p), true)],
    ['RUTINA COMPLETA', `${counter(st.fullDays, p)} días`],
  ];
  tiles.forEach(([k, v], i) => {
    const y = 290 + i * 170;
    const ap = easeOut(ramp(t, 0.3 + i * 0.12, 0.9 + i * 0.12));
    glass(ctx, kx, y, 500, 146, 26, undefined, ap);
    text(ctx, k, kx + 30, y + 50, { size: 19, weight: 600, spacing: 3, color: C.muted, display: false, alpha: ap });
    text(ctx, v, kx + 30, y + 118, { size: 56, weight: 700, alpha: ap });
  });
  ctx.restore();
}

export function drawInsight(ctx: CanvasRenderingContext2D, _sc: Scene, t: number, dur: number, statements: Statement[]) {
  background(ctx, t + 40, '#F5B94A', '#6D8BFF');
  const env = envelope(t, dur);
  ctx.save();
  ctx.globalAlpha = env;
  text(ctx, 'INSIGHT ENGINE', 120, 150, { size: 26, weight: 600, spacing: 8, color: '#F5D08A' });
  text(ctx, 'Hechos primero. Inferencias, con cuidado.', 120, 220, { size: 56, weight: 700 });
  let y = 300;
  statements.forEach((s, i) => {
    const p = easeOut(ramp(t, 0.5 + i * 0.9, 1.1 + i * 0.9));
    if (p <= 0) return;
    const tag = TAG[s.type];
    ctx.save();
    ctx.globalAlpha *= p;
    const dx = (1 - p) * 30;
    font(ctx, 18, 700, false);
    const tw = ctx.measureText(tag.label).width + 32;
    rr(ctx, 120 + dx, y, tw, 38, 19);
    ctx.fillStyle = hexA(tag.color, 0.16);
    ctx.fill();
    ctx.strokeStyle = hexA(tag.color, 0.55);
    ctx.stroke();
    text(ctx, tag.label, 136 + dx, y + 26, { size: 18, weight: 700, display: false, color: tag.color, spacing: 1.5 });
    font(ctx, 36, s.type === 'inferencia' ? 400 : 500, false);
    const lines = wrap(ctx, s.text, 1420);
    lines.slice(0, 2).forEach((l, j) => text(ctx, l, 140 + tw + dx, y + 31 + j * 46, { size: 36, weight: s.type === 'inferencia' ? 400 : 500, display: false, color: s.type === 'sin-datos' ? C.muted : C.text }));
    ctx.restore();
    y += Math.max(1, Math.min(2, lines.length)) * 46 + 34;
  });
  ctx.restore();
}

export function drawPregunta(ctx: CanvasRenderingContext2D, _sc: Scene, t: number, dur: number, q: string) {
  background(ctx, t + 50, '#C084FC', '#6D8BFF');
  const env = envelope(t, dur);
  ctx.save();
  ctx.globalAlpha = env;
  text(ctx, 'PREGUNTA DE REVISIÓN', W / 2, 330, { size: 26, weight: 600, spacing: 8, align: 'center', color: '#D8B4FE' });
  const chars = Math.floor(q.length * ramp(t, 0.4, 0.4 + q.length * 0.035));
  font(ctx, 68, 600);
  const lines = wrap(ctx, q, 1450);
  let left = chars;
  lines.slice(0, 4).forEach((l, i) => {
    const part = l.slice(0, Math.max(0, left));
    left -= l.length + 1;
    text(ctx, part, W / 2, 470 + i * 88, { size: 68, weight: 600, align: 'center' });
  });
  if (chars < q.length && Math.floor(t * 2.5) % 2 === 0) {
    ctx.fillStyle = '#D8B4FE';
    ctx.fillRect(W / 2 - 3, 470 + (lines.length - 1) * 88 + 20, 6, 10);
  }
  text(ctx, 'Respóndela en tu revisión del domingo.', W / 2, 860, { size: 28, weight: 400, display: false, align: 'center', color: C.muted, alpha: easeOut(ramp(t, 2.5, 3.2)) });
  ctx.restore();
}

export function drawFinal(ctx: CanvasRenderingContext2D, sc: Scene, t: number, dur: number, seg: Extract<Seg, { t: 'final' }>) {
  background(ctx, t + 60, '#6D8BFF', '#34D399');
  const env = Math.min(easeOut(t / 0.5), easeOut((dur - t) / 1.4));
  ctx.save();
  ctx.globalAlpha = env;
  text(ctx, 'PRIORIDAD DE LA SIGUIENTE SEMANA', W / 2, 300, { size: 26, weight: 600, spacing: 8, align: 'center', color: '#AFC0FF' });
  const pr = seg.priority?.trim() || 'Defínela al terminar esta revisión.';
  font(ctx, 76, 700);
  const lines = wrap(ctx, pr, 1500);
  const p = easeOut(ramp(t, 0.3, 1.1));
  lines.slice(0, 3).forEach((l, i) => text(ctx, l, W / 2, 430 + i * 96 + (1 - p) * 20, { size: 76, weight: 700, align: 'center', alpha: p, color: seg.priority ? C.text : C.muted }));
  if (seg.experiment) {
    text(ctx, `Experimento: ${seg.experiment}`, W / 2, 430 + lines.length * 96 + 30, { size: 32, weight: 500, display: false, align: 'center', color: '#8EE6D8', alpha: easeOut(ramp(t, 1.0, 1.7)) });
  }
  const c = easeOut(ramp(t, 1.8, 2.6));
  text(ctx, 'REVISAR  →  CAMBIAR  →  SEGUIR', W / 2, 860, { size: 30, weight: 600, align: 'center', spacing: 6, alpha: c, color: '#E2E8F0' });
  logo(ctx, W / 2 + 10, 980, 40, easeOut(ramp(t, 2.6, 3.4)) * 0.8, 'center');
  if (sc.userName) text(ctx, sc.userName, W / 2, 1030, { size: 20, weight: 500, display: false, align: 'center', color: C.muted, alpha: easeOut(ramp(t, 3, 3.6)) });
  ctx.restore();
}

export function drawLoading(ctx: CanvasRenderingContext2D, t: number) {
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(t * 5);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, 34, 0, Math.PI * 1.4);
  ctx.stroke();
  ctx.restore();
}
