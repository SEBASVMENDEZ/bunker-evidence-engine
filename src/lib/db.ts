// Persistencia local (IndexedDB). Nada sale del dispositivo.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Clip, DailyLog, LinkedFolder, WeekReview } from './types';

export interface RecordingMeta {
  id: string;
  startedAt: number;
  mime: string;
  areaId: string | null;
  kind: Clip['kind'];
  kindLocked?: boolean;
  source: 'camara' | 'pantalla';
  markers: number[];
  width: number;
  height: number;
}

interface BunkerDB extends DBSchema {
  clips: { key: string; value: Clip; indexes: { week: string; fingerprint: string } };
  media: { key: string; value: Blob };
  handles: { key: string; value: FileSystemFileHandle };
  folders: { key: string; value: LinkedFolder };
  reviews: { key: string; value: WeekReview };
  daily: { key: string; value: DailyLog };
  kv: { key: string; value: unknown };
  recs: { key: string; value: RecordingMeta };
  chunks: { key: [string, number]; value: { rec: string; seq: number; blob: Blob }; indexes: { rec: string } };
}

let dbp: Promise<IDBPDatabase<BunkerDB>> | null = null;

export function db() {
  if (!dbp) {
    dbp = openDB<BunkerDB>('bunker-evidence', 1, {
      upgrade(d) {
        const clips = d.createObjectStore('clips', { keyPath: 'id' });
        clips.createIndex('week', 'week');
        clips.createIndex('fingerprint', 'fingerprint');
        d.createObjectStore('media');
        d.createObjectStore('handles');
        d.createObjectStore('folders', { keyPath: 'id' });
        d.createObjectStore('reviews', { keyPath: 'week' });
        d.createObjectStore('daily', { keyPath: 'date' });
        d.createObjectStore('kv');
        d.createObjectStore('recs', { keyPath: 'id' });
        const chunks = d.createObjectStore('chunks', { keyPath: ['rec', 'seq'] });
        chunks.createIndex('rec', 'rec');
      },
    });
  }
  return dbp;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get('kv', key)) as T | undefined;
}

export async function kvSet(key: string, value: unknown) {
  await (await db()).put('kv', value, key);
}

export async function allClips(): Promise<Clip[]> {
  return (await db()).getAll('clips');
}

export async function putClip(c: Clip) {
  await (await db()).put('clips', c);
}

export async function putClips(cs: Clip[]) {
  const d = await db();
  const tx = d.transaction('clips', 'readwrite');
  await Promise.all([...cs.map((c) => tx.store.put(c)), tx.done]);
}

export async function deleteClip(c: Clip, deleteOwnMedia: boolean) {
  const d = await db();
  await d.delete('clips', c.id);
  if (c.handleKey) await d.delete('handles', c.handleKey);
  if (deleteOwnMedia && c.blobKey) await d.delete('media', c.blobKey);
  for (let i = 0; i < 4; i++) await d.delete('media', posterKey(c.id, i));
  session.delete(c.id);
}

// ---- Videos elegidos de la galería: se leen sin copiarlos ----
// Un archivo elegido con "Importar" vive mientras la app esté abierta; al volver a elegirlo se reconecta.
const session = new Map<string, Blob>();
export const attachSession = (clipId: string, file: Blob) => session.set(clipId, file);
/** ¿El video original queda guardado o enlazado de forma permanente? */
export const isPersistent = (c: Clip) => !!(c.blobKey || c.handleKey) || c.source === 'demo';

// ---- Vista previa: unos cuadros del clip para la película cuando el video no está a mano ----
const posterKey = (clipId: string, i: number) => `p_${clipId}_${i}`;
export async function putPosters(clipId: string, frames: Blob[]) {
  const d = await db();
  const tx = d.transaction('media', 'readwrite');
  await Promise.all([...frames.map((b, i) => tx.store.put(b, posterKey(clipId, i))), tx.done]);
}
export async function getPosters(clipId: string): Promise<Blob[]> {
  const d = await db();
  const out: Blob[] = [];
  for (let i = 0; i < 4; i++) {
    const b = await d.get('media', posterKey(clipId, i));
    if (!b) break;
    out.push(b);
  }
  return out;
}

export async function putMedia(key: string, blob: Blob) {
  await (await db()).put('media', blob, key);
}

export async function putHandle(key: string, h: FileSystemFileHandle) {
  await (await db()).put('handles', h, key);
}

export async function allReviews(): Promise<WeekReview[]> {
  return (await db()).getAll('reviews');
}

export async function putReview(r: WeekReview) {
  await (await db()).put('reviews', r);
}

export async function allDaily(): Promise<DailyLog[]> {
  return (await db()).getAll('daily');
}

export async function putDaily(l: DailyLog) {
  await (await db()).put('daily', l);
}

export async function allFolders(): Promise<LinkedFolder[]> {
  return (await db()).getAll('folders');
}

export async function putFolder(f: LinkedFolder) {
  await (await db()).put('folders', f);
}

export async function deleteFolder(id: string) {
  await (await db()).delete('folders', id);
}

/** Obtiene el archivo de un clip, venga de una grabación propia o de un archivo original enlazado. */
export async function clipFile(c: Clip, askPermission = false): Promise<Blob | null> {
  // un tramo comparte el archivo del video del que salió
  if (c.parentId) {
    const parent = await (await db()).get('clips', c.parentId);
    return parent ? clipFile(parent, askPermission) : null;
  }
  const s = session.get(c.id);
  if (s) return s;
  const d = await db();
  if (c.blobKey) return (await d.get('media', c.blobKey)) ?? null;
  if (c.handleKey) {
    const h = await d.get('handles', c.handleKey);
    if (!h) return null;
    try {
      const anyH = h as FileSystemFileHandle & {
        queryPermission?: (o: object) => Promise<PermissionState>;
        requestPermission?: (o: object) => Promise<PermissionState>;
      };
      if (anyH.queryPermission) {
        let p = await anyH.queryPermission({ mode: 'read' });
        if (p !== 'granted' && askPermission && anyH.requestPermission) p = await anyH.requestPermission({ mode: 'read' });
        if (p !== 'granted') return null;
      }
      return await h.getFile();
    } catch {
      return null;
    }
  }
  return null;
}

// ---- Grabación segura: cada segundo se guarda un fragmento ----
export async function recBegin(meta: RecordingMeta) {
  await (await db()).put('recs', meta);
}

export async function recUpdate(meta: RecordingMeta) {
  await (await db()).put('recs', meta);
}

export async function recChunk(rec: string, seq: number, blob: Blob) {
  await (await db()).put('chunks', { rec, seq, blob });
}

export async function recAssemble(rec: string): Promise<Blob[]> {
  const d = await db();
  const rows = await d.getAllFromIndex('chunks', 'rec', rec);
  rows.sort((a, b) => a.seq - b.seq);
  return rows.map((r) => r.blob);
}

export async function recFinish(rec: string) {
  const d = await db();
  const tx = d.transaction(['chunks', 'recs'], 'readwrite');
  const keys = await tx.objectStore('chunks').index('rec').getAllKeys(rec);
  await Promise.all([...keys.map((k) => tx.objectStore('chunks').delete(k)), tx.objectStore('recs').delete(rec), tx.done]);
}

export async function pendingRecordings(): Promise<RecordingMeta[]> {
  return (await db()).getAll('recs');
}

export async function wipeDemo() {
  const d = await db();
  const all = await d.getAll('clips');
  const tx = d.transaction('clips', 'readwrite');
  await Promise.all([...all.filter((c) => c.source === 'demo').map((c) => tx.store.delete(c.id)), tx.done]);
}
