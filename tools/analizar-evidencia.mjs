#!/usr/bin/env node
// Analiza una carpeta de evidencia (p. ej. "Día 001", "Día 002"…) sin modificar nada:
// tamaño por día, duración, resolución, códec, time-lapse (sin audio / fps de captura),
// de dónde sale la fecha y cuánto dura el espacio libre del disco a tu ritmo actual.
// Uso:  npm run analizar -- "C:\Users\SEBASTIAN\Videos\Bunker"   (añade --json para salida completa)
import { promises as fs, statfsSync } from 'node:fs';
import path from 'node:path';

const VIDEO = /\.(mp4|mov|m4v|3gp|webm|mkv|avi)$/i;
const root = process.argv.slice(2).find((a) => !a.startsWith('--'));
const asJson = process.argv.includes('--json');
if (!root) {
  console.error('Uso: npm run analizar -- "RUTA\\DE\\LA\\CARPETA"');
  process.exit(1);
}

// ---------------- lectura MP4/MOV (solo cabeceras) ----------------
async function readAt(fh, pos, len) {
  const buf = Buffer.alloc(len);
  const { bytesRead } = await fh.read(buf, 0, len, pos);
  return buf.subarray(0, bytesRead);
}

async function mp4Meta(file, size) {
  const fh = await fs.open(file, 'r');
  try {
    let off = 0;
    let moov = null;
    for (let i = 0; i < 100 && off + 8 <= size; i++) {
      const h = await readAt(fh, off, 16);
      if (h.length < 8) break;
      let bsize = h.readUInt32BE(0);
      const type = h.toString('latin1', 4, 8);
      let hdr = 8;
      if (bsize === 1) {
        bsize = Number(h.readBigUInt64BE(8));
        hdr = 16;
      } else if (bsize === 0) bsize = size - off;
      if (bsize < 8) break;
      if (type === 'moov') {
        moov = await readAt(fh, off + hdr, Math.min(bsize - hdr, 48_000_000));
        break;
      }
      off += bsize;
    }
    if (!moov) return null;
    const out = { duration: 0, created: null, hasAudio: false, codec: null, width: 0, height: 0, fps: null, captureFps: null };
    let keys = [];
    const CONT = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'udta', 'edts']);
    const walk = (b, start, end, track) => {
      let p = start;
      while (p + 8 <= end) {
        let s = b.readUInt32BE(p);
        const t = b.toString('latin1', p + 4, p + 8);
        let hd = 8;
        if (s === 1) {
          s = Number(b.readBigUInt64BE(p + 8));
          hd = 16;
        } else if (s === 0) s = end - p;
        if (s < 8) break;
        const body = p + hd;
        const be = Math.min(end, p + s);
        if (t === 'mvhd') {
          const v = b.readUInt8(body);
          const created = v === 1 ? Number(b.readBigUInt64BE(body + 4)) : b.readUInt32BE(body + 4);
          const ts = v === 1 ? b.readUInt32BE(body + 20) : b.readUInt32BE(body + 12);
          const dur = v === 1 ? Number(b.readBigUInt64BE(body + 24)) : b.readUInt32BE(body + 16);
          if (ts) out.duration = dur / ts;
          if (created > 0) out.created = new Date((created - 2082844800) * 1000);
        } else if (t === 'trak') {
          const tr = {};
          walk(b, body, be, tr);
          if (tr.handler === 'soun') out.hasAudio = true;
          if (tr.handler === 'vide') {
            out.codec = tr.codec ?? out.codec;
            if (tr.w) [out.width, out.height] = [tr.w, tr.h];
            if (tr.timescale && tr.mdur && tr.samples) out.fps = tr.samples / (tr.mdur / tr.timescale);
          }
        } else if (CONT.has(t)) walk(b, body, be, track);
        else if (t === 'tkhd' && track) {
          track.w = Math.round(b.readUInt32BE(be - 8) / 65536);
          track.h = Math.round(b.readUInt32BE(be - 4) / 65536);
        } else if (t === 'hdlr' && track) track.handler = b.toString('latin1', body + 8, body + 12);
        else if (t === 'mdhd' && track) {
          const v = b.readUInt8(body);
          track.timescale = b.readUInt32BE(body + (v === 1 ? 20 : 12));
          track.mdur = v === 1 ? Number(b.readBigUInt64BE(body + 24)) : b.readUInt32BE(body + 16);
        } else if (t === 'stsz' && track) track.samples = b.readUInt32BE(body + 8);
        else if (t === 'stsd' && track) track.codec = b.toString('latin1', body + 12, body + 16);
        else if (t === 'meta') walk(b, b.toString('latin1', body + 4, body + 8) === 'hdlr' ? body : body + 4, be, null);
        else if (t === 'keys') {
          const n = b.readUInt32BE(body + 4);
          let q = body + 8;
          keys = [];
          for (let k = 0; k < n && q + 8 <= be; k++) {
            const ks = b.readUInt32BE(q);
            keys.push(b.toString('latin1', q + 8, q + ks));
            q += ks;
          }
        } else if (t === 'ilst') {
          let q = body;
          while (q + 8 <= be) {
            const is = b.readUInt32BE(q);
            if (is < 8) break;
            const idx = b.readUInt32BE(q + 4);
            if (keys[idx - 1] === 'com.android.capture.fps' && b.toString('latin1', q + 12, q + 16) === 'data') {
              const dt = b.readUInt32BE(q + 16) & 0xffffff;
              const v = dt === 23 ? b.readFloatBE(q + 24) : dt === 24 ? b.readDoubleBE(q + 24) : NaN;
              if (v > 0) out.captureFps = v;
            }
            q += is;
          }
        }
        p += s;
      }
    };
    walk(moov, 0, moov.length, null);
    return out;
  } finally {
    await fh.close();
  }
}

// misma lógica que la app para leer fechas de nombres
function dateFromName(name) {
  const m = name.match(/(20\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])[-_ T.]{0,3}([01]\d|2[0-3])[-_.:h]?([0-5]\d)[-_.:m]?([0-5]\d)/);
  if (m) {
    const [, y, mo, d, h, mi, s] = m.map(Number);
    return /^PXL_/i.test(name) ? new Date(Date.UTC(y, mo - 1, d, h, mi, s)) : new Date(y, mo - 1, d, h, mi, s);
  }
  const dOnly = name.match(/(20\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])/);
  return dOnly ? new Date(+dOnly[1], +dOnly[2] - 1, +dOnly[3], 12) : null;
}

async function walkDir(dir, depth = 0, acc = []) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && depth < 4 && !e.name.startsWith('.')) await walkDir(p, depth + 1, acc);
    else if (e.isFile() && VIDEO.test(e.name)) acc.push(p);
  }
  return acc;
}

const gb = (n) => (n / 1024 ** 3).toFixed(2);
const mins = (s) => (s / 60).toFixed(1);

const files = await walkDir(root);
const rows = [];
for (const f of files) {
  const st = await fs.stat(f);
  const name = path.basename(f);
  const folder = path.relative(root, path.dirname(f)) || '.';
  let meta = null;
  if (/\.(mp4|mov|m4v|3gp)$/i.test(name)) meta = await mp4Meta(f, st.size).catch(() => null);
  const byName = dateFromName(name);
  const validMeta = meta?.created && meta.created.getFullYear() >= 2015 && meta.created <= new Date(Date.now() + 864e5);
  const date = byName ?? (validMeta ? meta.created : st.mtime);
  const lapse = !!meta && (meta.captureFps > 0 || (meta.hasAudio === false && !/-WA\d+/i.test(name)));
  const speed = meta?.captureFps ? Math.round((meta.fps && meta.fps > 5 ? meta.fps : 30) / meta.captureFps) : null;
  rows.push({
    folder,
    name,
    sizeBytes: st.size,
    durationSec: meta?.duration ?? null,
    mbPerMin: meta?.duration ? st.size / 1024 ** 2 / (meta.duration / 60) : null,
    width: meta?.width ?? null,
    height: meta?.height ?? null,
    res: meta?.width && meta?.height ? Math.min(meta.width, meta.height) : null,
    codec: meta?.codec ?? path.extname(name).slice(1),
    fps: meta?.fps ? Math.round(meta.fps) : null,
    audio: meta ? meta.hasAudio : null,
    lapse,
    speed,
    date: date.toISOString(),
    dateFrom: byName ? 'nombre' : validMeta ? 'metadatos' : 'fecha del archivo',
  });
}

if (asJson) {
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

// ---------------- resumen ----------------
const total = rows.reduce((s, r) => s + r.sizeBytes, 0);
const totalDur = rows.reduce((s, r) => s + (r.durationSec ?? 0), 0);
const byFolder = new Map();
for (const r of rows) {
  const f = byFolder.get(r.folder) ?? { n: 0, size: 0, dur: 0, lapse: 0 };
  f.n++;
  f.size += r.sizeBytes;
  f.dur += r.durationSec ?? 0;
  f.lapse += r.lapse ? 1 : 0;
  byFolder.set(r.folder, f);
}
const days = new Set(rows.map((r) => r.date.slice(0, 10))).size || 1;
const count = (k) => Object.entries(rows.reduce((m, r) => ((m[r[k]] = (m[r[k]] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);

console.log(`\nBÚNKER · análisis de evidencia\nCarpeta: ${root}\n`);
console.log(`Videos: ${rows.length} · ${gb(total)} GB · ${mins(totalDur)} min de archivo · ${days} días con fecha distinta`);
console.log(`Promedio: ${gb(total / days)} GB por día · ${(total / 1024 ** 2 / Math.max(1, totalDur / 60)).toFixed(0)} MB por minuto de video\n`);
console.log('Por carpeta:');
for (const [f, v] of [...byFolder.entries()].sort()) console.log(`  ${f.padEnd(22)} ${String(v.n).padStart(3)} videos  ${gb(v.size).padStart(6)} GB  ${mins(v.dur).padStart(6)} min  ${v.lapse ? `${v.lapse} time-lapse` : ''}`);
console.log('\nResolución:', count('res').map(([h, n]) => `${h}p×${n}`).join('  '));
console.log('Códec:', count('codec').map(([c, n]) => `${c}×${n}`).join('  '), '  (avc1 = H.264, hvc1/hev1 = H.265)');
console.log('Fecha leída de:', count('dateFrom').map(([c, n]) => `${c}×${n}`).join('  '));
console.log('Time-lapse detectados:', rows.filter((r) => r.lapse).length, '· con velocidad exacta en metadatos:', rows.filter((r) => r.speed).length);
try {
  const s = statfsSync(root);
  const free = s.bavail * s.bsize;
  const perDay = total / days;
  console.log(`\nEspacio libre en ese disco: ${gb(free)} GB → a tu ritmo actual alcanza para ~${Math.floor(free / perDay)} días (${(free / perDay / 30).toFixed(1)} meses).`);
} catch {
  /* sin datos del disco */
}
console.log('');
