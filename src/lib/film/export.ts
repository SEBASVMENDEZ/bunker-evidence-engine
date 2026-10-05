// Exportación de la película a un archivo de video real (se graba en tiempo real desde el canvas).
import fixWebmDuration from 'fix-webm-duration';
import { sound } from '../sound';
import type { FilmEngine, EngineState } from './engine';

export function pickRecorderMime(): { mime: string; ext: 'mp4' | 'webm' } {
  const options: [string, 'mp4' | 'webm'][] = [
    ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'mp4'],
    ['video/mp4;codecs=avc1,mp4a', 'mp4'],
    ['video/webm;codecs=vp9,opus', 'webm'],
    ['video/webm;codecs=vp8,opus', 'webm'],
    ['video/webm', 'webm'],
    ['video/mp4', 'mp4'],
  ];
  for (const [m, e] of options) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return { mime: m, ext: e };
  return { mime: '', ext: 'webm' };
}

export interface ExportJob {
  done: Promise<{ blob: Blob; ext: string }>;
  cancel: () => void;
}

export function exportFilm(engine: FilmEngine, canvas: HTMLCanvasElement, onProgress: (s: EngineState) => void): ExportJob {
  const ac = sound.ensure();
  const dest = ac.createMediaStreamDestination();
  sound.master.connect(dest);
  const vstream = (canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(30);
  const stream = new MediaStream([...vstream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const { mime, ext } = pickRecorderMime();
  const rec = new MediaRecorder(stream, {
    ...(mime ? { mimeType: mime } : {}),
    videoBitsPerSecond: canvas.width >= 1900 ? 6_000_000 : 3_000_000,
    audioBitsPerSecond: 160_000,
  });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  let cancelled = false;
  let timer = 0;
  const started = performance.now();

  const done = new Promise<{ blob: Blob; ext: string }>((resolve, reject) => {
    rec.onstop = async () => {
      window.clearInterval(timer);
      try {
        sound.master.disconnect(dest);
      } catch {
        /* nada */
      }
      stream.getTracks().forEach((t) => t.stop());
      if (cancelled) return reject(new Error('cancelado'));
      let blob = new Blob(chunks, { type: mime || 'video/webm' });
      if (ext === 'webm') {
        try {
          blob = await fixWebmDuration(blob, performance.now() - started, { logger: false });
        } catch {
          /* se conserva sin duración */
        }
      }
      resolve({ blob, ext });
    };
    rec.onerror = () => reject(new Error('Error del grabador'));
  });

  engine.seek(0);
  rec.start(1000);
  engine.play();
  timer = window.setInterval(() => {
    const s: EngineState = {
      time: engine.time,
      duration: engine.film.duration,
      playing: engine.isPlaying,
      seg: 0,
      chapter: 0,
      loading: false,
      ended: engine.isEnded,
    };
    onProgress(s);
    if (engine.isEnded && rec.state === 'recording') {
      window.setTimeout(() => rec.state === 'recording' && rec.stop(), 600);
    }
  }, 250);

  return {
    done,
    cancel: () => {
      cancelled = true;
      engine.pause();
      if (rec.state === 'recording') rec.stop();
    },
  };
}

export async function saveBlob(blob: Blob, filename: string) {
  const w = window as Window & {
    showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle>;
  };
  if (w.showSaveFilePicker) {
    try {
      const ext = filename.split('.').pop()!;
      const h = await w.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'Video', accept: { [blob.type.split(';')[0] || 'video/webm']: [`.${ext}`] } }],
      });
      const ws = await (h as FileSystemFileHandle & { createWritable(): Promise<FileSystemWritableFileStream> }).createWritable();
      await ws.write(blob);
      await ws.close();
      return true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  return true;
}
