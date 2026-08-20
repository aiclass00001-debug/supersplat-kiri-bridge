const TEST_SCENE = 'https://superspl.at/scene/11d081f5';

const $ = s => document.querySelector(s);
const tabs = [...document.querySelectorAll('.tab')];
const scenePane = $('#scenePane');
const assetPane = $('#assetPane');
const sceneInput = $('#sceneInput');
const assetInput = $('#assetInput');
const frame = $('#viewer');
const placeholder = $('#placeholder');
const status = $('#status');
const overlay = $('#overlay');
const runtimeLabel = $('#runtimeLabel');
const sourceLabel = $('#sourceLabel');
const footerMode = $('#footerMode');
const fullscreenBtn = $('#fullscreen');
const copyLinkBtn = $('#copyLink');
const toastEl = $('#toast');

let mode = 'scene';
let active = null;

function notify(text) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(notify.t);
  notify.t = setTimeout(() => toastEl.classList.remove('show'), 1800);
}

function setStatus(text, ok=false) {
  status.textContent = text;
  status.parentElement.classList.toggle('ok', ok);
}

function setMode(next) {
  mode = next;
  tabs.forEach(t => t.classList.toggle('active', t.dataset.mode === next));
  scenePane.classList.toggle('hidden', next !== 'scene');
  assetPane.classList.toggle('hidden', next !== 'asset');
}

function sceneId(raw) {
  const text = String(raw || '').trim();
  if (/^[A-Za-z0-9_-]{4,100}$/.test(text)) return text;
  let u;
  try { u = new URL(text); } catch { throw new Error('Scene URL 無效'); }
  if (u.hostname.replace(/^www\./,'') !== 'superspl.at') throw new Error('不是 superspl.at 網址');
  const m = u.pathname.match(/^\/scene\/([A-Za-z0-9_-]{4,100})/);
  if (m) return m[1];
  if (u.pathname === '/s' && u.searchParams.get('id')) return u.searchParams.get('id');
  throw new Error('找不到 Scene ID');
}

function validateAsset(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { throw new Error('Asset URL 無效'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('只支援 http/https');
  const p = u.pathname.toLowerCase();
  const supported = p.endsWith('.sog') || p.endsWith('.lod-meta.json') ||
    p.endsWith('.meta.json') || p.endsWith('.ply') || p.endsWith('.compressed.ply');
  if (!supported) throw new Error('格式需為 SOG / LOD JSON / PLY');
  return u.toString();
}

function viewerOptions() {
  const q = new URLSearchParams();
  if ($('#noui').checked) q.set('noui','');
  if ($('#ministats').checked) q.set('ministats','');
  if ($('#noanim').checked) q.set('noanim','');
  return q;
}

function activate(src, runtime, label, share) {
  active = { src, runtime, label, share };
  setStatus('LOADING');
  placeholder.classList.add('hidden');
  frame.classList.add('active');
  frame.src = src;
  runtimeLabel.textContent = runtime;
  sourceLabel.textContent = label;
  footerMode.textContent = runtime;
  fullscreenBtn.disabled = false;
  copyLinkBtn.disabled = false;
}

function loadPublished(value) {
  try {
    const id = sceneId(value);
    const q = viewerOptions();
    q.set('id', id);
    const src = `https://superspl.at/s?${q.toString()}`;
    const share = new URL(location.href);
    share.search = '';
    share.searchParams.set('scene', id);
    activate(src, 'HOSTED SUPER SPLAT', `scene/${id}`, share.toString());
    sceneInput.value = `https://superspl.at/scene/${id}`;
  } catch (e) { notify(e.message); setStatus('ERROR'); }
}

function loadDirect(value) {
  try {
    const asset = validateAsset(value);
    const q = viewerOptions();
    q.set('content', asset);
    const src = `./viewer.html?${q.toString()}`;
    const share = new URL(location.href);
    share.search = '';
    share.searchParams.set('asset', asset);
    activate(src, 'LOCAL VIEWER', new URL(asset).pathname.split('/').pop(), share.toString());
    assetInput.value = asset;
  } catch (e) { notify(e.message); setStatus('ERROR'); }
}

tabs.forEach(t => t.addEventListener('click', () => setMode(t.dataset.mode)));
$('#loadScene').addEventListener('click', () => loadPublished(sceneInput.value));
$('#loadAsset').addEventListener('click', () => loadDirect(assetInput.value));
$('#demo').addEventListener('click', () => { setMode('scene'); loadPublished(TEST_SCENE); });
sceneInput.addEventListener('keydown', e => e.key === 'Enter' && loadPublished(sceneInput.value));
assetInput.addEventListener('keydown', e => e.key === 'Enter' && loadDirect(assetInput.value));

frame.addEventListener('load', () => active && setStatus('LIVE', true));

fullscreenBtn.addEventListener('click', async () => {
  if (!document.fullscreenElement) await frame.parentElement.requestFullscreen?.();
  else await document.exitFullscreen?.();
});

copyLinkBtn.addEventListener('click', async () => {
  if (!active) return;
  await navigator.clipboard.writeText(active.share);
  notify('分享連結已複製');
});

const params = new URLSearchParams(location.search);
if (params.get('asset')) {
  setMode('asset');
  assetInput.value = params.get('asset');
  loadDirect(params.get('asset'));
} else if (params.get('scene')) {
  setMode('scene');
  sceneInput.value = params.get('scene');
  loadPublished(params.get('scene'));
}
