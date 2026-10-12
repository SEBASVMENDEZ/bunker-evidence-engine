// Respaldo completo: todo lo que Búnker sabe de ti en UN archivo — configuración, rutina, turnos,
// ruta, aprendizajes, revisiones, experimentos y las huellas (cuadros + tu voz). Si cambias de
// teléfono o se borran los datos del navegador, lo restauras y sigues donde ibas.
// (Tu maestro lo señaló como la mejora técnica más importante: cuanto más útil el historial, más
// vale protegerlo.)
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { db } from './db';
import type { Clip, DailyLog, WeekReview } from './types';

const APP = 'bunker-respaldo';
const VERSION = 2;

interface BackupData {
  app: string;
  version: number;
  exportedAt: string;
  kv: Record<string, unknown>;
  clips: Clip[];
  reviews: WeekReview[];
  daily: DailyLog[];
  media: { key: string; file: string; type: string }[];
}

/** Arma el archivo. Sin `withRecordings`, deja fuera los videos grabados dentro de la app (pesan mucho). */
export async function makeBackup(opts: { withRecordings: boolean }): Promise<{ file: File; media: number }> {
  const d = await db();
  const kv: Record<string, unknown> = {};
  for (const k of await d.getAllKeys('kv')) kv[String(k)] = await d.get('kv', k);
  const files: Zippable = {};
  const media: BackupData['media'] = [];
  let i = 0;
  for (const k of await d.getAllKeys('media')) {
    const key = String(k);
    if (!opts.withRecordings && key.startsWith('m_')) continue;
    const b = await d.get('media', key);
    if (!b) continue;
    const file = `media/${String(++i).padStart(5, '0')}`;
    files[file] = [new Uint8Array(await b.arrayBuffer()), { level: 0 }]; // jpg/wav/webm ya vienen comprimidos
    media.push({ key, file, type: b.type });
  }
  const data: BackupData = {
    app: APP,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    kv,
    clips: (await d.getAll('clips')).filter((c) => c.source !== 'demo'),
    reviews: await d.getAll('reviews'),
    daily: await d.getAll('daily'),
    media,
  };
  files['bunker.json'] = [strToU8(JSON.stringify(data)), { level: 6 }];
  const zipped = zipSync(files);
  return { file: new File([zipped], `bunker-respaldo-${new Date().toISOString().slice(0, 10)}.zip`, { type: 'application/zip' }), media: media.length };
}

/** Restaura un respaldo (.zip completo o el .json antiguo). Lo existente con el mismo id se reemplaza. */
export async function restoreBackup(f: File): Promise<void> {
  const d = await db();
  if (/\.json$/i.test(f.name)) {
    // respaldo antiguo: sin huellas
    const old = JSON.parse(await f.text());
    if (old.app !== 'bunker-evidence-engine') throw new Error('formato');
    for (const k of ['settings', 'areas', 'compass', 'samples', 'calm'] as const) if (old[k] !== undefined) await d.put('kv', old[k], k);
    for (const r of old.reviews ?? []) await d.put('reviews', r);
    for (const x of old.daily ?? []) await d.put('daily', x);
    for (const c of old.clips ?? []) await d.put('clips', c);
    return;
  }
  const z = unzipSync(new Uint8Array(await f.arrayBuffer()));
  if (!z['bunker.json']) throw new Error('formato');
  const data = JSON.parse(strFromU8(z['bunker.json'])) as BackupData;
  if (data.app !== APP) throw new Error('formato');
  for (const [k, v] of Object.entries(data.kv ?? {})) await d.put('kv', v, k);
  for (const c of data.clips ?? []) await d.put('clips', c);
  for (const r of data.reviews ?? []) await d.put('reviews', r);
  for (const x of data.daily ?? []) await d.put('daily', x);
  for (const m of data.media ?? []) {
    const bytes = z[m.file];
    if (bytes) await d.put('media', new Blob([bytes], { type: m.type }), m.key);
  }
}

/** En el celular abre "Compartir" (guárdalo en Drive o en Archivos); en el computador lo descarga. */
export async function deliverBackup(file: File): Promise<'compartido' | 'descargado'> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  if (coarse && nav.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'Respaldo de Búnker' });
    return 'compartido';
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  return 'descargado';
}
