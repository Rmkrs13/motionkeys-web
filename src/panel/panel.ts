import { drawOverlay } from './overlay';
import { TrackingController } from './tracking-controller';

// Document Picture-in-Picture (Chrome 116+): nog niet in de TypeScript-lib.
interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number; disallowReturnToOpener?: boolean }): Promise<Window>;
  readonly window: Window | null;
}
declare global {
  interface Window { documentPictureInPicture?: DocumentPictureInPicture }
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const stage = $<HTMLDivElement>('stage');
const video = $<HTMLVideoElement>('video');
const canvas = $<HTMLCanvasElement>('overlay');
const flashEl = $<HTMLDivElement>('flash');
const statusEl = $<HTMLDivElement>('status');
const targetWarning = $<HTMLDivElement>('target-warning');
const deliveryWarning = $<HTMLDivElement>('delivery-warning');
const errorEl = $<HTMLDivElement>('error');
const cameraHelp = $<HTMLButtonElement>('open-camera-help');
const toggleBtn = $<HTMLButtonElement>('toggle');
const recalibrateBtn = $<HTMLButtonElement>('recalibrate');
const pipBtn = $<HTMLButtonElement>('pip');
const dot = $<HTMLSpanElement>('dot');
const targetSelect = $<HTMLSelectElement>('target');

const controller = new TrackingController(video);

function statusMessage(): string | undefined {
  const s = controller.state.status;
  switch (s.kind) {
    case 'idle': return 'Camera start…';
    case 'calibrating': return `Kalibreren… sta stil in het midden (${Math.round(s.progress * 100)}%)`;
    case 'noBody': return 'Geen lichaam gevonden';
    case 'tracking': return undefined;
  }
}

function setWarning(el: HTMLElement, text: string | undefined): void {
  el.hidden = !text;
  const span = el.querySelector('span');
  if (span) span.textContent = text ?? '';
}

function render(): void {
  const st = controller.state;
  stage.classList.toggle('idle', !st.isTracking);
  stage.classList.toggle('tracking', st.isTracking);

  flashEl.hidden = !st.flash;
  flashEl.textContent = st.flash ?? '';
  const status = st.isTracking ? statusMessage() : st.starting ? 'Camera en model laden…' : undefined;
  statusEl.hidden = !status;
  statusEl.textContent = status ?? '';

  setWarning(targetWarning, st.targetWarning);
  setWarning(deliveryWarning, st.deliveryWarning);
  setWarning(errorEl, st.error);
  cameraHelp.hidden = !st.cameraDenied;

  toggleBtn.textContent = st.isTracking ? '■ Stop' : '▶ Start';
  toggleBtn.classList.toggle('stop', st.isTracking);
  toggleBtn.disabled = st.starting;
  recalibrateBtn.disabled = !st.isTracking;
  dot.classList.toggle('on', st.isTracking);

  if (st.isTracking) drawOverlay(canvas, st.joints, st.lateralLines);
}
controller.onChange = render;

// Beeldverhouding van het paneel volgt de camera (meestal 4:3).
video.addEventListener('loadedmetadata', () => {
  if (video.videoWidth && video.videoHeight) stage.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
});

toggleBtn.addEventListener('click', () => controller.toggle());
recalibrateBtn.addEventListener('click', () => controller.recalibrate());
for (const id of ['open-options', 'open-options-2']) {
  $<HTMLButtonElement>(id).addEventListener('click', () => void chrome.runtime.openOptionsPage());
}
cameraHelp.addEventListener('click', () => {
  void chrome.tabs.create({ url: `chrome://settings/content/siteDetails?site=${encodeURIComponent(chrome.runtime.getURL('').slice(0, -1))}` });
});

// MARK: - Doel-tabblad

async function refreshTargets(): Promise<void> {
  const tabs = await chrome.tabs.query({ windowType: 'normal' });
  const current = controller.pinnedTabId;
  targetSelect.replaceChildren();
  const auto = document.createElement('option');
  auto.value = '';
  auto.textContent = 'Automatisch (laatst actieve tabblad)';
  targetSelect.append(auto);
  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    const opt = document.createElement('option');
    opt.value = String(tab.id);
    opt.textContent = (tab.title || tab.url || `Tabblad ${tab.id}`).slice(0, 60);
    targetSelect.append(opt);
  }
  targetSelect.value = current === undefined ? '' : String(current);
  if (targetSelect.value !== (current === undefined ? '' : String(current))) targetSelect.value = '';
}
targetSelect.addEventListener('change', () => {
  void controller.setPinnedTab(targetSelect.value ? Number(targetSelect.value) : undefined);
});
targetSelect.addEventListener('focus', () => void refreshTargets());
chrome.tabs.onRemoved.addListener(() => void refreshTargets());
chrome.tabs.onUpdated.addListener((_id, info) => { if (info.title) void refreshTargets(); });
void refreshTargets();

// MARK: - Zwevend venster (Document Picture-in-Picture)

if (window.documentPictureInPicture) {
  pipBtn.hidden = false;
  pipBtn.addEventListener('click', async () => {
    const pipApi = window.documentPictureInPicture!;
    if (pipApi.window) { pipApi.window.close(); return; }
    const rect = stage.getBoundingClientRect();
    const pip = await pipApi.requestWindow({ width: Math.round(rect.width), height: Math.round(rect.height) });
    for (const sheet of document.styleSheets) {
      if (sheet.href) {
        const link = pip.document.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        pip.document.head.append(link);
      }
    }
    pip.document.body.append(stage);
    const placeholder = document.createElement('div');
    placeholder.className = 'idle-layer';
    placeholder.style.display = 'flex';
    placeholder.textContent = 'MotionKeys draait in het zwevende venster';
    document.body.append(placeholder);
    pip.addEventListener('pagehide', () => {
      placeholder.remove();
      document.body.append(stage);
      render();
    });
    render();
  });
}

window.addEventListener('pagehide', () => { void controller.dispose(); });
render();

// Debug-haak voor tests in de console: window.__motionkeys.controller
declare global { interface Window { __motionkeys?: { controller: TrackingController } } }
window.__motionkeys = { controller };
