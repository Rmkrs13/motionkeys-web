import AppKit
import Combine
import CoreImage
import Vision
import os

private let latencyLog = Logger(subsystem: "be.larslars.motionkeys", category: "latency")
private let traceLog = Logger(subsystem: "be.larslars.motionkeys", category: "trace")

/// Verbindt camera → pose-detectie → gesture-engine → toetsen, en publiceert state voor de UI.
final class TrackingController: ObservableObject {
    @Published var isTracking = false
    @Published var frameImage: CGImage?
    /// Gewrichten in gespiegelde, genormaliseerde coördinaten (x gespiegeld, y origin linksonder).
    @Published var joints: [JointName: CGPoint] = [:]
    @Published var status: EngineStatus = .idle
    @Published var lateral: LateralState = .center
    @Published var lateralLines: (left: Double, right: Double)?
    @Published var flash: String?
    @Published var errorMessage: String?
    @Published var accessibilityGranted = true
    @Published var cameraDenied = false
    /// Muis boven het paneel (gezet door FirstMouseHostingView); toont de knoppen tijdens tracking.
    @Published var hovering = false
    /// Toetsen en gevoeligheid; wijzigingen worden hieronder via Combine op de engine toegepast.
    let settings = SettingsStore()
    private var cancellables: Set<AnyCancellable> = []
    /// Kopie van de mapping voor de processing-queue.
    private var mapping = KeyMapping()

    private let processingQueue = DispatchQueue(label: "be.larslars.motionkeys.processing", qos: .userInteractive)
    private lazy var camera = CameraManager(frameQueue: processingQueue)
    private let detector = PoseDetector()
    private let engine = GestureEngine()
    private let ciContext = CIContext(options: [.useSoftwareRenderer: false])
    private var frameCounter = 0
    private var flashWorkItem: DispatchWorkItem?
    /// Toetsen die momenteel ingedrukt zijn (modus "vasthouden"); alleen op processingQueue.
    private var heldKeys: Set<CGKeyCode> = []

    init() {
        camera.onFrame = { [weak self] pixelBuffer, time in
            self?.handleFrame(pixelBuffer, time: time)
        }
        applyMapping()
        settings.$sensitivity.dropFirst()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.applyMapping() }
            .store(in: &cancellables)
        settings.$mapping.dropFirst()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.applyMapping() }
            .store(in: &cancellables)
        camera.preferredDeviceID = settings.cameraID
        settings.$cameraID.dropFirst()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] id in
                guard let self else { return }
                self.camera.select(deviceID: id)
                if self.isTracking { self.recalibrate() }
            }
            .store(in: &cancellables)
    }

    private func applyMapping() {
        let mapping = settings.mapping
        var thresholds = Thresholds.scaled(by: settings.sensitivity)
        thresholds.duckEnabled = mapping.duckEnabled
        thresholds.jumpOnDip = mapping.effectiveAnticipateJump
        processingQueue.async { [weak self] in
            guard let self else { return }
            self.releaseHeldKeys()
            self.mapping = mapping
            self.engine.thresholds = thresholds
        }
    }

    // Op processingQueue.
    private func releaseHeldKeys() {
        for key in heldKeys { KeySender.release(key) }
        heldKeys = []
    }

    // Op processingQueue.
    private func perform(_ event: GestureEvent) {
        let binding = mapping[event.action]
        guard let key = binding.key.keyCode else { return }
        switch (binding.mode, event.phase) {
        case (.tap, .start):
            KeySender.tap(key)
        case (.hold, .start):
            KeySender.press(key)
            heldKeys.insert(key)
        case (.hold, .end):
            KeySender.release(key)
            heldKeys.remove(key)
        case (.tap, .end):
            break
        }
    }

    func toggle() {
        if isTracking { stop() } else { start() }
    }

    func start() {
        Task { @MainActor in
            guard await CameraManager.requestAccess() else {
                cameraDenied = true
                errorMessage = "Geen toegang tot de camera."
                return
            }
            cameraDenied = false
            accessibilityGranted = KeySender.isTrusted(prompt: true)
            processingQueue.async { [engine] in engine.reset() }
            do {
                try camera.start()
            } catch {
                errorMessage = error.localizedDescription
                return
            }
            errorMessage = nil
            isTracking = true
        }
    }

    func stop() {
        camera.stop()
        processingQueue.async { [weak self] in
            self?.releaseHeldKeys()
            self?.engine.reset()
        }
        isTracking = false
        frameImage = nil
        joints = [:]
        status = .idle
        lateral = .center
        lateralLines = nil
        flash = nil
    }

    func recalibrate() {
        processingQueue.async { [weak self] in
            self?.releaseHeldKeys()
            self?.engine.reset()
        }
    }

    // Wordt aangeroepen op processingQueue.
    private func handleFrame(_ pixelBuffer: CVPixelBuffer, time: TimeInterval) {
        let t0 = CACurrentMediaTime()
        let pose = detector.detect(in: pixelBuffer, time: time)
        let t1 = CACurrentMediaTime()
        let events = engine.process(pose, time: time)
        if engine.status == .tracking { traceLog.debug("\(self.engine.trace, privacy: .public)") }

        for event in events {
            perform(event)
        }
        let t2 = CACurrentMediaTime()
        if !events.isEmpty || frameCounter % 60 == 0 {
            let cameraMs = (t0 - time) * 1000, visionMs = (t1 - t0) * 1000, totalMs = (t2 - time) * 1000
            let eventText = events.isEmpty ? "" : " [" + events.map(\.description).joined(separator: ",") + (events.contains(.start(.jump)) ? " via \(engine.lastJumpRoute)" : "") + "]"
            latencyLog.info("camera→app \(cameraMs, format: .fixed(precision: 0)) ms, vision \(visionMs, format: .fixed(precision: 0)) ms, totaal \(totalMs, format: .fixed(precision: 0)) ms\(eventText, privacy: .public)")
        }

        let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
        let cgImage = ciContext.createCGImage(ciImage, from: ciImage.extent)
        let mirrored = pose?.points.mapValues { CGPoint(x: 1 - $0.x, y: $0.y) } ?? [:]
        let status = engine.status
        let lateral = engine.lateral
        let lines = engine.lateralLines

        frameCounter += 1
        let trusted: Bool? = frameCounter % 30 == 0 ? KeySender.isTrusted(prompt: false) : nil

        DispatchQueue.main.async { [weak self] in
            guard let self, self.isTracking else { return }
            self.frameImage = cgImage
            self.joints = mirrored
            self.status = status
            self.lateral = lateral
            self.lateralLines = lines
            if let trusted { self.accessibilityGranted = trusted }
            if let last = events.last(where: { $0.phase == .start }) { self.showFlash(last.action.flash) }
        }
    }

    private func showFlash(_ text: String) {
        flash = text
        flashWorkItem?.cancel()
        let item = DispatchWorkItem { [weak self] in self?.flash = nil }
        flashWorkItem = item
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6, execute: item)
    }
}
