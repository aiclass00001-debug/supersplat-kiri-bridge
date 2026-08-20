/**
 * KIRI-inspired ParticleSystem for GS Bridge.
 * Renderer architecture follows KIRI-Maker's THREE.Points + ShaderMaterial approach.
 * This is an interoperability adaptation, not a verbatim copy.
 */
import * as THREE from 'https://esm.sh/three@0.180.0?bundle';

const vertexShader = `
attribute vec3 aOriginalPosition;
attribute vec3 aColor;
attribute vec3 aRandomDir;
attribute float aPhase;
uniform float uProgress;
uniform float uTime;
uniform float uPointSize;
uniform float uEffect;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec3 p = aOriginalPosition;
  float prog = clamp(uProgress, 0.0, 1.0);
  float effect = floor(uEffect + 0.5);
  vec3 target = p;

  if (effect < 0.5) {
    target = p + aRandomDir * (2.8 + sin(aPhase + uTime) * 0.35);
  } else if (effect < 1.5) {
    vec3 outDir = normalize(p + vec3(0.001));
    target = p + outDir * 7.0 + aRandomDir * 1.4 + vec3(2.5, 1.2, 0.0);
  } else if (effect < 2.5) {
    float a = aPhase + uTime * 0.45 + p.y * 4.0;
    target = p + vec3(cos(a), sin(a * 1.3), sin(a)) * 2.2;
  } else if (effect < 3.5) {
    target = vec3(floor(p.x * 8.0) / 8.0, floor(p.y * 8.0) / 8.0, floor(p.z * 8.0) / 8.0);
    target += aRandomDir * 0.35;
  } else if (effect < 4.5) {
    float angle = p.y * 6.0 + aPhase + uTime;
    target = vec3(cos(angle) * 1.8, p.y + 2.0, sin(angle) * 1.8);
  } else if (effect < 5.5) {
    target = p + vec3(0.0, -5.0 - fract(aPhase) * 3.0, 0.0) + aRandomDir * 0.35;
  } else {
    float w = sin(p.y * 7.0 + uTime * 2.0 + aPhase);
    target = p + vec3(w * 2.2, 0.5 * w, cos(aPhase + uTime) * 1.2);
  }

  float radial = clamp(length(p) / 2.0, 0.0, 1.0);
  float local = smoothstep(radial - 0.20, radial + 0.18, prog);
  vec3 pos = mix(p, target, local);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uPointSize * (13.0 / max(0.15, -mv.z)), 1.5, 38.0);

  vColor = aColor;
  vAlpha = mix(1.0, 0.45, local);
}
`;

const fragmentShader = `
varying vec3 vColor;
varying float vAlpha;
uniform float uBrightness;
uniform float uOpacity;

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  float a = pow(max(0.0, 1.0 - r), 2.1);
  vec3 col = vColor * uBrightness;
  gl_FragColor = vec4(col, a * vAlpha * uOpacity);
}
`;

export class ParticleSystem {
  constructor(host) {
    this.host = host;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.points = null;
    this.material = null;
    this.pivot = null;
    this.currentProgress = 0;
    this.targetProgress = 0;
    this.effect = 1;
    this.visible = false;
    this.lastTime = performance.now();
    this.raf = 0;
    this.radius = 3.4;
    this.theta = 0;
    this.phi = Math.PI * 0.48;
    this.count = 0;
  }

  async init(data) {
    this.dispose();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 1000);

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
    this.renderer.domElement.className = 'particle-canvas';
    this.host.appendChild(this.renderer.domElement);

    const { positions, colors, count } = this.centerAndScale(data);
    this.count = count;

    const randomDirs = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const z = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const s = Math.sqrt(Math.max(0, 1 - z * z));
      randomDirs[i * 3] = s * Math.cos(t);
      randomDirs[i * 3 + 1] = s * Math.sin(t);
      randomDirs[i * 3 + 2] = z;
      phases[i] = Math.random() * Math.PI * 2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aOriginalPosition', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aRandomDir', new THREE.BufferAttribute(randomDirs, 3));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uProgress: { value: 0 },
        uTime: { value: 0 },
        uPointSize: { value: 0.58 },
        uEffect: { value: this.effect },
        uBrightness: { value: 0.85 },
        uOpacity: { value: 1.0 }
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending
    });

    this.points = new THREE.Points(geometry, this.material);

    // KIRI-Maker uses this to fix the Y/Z coordinate-system mismatch.
    this.points.rotation.x = Math.PI;

    this.pivot = new THREE.Group();
    this.pivot.add(this.points);
    this.scene.add(this.pivot);

    this.resize();
    this.updateCamera();
    this.setVisible(false);
    this.loop();
  }

  centerAndScale(data) {
    const count = data.count;
    const src = data.positions;
    const colors = data.colors;

    // Match KIRI-Maker's robust origin-based core radius.
    // Do not shift the splat to a bounding-box center.
    const sampleSize = Math.min(5000, count);
    const distances = [];
    const step = Math.max(1, Math.floor(count / Math.max(1, sampleSize)));

    for (let i = 0; i < count; i += step) {
      const x = src[i * 3];
      const y = src[i * 3 + 1];
      const z = src[i * 3 + 2];
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        distances.push(Math.hypot(x, y, z));
      }
    }

    distances.sort((a, b) => a - b);
    const p90 = distances.length
      ? distances[Math.min(distances.length - 1, Math.floor(distances.length * 0.90))]
      : 1;

    const scale = p90 > 0.001 ? 1 / p90 : 1;

    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = src[i * 3] * scale;
      positions[i * 3 + 1] = src[i * 3 + 1] * scale;
      positions[i * 3 + 2] = src[i * 3 + 2] * scale;
    }

    return { positions, colors, count };
  }

  setTargetProgress(v) {
    this.targetProgress = Math.max(0, Math.min(1, Number(v) || 0));
  }
  setProgressImmediate(v) {
    this.targetProgress = Math.max(0, Math.min(1, Number(v) || 0));
    this.currentProgress = this.targetProgress;
    if (this.material) this.material.uniforms.uProgress.value = this.currentProgress;
  }
  setEffect(v) {
    this.effect = Number(v) || 0;
    if (this.material) this.material.uniforms.uEffect.value = this.effect;
  }
  setPointSize(v) {
    if (this.material) this.material.uniforms.uPointSize.value = Number(v) || 0.58;
  }
  setVisible(v) {
    this.visible = !!v;
    if (this.renderer?.domElement) {
      this.renderer.domElement.style.display = this.visible ? 'block' : 'none';
    }
  }
  orbit(dx, dy) {
    this.theta -= dx * 4.2;
    this.phi = Math.max(0.08, Math.min(Math.PI - 0.08, this.phi + dy * 4.2));
    this.updateCamera();
  }
  dolly(deltaY) {
    this.radius *= Math.exp(deltaY * 7.0);
    this.radius = Math.max(1.2, Math.min(12, this.radius));
    this.updateCamera();
  }
  updateCamera() {
    if (!this.camera) return;
    const s = Math.sin(this.phi);
    this.camera.position.set(
      this.radius * s * Math.sin(this.theta),
      this.radius * Math.cos(this.phi),
      this.radius * s * Math.cos(this.theta)
    );
    this.camera.lookAt(0,0,0);
  }
  resize() {
    if (!this.renderer || !this.camera) return;
    const rect = this.host.getBoundingClientRect();
    const w=Math.max(1,rect.width), h=Math.max(1,rect.height);
    this.renderer.setSize(w,h,false);
    this.camera.aspect=w/h;
    this.camera.updateProjectionMatrix();
  }
  loop = () => {
    this.raf=requestAnimationFrame(this.loop);
    if (!this.renderer || !this.scene || !this.camera) return;
    const now=performance.now();
    const dt=Math.min(0.05,(now-this.lastTime)/1000);
    this.lastTime=now;
    this.currentProgress += (this.targetProgress-this.currentProgress) * Math.min(1,dt*7);
    if (this.material) {
      this.material.uniforms.uProgress.value=this.currentProgress;
      this.material.uniforms.uTime.value=now/1000;
    }
    if (this.visible) this.renderer.render(this.scene,this.camera);
  }
  dispose() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf=0;
    this.points?.geometry?.dispose?.();
    this.material?.dispose?.();
    this.renderer?.dispose?.();
    this.renderer?.domElement?.remove?.();
    this.scene=this.camera=this.renderer=this.points=this.material=this.pivot=null;
  }
}
