// Content script: ontvangt toetsen van het MotionKeys-paneel en dispatcht ze als KeyboardEvent in dit frame.
// Draait in elk frame (all_frames); alleen het frame dat de focus heeft (of had) stuurt, zodat een spel in een
// iframe (bv. poki) de toetsen krijgt en de rest niet dubbel.
import { isKeyMessage } from './keys/key-codes';

declare global {
  interface Window { __motionkeysContent?: boolean }
}

if (!window.__motionkeysContent) {
  window.__motionkeysContent = true;

  let hadFocus = document.hasFocus();
  window.addEventListener('focus', () => { hadFocus = true; }, true);

  const shouldDispatch = (): boolean => {
    const active = document.activeElement;
    // Focus zit in een kind-frame: dat frame stuurt zelf.
    if (active instanceof HTMLIFrameElement || active instanceof HTMLFrameElement) return false;
    if (document.hasFocus()) return true;
    // Het venster heeft geen systeemfocus (gebruiker kijkt naar het paneel): het frame dat het laatst
    // focus had, of anders het hoofdframe.
    return window === window.top ? true : hadFocus;
  };

  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (!isKeyMessage(message) || !shouldDispatch()) return;
    const target = document.activeElement ?? document.body ?? document;
    const init: KeyboardEventInit & { keyCode: number; which: number } = {
      key: message.key,
      code: message.code,
      keyCode: message.keyCode,
      which: message.keyCode,
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
    };
    target.dispatchEvent(new KeyboardEvent(message.phase === 'down' ? 'keydown' : 'keyup', init));
  });
}
