import { GestureControl } from './gestureControl.js';
import { GSBridgeAdapter } from './gsBridgeAdapter.js';
import { extractSuperSplatSceneId, resolveSuperSplatScene, loadParticleData } from './sogDataLoader.js';

const $ = s => document.querySelector(s);
const TEST_SCENE = 'https://superspl.at/scene/826659f3';

const tabs = [...document.querySelectorAll('.tab')];
const scenePane = $('#scenePane');
const assetPane = $('#assetPane');
const sceneInput = $('#sceneInput');
const assetInput = $('#assetInput');
const frame = $('#viewer');
const placeholder = $('#placeholder');
const status = $('#status');
const runtimeLabel = $('#runtimeLabel');
const sourceLabel = $('#sourceLabel');
const footerMode = $('#footerMode');
const fullscreenBtn = $('#fullscreen');
const copyLinkBtn = $('#copyLink');
const toastEl = $('#toast');

let mode = 'scene';
let active = null;
let particleSystem = null;
let modeController = null;
let particleReady = false;
let particleLoading = false;
let currentParticleSource = null;

function notify(text) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(notify.t);
  notify.t = setTimeout(() => toastEl.classList.remove('show'), 2200);
}
function setStatus(text, ok=false) {
  status.textContent=text;
  status.parentElement.classList.toggle('ok',ok);
}
function setMode(next) {
  mode=next;
  tabs.forEach(t=>t.classList.toggle('active',t.dataset.mode===next));
  scenePane.classList.toggle('hidden',next!=='scene');
  assetPane.classList.toggle('hidden',next!=='asset');
}
function viewerOptions() {
  const q=new URLSearchParams();
  q.set('settings','./settings.json');
  q.set('webgl','');
  if ($('#noui')?.checked) q.set('noui','');
  if ($('#ministats')?.checked) q.set('ministats','');
  if ($('#noanim')?.checked) q.set('noanim','');
  return q;
}
function validateAsset(raw) {
  let u;
  try { u=new URL(String(raw||'').trim()); } catch { throw new Error('資產網址無效'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('目前只支援 http / https');
  const p=u.pathname.toLowerCase();
  if (!(p.endsWith('.sog')||p.endsWith('.json')||p.endsWith('.ply'))) {
    throw new Error('支援 SOG、meta/lod JSON、PLY / compressed PLY');
  }
  return u.toString();
}
function activate(src,runtime,label,share,particleSource=null,meta=null) {
  active={src,runtime,label,share,particleSource,meta};
  setStatus('載入中');
  placeholder.classList.add('hidden');
  frame.classList.add('active');
  frame.style.visibility='visible';
  frame.src=src;
  runtimeLabel.textContent=runtime;
  sourceLabel.textContent=label;
  footerMode.textContent=runtime;
  fullscreenBtn.disabled=false;
  copyLinkBtn.disabled=false;
  setRendererMode('reality');
  if (particleSource) prepareParticles(particleSource, meta);
  else setParticleStatus('此來源目前只有實景模式', false);
}
async function loadPublished(value) {
  try {
    setStatus('解析中');
    setParticleStatus('正在解析 SuperSplat…');
    const resolved=await resolveSuperSplatScene(value,msg=>setParticleStatus(msg));
    const q=viewerOptions();
    q.set('content',resolved.viewerUrl);
    const src=`./viewer.html?${q.toString()}`;
    const share=new URL(location.href);
    share.search='';
    share.searchParams.set('scene',resolved.sceneId);
    sceneInput.value=`https://superspl.at/scene/${resolved.sceneId}`;
    activate(
      src,
      'SUPER SPLAT 可控模式',
      `scene/${resolved.sceneId} · v${resolved.version}`,
      share.toString(),
      resolved.particleUrl,
      resolved.meta
    );
  } catch(e) {
    console.error(e);
    setStatus('錯誤');
    setParticleStatus(e.message,false);
    notify(e.message);
  }
}
function loadDirect(value) {
  try {
    const asset=validateAsset(value);
    const q=viewerOptions();
    q.set('content',asset);
    const src=`./viewer.html?${q.toString()}`;
    const share=new URL(location.href);
    share.search='';
    share.searchParams.set('asset',asset);
    activate(src,'本站自架 VIEWER',new URL(asset).pathname.split('/').pop(),share.toString(),asset,null);
  } catch(e) {
    setStatus('錯誤'); notify(e.message);
  }
}

async function ensureParticleSystem() {
  if (particleSystem) return particleSystem;
  const { ParticleSystem } = await import('./particleSystem.js');
  const { ModeController } = await import('./modeController.js');
  particleSystem=new ParticleSystem($('.viewport'));
  modeController=new ModeController({
    frame,
    particleSystem,
    onChange:updateModeUI
  });
  return particleSystem;
}
async function prepareParticles(url,meta=null) {
  if (!url || particleLoading) return;
  particleLoading=true; particleReady=false; currentParticleSource=url;
  setParticleStatus('粒子資料解碼中…');
  try {
    const data=await loadParticleData(url,meta);
    if (currentParticleSource!==url) return;
    const ps=await ensureParticleSystem();
    await ps.init(data);
    ps.setEffect(Number($('#particleEffect')?.value||1));
    ps.setProgressImmediate(Number($('#scatterSlider')?.value||0)/100);
    particleReady=true;
    setParticleStatus(`粒子可用：${data.count.toLocaleString()} / ${data.sourceCount.toLocaleString()} points`,true);
    updateModeUI('reality');
  } catch(e) {
    console.error('[Particles]',e);
    setParticleStatus(`粒子不可用：${e.message}`,false);
  } finally {
    particleLoading=false;
  }
}
function setParticleStatus(text,ok=false) {
  const el=$('#particleStatus');
  if (!el) return;
  el.textContent=text;
  el.classList.toggle('ready',ok);
}
function setRendererMode(next) {
  if (next==='particle') {
    if (!particleReady || !modeController) {
      notify('粒子資料尚未就緒');
      return false;
    }
    return modeController.setMode('particle');
  }
  modeController?.setMode('reality');
  frame.style.visibility='visible';
  particleSystem?.setVisible(false);
  updateModeUI('reality');
  return true;
}
function updateModeUI(current=modeController?.mode||'reality') {
  $('#btnReality')?.classList.toggle('active',current==='reality');
  $('#btnParticle')?.classList.toggle('active',current==='particle');
  $('#modeReadout').textContent=current==='particle'?'粒子模式':'3D 實景';
}

tabs.forEach(t=>t.addEventListener('click',()=>setMode(t.dataset.mode)));
$('#loadScene').addEventListener('click',()=>loadPublished(sceneInput.value));
$('#loadAsset').addEventListener('click',()=>loadDirect(assetInput.value));
$('#demo').addEventListener('click',()=>{setMode('scene');loadPublished(TEST_SCENE);});
sceneInput.addEventListener('keydown',e=>e.key==='Enter'&&loadPublished(sceneInput.value));
assetInput.addEventListener('keydown',e=>e.key==='Enter'&&loadDirect(assetInput.value));
frame.addEventListener('load',()=>active&&setStatus('已載入',true));
fullscreenBtn.addEventListener('click',async()=> {
  if(!document.fullscreenElement) await $('.viewport').requestFullscreen?.();
  else await document.exitFullscreen?.();
});
copyLinkBtn.addEventListener('click',async()=> {
  if(!active)return;
  await navigator.clipboard.writeText(active.share);
  notify('分享連結已複製');
});

$('#btnReality').addEventListener('click',()=>setRendererMode('reality'));
$('#btnParticle').addEventListener('click',()=>setRendererMode('particle'));
$('#particleEffect').addEventListener('change',e=>particleSystem?.setEffect(e.target.value));
$('#scatterSlider').addEventListener('input',e=>{
  const v=Number(e.target.value)/100;
  $('#scatterReadout').textContent=`${e.target.value}%`;
  particleSystem?.setTargetProgress(v);
});
$('#btnScatter').addEventListener('click',()=>{
  if(setRendererMode('particle')) {
    $('#scatterSlider').value=100; $('#scatterReadout').textContent='100%';
    particleSystem?.setTargetProgress(1);
  }
});
$('#btnAssemble').addEventListener('click',()=>{
  if(setRendererMode('particle')) {
    $('#scatterSlider').value=0; $('#scatterReadout').textContent='0%';
    particleSystem?.setTargetProgress(0);
  }
});

// Gesture
const gestureVideo=$('#gestureVideo');
const gestureToggle=$('#gestureToggle');
const gestureState=$('#gestureState');
const gestureLabel=$('#gestureLabel');
const gestureModeNote=$('#gestureModeNote');
const gesture=new GestureControl();
const gsBridge=new GSBridgeAdapter({frame,getRuntime:()=>active?.runtime||null});
let gestureRAF=0, gestureEnabled=false;
let lastVictoryAt=0;

function setGestureState(s,text) {
  gestureState.textContent=text;
  gestureState.classList.toggle('active',s==='active');
  gestureState.classList.toggle('error',s==='error');
}
function realityOrbit(dx,dy) { return gsBridge.orbit(dx,dy); }
function realityDolly(dy) { return gsBridge.dollyFromPinch(dy); }

gesture.onStatusChange=(s,t)=>setGestureState(s,t);
gesture.onGestureChange=(name)=>{
  gestureLabel.textContent=gesture.getGestureLabel();

  if(name==='Pointing_Up' && (modeController?.mode||'reality')==='reality') gsBridge.beginOrbit();
  else gsBridge.endOrbit();

  if(name==='Victory' && performance.now()-lastVictoryAt>1200) {
    lastVictoryAt=performance.now();
    if(modeController?.mode==='particle') setRendererMode('reality');
    else setRendererMode('particle');
  }
};
gesture.onRotationChange=(dx,dy)=>{
  gestureLabel.textContent=gesture.getGestureLabel();
  if(modeController?.mode==='particle') particleSystem?.orbit(dx,dy);
  else realityOrbit(dx,dy);
};
gesture.onPinchChange=(pinching,dy)=>{
  gestureLabel.textContent=gesture.getGestureLabel();
  if(!pinching)return;
  gsBridge.endOrbit();
  if(modeController?.mode==='particle') particleSystem?.dolly(dy);
  else realityDolly(dy);
};
gesture.onScatterProgress=(progress)=>{
  const pct=Math.round(progress*100);
  $('#scatterReadout').textContent=`${pct}%`;
  $('#scatterSlider').value=pct;
  if(particleReady && progress>0.58 && modeController?.mode!=='particle') setRendererMode('particle');
  if(particleReady) particleSystem?.setTargetProgress(progress);
};
function gestureLoop(t) {
  gesture.detect(t);
  if(gestureEnabled) gestureRAF=requestAnimationFrame(gestureLoop);
}
gestureToggle.addEventListener('click',async()=>{
  if(!gestureEnabled) {
    const ok=await gesture.init(gestureVideo);
    if(!ok)return;
    gestureEnabled=true;
    gestureToggle.textContent='關閉 WEBCAM 手勢';
    gestureRAF=requestAnimationFrame(gestureLoop);
  } else {
    gestureEnabled=false; cancelAnimationFrame(gestureRAF);
    gsBridge.destroy(); gesture.destroy();
    setGestureState('idle','未啟用');
    gestureLabel.textContent='等待啟用…';
    gestureToggle.textContent='啟用 WEBCAM 手勢';
  }
});

frame.addEventListener('load',()=>{
  gestureModeNote.textContent=
    active?.runtime==='SUPER SPLAT 可控模式' || active?.runtime==='本站自架 VIEWER'
    ? '目前為本站可控 Runtime：☝️ Orbit、🤏 Pinch Dolly 可用；粒子解碼完成後 🤚/👊/✌️ 也可用。'
    : '目前來源不可控制。';
});

window.addEventListener('resize',()=>particleSystem?.resize());

const params=new URLSearchParams(location.search);
if(params.get('asset')) { setMode('asset'); assetInput.value=params.get('asset'); loadDirect(params.get('asset')); }
else if(params.get('scene')) { setMode('scene'); sceneInput.value=params.get('scene'); loadPublished(params.get('scene')); }
