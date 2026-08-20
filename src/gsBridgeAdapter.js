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

    // Synthetic PointerEvents cannot own native browser pointer capture.
    // SuperSplat InputController requests capture, so neutralize capture
    // only on our same-origin self-hosted canvas.
    try {
      canvas.setPointerCapture = () => {};
      canvas.releasePointerCapture = () => {};
      canvas.hasPointerCapture = () => false;
      canvas.__gsKiriPrepared = true;
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

    return true;
  }

  setScatterProgress(progress) {
    this.scatterProgress = Math.max(0, Math.min(1, progress || 0));
    this.onScatterProgress?.(this.scatterProgress);
  }

  destroy() {
    this.endOrbit();
  }
}
