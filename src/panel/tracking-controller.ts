// Verbindt camera → pose-detectie → gesture-engine → toetsen, en publiceert state voor het paneel.
import { GestureEngine, Thresholds } from '../engine/gesture-engine';
import { actionFlash, duckEnabled, effectiveAnticipateJump } from '../engine/key-mapping';
import type { KeyMapping } from '../engine/key-mapping';
import { describe } from '../engine/types';
import type { EngineStatus, GestureEvent, Joints, LateralState } from '../engine/types';
import { keyInfo } from '../keys/key-codes';
import type { KeyInfo } from '../keys/key-codes';
import { ContentScriptSender, DebuggerSender } from '../keys/key-sender';
import type { KeySender } from '../keys/key-sender';
import { Camera, CameraError } from '../pose/camera';
import { PoseDetector } from '../pose/pose-detector';
import { loadSettings, onSettingsChange } from '../settings';
import type { KeyDelivery, Settings } from '../settings';

export interface TrackingState {
  isTracking: boolean;
  starting: boolean;
  status: EngineStatus;
  lateral: LateralState;
  lateralLines: { left: number; right: number } | undefined;
  /// Gewrichten in gespiegelde, genormaliseerde coördinaten (x gespiegeld, y origin linksonder).
  joints: Joints;
  flash: string | undefined;
  error: string | undefined;
  cameraDenied: boolean;
  /// Waarschuwing over het doel-tabblad (geen tab, chrome://-pagina, …).
  targetWarning: string | undefined;
  /// Waarschuwing over de toetslevering (debugger geweigerd/losgekoppeld).
  deliveryWarning: string | undefined;
  keyDelivery: KeyDelivery;
  /// Gemeten framerate en pose-tijd (voor het paneel), bijgewerkt elke 30 frames.
  stats: string | undefined;
}

/// URL's waar geen content script of debugger in kan.
const BLOCKED_URL = /^(chrome|chrome-extension|edge|about|devtools|view-source):|^https:\/\/chromewebstore\.google\.com/;

export class TrackingController {
  readonly state: TrackingState = {
    isTracking: false, starting: false, status: { kind: 'idle' }, lateral: 'center', lateralLines: undefined,
    joints: {}, flash: undefined, error: undefined, cameraDenied: false, targetWarning: undefined,
    deliveryWarning: undefined, keyDelivery: 'content', stats: undefined,
  };
  onChange: () => void = () => {};
  /// Vast gekozen doel-tabblad; undefined = automatisch (laatst actieve tab).
  pinnedTabId: number | undefined;

  private settings: Settings | undefined;
  private mapping: KeyMapping | undefined;
  private readonly engine = new GestureEngine();
  private readonly camera = new Camera();
  private detector: PoseDetector | undefined;
  private sender: KeySender | undefined;
  private heldKeys = new Map<string, KeyInfo>();
  private frameHandle: number | undefined;
  private frameCounter = 0;
  private statsWindow = { since: 0, poseMs: 0 };
  private flashTimer: number | undefined;
  private autoTabId: number | undefined;
  private readonly video: HTMLVideoElement;

  constructor(video: HTMLVideoElement) {
    this.video = video;
    void this.init();
  }

  private async init(): Promise<void> {
    this.applySettings(await loadSettings());
    onSettingsChange((s) => {
      const cameraChanged = s.cameraId !== this.settings?.cameraId;
      this.applySettings(s);
      if (cameraChanged && this.state.isTracking) void this.restartCamera();
    });
    const session = await chrome.storage.session.get('lastGameTabId');
    this.autoTabId = session['lastGameTabId'] as number | undefined;
    chrome.storage.session.onChanged.addListener((changes) => {
      if ('lastGameTabId' in changes) {
        this.autoTabId = changes['lastGameTabId']?.newValue as number | undefined;
        void this.updateTarget();
      }
    });
    chrome.tabs.onRemoved.addListener((tabId) => {
      if (tabId === this.pinnedTabId) this.pinnedTabId = undefined;
      if (tabId === this.autoTabId) this.autoTabId = undefined;
      void this.updateTarget();
    });
    void this.updateTarget();
  }

  private applySettings(s: Settings): void {
    this.settings = s;
    const thresholds = Thresholds.scaled(s.sensitivity);
    thresholds.duckEnabled = duckEnabled(s.mapping);
    thresholds.jumpOnDip = effectiveAnticipateJump(s.mapping);
    this.releaseHeldKeys();
    this.mapping = s.mapping;
    this.engine.thresholds = thresholds;
    if (s.keyDelivery !== this.state.keyDelivery || !this.sender) {
      this.state.keyDelivery = s.keyDelivery;
      void this.setSender(s.keyDelivery);
    }
    this.onChange();
  }

  private async setSender(delivery: KeyDelivery): Promise<void> {
    const old = this.sender;
    this.sender = undefined;
    await old?.dispose();
    this.state.deliveryWarning = undefined;
    const onError = (message: string) => {
      this.state.deliveryWarning = `Toets sturen mislukt: ${message}`;
      this.onChange();
    };
    if (delivery === 'debugger') {
      this.sender = new DebuggerSender(onError, (reason) => {
        // Gebruiker klikte "Annuleren" in de debug-balk, of het tabblad sloot: terug naar het content script.
        if (reason === 'canceled_by_user') {
          this.state.deliveryWarning = 'Debugger losgekoppeld; synthetische toetsen worden gebruikt. Herstart tracking voor betrouwbare toetsen.';
          void this.setSender('content');
        }
      });
    } else {
      this.sender = new ContentScriptSender(onError);
    }
    this.sender.tabId = this.targetTabId;
    this.onChange();
  }

  // MARK: - Doel-tabblad

  get targetTabId(): number | undefined {
    return this.pinnedTabId ?? this.autoTabId;
  }

  async setPinnedTab(tabId: number | undefined): Promise<void> {
    if (tabId !== this.targetTabId) {
      this.releaseHeldKeys();
      await this.sender?.dispose().then(() => this.setSender(this.state.keyDelivery));
    }
    this.pinnedTabId = tabId;
    await this.updateTarget();
  }

  private async updateTarget(): Promise<void> {
    const id = this.targetTabId;
    if (this.sender) this.sender.tabId = id;
    let warning: string | undefined;
    if (id === undefined) {
      warning = 'Geen spel-tabblad: klik in het tabblad met je spel of kies het hieronder.';
    } else {
      try {
        const tab = await chrome.tabs.get(id);
        if (tab.url && BLOCKED_URL.test(tab.url)) {
          warning = 'Toetsen kunnen niet naar deze pagina (chrome://-pagina of Web Store). Open het spel op een gewone website.';
        }
      } catch {
        warning = 'Spel-tabblad bestaat niet meer.';
      }
    }
    this.state.targetWarning = warning;
    this.onChange();
  }

  // MARK: - Toetsen

  private releaseHeldKeys(): void {
    for (const key of this.heldKeys.values()) this.sender?.release(key);
    this.heldKeys.clear();
  }

  private perform(event: GestureEvent): void {
    const binding = this.mapping?.[event.action];
    if (!binding) return;
    const key = keyInfo(binding.key);
    if (!key || !this.sender) return;
    if (binding.mode === 'tap') {
      if (event.phase === 'start') this.sender.tap(key);
    } else if (event.phase === 'start') {
      this.sender.press(key);
      this.heldKeys.set(key.code, key);
    } else {
      this.sender.release(key);
      this.heldKeys.delete(key.code);
    }
  }

  // MARK: - Start / stop

  toggle(): void {
    if (this.state.isTracking) this.stop(); else void this.start();
  }

  async start(): Promise<void> {
    if (this.state.isTracking || this.state.starting) return;
    this.state.starting = true;
    this.state.error = undefined;
    this.onChange();
    try {
      await this.camera.start(this.video, this.settings?.cameraId ?? '');
      this.state.cameraDenied = false;
      this.detector ??= await PoseDetector.create();
    } catch (error) {
      this.camera.stop();
      this.state.starting = false;
      if (error instanceof CameraError && error.kind === 'denied') this.state.cameraDenied = true;
      this.state.error = error instanceof Error ? error.message : String(error);
      this.onChange();
      return;
    }
    this.engine.reset();
    this.frameCounter = 0;
    this.statsWindow = { since: performance.now(), poseMs: 0 };
    this.state.isTracking = true;
    this.state.starting = false;
    this.state.status = { kind: 'idle' };
    this.onChange();
    this.scheduleFrame();
    const s = this.camera.settings;
    console.info(`[MotionKeys] camera ${s?.width}×${s?.height} @ ${s?.frameRate} fps, pose op ${this.detector.delegate}`);
  }

  stop(): void {
    if (this.frameHandle !== undefined) this.video.cancelVideoFrameCallback(this.frameHandle);
    this.frameHandle = undefined;
    this.camera.stop();
    this.video.srcObject = null;
    this.releaseHeldKeys();
    this.engine.reset();
    Object.assign(this.state, {
      isTracking: false, starting: false, status: { kind: 'idle' }, lateral: 'center', lateralLines: undefined, joints: {}, flash: undefined,
      stats: undefined,
    });
    this.onChange();
  }

  recalibrate(): void {
    this.releaseHeldKeys();
    this.engine.reset();
  }

  private async restartCamera(): Promise<void> {
    try {
      await this.camera.start(this.video, this.settings?.cameraId ?? '');
      this.recalibrate();
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : String(error);
      this.onChange();
    }
  }

  async dispose(): Promise<void> {
    this.stop();
    await this.sender?.dispose();
    this.detector?.close();
  }

  // MARK: - Frames

  private scheduleFrame(): void {
    this.frameHandle = this.video.requestVideoFrameCallback((now, metadata) => this.handleFrame(now, metadata));
  }

  private handleFrame(now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata): void {
    if (!this.state.isTracking || !this.detector) return;
    const t0 = performance.now();
    const pose = this.detector.detect(this.video, now);
    const t1 = performance.now();
    const time = now / 1000;
    const events = this.engine.process(pose, time);
    for (const event of events) this.perform(event);
    const t2 = performance.now();

    this.frameCounter++;
    this.statsWindow.poseMs += t1 - t0;
    if (this.frameCounter % 30 === 0) {
      const elapsed = (t2 - this.statsWindow.since) / 1000;
      this.state.stats = `${(30 / elapsed).toFixed(0)} fps · pose ${(this.statsWindow.poseMs / 30).toFixed(0)} ms`;
      this.statsWindow = { since: t2, poseMs: 0 };
    }
    // Kandidaat-sprongen (stijgsnelheid > 0.8 romphoogte/s) altijd loggen: zo zie je welke snelheid een echte afzet haalt.
    if (events.length > 0 || this.engine.riseVelocity > 0.8) console.debug('[MotionKeys] ' + this.engine.trace);
    if (events.length > 0 || this.frameCounter % 60 === 0) {
      const cameraMs = metadata.captureTime !== undefined ? t0 - metadata.captureTime : NaN;
      const text = events.length ? ` [${events.map(describe).join(',')}${events.some((e) => e.action === 'jump' && e.phase === 'start') ? ` via ${this.engine.lastJumpRoute}` : ''}]` : '';
      console.debug(`[MotionKeys] camera→app ${cameraMs.toFixed(0)} ms, pose ${(t1 - t0).toFixed(0)} ms, totaal ${(t2 - t0).toFixed(0)} ms${text}`);
    }

    const mirrored: Joints = {};
    if (pose) for (const [name, p] of Object.entries(pose.points)) mirrored[name as keyof Joints] = { x: 1 - p.x, y: p.y };
    this.state.joints = mirrored;
    this.state.status = this.engine.status;
    this.state.lateral = this.engine.lateral;
    this.state.lateralLines = this.engine.lateralLines;
    const last = events.filter((e) => e.phase === 'start').pop();
    if (last) this.showFlash(last.action);
    this.onChange();
    this.scheduleFrame();
  }

  private showFlash(action: GestureEvent['action']): void {
    this.state.flash = actionFlash[action];
    if (this.flashTimer !== undefined) clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => { this.state.flash = undefined; this.onChange(); }, 600);
  }
}
