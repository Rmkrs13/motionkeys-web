import Foundation
import CoreGraphics

/// De bewegingen die de engine herkent. Elke beweging heeft een begin en (waar zinvol) een einde.
enum Action: String, CaseIterable, Codable, Identifiable {
    case jump, duck, left, right

    var id: String { rawValue }

    var label: String {
        switch self {
        case .jump: return "Springen"
        case .duck: return "Bukken"
        case .left: return "Stap links"
        case .right: return "Stap rechts"
        }
    }

    /// Tekst die kort in het paneel oplicht bij het begin van de beweging.
    var flash: String {
        switch self {
        case .jump: return "SPRONG"
        case .duck: return "BUKKEN"
        case .left: return "← LINKS"
        case .right: return "RECHTS →"
        }
    }
}

/// Toetsen die je aan een beweging kunt koppelen (macOS virtual key codes).
enum KeyChoice: String, CaseIterable, Codable, Identifiable {
    case none, space, up, down, left, right, enter, shift, tab
    case w, a, s, d, q, z, x, c, e, f

    var id: String { rawValue }

    var label: String {
        switch self {
        case .none: return "Geen"
        case .space: return "Spatie"
        case .up: return "Pijl omhoog ↑"
        case .down: return "Pijl omlaag ↓"
        case .left: return "Pijl links ←"
        case .right: return "Pijl rechts →"
        case .enter: return "Enter"
        case .shift: return "Shift"
        case .tab: return "Tab"
        default: return rawValue.uppercased()
        }
    }

    var keyCode: CGKeyCode? {
        switch self {
        case .none: return nil
        case .space: return 49
        case .up: return 126
        case .down: return 125
        case .left: return 123
        case .right: return 124
        case .enter: return 36
        case .shift: return 56
        case .tab: return 48
        case .w: return 13
        case .a: return 0
        case .s: return 1
        case .d: return 2
        case .q: return 12
        case .z: return 6
        case .x: return 7
        case .c: return 8
        case .e: return 14
        case .f: return 3
        }
    }
}

/// Tik: korte toetsaanslag bij het begin van de beweging.
/// Vasthouden: toets ingedrukt zolang de beweging duurt (bv. bukken in het dino-spel).
enum KeyMode: String, CaseIterable, Codable, Identifiable {
    case tap, hold

    var id: String { rawValue }

    var label: String {
        switch self {
        case .tap: return "Tik"
        case .hold: return "Vasthouden"
        }
    }
}

struct ActionBinding: Codable, Equatable {
    var key: KeyChoice
    var mode: KeyMode
}

/// Welke toets bij welke beweging hoort, plus de sprong-anticipatie.
struct KeyMapping: Codable, Equatable {
    var jump = ActionBinding(key: .space, mode: .tap)
    var duck = ActionBinding(key: .down, mode: .hold)
    var left = ActionBinding(key: .left, mode: .tap)
    var right = ActionBinding(key: .right, mode: .tap)
    /// Spatie al sturen bij het zakken vóór de afzet. Kan alleen als bukken geen toets heeft:
    /// anders is elke buk-beweging ook een sprong.
    var anticipateJump = true

    subscript(action: Action) -> ActionBinding {
        get {
            switch action {
            case .jump: return jump
            case .duck: return duck
            case .left: return left
            case .right: return right
            }
        }
        set {
            switch action {
            case .jump: jump = newValue
            case .duck: duck = newValue
            case .left: left = newValue
            case .right: right = newValue
            }
        }
    }

    var duckEnabled: Bool { duck.key != .none }
    /// Anticipatie is alleen actief zonder bukken.
    var effectiveAnticipateJump: Bool { anticipateJump && !duckEnabled }

    // MARK: - Modi (presets)

    struct Preset: Identifiable {
        let id: String
        let name: String
        let mapping: KeyMapping
    }

    static let presets: [Preset] = [
        Preset(id: "dino-fast", name: "Dino snel (spatie, anticipatie, geen bukken)",
               mapping: KeyMapping(jump: .init(key: .space, mode: .tap), duck: .init(key: .none, mode: .hold),
                                   left: .init(key: .left, mode: .tap), right: .init(key: .right, mode: .tap), anticipateJump: true)),
        Preset(id: "dino-duck", name: "Dino met bukken (spatie / pijl omlaag)",
               mapping: KeyMapping(jump: .init(key: .space, mode: .tap), duck: .init(key: .down, mode: .hold),
                                   left: .init(key: .left, mode: .tap), right: .init(key: .right, mode: .tap), anticipateJump: true)),
        Preset(id: "subway", name: "Subway Surfers (↑ springen, ↓ rollen, ← → baan)",
               mapping: KeyMapping(jump: .init(key: .up, mode: .tap), duck: .init(key: .down, mode: .tap),
                                   left: .init(key: .left, mode: .tap), right: .init(key: .right, mode: .tap), anticipateJump: true)),
        Preset(id: "arrows", name: "Pijltjes (↑ ↓ ← →, bukken vasthouden)",
               mapping: KeyMapping(jump: .init(key: .up, mode: .tap), duck: .init(key: .down, mode: .hold),
                                   left: .init(key: .left, mode: .tap), right: .init(key: .right, mode: .tap), anticipateJump: true)),
        Preset(id: "wasd", name: "WASD",
               mapping: KeyMapping(jump: .init(key: .w, mode: .tap), duck: .init(key: .s, mode: .hold),
                                   left: .init(key: .a, mode: .tap), right: .init(key: .d, mode: .tap), anticipateJump: true)),
    ]

    var matchingPresetID: String? { Self.presets.first { $0.mapping == self }?.id }

    // MARK: - Bewaren

    private static let defaultsKey = "keyMapping"

    static func load() -> KeyMapping {
        guard let data = UserDefaults.standard.data(forKey: defaultsKey),
              let mapping = try? JSONDecoder().decode(KeyMapping.self, from: data)
        else { return KeyMapping() }
        return mapping
    }

    func save() {
        if let data = try? JSONEncoder().encode(self) {
            UserDefaults.standard.set(data, forKey: Self.defaultsKey)
        }
    }
}

/// Gevoeligheid per beweging als factor (1.0 = de gemeten standaard). Hoger = vroeger/gemakkelijker triggeren.
struct Sensitivity: Codable, Equatable {
    var jump = 1.0
    var duck = 1.0
    var lateral = 1.0

    static let range = 0.5...2.0

    private static let defaultsKey = "sensitivity"

    static func load() -> Sensitivity {
        guard let data = UserDefaults.standard.data(forKey: defaultsKey),
              let value = try? JSONDecoder().decode(Sensitivity.self, from: data)
        else { return Sensitivity() }
        return value
    }

    func save() {
        if let data = try? JSONEncoder().encode(self) {
            UserDefaults.standard.set(data, forKey: Self.defaultsKey)
        }
    }
}

/// Instellingen als eigen ObservableObject, los van de TrackingController: die publiceert 30×/s een camerabeeld,
/// en een view die hem observeert zou dus 30×/s hertekenen. Dit object publiceert alleen bij een wijziging.
final class SettingsStore: ObservableObject {
    @Published var mapping: KeyMapping = KeyMapping.load() {
        didSet { if mapping != oldValue { mapping.save() } }
    }
    @Published var sensitivity: Sensitivity = Sensitivity.load() {
        didSet { if sensitivity != oldValue { sensitivity.save() } }
    }
    /// uniqueID van de gekozen camera; leeg = automatisch (ingebouwde camera).
    @Published var cameraID: String = UserDefaults.standard.string(forKey: "cameraID") ?? "" {
        didSet { if cameraID != oldValue { UserDefaults.standard.set(cameraID, forKey: "cameraID") } }
    }
}
