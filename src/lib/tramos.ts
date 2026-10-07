// Tramos: un video largo con varias actividades seguidas (el bloque de la mañana: oración →
// meditación → estiramiento…) se divide solo, sin que tengas que grabar un video por actividad.
//
// Con la cámara fija, cada actividad tiene su postura y su lugar en el cuadro. Se toman ~160
// cuadros, se compara cada uno con el fondo (la mediana de todos) y se buscan los cortes que mejor
// separan el video (mínimos cuadrados con penalización por corte). Un corte solo se conserva si te
// cambias de sitio o pasas de estar quieto a moverte: cambiar de postura en la misma silla (frente
// al computador) no es otra actividad. Calibrado con 12 videos reales: 12/12 bien divididos.
import { frameBlob, makeThumb, visualSig, waitFor } from './media';

/** Versión del análisis (si cambia, los videos largos se vuelven a analizar). */
export const TRAMOS_V = 1;
/** Solo se analizan videos de al menos 6 minutos reales. */
export const TRAMO_MIN_REAL = 360;

export interface Tramo {
  from: number; // segundos del archivo
  to: number;
  lay: number[]; // dónde está el cuerpo (9×16), comparable entre días
  mot: number; // cuánto movimiento hay
  thumb?: string;
  sig?: number[];
  posters?: Blob[];
}

const PARAMS = {
  maxSamples: 160,
  lambda: 2, // penalización por corte (× ruido · log n)
  minReal: 120, // un tramo dura al menos 2 min reales
  simMax: 0.75, // cambio de sitio: la forma del primer plano se parece menos que esto…
  distMin: 0.15, // …y el centro del cuerpo se movió al menos esto (fracción del cuadro)
  busy: 0.1, // los dos tramos con mucho movimiento (frente al computador) → misma actividad
  still: 0.06, // quieto → activo (meditación → estiramiento)
  toActive: 2.2,
};

interface Desc {
  f: Float32Array; // |cuadro − fondo| en una cuadrícula de 9×16
  mot: number; // cambio respecto al cuadro anterior
}

const cosine = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let d = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i] * b[i];
    x += a[i] * a[i];
    y += b[i] * b[i];
  }
  return x && y ? d / Math.sqrt(x * y) : 0;
};

/** Similitud entre dos tramos (forma + movimiento), para reconocer la actividad entre días. */
export function laySimilarity(a: { lay?: number[]; mot?: number }, b: { lay?: number[]; mot?: number }): number | null {
  if (!a.lay || !b.lay || a.lay.length !== b.lay.length) return null;
  return cosine(a.lay, b.lay) - 0.2 * Math.abs(Math.log(((a.mot ?? 0) + 0.01) / ((b.mot ?? 0) + 0.01)));
}

function describe(Z: Float32Array[], W: number, H: number): Desc[] {
  const n = Z.length;
  const P = W * H;
  // fondo = mediana por píxel (la persona se mueve entre sitios; la habitación queda)
  const B = new Float32Array(P);
  const col = new Float32Array(n);
  for (let p = 0; p < P; p++) {
    for (let i = 0; i < n; i++) col[i] = Z[i][p];
    col.sort();
    B[p] = col[n >> 1];
  }
  const w2 = W >> 1;
  const h2 = H >> 1;
  return Z.map((z, i) => {
    const f = new Float32Array(w2 * h2);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) f[(y >> 1) * w2 + (x >> 1)] += Math.abs(z[y * W + x] - B[y * W + x]) / 4;
    let mot = 0;
    const prev = Z[Math.max(0, i - 1)];
    const next = Z[Math.min(n - 1, i + 1)];
    const ref = i > 0 ? prev : next;
    for (let p = 0; p < P; p++) mot += Math.abs(z[p] - ref[p]);
    return { f, mot: mot / P };
  });
}

/** Cortes óptimos (índices de muestra) por mínimos cuadrados con penalización. */
function segment(D: Desc[], minLen: number): number[] {
  const n = D.length;
  const d = D[0].f.length + 1;
  const X = D.map((r) => {
    const v = new Float64Array(d);
    v.set(r.f);
    v[d - 1] = r.mot * 3;
    return v;
  });
  const S1 = [new Float64Array(d)];
  const S2 = [new Float64Array(d)];
  for (let i = 0; i < n; i++) {
    const a = new Float64Array(d);
    const b = new Float64Array(d);
    for (let k = 0; k < d; k++) {
      a[k] = S1[i][k] + X[i][k];
      b[k] = S2[i][k] + X[i][k] * X[i][k];
    }
    S1.push(a);
    S2.push(b);
  }
  const sse = (a: number, b: number) => {
    const L = b - a;
    let s = 0;
    for (let k = 0; k < d; k++) {
      const m = S1[b][k] - S1[a][k];
      s += S2[b][k] - S2[a][k] - (m * m) / L;
    }
    return s;
  };
  let noise = 0;
  for (let i = 1; i < n; i++) for (let k = 0; k < d; k++) noise += (X[i][k] - X[i - 1][k]) ** 2 / 2;
  noise /= Math.max(1, n - 1);
  const pen = PARAMS.lambda * noise * Math.log(n) * 4;
  const best = new Float64Array(n + 1).fill(Infinity);
  const prev = new Int32Array(n + 1).fill(-1);
  best[0] = 0;
  for (let b = minLen; b <= n; b++) {
    for (let a = 0; a <= b - minLen; a++) {
      if (best[a] === Infinity || (a > 0 && a < minLen)) continue;
      const c = best[a] + sse(a, b) + pen;
      if (c < best[b]) {
        best[b] = c;
        prev[b] = a;
      }
    }
  }
  if (best[n] === Infinity) return [0, n];
  const cuts: number[] = [];
  for (let b = n; b > 0; b = prev[b]) cuts.unshift(b);
  return [0, ...cuts];
}

function stats(D: Desc[], a: number, b: number, w2: number, h2: number) {
  const m = new Float64Array(w2 * h2);
  let mot = 0;
  for (let i = a; i < b; i++) {
    for (let k = 0; k < m.length; k++) m[k] += D[i].f[k] / (b - a);
    mot += D[i].mot / (b - a);
  }
  // centro del cuerpo: celdas con más diferencia respecto al fondo
  const thr = [...m].sort((x, y) => x - y)[Math.floor(m.length * 0.75)];
  let cx = 0;
  let cy = 0;
  let w = 0;
  m.forEach((v, k) => {
    const e = Math.max(0, v - thr);
    cx += (k % w2) * e;
    cy += Math.floor(k / w2) * e;
    w += e;
  });
  return { m, mot, cx: w ? cx / w / w2 : 0.5, cy: w ? cy / w / h2 : 0.5 };
}

/** Quita los cortes que no son cambio de actividad (misma silla, solo otra postura). */
function keepActivityChanges(D: Desc[], cuts: number[], w2: number, h2: number): number[] {
  const c = [...cuts];
  for (let changed = true; changed; ) {
    changed = false;
    for (let j = 1; j < c.length - 1; j++) {
      const A = stats(D, c[j - 1], c[j], w2, h2);
      const B = stats(D, c[j], c[j + 1], w2, h2);
      const moved = cosine(A.m, B.m) <= PARAMS.simMax && Math.hypot(A.cx - B.cx, A.cy - B.cy) >= PARAMS.distMin;
      const busy = Math.min(A.mot, B.mot) > PARAMS.busy;
      const startsMoving = A.mot < PARAMS.still && B.mot / Math.max(1e-6, A.mot) >= PARAMS.toActive;
      if (!((moved && !busy) || startsMoving)) {
        c.splice(j, 1);
        changed = true;
        break;
      }
    }
  }
  return c;
}

/**
 * Analiza un video largo y devuelve sus tramos (uno solo si no hay cambio de actividad).
 * `speed` = factor de time-lapse conocido (1 si es a velocidad normal).
 */
export async function analyzeTramos(blob: Blob, opts: { duration: number; speed: number; posters: boolean; onProgress?: (p: number) => void }): Promise<Tramo[]> {
  const url = URL.createObjectURL(blob);
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = url;
  try {
    await waitFor(v, 'loadedmetadata', 20000);
    const duration = isFinite(v.duration) && v.duration > 0 ? v.duration : opts.duration;
    const portrait = v.videoHeight > v.videoWidth;
    const W = portrait ? 18 : 32;
    const H = portrait ? 32 : 18;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx || !duration) return [];
    const dt = Math.max(2, duration / PARAMS.maxSamples);
    const times: number[] = [];
    for (let t = dt / 2; t < duration - 0.2; t += dt) times.push(t);
    const Z: Float32Array[] = [];
    for (let i = 0; i < times.length; i++) {
      v.currentTime = times[i];
      await waitFor(v, 'seeked', 15000);
      ctx.drawImage(v, 0, 0, W, H);
      const px = ctx.getImageData(0, 0, W, H).data;
      const z = new Float32Array(W * H);
      let mean = 0;
      for (let p = 0; p < W * H; p++) {
        z[p] = 0.299 * px[p * 4] + 0.587 * px[p * 4 + 1] + 0.114 * px[p * 4 + 2];
        mean += z[p];
      }
      mean /= W * H;
      let sd = 0;
      for (let p = 0; p < W * H; p++) sd += (z[p] - mean) ** 2;
      sd = Math.sqrt(sd / (W * H)) || 1;
      // normalizado: los cambios de exposición de la cámara no cuentan como cambio de actividad
      for (let p = 0; p < W * H; p++) z[p] = (z[p] - mean) / sd;
      Z.push(z);
      opts.onProgress?.((i + 1) / times.length);
    }
    if (Z.length < 6) return [];
    const D = describe(Z, W, H);
    const w2 = W >> 1;
    const h2 = H >> 1;
    const minLen = Math.max(3, Math.ceil(PARAMS.minReal / (dt * Math.max(1, opts.speed))));
    const cuts = keepActivityChanges(D, segment(D, minLen), w2, h2);
    const out: Tramo[] = [];
    for (let s = 0; s + 1 < cuts.length; s++) {
      const a = cuts[s];
      const b = cuts[s + 1];
      const from = s === 0 ? 0 : (times[a - 1] + times[a]) / 2;
      const to = s + 2 === cuts.length ? duration : (times[b - 1] + times[b]) / 2;
      const st = stats(D, a, b, w2, h2);
      const tr: Tramo = { from, to, lay: [...st.m].map((x) => Math.round(x * 100) / 100), mot: Math.round(st.mot * 1000) / 1000 };
      // miniatura y firma del lugar a mitad del tramo
      v.currentTime = (from + to) / 2;
      await waitFor(v, 'seeked', 15000).catch(() => {});
      tr.thumb = makeThumb(v);
      tr.sig = visualSig(v);
      if (opts.posters) {
        tr.posters = [];
        for (const p of [0.2, 0.5, 0.8]) {
          v.currentTime = from + (to - from) * p;
          if (!(await waitFor(v, 'seeked', 15000).then(() => true, () => false))) break;
          const fb = await frameBlob(v);
          if (fb) tr.posters.push(fb);
        }
      }
      out.push(tr);
    }
    return out;
  } finally {
    v.removeAttribute('src');
    v.load();
    URL.revokeObjectURL(url);
  }
}
