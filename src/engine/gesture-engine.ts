import type { Sensitivity } from './key-mapping';
import { describe, end, start } from './types';
import type { Action, EngineStatus, GestureEvent, Joints, LateralState, PoseFrame } from './types';

/// Alle drempels, uitgedrukt in veelvouden van de romphoogte (schouders → heupen),
/// zodat ze onafhankelijk zijn van je afstand tot de camera. Tijden in seconden.
export class Thresholds {
  calibrationFrames = 30;            // ≈ 1 s bij 30 fps
  lateralEnter = 0.3;                // stap opzij: |dx| > 0.3 × romphoogte t.o.v. je laatste rustpositie → tik (trage stap)
  lateralRepeat = 0.9;               // grote stap: elke 0.9 × romphoogte een extra tik (twee banen in één beweging; een gewone stap is 0.3–0.8)
  lateralSettleVelocity = 0.5;       // na een stap: "stilstaan" = zijwaarts trager dan 0.5 × romphoogte/s …
  lateralSettleFrames = 3;           // … gedurende zoveel frames; dan wordt je positie de nieuwe referentie
  lateralSettleTimeout = 1.0;        // of uiterlijk na 1.0 s
  lateralStillVelocity = 0.3;        // in rust: referentie schuift traag mee met langzaam drijven (< 0.3 × romphoogte/s)
  lateralRefAlpha = 0.02;
  lateralStrict = 0.4;               // na een stap: zo lang geen buk-route "laag aanhouden" en strenge sprongdrempel (je stapt licht gebogen)
  lateralVelocity = 0.35;            // óf: zijwaarts sneller dan 0.35 × romphoogte per seconde over de laatste 2 frames (vroege trigger)
  lateralMinShift = 0.03;            // … en al minstens 0.03 × romphoogte uit de referentie
  lateralMinShiftAirborne = 0.10;    // tijdens/vlak na een sprong: geen glitch-filter (een sprong is zelf explosief), wel iets meer verschuiving
  lateralPriorVelocity = 0.2;        // … en het vorige frame bewoog al dezelfde kant op (> 0.2): een stap versnelt geleidelijk, een glitch springt uit stilstand
  lateralSpike = 1.5;                // versnelling > 1.5 × romphoogte/s tussen twee frames = pose-glitch: dat frame en het volgende triggeren niet (echte stap ≤ 0.5)
  lateralReverseFrames = 2;          // omkeren tijdens een stap pas na zoveel frames bevestiging
  jumpEnter = 0.08;                  // heupen of schouders > 0.08 × romphoogte boven baseline → "in de lucht"
  jumpVelocity = 1.5;                // heupen of schouders stijgen sneller dan 1.5 × romphoogte per seconde (afzet; echte afzet haalt 3–5; rechtkomen/stappen halen ≤ 1.7 maar vallen in de strenge vensters)
  jumpMinRise = 0.02;                // … en minstens 0.02 × romphoogte in dat venster (ruisfilter)
  jumpVelocityAfterLanding = 2.2;    // strengere afzetdrempel kort na een landing, tijdens/na bukken en bij een stap opzij: veer/rechtkomen haalt ±1.7, een echte afzet 3+
  landingStrict = 0.6;               // hoe lang die strengere drempel geldt en de dip-anticipatie uit staat na een landing
  pendingTimeout = 0.6;              // na een verstuurde spatie: hoe lang we op de afzet wachten voor we weer klaar staan (valse dip)
  jumpWindow = 2;                    // aantal frames waarover de stijging gemeten wordt (≈ 66 ms)
  jumpExit = 0.04;                   // hoogte-route: opnieuw klaar zodra heupen < 0.04 × romphoogte
  jumpCooldown = 0.25;

  // Anticipatie: de spatie al sturen bij de dip (door de knieën zakken) vlak vóór de afzet.
  // Compenseert de cameravertraging (±140 ms). Nadeel: snel bukken telt ook als sprong.
  jumpOnDip = true;
  /// Bukken (alleen actief als er een toets aan hangt; sluit de dip-anticipatie uit).
  /// De dip vóór een sprong gaat tot ±0.28 romphoogte; bukken moet duidelijk dieper.
  duckEnabled = false;
  duckEnter = 0.4;                   // heupen óf schouders > 0.4 × romphoogte onder de baseline → bukken
  duckExit = 0.15;                   // terug rechtop zodra beide < 0.15 × romphoogte onder de baseline
  duckRecoverTimeout = 1.0;          // na het rechtkomen: geen sprong tot je stilstaat (of uiterlijk na 1 s)
  duckSlowEnter = 0.3;               // … óf minder diep (0.3) maar minstens duckSlowHold aangehouden
  duckSlowHold = 0.15;               // (de dip vóór een sprong zit hooguit 1 frame zo diep; kort na een landing telt enkel de diepe route)
  dipVelocity = 0.6;                 // heupen én schouders dalen sneller dan 0.6 × romphoogte per seconde
  dipRecentlySettled = 0.5;          // … en je stond hooguit 0.5 s geleden nog stil
  settleVelocity = 0.3;              // "stilstaan" = trager dan 0.3 × romphoogte per seconde, dicht bij de grond
  baselineAlpha = 0.03;              // aanpassing van de hoogte-baseline in rust (volgt een gebogen speelhouding in ±1–2 s)
  baselineMaxShift = 0.35;           // … zolang je minder dan 0.35 × romphoogte onder/boven de baseline staat (een buk wordt niet gevolgd)
  bodyLostTimeout = 1.0;

  /// Drempels geschaald met de gevoeligheid uit de instellingen (factor > 1 = drempels lager = gevoeliger).
  static scaled(s: Sensitivity): Thresholds {
    const t = new Thresholds();
    t.jumpVelocity /= s.jump;
    t.jumpVelocityAfterLanding /= s.jump;
    t.dipVelocity /= s.jump;
    t.duckEnter /= s.duck;
    t.duckSlowEnter /= s.duck;
    t.duckSlowHold /= s.duck;
    t.lateralVelocity /= s.lateral;
    t.lateralMinShift /= s.lateral;
    t.lateralMinShiftAirborne /= s.lateral;
    t.lateralEnter /= s.lateral;
    t.lateralPriorVelocity /= s.lateral;
    return t;
  }
}

export interface Baseline {
  centerX: number;
  hipY: number;
  shoulderY: number;
  torsoHeight: number;
}

function median(values: number[]): number | undefined {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return undefined;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function average(values: (number | undefined)[]): number | undefined {
  const present = values.filter((v): v is number => v !== undefined);
  if (present.length === 0) return undefined;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

/// Meetwaarden uit één pose. `centerX` is al gespiegeld (links op scherm = kleine x).
export interface BodyMetrics {
  centerX: number;
  hipY: number;
  shoulderY: number;
  torsoHeight: number;
}

export function torsoHeight(points: Joints): number | undefined {
  const shoulderY = average([points.leftShoulder?.y, points.rightShoulder?.y]) ?? points.neck?.y;
  const hipY = average([points.leftHip?.y, points.rightHip?.y]) ?? points.root?.y;
  if (shoulderY === undefined || hipY === undefined || shoulderY - hipY <= 0.05) return undefined;
  return shoulderY - hipY;
}

export function bodyMetrics(points: Joints): BodyMetrics | undefined {
  const torso = torsoHeight(points);
  if (torso === undefined) return undefined;
  // Mediaan i.p.v. gemiddelde: één verspringend gewricht (pose-glitch) trekt het middelpunt dan niet mee.
  const xs = [points.leftShoulder?.x, points.rightShoulder?.x, points.leftHip?.x, points.rightHip?.x, points.neck?.x, points.root?.x]
    .filter((v): v is number => v !== undefined);
  const rawX = median(xs);
  if (rawX === undefined) return undefined;
  const hipY = average([points.leftHip?.y, points.rightHip?.y]) ?? points.root?.y ?? 0;
  const shoulderY = average([points.leftShoulder?.y, points.rightShoulder?.y]) ?? points.neck?.y ?? hipY + torso;
  return { centerX: 1 - rawX /* spiegelen */, hipY, shoulderY, torsoHeight: torso };
}

type Sample = { time: number; v: number };
type JumpState = { kind: 'ground' } | { kind: 'pending'; since: number } | { kind: 'airborne' };

/// State machine: kalibratie → tracking, met hysterese voor links/rechts en springen.
export class GestureEngine {
  thresholds = new Thresholds();

  status: EngineStatus = { kind: 'idle' };
  lateral: LateralState = 'center';
  baseline: Baseline | undefined;
  ducking = false;
  /// Via welke route de laatste sprong getriggerd werd (voor het log): "dip" of "afzet".
  lastJumpRoute = '';
  /// Meetspoor van het laatste frame (voor het debug-log).
  trace = '';

  private samples: BodyMetrics[] = [];
  private hipHistory: Sample[] = [];
  private shoulderHistory: Sample[] = [];
  private xHistory: Sample[] = [];
  /// Referentie-x voor links/rechts: je laatste rustpositie (niet het kalibratiemidden).
  private lateralRef = 0.5;
  private lateralMovedAt = -Infinity;
  private lateralStillFrames = 0;
  private lateralDirection: Action = 'left';
  private lastLateralEnd = -Infinity;
  private lastFrameVelocity = 0;      // 1-frame zijwaartse snelheid van het vorige frame
  private lastFrameWasSpike = false;
  private reverseFrames = 0;
  private jumpState: JumpState = { kind: 'ground' };
  private lowSince: number | undefined;
  /// Na het rechtkomen uit een buk: sprongdetectie uit tot je stilstaat (rechtkomen is geen afzet).
  private duckRecoverSince: number | undefined;
  private lastJumpTime = -Infinity;
  private lastSettledTime = -Infinity;
  private lastLandingTime = -Infinity;
  private lastBodyTime: number | undefined;
  private bodyLost = false;

  /// Gespiegelde, genormaliseerde x-posities van de links/rechts-drempels (voor de overlay).
  get lateralLines(): { left: number; right: number } | undefined {
    const b = this.baseline;
    if (!b) return undefined;
    const d = this.thresholds.lateralEnter * b.torsoHeight;
    return { left: this.lateralRef - d, right: this.lateralRef + d };
  }

  reset(): void {
    this.status = { kind: 'idle' };
    this.lateral = 'center';
    this.baseline = undefined;
    this.samples = [];
    this.hipHistory = [];
    this.shoulderHistory = [];
    this.xHistory = [];
    this.jumpState = { kind: 'ground' };
    this.ducking = false;
    this.lowSince = undefined;
    this.duckRecoverSince = undefined;
    this.lastJumpTime = -Infinity;
    this.lastSettledTime = -Infinity;
    this.lastLandingTime = -Infinity;
    this.lastBodyTime = undefined;
    this.bodyLost = false;
  }

  process(frame: PoseFrame | undefined, time: number): GestureEvent[] {
    const metrics = frame ? bodyMetrics(frame.points) : undefined;
    if (!metrics) {
      if (this.lastBodyTime !== undefined && time - this.lastBodyTime > this.thresholds.bodyLostTimeout && !this.bodyLost) {
        this.bodyLost = true;
        this.status = { kind: 'noBody' };
        this.lateral = 'center';
        this.hipHistory = [];
      } else if (this.lastBodyTime === undefined && this.status.kind === 'idle') {
        this.status = { kind: 'noBody' };
      }
      return [];
    }

    this.lastBodyTime = time;
    if (this.bodyLost) {
      this.bodyLost = false;
      this.startCalibration();
    }

    switch (this.status.kind) {
      case 'idle':
      case 'noBody':
        this.startCalibration();
        return this.calibrate(metrics);
      case 'calibrating':
        return this.calibrate(metrics);
      case 'tracking':
        return this.track(metrics, time);
    }
  }

  private startCalibration(): void {
    this.samples = [];
    this.hipHistory = [];
    this.shoulderHistory = [];
    this.xHistory = [];
    this.lateral = 'center';
    this.jumpState = { kind: 'ground' };
    this.ducking = false;
    this.lowSince = undefined;
    this.duckRecoverSince = undefined;
    this.lastLandingTime = -Infinity;
    this.status = { kind: 'calibrating', progress: 0 };
  }

  private calibrate(m: BodyMetrics): GestureEvent[] {
    this.samples.push(m);
    const n = this.thresholds.calibrationFrames;
    this.status = { kind: 'calibrating', progress: this.samples.length / n };
    if (this.samples.length >= n) {
      this.baseline = {
        centerX: median(this.samples.map((s) => s.centerX))!,
        hipY: median(this.samples.map((s) => s.hipY))!,
        shoulderY: median(this.samples.map((s) => s.shoulderY))!,
        torsoHeight: median(this.samples.map((s) => s.torsoHeight))!,
      };
      this.samples = [];
      this.lateralRef = this.baseline.centerX;
      this.lateralStillFrames = 0;
      this.lastLateralEnd = -Infinity;
      this.lastFrameVelocity = 0;
      this.lastFrameWasSpike = false;
      this.reverseFrames = 0;
      this.status = { kind: 'tracking' };
    }
    return [];
  }

  private track(m: BodyMetrics, time: number): GestureEvent[] {
    const b = this.baseline;
    if (!b) return [];
    const t = this.thresholds;
    const h = b.torsoHeight;
    const dy = m.hipY - b.hipY;
    const dyShoulder = m.shoulderY - b.shoulderY;
    const events: GestureEvent[] = [];

    // Links / rechts: één tik per stap, gemeten t.o.v. je laatste rustpositie (niet het midden).
    // Na een stap wachten we tot je stilstaat; die positie wordt dan de nieuwe referentie,
    // zodat je meerdere stappen dezelfde kant op kunt doen zonder terug te keren.
    // Triggert vroeg op een snelle zijwaartse beweging (2-frame venster, robuust tegen 1-frame glitches),
    // of anders op afstand (trage stap). Schuif je in één beweging door, dan telt elke 0.9 romphoogte opnieuw.
    this.xHistory.push({ time, v: m.centerX });
    if (this.xHistory.length > 3) this.xHistory.shift();
    let xVelocity = 0;          // over 2 frames
    let frameVelocity = 0;      // over 1 frame
    const xFirst = this.xHistory[0]!, xLast = this.xHistory[this.xHistory.length - 1]!;
    if (xLast.time > xFirst.time) xVelocity = (xLast.v - xFirst.v) / (xLast.time - xFirst.time);
    if (this.xHistory.length >= 2) {
      const a = this.xHistory[this.xHistory.length - 2]!, c = xLast;
      if (c.time > a.time) frameVelocity = (c.v - a.v) / (c.time - a.time);
    }
    const spike = Math.abs(frameVelocity - this.lastFrameVelocity) > t.lateralSpike * h;
    // Tijdens en vlak na een sprong is de beweging zelf explosief: dan geen glitch-filter en geen "vorig frame"-eis.
    const inAir = this.jumpState.kind !== 'ground' || time - this.lastLandingTime < t.landingStrict;
    const clean = inAir || (!spike && !this.lastFrameWasSpike);
    const minShift = (inAir ? t.lateralMinShiftAirborne : t.lateralMinShift) * h;
    const prior = inAir ? 0 : t.lateralPriorVelocity * h;
    const dxRef = m.centerX - this.lateralRef;
    const fastLeft = clean && xVelocity < -t.lateralVelocity * h && dxRef < -minShift && this.lastFrameVelocity < -prior;
    const fastRight = clean && xVelocity > t.lateralVelocity * h && dxRef > minShift && this.lastFrameVelocity > prior;

    const step = (direction: Action): void => {
      this.lateral = 'moving';
      this.lateralDirection = direction;
      this.lateralMovedAt = time;
      this.lateralStillFrames = 0;
      this.reverseFrames = 0;
      this.lateralRef = m.centerX;   // voorlopig; wordt bijgesteld zodra je stilstaat
      events.push(start(direction));
    };

    if (this.lateral === 'moving') {
      // Omkeren tijdens de beweging mag, maar pas na een paar frames bevestiging (glitches keren ook om).
      let reversing = false;
      if (this.lateralDirection === 'left') {
        reversing = clean && frameVelocity > t.lateralPriorVelocity * h && xVelocity > t.lateralVelocity * h;
      } else if (this.lateralDirection === 'right') {
        reversing = clean && frameVelocity < -t.lateralPriorVelocity * h && xVelocity < -t.lateralVelocity * h;
      }
      this.reverseFrames = reversing ? this.reverseFrames + 1 : 0;
      if (this.reverseFrames >= t.lateralReverseFrames && this.lateralDirection === 'left' && dxRef > t.lateralMinShift * h) {
        events.push(end('left')); step('right');
      } else if (this.reverseFrames >= t.lateralReverseFrames && this.lateralDirection === 'right' && dxRef < -t.lateralMinShift * h) {
        events.push(end('right')); step('left');
      } else if (Math.abs(dxRef) > t.lateralRepeat * h) {
        // Doorschuiven: volgende baan.
        events.push(end(this.lateralDirection)); step(this.lateralDirection);
      } else {
        this.lateralStillFrames = Math.abs(xVelocity) < t.lateralSettleVelocity * h ? this.lateralStillFrames + 1 : 0;
        if (this.lateralStillFrames >= t.lateralSettleFrames || time - this.lateralMovedAt > t.lateralSettleTimeout) {
          this.lateralRef = m.centerX;
          this.lateral = 'center';
          this.lastLateralEnd = time;
          events.push(end(this.lateralDirection));
        }
      }
    } else if (dxRef < -t.lateralEnter * h || fastLeft) {
      step('left');
    } else if (dxRef > t.lateralEnter * h || fastRight) {
      step('right');
    } else if (Math.abs(xVelocity) < t.lateralStillVelocity * h) {
      this.lateralRef += t.lateralRefAlpha * dxRef;   // langzaam drijven volgen
    }
    this.lastFrameVelocity = frameVelocity;
    this.lastFrameWasSpike = spike;
    const sideways = this.lateral === 'moving' || time - this.lastLateralEnd < t.lateralStrict;

    // Springen. Toestandsmachine: grond → (spatie verstuurd) → in de lucht → landing → grond.
    // Vanaf de grond zijn er drie routes, in volgorde van snelheid:
    //  1. dip: door de knieën zakken vlak vóór de afzet (±250 ms vóór de voeten loskomen);
    //  2. afzet: heupen of schouders stijgen snel (gemeten over de laatste paar frames);
    //  3. hoogte: heupen én schouders duidelijk boven de baseline (trage sprong, vangnet).
    // Na een landing veert het lichaam (±1.7 romphoogte/s) en komt het recht; dat is geen sprong.
    // Een echte tweede sprong meteen na de landing zet af met 3+ romphoogte/s: die laten we door.
    // De dip vóór zo'n tweede sprong is niet te onderscheiden van de landing zelf, dus geen anticipatie daar.
    this.hipHistory.push({ time, v: m.hipY });
    this.shoulderHistory.push({ time, v: m.shoulderY });
    if (this.hipHistory.length > t.jumpWindow + 1) this.hipHistory.shift();
    if (this.shoulderHistory.length > t.jumpWindow + 1) this.shoulderHistory.shift();

    const rise = (history: Sample[]): { velocity: number; rise: number } => {
      const first = history[0], last = history[history.length - 1];
      if (!first || !last || last.time <= first.time) return { velocity: 0, rise: 0 };
      const r = last.v - first.v;
      return { velocity: r / (last.time - first.time), rise: r };
    };
    const hip = rise(this.hipHistory), shoulder = rise(this.shoulderHistory);
    const windowVelocity = Math.max(hip.velocity, shoulder.velocity);
    const windowRise = hip.velocity >= shoulder.velocity ? hip.rise : shoulder.rise;
    const isHigh = dy > t.jumpEnter * h || dyShoulder > t.jumpEnter * h;
    const isLow = dy < t.jumpExit * h && dyShoulder < t.jumpExit * h;

    // Toestand bijwerken: verstuurd → in de lucht zodra we boven de baseline zitten (of time-out bij een valse dip);
    // in de lucht → grond zodra heupen én schouders terug beneden zijn.
    switch (this.jumpState.kind) {
      case 'pending':
        if (isHigh) this.jumpState = { kind: 'airborne' };
        else if (time - this.jumpState.since > t.pendingTimeout) { this.jumpState = { kind: 'ground' }; events.push(end('jump')); }
        break;
      case 'airborne':
        if (isLow) {
          this.jumpState = { kind: 'ground' };
          this.lastLandingTime = time;
          events.push(end('jump'));
        }
        break;
      case 'ground':
        if (isHigh && time - this.lastLandingTime > t.landingStrict) this.jumpState = { kind: 'airborne' };  // sprong zonder trigger (bv. heel traag)
        break;
    }

    // Streng (alleen een onmiskenbare afzet telt): kort na een landing, tijdens en kort na een buk
    // (rechtkomen is geen sprong) en bij een stap opzij (heupen wippen mee).
    const sinceLanding = time - this.lastLandingTime;
    const strict = sinceLanding < t.landingStrict || this.ducking || sideways;
    const riseThreshold = strict ? t.jumpVelocityAfterLanding : t.jumpVelocity;
    const fastTakeoff = windowVelocity > riseThreshold * h && windowRise > t.jumpMinRise * h;

    // Stilstaan dicht bij de grond bijhouden (nodig om een dip te onderscheiden van een landing).
    const speed = Math.max(Math.abs(hip.velocity), Math.abs(shoulder.velocity));
    if (speed < t.settleVelocity * h && dy < 0.05 * h) {
      this.lastSettledTime = time;
    }
    const downVelocity = Math.min(hip.velocity, shoulder.velocity);
    const dip = t.jumpOnDip && !t.duckEnabled
      && downVelocity < -t.dipVelocity * h
      && Math.min(hip.rise, shoulder.rise) < -t.jumpMinRise * h
      && dy < 0.05 * h
      && time - this.lastSettledTime < t.dipRecentlySettled
      && !strict;

    // Herstel na een buk: pas weer springen als je stilstaat dicht bij je normale hoogte.
    if (this.duckRecoverSince !== undefined) {
      if ((speed < t.settleVelocity * h && dy > -0.1 * h) || time - this.duckRecoverSince > t.duckRecoverTimeout) {
        this.duckRecoverSince = undefined;
      }
    }

    const onGround = this.jumpState.kind === 'ground';
    const canJump = onGround && !this.ducking && this.duckRecoverSince === undefined;
    if (canJump && time - this.lastJumpTime > t.jumpCooldown && (dip || fastTakeoff)) {
      events.push(start('jump'));
      this.lastJumpRoute = dip ? 'dip' : 'afzet';
      this.lastJumpTime = time;
      this.jumpState = { kind: 'pending', since: time };
    }

    // Bukken: duidelijk dieper dan de dip vóór een sprong, en alleen op de grond.
    if (t.duckEnabled) {
      const deep = dy < -t.duckEnter * h || dyShoulder < -t.duckEnter * h;
      const low = dy < -t.duckSlowEnter * h || dyShoulder < -t.duckSlowEnter * h;
      const upright = dy > -t.duckExit * h && dyShoulder > -t.duckExit * h;
      const ground = this.jumpState.kind === 'ground';
      if (low && ground && !sideways && sinceLanding > t.landingStrict) {
        if (this.lowSince === undefined) this.lowSince = time;
      } else {
        this.lowSince = undefined;
      }
      const heldLow = this.lowSince !== undefined && time - this.lowSince > t.duckSlowHold;
      if (!this.ducking && (deep || heldLow) && ground) {
        this.ducking = true;
        events.push(start('duck'));
      } else if (this.ducking && upright) {
        this.ducking = false;
        events.push(end('duck'));
        this.duckRecoverSince = time;   // rechtkomen uit een buk is geen afzet: eerst stilstaan
        this.lastLandingTime = time;
      }
    }

    const stateCode = this.jumpState.kind === 'ground' ? 0 : this.jumpState.kind === 'pending' ? 1 : 2;
    const f = (v: number, d: number) => v.toFixed(d);
    this.trace = `t=${f(time, 3)} dy=${f(dy / h, 3)} dyS=${f(dyShoulder / h, 3)} vHip=${f(hip.velocity / h, 2)} vSh=${f(shoulder.velocity / h, 2)}`
      + ` dx=${f(dxRef / h, 3)} vX=${f(xVelocity / h, 2)} v1=${f(frameVelocity / h, 2)} lat=${this.lateral === 'moving' ? 1 : 0}`
      + ` state=${stateCode} duck=${this.ducking ? 1 : 0} strict=${strict ? 1 : 0} settled=${f(Math.min(time - this.lastSettledTime, 9.99), 2)}`
      + ` ev=${events.map(describe).join(',')}`;

    // Baseline langzaam laten meebewegen wanneer je rustig in het midden staat
    // (vangt dichter/verder van de camera op).
    if (!sideways && onGround && !this.ducking && speed < t.settleVelocity * h
      && Math.abs(dy) < t.baselineMaxShift * h && Math.abs(dyShoulder) < t.baselineMaxShift * h) {
      b.hipY += t.baselineAlpha * dy;
      b.shoulderY += t.baselineAlpha * dyShoulder;
      b.torsoHeight += t.baselineAlpha * (m.torsoHeight - h);
    }

    return events;
  }
}
