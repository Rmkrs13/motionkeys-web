import AppKit
import AVFoundation
import SwiftUI

/// Instellingen: modus (preset) en per beweging de toets en of die getikt of vastgehouden wordt.
/// Dit staat in een gewoon venster (niet in het zwevende paneel), zodat systeem-pickers normaal renderen.
struct SettingsView: View {
    @ObservedObject var settings: SettingsStore
    @State private var cameras: [(id: String, name: String)] = []

    private var presetSelection: Binding<String> {
        Binding(
            get: { settings.mapping.matchingPresetID ?? "custom" },
            set: { id in
                if let preset = KeyMapping.presets.first(where: { $0.id == id }) {
                    settings.mapping = preset.mapping
                }
            }
        )
    }

    var body: some View {
        Form {
            Section("Camera") {
                HStack {
                    Picker("Camera", selection: $settings.cameraID) {
                        Text("Automatisch (ingebouwde camera)").tag("")
                        ForEach(cameras, id: \.id) { cam in
                            Text(cam.name).tag(cam.id)
                        }
                        if !settings.cameraID.isEmpty, !cameras.contains(where: { $0.id == settings.cameraID }) {
                            Text("Niet aangesloten camera").tag(settings.cameraID)
                        }
                    }
                    .labelsHidden()
                    Button("Vernieuwen") { refreshCameras() }
                }
                Text("USB-webcams en een iPhone (Continuity Camera) verschijnen hier zodra ze aangesloten zijn. Een USB-camera met 60 fps heeft doorgaans minder vertraging dan de ingebouwde. Wisselen kan ook tijdens het tracken; de app kalibreert dan opnieuw.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Modus") {
                Picker("Modus", selection: presetSelection) {
                    ForEach(KeyMapping.presets) { preset in
                        Text(preset.name).tag(preset.id)
                    }
                    Text("Aangepast").tag("custom")
                }
                .labelsHidden()
            }

            Section("Toetsen per beweging") {
                ForEach(Action.allCases) { action in
                    row(for: action)
                }
                Text("Tik: korte toetsaanslag bij het begin van de beweging. Vasthouden: toets blijft ingedrukt zolang je de beweging aanhoudt (bv. bukken in het dino-spel).")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Springen") {
                Toggle("Sprong anticiperen: toets al bij het zakken vóór de afzet", isOn: Binding(
                    get: { settings.mapping.effectiveAnticipateJump },
                    set: { settings.mapping.anticipateJump = $0 }
                ))
                    .disabled(settings.mapping.duckEnabled)
                Text(settings.mapping.duckEnabled
                     ? "Uitgeschakeld zolang bukken een toets heeft: zakken zou anders altijd als sprong tellen. De sprong wordt dan bij de afzet zelf gestuurd (±250 ms later)."
                     : "Stuurt de sprongtoets ±250 ms vroeger, wat de cameravertraging compenseert. Snel door de knieën zakken telt dan ook als sprong.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Gevoeligheid") {
                sensitivityRow("Springen", value: $settings.sensitivity.jump)
                sensitivityRow("Bukken", value: $settings.sensitivity.duck)
                sensitivityRow("Opzij", value: $settings.sensitivity.lateral)
                HStack {
                    Text("100 % is de standaard, afgestemd op gemeten sprongen en stappen. Hoger reageert vroeger maar geeft sneller valse bewegingen.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("Standaard") { settings.sensitivity = Sensitivity() }
                        .disabled(settings.sensitivity == Sensitivity())
                }
            }

            Section("Bukken") {
                Text("Bukken telt zodra je heupen of schouders ruim een derde van je romphoogte zakken (dieper dan de dip vóór een sprong), of iets minder diep (0,3) maar dan minstens 0,15 s lang. Tijdens een buk en tot je na het rechtkomen even stilstaat, wordt geen sprong herkend. Zet de toets op \"Geen\" om bukken uit te schakelen.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .frame(width: 520)
        .fixedSize(horizontal: false, vertical: true)
        .onAppear(perform: refreshCameras)
        .onReceive(NotificationCenter.default.publisher(for: .AVCaptureDeviceWasConnected)) { _ in refreshCameras() }
        .onReceive(NotificationCenter.default.publisher(for: .AVCaptureDeviceWasDisconnected)) { _ in refreshCameras() }
    }

    private func refreshCameras() {
        cameras = CameraManager.availableDevices().map { ($0.uniqueID, $0.localizedName) }
    }

    private func sensitivityRow(_ label: String, value: Binding<Double>) -> some View {
        HStack {
            Text(label)
                .frame(width: 100, alignment: .leading)
            Slider(value: value, in: Sensitivity.range, step: 0.05)
            Text("\(Int((value.wrappedValue * 100).rounded())) %")
                .monospacedDigit()
                .frame(width: 50, alignment: .trailing)
        }
    }

    private func row(for action: Action) -> some View {
        HStack {
            Text(action.label)
                .frame(width: 100, alignment: .leading)
            Picker("Toets", selection: Binding(
                get: { settings.mapping[action].key },
                set: { settings.mapping[action].key = $0 }
            )) {
                ForEach(KeyChoice.allCases) { key in
                    Text(key.label).tag(key)
                }
            }
            .labelsHidden()
            .frame(width: 170)
            Picker("Modus", selection: Binding(
                get: { settings.mapping[action].mode },
                set: { settings.mapping[action].mode = $0 }
            )) {
                ForEach(KeyMode.allCases) { mode in
                    Text(mode.label).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .frame(width: 160)
            .disabled(settings.mapping[action].key == .none)
        }
    }
}

/// Gewoon venster voor de instellingen; wordt hergebruikt zolang de app draait.
final class SettingsWindowController {
    private var window: NSWindow?
    private let controller: TrackingController

    init(controller: TrackingController) {
        self.controller = controller
    }

    func show() {
        if window == nil {
            let hosting = NSHostingController(rootView: SettingsView(settings: controller.settings))
            let window = NSWindow(contentViewController: hosting)
            window.title = "MotionKeys – Instellingen"
            window.styleMask = [.titled, .closable]
            window.isReleasedWhenClosed = false
            window.level = .floating
            window.center()
            self.window = window
        }
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
    }
}
