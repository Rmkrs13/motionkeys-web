// Content script: ontvangt toetsen van het MotionKeys-paneel en dispatcht ze als KeyboardEvent in dit frame,
// en toont (in het hoofdframe) de bewegingstekst bovenaan het spel.
// Draait in elk frame (all_frames); alleen het frame dat de focus heeft (of had) stuurt toetsen, zodat een spel
// in een iframe (bv. poki) de toetsen krijgt en de rest niet dubbel.
import { isFlashMessage, isKeyMessage } from './keys/key-codes';

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

  // Bewegingstekst als popover: die zit in de top layer en blijft dus zichtbaar boven een spel in volledig scherm.
  let flashEl: HTMLDivElement | undefined;
  let flashTimer: number | undefined;
  const showFlash = (text: string): void => {
    if (window !== window.top) return;
    if (!flashEl) {
      flashEl = document.createElement('div');
      flashEl.id = 'motionkeys-flash';
      flashEl.setAttribute('popover', 'manual');
      flashEl.style.cssText = [
        'position:fixed', 'inset:auto', 'top:24px', 'left:50%', 'transform:translateX(-50%)', 'margin:0', 'border:0',
        'padding:6px 24px', 'border-radius:999px', 'background:rgba(52,199,89,0.85)', 'color:#fff',
        'font:900 40px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif', 'letter-spacing:0.5px',
        'text-shadow:0 0 4px rgba(0,0,0,0.6)', 'pointer-events:none', 'z-index:2147483647', 'overflow:visible',
      ].join(';');
    }
    if (!flashEl.isConnected) (document.body ?? document.documentElement).append(flashEl);
    flashEl.textContent = text;
    try { if (!flashEl.matches(':popover-open')) flashEl.showPopover(); } catch { flashEl.style.display = 'block'; }
    if (flashTimer !== undefined) clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => {
      try { flashEl?.hidePopover(); } catch { if (flashEl) flashEl.style.display = 'none'; }
    }, 700);
  };

  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (isFlashMessage(message)) { showFlash(message.text); return; }
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
