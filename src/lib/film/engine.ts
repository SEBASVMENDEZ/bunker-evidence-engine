// Motor de reproducción de la película semanal: dibuja en canvas, precarga el siguiente fragmento
// en un segundo <video>, funde transiciones y mezcla audio original + banda sonora.
import type { Clip } from '../types';
import { segAt, type Film, type Seg } from './edl';
import {
  H, W, type Scene, drawCapitulo, drawClipOverlay, drawComparacion, drawDemo, drawExperimento, drawFinal,
  drawInsight, drawIntro, drawLoading, drawMetricas, drawPregunta, drawProgress, drawResumen, drawStill, drawFlip, drawVideoFrame, grainOverlay,
} from './draw';
import { Ambient, sound } from '../sound';
import { iconImage } from '../icons';
import { getHuellaFrames, getHuellaVoice, getPosters } from '../db';

/** Un video que no está a mano se muestra con sus cuadros de vista previa, sin alargar la película. */
const STILL_MAX = 7;

export interface EngineState {
  time: number;
  duration: number;
  playing: boolean;
  seg: number;
  chapter: number;
  loading: boolean;
  ended: boolean;
}

type ClipSeg = Extract<Seg, { t: 'clip' }>;

interface Slot {
  v: HTMLVideoElement;
  gain: GainNode | null;
  seg: number;
  ready: boolean;
  token: number;
  url: string;
}

export class FilmEngine {
  private ctx: CanvasRenderingContext2D;
  private slots: Slot[];
  private active = 0;
  private idx = 0;
  private local = 0;
  private playing = false;
  private loading = false;
  private ended = false;
  private raf = 0;
  private last = 0;
  private lastEmit = 0;
  private stallFor = 0;
  private lastSrc = -1;
  private ambient: Ambient | null = null;
  private bus: GainNode | null = null;
  private trans: HTMLCanvasElement;
  private transAt = -1;
  private urls = new Map<string, string>();
  private destroyed = false;
  private hasFrame = false;
  private missing = new Set<string>(); // clips cuyo video no está disponible ahora
  private stills = new Map<string, HTMLImageElement[]>();
  private flips = new Map<string, { t: number[]; imgs: ImageBitmap[] }>(); // cuadros de la huella por video
  private flipLoading = new Map<string, Promise<void>>();
  private voices = new Map<string, AudioBuffer | null>(); // voz guardada (reflexiones)
  private voice: AudioBufferSourceNode | null = null;
  private voiceGain: GainNode | null = null;
  musicOn: boolean;

  constructor(
    private canvas: HTMLCanvasElement,
    private scene: Scene,
    private opts: {
      music: boolean;
      fileFor: (c: Clip) => Promise<Blob | null>;
      onState: (s: EngineState) => void;
    },
  ) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.musicOn = opts.music;
    this.trans = document.createElement('canvas');
    this.slots = [0, 1].map(() => {
      const v = document.createElement('video');
      v.playsInline = true;
      v.preload = 'auto';
      v.crossOrigin = 'anonymous';
      return { v, gain: null, seg: -1, ready: false, token: 0, url: '' };
    });
  }

  get film(): Film {
    return this.scene.film;
  }

  /** Prepara fuentes, iconos y audio. Llamar antes de play(). */
  async init() {
    const icons = new Set<string>(['chispa', 'amanecer', 'noche', 'meta', ...this.scene.areas.map((a) => a.icon)]);
    await Promise.all([...icons].map((i) => iconImage(i, '#ffffff', 256)));
    try {
      await Promise.all([
        document.fonts.load('700 64px "Space Grotesk Variable"'),
        document.fonts.load('500 32px "Inter Variable"'),
      ]);
    } catch {
      /* fuentes del sistema */
    }
    const ac = sound.ensure();
    this.bus = ac.createGain();
    this.bus.gain.value = 1;
    // limitador: la voz del celular + la música ya no se saturan (eso era la distorsión)
    const lim = ac.createDynamicsCompressor();
    lim.threshold.value = -10;
    lim.knee.value = 4;
    lim.ratio.value = 14;
    lim.attack.value = 0.002;
    lim.release.value = 0.18;
    this.bus.connect(lim).connect(sound.master);
    this.voiceGain = ac.createGain();
    this.voiceGain.gain.value = 0.9;
    this.voiceGain.connect(this.bus);
    for (const s of this.slots) {
      try {
        const src = ac.createMediaElementSource(s.v);
        s.gain = ac.createGain();
        s.gain.gain.value = 0;
        src.connect(s.gain).connect(this.bus);
      } catch {
        s.v.muted = true;
      }
    }
    this.ambient = new Ambient(this.bus, 0.4);
    await this.checkMissing();
    // los primeros time-lapse listos antes de empezar (sin pantallazos negros)
    const firstFlips = this.film.segs.filter((sg) => this.isFlip(sg)).slice(0, 2);
    await Promise.all(firstFlips.map((sg) => sg.t === 'clip' && this.ensureFlip(this.scene.clips.get(sg.clipId)!)));
    this.resize(this.canvas.width || 1920, this.canvas.height || 1080);
    this.enter(0, false);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  resize(w: number, h: number) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.trans.width = w;
    this.trans.height = h;
    this.render(performance.now());
  }

  play() {
    if (this.destroyed) return;
    sound.ensure();
    if (this.ended) {
      this.ended = false;
      this.seek(0);
    }
    this.playing = true;
    if (this.musicOn) this.ambient?.start();
    const seg = this.cur;
    if (seg.t === 'clip' && !this.isVirtual(seg)) this.slot.v.play().catch(() => {});
    this.startVoice();
    if (this.local < 0.05) this.cue(seg);
    this.emit(true);
  }

  pause() {
    this.playing = false;
    this.stopVoice();
    for (const s of this.slots) s.v.pause();
    this.ambient?.stop(0.5);
    this.emit(true);
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    if (on && this.playing) this.ambient?.start();
    else this.ambient?.stop(0.6);
  }

  seek(time: number) {
    const t = Math.max(0, Math.min(this.film.duration - 0.01, time));
    const i = segAt(this.film, t);
    this.enter(i, false, t - this.film.segs[i].start);
  }

  nextChapter() {
    const ch = this.cur.chapter;
    const c = this.film.chapters[ch + 1];
    if (c) this.seek(c.start + 0.01);
  }

  prevChapter() {
    const ch = this.cur.chapter;
    const c = this.film.chapters[ch];
    const target = this.time - c.start > 2 || ch === 0 ? c.start : this.film.chapters[ch - 1].start;
    this.seek(target + 0.01);
  }

  get time() {
    return this.cur.start + Math.max(0, this.local);
  }

  get isPlaying() {
    return this.playing;
  }

  get isEnded() {
    return this.ended;
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.stopVoice();
    for (const fl of this.flips.values()) fl.imgs.forEach((b) => b.close());
    this.flips.clear();
    for (const s of this.slots) {
      s.v.pause();
      s.v.removeAttribute('src');
      s.v.load();
      try {
        s.gain?.disconnect();
      } catch {
        /* nada */
      }
    }
    this.ambient?.dispose();
    try {
      this.bus?.disconnect();
    } catch {
      /* nada */
    }
    for (const u of this.urls.values()) URL.revokeObjectURL(u);
    this.urls.clear();
  }

  // ---------------- interno ----------------
  private get cur(): Seg {
    return this.film.segs[this.idx];
  }

  private get slot(): Slot {
    return this.slots[this.active];
  }

  private isDemo(seg: Seg) {
    return seg.t === 'clip' && this.scene.clips.get(seg.clipId)?.source === 'demo';
  }

  /** Fragmento que se dibuja sin reproductor de video (demostración, huella o vista previa). */
  private isVirtual(seg: Seg) {
    return seg.t === 'clip' && (this.isDemo(seg) || this.missing.has(seg.clipId) || this.isFlip(seg));
  }

  private flipKey(c: Clip) {
    return c.huella?.ref ?? c.id;
  }

  /** ¿Se dibuja con la huella? Los acelerados siempre (fluido); los que hablan, si el video no está. */
  private isFlip(seg: Seg) {
    if (seg.t !== 'clip') return false;
    const c = this.scene.clips.get(seg.clipId);
    if (!c || (c.huella?.n ?? 0) < 4) return false;
    return !!seg.flip || (seg.audio && this.missing.has(seg.clipId));
  }

  private ensureFlip(c: Clip): Promise<void> {
    const key = this.flipKey(c);
    const hit = this.flips.get(key);
    if (hit) {
      this.flips.delete(key);
      this.flips.set(key, hit); // el más reciente queda al final
      return Promise.resolve();
    }
    let p = this.flipLoading.get(key);
    if (!p) {
      p = (async () => {
        const h = c.huella!;
        const blobs = await getHuellaFrames(key, h.n).catch(() => [] as Blob[]);
        const bmps = await Promise.all(blobs.map((b) => createImageBitmap(b).catch(() => null)));
        const t: number[] = [];
        const imgs: ImageBitmap[] = [];
        bmps.forEach((b, i) => b && (t.push(h.t[i]), imgs.push(b)));
        if (this.destroyed) return imgs.forEach((b) => b.close());
        this.flips.set(key, { t, imgs });
        // memoria: solo los 4 videos más recientes quedan cargados
        while (this.flips.size > 4) {
          const old = this.flips.keys().next().value as string;
          this.flips.get(old)?.imgs.forEach((b) => b.close());
          this.flips.delete(old);
        }
        if (h.audio && !this.voices.has(key)) {
          const vb = await getHuellaVoice(key).catch(() => undefined);
          this.voices.set(key, vb ? await sound.ensure().decodeAudioData(await vb.arrayBuffer()).catch(() => null) : null);
        }
      })().finally(() => this.flipLoading.delete(key));
      this.flipLoading.set(key, p);
    }
    return p;
  }

  /** La voz guardada de una reflexión, sincronizada con su fragmento. */
  private startVoice() {
    this.stopVoice();
    const seg = this.cur;
    if (!this.playing || seg.t !== 'clip' || !seg.audio || !this.isFlip(seg) || !this.voiceGain) return;
    const c = this.scene.clips.get(seg.clipId);
    const buf = c ? this.voices.get(this.flipKey(c)) : null;
    if (!buf) return;
    const off = seg.from + this.local;
    if (off >= buf.duration - 0.05) return;
    const src = sound.ensure().createBufferSource();
    src.buffer = buf;
    src.connect(this.voiceGain);
    src.start(0, off, Math.max(0.05, Math.min(seg.to, buf.duration) - off));
    this.voice = src;
  }

  private stopVoice() {
    if (!this.voice) return;
    try {
      this.voice.stop();
    } catch {
      /* ya terminó */
    }
    this.voice.disconnect();
    this.voice = null;
  }

  private async checkMissing() {
    const ids = new Set(this.film.segs.flatMap((sg) => (sg.t === 'clip' ? [sg.clipId] : [])));
    await Promise.all(
      [...ids].map(async (id) => {
        const c = this.scene.clips.get(id);
        if (!c || c.source === 'demo') return;
        const blob = await this.opts.fileFor(c).catch(() => null);
        if (blob) return;
        this.missing.add(id);
        await this.loadStills(c);
      }),
    );
  }

  private async loadStills(c: Clip) {
    const blobs = await getPosters(c.id).catch(() => [] as Blob[]);
    const imgs = await Promise.all(
      blobs.map(
        (b, i) =>
          new Promise<HTMLImageElement | null>((res) => {
            const img = new Image();
            const u = URL.createObjectURL(b);
            this.urls.set(`${c.id}#p${i}`, u);
            img.onload = () => res(img);
            img.onerror = () => res(null);
            img.src = u;
          }),
      ),
    );
    const ok = imgs.filter((x): x is HTMLImageElement => !!x);
    const thumb = this.scene.thumbs.get(c.id);
    this.stills.set(c.id, ok.length ? ok : thumb ? [thumb] : []);
  }

  private async urlFor(c: Clip): Promise<string | null> {
    const hit = this.urls.get(c.id);
    if (hit) return hit;
    const blob = await this.opts.fileFor(c);
    if (!blob) return null;
    const u = URL.createObjectURL(blob);
    this.urls.set(c.id, u);
    return u;
  }

  private waitEvent(v: HTMLVideoElement, ev: string, ms: number) {
    return new Promise<boolean>((resolve) => {
      const done = (ok: boolean) => {
        clearTimeout(t);
        v.removeEventListener(ev, onOk);
        v.removeEventListener('error', onErr);
        resolve(ok);
      };
      const onOk = () => done(true);
      const onErr = () => done(false);
      const t = window.setTimeout(() => done(false), ms);
      v.addEventListener(ev, onOk);
      v.addEventListener('error', onErr);
    });
  }

  /** Carga el fragmento i en un reproductor y lo deja listo en su punto de inicio. */
  private async prepare(i: number, slotIdx: number, offset = 0): Promise<boolean> {
    const seg = this.film.segs[i];
    if (!seg || seg.t !== 'clip' || this.isVirtual(seg)) return true;
    const s = this.slots[slotIdx];
    const token = ++s.token;
    s.seg = i;
    s.ready = false;
    const clip = this.scene.clips.get(seg.clipId);
    if (!clip) return false;
    const url = await this.urlFor(clip);
    if (token !== s.token || this.destroyed) return false;
    if (!url) return false;
    if (s.url !== url) {
      s.url = url;
      s.v.src = url;
      const ok = await this.waitEvent(s.v, 'loadedmetadata', 12000);
      if (!ok || token !== s.token) return false;
    }
    s.v.pause();
    s.v.playbackRate = seg.rate;
    s.v.defaultPlaybackRate = seg.rate;
    const target = seg.from + offset * seg.rate;
    if (Math.abs(s.v.currentTime - target) > 0.05) {
      s.v.currentTime = target;
      await this.waitEvent(s.v, 'seeked', 8000);
    }
    if (token !== s.token) return false;
    s.ready = true;
    return true;
  }

  private nextClipIndex(from: number): number {
    for (let j = from + 1; j < this.film.segs.length; j++) {
      const s = this.film.segs[j];
      if (s.t === 'clip' && !this.isVirtual(s)) return j;
    }
    return -1;
  }

  private enter(i: number, crossfade: boolean, offset = 0) {
    if (crossfade && this.hasFrame) {
      const tc = this.trans.getContext('2d')!;
      tc.drawImage(this.canvas, 0, 0);
      this.transAt = performance.now();
    } else this.transAt = -1;
    const prevSlot = this.active;
    this.stopVoice();
    this.idx = i;
    this.local = offset;
    this.stallFor = 0;
    this.lastSrc = -1;
    const seg = this.cur;
    if (seg.t === 'clip' && !this.isVirtual(seg)) {
      let target = this.slots.findIndex((s) => s.seg === i && s.ready);
      const needsPrep = target < 0 || offset > 0.05;
      if (target < 0) target = this.slots[prevSlot].seg === i ? prevSlot : 1 - prevSlot;
      // detener el otro reproductor
      for (let k = 0; k < 2; k++) if (k !== target) this.slots[k].v.pause();
      this.active = target;
      this.setAudio(seg);
      if (needsPrep) {
        this.loading = true;
        this.prepare(i, target, offset).then((ok) => {
          if (this.idx !== i || this.destroyed) return;
          this.loading = false;
          if (!ok) {
            const id = (this.film.segs[i] as ClipSeg).clipId;
            const clip = this.scene.clips.get(id);
            if (!clip) return this.next();
            // el video dejó de estar disponible: se muestra su vista previa sin detener la película
            this.missing.add(id);
            for (const sl of this.slots) sl.v.pause();
            this.setAudio(this.cur);
            if (!this.stills.has(id)) this.loadStills(clip).catch(() => {});
            this.preloadNext();
            return;
          }
          if (this.playing) this.slot.v.play().catch(() => {});
          this.preloadNext();
        });
      } else {
        this.loading = false;
        const v = this.slot.v;
        v.playbackRate = seg.rate;
        if (this.playing) v.play().catch(() => {});
        this.preloadNext();
      }
    } else {
      this.loading = false;
      for (const s of this.slots) s.v.pause();
      if (seg.t === 'clip' && this.isFlip(seg)) {
        const c = this.scene.clips.get(seg.clipId)!;
        if (!this.flips.has(this.flipKey(c))) {
          this.loading = true;
          this.ensureFlip(c).then(() => {
            if (this.idx !== i || this.destroyed) return;
            this.loading = false;
            this.setAudio(this.cur);
            this.startVoice();
          });
        } else this.startVoice();
      }
      this.setAudio(seg);
      this.preloadNext();
    }
    if (this.playing && offset < 0.05) this.cue(seg);
    this.emit(true);
  }

  private preloadNext() {
    // el siguiente time-lapse se prepara mientras ves el actual
    const nf = this.film.segs.findIndex((sg, k) => k > this.idx && this.isFlip(sg));
    const nseg = nf >= 0 ? this.film.segs[nf] : null;
    if (nseg && nseg.t === 'clip') this.ensureFlip(this.scene.clips.get(nseg.clipId)!).catch(() => {});
    const j = this.nextClipIndex(this.idx);
    if (j < 0) return;
    const other = this.cur.t === 'clip' && !this.isVirtual(this.cur) ? 1 - this.active : this.active;
    const s = this.slots[other];
    if (s.seg === j && s.ready) return;
    this.prepare(j, other).catch(() => {});
  }

  private setAudio(seg: Seg) {
    const speaking = seg.t === 'clip' && seg.audio && !this.isVirtual(seg);
    const c = seg.t === 'clip' ? this.scene.clips.get(seg.clipId) : undefined;
    const voiced = seg.t === 'clip' && seg.audio && this.isFlip(seg) && !!(c && this.voices.get(this.flipKey(c)));
    const ac = sound.ctx;
    this.slots.forEach((s, k) => {
      if (!s.gain || !ac) return;
      const on = speaking && k === this.active;
      s.gain.gain.setTargetAtTime(on ? 0.85 : 0, ac.currentTime, 0.08);
      s.v.muted = !s.gain && !on;
    });
    this.ambient?.duck(speaking || voiced);
  }

  private cue(seg: Seg) {
    if (seg.t === 'intro') sound.play('intro', true);
    else if (seg.t === 'capitulo') sound.play('chapter', true);
    else if (seg.t === 'resumen' || seg.t === 'comparacion' || seg.t === 'metricas' || seg.t === 'insight') sound.play('whoosh', true);
    else if (seg.t === 'final') sound.play('seal', true);
  }

  private next() {
    if (this.idx + 1 < this.film.segs.length) this.enter(this.idx + 1, true);
    else {
      this.playing = false;
      this.ended = true;
      for (const s of this.slots) s.v.pause();
      this.ambient?.stop(2);
      this.emit(true);
    }
  }

  private loop = (now: number) => {
    if (this.destroyed) return;
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    if (this.playing && !this.loading) this.advance(dt);
    this.render(now);
    if (now - this.lastEmit > 120) this.emit();
    this.raf = requestAnimationFrame(this.loop);
  };

  private advance(dt: number) {
    const seg = this.cur;
    if (seg.t === 'clip' && !this.isVirtual(seg)) {
      const v = this.slot.v;
      const local = (v.currentTime - seg.from) / seg.rate;
      this.local = Math.max(0, local);
      if (v.currentTime >= seg.to - 0.04 || v.ended || this.local >= seg.dur + 0.5) {
        this.next();
        return;
      }
      if (Math.abs(v.currentTime - this.lastSrc) < 0.001) {
        this.stallFor += dt;
        if (v.paused) v.play().catch(() => {});
        if (this.stallFor > 6) this.next();
      } else this.stallFor = 0;
      this.lastSrc = v.currentTime;
    } else {
      this.local += dt * 1;
      const end = seg.t === 'clip' && !this.isDemo(seg) && !this.isFlip(seg) ? Math.min(seg.dur, STILL_MAX) : seg.dur;
      if (this.local >= end) this.next();
    }
  }

  private render(now: number) {
    const ctx = this.ctx;
    const k = this.canvas.width / W;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    const seg = this.cur;
    const sc = this.scene;
    const t = this.local;
    switch (seg.t) {
      case 'intro':
        drawIntro(ctx, sc, t, seg.dur);
        break;
      case 'resumen':
        drawResumen(ctx, sc, t, seg.dur);
        break;
      case 'experimento':
        drawExperimento(ctx, sc, t, seg.dur, seg.text);
        break;
      case 'capitulo':
        drawCapitulo(ctx, sc, t, seg.dur, seg);
        break;
      case 'clip':
        this.drawClip(seg, t);
        break;
      case 'comparacion':
        drawComparacion(ctx, sc, t, seg.dur);
        break;
      case 'metricas':
        drawMetricas(ctx, sc, t, seg.dur);
        break;
      case 'insight':
        drawInsight(ctx, sc, t, seg.dur, seg.statements);
        break;
      case 'pregunta':
        drawPregunta(ctx, sc, t, seg.dur, seg.text);
        break;
      case 'final':
        drawFinal(ctx, sc, t, seg.dur, seg);
        break;
    }
    if (this.transAt > 0) {
      const p = (now - this.transAt) / 420;
      if (p < 1) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1 - p * p;
        ctx.drawImage(this.trans, 0, 0);
        ctx.restore();
        ctx.setTransform(k, 0, 0, k, 0, 0);
      } else this.transAt = -1;
    }
    if (seg.t !== 'intro') drawProgress(ctx, sc, this.time);
    grainOverlay(ctx);
    if (this.loading) drawLoading(ctx, now / 1000);
    this.hasFrame = true;
  }

  private drawClip(seg: ClipSeg, t: number) {
    const ctx = this.ctx;
    const clip = this.scene.clips.get(seg.clipId);
    if (!clip) return;
    const src = seg.from + t * seg.rate;
    if (clip.source === 'demo') {
      drawDemo(ctx, clip, this.scene.areas.find((a) => a.id === clip.areaId), src);
    } else if (this.isFlip(seg)) {
      drawFlip(ctx, this.flips.get(this.flipKey(clip)), seg.from + (seg.to - seg.from) * Math.min(1, t / Math.max(0.01, seg.dur)), this.time);
    } else if (this.missing.has(clip.id)) {
      drawStill(ctx, this.stills.get(clip.id) ?? [], t, Math.min(seg.dur, STILL_MAX));
    } else {
      const v = this.slot.v;
      ctx.fillStyle = this.slot.ready ? '#000' : '#05070D';
      ctx.fillRect(0, 0, W, H);
      // solo dibujar cuando el reproductor ya está en el fragmento correcto (evita fotogramas de otro clip)
      if (this.slot.ready && this.slot.seg === this.idx && v.readyState >= 2) drawVideoFrame(ctx, v, this.time);
    }
    drawClipOverlay(ctx, this.scene, seg, t, src);
  }

  private emit(force = false) {
    const now = performance.now();
    if (!force && now - this.lastEmit < 100) return;
    this.lastEmit = now;
    this.opts.onState({
      time: this.time,
      duration: this.film.duration,
      playing: this.playing,
      seg: this.idx,
      chapter: this.cur.chapter,
      loading: this.loading,
      ended: this.ended,
    });
  }
}
