import { describe, expect, it } from 'vitest';
import { GestureEngine } from '../src/engine/gesture-engine';
import type { GestureEvent, Joints, PoseFrame } from '../src/engine/types';

const FPS = 30;
const DT = 1 / FPS;
const HIP = 0.4, SHOULDER = 0.7, TORSO = SHOULDER - HIP; // romphoogte 0.3

/// Pose uit een gespiegelde centerX (zoals de engine die ziet) en heup-/schouderhoogte (origin linksonder).
function pose(centerX: number, hipY = HIP, shoulderY = SHOULDER): PoseFrame {
  const x = 1 - centerX;
  const points: Joints = {
    leftShoulder: { x: x - 0.08, y: shoulderY }, rightShoulder: { x: x + 0.08, y: shoulderY },
    leftHip: { x: x - 0.05, y: hipY }, rightHip: { x: x + 0.05, y: hipY },
    neck: { x, y: shoulderY }, root: { x, y: hipY },
  };
  return { points, time: 0 };
}

class Sim {
  engine = new GestureEngine();
  time = 0;
  events: GestureEvent[] = [];
  x = 0.5; hip = HIP; shoulder = SHOULDER;

  frame(frame: PoseFrame | null = pose(this.x, this.hip, this.shoulder)): GestureEvent[] {
    this.time += DT;
    const ev = this.engine.process(frame ?? undefined, this.time);
    this.events.push(...ev);
    return ev;
  }
  still(n: number) { for (let i = 0; i < n; i++) this.frame(); }
  /// Beweeg lineair over `n` frames naar de nieuwe waarden.
  moveTo(target: { x?: number; hip?: number; shoulder?: number }, n: number) {
    const from = { x: this.x, hip: this.hip, shoulder: this.shoulder };
    const to = { x: target.x ?? from.x, hip: target.hip ?? from.hip, shoulder: target.shoulder ?? from.shoulder };
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      this.x = from.x + (to.x - from.x) * k;
      this.hip = from.hip + (to.hip - from.hip) * k;
      this.shoulder = from.shoulder + (to.shoulder - from.shoulder) * k;
      this.frame();
    }
  }
  calibrate() { this.still(this.engine.thresholds.calibrationFrames); this.events = []; }
  starts(action: string) { return this.events.filter((e) => e.phase === 'start' && e.action === action).length; }
  ends(action: string) { return this.events.filter((e) => e.phase === 'end' && e.action === action).length; }
}

describe('kalibratie', () => {
  it('gaat na 30 stille frames naar tracking zonder events', () => {
    const s = new Sim();
    s.still(29);
    expect(s.engine.status.kind).toBe('calibrating');
    s.still(1);
    expect(s.engine.status.kind).toBe('tracking');
    expect(s.events).toEqual([]);
    expect(s.engine.baseline?.torsoHeight).toBeCloseTo(TORSO, 5);
    expect(s.engine.lateralLines).toEqual({ left: 0.5 - 0.3 * TORSO, right: 0.5 + 0.3 * TORSO });
  });

  it('meldt noBody zonder lichaam en herkalibreert daarna', () => {
    const s = new Sim();
    s.calibrate();
    for (let i = 0; i < 35; i++) s.frame(null);
    expect(s.engine.status.kind).toBe('noBody');
    s.frame();
    expect(s.engine.status.kind).toBe('calibrating');
  });
});

describe('springen', () => {
  it('stuurt één sprong bij een snelle afzet en een einde bij de landing (anticipatie uit)', () => {
    const s = new Sim();
    s.engine.thresholds.jumpOnDip = false;
    s.calibrate();
    s.still(10);
    // Door de knieën (1.1 romphoogte/s: te traag voor de dip-route, die hier toch uit staat), dan de afzet:
    // vanaf de bodem van de dip in twee frames 0.21 romphoogte omhoog (3+ romphoogte/s), nog onder jumpEnter.
    s.moveTo({ hip: HIP - 0.15 * TORSO, shoulder: SHOULDER - 0.15 * TORSO }, 4);
    s.moveTo({ hip: HIP - 0.03 * TORSO, shoulder: SHOULDER - 0.03 * TORSO }, 1);
    expect(s.starts('jump')).toBe(0);
    s.moveTo({ hip: HIP + 0.06 * TORSO, shoulder: SHOULDER + 0.06 * TORSO }, 1);
    expect(s.starts('jump')).toBe(1);
    s.moveTo({ hip: HIP + 0.6 * TORSO, shoulder: SHOULDER + 0.6 * TORSO }, 4);
    s.still(3);
    expect(s.starts('jump')).toBe(1);
    expect(s.engine.lastJumpRoute).toBe('afzet');
    expect(s.ends('jump')).toBe(0);
    s.moveTo({ hip: HIP, shoulder: SHOULDER }, 6);
    s.still(5);
    expect(s.ends('jump')).toBe(1);
    expect(s.starts('jump')).toBe(1);
  });

  it('anticipeert op de dip vóór de afzet', () => {
    const s = new Sim();
    s.calibrate();
    s.still(10);
    // Dip: 1.2 romphoogte/s omlaag gedurende 4 frames (tot −0.16 romphoogte).
    s.moveTo({ hip: HIP - 0.16 * TORSO, shoulder: SHOULDER - 0.16 * TORSO }, 4);
    expect(s.starts('jump')).toBe(1);
    expect(s.engine.lastJumpRoute).toBe('dip');
    // Daarna de echte afzet: geen tweede sprong.
    s.moveTo({ hip: HIP + 0.6 * TORSO, shoulder: SHOULDER + 0.6 * TORSO }, 6);
    s.moveTo({ hip: HIP, shoulder: SHOULDER }, 6);
    s.still(5);
    expect(s.starts('jump')).toBe(1);
    expect(s.ends('jump')).toBe(1);
  });

  it('negeert een trage beweging omhoog (rechtkomen)', () => {
    const s = new Sim();
    s.engine.thresholds.jumpOnDip = false;
    s.calibrate();
    // 0.5 romphoogte/s omhoog: onder de drempel van 1.5.
    s.moveTo({ hip: HIP + 0.05 * TORSO, shoulder: SHOULDER + 0.05 * TORSO }, 3);
    s.still(5);
    expect(s.starts('jump')).toBe(0);
  });
});

describe('stap opzij', () => {
  it('tikt links bij een stap, sluit af bij stilstaan en verschuift de referentie', () => {
    const s = new Sim();
    s.calibrate();
    s.moveTo({ x: 0.5 - 0.5 * TORSO }, 6);
    expect(s.starts('left')).toBe(1);
    expect(s.engine.lateral).toBe('moving');
    s.still(4);
    expect(s.ends('left')).toBe(1);
    expect(s.engine.lateral).toBe('center');
    expect(s.engine.lateralLines?.left).toBeCloseTo(0.5 - 0.5 * TORSO - 0.3 * TORSO, 5);
    // Een tweede stap dezelfde kant op telt opnieuw, zonder eerst terug te keren.
    s.moveTo({ x: 0.5 - 1.0 * TORSO }, 6);
    s.still(4);
    expect(s.starts('left')).toBe(2);
    expect(s.starts('right')).toBe(0);
  });

  it('tikt rechts bij een stap terug', () => {
    const s = new Sim();
    s.calibrate();
    s.moveTo({ x: 0.5 - 0.5 * TORSO }, 6);
    s.still(4);
    s.moveTo({ x: 0.5 }, 6);
    s.still(4);
    expect(s.starts('left')).toBe(1);
    expect(s.starts('right')).toBe(1);
  });

  it('telt een grote stap (≥ 0.9 romphoogte) als twee tikken', () => {
    const s = new Sim();
    s.calibrate();
    s.moveTo({ x: 0.5 + 1.5 * TORSO }, 10);
    s.still(4);
    expect(s.starts('right')).toBe(2);
  });

  it('negeert een snelle pose-glitch van één frame (snelheidsroute)', () => {
    const s = new Sim();
    s.calibrate();
    s.still(5);
    s.frame(pose(0.5 + 0.2 * TORSO));   // 6 romphoogte/s uit stilstand: een echte stap versnelt geleidelijk
    s.still(10);
    expect(s.events).toEqual([]);
  });
});

describe('bukken', () => {
  it('start en eindigt bukken bij diep zakken en rechtkomen, zonder sprong', () => {
    const s = new Sim();
    s.engine.thresholds.duckEnabled = true;
    s.engine.thresholds.jumpOnDip = false;
    s.calibrate();
    s.moveTo({ hip: HIP - 0.5 * TORSO, shoulder: SHOULDER - 0.5 * TORSO }, 6);
    expect(s.starts('duck')).toBe(1);
    s.still(10);
    expect(s.ends('duck')).toBe(0);
    s.moveTo({ hip: HIP, shoulder: SHOULDER }, 6);
    s.still(10);
    expect(s.ends('duck')).toBe(1);
    expect(s.starts('jump')).toBe(0);
  });

  it('herkent ook een minder diepe buk die aangehouden wordt', () => {
    const s = new Sim();
    s.engine.thresholds.duckEnabled = true;
    s.calibrate();
    s.moveTo({ hip: HIP - 0.33 * TORSO, shoulder: SHOULDER - 0.33 * TORSO }, 8);
    expect(s.starts('duck')).toBe(0);
    s.still(8);  // > 0.15 s laag
    expect(s.starts('duck')).toBe(1);
  });
});
