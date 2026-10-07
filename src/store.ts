import { create } from 'zustand';
import type { Area, CalmLog, Clip, Compass, DailyLog, Intent, LearnSample, LinkedFolder, Settings, SheetLink, Shift, Shifts, WeekReview } from './lib/types';
import * as DB from './lib/db';
import { DEFAULT_AREAS, DEFAULT_COMPASS, DEFAULT_SETTINGS } from './lib/content';
import { inferKind, isAnchor, markRepetitions, reclassify, CONFIRM_THRESHOLD } from './lib/classify';
import { analyzeTramos, TRAMOS_V, TRAMO_MIN_REAL, type Tramo } from './lib/tramos';
import { extractDate, lapseFromInfo, makeThumb, mp4Info, probeVideo, VIDEO_EXT } from './lib/media';
import { sound } from './lib/sound';
import { addDays, dayKey, parseHM, startOfDay, uid, weekKey, weekStart } from './lib/time';
import { iconImage } from './lib/icons';
import { drawDemo, W as FW } from './lib/film/draw';
import { blocksToShifts, extractShifts, readWorkbook, type SheetResult } from './lib/sheet';

export type Route = 'hoy' | 'camara' | 'evidencia' | 'domingo' | 'brujula' | 'ajustes';

export interface Toast {
  id: string;
  text: string;
  kind: 'ok' | 'info' | 'error';
}

interface QueueState {
  total: number;
  done: number;
  running: boolean;
}

interface State {
  ready: boolean;
  settings: Settings;
  areas: Area[];
  clips: Clip[];
  reviews: Record<string, WeekReview>;
  daily: Record<string, DailyLog>;
  compass: Compass;
  calm: CalmLog[];
  folders: LinkedFolder[];
  samples: LearnSample[];
  shifts: Shifts;
  sheet: SheetLink | null;
  queue: QueueState;
  toasts: Toast[];
  route: Route;
  reviewWeek: string;
  filmWeek: string | null;
  clipModal: string | null;
  calmOpen: boolean;
  turnosOpen: boolean;
  storage: { usage: number; quota: number; persisted: boolean };
  intents: Intent[];
  analyzing: { id: string; p: number } | null;

  init: () => Promise<void>;
  go: (r: Route) => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  setSettings: (p: Partial<Settings>) => void;
  setAreas: (a: Area[]) => void;
  updateClip: (id: string, p: Partial<Clip>) => void;
  assignArea: (id: string, areaId: string) => void;
  ignoreClip: (id: string) => void;
  removeClip: (id: string) => Promise<void>;
  saveRecording: (blob: Blob, meta: DB.RecordingMeta, duration: number, recovered?: boolean) => Promise<Clip>;
  importFiles: (items: (File | FileSystemFileHandle)[]) => Promise<void>;
  linkFolder: () => Promise<void>;
  scanFolder: (f: LinkedFolder, interactive: boolean) => Promise<number>;
  scanAll: (interactive: boolean) => Promise<void>;
  syncAll: (interactive: boolean) => Promise<void>;
  unlinkFolder: (id: string) => Promise<void>;
  setShift: (day: string, s: Shift | null) => void;
  linkSheet: () => Promise<void>;
  importSheetFile: (f: File, handle?: FileSystemFileHandle) => Promise<SheetResult | null>;
  readSheet: (interactive: boolean) => Promise<void>;
  unlinkSheet: () => void;
  loadDemo: () => Promise<void>;
  clearDemo: () => Promise<void>;
  saveReview: (week: string, p: Partial<WeekReview>) => void;
  saveDaily: (date: string, p: Partial<DailyLog>) => void;
  setCompass: (p: Partial<Compass>) => void;
  addCalm: (l: CalmLog) => void;
  setReviewWeek: (w: string) => void;
  openFilm: (w: string | null) => void;
  openClip: (id: string | null) => void;
  setCalm: (v: boolean) => void;
  setTurnos: (v: boolean) => void;
  refreshStorage: () => Promise<void>;
  /** "Voy a grabar X": el siguiente video que empiece en los próximos minutos queda en esa área. */
  setIntent: (areaId: string) => void;
  /** Divide un video (o un tramo) en el segundo `at` del archivo. */
  splitTramo: (id: string, at: number, thumb?: string, sig?: number[]) => void;
  /** Une un tramo con el anterior (o el primero con el siguiente). */
  mergeTramo: (id: string) => Promise<void>;
}

/** ¿Este video largo aún no se ha revisado por si trae varias actividades seguidas? */
export const needsTramos = (c: Clip) =>
  !c.parentId && !c.span && c.source !== 'demo' && (c.analyzed ?? 0) < TRAMOS_V && (c.realDuration ?? c.duration * (c.speed || (c.lapse ? 5 : 1))) >= TRAMO_MIN_REAL;

/** Clips del mismo video, en orden (el primero es el original). */
export const tramosOf = (clips: Clip[], c: Clip) => {
  const root = c.parentId ?? c.id;
  return clips.filter((x) => (x.parentId ?? x.id) === root && (x.span || x.id === root)).sort((a, b) => (a.span?.[0] ?? 0) - (b.span?.[0] ?? 0));
};

const INTENT_BEFORE = 5 * 60000; // el video puede empezar poco antes del toque…
const INTENT_AFTER = 45 * 60000; // …o hasta 45 min después

/** Aplica las marcas "voy a grabar": cada una toma el primer video que empieza en su ventana. */
function applyIntents(clips: Clip[], intents: Intent[]): Clip[] {
  const changed: Clip[] = [];
  const sorted = [...intents].sort((a, b) => a.at - b.at);
  const roots = clips.filter((c) => !c.parentId && c.source !== 'demo' && !c.excluded).sort((a, b) => a.takenAt - b.takenAt);
  sorted.forEach((it, i) => {
    const until = Math.min(it.at + INTENT_AFTER, (sorted[i + 1]?.at ?? Infinity) - 60000);
    const c = roots.find((x) => x.takenAt >= it.at - INTENT_BEFORE && x.takenAt <= until);
    if (!c || c.areaBy === 'manual' || (c.areaBy === 'intencion' && c.areaId === it.areaId)) return;
    changed.push({ ...c, areaId: it.areaId, areaBy: 'intencion', confidence: 1, alts: undefined });
  });
  return changed;
}

const pendingIds = new Set<string>();
let queueRunning = false;

export const useStore = create<State>((set, get) => {
  const persistClip = (c: Clip) => DB.putClip(c).catch(() => {});

  const upsertClips = (cs: Clip[]) => {
    if (!cs.length) return;
    const map = new Map(get().clips.map((c) => [c.id, c]));
    for (const c of cs) map.set(c.id, c);
    set({ clips: [...map.values()] });
    DB.putClips(cs).catch(() => {});
  };

  const recomputeRepetitions = (weeks: Set<string>) => {
    const all = get().clips.filter((c) => weeks.has(c.week));
    upsertClips(markRepetitions(all));
  };

  /** Re-alinea los días con la rutina (y aplica lo aprendido). */
  const reclass = (days: Set<string> | 'all') => {
    upsertClips(applyIntents(get().clips, get().intents));
    const { clips, areas, shifts } = get();
    const changed = reclassify(clips, areas, shifts, days);
    upsertClips(changed);
    const weeks = new Set(get().clips.filter((c) => days === 'all' || days.has(dayKey(c.takenAt))).map((c) => c.week));
    recomputeRepetitions(weeks);
  };

  const saveShifts = (shifts: Shifts) => {
    set({ shifts });
    DB.kvSet('shifts', shifts);
  };

  const processOne = async (id: string) => {
    const c = get().clips.find((x) => x.id === id);
    if (!c) return;
    const file = await DB.clipFile(c);
    if (!file) {
      if (c.status !== 'listo') upsertClips([{ ...c, status: 'sin-acceso' }]);
      return;
    }
    if (c.status === 'listo' && c.thumb) {
      // ya procesado: solo falta revisar si es un bloque con varias actividades
      if (needsTramos(c)) await splitIntoTramos(c, file);
      return;
    }
    try {
      // sin copia guardada: se guardan unos cuadros para que la película lo muestre aunque el video no esté a mano
      const p = await probeVideo(file, c.duration || undefined, !DB.isPersistent(c));
      if (p.posters?.length) await DB.putPosters(c.id, p.posters);
      // time-lapse: sin audio o con fps de captura en los metadatos (solo videos del celular, no grabaciones propias)
      const fromPhone = c.source === 'carpeta' || c.source === 'importado';
      const info = /\.(mp4|mov|m4v|3gp)$/i.test(c.name) ? await mp4Info(file) : null;
      const lapseInfo = fromPhone ? lapseFromInfo(info, c.name) : { lapse: false };
      // releer: el usuario pudo cambiar algo mientras se procesaba
      const cur = get().clips.find((x) => x.id === id);
      if (!cur) return;
      const next: Clip = {
        ...cur,
        duration: p.duration || c.duration,
        width: p.width,
        height: p.height,
        thumb: p.thumb ?? c.thumb,
        sig: p.sig ?? c.sig,
        rotation: info?.rotation ?? c.rotation ?? null,
        status: 'listo',
        error: undefined,
        ...(cur.speedBy === 'manual' ? {} : { lapse: lapseInfo.lapse, speed: lapseInfo.speed, speedBy: 'auto' as const }),
      };
      if (isAnchor(next) && next.kindBy === 'auto') next.kind = inferKind(next.duration, get().areas.find((a) => a.id === next.areaId), next.lapse);
      upsertClips([next]);
      if (needsTramos(next)) await splitIntoTramos(next, file);
      else reclass(new Set([dayKey(next.takenAt)]));
    } catch (e) {
      upsertClips([{ ...c, status: 'error', error: (e as Error).message }]);
    }
  };

  /** Un clip nuevo que sale de un tramo de otro video (comparte su archivo). */
  const tramoClip = (root: Clip, t: Pick<Tramo, 'from' | 'to'> & Partial<Pick<Tramo, 'thumb' | 'sig' | 'lay' | 'mot'>>, k: number): Clip => {
    const takenAt = root.takenAt + Math.round(t.from * (root.speed || 1) * 1000);
    return {
      id: uid('c_'),
      source: root.source,
      parentId: root.id,
      fingerprint: `${root.fingerprint}#${k}`,
      name: root.name,
      mime: root.mime,
      size: root.size,
      takenAt,
      dateBy: root.dateBy,
      duration: t.to - t.from,
      lapse: root.lapse,
      speed: root.speed,
      speedBy: root.speedBy,
      rotation: root.rotation,
      sig: t.sig ?? root.sig,
      lay: t.lay,
      mot: t.mot,
      span: [t.from, t.to],
      width: root.width,
      height: root.height,
      thumb: t.thumb ?? root.thumb,
      areaId: null,
      confidence: 0,
      areaBy: 'ninguno',
      kind: 'explicacion',
      kindBy: 'auto',
      starred: false,
      markers: [],
      excluded: root.excluded,
      week: weekKey(takenAt),
      addedAt: Date.now(),
      status: 'listo',
      analyzed: TRAMOS_V,
    };
  };

  /** Video largo: si trae varias actividades seguidas (bloque de la mañana), se divide en tramos. */
  const splitIntoTramos = async (c: Clip, file: Blob) => {
    set({ analyzing: { id: c.id, p: 0 } });
    let trs: Tramo[] = [];
    try {
      trs = await analyzeTramos(file, {
        duration: c.duration,
        speed: c.speed || 1,
        posters: !DB.isPersistent(c),
        onProgress: (p) => set({ analyzing: { id: c.id, p } }),
      });
    } catch {
      /* ilegible: se queda como un solo video */
    } finally {
      set({ analyzing: null });
    }
    const cur = get().clips.find((x) => x.id === c.id);
    if (!cur) return;
    if (trs.length < 2) {
      upsertClips([{ ...cur, analyzed: TRAMOS_V, lay: trs[0]?.lay ?? cur.lay, mot: trs[0]?.mot ?? cur.mot }]);
      reclass(new Set([dayKey(cur.takenAt)]));
      return;
    }
    const first = trs[0];
    const manual = cur.areaBy === 'manual' || cur.areaBy === 'intencion';
    const root: Clip = {
      ...cur,
      span: [first.from, first.to],
      duration: first.to - first.from,
      thumb: first.thumb ?? cur.thumb,
      sig: first.sig ?? cur.sig,
      lay: first.lay,
      mot: first.mot,
      analyzed: TRAMOS_V,
      realDuration: undefined,
      ...(manual ? {} : { areaId: null, areaBy: 'ninguno' as const, confidence: 0, alts: undefined }),
    };
    const kids = trs.slice(1).map((t, i) => tramoClip(cur, t, i + 2));
    if (first.posters?.length) await DB.putPosters(root.id, first.posters);
    for (let i = 0; i < kids.length; i++) if (trs[i + 1].posters?.length) await DB.putPosters(kids[i].id, trs[i + 1].posters!);
    upsertClips([root, ...kids]);
    reclass(new Set([root, ...kids].map((x) => dayKey(x.takenAt))));
    get().toast(`Bloque detectado: ${trs.length} actividades en ${cur.name}`, 'ok');
  };

  const runQueue = async () => {
    if (queueRunning) return;
    queueRunning = true;
    const weeks = new Set<string>();
    let processed = 0;
    set({ queue: { total: pendingIds.size, done: 0, running: true } });
    const worker = async () => {
      while (pendingIds.size) {
        const id = pendingIds.values().next().value as string;
        pendingIds.delete(id);
        await processOne(id);
        const c = get().clips.find((x) => x.id === id);
        if (c) weeks.add(c.week);
        processed++;
        set((s) => ({ queue: { total: Math.max(s.queue.total, processed + pendingIds.size), done: processed, running: true } }));
      }
    };
    await Promise.all([worker(), worker()]);
    queueRunning = false;
    set({ queue: { total: 0, done: 0, running: false } });
    if (pendingIds.size) {
      runQueue();
      return;
    }
    if (processed > 0) {
      const unsure = get().clips.filter((c) => weeks.has(c.week) && needsConfirm(c)).length;
      sound.play('ready');
      get().toast(
        `${processed} ${processed === 1 ? 'evidencia procesada' : 'evidencias procesadas'}${unsure ? ` · ${unsure} por confirmar` : ''}`,
        'ok',
      );
      get().refreshStorage();
    }
  };

  const enqueue = (ids: string[]) => {
    ids.forEach((id) => pendingIds.add(id));
    if (ids.length) runQueue();
  };

  const newClipFromFile = async (file: File, extra: Partial<Clip> & { source: Clip['source'] }): Promise<Clip | null> => {
    const fp = `${file.name}|${file.size}`;
    if (get().clips.some((c) => c.fingerprint === fp)) return null;
    const { ts, by } = await extractDate(file, file.name, file.lastModified);
    return {
      id: uid('c_'),
      fingerprint: fp,
      name: file.name,
      mime: file.type || 'video/mp4',
      size: file.size,
      takenAt: ts,
      dateBy: by,
      duration: 0,
      width: 0,
      height: 0,
      areaId: null,
      confidence: 0,
      areaBy: 'ninguno',
      kind: 'explicacion',
      kindBy: 'auto',
      starred: false,
      markers: [],
      excluded: false,
      week: weekKey(ts),
      addedAt: Date.now(),
      status: 'pendiente',
      ...extra,
    };
  };

  const isGranted = async (h: FileSystemHandle, interactive: boolean) => {
    const anyH = h as FileSystemHandle & {
      queryPermission?: (o: object) => Promise<PermissionState>;
      requestPermission?: (o: object) => Promise<PermissionState>;
    };
    if (!anyH.queryPermission) return true;
    let p = await anyH.queryPermission({ mode: 'read' });
    if (p !== 'granted' && interactive && anyH.requestPermission) p = await anyH.requestPermission({ mode: 'read' });
    return p === 'granted';
  };

  return {
    ready: false,
    settings: DEFAULT_SETTINGS,
    areas: DEFAULT_AREAS,
    clips: [],
    reviews: {},
    daily: {},
    compass: DEFAULT_COMPASS,
    calm: [],
    folders: [],
    samples: [],
    shifts: {},
    sheet: null,
    queue: { total: 0, done: 0, running: false },
    toasts: [],
    route: 'hoy',
    reviewWeek: weekKey(Date.now()),
    filmWeek: null,
    clipModal: null,
    calmOpen: false,
    turnosOpen: false,
    storage: { usage: 0, quota: 0, persisted: false },
    intents: [],
    analyzing: null,

    init: async () => {
      const [settings, areas, compass, samples, calm, clips, reviews, daily, folders, shifts, sheet, intents] = await Promise.all([
        DB.kvGet<Settings>('settings'),
        DB.kvGet<Area[]>('areas'),
        DB.kvGet<Compass>('compass'),
        DB.kvGet<LearnSample[]>('samples'),
        DB.kvGet<CalmLog[]>('calm'),
        DB.allClips(),
        DB.allReviews(),
        DB.allDaily(),
        DB.allFolders(),
        DB.kvGet<Shifts>('shifts'),
        DB.kvGet<SheetLink>('sheet'),
        DB.kvGet<Intent[]>('intents'),
      ]);
      const st: Settings = { ...DEFAULT_SETTINGS, ...settings, camera: { ...DEFAULT_SETTINGS.camera, ...settings?.camera } };
      const def = new Map(DEFAULT_AREAS.map((a) => [a.id, a]));
      let loadedAreas = areas?.length ? areas : DEFAULT_AREAS;
      // migración v1 → v2: sin horarios por área; ritmo + turnos
      const migrate = !!settings && (settings.version ?? 1) < 2;
      loadedAreas = loadedAreas.map((a) => ({
        ...a,
        moment: a.moment ?? def.get(a.id)?.moment ?? 'libre',
        minutes: a.minutes ?? def.get(a.id)?.minutes ?? 15,
        windows: migrate ? [] : (a.windows ?? []),
      }));
      if (migrate) {
        st.version = 2;
        st.rhythmIntroSeen = false;
        DB.kvSet('settings', st);
        DB.kvSet('areas', loadedAreas);
      }
      // v2 → v3: nueva área "Estudio" (junto a Trading y Proyecto, frente al computador)
      if (!!settings && st.version < 3) {
        const estudio = def.get('estudio');
        if (estudio && !loadedAreas.some((a) => a.id === 'estudio')) {
          const at = Math.max(...loadedAreas.filter((a) => a.id === 'trading' || a.id === 'proyecto').map((a) => a.order), -1) + 1;
          loadedAreas = [...loadedAreas.map((a) => (a.order >= at ? { ...a, order: a.order + 1 } : a)), { ...estudio, order: at }];
          DB.kvSet('areas', loadedAreas);
        }
        st.version = 3;
        DB.kvSet('settings', st);
      }
      sound.enabled = st.sound;
      sound.volume = st.volume;
      sound.haptics = st.haptics;
      set({
        settings: st,
        areas: loadedAreas,
        compass: { ...DEFAULT_COMPASS, ...compass },
        samples: samples ?? [],
        calm: calm ?? [],
        clips,
        reviews: Object.fromEntries(reviews.map((r) => [r.week, r])),
        daily: Object.fromEntries(daily.map((d) => [d.date, d])),
        folders,
        shifts: shifts ?? {},
        sheet: sheet ?? null,
        intents: intents ?? [],
        ready: true,
      });
      if (migrate) reclass('all');
      const hash = location.hash.replace('#/', '') as Route;
      if (['hoy', 'camara', 'evidencia', 'domingo', 'brujula', 'ajustes'].includes(hash)) set({ route: hash });
      // acceso directo del ícono (mantener presionado): "Grabo: Trading" → marca y vuelve a Hoy
      const fromShortcut = () => {
        const intent = location.hash.match(/^#\/grabo\/([a-z0-9_-]+)/i)?.[1];
        if (!intent) return;
        get().go('hoy');
        get().setIntent(intent);
      };
      fromShortcut();
      window.addEventListener('hashchange', fromShortcut);

      // recuperar grabaciones interrumpidas
      try {
        const orphans = await DB.pendingRecordings();
        for (const m of orphans) {
          const parts = await DB.recAssemble(m.id);
          const size = parts.reduce((s, b) => s + b.size, 0);
          if (size > 0) {
            const blob = new Blob(parts, { type: m.mime.split(';')[0] });
            await get().saveRecording(blob, m, 0, true);
            get().toast('Se recuperó una grabación interrumpida. Nada se perdió.', 'ok');
          }
          await DB.recFinish(m.id);
        }
      } catch {
        /* sin grabaciones pendientes */
      }
      enqueue(clips.filter((c) => c.status === 'pendiente').map((c) => c.id));
      // videos largos ya guardados o enlazados que aún no se revisaron por tramos
      enqueue(clips.filter((c) => c.status === 'listo' && needsTramos(c) && DB.isPersistent(c)).map((c) => c.id));
      try {
        if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
      } catch {
        /* nada */
      }
      get().refreshStorage();
      // sin pedir nada: carpetas y hoja de turnos con permiso vigente se actualizan solas
      get().syncAll(false);
    },

    go: (r) => {
      if (location.hash !== `#/${r}`) history.replaceState(null, '', `#/${r}`);
      if (r !== get().route) window.scrollTo({ top: 0 });
      set({ route: r });
    },

    toast: (text, kind = 'info') => {
      const id = uid('t');
      set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }));
      setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 6000 : 3800);
    },

    setSettings: (p) => {
      const settings = { ...get().settings, ...p };
      set({ settings });
      if (p.sound !== undefined) sound.setEnabled(p.sound);
      if (p.volume !== undefined) sound.setVolume(p.volume);
      if (p.haptics !== undefined) sound.haptics = p.haptics;
      DB.kvSet('settings', settings);
    },

    setAreas: (areas) => {
      set({ areas });
      DB.kvSet('areas', areas);
      reclass('all');
    },

    updateClip: (id, p) => {
      const c = get().clips.find((x) => x.id === id);
      if (!c) return;
      const next = { ...c, ...p };
      if (p.takenAt) next.week = weekKey(p.takenAt);
      set({ clips: get().clips.map((x) => (x.id === id ? next : x)) });
      persistClip(next);
      if (p.excluded !== undefined || p.speed !== undefined || p.lapse !== undefined) reclass(new Set([dayKey(next.takenAt)]));
    },

    assignArea: (id, areaId) => {
      const c = get().clips.find((x) => x.id === id);
      if (!c) return;
      const area = get().areas.find((a) => a.id === areaId);
      const next: Clip = {
        ...c,
        areaId,
        confidence: 1,
        areaBy: 'manual',
        excluded: false,
        kind: c.kindBy === 'auto' ? inferKind(c.duration, area) : c.kind,
      };
      set({ clips: get().clips.map((x) => (x.id === id ? next : x)) });
      persistClip(next);
      // la respuesta es un ancla: ordena a sus vecinos y afina las duraciones aprendidas
      reclass('all');
    },

    ignoreClip: (id) => {
      const c = get().clips.find((x) => x.id === id);
      if (!c) return;
      const next: Clip = { ...c, excluded: true, areaBy: 'manual', confidence: 1 };
      set({ clips: get().clips.map((x) => (x.id === id ? next : x)) });
      persistClip(next);
      reclass(new Set([dayKey(c.takenAt)]));
    },

    removeClip: async (id) => {
      const c = get().clips.find((x) => x.id === id);
      if (!c) return;
      // quitar el video original quita también sus tramos (comparten el archivo)
      const kids = c.parentId ? [] : get().clips.filter((x) => x.parentId === c.id);
      for (const k of kids) await DB.deleteClip(k, false);
      await DB.deleteClip(c, c.source === 'camara' || c.source === 'pantalla' || c.source === 'importado');
      const gone = new Set([id, ...kids.map((k) => k.id)]);
      set({ clips: get().clips.filter((x) => !gone.has(x.id)), clipModal: null });
      reclass(new Set([dayKey(c.takenAt)]));
      get().refreshStorage();
    },

    saveRecording: async (blob, meta, duration, recovered = false) => {
      const key = uid('m_');
      await DB.putMedia(key, blob);
      const area = get().areas.find((a) => a.id === meta.areaId);
      const clip: Clip = {
        id: uid('c_'),
        source: meta.source,
        blobKey: key,
        fingerprint: `rec|${meta.id}`,
        name: `${area?.name ?? 'Evidencia'} ${new Date(meta.startedAt).toLocaleString('es')}`,
        mime: blob.type,
        size: blob.size,
        takenAt: meta.startedAt,
        dateBy: 'grabacion',
        duration,
        width: meta.width,
        height: meta.height,
        areaId: meta.areaId,
        confidence: meta.areaId ? 1 : 0,
        areaBy: meta.areaId ? 'camara' : 'ninguno',
        kind: meta.kind,
        kindBy: meta.kindLocked ? 'manual' : 'auto',
        starred: meta.markers.length > 0,
        markers: meta.markers,
        excluded: false,
        week: weekKey(meta.startedAt),
        addedAt: Date.now(),
        status: 'pendiente',
        recovered,
      };
      upsertClips([clip]);
      enqueue([clip.id]);
      return clip;
    },

    importFiles: async (items) => {
      const created: Clip[] = [];
      const again: string[] = [];
      let skipped = 0;
      let relinked = 0;
      for (const it of items) {
        try {
          if (it instanceof File) {
            if (!VIDEO_EXT.test(it.name) && !it.type.startsWith('video/')) continue;
            // el video se lee desde la galería, sin copiarlo dentro de la app (no duplica espacio)
            const known = get().clips.find((c) => c.fingerprint === `${it.name}|${it.size}`);
            if (created.some((c) => c.fingerprint === `${it.name}|${it.size}`)) continue; // elegido dos veces
            if (known) {
              if (DB.isPersistent(known)) skipped++;
              else {
                DB.attachSession(known.id, it);
                relinked++;
                if (known.status !== 'listo' || needsTramos(known)) again.push(known.id);
              }
              continue;
            }
            const c = await newClipFromFile(it, { source: 'importado' });
            if (!c) continue;
            DB.attachSession(c.id, it);
            created.push(c);
          } else {
            const file = await it.getFile();
            if (!VIDEO_EXT.test(file.name)) continue;
            const key = uid('h_');
            const c = await newClipFromFile(file, { source: 'importado', handleKey: key });
            if (!c) {
              skipped++;
              continue;
            }
            await DB.putHandle(key, it);
            created.push(c);
          }
        } catch {
          /* archivo ilegible: se ignora */
        }
      }
      upsertClips(created);
      const stale = again.filter((id) => get().clips.find((c) => c.id === id)?.status !== 'listo');
      if (stale.length) upsertClips(stale.map((id) => ({ ...get().clips.find((c) => c.id === id)!, status: 'pendiente' as const })));
      enqueue([...created.map((c) => c.id), ...again]);
      if (created.length) get().toast(`Procesando ${created.length} ${created.length === 1 ? 'video' : 'videos'}…`, 'info');
      else if (relinked) get().toast(`${relinked} ${relinked === 1 ? 'video reconectado' : 'videos reconectados'}: ya puedes verlos aquí.`, 'ok');
      else if (skipped) get().toast('Esos videos ya estaban en tu Búnker.', 'info');
    },

    linkFolder: async () => {
      const w = window as Window & { showDirectoryPicker?: (o?: object) => Promise<FileSystemDirectoryHandle> };
      if (!w.showDirectoryPicker) {
        get().toast('Este navegador no permite vincular carpetas. Usa Chrome o Edge en el computador, o “Importar videos”.', 'error');
        return;
      }
      try {
        const handle = await w.showDirectoryPicker({ id: 'bunker-evidencia', mode: 'read' });
        const f: LinkedFolder = { id: uid('f_'), name: handle.name, handle, addedAt: Date.now() };
        await DB.putFolder(f);
        set({ folders: [...get().folders, f] });
        sound.play('pop');
        await get().scanFolder(f, true);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') get().toast('No se pudo vincular la carpeta.', 'error');
      }
    },

    scanFolder: async (f, interactive) => {
      if (!(await isGranted(f.handle, interactive))) return -1;
      const weeks = get().settings.importWeeks;
      const since = startOfDay(addDays(new Date(), -weeks * 7)).getTime();
      const known = new Set(get().clips.map((c) => c.fingerprint));
      const created: Clip[] = [];
      type Dir = FileSystemDirectoryHandle & { values(): AsyncIterable<FileSystemHandle> };
      const walk = async (dir: Dir, path: string, depth: number) => {
        for await (const h of dir.values()) {
          if (h.kind === 'directory') {
            if (depth < 3 && !h.name.startsWith('.')) await walk(h as Dir, `${path}${h.name}/`, depth + 1);
            continue;
          }
          if (!VIDEO_EXT.test(h.name)) continue;
          const fh = h as FileSystemFileHandle;
          const file = await fh.getFile();
          if (known.has(`${file.name}|${file.size}`)) continue;
          // filtro rápido: evitar recorrer años de galería
          if (file.lastModified < since) continue;
          const key = uid('h_');
          const c = await newClipFromFile(file, { source: 'carpeta', handleKey: key, folderId: f.id, relPath: path + file.name });
          if (!c || c.takenAt < since) continue;
          await DB.putHandle(key, fh);
          known.add(c.fingerprint);
          created.push(c);
        }
      };
      try {
        await walk(f.handle as Dir, '', 0);
      } catch {
        get().toast(`No se pudo leer la carpeta “${f.name}”.`, 'error');
      }
      const updated = { ...f, lastScan: Date.now(), found: (f.found ?? 0) + created.length };
      await DB.putFolder(updated);
      set({ folders: get().folders.map((x) => (x.id === f.id ? updated : x)) });
      upsertClips(created);
      enqueue(created.map((c) => c.id));
      if (interactive && !created.length) get().toast(`“${f.name}” está al día: no hay videos nuevos.`, 'info');
      else if (created.length) get().toast(`${created.length} videos nuevos en “${f.name}”.`, 'ok');
      return created.length;
    },

    scanAll: async (interactive) => {
      for (const f of get().folders) await get().scanFolder(f, interactive);
    },

    syncAll: async (interactive) => {
      await get().readSheet(interactive);
      await get().scanAll(interactive);
    },

    unlinkFolder: async (id) => {
      await DB.deleteFolder(id);
      set({ folders: get().folders.filter((f) => f.id !== id) });
    },

    // ---------------- turnos ----------------
    setShift: (day, s) => {
      const shifts = { ...get().shifts };
      if (s) shifts[day] = s;
      else delete shifts[day];
      saveShifts(shifts);
      reclass(new Set([day]));
    },

    linkSheet: async () => {
      const w = window as Window & { showOpenFilePicker?: (o?: object) => Promise<FileSystemFileHandle[]> };
      if (!w.showOpenFilePicker) return; // la interfaz usa un selector de archivo normal
      try {
        const [handle] = await w.showOpenFilePicker({
          id: 'bunker-horario',
          types: [
            {
              description: 'Hoja de horarios',
              accept: {
                'application/vnd.oasis.opendocument.spreadsheet': ['.ods'],
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
              },
            },
          ],
        });
        await get().importSheetFile(await handle.getFile(), handle);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') get().toast('No se pudo abrir la hoja de horarios.', 'error');
      }
    },

    importSheetFile: async (file, handle) => {
      const { settings } = get();
      const person = settings.scheduleName || settings.userName;
      let res: SheetResult;
      try {
        res = extractShifts(await readWorkbook(file), person, file.name);
      } catch {
        get().toast('Ese archivo no parece una hoja de cálculo (.ods o .xlsx).', 'error');
        return null;
      }
      const link: SheetLink = {
        name: file.name,
        handle: handle ?? get().sheet?.handle,
        lastRead: Date.now(),
        weeks: res.dated,
        people: res.people,
        error: res.blocks.length ? undefined : person ? 'sin-persona' : 'sin-nombre',
      };
      set({ sheet: link });
      DB.kvSet('sheet', link);
      if (!res.blocks.length) {
        get().toast(person ? `No encontré a “${person}” en la hoja. Elige tu nombre en Turnos.` : 'Dime cómo apareces en la hoja para leer tus turnos.', 'info');
        get().setTurnos(true);
        return res;
      }
      // las semanas sin fecha no se adivinan: podrían pisar turnos reales
      const fromSheet = blocksToShifts(res.blocks);
      const shifts = { ...get().shifts };
      const touched = new Set<string>();
      for (const [d, s] of Object.entries(fromSheet)) {
        if (shifts[d]?.src === 'manual') continue; // tu corrección manda
        shifts[d] = s;
        touched.add(d);
      }
      saveShifts(shifts);
      reclass(touched);
      const undated = res.blocks.length - res.dated;
      get().toast(
        res.dated
          ? `Turnos al día: ${res.dated} ${res.dated === 1 ? 'semana' : 'semanas'} de ${person}${undated ? ` (${undated} sin fecha reconocible, ignorada${undated === 1 ? '' : 's'})` : ''}.`
          : `Encontré tu fila pero no la fecha de la semana. Agrega en la hoja los números de los días o un título como “Semana del 5 al 11 de octubre”.`,
        'ok',
      );
      return res;
    },

    readSheet: async (interactive) => {
      const link = get().sheet;
      if (!link?.handle) return;
      try {
        if (!(await isGranted(link.handle, interactive))) return;
        const file = await link.handle.getFile();
        if (!interactive && link.lastRead && file.lastModified < link.lastRead) return; // sin cambios
        await get().importSheetFile(file, link.handle);
      } catch {
        if (interactive) get().toast('No se pudo leer la hoja de horarios vinculada.', 'error');
      }
    },

    unlinkSheet: () => {
      set({ sheet: null });
      DB.kvSet('sheet', null);
    },

    // ---------------- demo ----------------
    loadDemo: async () => {
      const areas = get().areas.filter((a) => a.active).sort((a, b) => a.order - b.order);
      await Promise.all(areas.map((a) => iconImage(a.icon, '#ffffff', 256)));
      const now = new Date();
      const thisWeek = weekKey(now);
      const clips: Clip[] = [];
      let seed = 7;
      const rnd = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };
      const durFor: Record<string, [number, number]> = {
        oracion: [420, 900], meditacion: [600, 1200], estiramiento: [420, 900], lectura: [900, 2100],
        ejercicio: [2100, 4200], trading: [150, 600], proyecto: [300, 1500], reflexion: [60, 160],
      };
      // turnos rotativos de ejemplo (entrada, salida, almuerzo) — null = descanso
      const PATTERNS: ([string, string, string?] | null)[][] = [
        [['13:00', '20:00'], ['10:00', '19:00', '12-1'], ['11:00', '20:00', '2-3'], null, ['14:00', '20:30'], ['10:00', '19:00', '12-1'], ['13:00', '19:00']],
        [['10:00', '19:00', '12-1'], ['13:00', '20:00'], null, ['11:00', '20:00', '2-3'], ['10:00', '18:30', '12-1'], ['13:00', '20:00'], ['14:00', '20:30']],
        [['11:00', '20:00', '2-3'], null, ['10:00', '19:00', '12-1'], ['13:00', '20:00'], ['14:00', '20:30'], ['10:00', '18:30', '12-1'], ['13:00', '19:00']],
      ];
      const shifts: Shifts = { ...get().shifts };
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = 320;
      thumbCanvas.height = 180;
      const tctx = thumbCanvas.getContext('2d')!;
      const add = (a: Area, ts: Date) => {
        if (ts.getTime() > now.getTime()) return;
        const [lo, hi] = durFor[a.id] ?? [300, 900];
        const duration = Math.round(lo + rnd() * (hi - lo));
        const c: Clip = {
          id: uid('demo_'), source: 'demo', fingerprint: uid('demo|'), name: `Demo ${a.name}`, mime: 'demo', size: 0,
          takenAt: ts.getTime(), dateBy: 'grabacion', duration, width: 1920, height: 1080, areaId: a.id, confidence: 0.9,
          areaBy: 'rutina', kind: inferKind(duration, a), kindBy: 'auto', starred: rnd() > 0.93, markers: [], excluded: false,
          week: weekKey(ts), addedAt: Date.now(), status: 'listo', demoSeed: Math.floor(rnd() * 1000),
        };
        if (a.id === 'trading' && rnd() > 0.5) c.markers = [Math.round(duration * 0.4)];
        tctx.setTransform(320 / FW, 0, 0, 320 / FW, 0, 0);
        drawDemo(tctx, c, a, duration * 0.3);
        c.thumb = makeThumb(thumbCanvas, 320);
        clips.push(c);
        return duration;
      };
      for (let w = 2; w >= 0; w--) {
        const ws = weekStart(thisWeek);
        for (let d = 0; d < 7; d++) {
          const day = addDays(ws, d - w * 7);
          if (day.getTime() > now.getTime()) continue;
          const p = PATTERNS[w][d];
          const key = dayKey(day);
          if (!shifts[key] || shifts[key].src === 'demo') {
            shifts[key] = p ? { start: p[0], end: p[1], lunch: p[2], off: false, src: 'demo' } : { start: '', end: '', off: true, src: 'demo' };
          }
          // los turnos tempranos recortan la rutina de la mañana (para que la demo muestre ese patrón)
          const early = p && parseHM(p[0]) < 12 * 60;
          const doProb = !p ? 0.85 : early ? 0.55 : 0.92;
          let t = !p ? 7 * 60 + 30 : parseHM(p[0]) - (early ? 210 : 330);
          for (const a of areas.filter((x) => x.moment === 'antes' || (x.moment === 'libre' && !early))) {
            if (rnd() > doProb + (a.id === 'ejercicio' ? (2 - w) * 0.08 - 0.1 : 0)) continue;
            const ts = new Date(day);
            ts.setHours(0, t + Math.floor(rnd() * 6), Math.floor(rnd() * 59), 0);
            const dur = add(a, ts) ?? 600;
            t += Math.round(dur / 60) + 4 + Math.floor(rnd() * 8);
          }
          let ta = p ? parseHM(p[1]) + 40 : 19 * 60;
          for (const a of areas.filter((x) => x.moment === 'despues' || (x.moment === 'libre' && early))) {
            if (rnd() > 0.7) continue;
            const ts = new Date(day);
            ts.setHours(0, ta + Math.floor(rnd() * 10), 0, 0);
            const dur = add(a, ts) ?? 300;
            ta += Math.round(dur / 60) + 10;
          }
        }
      }
      // unos clips dudosos para mostrar la bandeja "por confirmar"
      clips
        .filter((c) => c.week === thisWeek)
        .slice(-3)
        .forEach((c) => {
          c.confidence = 0.42;
          c.alts = [c.areaId!, ...areas.filter((a) => a.id !== c.areaId).slice(0, 3).map((a) => a.id)];
        });
      saveShifts(shifts);
      upsertClips(clips);
      sound.play('ready');
      get().toast(`Demo cargada: ${clips.length} evidencias y turnos rotativos de 3 semanas.`, 'ok');
    },

    clearDemo: async () => {
      await DB.wipeDemo();
      const shifts = Object.fromEntries(Object.entries(get().shifts).filter(([, s]) => s.src !== 'demo'));
      saveShifts(shifts);
      set({ clips: get().clips.filter((c) => c.source !== 'demo') });
      get().toast('Datos de demostración eliminados.', 'info');
    },

    saveReview: (week, p) => {
      const prev = get().reviews[week] as WeekReview | undefined;
      const r: WeekReview = { ...prev, ...p, week, answers: p.answers ?? prev?.answers ?? {} };
      set({ reviews: { ...get().reviews, [week]: r } });
      DB.putReview(r);
    },

    saveDaily: (date, p) => {
      const d: DailyLog = { ...get().daily[date], ...p, date };
      set({ daily: { ...get().daily, [date]: d } });
      DB.putDaily(d);
    },

    setCompass: (p) => {
      const c = { ...get().compass, ...p };
      set({ compass: c });
      DB.kvSet('compass', c);
    },

    addCalm: (l) => {
      const calm = [...get().calm, l].slice(-200);
      set({ calm });
      DB.kvSet('calm', calm);
    },

    setReviewWeek: (w) => set({ reviewWeek: w }),
    openFilm: (w) => set({ filmWeek: w }),
    openClip: (id) => set({ clipModal: id }),
    setCalm: (v) => set({ calmOpen: v }),
    setTurnos: (v) => set({ turnosOpen: v }),

    setIntent: (areaId) => {
      const area = get().areas.find((a) => a.id === areaId);
      if (!area) return;
      const intents = [...get().intents, { areaId, at: Date.now() }].slice(-300);
      set({ intents });
      DB.kvSet('intents', intents);
      sound.play('pop');
      get().toast(`Listo: tu próximo video será ${area.name}. Abre la cámara y graba.`, 'ok');
      reclass(new Set([dayKey(Date.now())]));
    },

    splitTramo: (id, at, thumb, sig) => {
      const c = get().clips.find((x) => x.id === id);
      if (!c) return;
      const span: [number, number] = c.span ?? [0, c.duration];
      if (at < span[0] + 5 || at > span[1] - 5) {
        get().toast('Elige un punto dentro del tramo (no tan cerca del borde).', 'info');
        return;
      }
      const root = c.parentId ? get().clips.find((x) => x.id === c.parentId) : c;
      if (!root) return;
      const k = tramosOf(get().clips, c).length + 1;
      const kid = tramoClip(root, { from: at, to: span[1], thumb, sig: sig ?? c.sig }, k);
      const left: Clip = { ...c, span: [span[0], at], duration: at - span[0], realDuration: undefined, analyzed: TRAMOS_V };
      upsertClips([left, kid]);
      sound.play('pop');
      reclass(new Set([dayKey(left.takenAt), dayKey(kid.takenAt)]));
      get().openClip(kid.id);
    },

    mergeTramo: async (id) => {
      const c = get().clips.find((x) => x.id === id);
      if (!c?.span) return;
      const list = tramosOf(get().clips, c);
      const i = list.findIndex((x) => x.id === id);
      // el primero (el original) absorbe al siguiente; los demás se unen al anterior
      const keep = i === 0 ? list[0] : list[i - 1];
      const drop = i === 0 ? list[1] : list[i];
      if (!keep || !drop || !keep.span || !drop.span) return;
      const merged: Clip = { ...keep, span: [keep.span[0], drop.span[1]], duration: drop.span[1] - keep.span[0], realDuration: undefined };
      await DB.deleteClip(drop, false);
      set({ clips: get().clips.filter((x) => x.id !== drop.id) });
      upsertClips([merged]);
      sound.play('tap');
      reclass(new Set([dayKey(merged.takenAt), dayKey(drop.takenAt)]));
      get().openClip(merged.id);
    },

    refreshStorage: async () => {
      try {
        const e = await navigator.storage.estimate();
        const persisted = (await navigator.storage.persisted?.()) ?? false;
        set({ storage: { usage: e.usage ?? 0, quota: e.quota ?? 0, persisted } });
      } catch {
        /* nada */
      }
    },
  };
});

export const needsConfirm = (c: Clip) =>
  c.status === 'listo' && !c.excluded && c.areaBy !== 'manual' && c.areaBy !== 'camara' && c.confidence < CONFIRM_THRESHOLD;
