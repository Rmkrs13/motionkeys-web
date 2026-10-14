import type { Action } from './types';

export const actionLabel: Record<Action, string> = {
  jump: 'Springen',
  duck: 'Bukken',
  left: 'Stap links',
  right: 'Stap rechts',
};

/// Tekst die kort in het paneel oplicht bij het begin van de beweging.
export const actionFlash: Record<Action, string> = {
  jump: 'SPRONG',
  duck: 'BUKKEN',
  left: '← LINKS',
  right: 'RECHTS →',
};

/// Toetsen die je aan een beweging kunt koppelen.
export const KEY_CHOICES = [
  'none', 'space', 'up', 'down', 'left', 'right', 'enter', 'shift', 'tab',
  'w', 'a', 's', 'd', 'q', 'z', 'x', 'c', 'e', 'f',
] as const;
export type KeyChoice = (typeof KEY_CHOICES)[number];

export function keyLabel(key: KeyChoice): string {
  switch (key) {
    case 'none': return 'Geen';
    case 'space': return 'Spatie';
    case 'up': return 'Pijl omhoog ↑';
    case 'down': return 'Pijl omlaag ↓';
    case 'left': return 'Pijl links ←';
    case 'right': return 'Pijl rechts →';
    case 'enter': return 'Enter';
    case 'shift': return 'Shift';
    case 'tab': return 'Tab';
    default: return key.toUpperCase();
  }
}

/// Tik: korte toetsaanslag bij het begin van de beweging.
/// Vasthouden: toets ingedrukt zolang de beweging duurt (bv. bukken in het dino-spel).
export type KeyMode = 'tap' | 'hold';
export const KEY_MODES: readonly KeyMode[] = ['tap', 'hold'];
export const keyModeLabel: Record<KeyMode, string> = { tap: 'Tik', hold: 'Vasthouden' };

export interface ActionBinding {
  key: KeyChoice;
  mode: KeyMode;
}

/// Welke toets bij welke beweging hoort, plus de sprong-anticipatie.
export interface KeyMapping {
  jump: ActionBinding;
  duck: ActionBinding;
  left: ActionBinding;
  right: ActionBinding;
  /// Spatie al sturen bij het zakken vóór de afzet. Kan alleen als bukken geen toets heeft:
  /// anders is elke buk-beweging ook een sprong.
  anticipateJump: boolean;
}

export const defaultKeyMapping = (): KeyMapping => ({
  jump: { key: 'space', mode: 'tap' },
  duck: { key: 'down', mode: 'hold' },
  left: { key: 'left', mode: 'tap' },
  right: { key: 'right', mode: 'tap' },
  anticipateJump: true,
});

export const duckEnabled = (m: KeyMapping): boolean => m.duck.key !== 'none';
/// Anticipatie is alleen actief zonder bukken.
export const effectiveAnticipateJump = (m: KeyMapping): boolean => m.anticipateJump && !duckEnabled(m);

export const mappingsEqual = (a: KeyMapping, b: KeyMapping): boolean =>
  a.anticipateJump === b.anticipateJump &&
  (['jump', 'duck', 'left', 'right'] as const).every((k) => a[k].key === b[k].key && a[k].mode === b[k].mode);

// MARK: - Modi (presets)

export interface Preset {
  id: string;
  name: string;
  mapping: KeyMapping;
}

const b = (key: KeyChoice, mode: KeyMode): ActionBinding => ({ key, mode });

export const presets: readonly Preset[] = [
  { id: 'dino-fast', name: 'Dino snel (spatie, anticipatie, geen bukken)',
    mapping: { jump: b('space', 'tap'), duck: b('none', 'hold'), left: b('left', 'tap'), right: b('right', 'tap'), anticipateJump: true } },
  { id: 'dino-duck', name: 'Dino met bukken (spatie / pijl omlaag)',
    mapping: { jump: b('space', 'tap'), duck: b('down', 'hold'), left: b('left', 'tap'), right: b('right', 'tap'), anticipateJump: true } },
  { id: 'subway', name: 'Subway Surfers (↑ springen, ↓ rollen, ← → baan)',
    mapping: { jump: b('up', 'tap'), duck: b('down', 'tap'), left: b('left', 'tap'), right: b('right', 'tap'), anticipateJump: true } },
  { id: 'arrows', name: 'Pijltjes (↑ ↓ ← →, bukken vasthouden)',
    mapping: { jump: b('up', 'tap'), duck: b('down', 'hold'), left: b('left', 'tap'), right: b('right', 'tap'), anticipateJump: true } },
  { id: 'wasd', name: 'WASD',
    mapping: { jump: b('w', 'tap'), duck: b('s', 'hold'), left: b('a', 'tap'), right: b('d', 'tap'), anticipateJump: true } },
];

export const matchingPresetID = (m: KeyMapping): string | undefined =>
  presets.find((p) => mappingsEqual(p.mapping, m))?.id;

/// Gevoeligheid per beweging als factor (1.0 = de gemeten standaard). Hoger = vroeger/gemakkelijker triggeren.
export interface Sensitivity {
  jump: number;
  duck: number;
  lateral: number;
}

export const defaultSensitivity = (): Sensitivity => ({ jump: 1, duck: 1, lateral: 1 });
export const SENSITIVITY_RANGE = { min: 0.5, max: 2.0, step: 0.05 } as const;
export const sensitivityEqual = (a: Sensitivity, b: Sensitivity): boolean =>
  a.jump === b.jump && a.duck === b.duck && a.lateral === b.lateral;
