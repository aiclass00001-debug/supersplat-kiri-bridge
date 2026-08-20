/**
 * GSBridgeAdapter
 * Keeps KIRI-derived gesture logic independent from SuperSplat input handling.
 */
export class GSBridgeAdapter {
  constructor({ frame, getRuntime }) {
    this.frame = frame;
    this.getRuntime = getRuntime;
    this.pointerId = 777;
    this.dragActive = false;
    this.dragPos = { x: 0.5, y: 0.5 };
    this.scatterProgress = 0;
    this.onScatterProgress = null;
    this.onResetRequest = null;
    this.cameraState = {
      yaw: 0,
      pitch: Math.PI * 0.48,
      distance: 3.4,
      target: { x: 0, y: 0, z: 0 },
      fov: 60
    };
    this.initialCameraState = structuredClone(this.cameraState);
    this.realDrag = null;
    this.trackedCanvas = null;
    this.cleanupTracking = null;
  }

  isLocalRuntime() {
    return ['本站自架 VIEWER', 'SUPER SPLAT 可控模式'].includes(this.getRuntime?.());
  }

  getCanvas() {
    if (!this.isLocalRuntime()) return null;

    try {
      const doc =
        this.frame.contentDocument ||
        this.frame.contentWindow?.document;
      return doc?.querySelector('canvas') || null;
    } catch (_) {
      return null;
    }
  }

  prepareCanvas(canvas) {
    if (canvas.__gsKiriPrepared) return;

    // Preserve native pointer capture for real mouse/touch.
    // Only synthetic gesture pointer id bypasses capture.
    try {
      const nativeSet = canvas.setPointerCapture?.bind(canvas);
      const nativeRelease = canvas.releasePointerCapture?.bind(canvas);
      const nativeHas = canvas.hasPointerCapture?.bind(canvas);

      canvas.setPointerCapture = (id) => {
        if (id === this.pointerId) return;
        return nativeSet?.(id);
      };

      canvas.releasePointerCapture = (id) => {
        if (id === this.pointerId) return;
        return nativeRelease?.(id);
      };

      canvas.hasPointerCapture = (id) => {
        if (id === this.pointerId) return false;
        return nativeHas?.(id) ?? false;
      };

      canvas.__gsKiriPrepared = true;
      this.attachRealInputTracking(canvas);
    } catch (_) {}
  }

  pointerEvent(canvas, type, x, y, buttons = 1) {
    const rect = canvas.getBoundingClientRect();
    const clientX = rect.left + rect.width * x;
    const clientY = rect.top + rect.height * y;

    canvas.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: this.pointerId,
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
        buttons,
        clientX,
        clientY,
        screenX: clientX,
        screenY: clientY,
        pressure: buttons ? 0.5 : 0,
      })
    );
  }

  beginOrbit() {
    const canvas = this.getCanvas();
    if (!canvas || this.dragActive) return false;

    this.prepareCanvas(canvas);
    this.dragPos = { x: 0.5, y: 0.5 };
    this.pointerEvent(
      canvas,
      'pointerdown',
      this.dragPos.x,
      this.dragPos.y,
      1
    );

    this.dragActive = true;
    return true;
  }

  orbit(dx, dy) {
    const canvas = this.getCanvas();
    if (!canvas) return false;

    if (!this.dragActive && !this.beginOrbit()) return false;

    const gainX = 2.8;
    const gainY = 2.8;

    // Webcam preview is mirrored; invert horizontal tracking.
    this.dragPos.x = Math.max(
      0.08,
      Math.min(0.92, this.dragPos.x - dx * gainX)
    );
    this.dragPos.y = Math.max(
      0.08,
      Math.min(0.92, this.dragPos.y + dy * gainY)
    );

    this.pointerEvent(
      canvas,
      'pointermove',
      this.dragPos.x,
      this.dragPos.y,
      1
    );
    this.cameraState.yaw -= dx * 4.2;
    this.cameraState.pitch = Math.max(
      0.08,
      Math.min(Math.PI - 0.08, this.cameraState.pitch + dy * 4.2)
    );
    return true;
  }

  endOrbit() {
    if (!this.dragActive) return;

    const canvas = this.getCanvas();
    if (canvas) {
      this.pointerEvent(
        canvas,
        'pointerup',
        this.dragPos.x,
        this.dragPos.y,
        0
      );
    }

    this.dragActive = false;
  }

  dollyFromPinch(deltaY) {
    const canvas = this.getCanvas();
    if (!canvas || !Number.isFinite(deltaY) || deltaY === 0) {
      return false;
    }

    // Hand moves up = negative normalized delta -> dolly in.
    // Wheel sign is intentionally mapped to match standard viewer controls.
    const wheelDelta = Math.max(
      -160,
      Math.min(160, deltaY * 5200)
    );

    canvas.dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaY: wheelDelta,
        deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      })
    );

    this.cameraState.distance = Math.max(0.2, Math.min(30,
      this.cameraState.distance * Math.exp(deltaY * 7.0)
    ));
    return true;
  }

  attachRealInputTracking(canvas) {
    if (!canvas || this.trackedCanvas === canvas) return;
    this.cleanupTracking?.();
    this.trackedCanvas = canvas;

    const onDown = (event) => {
      if (event.pointerId === this.pointerId || event.button !== 0) return;
      this.realDrag = { x: event.clientX, y: event.clientY };
    };
    const onMove = (event) => {
      if (!this.realDrag || event.pointerId === this.pointerId) return;
      const rect = canvas.getBoundingClientRect();
      const dx = (event.clientX - this.realDrag.x) / Math.max(1, rect.width);
      const dy = (event.clientY - this.realDrag.y) / Math.max(1, rect.height);
      this.realDrag = { x: event.clientX, y: event.clientY };
      this.cameraState.yaw -= dx * Math.PI * 2.0;
      this.cameraState.pitch = Math.max(
        0.08,
        Math.min(Math.PI - 0.08, this.cameraState.pitch + dy * Math.PI * 2.0)
      );
    };
    const onUp = () => { this.realDrag = null; };
    const onWheel = (event) => {
      const factor = Math.exp(Math.max(-500, Math.min(500, event.deltaY)) * 0.0015);
      this.cameraState.distance = Math.max(0.2, Math.min(30, this.cameraState.distance * factor));
    };
    const onDblClick = (event) => {
      if (event.isTrusted) this.onResetRequest?.();
    };

    canvas.addEventListener('pointerdown', onDown, true);
    canvas.addEventListener('pointermove', onMove, true);
    canvas.addEventListener('pointerup', onUp, true);
    canvas.addEventListener('pointercancel', onUp, true);
    canvas.addEventListener('wheel', onWheel, { capture: true, passive: true });
    canvas.addEventListener('dblclick', onDblClick, true);

    this.cleanupTracking = () => {
      canvas.removeEventListener('pointerdown', onDown, true);
      canvas.removeEventListener('pointermove', onMove, true);
      canvas.removeEventListener('pointerup', onUp, true);
      canvas.removeEventListener('pointercancel', onUp, true);
      canvas.removeEventListener('wheel', onWheel, true);
      canvas.removeEventListener('dblclick', onDblClick, true);
    };
  }

  getCameraState() {
    return structuredClone(this.cameraState);
  }

  setCameraState(state) {
    if (!state) return false;
    this.cameraState = structuredClone(state);
    return true;
  }

  resetView() {
    const canvas = this.getCanvas();
    if (!canvas) return false;
    this.endOrbit();
    this.cameraState = structuredClone(this.initialCameraState);
    try {
      this.frame.contentWindow.location.reload();
      return true;
    } catch (_) {
      return false;
    }
  }

  setScatterProgress(progress) {
    this.scatterProgress = Math.max(0, Math.min(1, progress || 0));
    this.onScatterProgress?.(this.scatterProgress);
  }

  destroy() {
    this.endOrbit();
    this.cleanupTracking?.();
    this.cleanupTracking = null;
    this.trackedCanvas = null;
  }
}
