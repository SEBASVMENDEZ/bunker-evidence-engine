// Huella de evidencia: lo esencial de un video en ~1 MB, para que la película no dependa del original.
//
// Un video de 1–4 GB se resume en 16–72 cuadros repartidos a lo largo de todo el video (480 px) y,
// si hablas (reflexiones), la voz en un WAV liviano. Con eso la película dibuja time-lapse continuos
// y fluidos —sin decodificar 1080p a ×16 en vivo, que es lo que trababa y repetía escenas— y puedes
// borrar el original de la galería cuando quieras: tu semana queda guardada en Búnker.
import { frameBlob, waitFor } from './media';

/** Versión de la huella (si cambia, se vuelven a generar). */
export const HUELLA_V = 1;

export interface Huella {
  frames: Blob[];
  t: number[]; // segundo del archivo de cada cuadro
  audio?: Blob;
}

/** Cuántos cuadros guardar según los minutos reales: ~3 por minuto, entre 16 y 72. */
export const framesFor = (realSec: number) => Math.round(Math.min(72, Math.max(16, (realSec / 60) * 3)));

/** ¿Vale la pena guardar la voz? Reflexiones a la cámara y clips cortos con audio. */
export const wantsVoice = (o: { hasAudio?: boolean; rotation?: number | null; duration: number; lapse?: boolean }) =>
  !!o.hasAudio && !o.lapse && o.duration <= 240 && (o.rotation === 270 || o.duration <= 75);

export async function makeHuella(blob: Blob, opts: { duration: number; n: number; voice: boolean; onProgress?: (p: number) => void }): Promise<Huella> {
  const url = URL.createObjectURL(blob);
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = url;
  try {
    await waitFor(v, 'loadedmetadata', 20000);
    const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : opts.duration;
    const n = Math.max(2, Math.min(opts.n, Math.floor(dur / 0.4)));
    const frames: Blob[] = [];
    const t: number[] = [];
    for (let i = 0; i < n; i++) {
      const at = (dur * (i + 0.5)) / n;
      v.currentTime = at;
      if (!(await waitFor(v, 'seeked', 15000).then(() => true, () => false))) continue;
      const b = await frameBlob(v, 480);
      if (b) {
        frames.push(b);
        t.push(Math.round(at * 100) / 100);
      }
      opts.onProgress?.((i + 1) / n);
    }
    const audio = opts.voice ? await voiceWav(blob).catch(() => undefined) : undefined;
    return { frames, t, audio };
  } finally {
    v.removeAttribute('src');
    v.load();
    URL.revokeObjectURL(url);
  }
}

const VOICE_RATE = 11025;

/** La voz del video en WAV liviano (11 kHz mono, limpia y normalizada): ~1,3 MB por minuto. */
export async function voiceWav(blob: Blob, maxSec = 240): Promise<Blob | undefined> {
  if (blob.size > 450 * 1024 * 1024) return undefined;
  const decoded = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await blob.arrayBuffer());
  const sec = Math.min(maxSec, decoded.duration);
  if (sec < 1) return undefined;
  const off = new OfflineAudioContext(1, Math.ceil(sec * VOICE_RATE), VOICE_RATE);
  const src = off.createBufferSource();
  src.buffer = decoded;
  // sin retumbe ni viento: un filtro de voz suave
  const hp = off.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 90;
  src.connect(hp).connect(off.destination);
  src.start(0, 0, sec);
  const pcm = (await off.startRendering()).getChannelData(0);
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
  if (peak < 0.003) return undefined; // silencio: no hay voz que guardar
  return wav16(pcm, VOICE_RATE, Math.min(8, 0.89 / peak));
}

function wav16(pcm: Float32Array, rate: number, gain: number): Blob {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const d = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((ch, i) => d.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF');
  d.setUint32(4, 36 + pcm.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  d.setUint32(16, 16, true);
  d.setUint16(20, 1, true);
  d.setUint16(22, 1, true);
  d.setUint32(24, rate, true);
  d.setUint32(28, rate * 2, true);
  d.setUint16(32, 2, true);
  d.setUint16(34, 16, true);
  str(36, 'data');
  d.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) d.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i] * gain)) * 0x7fff, true);
  return new Blob([buf], { type: 'audio/wav' });
}
