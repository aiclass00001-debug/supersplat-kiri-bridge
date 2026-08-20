import { GestureControl } from './gestureControl.js';
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
    const asset = validateAsset(value);
    const q = viewerOptions();
    q.set('content', asset);
    const src = `./viewer.html?${q.toString()}`;
    const share = new URL(location.href);
    share.search = '';
    share.searchParams.set('asset', asset);
    activate(src, '本站自架 VIEWER', new URL(asset).pathname.split('/').pop(), share.toString());
    assetInput.value = asset;
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
// V0.3 Gesture -> SuperSplat Local Viewer interaction bridge
// ------------------------------------------------------------
const gestureVideo = document.querySelector('#gestureVideo');
const gestureToggle = document.querySelector('#gestureToggle');
const gestureState = document.querySelector('#gestureState');
const gestureLabel = document.querySelector('#gestureLabel');
const gestureModeNote = document.querySelector('#gestureModeNote');

const gesture = new GestureControl();
let gestureRAF = 0;
let gestureEnabled = false;
let virtualPointer = { x: 0.5, y: 0.5 };

function setGestureState(state, text) {
  gestureState.textContent = text;
  gestureState.classList.toggle('active', state === 'active');
  gestureState.classList.toggle('error', state === 'error');
}

function getLocalViewerCanvas() {
  if (!active || active.runtime !== '本站自架 VIEWER') return null;

  try {
    const doc = frame.contentDocument || frame.contentWindow?.document;
    return doc?.querySelector('canvas') || null;
  } catch (_) {
    return null;
  }
}

function dispatchOrbit(dx, dy) {
  const canvas = getLocalViewerCanvas();
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const gain = 4.2;

  virtualPointer.x = Math.max(0.05, Math.min(0.95, virtualPointer.x + dx * gain));
  virtualPointer.y = Math.max(0.05, Math.min(0.95, virtualPointer.y + dy * gain));

  const x1 = rect.width * 0.5;
  const y1 = rect.height * 0.5;
  const x2 = rect.width * virtualPointer.x;
  const y2 = rect.height * virtualPointer.y;

  const base = {
    bubbles: true,
    cancelable: true,
    pointerId: 777,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    buttons: 1
  };

  canvas.dispatchEvent(new PointerEvent('pointerdown', {
    ...base,
    clientX: x1,
    clientY: y1
  }));

  canvas.dispatchEvent(new PointerEvent('pointermove', {
    ...base,
    clientX: x2,
    clientY: y2,
    movementX: x2 - x1,
    movementY: y2 - y1
  }));

  canvas.dispatchEvent(new PointerEvent('pointerup', {
    ...base,
    clientX: x2,
    clientY: y2,
    buttons: 0
  }));
}

function dispatchZoom(delta) {
  const canvas = getLocalViewerCanvas();
  if (!canvas) return;

  // Fists moving apart -> zoom in; together -> zoom out.
  const wheel = Math.max(-180, Math.min(180, -delta * 4200));
  canvas.dispatchEvent(new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY: wheel,
    deltaMode: WheelEvent.DOM_DELTA_PIXEL
  }));
}

gesture.onStatusChange = (state, text) => {
  setGestureState(state, text);
};

gesture.onGestureChange = () => {
  gestureLabel.textContent = gesture.label();
};

gesture.onRotationChange = (dx, dy) => {
  gestureLabel.textContent = gesture.label();

  if (active?.runtime !== '本站自架 VIEWER') {
    gestureModeNote.classList.add('attention');
    return;
  }
  dispatchOrbit(dx, dy);
};

gesture.onZoomDelta = (delta) => {
  gestureLabel.textContent = gesture.label();

  if (active?.runtime !== '本站自架 VIEWER') {
    gestureModeNote.classList.add('attention');
    return;
  }
  dispatchZoom(delta);
};

function gestureLoop(t) {
  gesture.detect(t);
  if (gestureEnabled) gestureRAF = requestAnimationFrame(gestureLoop);
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
    gesture.destroy();
    setGestureState('idle', '未啟用');
    gestureLabel.textContent = '等待啟用…';
    gestureToggle.textContent = '啟用 WEBCAM 手勢';
  }
});

// Update limitation hint when switching between hosted/local runtime.
frame.addEventListener('load', () => {
  const local = active?.runtime === '本站自架 VIEWER';
  if (gestureModeNote) {
    gestureModeNote.textContent = local
      ? '目前是直接資產 / 自架 Viewer：Webcam 手勢可送入 Viewer 控制 Camera。'
      : '目前是 SuperSplat 公開 Scene：官方 Viewer 為跨網域，Webcam 可辨識手勢，但 Camera 控制被瀏覽器 Same-Origin Policy 阻擋。';
  }
});
