// Service worker: koppelt het zijpaneel aan het icoon en ruimt debugger-koppelingen op bij het opstarten.

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
}

chrome.runtime.onInstalled.addListener(() => { setup(); void detachAllDebuggers(); });
chrome.runtime.onStartup.addListener(() => { setup(); void detachAllDebuggers(); });
setup();
