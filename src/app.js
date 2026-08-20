import { GestureControl } from './gestureControl.js';
import { GSBridgeAdapter } from './gsBridgeAdapter.js';
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
  try { u = new URL(text); } catch { throw new Error('場景網址無效'); }
  if (u.hostname.replace(/^www\./,'') !== 'superspl.at') throw new Error('這不是 superspl.at 網址');
  const m = u.pathname.match(/^\/scene\/([A-Za-z0-9_-]{4,100})/);
  if (m) return m[1];
  if (u.pathname === '/s' && u.searchParams.get('id')) return u.searchParams.get('id');
  throw new Error('找不到場景 ID');
}

function validateAsset(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { throw new Error('資產網址無效'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('目前只支援 http / https 網址');
  const p = u.pathname.toLowerCase();
  const supported = p.endsWith('.sog') || p.endsWith('.lod-meta.json') ||
    p.endsWith('.meta.json') || p.endsWith('.ply') || p.endsWith('.compressed.ply');
  if (!supported) throw new Error('格式需為 SOG、LOD JSON 或 PLY');
  return u.toString();
}


function normalizeDirectAssetUrl(raw) {
  const url = validateAsset(raw);

  try {
    const u = new URL(url);

    // GitHub Release test repo:
    // https://github.com/aiclass00001-debug/supersplat-kiri-bridge/releases/download/TAG/file.sog
    //
    // Convert to same-origin Netlify proxy:
    // /github-release/TAG/file.sog
    const releasePrefix =
      '/aiclass00001-debug/supersplat-kiri-bridge/releases/download/';

    if (u.hostname === 'github.com' && u.pathname.startsWith(releasePrefix)) {
      const tail = u.pathname.slice(releasePrefix.length);
      return new URL(`/github-release/${tail}`, location.origin).toString();
    }
  } catch (_) {}

  return url;
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
  setStatus('載入中');
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
    activate(src, 'SUPER SPLAT 官方託管', `scene/${id}`, share.toString());
    sceneInput.value = `https://superspl.at/scene/${id}`;
  } catch (e) { notify(e.message); setStatus('錯誤'); }
}

function loadDirect(value) {
  try {
    const asset = normalizeDirectAssetUrl(value);
    const q = viewerOptions();
    q.set('settings', './settings.json');
    q.set('content', asset);
    // V0.3.1: force WebGL during Direct Asset testing.
    // This reduces browser/WebGPU variance and is also the path required later for WebXR.
    q.set('webgl', '');
    const src = `./viewer.html?${q.toString()}`;
    const share = new URL(location.href);
    share.search = '';
    share.searchParams.set('asset', asset);
    activate(src, '本站自架 VIEWER', new URL(asset).pathname.split('/').pop(), share.toString());
    if (asset.includes('/github-release/')) {
      notify('GitHub Release 已改走 Netlify 同網域代理');
    } else {
      assetInput.value = asset;
    }
  } catch (e) { notify(e.message); setStatus('錯誤'); }
}

tabs.forEach(t => t.addEventListener('click', () => setMode(t.dataset.mode)));
$('#loadScene').addEventListener('click', () => loadPublished(sceneInput.value));
$('#loadAsset').addEventListener('click', () => loadDirect(assetInput.value));
$('#demo').addEventListener('click', () => { setMode('scene'); loadPublished(TEST_SCENE); });
sceneInput.addEventListener('keydown', e => e.key === 'Enter' && loadPublished(sceneInput.value));
assetInput.addEventListener('keydown', e => e.key === 'Enter' && loadDirect(assetInput.value));

frame.addEventListener('load', () => active && setStatus('已載入', true));

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

// ------------------------------------------------------------
// V0.4 KIRI-derived Gesture -> SuperSplat Adapter
// ------------------------------------------------------------
const gestureVideo = document.querySelector('#gestureVideo');
const gestureToggle = document.querySelector('#gestureToggle');
const gestureState = document.querySelector('#gestureState');
const gestureLabel = document.querySelector('#gestureLabel');
const gestureModeNote = document.querySelector('#gestureModeNote');

const gesture = new GestureControl();
const gsBridge = new GSBridgeAdapter({
  frame,
  getRuntime: () => active?.runtime || null,
});

let gestureRAF = 0;
let gestureEnabled = false;

function setGestureState(state, text) {
  gestureState.textContent = text;
  gestureState.classList.toggle('active', state === 'active');
  gestureState.classList.toggle('error', state === 'error');
}

gesture.onStatusChange = (state, text) => {
  setGestureState(state, text);
};

gesture.onGestureChange = (name) => {
  gestureLabel.textContent = gesture.getGestureLabel();

  if (name === 'Pointing_Up') {
    if (gsBridge.isLocalRuntime()) gsBridge.beginOrbit();
  } else {
    gsBridge.endOrbit();
  }
};

gesture.onRotationChange = (dx, dy) => {
  gestureLabel.textContent = gesture.getGestureLabel();

  if (!gsBridge.orbit(dx, dy)) {
    gestureModeNote.classList.add('attention');
  }
};

// V0.4 official zoom interaction:
// 🤏 Pinch + vertical hand movement -> Dolly
gesture.onPinchChange = (pinching, deltaY) => {
  gestureLabel.textContent = gesture.getGestureLabel();

  if (!pinching) return;

  gsBridge.endOrbit();

  if (!gsBridge.dollyFromPinch(deltaY)) {
    gestureModeNote.classList.add('attention');
  }
};

// KIRI continuous openness is kept now so the particle layer can connect
// without changing the gesture recognizer again.
gesture.onScatterProgress = (progress) => {
  gsBridge.setScatterProgress(progress);

  const percent = Math.round(progress * 100);
  const scatterReadout = document.querySelector('#scatterReadout');
  if (scatterReadout) scatterReadout.textContent = `${percent}%`;
};

function gestureLoop(timestamp) {
  gesture.detect(timestamp);

  if (gestureEnabled) {
    gestureRAF = requestAnimationFrame(gestureLoop);
  }
}

gestureToggle?.addEventListener('click', async () => {
  if (!gestureEnabled) {
    const ok = await gesture.init(gestureVideo);
    if (!ok) return;

    gestureEnabled = true;
    gestureToggle.textContent = '關閉 WEBCAM 手勢';
    gestureRAF = requestAnimationFrame(gestureLoop);
  } else {
    gestureEnabled = false;
    cancelAnimationFrame(gestureRAF);

    gsBridge.destroy();
    gesture.destroy();

    setGestureState('idle', '未啟用');
    gestureLabel.textContent = '等待啟用…';
    gestureToggle.textContent = '啟用 WEBCAM 手勢';
  }
});

frame.addEventListener('load', () => {
  const local = gsBridge.isLocalRuntime();

  gestureModeNote.textContent = local
    ? '直接資產 / 自架 Viewer：☝️ 食指環繞、🤏 Pinch + 上下移動 Dolly 已可送入 Viewer。'
    : 'SuperSplat 公開 Scene 目前仍是官方跨網域 Viewer；手勢可辨識，但 Camera / Particle 需先解析成本站可控制 Runtime。';
});
