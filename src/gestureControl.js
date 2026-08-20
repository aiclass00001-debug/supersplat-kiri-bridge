// V0.3 Gesture Controller
// Inspired by KIRI-Maker's MediaPipe workflow, adapted for GS Bridge.
// Webcam frames stay local in the browser. No video is uploaded by this app.

const MEDIAPIPE_VISION_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';

export class GestureControl {
  constructor() {
    this.gestureRecognizer = null;
    this.videoElement = null;
    this.stream = null;
    this.isInitialized = false;
    this.isRunning = false;
    this.lastVideoTime = -1;

    this.currentGesture = 'none';
    this.candidateGesture = 'none';
    this.consecutiveFrames = 0;
    this.consecutiveThreshold = 6;
    this.history = [];
    this.historyLength = 7;

    this.lastPoint = null;
    this.lastZoomDistance = null;

    this.onStatusChange = null;
    this.onGestureChange = null;
    this.onRotationChange = null;
    this.onZoomDelta = null;
  }

  async init(videoElement) {
    this.videoElement = videoElement;
    try {
      this._status('loading', '正在載入手勢模型…');

      const vision = await import(`${MEDIAPIPE_VISION_URL}/vision_bundle.mjs`);
      const { GestureRecognizer, FilesetResolver } = vision;
      const resolver = await FilesetResolver.forVisionTasks(
        `${MEDIAPIPE_VISION_URL}/wasm`
      );

      this.gestureRecognizer = await GestureRecognizer.createFromOptions(resolver, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      this._status('loading', '正在啟動 Webcam…');
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: 15, max: 30 },
          facingMode: 'user'
        },
        audio: false
      });

      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();

      this.isInitialized = true;
      this.isRunning = true;
      this._status('active', '手勢追蹤已啟用');
      return true;
    } catch (error) {
      const message =
        error?.name === 'NotAllowedError' ? '相機權限被拒絕' :
        error?.name === 'NotFoundError' ? '找不到 Webcam' :
        `初始化失敗：${error?.message || error}`;

      this._status('error', message);
      return false;
    }
  }

  detect(timestamp) {
    if (!this.isInitialized || !this.isRunning || !this.gestureRecognizer) return;
    if (!this.videoElement || this.videoElement.readyState < 2) return;

    const t = this.videoElement.currentTime;
    if (t === this.lastVideoTime) return;
    this.lastVideoTime = t;

    try {
      const result = this.gestureRecognizer.recognizeForVideo(
        this.videoElement,
        timestamp
      );
      this._process(result);
    } catch (_) {
      // Ignore single-frame recognition failures.
    }
  }

  _process(result) {
    const gestures = result?.gestures || [];
    const landmarksList = result?.landmarks || [];
    const primaryLandmarks = landmarksList[0] || null;

    let raw = 'none';
    let confidence = 0;

    if (gestures.length && gestures[0]?.length) {
      raw = gestures[0][0].categoryName || 'none';
      confidence = gestures[0][0].score || 0;
    }

    if (confidence < 0.60) raw = 'none';

    // More robust custom pointing detection.
    if (primaryLandmarks && this._isPointing(primaryLandmarks)) {
      raw = 'Pointing_Up';
    }

    // Two closed fists always take priority over single-hand classification.
    let twoFists = false;
    if (landmarksList.length >= 2) {
      twoFists =
        this._handOpenness(landmarksList[0]) < 0.30 &&
        this._handOpenness(landmarksList[1]) < 0.30;
      if (twoFists) raw = 'Two_Fists';
    }

    this.history.push(raw);
    if (this.history.length > this.historyLength) this.history.shift();

    const smoothed = twoFists ? 'Two_Fists' : this._majority();

    if (smoothed === this.currentGesture) {
      this.candidateGesture = smoothed;
      this.consecutiveFrames = 0;
    } else if (smoothed === this.candidateGesture) {
      this.consecutiveFrames++;
      if (this.consecutiveFrames >= this.consecutiveThreshold) {
        this.currentGesture = smoothed;
        this.consecutiveFrames = 0;
        this.onGestureChange?.(this.currentGesture, confidence);
      }
    } else {
      this.candidateGesture = smoothed;
      this.consecutiveFrames = 1;
    }

    // Pointing finger -> continuous orbit delta
    if (this.currentGesture === 'Pointing_Up' && primaryLandmarks) {
      const p = primaryLandmarks[8];
      if (this.lastPoint) {
        // Mirror X because webcam preview is mirrored.
        const dx = -(p.x - this.lastPoint.x);
        const dy = p.y - this.lastPoint.y;
        const dead = 0.0025;
        if (Math.abs(dx) > dead || Math.abs(dy) > dead) {
          this.onRotationChange?.(dx, dy);
        }
      }
      this.lastPoint = { x: p.x, y: p.y };
    } else {
      this.lastPoint = null;
    }

    // Two fists -> continuous zoom delta
    if (this.currentGesture === 'Two_Fists' && landmarksList.length >= 2) {
      const a = landmarksList[0][9];
      const b = landmarksList[1][9];
      const d = Math.hypot(a.x - b.x, a.y - b.y);

      if (this.lastZoomDistance != null) {
        const delta = d - this.lastZoomDistance;
        if (Math.abs(delta) > 0.002) {
          this.onZoomDelta?.(delta);
        }
      }
      this.lastZoomDistance = d;
    } else {
      this.lastZoomDistance = null;
    }
  }

  _majority() {
    const counts = {};
    for (const item of this.history) counts[item] = (counts[item] || 0) + 1;

    let best = 'none';
    let bestCount = 0;
    for (const [key, count] of Object.entries(counts)) {
      if (count > bestCount) {
        best = key;
        bestCount = count;
      }
    }
    return best;
  }

  _distance3(a, b) {
    return Math.hypot(a.x-b.x, a.y-b.y, (a.z||0)-(b.z||0));
  }

  _fingerExtended(lm, tip, pip, mcp) {
    const tipD = this._distance3(lm[tip], lm[mcp]);
    const pipD = this._distance3(lm[pip], lm[mcp]);
    return tipD > pipD * 1.25;
  }

  _fingerFolded(lm, tip, pip, mcp) {
    const tipD = this._distance3(lm[tip], lm[mcp]);
    const pipD = this._distance3(lm[pip], lm[mcp]);
    return tipD < pipD * 1.15;
  }

  _isPointing(lm) {
    if (!lm || lm.length < 21) return false;
    return (
      this._fingerExtended(lm, 8, 6, 5) &&
      this._fingerFolded(lm, 12, 10, 9) &&
      this._fingerFolded(lm, 16, 14, 13) &&
      this._fingerFolded(lm, 20, 18, 17)
    );
  }

  _handOpenness(lm) {
    if (!lm || lm.length < 21) return 0.5;
    const palm = this._distance3(lm[0], lm[9]);
    if (palm < 0.001) return 0.5;

    const pairs = [[8,5], [12,9], [16,13], [20,17]];
    let ratio = 0;
    for (const [tip, base] of pairs) {
      ratio += this._distance3(lm[tip], lm[base]) / palm;
    }
    ratio /= pairs.length;

    return Math.max(0, Math.min(1, (ratio - 0.48) / (0.72 - 0.48)));
  }

  label() {
    const map = {
      Pointing_Up: '☝️ 食指：鏡頭環繞',
      Two_Fists: '👊👊 雙拳：拉近 / 拉遠',
      Open_Palm: '🤚 張開手掌',
      Closed_Fist: '👊 握拳',
      Victory: '✌️ 勝利手勢',
      none: '等待手勢…'
    };
    return map[this.currentGesture] || this.currentGesture;
  }

  pause() {
    this.isRunning = false;
  }

  resume() {
    if (this.isInitialized) this.isRunning = true;
  }

  destroy() {
    this.isRunning = false;
    this.isInitialized = false;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.gestureRecognizer?.close?.();
    this.gestureRecognizer = null;
    if (this.videoElement) this.videoElement.srcObject = null;
  }

  _status(state, text) {
    this.onStatusChange?.(state, text);
  }
}
