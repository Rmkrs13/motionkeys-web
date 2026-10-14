import { defaultKeyMapping, defaultSensitivity, KEY_CHOICES, KEY_MODES, SENSITIVITY_RANGE } from './engine/key-mapping';
import type { ActionBinding, KeyMapping, Sensitivity } from './engine/key-mapping';

/// Hoe toetsen bij het spel aankomen: synthetische KeyboardEvents via het content script, of echte toetsen via chrome.debugger.
export type KeyDelivery = 'content' | 'debugger';

export interface Settings {
  mapping: KeyMapping;
  sensitivity: Sensitivity;
  /// deviceId van de gekozen camera; leeg = standaardcamera.
  cameraId: string;
  keyDelivery: KeyDelivery;
}

export const defaultSettings = (): Settings => ({
  mapping: defaultKeyMapping(),
  sensitivity: defaultSensitivity(),
  cameraId: '',
  keyDelivery: 'content',
});

const KEYS: (keyof Settings)[] = ['mapping', 'sensitivity', 'cameraId', 'keyDelivery'];

function sanitizeBinding(raw: unknown, fallback: ActionBinding): ActionBinding {
  const r = raw as Partial<ActionBinding> | undefined;
  return {
    key: r && KEY_CHOICES.includes(r.key as never) ? r.key! : fallback.key,
    mode: r && KEY_MODES.includes(r.mode as never) ? r.mode! : fallback.mode,
  };
}

function sanitize(raw: Partial<Record<keyof Settings, unknown>>): Settings {
  const d = defaultSettings();
  const m = (raw.mapping ?? {}) as Partial<KeyMapping>;
  const s = (raw.sensitivity ?? {}) as Partial<Sensitivity>;
  const clamp = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(SENSITIVITY_RANGE.max, Math.max(SENSITIVITY_RANGE.min, v)) : fallback;
  return {
    mapping: {
      jump: sanitizeBinding(m.jump, d.mapping.jump),
      duck: sanitizeBinding(m.duck, d.mapping.duck),
      left: sanitizeBinding(m.left, d.mapping.left),
      right: sanitizeBinding(m.right, d.mapping.right),
      anticipateJump: typeof m.anticipateJump === 'boolean' ? m.anticipateJump : d.mapping.anticipateJump,
    },
    sensitivity: { jump: clamp(s.jump, 1), duck: clamp(s.duck, 1), lateral: clamp(s.lateral, 1) },
    cameraId: typeof raw.cameraId === 'string' ? raw.cameraId : '',
    keyDelivery: raw.keyDelivery === 'debugger' ? 'debugger' : 'content',
  };
}

export async function loadSettings(): Promise<Settings> {
  return sanitize(await chrome.storage.local.get(KEYS));
}

export async function saveSettings(partial: Partial<Settings>): Promise<void> {
  await chrome.storage.local.set(partial);
}

/// Roept `callback` aan met de volledige, opgeschoonde instellingen zodra er iets wijzigt (ook vanuit een ander venster).
export function onSettingsChange(callback: (settings: Settings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local' || !KEYS.some((k) => k in changes)) return;
    void loadSettings().then(callback);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

// MARK: - Sessiestatus (background ↔ paneel)

export const SESSION_KEYS = {
  /// Venster-id van het geopende paneel.
  panelWindowId: 'panelWindowId',
  /// Laatst actieve tabblad in een gewoon browservenster: het standaard-doel voor toetsen.
  lastGameTabId: 'lastGameTabId',
} as const;
