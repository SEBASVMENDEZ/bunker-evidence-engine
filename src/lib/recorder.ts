// Búnker Camera: grabación segura. Cada segundo se escribe un fragmento en el dispositivo,
// así una grabación interrumpida (batería, cierre, error) se recupera al volver a abrir.
import fixWebmDuration from 'fix-webm-duration';
import { recBegin, recChunk, recUpdate, type RecordingMeta } from './db';
import type { Settings } from './types';
import { uid } from './time';

export type Quality = Settings['camera']['quality'];

const QUALITY: Record<Quality, { w: number; h: number; bps: number; fps: number }> = {
  eco: { w: 640, h: 360, bps: 1_000_000, fps: 24 },
  hd: { w: 1280, h: 720, bps: 3_500_000, fps: 30 },
  fullhd: { w: 1920, h: 1080, bps: 7_000_000, fps: 30 },
};

export function isMobile() {
  return matchMedia('(pointer: coarse)').matches;
}

export function recorderMime(): string {
  const mobile = isMobile();
  const list = mobile
    ? ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4']
    : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return list.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

export async function openCamera(facing: 'user' | 'environment', quality: Quality, mic: boolean): Promise<MediaStream> {
  const q = QUALITY[quality];
  const video: MediaTrackConstraints = {
    facingMode: facing,
    width: { ideal: q.w },
    height: { ideal: q.h },
    frameRate: { ideal: q.fps },
  };
  try {
    return await navigator.mediaDevices.getUserMedia({ video, audio: mic ? { echoCancellation: true, noiseSuppression: true } : false });
  } catch (e) {
    // si el micrófono falla, al menos la imagen
    if (mic) return navigator.mediaDevices.getUserMedia({ video, audio: false });
    throw e;
  }
}

export async function openScreen(withMic: boolean): Promise<{ stream: MediaStream; cleanup: () => void }> {
  const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 } }, audio: true });
  if (!withMic) return { stream: display, cleanup: () => display.getTracks().forEach((t) => t.stop()) };
  let micStream: MediaStream | null = null;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    return { stream: display, cleanup: () => display.getTracks().forEach((t) => t.stop()) };
  }
  const ac = new AudioContext();
  const dest = ac.createMediaStreamDestination();
  if (display.getAudioTracks().length) ac.createMediaStreamSource(new MediaStream(display.getAudioTracks())).connect(dest);
  ac.createMediaStreamSource(micStream).connect(dest);
  const stream = new MediaStream([...display.getVideoTracks(), ...dest.stream.getAudioTracks()]);
  return {
    stream,
    cleanup: () => {
      display.getTracks().forEach((t) => t.stop());
      micStream?.getTracks().forEach((t) => t.stop());
      ac.close().catch(() => {});
    },
  };
}

export class SafeRecorder {
  readonly id = uid('rec_');
  readonly meta: RecordingMeta;
  private rec: MediaRecorder;
  private chunks: Blob[] = [];
  private seq = 0;
  private writes: Promise<unknown> = Promise.resolve();
  private t0 = 0;
  private pausedTotal = 0;
  private pausedAt = 0;
  private wake: WakeLockSentinel | null = null;

  constructor(stream: MediaStream, meta: Omit<RecordingMeta, 'id' | 'startedAt' | 'mime' | 'markers' | 'width' | 'height'>, quality: Quality) {
    const mime = recorderMime();
    const q = QUALITY[quality];
    const bps = meta.kind === 'proceso' ? Math.min(q.bps, 1_200_000) : q.bps;
    this.rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: bps, audioBitsPerSecond: 96_000 });
    const s = stream.getVideoTracks()[0]?.getSettings() ?? {};
    this.meta = {
      ...meta,
      id: this.id,
      startedAt: Date.now(),
      mime: this.rec.mimeType || mime || 'video/webm',
      markers: [],
      width: s.width ?? 0,
      height: s.height ?? 0,
    };
    this.rec.ondataavailable = (e) => {
      if (!e.data.size) return;
      this.chunks.push(e.data);
      const n = this.seq++;
      this.writes = this.writes.then(() => recChunk(this.id, n, e.data)).catch(() => {});
    };
  }

  async start() {
    await recBegin(this.meta);
    this.t0 = performance.now();
    this.rec.start(1000);
    try {
      this.wake = (await navigator.wakeLock?.request('screen')) ?? null;
    } catch {
      /* sin wake lock */
    }
  }

  get elapsed(): number {
    const paused = this.pausedAt ? performance.now() - this.pausedAt : 0;
    return Math.max(0, (performance.now() - this.t0 - this.pausedTotal - paused) / 1000);
  }

  get state() {
    return this.rec.state;
  }

  pause() {
    if (this.rec.state !== 'recording') return;
    this.rec.pause();
    this.pausedAt = performance.now();
  }

  resume() {
    if (this.rec.state !== 'paused') return;
    this.rec.resume();
    this.pausedTotal += performance.now() - this.pausedAt;
    this.pausedAt = 0;
  }

  mark(): number {
    const t = Math.round(this.elapsed * 10) / 10;
    this.meta.markers.push(t);
    recUpdate(this.meta).catch(() => {});
    return t;
  }

  async stop(): Promise<{ blob: Blob; duration: number }> {
    const duration = this.elapsed;
    if (this.rec.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        this.rec.addEventListener('stop', () => resolve(), { once: true });
        this.rec.stop();
      });
    }
    await this.writes;
    this.wake?.release().catch(() => {});
    let blob = new Blob(this.chunks, { type: this.meta.mime.split(';')[0] });
    if (blob.type.includes('webm')) {
      try {
        blob = await fixWebmDuration(blob, duration * 1000, { logger: false });
      } catch {
        /* sin corrección de duración */
      }
    }
    return { blob, duration };
  }

  abort() {
    try {
      this.rec.stop();
    } catch {
      /* nada */
    }
    this.wake?.release().catch(() => {});
  }
}
