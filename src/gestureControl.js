/**
 * KIRI-derived Gesture Control — GS Bridge V0.4
 *
 * Based on the architecture of:
 *   KIRI-Maker/js/gestureControl.js
 *   https://github.com/willjim/KIRI-Maker
 *
 * Original copyright (c) 2026 Willjim
 * KIRI-Maker is licensed under the MIT License.
 *
 * Changes in GS Bridge:
 * - Traditional Chinese status text
 * - Two-fist zoom removed
 * - Added single-hand Pinch + vertical movement for Dolly/Zoom
 * - Added pinch hysteresis / dead-zone / low-pass filtering
 * - Preserved KIRI-style confidence threshold, history voting,
 *   consecutive-frame stabilization and continuous openness mapping
 */

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

    // KIRI-style gesture stabilization.
    this.currentGesture = 'none';
    this.targetProgress = 0;
    this.gestureConfidence = 0;
    this.gestureHistory = [];
    this.historyLength = 8;
    this.candidateGesture = 'none';
    this.consecutiveFrames = 0;
    this.consecutivenessThreshold = 8;

    // KIRI-style pointing tracking.
    this.inRotationMode = false;
    this.lastHandPos = null;

    // GS Bridge pinch state.
    this.pinchActive = false;
    this.pinchCandidate = false;
    this.pinchFrames = 0;
    this.pinchOnThreshold = 0.34;   // thumb-index distance / palm length
    this.pinchOffThreshold = 0.47;  // hysteresis
    this.pinchStableFrames = 3;
    this.pinchStartY = null;
    this.lastPinchY = null;
    this.filteredPinchDelta = 0;
    this.pinchFilterWeight = 0.28;
    this.pinchDeadZone = 0.0018;

    // Callbacks.
    this.onGestureChange = null;
    this.onStatusChange = null;
    this.onRotationChange = null;
    this.onZoomChange = null;       // compatibility alias: receives vertical delta
    this.onPinchChange = null;      // (active, deltaY, normalizedPinch)
    this.onScatterProgress = null;  // 0 gathered -> 1 scattered
    this.onModeToggle = null;
    this.onOpenPalmHold = null;

    // Camera gestures and particle-mode entry are intentionally isolated.
    // Pinch / Pointing can never directly or indirectly enter Particle Mode.
    this.lastCameraGestureAt = -Infinity;
    this.openPalmSince = null;
    this.openPalmTriggered = false;
    this.openPalmHoldMs = 600;
    this.cameraGestureCooldownMs = 800;

    this.victorySince = null;
    this.victoryTriggered = false;
    this.victoryHoldMs = 700;
  }

  async init(videoElement) {
    this.videoElement = videoElement;

    try {
      this.onStatusChange?.('loading', '正在載入 KIRI 手勢追蹤模型…');

      const vision = await import(`${MEDIAPIPE_VISION_URL}/vision_bundle.mjs`);
      const { GestureRecognizer, FilesetResolver } = vision;

      const filesetResolver = await FilesetResolver.forVisionTasks(
        `${MEDIAPIPE_VISION_URL}/wasm`
      );

      this.gestureRecognizer = await GestureRecognizer.createFromOptions(
        filesetResolver,
        {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 1, // V0.4: one hand is enough after replacing two-fist zoom.
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        }
      );

      this.onStatusChange?.('ready', '正在啟動 Webcam…');

      // Same lightweight capture strategy as KIRI-Maker.
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: 15, max: 30 },
          facingMode: 'user',
        },
        audio: false,
      });

      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();

      this.isInitialized = true;
      this.isRunning = true;
      this.onStatusChange?.('active', 'KIRI 手勢追蹤已啟用');
      return true;
    } catch (error) {
      console.error('[GestureControl] init failed:', error);

      const message =
        error?.name === 'NotAllowedError'
          ? '相機權限被拒絕'
          : error?.name === 'NotFoundError'
            ? '找不到 Webcam'
            : `初始化失敗：${error?.message || error}`;

      this.onStatusChange?.('error', message);
      return false;
    }
  }

  detect(timestamp) {
    if (!this.isInitialized || !this.isRunning || !this.gestureRecognizer) return;
    if (!this.videoElement || this.videoElement.readyState < 2) return;

    const currentTime = this.videoElement.currentTime;
    if (currentTime === this.lastVideoTime) return;
    this.lastVideoTime = currentTime;

    try {
      const result = this.gestureRecognizer.recognizeForVideo(
        this.videoElement,
        timestamp
      );
      this.processResult(result);
    } catch (_) {
      // KIRI behavior: skip an occasional bad frame rather than breaking tracking.
    }
  }

  processResult(result) {
    let rawGesture = 'none';
    let confidence = 0;
    let landmarks = null;

    if (result?.gestures?.length > 0 && result.gestures[0]?.length > 0) {
      const topGesture = result.gestures[0][0];
      rawGesture = topGesture.categoryName || 'none';
      confidence = topGesture.score || 0;
    }

    // KIRI uses a high threshold to reject face / background false positives.
    const MIN_CONFIDENCE = 0.62;

    if (confidence < MIN_CONFIDENCE) {
      rawGesture = 'none';
    } else if (result?.landmarks?.length > 0) {
      const candidate = result.landmarks[0];

      // Keep KIRI's upright-hand filtering, but allow pinch even when classification
      // temporarily drops because pinch is landmark-driven.
      if (candidate && this.isHandUpright(candidate)) {
        landmarks = candidate;
      } else {
        rawGesture = 'none';
      }
    }

    // Pinch uses landmarks directly and has priority over classifier labels.
    let pinchRatio = Infinity;
    let pinchNow = false;

    if (landmarks) {
      pinchRatio = this.calculatePinchRatio(landmarks);
      const threshold = this.pinchActive
        ? this.pinchOffThreshold
        : this.pinchOnThreshold;
      pinchNow = pinchRatio < threshold;
      this.updatePinchStability(pinchNow);
    } else {
      this.updatePinchStability(false);
    }

    // KIRI history voting.
    this.gestureHistory.push(rawGesture);
    if (this.gestureHistory.length > this.historyLength) {
      this.gestureHistory.shift();
    }

    let smoothedGesture = this.getMajorityGesture();

    // KIRI custom landmark checks.
    if (
      landmarks &&
      (smoothedGesture === 'Victory' || this.isTwoFingersExtended(landmarks))
    ) {
      smoothedGesture = 'Victory';
    }

    if (
      landmarks &&
      (smoothedGesture === 'Pointing_Up' || this.isPointingUpGesture(landmarks))
    ) {
      smoothedGesture = 'Pointing_Up';
    }

    // V0.4: pinch overrides pointing / classifier gesture.
    if (this.pinchActive && landmarks) {
      smoothedGesture = 'Pinch';
    }

    this.updateStableGesture(smoothedGesture, confidence);

    // Hard camera-gesture lock.
    // Any Pinch/Pointing activity blocks Open-Palm mode entry for a cooldown period.
    const cameraGestureNow =
      this.pinchActive ||
      smoothedGesture === 'Pinch' ||
      smoothedGesture === 'Pointing_Up' ||
      this.currentGesture === 'Pinch' ||
      this.currentGesture === 'Pointing_Up';

    if (cameraGestureNow) {
      this.lastCameraGestureAt = performance.now();
      this.openPalmSince = null;
      this.openPalmTriggered = false;
    }

    // Dedicated Open-Palm intent path.
    // It requires an explicit stabilized Open_Palm classification, a hold,
    // and no recent camera gesture. Scatter progress itself has no authority
    // to switch renderer mode.
    const explicitOpenPalm =
      !this.pinchActive &&
      smoothedGesture === 'Open_Palm' &&
      this.currentGesture === 'Open_Palm' &&
      rawGesture === 'Open_Palm' &&
      performance.now() - this.lastCameraGestureAt >= this.cameraGestureCooldownMs;

    if (explicitOpenPalm) {
      if (this.openPalmSince == null) this.openPalmSince = performance.now();

      if (
        !this.openPalmTriggered &&
        performance.now() - this.openPalmSince >= this.openPalmHoldMs
      ) {
        this.openPalmTriggered = true;
        this.onOpenPalmHold?.();
      }
    } else if (!cameraGestureNow) {
      this.openPalmSince = null;
      this.openPalmTriggered = false;
    }

    // Hold Victory for ~0.7s to toggle once; release before toggling again.
    if (smoothedGesture === 'Victory' && confidence >= MIN_CONFIDENCE) {
      if (this.victorySince == null) this.victorySince = performance.now();

      if (
        !this.victoryTriggered &&
        performance.now() - this.victorySince >= this.victoryHoldMs
      ) {
        this.victoryTriggered = true;
        this.onModeToggle?.();
      }
    } else {
      this.victorySince = null;
      this.victoryTriggered = false;
    }

    // ------------------------------------------------------------
    // Actions based on stabilized gesture
    // ------------------------------------------------------------

    if (this.currentGesture === 'Pinch' && landmarks) {
      this.handlePinch(landmarks, pinchRatio);
      this.inRotationMode = false;
      this.lastHandPos = null;
    } else {
      this.resetPinchMotion();

      // KIRI pointing: track index fingertip landmark 8.
      if (this.currentGesture === 'Pointing_Up' && landmarks) {
        const currentHandPos = {
          x: landmarks[8].x,
          y: landmarks[8].y,
        };

        if (this.lastHandPos && this.inRotationMode) {
          const dx = currentHandPos.x - this.lastHandPos.x;
          const dy = currentHandPos.y - this.lastHandPos.y;
          this.onRotationChange?.(dx, dy);
        }

        this.lastHandPos = currentHandPos;
        this.inRotationMode = true;
      } else {
        this.inRotationMode = false;
        this.lastHandPos = null;
      }
    }

    // Continuous openness is now DATA ONLY.
    // It must never mutate currentGesture and must never switch renderer mode.
    // During Pinch / Pointing it is frozen completely.
    if (landmarks) {
      const cameraGestureActive =
        this.pinchActive ||
        this.currentGesture === 'Pinch' ||
        this.currentGesture === 'Pointing_Up' ||
        smoothedGesture === 'Pinch' ||
        smoothedGesture === 'Pointing_Up';

      if (!cameraGestureActive && this.currentGesture !== 'Victory') {
        const openness = this.calculateHandOpenness(landmarks);
        const filterWeight = 0.25;

        this.targetProgress =
          this.targetProgress * (1 - filterWeight) +
          openness * filterWeight;

        // Only emit scatter data when an actual particle gesture is active
        // or when the renderer is already using this continuous value.
        this.onScatterProgress?.(this.targetProgress);
      }
    } else if (this.currentGesture === 'none') {
      this.targetProgress = 0;
      this.onScatterProgress?.(0);
    }
  }

  updateStableGesture(smoothedGesture, confidence) {
    if (smoothedGesture === this.currentGesture) {
      this.candidateGesture = smoothedGesture;
      this.consecutiveFrames = 0;
      return;
    }

    if (smoothedGesture === this.candidateGesture) {
      this.consecutiveFrames++;

      if (this.consecutiveFrames >= this.consecutivenessThreshold) {
        const previous = this.currentGesture;
        this.currentGesture = smoothedGesture;
        this.gestureConfidence = confidence;
        this.consecutiveFrames = 0;

        console.log(
          `[GestureControl] stable: ${previous} -> ${smoothedGesture}`
        );
        this.onGestureChange?.(smoothedGesture, confidence);
      }
    } else {
      this.candidateGesture = smoothedGesture;
      this.consecutiveFrames = 1;
    }
  }

  updatePinchStability(value) {
    if (value === this.pinchCandidate) {
      this.pinchFrames++;
    } else {
      this.pinchCandidate = value;
      this.pinchFrames = 1;
    }

    if (this.pinchFrames >= this.pinchStableFrames) {
      if (this.pinchActive !== value) {
        this.pinchActive = value;
        if (!value) this.resetPinchMotion();
      }
    }
  }

  handlePinch(landmarks, pinchRatio) {
    // landmark 9 (middle MCP) is much more stable than the fingertip as hand center.
    const centerY = landmarks[9].y;

    if (this.lastPinchY == null) {
      this.pinchStartY = centerY;
      this.lastPinchY = centerY;
      this.filteredPinchDelta = 0;
      this.onPinchChange?.(true, 0, pinchRatio);
      this.onZoomChange?.(0);
      return;
    }

    let deltaY = centerY - this.lastPinchY;
    this.lastPinchY = centerY;

    // Low-pass filter for stable dolly movement.
    this.filteredPinchDelta =
      this.filteredPinchDelta * (1 - this.pinchFilterWeight) +
      deltaY * this.pinchFilterWeight;

    if (Math.abs(this.filteredPinchDelta) < this.pinchDeadZone) {
      this.onPinchChange?.(true, 0, pinchRatio);
      this.onZoomChange?.(0);
      return;
    }

    this.onPinchChange?.(
      true,
      this.filteredPinchDelta,
      pinchRatio
    );
    this.onZoomChange?.(this.filteredPinchDelta);
  }

  resetPinchMotion() {
    if (
      this.lastPinchY != null ||
      this.pinchStartY != null ||
      Math.abs(this.filteredPinchDelta) > 0
    ) {
      this.onPinchChange?.(false, 0, Infinity);
    }

    this.pinchStartY = null;
    this.lastPinchY = null;
    this.filteredPinchDelta = 0;
  }

  calculatePinchRatio(landmarks) {
    const palmLength = this.distance3D(landmarks[0], landmarks[9]);
    if (palmLength < 0.001) return Infinity;

    const thumbIndex = this.distance3D(landmarks[4], landmarks[8]);
    return thumbIndex / palmLength;
  }

  calculateHandOpenness(landmarks) {
    const wrist = landmarks[0];
    const middleMCP = landmarks[9];

    const palmLength = this.distance3D(wrist, middleMCP);
    if (palmLength < 0.001) return 0.5;

    const extended = [
      this.isFingerExtended(landmarks, 8, 6, 5),
      this.isFingerExtended(landmarks, 12, 10, 9),
      this.isFingerExtended(landmarks, 16, 14, 13),
      this.isFingerExtended(landmarks, 20, 18, 17),
    ];

    // Scale-invariant average fingertip-to-base distance.
    const ratios = [
      [8, 5],
      [12, 9],
      [16, 13],
      [20, 17],
    ].map(([tip, base]) =>
      this.distance3D(landmarks[tip], landmarks[base]) / palmLength
    );

    const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;

    // Blend geometric ratio with extension count.
    const extensionFactor =
      extended.filter(Boolean).length / extended.length;

    const normalizedRatio = Math.max(
      0,
      Math.min(1, (avg - 0.48) / (0.82 - 0.48))
    );

    return normalizedRatio * 0.65 + extensionFactor * 0.35;
  }

  isHandUpright(landmarks) {
    if (!landmarks || landmarks.length < 21) return false;

    // KIRI-style orientation filter:
    // reject extremely horizontal / collapsed detections often coming from faces.
    const wrist = landmarks[0];
    const middleMCP = landmarks[9];
    const palm = this.distance3D(wrist, middleMCP);

    if (palm < 0.025) return false;

    const indexMCP = landmarks[5];
    const pinkyMCP = landmarks[17];
    const palmWidth = this.distance3D(indexMCP, pinkyMCP);

    return palmWidth > 0.012 && palm / palmWidth > 0.45;
  }

  getMajorityGesture() {
    const counts = new Map();

    for (const gesture of this.gestureHistory) {
      counts.set(gesture, (counts.get(gesture) || 0) + 1);
    }

    let winner = 'none';
    let winnerCount = 0;

    for (const [gesture, count] of counts) {
      if (count > winnerCount) {
        winner = gesture;
        winnerCount = count;
      }
    }

    return winner;
  }

  isFingerExtended(landmarks, tipIdx, pipIdx, mcpIdx) {
    const dTipToMCP = this.distance3D(
      landmarks[tipIdx],
      landmarks[mcpIdx]
    );
    const dPipToMCP = this.distance3D(
      landmarks[pipIdx],
      landmarks[mcpIdx]
    );

    return dTipToMCP > dPipToMCP * 1.3;
  }

  isFingerFolded(landmarks, tipIdx, pipIdx, mcpIdx) {
    const dTipToMCP = this.distance3D(
      landmarks[tipIdx],
      landmarks[mcpIdx]
    );
    const dPipToMCP = this.distance3D(
      landmarks[pipIdx],
      landmarks[mcpIdx]
    );

    return dTipToMCP < dPipToMCP * 1.1;
  }

  isTwoFingersExtended(landmarks) {
    const indexExtended = this.isFingerExtended(landmarks, 8, 6, 5);
    const middleExtended = this.isFingerExtended(landmarks, 12, 10, 9);
    const ringFolded = this.isFingerFolded(landmarks, 16, 14, 13);
    const pinkyFolded = this.isFingerFolded(landmarks, 20, 18, 17);

    return indexExtended && middleExtended && ringFolded && pinkyFolded;
  }

  isPointingUpGesture(landmarks) {
    return (
      this.isFingerExtended(landmarks, 8, 6, 5) &&
      this.isFingerFolded(landmarks, 12, 10, 9) &&
      this.isFingerFolded(landmarks, 16, 14, 13) &&
      this.isFingerFolded(landmarks, 20, 18, 17)
    );
  }

  distance3D(a, b) {
    return Math.sqrt(
      (a.x - b.x) ** 2 +
      (a.y - b.y) ** 2 +
      ((a.z || 0) - (b.z || 0)) ** 2
    );
  }

  getGestureLabel() {
    const labels = {
      none: '等待手勢…',
      Pointing_Up: '☝️ 食指：鏡頭環繞',
      Pinch: '🤏 Pinch：上下移動拉近 / 拉遠',
      Open_Palm: '🤚 張開手掌：粒子散開',
      Closed_Fist: '👊 握拳：粒子聚合',
      Victory: '✌️ 勝利手勢：模式切換',
    };

    return labels[this.currentGesture] || this.currentGesture;
  }

  label() {
    return this.getGestureLabel();
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
    this.resetPinchMotion();

    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;

    this.gestureRecognizer?.close?.();
    this.gestureRecognizer = null;

    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }
}
