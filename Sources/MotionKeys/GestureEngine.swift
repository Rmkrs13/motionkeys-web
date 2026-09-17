import Foundation

/// Begin of einde van een beweging. Tik-toetsen reageren op het begin, vasthoud-toetsen op beide.
struct GestureEvent: Equatable, CustomStringConvertible {
    enum Phase { case start, end }
    var action: Action
    var phase: Phase

    static func start(_ a: Action) -> GestureEvent { GestureEvent(action: a, phase: .start) }
    static func end(_ a: Action) -> GestureEvent { GestureEvent(action: a, phase: .end) }

    var description: String { action.rawValue + (phase == .start ? "" : "-einde") }
}

/// `moving`: net een stap gedaan, wachten tot je stilstaat; dan wordt je nieuwe positie de referentie.
enum LateralState { case center, left, right, moving }

enum EngineStatus: Equatable {
    case idle
    case calibrating(progress: Double)
    case tracking
    case noBody
}

/// Alle drempels, uitgedrukt in veelvouden van de romphoogte (schouders → heupen),
/// zodat ze onafhankelijk zijn van je afstand tot de camera.
struct Thresholds {
    var calibrationFrames = 30            // ≈ 1 s bij 30 fps
    var lateralEnter = 0.3                // stap opzij: |dx| > 0.3 × romphoogte t.o.v. je laatste rustpositie → tik (trage stap)
    var lateralRepeat = 0.9               // grote stap: elke 0.9 × romphoogte een extra tik (twee banen in één beweging; een gewone stap is 0.3–0.8)
    var lateralSettleVelocity = 0.5       // na een stap: "stilstaan" = zijwaarts trager dan 0.5 × romphoogte/s …
    var lateralSettleFrames = 3           // … gedurende zoveel frames; dan wordt je positie de nieuwe referentie
    var lateralSettleTimeout: TimeInterval = 1.0  // of uiterlijk na 1.0 s
    var lateralStillVelocity = 0.3        // in rust: referentie schuift traag mee met langzaam drijven (< 0.3 × romphoogte/s)
    var lateralRefAlpha = 0.02
    var lateralStrict: TimeInterval = 0.4 // na een stap: zo lang geen buk-route "laag aanhouden" en strenge sprongdrempel (je stapt licht gebogen)
    var lateralVelocity = 0.35            // óf: zijwaarts sneller dan 0.35 × romphoogte per seconde over de laatste 2 frames (vroege trigger)
    var lateralMinShift = 0.03            // … en al minstens 0.03 × romphoogte uit de referentie
    var lateralMinShiftAirborne = 0.10    // tijdens/vlak na een sprong: geen glitch-filter (een sprong is zelf explosief), wel iets meer verschuiving
    var lateralPriorVelocity = 0.2        // … en het vorige frame bewoog al dezelfde kant op (> 0.2): een stap versnelt geleidelijk, een glitch springt uit stilstand
    var lateralSpike = 1.5                // versnelling > 1.5 × romphoogte/s tussen twee frames = pose-glitch: dat frame en het volgende triggeren niet (echte stap ≤ 0.5)
    var lateralReverseFrames = 2          // omkeren tijdens een stap pas na zoveel frames bevestiging
    var jumpEnter = 0.08                  // heupen of schouders > 0.08 × romphoogte boven baseline → "in de lucht"
    var jumpVelocity = 1.5                // heupen of schouders stijgen sneller dan 1.5 × romphoogte per seconde (afzet; echte afzet haalt 3–5; rechtkomen/stappen halen ≤ 1.7 maar vallen in de strenge vensters)
    var jumpMinRise = 0.02                // … en minstens 0.02 × romphoogte in dat venster (ruisfilter)
    var jumpVelocityAfterLanding = 2.2    // strengere afzetdrempel kort na een landing, tijdens/na bukken en bij een stap opzij: veer/rechtkomen haalt ±1.7, een echte afzet 3+
    var landingStrict: TimeInterval = 0.6 // hoe lang die strengere drempel geldt en de dip-anticipatie uit staat na een landing
    var pendingTimeout: TimeInterval = 0.6 // na een verstuurde spatie: hoe lang we op de afzet wachten voor we weer klaar staan (valse dip)
    var jumpWindow = 2                    // aantal frames waarover de stijging gemeten wordt (≈ 66 ms)
    var jumpExit = 0.04                   // hoogte-route: opnieuw klaar zodra heupen < 0.04 × romphoogte
    var jumpCooldown: TimeInterval = 0.25

    // Anticipatie: de spatie al sturen bij de dip (door de knieën zakken) vlak vóór de afzet.
    // Compenseert de cameravertraging (±140 ms). Nadeel: snel bukken telt ook als sprong.
    var jumpOnDip = true
    /// Bukken (alleen actief als er een toets aan hangt; sluit de dip-anticipatie uit).
    /// De dip vóór een sprong gaat tot ±0.28 romphoogte; bukken moet duidelijk dieper.
    var duckEnabled = false
    var duckEnter = 0.4                   // heupen óf schouders > 0.4 × romphoogte onder de baseline → bukken
    var duckExit = 0.15                   // terug rechtop zodra beide < 0.15 × romphoogte onder de baseline
    var duckRecoverTimeout: TimeInterval = 1.0  // na het rechtkomen: geen sprong tot je stilstaat (of uiterlijk na 1 s)
    var duckSlowEnter = 0.3               // … óf minder diep (0.3) maar minstens duckSlowHold aangehouden
    var duckSlowHold: TimeInterval = 0.15 // (de dip vóór een sprong zit hooguit 1 frame zo diep; kort na een landing telt enkel de diepe route)
    var dipVelocity = 0.6                 // heupen én schouders dalen sneller dan 0.6 × romphoogte per seconde
    var dipRecentlySettled: TimeInterval = 0.5    // … en je stond hooguit 0.5 s geleden nog stil
    var settleVelocity = 0.3              // "stilstaan" = trager dan 0.3 × romphoogte per seconde, dicht bij de grond
    var baselineAlpha = 0.03              // aanpassing van de hoogte-baseline in rust (volgt een gebogen speelhouding in ±1–2 s)
    var baselineMaxShift = 0.35           // … zolang je minder dan 0.35 × romphoogte onder/boven de baseline staat (een buk wordt niet gevolgd)
    var bodyLostTimeout: TimeInterval = 1.0
}

extension Thresholds {
    /// Drempels geschaald met de gevoeligheid uit de instellingen (factor > 1 = drempels lager = gevoeliger).
    static func scaled(by s: Sensitivity) -> Thresholds {
        var t = Thresholds()
        t.jumpVelocity /= s.jump
        t.jumpVelocityAfterLanding /= s.jump
        t.dipVelocity /= s.jump
        t.duckEnter /= s.duck
        t.duckSlowEnter /= s.duck
        t.duckSlowHold /= s.duck
        t.lateralVelocity /= s.lateral
        t.lateralMinShift /= s.lateral
        t.lateralMinShiftAirborne /= s.lateral
        t.lateralEnter /= s.lateral
        t.lateralPriorVelocity /= s.lateral
        return t
    }
}

struct Baseline {
    var centerX: Double
    var hipY: Double
    var shoulderY: Double
    var torsoHeight: Double
}

/// Meetwaarden uit één pose. `centerX` is al gespiegeld (links op scherm = kleine x).
struct BodyMetrics {
    var centerX: Double
    var hipY: Double
    var shoulderY: Double
    var torsoHeight: Double

    static func torsoHeight(from points: [JointName: CGPoint]) -> CGFloat? {
        let shoulderY = average([points[.leftShoulder]?.y, points[.rightShoulder]?.y]) ?? points[.neck]?.y
        let hipY = average([points[.leftHip]?.y, points[.rightHip]?.y]) ?? points[.root]?.y
        guard let shoulderY, let hipY, shoulderY - hipY > 0.05 else { return nil }
        return shoulderY - hipY
    }

    init?(points: [JointName: CGPoint]) {
        guard let torso = BodyMetrics.torsoHeight(from: points) else { return nil }
        // Mediaan i.p.v. gemiddelde: één verspringend gewricht (pose-glitch) trekt het middelpunt dan niet mee.
        let xs = [points[.leftShoulder]?.x, points[.rightShoulder]?.x, points[.leftHip]?.x, points[.rightHip]?.x,
                  points[.neck]?.x, points[.root]?.x]
        guard let rawX = BodyMetrics.median(xs) else { return nil }
        let hipY = BodyMetrics.average([points[.leftHip]?.y, points[.rightHip]?.y]) ?? points[.root]?.y ?? 0
        let shoulderY = BodyMetrics.average([points[.leftShoulder]?.y, points[.rightShoulder]?.y]) ?? points[.neck]?.y ?? (hipY + torso)
        self.centerX = 1 - Double(rawX)   // spiegelen
        self.hipY = Double(hipY)
        self.shoulderY = Double(shoulderY)
        self.torsoHeight = Double(torso)
    }

    private static func median(_ values: [CGFloat?]) -> CGFloat? {
        let sorted = values.compactMap { $0 }.sorted()
        guard !sorted.isEmpty else { return nil }
        let mid = sorted.count / 2
        return sorted.count % 2 == 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
    }

    private static func average(_ values: [CGFloat?]) -> CGFloat? {
        let present = values.compactMap { $0 }
        guard !present.isEmpty else { return nil }
        return present.reduce(0, +) / CGFloat(present.count)
    }
}

/// State machine: kalibratie → tracking, met hysterese voor links/rechts en springen.
/// Niet thread-safe: altijd vanaf dezelfde (serial) queue aanroepen.
final class GestureEngine: @unchecked Sendable {
    var thresholds = Thresholds()

    private(set) var status: EngineStatus = .idle
    private(set) var lateral: LateralState = .center
    private(set) var baseline: Baseline?

    private var samples: [BodyMetrics] = []
    private var hipHistory: [(time: TimeInterval, y: Double)] = []
    private var shoulderHistory: [(time: TimeInterval, y: Double)] = []
    private var xHistory: [(time: TimeInterval, x: Double)] = []
    /// Referentie-x voor links/rechts: je laatste rustpositie (niet het kalibratiemidden).
    private var lateralRef = 0.5
    private var lateralMovedAt: TimeInterval = -.infinity
    private var lateralStillFrames = 0
    private var lateralDirection: Action = .left
    private var lastLateralEnd: TimeInterval = -.infinity
    private var lastFrameVelocity = 0.0      // 1-frame zijwaartse snelheid van het vorige frame
    private var lastFrameWasSpike = false
    private var reverseFrames = 0
    private enum JumpState {
        case ground, pending(since: TimeInterval), airborne
        var isGround: Bool { if case .ground = self { return true } else { return false } }
    }
    private var jumpState: JumpState = .ground
    private(set) var ducking = false
    private var lowSince: TimeInterval?
    /// Na het rechtkomen uit een buk: sprongdetectie uit tot je stilstaat (rechtkomen is geen afzet).
    private var duckRecoverSince: TimeInterval?
    private var lastJumpTime: TimeInterval = -.infinity
    private var lastSettledTime: TimeInterval = -.infinity
    private var lastLandingTime: TimeInterval = -.infinity
    /// Via welke route de laatste sprong getriggerd werd (voor het log): "dip", "afzet" of "hoogte".
    private(set) var lastJumpRoute = ""
    /// Meetspoor van het laatste frame (voor het debug-log): t, dy, dyS, vHip, vSh in romphoogtes, en de toestand.
    private(set) var trace = ""
    private var lastBodyTime: TimeInterval?
    private var bodyLost = false

    /// Gespiegelde, genormaliseerde x-posities van de links/rechts-drempels (voor de overlay).
    var lateralLines: (left: Double, right: Double)? {
        guard let b = baseline else { return nil }
        let d = thresholds.lateralEnter * b.torsoHeight
        return (lateralRef - d, lateralRef + d)
    }

    func reset() {
        status = .idle
        lateral = .center
        baseline = nil
        samples = []
        hipHistory = []
        shoulderHistory = []
        xHistory = []
        jumpState = .ground
        ducking = false
        lowSince = nil
        duckRecoverSince = nil
        lastJumpTime = -.infinity
        lastSettledTime = -.infinity
        lastLandingTime = -.infinity
        lastBodyTime = nil
        bodyLost = false
    }

    func process(_ frame: PoseFrame?, time: TimeInterval) -> [GestureEvent] {
        guard let frame, let metrics = BodyMetrics(points: frame.points) else {
            if let last = lastBodyTime, time - last > thresholds.bodyLostTimeout, !bodyLost {
                bodyLost = true
                status = .noBody
                lateral = .center
                hipHistory = []
            } else if lastBodyTime == nil, status == .idle {
                status = .noBody
            }
            return []
        }

        lastBodyTime = time
        if bodyLost {
            bodyLost = false
            startCalibration()
        }

        switch status {
        case .idle, .noBody:
            startCalibration()
            return calibrate(metrics)
        case .calibrating:
            return calibrate(metrics)
        case .tracking:
            return track(metrics, time: time)
        }
    }

    private func startCalibration() {
        samples = []
        hipHistory = []
        shoulderHistory = []
        xHistory = []
        lateral = .center
        jumpState = .ground
        ducking = false
        lowSince = nil
        duckRecoverSince = nil
        lastLandingTime = -.infinity
        status = .calibrating(progress: 0)
    }

    private func calibrate(_ m: BodyMetrics) -> [GestureEvent] {
        samples.append(m)
        let n = thresholds.calibrationFrames
        status = .calibrating(progress: Double(samples.count) / Double(n))
        if samples.count >= n {
            baseline = Baseline(
                centerX: median(samples.map(\.centerX)),
                hipY: median(samples.map(\.hipY)),
                shoulderY: median(samples.map(\.shoulderY)),
                torsoHeight: median(samples.map(\.torsoHeight))
            )
            samples = []
            lateralRef = baseline!.centerX
            lateralStillFrames = 0
            lastLateralEnd = -.infinity
            lastFrameVelocity = 0
            lastFrameWasSpike = false
            reverseFrames = 0
            status = .tracking
        }
        return []
    }

    private func track(_ m: BodyMetrics, time: TimeInterval) -> [GestureEvent] {
        guard var b = baseline else { return [] }
        let t = thresholds
        let h = b.torsoHeight
        let dy = m.hipY - b.hipY
        let dyShoulder = m.shoulderY - b.shoulderY
        var events: [GestureEvent] = []

        // Links / rechts: één tik per stap, gemeten t.o.v. je laatste rustpositie (niet het midden).
        // Na een stap wachten we tot je stilstaat; die positie wordt dan de nieuwe referentie,
        // zodat je meerdere stappen dezelfde kant op kunt doen zonder terug te keren.
        // Triggert vroeg op een snelle zijwaartse beweging (2-frame venster, robuust tegen 1-frame glitches),
        // of anders op afstand (trage stap). Schuif je in één beweging door, dan telt elke 0.9 romphoogte opnieuw.
        xHistory.append((time, m.centerX))
        if xHistory.count > 3 { xHistory.removeFirst() }
        var xVelocity = 0.0          // over 2 frames
        var frameVelocity = 0.0      // over 1 frame
        if let first = xHistory.first, let last = xHistory.last, last.time > first.time {
            xVelocity = (last.x - first.x) / (last.time - first.time)
        }
        if xHistory.count >= 2 {
            let a = xHistory[xHistory.count - 2], b = xHistory[xHistory.count - 1]
            if b.time > a.time { frameVelocity = (b.x - a.x) / (b.time - a.time) }
        }
        let spike = abs(frameVelocity - lastFrameVelocity) > t.lateralSpike * h
        // Tijdens en vlak na een sprong is de beweging zelf explosief: dan geen glitch-filter en geen "vorig frame"-eis.
        let inAir = !jumpState.isGround || time - lastLandingTime < t.landingStrict
        let clean = inAir || (!spike && !lastFrameWasSpike)
        let minShift = (inAir ? t.lateralMinShiftAirborne : t.lateralMinShift) * h
        let prior = inAir ? 0 : t.lateralPriorVelocity * h
        let dxRef = m.centerX - lateralRef
        let fastLeft = clean && xVelocity < -t.lateralVelocity * h && dxRef < -minShift && lastFrameVelocity < -prior
        let fastRight = clean && xVelocity > t.lateralVelocity * h && dxRef > minShift && lastFrameVelocity > prior

        func step(_ direction: Action) {
            lateral = .moving
            lateralDirection = direction
            lateralMovedAt = time
            lateralStillFrames = 0
            reverseFrames = 0
            lateralRef = m.centerX   // voorlopig; wordt bijgesteld zodra je stilstaat
            events.append(.start(direction))
        }

        if lateral == .moving {
            // Omkeren tijdens de beweging mag, maar pas na een paar frames bevestiging (glitches keren ook om).
            let reversing: Bool
            switch lateralDirection {
            case .left: reversing = clean && frameVelocity > t.lateralPriorVelocity * h && xVelocity > t.lateralVelocity * h
            case .right: reversing = clean && frameVelocity < -t.lateralPriorVelocity * h && xVelocity < -t.lateralVelocity * h
            default: reversing = false
            }
            reverseFrames = reversing ? reverseFrames + 1 : 0
            if reverseFrames >= t.lateralReverseFrames, lateralDirection == .left, dxRef > t.lateralMinShift * h {
                events.append(.end(.left)); step(.right)
            } else if reverseFrames >= t.lateralReverseFrames, lateralDirection == .right, dxRef < -t.lateralMinShift * h {
                events.append(.end(.right)); step(.left)
            } else if abs(dxRef) > t.lateralRepeat * h {
                // Doorschuiven: volgende baan.
                events.append(.end(lateralDirection)); step(lateralDirection)
            } else {
                lateralStillFrames = abs(xVelocity) < t.lateralSettleVelocity * h ? lateralStillFrames + 1 : 0
                if lateralStillFrames >= t.lateralSettleFrames || time - lateralMovedAt > t.lateralSettleTimeout {
                    lateralRef = m.centerX
                    lateral = .center
                    lastLateralEnd = time
                    events.append(.end(lateralDirection))
                }
            }
        } else if dxRef < -t.lateralEnter * h || fastLeft {
            step(.left)
        } else if dxRef > t.lateralEnter * h || fastRight {
            step(.right)
        } else if abs(xVelocity) < t.lateralStillVelocity * h {
            lateralRef += t.lateralRefAlpha * dxRef   // langzaam drijven volgen
        }
        lastFrameVelocity = frameVelocity
        lastFrameWasSpike = spike
        let sideways = lateral == .moving || time - lastLateralEnd < t.lateralStrict

        // Springen. Toestandsmachine: grond → (spatie verstuurd) → in de lucht → landing → grond.
        // Vanaf de grond zijn er drie routes, in volgorde van snelheid:
        //  1. dip: door de knieën zakken vlak vóór de afzet (±250 ms vóór de voeten loskomen);
        //  2. afzet: heupen of schouders stijgen snel (gemeten over de laatste paar frames);
        //  3. hoogte: heupen én schouders duidelijk boven de baseline (trage sprong, vangnet).
        // Na een landing veert het lichaam (±1.7 romphoogte/s) en komt het recht; dat is geen sprong.
        // Een echte tweede sprong meteen na de landing zet af met 3+ romphoogte/s: die laten we door.
        // De dip vóór zo'n tweede sprong is niet te onderscheiden van de landing zelf, dus geen anticipatie daar.
        hipHistory.append((time, m.hipY))
        shoulderHistory.append((time, m.shoulderY))
        if hipHistory.count > t.jumpWindow + 1 { hipHistory.removeFirst() }
        if shoulderHistory.count > t.jumpWindow + 1 { shoulderHistory.removeFirst() }

        func rise(_ history: [(time: TimeInterval, y: Double)]) -> (velocity: Double, rise: Double) {
            guard let first = history.first, let last = history.last, last.time > first.time else { return (0, 0) }
            let r = last.y - first.y
            return (r / (last.time - first.time), r)
        }
        let hip = rise(hipHistory), shoulder = rise(shoulderHistory)
        let windowVelocity = max(hip.velocity, shoulder.velocity)
        let windowRise = hip.velocity >= shoulder.velocity ? hip.rise : shoulder.rise
        let isHigh = dy > t.jumpEnter * h || dyShoulder > t.jumpEnter * h
        let isLow = dy < t.jumpExit * h && dyShoulder < t.jumpExit * h

        // Toestand bijwerken: verstuurd → in de lucht zodra we boven de baseline zitten (of time-out bij een valse dip);
        // in de lucht → grond zodra heupen én schouders terug beneden zijn.
        switch jumpState {
        case .pending(let since):
            if isHigh { jumpState = .airborne }
            else if time - since > t.pendingTimeout { jumpState = .ground; events.append(.end(.jump)) }
        case .airborne:
            if isLow {
                jumpState = .ground
                lastLandingTime = time
                events.append(.end(.jump))
            }
        case .ground:
            if isHigh, time - lastLandingTime > t.landingStrict { jumpState = .airborne }  // sprong zonder trigger (bv. heel traag)
        }

        // Streng (alleen een onmiskenbare afzet telt): kort na een landing, tijdens en kort na een buk
        // (rechtkomen is geen sprong) en bij een stap opzij (heupen wippen mee).
        let sinceLanding = time - lastLandingTime
        let strict = sinceLanding < t.landingStrict || ducking || sideways
        let riseThreshold = strict ? t.jumpVelocityAfterLanding : t.jumpVelocity
        let fastTakeoff = windowVelocity > riseThreshold * h && windowRise > t.jumpMinRise * h

        // Stilstaan dicht bij de grond bijhouden (nodig om een dip te onderscheiden van een landing).
        let speed = max(abs(hip.velocity), abs(shoulder.velocity))
        if speed < t.settleVelocity * h, dy < 0.05 * h {
            lastSettledTime = time
        }
        let downVelocity = min(hip.velocity, shoulder.velocity)
        let dip = t.jumpOnDip && !t.duckEnabled
            && downVelocity < -t.dipVelocity * h
            && min(hip.rise, shoulder.rise) < -t.jumpMinRise * h
            && dy < 0.05 * h
            && time - lastSettledTime < t.dipRecentlySettled
            && !strict

        // Herstel na een buk: pas weer springen als je stilstaat dicht bij je normale hoogte.
        if let since = duckRecoverSince {
            if (speed < t.settleVelocity * h && dy > -0.1 * h) || time - since > t.duckRecoverTimeout {
                duckRecoverSince = nil
            }
        }

        var onGround = false
        if case .ground = jumpState { onGround = true }
        let canJump = onGround && !ducking && duckRecoverSince == nil
        if canJump, time - lastJumpTime > t.jumpCooldown, dip || fastTakeoff {
            events.append(.start(.jump))
            lastJumpRoute = dip ? "dip" : "afzet"
            lastJumpTime = time
            jumpState = .pending(since: time)
        }

        // Bukken: duidelijk dieper dan de dip vóór een sprong, en alleen op de grond.
        if t.duckEnabled {
            let deep = dy < -t.duckEnter * h || dyShoulder < -t.duckEnter * h
            let low = dy < -t.duckSlowEnter * h || dyShoulder < -t.duckSlowEnter * h
            let upright = dy > -t.duckExit * h && dyShoulder > -t.duckExit * h
            if low, jumpState.isGround, !sideways, sinceLanding > t.landingStrict {
                if lowSince == nil { lowSince = time }
            } else {
                lowSince = nil
            }
            let heldLow = lowSince.map { time - $0 > t.duckSlowHold } ?? false
            if !ducking, deep || heldLow, jumpState.isGround {
                ducking = true
                events.append(.start(.duck))
            } else if ducking, upright {
                ducking = false
                events.append(.end(.duck))
                duckRecoverSince = time   // rechtkomen uit een buk is geen afzet: eerst stilstaan
                lastLandingTime = time
            }
        }

        var stateCode = 0
        switch jumpState {
        case .ground: stateCode = 0
        case .pending: stateCode = 1
        case .airborne: stateCode = 2
        }
        trace = String(format: "t=%.3f dy=%.3f dyS=%.3f vHip=%.2f vSh=%.2f dx=%.3f vX=%.2f v1=%.2f lat=%d state=%d duck=%d strict=%d settled=%.2f ev=%@",
                       time, dy / h, dyShoulder / h, hip.velocity / h, shoulder.velocity / h,
                       dxRef / h, xVelocity / h, frameVelocity / h, lateral == .moving ? 1 : 0,
                       stateCode, ducking ? 1 : 0, strict ? 1 : 0,
                       min(time - lastSettledTime, 9.99), events.map(\.description).joined(separator: ","))

        // Baseline langzaam laten meebewegen wanneer je rustig in het midden staat
        // (vangt dichter/verder van de camera op).
        if !sideways, onGround, !ducking, speed < t.settleVelocity * h,
           abs(dy) < t.baselineMaxShift * h, abs(dyShoulder) < t.baselineMaxShift * h {
            b.hipY += t.baselineAlpha * dy
            b.shoulderY += t.baselineAlpha * dyShoulder
            b.torsoHeight += t.baselineAlpha * (m.torsoHeight - h)
            baseline = b
        }

        return events
    }

    private func median(_ values: [Double]) -> Double {
        let sorted = values.sorted()
        guard !sorted.isEmpty else { return 0 }
        let mid = sorted.count / 2
        return sorted.count % 2 == 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
    }
}
