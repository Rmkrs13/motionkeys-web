import AppKit

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
// Accessory: geen Dock-icoon, en opstarten steelt geen focus van de game.
app.setActivationPolicy(.accessory)
app.run()
