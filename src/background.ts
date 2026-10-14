// Service worker: opent het paneelvenster, houdt bij welk tabblad het spel is en ruimt op als het paneel sluit.
import { SESSION_KEYS } from './settings';

const PANEL_WIDTH = 420;
const PANEL_HEIGHT = 360;

async function getPanelWindowId(): Promise<number | undefined> {
  const stored = await chrome.storage.session.get(SESSION_KEYS.panelWindowId);
  const id = stored[SESSION_KEYS.panelWindowId] as number | undefined;
  if (id === undefined) return undefined;
  try {
    await chrome.windows.get(id);
    return id;
  } catch {
    await chrome.storage.session.remove(SESSION_KEYS.panelWindowId);
    return undefined;
  }
}

async function openPanel(): Promise<void> {
  const existing = await getPanelWindowId();
  if (existing !== undefined) {
    await chrome.windows.update(existing, { focused: true });
    return;
  }
  const win = await chrome.windows.create({
    url: chrome.runtime.getURL('panel.html'),
    type: 'popup',
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
  });
  if (win?.id !== undefined) await chrome.storage.session.set({ [SESSION_KEYS.panelWindowId]: win.id });
}

/// Onthoud het actieve tabblad van het laatst gefocuste gewone venster (niet het paneel zelf).
async function rememberGameTab(windowId: number): Promise<void> {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  try {
    const win = await chrome.windows.get(windowId);
    if (win.type !== 'normal') return;
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (tab?.id !== undefined) await chrome.storage.session.set({ [SESSION_KEYS.lastGameTabId]: tab.id });
  } catch { /* venster al weg */ }
}

/// Debugger-koppelingen die het paneel niet meer kon opruimen (venster hard gesloten).
async function detachAllDebuggers(): Promise<void> {
  const targets = await chrome.debugger.getTargets();
  for (const t of targets) {
    if (t.attached && t.tabId !== undefined) {
      try { await chrome.debugger.detach({ tabId: t.tabId }); } catch { /* al los */ }
    }
  }
}

chrome.action.onClicked.addListener(() => { void openPanel(); });

chrome.tabs.onActivated.addListener(({ windowId }) => { void rememberGameTab(windowId); });
chrome.windows.onFocusChanged.addListener((windowId) => { void rememberGameTab(windowId); });

chrome.windows.onRemoved.addListener((windowId) => {
  void (async () => {
    const stored = await chrome.storage.session.get(SESSION_KEYS.panelWindowId);
    if (stored[SESSION_KEYS.panelWindowId] === windowId) {
      await chrome.storage.session.remove(SESSION_KEYS.panelWindowId);
      await detachAllDebuggers();
    }
  })();
});

chrome.runtime.onInstalled.addListener(() => {
  // Bij (her)installatie het huidige tabblad als startdoel nemen.
  void chrome.windows.getLastFocused({ windowTypes: ['normal'] }).then((w) => { if (w.id !== undefined) void rememberGameTab(w.id); });
});
