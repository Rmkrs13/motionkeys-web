import type { JointName, Joints } from '../engine/types';

const BONES: readonly [JointName, JointName][] = [
  ['nose', 'neck'],
  ['neck', 'leftShoulder'], ['neck', 'rightShoulder'],
  ['leftShoulder', 'leftElbow'], ['leftElbow', 'leftWrist'],
  ['rightShoulder', 'rightElbow'], ['rightElbow', 'rightWrist'],
  ['neck', 'root'],
  ['root', 'leftHip'], ['root', 'rightHip'],
  ['leftHip', 'leftKnee'], ['leftKnee', 'leftAnkle'],
  ['rightHip', 'rightKnee'], ['rightKnee', 'rightAnkle'],
];

/// Tekent skelet en links/rechts-drempellijnen over het (gespiegelde) camerabeeld.
/// Punten zijn gespiegeld en genormaliseerd met origin linksonder.
export function drawOverlay(
  canvas: HTMLCanvasElement,
  joints: Joints,
  lines: { left: number; right: number } | undefined,
): void {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const px = (p: { x: number; y: number }) => ({ x: p.x * w, y: (1 - p.y) * h });

  if (lines) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    for (const x of [lines.left, lines.right]) {
      ctx.beginPath();
      ctx.moveTo(x * w, 0);
      ctx.lineTo(x * w, h);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.strokeStyle = 'rgba(52,199,89,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [a, b] of BONES) {
    const pa = joints[a], pb = joints[b];
    if (!pa || !pb) continue;
    const A = px(pa), B = px(pb);
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
  }
  ctx.stroke();

  for (const p of Object.values(joints)) {
    const c = px(p);
    ctx.beginPath();
    ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#34c759';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
