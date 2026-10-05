// Sistema de sonido propio del Búnker: todo sintetizado con Web Audio, sin archivos.

export type Sfx =
  | 'tap' | 'rec' | 'stop' | 'saved' | 'ready' | 'error' | 'whoosh' | 'intro'
  | 'seal' | 'tick' | 'marker' | 'pop' | 'breathIn' | 'breathOut' | 'chapter';

class SoundEngine {
  ctx: AudioContext | null = null;
  master!: GainNode; // todo lo audible pasa por aquí (volumen general)
  private sfxGain!: GainNode; // efectos de interfaz (se pueden apagar)
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private noise!: AudioBuffer;
  enabled = true;
  volume = 0.7;
  haptics = true;

  ensure(): AudioContext {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 3;
      this.master.connect(comp).connect(ctx.destination);
      this.sfxGain = ctx.createGain();
      this.sfxGain.gain.value = this.enabled ? 1 : 0;
      this.sfxGain.connect(this.master);
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this.impulse(2.6, 2.4);
      this.reverbSend = ctx.createGain();
      this.reverbSend.gain.value = 0.9;
      this.reverbSend.connect(this.reverb).connect(this.master);
      this.noise = this.makeNoise(2);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  /** Bus de reverberación compartido (lo usa también la música). */
  get reverbIn(): GainNode {
    this.ensure();
    return this.reverbSend;
  }

  setEnabled(v: boolean) {
    this.enabled = v;
    if (this.ctx) this.sfxGain.gain.setTargetAtTime(v ? 1 : 0, this.ctx.currentTime, 0.02);
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private tone(
    freq: number, start: number, dur: number,
    o: { type?: OscillatorType; gain?: number; attack?: number; to?: number; rev?: number; out?: AudioNode; detune?: number } = {},
  ) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, start);
    if (o.detune) osc.detune.value = o.detune;
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, start + dur);
    const g = ctx.createGain();
    const peak = o.gain ?? 0.2;
    const a = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + a);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(o.out ?? this.sfxGain);
    if (o.rev) {
      const s = ctx.createGain();
      s.gain.value = o.rev;
      g.connect(s).connect(this.reverbSend);
    }
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  private bell(freq: number, start: number, dur: number, gain: number, rev = 0.4, out?: AudioNode) {
    this.tone(freq, start, dur, { gain, rev, out });
    this.tone(freq * 2.01, start, dur * 0.5, { gain: gain * 0.25, rev, out });
    this.tone(freq * 3.02, start, dur * 0.25, { gain: gain * 0.08, rev, out });
  }

  private sweep(start: number, dur: number, from: number, to: number, gain: number, out?: AudioNode, rev = 0.3) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(from, start);
    bp.frequency.exponentialRampToValueAtTime(to, start + dur * 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(bp).connect(g).connect(out ?? this.sfxGain);
    const s = ctx.createGain();
    s.gain.value = rev;
    g.connect(s).connect(this.reverbSend);
    src.start(start, Math.random());
    src.stop(start + dur + 0.05);
  }

  /** Reproduce un efecto. `film` = forzar aunque los efectos de interfaz estén apagados (sonido de la película). */
  play(name: Sfx, film = false) {
    if (!this.enabled && !film) return;
    let ctx: AudioContext;
    try {
      ctx = this.ensure();
    } catch {
      return;
    }
    const t = ctx.currentTime + 0.01;
    const out = film ? this.master : undefined;
    switch (name) {
      case 'tap':
        this.tone(2400, t, 0.03, { gain: 0.05, type: 'sine', out });
        break;
      case 'tick':
        this.tone(3200, t, 0.025, { gain: 0.035, out });
        break;
      case 'pop':
        this.tone(660, t, 0.12, { gain: 0.14, type: 'triangle', to: 990, out });
        this.tone(1320, t + 0.04, 0.18, { gain: 0.06, rev: 0.2, out });
        break;
      case 'rec':
        this.tone(140, t, 0.18, { gain: 0.25, type: 'sine', to: 60, out });
        this.tone(880, t, 0.09, { gain: 0.16, type: 'triangle', out });
        this.tone(1320, t + 0.09, 0.16, { gain: 0.16, type: 'triangle', rev: 0.25, out });
        break;
      case 'stop':
        this.tone(1320, t, 0.09, { gain: 0.14, type: 'triangle', out });
        this.tone(880, t + 0.09, 0.2, { gain: 0.14, type: 'triangle', rev: 0.2, out });
        break;
      case 'saved':
        [1046.5, 1318.5, 1568, 2093].forEach((f, i) => this.bell(f, t + i * 0.07, 0.9, 0.09, 0.5, out));
        break;
      case 'ready':
        this.bell(784, t, 1.2, 0.1, 0.6, out);
        this.bell(1174.7, t + 0.12, 1.4, 0.09, 0.6, out);
        break;
      case 'marker':
        this.bell(2093, t, 0.5, 0.1, 0.4, out);
        break;
      case 'error':
        this.tone(196, t, 0.14, { gain: 0.16, type: 'square', out });
        this.tone(174.6, t + 0.17, 0.22, { gain: 0.16, type: 'square', out });
        break;
      case 'whoosh':
        this.sweep(t, 0.7, 300, 3200, 0.18, out);
        break;
      case 'chapter':
        this.sweep(t, 0.9, 250, 2600, 0.12, out, 0.5);
        this.tone(73.4, t + 0.25, 1.4, { gain: 0.22, to: 55, out, attack: 0.02 });
        this.bell(587.3, t + 0.3, 1.8, 0.05, 0.9, out);
        break;
      case 'intro': {
        this.sweep(t, 1.4, 120, 6000, 0.2, out, 0.6);
        this.tone(110, t + 1.25, 2.6, { gain: 0.4, to: 38, out, attack: 0.01 });
        this.tone(55, t + 1.25, 2.8, { gain: 0.3, out, attack: 0.01 });
        [880, 1318.5, 1760, 2637].forEach((f, i) => this.bell(f, t + 1.3 + i * 0.05, 3.2, 0.045, 1, out));
        break;
      }
      case 'seal':
        [523.25, 659.25, 784, 1046.5, 1318.5].forEach((f, i) => this.bell(f, t + i * 0.11, 1.6, 0.08, 0.7, out));
        [261.6, 392, 523.25].forEach((f) => this.tone(f, t + 0.6, 2.8, { gain: 0.06, type: 'triangle', attack: 0.3, rev: 0.8, out }));
        break;
      case 'breathIn':
        this.tone(220, t, 3.8, { gain: 0.07, attack: 1.8, to: 330, rev: 0.8, out });
        this.tone(330, t, 3.8, { gain: 0.04, attack: 1.8, to: 440, rev: 0.8, out });
        break;
      case 'breathOut':
        this.tone(330, t, 5.6, { gain: 0.06, attack: 0.6, to: 196, rev: 0.8, out });
        this.tone(440, t, 5.6, { gain: 0.03, attack: 0.6, to: 261.6, rev: 0.8, out });
        break;
    }
  }

  vibrate(pattern: number | number[]) {
    if (!this.haptics) return;
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* sin vibración */
    }
  }
}

export const sound = new SoundEngine();

// ---------------- Banda sonora generativa (película) ----------------
const N = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

// Dmaj9 · Bm9 · Gmaj7(#11) · A(sus) — cálido, sereno y en movimiento.
const CHORDS = [
  [50, 57, 62, 66, 69, 73, 76],
  [47, 54, 59, 62, 66, 69, 73],
  [43, 50, 55, 59, 62, 66, 73],
  [45, 52, 57, 59, 62, 64, 69],
];

export class Ambient {
  private ctx: AudioContext;
  private out: GainNode;
  private duckGain: GainNode;
  private delay: DelayNode;
  private timer = 0;
  private nextChordAt = 0;
  private nextArpAt = 0;
  private chordIdx = 0;
  private running = false;
  private level: number;
  readonly chordDur = 8;

  constructor(dest: AudioNode, level = 0.5) {
    this.ctx = sound.ensure();
    this.level = level;
    this.out = this.ctx.createGain();
    this.out.gain.value = 0;
    this.duckGain = this.ctx.createGain();
    this.duckGain.gain.value = 1;
    this.out.connect(this.duckGain).connect(dest);
    const rsend = this.ctx.createGain();
    rsend.gain.value = 0.55;
    this.out.connect(rsend).connect(sound.reverbIn);
    this.delay = this.ctx.createDelay(2);
    this.delay.delayTime.value = 0.375;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.38;
    const dl = this.ctx.createGain();
    dl.gain.value = 0.5;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(dl).connect(this.out);
  }

  start() {
    if (this.running) return;
    this.running = true;
    const t = this.ctx.currentTime + 0.05;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(this.level, t + 2.5);
    this.nextChordAt = Math.max(this.nextChordAt, t);
    this.nextArpAt = Math.max(this.nextArpAt, t + 1);
    this.tick();
    this.timer = window.setInterval(() => this.tick(), 120);
  }

  stop(fade = 1.2) {
    if (!this.running) return;
    this.running = false;
    window.clearInterval(this.timer);
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(0, t + fade);
  }

  setLevel(v: number) {
    this.level = v;
    if (this.running) this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.3);
  }

  /** Baja la música cuando habla el clip original. */
  duck(on: boolean) {
    this.duckGain.gain.setTargetAtTime(on ? 0.18 : 1, this.ctx.currentTime, 0.35);
  }

  dispose() {
    this.stop(0.3);
    window.setTimeout(() => {
      try {
        this.out.disconnect();
        this.duckGain.disconnect();
        this.delay.disconnect();
      } catch {
        /* ya desconectado */
      }
    }, 1500);
  }

  private tick() {
    const ahead = this.ctx.currentTime + 1.2;
    while (this.nextChordAt < ahead) {
      this.chord(CHORDS[this.chordIdx % CHORDS.length], this.nextChordAt);
      this.chordIdx++;
      this.nextChordAt += this.chordDur;
    }
    while (this.nextArpAt < ahead) {
      const chord = CHORDS[(this.chordIdx - 1 + CHORDS.length) % CHORDS.length];
      if (Math.random() < 0.6) {
        const note = chord[2 + Math.floor(Math.random() * (chord.length - 2))] + 12;
        this.pluck(N(note), this.nextArpAt);
      }
      this.nextArpAt += Math.random() < 0.7 ? 0.5 : 0.75;
    }
  }

  private chord(notes: number[], t: number) {
    const ctx = this.ctx;
    const len = this.chordDur + 3;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(700, t);
    lp.frequency.linearRampToValueAtTime(1500, t + this.chordDur * 0.5);
    lp.frequency.linearRampToValueAtTime(800, t + len);
    lp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.055, t + 2.2);
    g.gain.setValueAtTime(0.055, t + this.chordDur - 0.5);
    g.gain.linearRampToValueAtTime(0.0001, t + len);
    lp.connect(g).connect(this.out);
    notes.slice(1).forEach((m, i) => {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = i < 2 ? 'triangle' : 'sawtooth';
        o.frequency.value = N(m);
        o.detune.value = det;
        const vg = ctx.createGain();
        vg.gain.value = i < 2 ? 0.7 : 0.22;
        o.connect(vg).connect(lp);
        o.start(t);
        o.stop(t + len + 0.1);
      }
    });
    // bajo
    const b = ctx.createOscillator();
    b.type = 'sine';
    b.frequency.value = N(notes[0] - 12);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.linearRampToValueAtTime(0.16, t + 1.5);
    bg.gain.setValueAtTime(0.16, t + this.chordDur - 0.3);
    bg.gain.linearRampToValueAtTime(0.0001, t + this.chordDur + 1.5);
    b.connect(bg).connect(this.out);
    b.start(t);
    b.stop(t + this.chordDur + 1.6);
  }

  private pluck(f: number, t: number) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = f * 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    const g2 = ctx.createGain();
    g2.gain.value = 0.15;
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(this.out);
    g.connect(this.delay);
    o.start(t);
    o2.start(t);
    o.stop(t + 1.5);
    o2.stop(t + 1.5);
  }
}
