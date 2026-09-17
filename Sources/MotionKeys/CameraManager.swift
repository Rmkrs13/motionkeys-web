import AVFoundation
import os

private let cameraLog = Logger(subsystem: "be.larslars.motionkeys", category: "camera")

enum CameraError: LocalizedError {
    case noCamera, cannotAddInput, cannotAddOutput

    var errorDescription: String? {
        switch self {
        case .noCamera: return "Geen camera gevonden."
        case .cannotAddInput: return "Camera kan niet gebruikt worden."
        case .cannotAddOutput: return "Camerabeeld kan niet gelezen worden."
        }
    }
}

/// Levert camerabeelden (BGRA, 640×480) af op de opgegeven serial queue.
final class CameraManager: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    var onFrame: ((CVPixelBuffer, TimeInterval) -> Void)?

    private let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "be.larslars.motionkeys.session")
    private let frameQueue: DispatchQueue
    private var configured = false
    /// uniqueID van de gewenste camera (uit de instellingen); leeg = automatisch (ingebouwde camera).
    var preferredDeviceID: String = ""
    private(set) var activeDeviceID: String?

    init(frameQueue: DispatchQueue) {
        self.frameQueue = frameQueue
    }

    /// Alle beschikbare camera's: ingebouwd, USB (extern) en iPhone (Continuity Camera).
    static func availableDevices() -> [AVCaptureDevice] {
        AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInWideAngleCamera, .external, .continuityCamera], mediaType: .video, position: .unspecified
        ).devices
    }

    /// Andere camera kiezen. Draait de sessie, dan wordt ze herstart met de nieuwe camera.
    func select(deviceID: String) {
        preferredDeviceID = deviceID
        guard configured, deviceID != (activeDeviceID ?? "") else { return }
        let wasRunning = session.isRunning
        sessionQueue.sync { [session] in
            if session.isRunning { session.stopRunning() }
        }
        session.beginConfiguration()
        for input in session.inputs { session.removeInput(input) }
        for output in session.outputs { session.removeOutput(output) }
        session.commitConfiguration()
        configured = false
        if wasRunning { try? start() }
    }

    static func requestAccess() async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: return true
        case .notDetermined: return await AVCaptureDevice.requestAccess(for: .video)
        default: return false
        }
    }

    func start() throws {
        if !configured { try configure() }
        sessionQueue.async { [session] in
            if !session.isRunning { session.startRunning() }
        }
    }

    func stop() {
        sessionQueue.async { [session] in
            if session.isRunning { session.stopRunning() }
        }
    }

    private func configure() throws {
        session.beginConfiguration()
        defer { session.commitConfiguration() }

        let env = ProcessInfo.processInfo.environment
        let preset: AVCaptureSession.Preset
        switch env["MOTIONKEYS_PRESET"] {
        case "720p": preset = .hd1280x720
        case "1080p": preset = .hd1920x1080
        case "high": preset = .high
        case "low": preset = .low
        default: preset = .vga640x480
        }
        if session.canSetSessionPreset(preset) {
            session.sessionPreset = preset
        }

        // Voorkeur voor de ingebouwde camera (niet de iPhone via Continuity Camera).
        let discovery = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInWideAngleCamera, .continuityCamera, .external], mediaType: .video, position: .unspecified
        )
        var chosen = discovery.devices.first(where: { $0.deviceType == .builtInWideAngleCamera }) ?? discovery.devices.first
        if !preferredDeviceID.isEmpty, let match = discovery.devices.first(where: { $0.uniqueID == preferredDeviceID }) {
            chosen = match   // keuze uit de instellingen
        }
        if let wanted = env["MOTIONKEYS_CAMERA"]?.lowercased(), !wanted.isEmpty,
           let match = discovery.devices.first(where: { $0.localizedName.lowercased().contains(wanted) }) {
            chosen = match   // omgevingsvariabele wint (voor testen)
        }
        guard let device = chosen ?? AVCaptureDevice.default(for: .video) else {
            throw CameraError.noCamera
        }

        let input = try AVCaptureDeviceInput(device: device)
        guard session.canAddInput(input) else { throw CameraError.cannotAddInput }
        session.addInput(input)
        activeDeviceID = device.uniqueID
        if let wanted = env["MOTIONKEYS_FORMAT"].flatMap(Int32.init) {
            // Rechtstreeks een cameraformaat kiezen (breedte), i.p.v. via de session preset.
            if let format = device.formats.first(where: { CMVideoFormatDescriptionGetDimensions($0.formatDescription).width == wanted }) {
                do {
                    try device.lockForConfiguration()
                    device.activeFormat = format
                    device.unlockForConfiguration()
                } catch {}
            }
        }
        if env["MOTIONKEYS_FPS"] != "0" { preferHighestFrameRate(device) }
        let dims = CMVideoFormatDescriptionGetDimensions(device.activeFormat.formatDescription)
        cameraLog.info("camera \(device.localizedName, privacy: .public) \(dims.width)x\(dims.height) maxFrameDuration \(device.activeVideoMaxFrameDuration.seconds * 1000, format: .fixed(precision: 1)) ms; centerStage \(device.isCenterStageActive) portrait \(device.isPortraitEffectActive) studioLight \(device.isStudioLightActive) reactions \(AVCaptureDevice.reactionEffectsEnabled) reactionGestures \(AVCaptureDevice.reactionEffectGesturesEnabled)")

        let output = AVCaptureVideoDataOutput()
        output.alwaysDiscardsLateVideoFrames = true
        output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
        output.setSampleBufferDelegate(self, queue: frameQueue)
        guard session.canAddOutput(output) else { throw CameraError.cannotAddOutput }
        session.addOutput(output)

        configured = true
    }

    /// Zet de camera op de hoogste framerate (max 60 fps) en verhindert dat hij
    /// bij weinig licht terugvalt naar 15 fps, wat de vertraging verdubbelt.
    private func preferHighestFrameRate(_ device: AVCaptureDevice) {
        let ranges = device.activeFormat.videoSupportedFrameRateRanges
        guard let best = ranges.max(by: { $0.maxFrameRate < $1.maxFrameRate }) else { return }
        let fps = min(best.maxFrameRate, 60)
        let duration = CMTime(value: 1, timescale: CMTimeScale(fps.rounded()))
        do {
            try device.lockForConfiguration()
            device.activeVideoMinFrameDuration = duration
            device.activeVideoMaxFrameDuration = duration
            device.unlockForConfiguration()
        } catch {
            // Niet fataal: dan gebruiken we de standaard framerate.
        }
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let time = CMSampleBufferGetPresentationTimeStamp(sampleBuffer).seconds
        onFrame?(pixelBuffer, time)
    }
}
