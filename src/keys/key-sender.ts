import type { KeyInfo, KeyMessage } from './key-codes';

/// Stuurt toetsen naar het spel-tabblad. Tik: key down, ~40 ms later key up
/// (spellen registreren dat betrouwbaarder dan 0 ms).
export interface KeySender {
  readonly name: string;
  tabId: number | undefined;
  tap(key: KeyInfo): void;
  press(key: KeyInfo): void;
  release(key: KeyInfo): void;
  /// Verbinding met het tabblad loslaten (debugger detachen).
  dispose(): Promise<void>;
}

const TAP_MS = 40;

abstract class BaseSender implements KeySender {
  abstract readonly name: string;
  tabId: number | undefined;
  constructor(readonly onError: (message: string) => void) {}

  protected abstract post(key: KeyInfo, down: boolean): Promise<void>;

  private send(key: KeyInfo, down: boolean): void {
    if (this.tabId === undefined) return;
    this.post(key, down).catch((error: unknown) => this.onError((error as Error).message ?? String(error)));
  }

  tap(key: KeyInfo): void {
    this.send(key, true);
    setTimeout(() => this.send(key, false), TAP_MS);
  }
  press(key: KeyInfo): void { this.send(key, true); }
  release(key: KeyInfo): void { this.send(key, false); }
  async dispose(): Promise<void> {}
}

/// Synthetische KeyboardEvents via het content script (isTrusted = false; geen waarschuwingsbalk).
export class ContentScriptSender extends BaseSender {
  readonly name = 'content';

  protected async post(key: KeyInfo, down: boolean): Promise<void> {
    const tabId = this.tabId;
    if (tabId === undefined) return;
    const message: KeyMessage = { type: 'motionkeys-key', phase: down ? 'down' : 'up', key: key.key, code: key.code, keyCode: key.keyCode };
    try {
      await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      // Tabblad stond al open vóór de extensie geïnstalleerd werd: content script alsnog injecteren.
      if (!/Receiving end does not exist|Could not establish connection/.test(String((error as Error).message))) throw error;
      await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content.js'] });
      await chrome.tabs.sendMessage(tabId, message);
    }
  }
}

/// Echte toetsen via het DevTools-protocol (isTrusted = true). Chrome toont dan de balk
/// "MotionKeys heeft foutopsporing gestart in deze browser".
export class DebuggerSender extends BaseSender {
  readonly name = 'debugger';
  private attachedTab: number | undefined;
  private attaching: Promise<void> | undefined;

  constructor(onError: (message: string) => void, readonly onDetached: (reason: string) => void) {
    super(onError);
    chrome.debugger.onDetach.addListener(this.handleDetach);
  }

  private handleDetach = (source: chrome.debugger.Debuggee, reason: string): void => {
    if (source.tabId !== undefined && source.tabId === this.attachedTab) {
      this.attachedTab = undefined;
      this.onDetached(reason);
    }
  };

  private async ensureAttached(tabId: number): Promise<void> {
    if (this.attachedTab === tabId) return;
    if (this.attaching) await this.attaching;
    if (this.attachedTab === tabId) return;
    this.attaching = (async () => {
      if (this.attachedTab !== undefined) await this.detach();
      await chrome.debugger.attach({ tabId }, '1.3');
      this.attachedTab = tabId;
    })();
    try { await this.attaching; } finally { this.attaching = undefined; }
  }

  protected async post(key: KeyInfo, down: boolean): Promise<void> {
    const tabId = this.tabId;
    if (tabId === undefined) return;
    await this.ensureAttached(tabId);
    const params: Record<string, unknown> = {
      type: down ? (key.text ? 'keyDown' : 'rawKeyDown') : 'keyUp',
      key: key.key,
      code: key.code,
      windowsVirtualKeyCode: key.keyCode,
      nativeVirtualKeyCode: key.keyCode,
    };
    if (down && key.text) { params.text = key.text; params.unmodifiedText = key.text; }
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', params);
  }

  private async detach(): Promise<void> {
    const tabId = this.attachedTab;
    this.attachedTab = undefined;
    if (tabId === undefined) return;
    try { await chrome.debugger.detach({ tabId }); } catch { /* al losgekoppeld */ }
  }

  override async dispose(): Promise<void> {
    chrome.debugger.onDetach.removeListener(this.handleDetach);
    await this.detach();
  }
}
