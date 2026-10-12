// Reproductor de huella: el clip en time-lapse fluido (y tu voz, si es una reflexión) sin el video original.
import { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import { getHuellaFrames, getHuellaVoice } from '../lib/db';
import type { Clip } from '../lib/types';

export function HuellaPlayer({ clip }: { clip: Clip }) {
  const h = clip.huella!;
  const key = h.ref ?? clip.id;
  const [frames, setFrames] = useState<{ t: number; url: string }[]>([]);
  const [voice, setVoice] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    let urls: string[] = [];
    let alive = true;
    (async () => {
      const blobs = await getHuellaFrames(key, h.n);
      const [a, b] = clip.span ?? [0, Infinity];
      const list = blobs.map((bl, k) => ({ t: h.t[k], bl })).filter((x) => x.t >= a - 0.01 && x.t <= b + 0.01);
      urls = list.map((x) => URL.createObjectURL(x.bl));
      if (!alive) return;
      setFrames(list.map((x, k) => ({ t: x.t, url: urls[k] })));
      if (h.audio && clip.kind !== 'proceso') {
        const vb = await getHuellaVoice(key);
        if (vb && alive) {
          const u = URL.createObjectURL(vb);
          urls.push(u);
          setVoice(u);
        }
      }
    })();
    return () => {
      alive = false;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [key, h, clip.span, clip.kind]);

  // sin voz: time-lapse a ~6 cuadros por segundo; con voz: el cuadro sigue al audio
  useEffect(() => {
    if (!frames.length || !playing) return;
    if (voice) {
      const a = audioRef.current;
      if (!a) return;
      if (clip.span && a.currentTime < clip.span[0]) a.currentTime = clip.span[0];
      a.play().catch(() => {});
      const id = window.setInterval(() => {
        const t = a.currentTime;
        let k = 0;
        while (k + 1 < frames.length && frames[k + 1].t <= t) k++;
        setI(k);
        if (clip.span && t >= clip.span[1]) a.pause();
      }, 200);
      return () => {
        window.clearInterval(id);
        a.pause();
      };
    }
    const id = window.setInterval(() => setI((k) => (k + 1) % frames.length), 170);
    return () => window.clearInterval(id);
  }, [frames, playing, voice, clip.span]);

  if (!frames.length) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000' }} onClick={() => setPlaying((p) => !p)}>
      {frames.map((f, k) => (
        <img key={f.url} src={f.url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: k === i ? 1 : 0, transition: 'opacity .16s linear' }} />
      ))}
      {voice && <audio ref={audioRef} src={voice} preload="auto" onEnded={() => setPlaying(false)} />}
      <div className="row" style={{ position: 'absolute', left: 12, bottom: 12, gap: 6 }}>
        <span className="glass-pill" style={{ fontSize: 11 }}>
          {playing ? <Pause size={11} /> : <Play size={11} />} HUELLA {voice ? '· CON TU VOZ' : '· TIME-LAPSE'}
        </span>
      </div>
    </div>
  );
}
