import SwiftUI
import Vision

struct OverlayView: View {
    @ObservedObject var controller: TrackingController
    var openSettings: () -> Void

    private static let bones: [(JointName, JointName)] = [
        (.nose, .neck),
        (.neck, .leftShoulder), (.neck, .rightShoulder),
        (.leftShoulder, .leftElbow), (.leftElbow, .leftWrist),
        (.rightShoulder, .rightElbow), (.rightElbow, .rightWrist),
        (.neck, .root),
        (.root, .leftHip), (.root, .rightHip),
        (.leftHip, .leftKnee), (.leftKnee, .leftAnkle),
        (.rightHip, .rightKnee), (.rightKnee, .rightAnkle),
    ]

    var body: some View {
        ZStack {
            Color.black

            if controller.isTracking {
                cameraLayer
            } else {
                idleLayer
            }

            VStack(spacing: 8) {
                topMessages
                Spacer()
                if showControls {
                    bottomBar.transition(.opacity)
                }
            }
            .padding(10)
        }
        .frame(minWidth: 240, minHeight: 180)
        .environment(\.colorScheme, .dark)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(alignment: .topTrailing) {
            if showControls { closeButton.transition(.opacity) }
        }
        .animation(.easeOut(duration: 0.15), value: showControls)
    }

    /// Knoppen en kruisje: altijd als tracking uit staat, anders alleen bij hoveren.
    private var showControls: Bool { !controller.isTracking || controller.hovering }

    /// De statuspil bovenaan alleen als er iets te melden is: opstarten, kalibreren, geen lichaam, of een stap die nog "zet".
    private var statusMessage: String? {
        switch controller.status {
        case .idle: return "Camera start…"
        case .calibrating(let progress): return "Kalibreren… sta stil in het midden (\(Int(progress * 100))%)"
        case .noBody: return "Geen lichaam gevonden"
        case .tracking: return nil
        }
    }

    private var closeButton: some View {
        Button {
            NSApp.terminate(nil)
        } label: {
            Image(systemName: "xmark")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 20, height: 20)
                .background(.black.opacity(0.55), in: Circle())
        }
        .buttonStyle(.plain)
        .padding(8)
        .help("Sluiten")
    }

    // MARK: - Lagen

    private var cameraLayer: some View {
        GeometryReader { geo in
            ZStack {
                if let image = controller.frameImage {
                    Image(decorative: image, scale: 1)
                        .resizable()
                        .scaledToFill()
                        .scaleEffect(x: -1, y: 1)   // spiegelen zoals in Teams
                        .frame(width: geo.size.width, height: geo.size.height)
                        .clipped()
                }
                Canvas { context, size in
                    drawOverlay(in: &context, size: size)
                }
            }
        }
    }

    private var idleLayer: some View {
        VStack(spacing: 6) {
            Image(systemName: "figure.walk.motion")
                .font(.system(size: 40))
                .foregroundStyle(.white.opacity(0.7))
            Text("Tracking uit")
                .font(.headline)
                .foregroundStyle(.white.opacity(0.7))
        }
    }

    private var topMessages: some View {
        VStack(spacing: 6) {
            if let flash = controller.flash {
                Text(flash)
                    .font(.system(size: 34, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.8), radius: 4)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 4)
                    .background(.green.opacity(0.75), in: Capsule())
                    .transition(.opacity)
            }

            if controller.isTracking, let statusMessage {
                Text(statusMessage)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(.black.opacity(0.55), in: Capsule())
            }

            if controller.isTracking, !controller.accessibilityGranted {
                warning("Toegankelijkheid nodig om toetsen te sturen", button: "Open instellingen") {
                    KeySender.openAccessibilitySettings()
                }
            }
            if controller.cameraDenied {
                warning("Geen cameratoegang", button: "Open instellingen") {
                    KeySender.openCameraSettings()
                }
            } else if let error = controller.errorMessage {
                warning(error, button: nil) {}
            }
        }
        .padding(.top, 4)
        .animation(.easeOut(duration: 0.15), value: controller.flash)
    }

    private var bottomBar: some View {
        HStack(spacing: 8) {
            Button {
                controller.toggle()
            } label: {
                Label(controller.isTracking ? "Stop" : "Start", systemImage: controller.isTracking ? "stop.fill" : "play.fill")
                    .frame(minWidth: 70)
            }
            .buttonStyle(PillButtonStyle(color: controller.isTracking ? .red : .green))

            Button {
                controller.recalibrate()
            } label: {
                Label("Kalibreer", systemImage: "scope")
            }
            .buttonStyle(PillButtonStyle(color: .white.opacity(0.25)))
            .disabled(!controller.isTracking)

            Spacer()

            Button {
                openSettings()
            } label: {
                Image(systemName: "gearshape.fill")
                    .frame(width: 14, height: 14)
            }
            .buttonStyle(PillButtonStyle(color: .white.opacity(0.25)))
            .help("Instellingen: modus en toetsen per beweging")

            Circle()
                .fill(controller.isTracking ? Color.green : Color.gray)
                .frame(width: 10, height: 10)
        }
        .padding(8)
        .background(.black.opacity(0.55), in: RoundedRectangle(cornerRadius: 10))
    }

    private func warning(_ text: String, button: String?, action: @escaping () -> Void) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
            Text(text).lineLimit(2)
            if let button {
                Button(button, action: action)
                    .buttonStyle(PillButtonStyle(color: .black.opacity(0.7), small: true))
            }
        }
        .font(.caption)
        .foregroundStyle(.black)
        .padding(8)
        .background(.yellow.opacity(0.9), in: RoundedRectangle(cornerRadius: 8))
    }

    // MARK: - Tekenen

    private func drawOverlay(in context: inout GraphicsContext, size: CGSize) {
        func point(_ p: CGPoint) -> CGPoint {
            CGPoint(x: p.x * size.width, y: (1 - p.y) * size.height)
        }

        // Drempellijnen links/rechts
        if let lines = controller.lateralLines {
            for x in [lines.left, lines.right] {
                var path = Path()
                path.move(to: CGPoint(x: x * size.width, y: 0))
                path.addLine(to: CGPoint(x: x * size.width, y: size.height))
                context.stroke(path, with: .color(.white.opacity(0.5)), style: StrokeStyle(lineWidth: 1, dash: [6, 6]))
            }
        }

        let joints = controller.joints
        guard !joints.isEmpty else { return }

        var skeleton = Path()
        for (a, b) in Self.bones {
            guard let pa = joints[a], let pb = joints[b] else { continue }
            skeleton.move(to: point(pa))
            skeleton.addLine(to: point(pb))
        }
        context.stroke(skeleton, with: .color(.green.opacity(0.7)), lineWidth: 2)

        for (_, p) in joints {
            let c = point(p)
            let rect = CGRect(x: c.x - 4, y: c.y - 4, width: 8, height: 8)
            context.fill(Path(ellipseIn: rect), with: .color(.green))
            context.stroke(Path(ellipseIn: rect), with: .color(.black.opacity(0.6)), lineWidth: 1)
        }
    }
}

/// Eigen knopstijl: altijd zichtbaar, onafhankelijk van systeem-materialen of vensterstatus.
struct PillButtonStyle: ButtonStyle {
    var color: Color
    var small = false

    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(small ? .caption.weight(.semibold) : .callout.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, small ? 8 : 12)
            .padding(.vertical, small ? 3 : 6)
            .background(color.opacity(configuration.isPressed ? 0.6 : 1), in: Capsule())
            .opacity(isEnabled ? 1 : 0.4)
            .contentShape(Capsule())
    }
}
