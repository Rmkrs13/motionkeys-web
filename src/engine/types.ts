/// Gewrichten zoals de engine ze kent (de namen van Apple Vision; MediaPipe-landmarks worden hierop afgebeeld).
export type JointName =
  | 'nose' | 'neck' | 'root'
  | 'leftShoulder' | 'rightShoulder' | 'leftElbow' | 'rightElbow' | 'leftWrist' | 'rightWrist'
  | 'leftHip' | 'rightHip' | 'leftKnee' | 'rightKnee' | 'leftAnkle' | 'rightAnkle';

export interface Point { x: number; y: number }

export type Joints = Partial<Record<JointName, Point>>;

/// Eén gedetecteerde pose. Punten zijn genormaliseerd (0…1), origin linksonder (y omhoog), NIET gespiegeld.
export interface PoseFrame {
  points: Joints;
  time: number;
}

/// De bewegingen die de engine herkent. Elke beweging heeft een begin en (waar zinvol) een einde.
export type Action = 'jump' | 'duck' | 'left' | 'right';
export const ACTIONS: readonly Action[] = ['jump', 'duck', 'left', 'right'];

/// Begin of einde van een beweging. Tik-toetsen reageren op het begin, vasthoud-toetsen op beide.
export interface GestureEvent {
  action: Action;
  phase: 'start' | 'end';
}

export const start = (action: Action): GestureEvent => ({ action, phase: 'start' });
export const end = (action: Action): GestureEvent => ({ action, phase: 'end' });
export const describe = (e: GestureEvent): string => e.action + (e.phase === 'start' ? '' : '-einde');

/// `moving`: net een stap gedaan, wachten tot je stilstaat; dan wordt je nieuwe positie de referentie.
export type LateralState = 'center' | 'left' | 'right' | 'moving';

export type EngineStatus =
  | { kind: 'idle' }
  | { kind: 'calibrating'; progress: number }
  | { kind: 'tracking' }
  | { kind: 'noBody' };
