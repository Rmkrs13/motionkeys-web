import AppKit
import SwiftUI

/// Zwevend venster dat altijd bovenop blijft en de app NIET activeert
/// als je erop klikt, zodat de gesimuleerde toetsen bij de game terechtkomen.
final class FloatingPanel: NSPanel {
    init(controller: TrackingController, openSettings: @escaping () -> Void) {
        let size = NSSize(width: 360, height: 270)
        super.init(
            contentRect: NSRect(origin: .zero, size: size),
            styleMask: [.nonactivatingPanel, .borderless, .resizable],
            backing: .buffered,
            defer: false
        )
        title = "MotionKeys"
        isFloatingPanel = true
        // Eén niveau boven .floating, zodat andere zwevende overlays (bv. LanguageTool) geen klikken afvangen.
        level = NSWindow.Level(rawValue: NSWindow.Level.floating.rawValue + 1)
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        isMovableByWindowBackground = true
        hidesOnDeactivate = false
        becomesKeyOnlyIfNeeded = true
        isReleasedWhenClosed = false
        contentAspectRatio = NSSize(width: 4, height: 3)
        minSize = NSSize(width: 240, height: 180)
        isOpaque = false
        backgroundColor = .clear
        hasShadow = true
        appearance = NSAppearance(named: .darkAqua)

        let hosting = FirstMouseHostingView(rootView: OverlayView(controller: controller, openSettings: openSettings))
        hosting.onHover = { [weak controller] inside in
            DispatchQueue.main.async { controller?.hovering = inside }
        }
        contentView = hosting
        positionBottomRight()
    }

    private func positionBottomRight() {
        guard let screen = NSScreen.main else { center(); return }
        let vf = screen.visibleFrame
        let margin: CGFloat = 24
        let origin = NSPoint(x: vf.maxX - frame.width - margin, y: vf.minY + margin)
        setFrameOrigin(origin)
    }
}

/// Zorgt dat de eerste klik op een knop meteen aankomt, ook al is het venster niet actief,
/// en meldt hover aan de controller (SwiftUI's onHover is niet betrouwbaar in een niet-actief paneel).
final class FirstMouseHostingView<Content: View>: NSHostingView<Content> {
    var onHover: ((Bool) -> Void)?
    private var trackingArea: NSTrackingArea?

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let trackingArea { removeTrackingArea(trackingArea) }
        let area = NSTrackingArea(rect: .zero, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect], owner: self)
        addTrackingArea(area)
        trackingArea = area
    }

    override func mouseEntered(with event: NSEvent) { onHover?(true) }
    override func mouseExited(with event: NSEvent) { onHover?(false) }
}
