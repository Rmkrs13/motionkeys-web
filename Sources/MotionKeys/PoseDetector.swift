import Vision

typealias JointName = VNHumanBodyPoseObservation.JointName

/// Eén gedetecteerde pose. Punten zijn genormaliseerd (0…1), origin linksonder, NIET gespiegeld.
struct PoseFrame {
    var points: [JointName: CGPoint]
    var time: TimeInterval
}

final class PoseDetector {
    var minConfidence: Float = 0.3
    private let request = VNDetectHumanBodyPoseRequest()

    func detect(in pixelBuffer: CVPixelBuffer, time: TimeInterval) -> PoseFrame? {
        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: .up, options: [:])
        do {
            try handler.perform([request])
        } catch {
            return nil
        }
        guard let observations = request.results, !observations.isEmpty else { return nil }

        // Bij meerdere personen: neem degene met de grootste romp (dichtst bij de camera).
        var best: (points: [JointName: CGPoint], size: CGFloat)?
        for observation in observations {
            guard let all = try? observation.recognizedPoints(.all) else { continue }
            var points: [JointName: CGPoint] = [:]
            for (name, point) in all where point.confidence >= minConfidence {
                points[name] = point.location
            }
            guard !points.isEmpty else { continue }
            let size = BodyMetrics.torsoHeight(from: points) ?? 0
            if best == nil || size > best!.size {
                best = (points, size)
            }
        }
        guard let best else { return nil }
        return PoseFrame(points: best.points, time: time)
    }
}
