import AppKit
import ApplicationServices
import CoreGraphics

enum KeySender {
    /// Controleert (en vraagt optioneel) Toegankelijkheid-toegang, nodig om toetsen te posten.
    static func isTrusted(prompt: Bool) -> Bool {
        let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        return AXIsProcessTrustedWithOptions([key: prompt] as CFDictionary)
    }

    private static func post(_ key: CGKeyCode, down: Bool) {
        let source = CGEventSource(stateID: .hidSystemState)
        guard let event = CGEvent(keyboardEventSource: source, virtualKey: key, keyDown: down) else { return }
        event.post(tap: .cghidEventTap)
    }

    /// Korte tik: key down, ~40 ms later key up (games registreren dat betrouwbaarder dan 0 ms).
    static func tap(_ key: CGKeyCode) {
        post(key, down: true)
        DispatchQueue.global(qos: .userInteractive).asyncAfter(deadline: .now() + 0.04) {
            post(key, down: false)
        }
    }

    static func press(_ key: CGKeyCode) { post(key, down: true) }
    static func release(_ key: CGKeyCode) { post(key, down: false) }

    static func openAccessibilitySettings() {
        let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")!
        NSWorkspace.shared.open(url)
    }

    static func openCameraSettings() {
        let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera")!
        NSWorkspace.shared.open(url)
    }
}
