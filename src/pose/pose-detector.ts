import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { torsoHeight } from '../engine/gesture-engine';
import type { JointName, Joints, PoseFrame } from '../engine/types';

/// MediaPipe-landmarkindex → gewrichtsnaam van de engine. `neck` en `root` bestaan niet in MediaPipe
/// en worden afgeleid uit beide schouders resp. beide heupen.
const LANDMARKS: readonly [number, JointName][] = [
  [0, 'nose'],
  [11, 'leftShoulder'], [12, 'rightShoulder'],
  [13, 'leftElbow'], [14, 'rightElbow'],
  [15, 'leftWrist'], [16, 'rightWrist'],
  [23, 'leftHip'], [24, 'rightHip'],
  [25, 'leftKnee'], [26, 'rightKnee'],
  [27, 'leftAnkle'], [28, 'rightAnkle'],
];

/// Pose-detectie met MediaPipe Pose Landmarker (lite-model, lokaal gebundeld). Levert punten in de
/// conventie van de engine: genormaliseerd, origin linksonder (y omhoog), niet gespiegeld.
export class PoseDetector {
  minConfidence = 0.3;
  private lastTimestamp = -1;

  private constructor(private readonly landmarker: PoseLandmarker, readonly delegate: 'GPU' | 'CPU') {}

  static async create(): Promise<PoseDetector> {
    const wasm = await FilesetResolver.forVisionTasks(chrome.runtime.getURL('wasm'));
    const modelAssetPath = chrome.runtime.getURL('models/pose_landmarker_lite.task');
    const options = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath, delegate },
      runningMode: 'VIDEO' as const,
      numPoses: 2,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    try {
      return new PoseDetector(await PoseLandmarker.createFromOptions(wasm, options('GPU')), 'GPU');
    } catch (error) {
      console.warn('[MotionKeys] GPU-delegate niet beschikbaar, terugvallen op CPU', error);
      return new PoseDetector(await PoseLandmarker.createFromOptions(wasm, options('CPU')), 'CPU');
    }
  }

  /// `timestampMs` moet strikt stijgen (eis van MediaPipe in VIDEO-modus).
  detect(video: HTMLVideoElement, timestampMs: number): PoseFrame | undefined {
    if (timestampMs <= this.lastTimestamp) timestampMs = this.lastTimestamp + 1;
    this.lastTimestamp = timestampMs;
    const result = this.landmarker.detectForVideo(video, timestampMs);

    // Bij meerdere personen: neem degene met de grootste romp (dichtst bij de camera).
    let best: { points: Joints; size: number } | undefined;
    for (const landmarks of result.landmarks) {
      const points = this.toJoints(landmarks);
      if (Object.keys(points).length === 0) continue;
      const size = torsoHeight(points) ?? 0;
      if (!best || size > best.size) best = { points, size };
    }
    return best ? { points: best.points, time: timestampMs / 1000 } : undefined;
  }

  private toJoints(landmarks: NormalizedLandmark[]): Joints {
    const points: Joints = {};
    for (const [index, name] of LANDMARKS) {
      const l = landmarks[index];
      if (!l || l.visibility < this.minConfidence) continue;
      points[name] = { x: l.x, y: 1 - l.y };   // origin linksboven → linksonder
    }
    const mid = (a: JointName, b: JointName): { x: number; y: number } | undefined => {
      const pa = points[a], pb = points[b];
      return pa && pb ? { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 } : undefined;
    };
    const neck = mid('leftShoulder', 'rightShoulder');
    const root = mid('leftHip', 'rightHip');
    if (neck) points.neck = neck;
    if (root) points.root = root;
    return points;
  }

  close(): void {
    this.landmarker.close();
  }
}
