import type { KeyChoice } from '../engine/key-mapping';

/// Alles wat nodig is om een toets als KeyboardEvent (content script) of via het DevTools-protocol te sturen.
export interface KeyInfo {
  key: string;
  code: string;
  /// Legacy keyCode = Windows virtual-key code (wat spellen meestal lezen).
  keyCode: number;
  /// Teken dat de toets typt (voor `Input.dispatchKeyEvent` type keyDown); leeg voor pijltjes e.d.
  text: string;
}

const SPECIAL: Partial<Record<KeyChoice, KeyInfo>> = {
  space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
  up: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38, text: '' },
  down: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, text: '' },
  left: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37, text: '' },
  right: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, text: '' },
  enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  shift: { key: 'Shift', code: 'ShiftLeft', keyCode: 16, text: '' },
  tab: { key: 'Tab', code: 'Tab', keyCode: 9, text: '' },
};

export function keyInfo(choice: KeyChoice): KeyInfo | undefined {
  if (choice === 'none') return undefined;
  const special = SPECIAL[choice];
  if (special) return special;
  // Letters: key 'w', code 'KeyW', keyCode = hoofdletter-code (87).
  return { key: choice, code: `Key${choice.toUpperCase()}`, keyCode: choice.toUpperCase().charCodeAt(0), text: choice };
}

/// Bericht van het paneel naar het content script.
export interface KeyMessage {
  type: 'motionkeys-key';
  phase: 'down' | 'up';
  key: string;
  code: string;
  keyCode: number;
}

export const isKeyMessage = (m: unknown): m is KeyMessage =>
  typeof m === 'object' && m !== null && (m as KeyMessage).type === 'motionkeys-key';
