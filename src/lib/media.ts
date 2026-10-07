// Lectura de videos: fecha real de grabación, duración, dimensiones y miniatura.

export const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|3gp|avi)$/i;

export interface Probe {
  duration: number;
  width: number;
  height: number;
  thumb?: string;
  sig?: number[];
  posters?: Blob[]; // cuadros de vista previa (solo si se pidieron)
}

/** Cuadro actual del video como JPEG (lado mayor ≤ max). */
export function frameBlob(v: HTMLVideoElement, max = 640): Promise<Blob | null> {
  const s = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(v.videoWidth * s);
  c.height = Math.round(v.videoHeight * s);
  const ctx = c.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(v, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b), 'image/jpeg', 0.72));
}

export function waitFor(el: HTMLMediaElement, ev: string, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => {
      cleanup();
      reject(new Error(`timeout ${ev}`));
    }, ms);
    const ok = () => {
      cleanup();
      resolve();
    };
    const bad = () => {
      cleanup();
      reject(new Error(el.error?.message || 'No se pudo leer el video'));
    };
    const cleanup = () => {
      window.clearTimeout(t);
      el.removeEventListener(ev, ok);
      el.removeEventListener('error', bad);
    };
    el.addEventListener(ev, ok, { once: true });
    el.addEventListener('error', bad, { once: true });
  });
}

export function makeThumb(v: HTMLVideoElement | HTMLCanvasElement, max = 360): string | undefined {
  const w = v instanceof HTMLVideoElement ? v.videoWidth : v.width;
  const h = v instanceof HTMLVideoElement ? v.videoHeight : v.height;
  if (!w || !h) return undefined;
  const s = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * s);
  c.height = Math.round(h * s);
  const ctx = c.getContext('2d');
  if (!ctx) return undefined;
  ctx.drawImage(v, 0, 0, c.width, c.height);
  try {
    return c.toDataURL('image/jpeg', 0.72);
  } catch {
    return undefined;
  }
}

/** Duración, tamaño y miniatura de un video. */
export async function probeVideo(blob: Blob, hintDuration?: number, withPosters = false): Promise<Probe> {
  const url = URL.createObjectURL(blob);
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = url;
  try {
    await waitFor(v, 'loadedmetadata', 20000);
    let duration = v.duration;
    if (!isFinite(duration) || duration <= 0) {
      if (hintDuration && hintDuration > 0) duration = hintDuration;
      else {
        // WebM sin duración en la cabecera: forzar al navegador a calcularla
        v.currentTime = 1e7;
        await waitFor(v, 'seeked', 15000).catch(() => {});
        duration = isFinite(v.duration) ? v.duration : 0;
      }
    }
    const width = v.videoWidth;
    const height = v.videoHeight;
    let thumb: string | undefined;
    let sig: number[] | undefined;
    if (width && height) {
      const at = duration > 1 ? Math.min(Math.max(0.6, duration * 0.18), duration - 0.3) : 0;
      v.currentTime = at;
      await waitFor(v, 'seeked', 15000).catch(() => {});
      thumb = makeThumb(v);
      sig = visualSig(v);
    }
    let posters: Blob[] | undefined;
    if (withPosters && width && height && duration > 0) {
      // tres momentos del clip: así la película lo muestra aunque el video no esté a mano
      posters = [];
      for (const p of [0.2, 0.5, 0.8]) {
        v.currentTime = Math.min(duration - 0.2, Math.max(0, duration * p));
        if (!(await waitFor(v, 'seeked', 15000).then(() => true, () => false))) break;
        const b = await frameBlob(v);
        if (b) posters.push(b);
      }
    }
    return { duration, width, height, thumb, sig, posters };
  } finally {
    v.removeAttribute('src');
    v.load();
    URL.revokeObjectURL(url);
  }
}

const MIN_TS = new Date(2015, 0, 1).getTime();

function valid(ts: number) {
  return isFinite(ts) && ts > MIN_TS && ts < Date.now() + 864e5;
}

/** Fechas en nombres típicos: VID_20261001_051230, 20261001_051230, PXL_…, WIN_20261001_05_12_30, VID-20261001-WA0001 */
export function dateFromName(name: string): number | null {
  const full = name.match(
    /(20\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])[-_ T.]{0,3}([01]\d|2[0-3])[-_.:h]?([0-5]\d)[-_.:m]?([0-5]\d)/,
  );
  if (full) {
    const [, y, mo, d, h, mi, s] = full.map(Number) as unknown as number[];
    const utc = /^PXL_/i.test(name);
    const ts = utc ? Date.UTC(y, mo - 1, d, h, mi, s) : new Date(y, mo - 1, d, h, mi, s).getTime();
    if (valid(ts)) return ts;
  }
  const dateOnly = name.match(/(20\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])/);
  if (dateOnly) {
    const [, y, mo, d] = dateOnly.map(Number) as unknown as number[];
    const ts = new Date(y, mo - 1, d, 12, 0, 0).getTime();
    if (valid(ts)) return ts;
  }
  return null;
}

function fourcc(dv: DataView, p: number) {
  return String.fromCharCode(dv.getUint8(p), dv.getUint8(p + 1), dv.getUint8(p + 2), dv.getUint8(p + 3));
}

/** creation_time del átomo mvhd (MP4/MOV). */
export async function mp4CreationTime(blob: Blob): Promise<number | null> {
  try {
    let off = 0;
    for (let i = 0; i < 80 && off + 8 <= blob.size; i++) {
      const h = new DataView(await blob.slice(off, off + 16).arrayBuffer());
      let size = h.getUint32(0);
      const type = fourcc(h, 4);
      let header = 8;
      if (size === 1 && h.byteLength >= 16) {
        size = Number(h.getBigUint64(8));
        header = 16;
      } else if (size === 0) size = blob.size - off;
      if (size < 8) return null;
      if (type === 'moov') {
        const dv = new DataView(await blob.slice(off + header, off + header + Math.min(size - header, 8192)).arrayBuffer());
        let p = 0;
        while (p + 20 <= dv.byteLength) {
          const s = dv.getUint32(p);
          if (fourcc(dv, p + 4) === 'mvhd') {
            const ver = dv.getUint8(p + 8);
            const secs = ver === 1 ? Number(dv.getBigUint64(p + 12)) : dv.getUint32(p + 12);
            if (!secs) return null;
            const ts = (secs - 2082844800) * 1000;
            return valid(ts) ? ts : null;
          }
          if (s < 8) break;
          p += s;
        }
        return null;
      }
      off += size;
    }
  } catch {
    /* formato no reconocido */
  }
  return null;
}

export async function extractDate(file: Blob, name: string, lastModified: number): Promise<{ ts: number; by: 'nombre' | 'metadatos' | 'archivo' }> {
  const n = dateFromName(name);
  if (n) {
    // nombre con fecha sin hora (WhatsApp): usar la hora del archivo si es el mismo día
    const lm = new Date(lastModified);
    const nd = new Date(n);
    if (nd.getHours() === 12 && nd.getMinutes() === 0 && lm.toDateString() === nd.toDateString()) {
      return { ts: lastModified, by: 'nombre' };
    }
    return { ts: n, by: 'nombre' };
  }
  if (/\.(mp4|mov|m4v|3gp)$/i.test(name)) {
    const m = await mp4CreationTime(file);
    if (m) return { ts: m, by: 'metadatos' };
  }
  return { ts: lastModified || Date.now(), by: 'archivo' };
}

export function fingerprint(name: string, size: number, lastModified: number) {
  return `${name}|${size}|${lastModified}`;
}

// ---------------- time-lapse ----------------
export interface Mp4Info {
  hasAudio: boolean | null;
  videoFps: number | null;
  captureFps: number | null; // Android: com.android.capture.fps (solo en time-lapse)
  rotation: number | null; // 90 = cámara trasera en vertical, 270 = frontal (Android)
}

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'udta', 'edts']);

/** Lee la estructura MP4/MOV: pistas de audio, fps del video y fps de captura (time-lapse). */
export async function mp4Info(blob: Blob): Promise<Mp4Info | null> {
  try {
    let off = 0;
    let moov: DataView | null = null;
    for (let i = 0; i < 80 && off + 8 <= blob.size; i++) {
      const h = new DataView(await blob.slice(off, off + 16).arrayBuffer());
      let size = h.getUint32(0);
      const type = fourcc(h, 4);
      let header = 8;
      if (size === 1 && h.byteLength >= 16) {
        size = Number(h.getBigUint64(8));
        header = 16;
      } else if (size === 0) size = blob.size - off;
      if (size < 8) return null;
      if (type === 'moov') {
        moov = new DataView(await blob.slice(off + header, off + Math.min(size, 24_000_000)).arrayBuffer());
        break;
      }
      off += size;
    }
    if (!moov) return null;
    const dv = moov;
    const info: Mp4Info = { hasAudio: false, videoFps: null, captureFps: null, rotation: null };
    let keys: string[] = [];

    const walk = (start: number, end: number, track: { handler?: string; timescale?: number; duration?: number; samples?: number; rot?: number } | null) => {
      let p = start;
      while (p + 8 <= end) {
        let size = dv.getUint32(p);
        const type = fourcc(dv, p + 4);
        let hdr = 8;
        if (size === 1) {
          size = Number(dv.getBigUint64(p + 8));
          hdr = 16;
        } else if (size === 0) size = end - p;
        if (size < 8 || p + size > end + 8) break;
        const body = p + hdr;
        const boxEnd = Math.min(end, p + size);
        if (type === 'trak') {
          const t: { handler?: string; timescale?: number; duration?: number; samples?: number; rot?: number } = {};
          walk(body, boxEnd, t);
          if (t.handler === 'soun') info.hasAudio = true;
          if (t.handler === 'vide' && t.timescale && t.duration && t.samples) info.videoFps = t.samples / (t.duration / t.timescale);
          if (t.handler === 'vide' && t.rot !== undefined && info.rotation === null) info.rotation = t.rot;
        } else if (CONTAINERS.has(type)) walk(body, boxEnd, track);
        else if (type === 'hdlr' && track) track.handler = fourcc(dv, body + 8);
        else if (type === 'tkhd' && track) {
          const m = body + (dv.getUint8(body) === 1 ? 52 : 40);
          const a = dv.getInt32(m) / 65536;
          const b = dv.getInt32(m + 4) / 65536;
          track.rot = (Math.round((Math.atan2(b, a) * 180) / Math.PI) + 360) % 360;
        }
        else if (type === 'mdhd' && track) {
          const v = dv.getUint8(body);
          track.timescale = dv.getUint32(body + (v === 1 ? 20 : 12));
          track.duration = v === 1 ? Number(dv.getBigUint64(body + 24)) : dv.getUint32(body + 16);
        } else if (type === 'stsz' && track) track.samples = dv.getUint32(body + 8);
        else if (type === 'meta') {
          // QuickTime (sin version/flags) o ISO (con 4 bytes de version/flags)
          const inner = fourcc(dv, body + 4) === 'hdlr' ? body : body + 4;
          walk(inner, boxEnd, null);
        } else if (type === 'keys') {
          const count = dv.getUint32(body + 4);
          let q = body + 8;
          keys = [];
          for (let k = 0; k < count && q + 8 <= boxEnd; k++) {
            const ks = dv.getUint32(q);
            let name = '';
            for (let c = q + 8; c < q + ks; c++) name += String.fromCharCode(dv.getUint8(c));
            keys.push(name);
            q += ks;
          }
        } else if (type === 'ilst') {
          let q = body;
          while (q + 8 <= boxEnd) {
            const is = dv.getUint32(q);
            const idx = dv.getUint32(q + 4); // índice (base 1) en "keys"
            if (is < 8) break;
            if (keys[idx - 1] === 'com.android.capture.fps' && fourcc(dv, q + 12) === 'data') {
              const dtype = dv.getUint32(q + 16) & 0xffffff;
              const val = dtype === 23 ? dv.getFloat32(q + 24) : dtype === 24 ? dv.getFloat64(q + 24) : NaN;
              if (isFinite(val) && val > 0) info.captureFps = val;
            }
            q += is;
          }
        }
        p += size;
      }
    };
    walk(0, dv.byteLength, null);
    return info;
  } catch {
    return null;
  }
}

/** ¿Es un time-lapse? Devuelve el factor si se conoce (metadatos) o 0 si solo hay sospecha (sin audio). */
export function lapseFromInfo(info: Mp4Info | null, name: string): { lapse: boolean; speed?: number } {
  const byName = /time.?lapse|hyper.?lapse|[_.-]tl[_.]/i.test(name);
  if (info?.captureFps && info.captureFps > 0) {
    const fps = info.videoFps && info.videoFps > 5 ? info.videoFps : 30;
    const f = Math.round(fps / info.captureFps);
    if (f >= 2) return { lapse: true, speed: f };
  }
  if (byName) return { lapse: true };
  // WhatsApp recomprime y a veces quita el audio: sin audio no implica time-lapse
  if (/-WA\d+/i.test(name)) return { lapse: false };
  if (info && info.hasAudio === false) return { lapse: true };
  return { lapse: false };
}

// ---------------- firma visual del lugar ----------------
/** Huella de 6×6 colores, normalizada por canal: reconoce el mismo lugar con distinta luz. */
export function visualSig(src: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement): number[] | undefined {
  const N = 6;
  const c = document.createElement('canvas');
  c.width = N;
  c.height = N;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return undefined;
  try {
    ctx.drawImage(src, 0, 0, N, N);
    const d = ctx.getImageData(0, 0, N, N).data;
    const out: number[] = [];
    for (let ch = 0; ch < 3; ch++) {
      const vals: number[] = [];
      for (let i = 0; i < N * N; i++) vals.push(d[i * 4 + ch]);
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length) || 1;
      for (const v of vals) out.push(Math.round(((v - mean) / sd) * 100) / 100);
    }
    return out;
  } catch {
    return undefined;
  }
}

export function sigSimilarity(a?: number[], b?: number[]): number | null {
  if (!a || !b || a.length !== b.length) return null;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : null;
}
