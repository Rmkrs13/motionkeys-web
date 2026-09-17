import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var panel: FloatingPanel?
    private let controller = TrackingController()
    private lazy var settings = SettingsWindowController(controller: controller)

    func applicationDidFinishLaunching(_ notification: Notification) {
        let panel = FloatingPanel(controller: controller, openSettings: { [weak self] in self?.settings.show() })
        self.panel = panel
        panel.orderFrontRegardless()

        if ProcessInfo.processInfo.environment["MOTIONKEYS_AUTOSTART"] == "1" {
            controller.start()
        }
        if ProcessInfo.processInfo.environment["MOTIONKEYS_SETTINGS"] == "1" {
            settings.show()
        }

        NotificationCenter.default.addObserver(
            forName: NSWindow.willCloseNotification, object: panel, queue: .main
        ) { [weak self] _ in
            self?.controller.stop()
            NSApp.terminate(nil)
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        controller.stop()
    }
}
