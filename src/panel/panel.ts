import { drawOverlay } from './overlay';
import { initSettingsUI } from './settings-ui';
import { TrackingController } from './tracking-controller';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const stage = $<HTMLDivElement>('stage');
const video = $<HTMLVideoElement>('video');
const canvas = $<HTMLCanvasElement>('overlay');
const flashEl = $<HTMLDivElement>('flash');
const statusEl = $<HTMLSpanElement>('status');
const statsEl = $<HTMLSpanElement>('stats');
const targetWarning = $<HTMLDivElement>('target-warning');
const deliveryWarning = $<HTMLDivElement>('delivery-warning');
const errorEl = $<HTMLDivElement>('error');
const cameraHelp = $<HTMLButtonElement>('open-camera-help');
const toggleBtn = $<HTMLButtonElement>('toggle');
const recalibrateBtn = $<HTMLButtonElement>('recalibrate');
const dot = $<HTMLSpanElement>('dot');
const targetSelect = $<HTMLSelectElement>('target');

const controller = new TrackingController(video);

function statusMessage(): string {
  const st = controller.state;
  if (st.starting) return 'Camera en model laden…';
  if (!st.isTracking) return 'Tracking uit';
  switch (st.status.kind) {
    case 'idle': return 'Camera start…';
    case 'calibrating': return `Kalibreren… sta stil in het midden (${Math.round(st.status.progress * 100)}%)`;
    case 'noBody': return 'Geen lichaam gevonden';
    case 'tracking': return 'Volgt je bewegingen';
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

  flashEl.classList.toggle('on', !!st.flash);
  flashEl.textContent = st.flash ?? ' ';
  statusEl.textContent = statusMessage();
  statsEl.textContent = st.isTracking ? st.stats ?? '' : '';

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

// Beeldverhouding van het camerabeeld volgen (meestal 4:3).
video.addEventListener('loadedmetadata', () => {
  if (video.videoWidth && video.videoHeight) stage.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
});

toggleBtn.addEventListener('click', () => controller.toggle());
recalibrateBtn.addEventListener('click', () => controller.recalibrate());
cameraHelp.addEventListener('click', () => {
  void chrome.tabs.create({ url: `chrome://settings/content/siteDetails?site=${encodeURIComponent(chrome.runtime.getURL('').slice(0, -1))}` });
});

// MARK: - Spel-tabblad

async function refreshTargets(): Promise<void> {
  const tabs = await chrome.tabs.query({ windowType: 'normal' });
  const current = controller.pinnedTabId;
  targetSelect.replaceChildren(new Option('Automatisch (actieve tabblad)', ''));
  for (const tab of tabs) {
    if (tab.id === undefined || tab.url?.startsWith('chrome-extension://')) continue;
    targetSelect.append(new Option((tab.title || tab.url || `Tabblad ${tab.id}`).slice(0, 60), String(tab.id)));
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

void initSettingsUI();
window.addEventListener('pagehide', () => { void controller.dispose(); });
render();

// Debug-haak voor tests in de console: window.__motionkeys.controller
declare global { interface Window { __motionkeys?: { controller: TrackingController } } }
window.__motionkeys = { controller };
