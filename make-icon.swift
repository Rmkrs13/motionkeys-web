// Genereert Resources/AppIcon.icns: afgeronde tegel met verloop, een lopend figuur en de pijltjestoetsen.
// Uitvoeren: swift make-icon.swift   (eenmalig; build.sh kopieert het .icns in de app)
import AppKit

let size: CGFloat = 1024
let image = NSImage(size: NSSize(width: size, height: size), flipped: false) { rect in
    // macOS-icoonvorm: tegel van ±80 % met transparante rand, hoekstraal ±22 %.
    let inset = size * 0.1
    let tile = rect.insetBy(dx: inset, dy: inset)
    let path = NSBezierPath(roundedRect: tile, xRadius: tile.width * 0.2237, yRadius: tile.width * 0.2237)

    // Schaduw + verloop
    NSGraphicsContext.saveGraphicsState()
    let shadow = NSShadow()
    shadow.shadowColor = NSColor.black.withAlphaComponent(0.35)
    shadow.shadowBlurRadius = size * 0.02
    shadow.shadowOffset = NSSize(width: 0, height: -size * 0.01)
    shadow.set()
    NSColor(calibratedRed: 0.10, green: 0.55, blue: 0.35, alpha: 1).setFill()
    path.fill()
    NSGraphicsContext.restoreGraphicsState()

    let gradient = NSGradient(colors: [
        NSColor(calibratedRed: 0.20, green: 0.80, blue: 0.45, alpha: 1),
        NSColor(calibratedRed: 0.05, green: 0.42, blue: 0.30, alpha: 1),
    ])!
    gradient.draw(in: path, angle: -70)

    // Lopend figuur (SF Symbol) in wit, met zachte schaduw
    let config = NSImage.SymbolConfiguration(pointSize: size * 0.50, weight: .bold)
    if let symbol = NSImage(systemSymbolName: "figure.run", accessibilityDescription: nil)?
        .withSymbolConfiguration(config) {
        let tinted = NSImage(size: symbol.size, flipped: false) { r in
            symbol.draw(in: r)
            NSColor.white.set()
            r.fill(using: .sourceAtop)
            return true
        }
        let s = tinted.size
        let scale = (tile.height * 0.60) / s.height
        let w = s.width * scale, h = s.height * scale
        let origin = NSPoint(x: tile.midX - w / 2 - tile.width * 0.02, y: tile.midY - h / 2 + tile.height * 0.10)
        NSGraphicsContext.saveGraphicsState()
        let sh = NSShadow()
        sh.shadowColor = NSColor.black.withAlphaComponent(0.25)
        sh.shadowBlurRadius = size * 0.015
        sh.shadowOffset = NSSize(width: 0, height: -size * 0.006)
        sh.set()
        tinted.draw(in: NSRect(x: origin.x, y: origin.y, width: w, height: h))
        NSGraphicsContext.restoreGraphicsState()
    }

    // Vier toetsjes onderaan: ← ↑ ↓ →
    let keyW = tile.width * 0.13, keyH = keyW * 0.85, gap = tile.width * 0.03
    let totalW = keyW * 4 + gap * 3
    var x = tile.midX - totalW / 2
    let y = tile.minY + tile.height * 0.11
    let labels = ["←", "↑", "↓", "→"]
    let font = NSFont.systemFont(ofSize: keyH * 0.62, weight: .heavy)
    for label in labels {
        let keyRect = NSRect(x: x, y: y, width: keyW, height: keyH)
        let keyPath = NSBezierPath(roundedRect: keyRect, xRadius: keyW * 0.18, yRadius: keyW * 0.18)
        NSColor.white.withAlphaComponent(0.92).setFill()
        keyPath.fill()
        let attrs: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: NSColor(calibratedRed: 0.05, green: 0.35, blue: 0.25, alpha: 1),
        ]
        let str = NSAttributedString(string: label, attributes: attrs)
        let ts = str.size()
        str.draw(at: NSPoint(x: keyRect.midX - ts.width / 2, y: keyRect.midY - ts.height / 2))
        x += keyW + gap
    }
    return true
}

// PNG's voor de iconset
let out = "build/AppIcon.iconset"
try? FileManager.default.removeItem(atPath: out)
try! FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)
func write(_ px: Int, _ name: String) {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                               colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    image.draw(in: NSRect(x: 0, y: 0, width: px, height: px), from: .zero, operation: .copy, fraction: 1)
    NSGraphicsContext.restoreGraphicsState()
    try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "\(out)/\(name).png"))
}
for (pt, scale) in [(16, 1), (16, 2), (32, 1), (32, 2), (128, 1), (128, 2), (256, 1), (256, 2), (512, 1), (512, 2)] {
    write(pt * scale, scale == 1 ? "icon_\(pt)x\(pt)" : "icon_\(pt)x\(pt)@2x")
}
print("iconset geschreven naar \(out)")
