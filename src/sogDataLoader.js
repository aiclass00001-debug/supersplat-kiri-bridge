/**
 * GS Bridge SOG / SuperSplat public scene data loader.
 *
 * Public SuperSplat CDN resolution pattern is based on interoperability research:
 * https://github.com/buildoak/tortuise
 *
 * SOG decoding follows the public PlayCanvas SOG structure:
 * meta.json + means_l.webp + means_u.webp + sh0.webp (+ other textures not needed
 * for the KIRI particle renderer).
 */

const SUPERSPLOT_CDN = 'https://d28zzqy0iyovbz.cloudfront.net';
const SH_C0 = 0.28209479177387814;

export function extractSuperSplatSceneId(raw) {
  const value = String(raw || '').trim();
  if (/^[0-9a-fA-F]{8}$/.test(value)) return value.toLowerCase();

  try {
    const u = new URL(value);
    const m = u.pathname.match(/\/scene\/([0-9a-fA-F]{8})/);
    if (m) return m[1].toLowerCase();
    const id = u.searchParams.get('id');
    if (id && /^[0-9a-fA-F]{8}$/.test(id)) return id.toLowerCase();
  } catch (_) {}

  return null;
}

export async function resolveSuperSplatScene(raw, onStatus = () => {}) {
  const id = extractSuperSplatSceneId(raw);
  if (!id) throw new Error('找不到有效的 SuperSplat Scene ID');

  // Newer public scenes: unbundled SOG at v1..v10.
  for (let version = 1; version <= 10; version++) {
    const metaUrl = `${SUPERSPLOT_CDN}/${id}/v${version}/meta.json`;
    onStatus(`解析 SuperSplat：嘗試 v${version}…`);
    try {
      const response = await fetch(metaUrl, { cache: 'no-store' });
      if (response.ok) {
        const meta = await response.json();
        if (meta && Number(meta.count) > 0 && meta.means && meta.sh0) {
          return {
            kind: 'meta',
            sceneId: id,
            version,
            viewerUrl: metaUrl,
            particleUrl: metaUrl,
            meta
          };
        }
      }
    } catch (_) {}
  }

  // Legacy public scenes: viewer can load compressed PLY directly.
  return {
    kind: 'compressed-ply',
    sceneId: id,
    version: 1,
    viewerUrl: `${SUPERSPLOT_CDN}/${id}/v1/scene.compressed.ply`,
    particleUrl: null,
    meta: null
  };
}

function invLogTransform(v) {
  return Math.sign(v) * (Math.exp(Math.abs(v)) - 1.0);
}

async function imageBytesToRgba(bytes, mime = 'image/webp') {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: mime });
  const bitmap = await createImageBitmap(blob);

  let canvas;
  let ctx;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    ctx = canvas.getContext('2d', { willReadFrequently: true });
  } else {
    canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    ctx = canvas.getContext('2d', { willReadFrequently: true });
  }
  if (!ctx) throw new Error('無法建立影像解碼 Canvas');

  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
  bitmap.close?.();
  return data;
}

async function fetchRgba(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`載入失敗：${url} (${r.status})`);
  return imageBytesToRgba(await r.blob());
}

function getFiles(meta, key, minCount = 1) {
  const files = meta?.[key]?.files;
  if (!Array.isArray(files) || files.length < minCount) {
    throw new Error(`SOG meta 缺少 ${key}.files`);
  }
  return files;
}

function joinRelative(baseUrl, file) {
  return new URL(file, baseUrl).toString();
}

async function decodeMetaFromRemote(metaUrl, suppliedMeta = null) {
  const meta = suppliedMeta || await (await fetch(metaUrl)).json();
  const meansFiles = getFiles(meta, 'means', 2);
  const sh0Files = getFiles(meta, 'sh0', 1);

  const [meansLo, meansHi, sh0] = await Promise.all([
    fetchRgba(joinRelative(metaUrl, meansFiles[0])),
    fetchRgba(joinRelative(metaUrl, meansFiles[1])),
    fetchRgba(joinRelative(metaUrl, sh0Files[0]))
  ]);

  return decodeCore(meta, meansLo, meansHi, sh0);
}

async function loadFflate() {
  return import('https://esm.sh/fflate@0.8.2?bundle');
}

async function decodeBundledSog(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`SOG 載入失敗 (${r.status})`);
  const bytes = new Uint8Array(await r.arrayBuffer());

  const { unzipSync } = await loadFflate();
  const files = unzipSync(bytes);
  const metaEntry = files['meta.json'];
  if (!metaEntry) throw new Error('SOG 內找不到 meta.json');

  const meta = JSON.parse(new TextDecoder().decode(metaEntry));
  const meansFiles = getFiles(meta, 'means', 2);
  const sh0Files = getFiles(meta, 'sh0', 1);

  const pick = (name) => {
    const entry = files[name];
    if (!entry) throw new Error(`SOG 內找不到 ${name}`);
    return entry;
  };

  const [meansLo, meansHi, sh0] = await Promise.all([
    imageBytesToRgba(pick(meansFiles[0])),
    imageBytesToRgba(pick(meansFiles[1])),
    imageBytesToRgba(pick(sh0Files[0]))
  ]);

  return decodeCore(meta, meansLo, meansHi, sh0);
}

function decodeCore(meta, meansLo, meansHi, sh0) {
  const count = Number(meta.count) || 0;
  if (!count) throw new Error('SOG meta.count 無效');

  const mins = meta.means?.mins;
  const maxs = meta.means?.maxs;
  const shCodebook = meta.sh0?.codebook;

  if (!Array.isArray(mins) || !Array.isArray(maxs) || mins.length !== 3 || maxs.length !== 3) {
    throw new Error('SOG means 範圍資料無效');
  }
  if (!Array.isArray(shCodebook) || shCodebook.length < 256) {
    throw new Error('SOG sh0 codebook 無效');
  }

  const available = Math.min(
    count,
    Math.floor(meansLo.length / 4),
    Math.floor(meansHi.length / 4),
    Math.floor(sh0.length / 4)
  );

  // KIRI particle layer does not need every Gaussian. Cap for stable browser performance.
  const maxParticles = 300000;
  const outCount = Math.min(available, maxParticles);
  const step = available / outCount;

  const positions = new Float32Array(outCount * 3);
  const colors = new Float32Array(outCount * 3);

  const range = [
    maxs[0] - mins[0] || 1,
    maxs[1] - mins[1] || 1,
    maxs[2] - mins[2] || 1
  ];

  for (let n = 0; n < outCount; n++) {
    const i = Math.min(available - 1, Math.floor(n * step));
    const p = i * 4;

    const qx = meansLo[p] | (meansHi[p] << 8);
    const qy = meansLo[p + 1] | (meansHi[p + 1] << 8);
    const qz = meansLo[p + 2] | (meansHi[p + 2] << 8);

    const lx = mins[0] + range[0] * (qx / 65535);
    const ly = mins[1] + range[1] * (qy / 65535);
    const lz = mins[2] + range[2] * (qz / 65535);

    positions[n * 3] = invLogTransform(lx);
    positions[n * 3 + 1] = invLogTransform(ly);
    positions[n * 3 + 2] = invLogTransform(lz);

    const f0 = shCodebook[sh0[p]];
    const f1 = shCodebook[sh0[p + 1]];
    const f2 = shCodebook[sh0[p + 2]];

    colors[n * 3] = Math.max(0, Math.min(1, 0.5 + SH_C0 * f0));
    colors[n * 3 + 1] = Math.max(0, Math.min(1, 0.5 + SH_C0 * f1));
    colors[n * 3 + 2] = Math.max(0, Math.min(1, 0.5 + SH_C0 * f2));
  }

  return { positions, colors, count: outCount, sourceCount: available };
}

export async function loadParticleData(url, suppliedMeta = null) {
  const clean = String(url || '').split(/[?#]/)[0].toLowerCase();
  if (clean.endsWith('.sog')) return decodeBundledSog(url);
  if (clean.endsWith('.json')) return decodeMetaFromRemote(url, suppliedMeta);
  throw new Error('粒子模式目前支援 SOG / meta.json；Compressed PLY 先維持實景模式');
}

export const __decodeCoreForTest = decodeCore;
