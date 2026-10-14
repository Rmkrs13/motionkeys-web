import {
  actionLabel, defaultSensitivity, duckEnabled, effectiveAnticipateJump, KEY_CHOICES, KEY_MODES, keyLabel, keyModeLabel,
  matchingPresetID, presets, SENSITIVITY_RANGE, sensitivityEqual,
} from '../engine/key-mapping';
import type { KeyChoice, KeyMode } from '../engine/key-mapping';
import { ACTIONS } from '../engine/types';
import type { Action } from '../engine/types';
import { listCameras } from '../pose/camera';
import { loadSettings, onSettingsChange, saveSettings } from '../settings';
import type { KeyDelivery, Settings } from '../settings';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

let settings: Settings;

// MARK: - Camera

const cameraSelect = $<HTMLSelectElement>('camera');

async function refreshCameras(): Promise<void> {
  const cameras = await listCameras();
  cameraSelect.replaceChildren();
  const auto = new Option('Automatisch (standaardcamera)', '');
  cameraSelect.append(auto);
  for (const cam of cameras) cameraSelect.append(new Option(cam.label, cam.id));
  if (settings.cameraId && !cameras.some((c) => c.id === settings.cameraId)) {
    cameraSelect.append(new Option('Niet aangesloten camera', settings.cameraId));
  }
  cameraSelect.value = settings.cameraId;
}
cameraSelect.addEventListener('change', () => void saveSettings({ cameraId: cameraSelect.value }));
$<HTMLButtonElement>('refresh-cameras').addEventListener('click', () => void refreshCameras());
navigator.mediaDevices.addEventListener('devicechange', () => void refreshCameras());

// MARK: - Modus en toetsen

const presetSelect = $<HTMLSelectElement>('preset');
for (const p of presets) presetSelect.append(new Option(p.name, p.id));
presetSelect.append(new Option('Aangepast', 'custom'));
presetSelect.addEventListener('change', () => {
  const preset = presets.find((p) => p.id === presetSelect.value);
  if (preset) void saveSettings({ mapping: structuredClone(preset.mapping) });
});

const bindingsEl = $<HTMLDivElement>('bindings');
const bindingRows = new Map<Action, { key: HTMLSelectElement; modes: Map<KeyMode, HTMLButtonElement> }>();
for (const action of ACTIONS) {
  const row = document.createElement('div');
  row.className = 'binding';
  const label = document.createElement('span');
  label.textContent = actionLabel[action];
  const key = document.createElement('select');
  for (const k of KEY_CHOICES) key.append(new Option(keyLabel(k), k));
  key.addEventListener('change', () => {
    const mapping = structuredClone(settings.mapping);
    mapping[action].key = key.value as KeyChoice;
    void saveSettings({ mapping });
  });
  const seg = document.createElement('div');
  seg.className = 'seg';
  const modes = new Map<KeyMode, HTMLButtonElement>();
  for (const mode of KEY_MODES) {
    const btn = document.createElement('button');
    btn.textContent = keyModeLabel[mode];
    btn.addEventListener('click', () => {
      const mapping = structuredClone(settings.mapping);
      mapping[action].mode = mode;
      void saveSettings({ mapping });
    });
    seg.append(btn);
    modes.set(mode, btn);
  }
  row.append(label, key, seg);
  bindingsEl.append(row);
  bindingRows.set(action, { key, modes });
}

const anticipate = $<HTMLInputElement>('anticipate');
anticipate.addEventListener('change', () => {
  void saveSettings({ mapping: { ...structuredClone(settings.mapping), anticipateJump: anticipate.checked } });
});

// MARK: - Gevoeligheid

const sensitivityEl = $<HTMLDivElement>('sensitivity');
const sliders = new Map<keyof Settings['sensitivity'], { input: HTMLInputElement; output: HTMLOutputElement }>();
for (const [k, label] of [['jump', 'Springen'], ['duck', 'Bukken'], ['lateral', 'Opzij']] as const) {
  const row = document.createElement('div');
  row.className = 'sens';
  const span = document.createElement('span');
  span.textContent = label;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(SENSITIVITY_RANGE.min);
  input.max = String(SENSITIVITY_RANGE.max);
  input.step = String(SENSITIVITY_RANGE.step);
  const output = document.createElement('output');
  input.addEventListener('input', () => { output.textContent = `${Math.round(Number(input.value) * 100)} %`; });
  input.addEventListener('change', () => {
    void saveSettings({ sensitivity: { ...settings.sensitivity, [k]: Number(input.value) } });
  });
  row.append(span, input, output);
  sensitivityEl.append(row);
  sliders.set(k, { input, output });
}
const resetSensitivity = $<HTMLButtonElement>('reset-sensitivity');
resetSensitivity.addEventListener('click', () => void saveSettings({ sensitivity: defaultSensitivity() }));

// MARK: - Toetslevering

const deliveryRadios = [...document.querySelectorAll<HTMLInputElement>('input[name=delivery]')];
for (const radio of deliveryRadios) {
  radio.addEventListener('change', () => void saveSettings({ keyDelivery: radio.value as KeyDelivery }));
}

// MARK: - Render

function render(): void {
  presetSelect.value = matchingPresetID(settings.mapping) ?? 'custom';
  for (const action of ACTIONS) {
    const row = bindingRows.get(action)!;
    const binding = settings.mapping[action];
    row.key.value = binding.key;
    for (const [mode, btn] of row.modes) {
      btn.classList.toggle('on', binding.mode === mode);
      btn.disabled = binding.key === 'none';
    }
  }
  const duck = duckEnabled(settings.mapping);
  anticipate.checked = effectiveAnticipateJump(settings.mapping);
  anticipate.disabled = duck;
  $('anticipate-hint').textContent = duck
    ? 'Uitgeschakeld zolang bukken een toets heeft: zakken zou anders altijd als sprong tellen. De sprong wordt dan bij de afzet zelf gestuurd (±250 ms later).'
    : 'Stuurt de sprongtoets ±250 ms vroeger, wat de cameravertraging compenseert. Snel door de knieën zakken telt dan ook als sprong.';
  for (const [k, { input, output }] of sliders) {
    input.value = String(settings.sensitivity[k]);
    output.textContent = `${Math.round(settings.sensitivity[k] * 100)} %`;
  }
  resetSensitivity.disabled = sensitivityEqual(settings.sensitivity, defaultSensitivity());
  for (const radio of deliveryRadios) radio.checked = radio.value === settings.keyDelivery;
  if (cameraSelect.value !== settings.cameraId) cameraSelect.value = settings.cameraId;
}

void (async () => {
  settings = await loadSettings();
  render();
  await refreshCameras();
  onSettingsChange((s) => { settings = s; render(); });
})();
