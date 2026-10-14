// Service worker: opent het zijpaneel bij een klik op het icoon, houdt bij welk tabblad het spel is
// en ruimt debugger-koppelingen op bij het opstarten.
import { SESSION_KEYS } from './settings';

/// Onthoud het actieve tabblad van het laatst gefocuste gewone venster: het standaard-doel voor toetsen.
async function rememberGameTab(windowId: number): Promise<void> {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  try {
    const win = await chrome.windows.get(windowId);
    if (win.type !== 'normal') return;
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (tab?.id !== undefined) await chrome.storage.session.set({ [SESSION_KEYS.lastGameTabId]: tab.id });
  } catch { /* venster al weg */ }
}

/// Debugger-koppelingen die het paneel niet meer kon opruimen (browser hard gesloten).
async function detachAllDebuggers(): Promise<void> {
  const targets = await chrome.debugger.getTargets();
  for (const t of targets) {
    if (t.attached && t.tabId !== undefined) {
      try { await chrome.debugger.detach({ tabId: t.tabId }); } catch { /* al los */ }
    }
  }
}

function setup(): void {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  void chrome.windows.getLastFocused({ windowTypes: ['normal'] }).then((w) => { if (w.id !== undefined) void rememberGameTab(w.id); });
}

chrome.runtime.onInstalled.addListener(() => { setup(); void detachAllDebuggers(); });
chrome.runtime.onStartup.addListener(() => { setup(); void detachAllDebuggers(); });
setup();

chrome.tabs.onActivated.addListener(({ windowId }) => { void rememberGameTab(windowId); });
chrome.windows.onFocusChanged.addListener((windowId) => { void rememberGameTab(windowId); });
