/**
 * Procedural motion kinematics generator for Motion Control preview.
 * Generates keypoint skeleton coordinates that replicate driving video motion.
 */

export interface SkeletonJoints {
  head: [number, number];
  neck: [number, number];
  leftShoulder: [number, number];
  rightShoulder: [number, number];
  leftElbow: [number, number];
  rightElbow: [number, number];
  leftWrist: [number, number];
  rightWrist: [number, number];
  spine: [number, number];
  hip: [number, number];
  leftKnee: [number, number];
  rightKnee: [number, number];
  leftAnkle: [number, number];
  rightAnkle: [number, number];
}

export function computeJointsAtTime(
  motionType: 'dance' | 'martial_arts' | 'walk' | 'gesture',
  t: number,
  width: number,
  height: number
): SkeletonJoints {
  const cx = width / 2;
  const cy = height * 0.48;
  const s = Math.min(width, height) * 0.7; // scale

  // Cycle time in seconds
  let headY = cy - s * 0.42;
  let headX = cx;
  let hipX = cx;
  let hipY = cy + s * 0.05;

  let lShoulderX = cx - s * 0.14;
  let rShoulderX = cx + s * 0.14;
  let shoulderY = cy - s * 0.28;

  let lElbowX = cx - s * 0.26;
  let lElbowY = cy - s * 0.15;
  let rElbowX = cx + s * 0.26;
  let rElbowY = cy - s * 0.15;

  let lWristX = cx - s * 0.32;
  let lWristY = cy;
  let rWristX = cx + s * 0.32;
  let rWristY = cy;

  let lKneeX = cx - s * 0.12;
  let lKneeY = cy + s * 0.25;
  let rKneeX = cx + s * 0.12;
  let rKneeY = cy + s * 0.25;

  let lAnkleX = cx - s * 0.14;
  let lAnkleY = cy + s * 0.45;
  let rAnkleX = cx + s * 0.14;
  let rAnkleY = cy + s * 0.45;

  if (motionType === 'dance') {
    // Dynamic hip hop groove & wave
    const beat = t * 3.5;
    const bounce = Math.abs(Math.sin(beat)) * (s * 0.05);
    const sway = Math.sin(beat * 0.5) * (s * 0.08);

    headX += sway * 0.8;
    headY += bounce;
    hipX += sway;
    hipY += bounce;
    shoulderY += bounce;

    lElbowY += Math.sin(beat) * (s * 0.12);
    lWristY += Math.sin(beat + 0.5) * (s * 0.2);
    lWristX += Math.cos(beat) * (s * 0.08);

    rElbowY += Math.cos(beat) * (s * 0.12);
    rWristY += Math.cos(beat + 0.5) * (s * 0.2);
    rWristX -= Math.sin(beat) * (s * 0.08);

    lKneeY -= Math.max(0, Math.sin(beat)) * (s * 0.1);
    rKneeY -= Math.max(0, -Math.sin(beat)) * (s * 0.1);
    lAnkleY += bounce * 0.5;
    rAnkleY += bounce * 0.5;
  } else if (motionType === 'martial_arts') {
    // Karate kata: chamber punch and high side snap
    const cycle = (t * 1.5) % (Math.PI * 2);
    const punchPhase = Math.sin(cycle);

    headX += Math.sin(cycle * 0.5) * (s * 0.05);
    // Right arm punches forward
    rWristX = cx + s * (0.2 + punchPhase * 0.25);
    rWristY = cy - s * (0.25 + Math.cos(cycle) * 0.05);
    rElbowX = cx + s * 0.18;
    rElbowY = cy - s * 0.2;

    // Left arm chambers back
    lWristX = cx - s * 0.18;
    lWristY = cy - s * 0.08;
    lElbowX = cx - s * 0.22;
    lElbowY = cy - s * 0.14;

    // Kick motion
    if (punchPhase > 0.4) {
      rKneeY = cy + s * 0.08;
      rKneeX = cx + s * 0.2;
      rAnkleX = cx + s * 0.35;
      rAnkleY = cy + s * 0.05;
    }
  } else if (motionType === 'walk') {
    // Confident runway stride
    const step = t * 2.8;
    const stride = Math.sin(step);
    const verticalBob = Math.abs(Math.sin(step * 2)) * (s * 0.02);

    headY -= verticalBob;
    hipY -= verticalBob;
    headX += Math.sin(step) * (s * 0.03);

    // Opposite arm-leg movement
    lWristY += stride * (s * 0.15);
    rWristY -= stride * (s * 0.15);
    lWristX += stride * (s * 0.06);
    rWristX -= stride * (s * 0.06);

    lAnkleY -= Math.max(0, stride) * (s * 0.12);
    lAnkleX += stride * (s * 0.15);
    rAnkleY -= Math.max(0, -stride) * (s * 0.12);
    rAnkleX -= stride * (s * 0.15);
  } else {
    // Friendly wave and gesture
    const wave = Math.sin(t * 5) * (s * 0.12);
    rWristX = cx + s * 0.28 + wave;
    rWristY = cy - s * 0.42 + Math.abs(wave) * 0.4;
    rElbowX = cx + s * 0.26;
    rElbowY = cy - s * 0.22;

    headX += Math.sin(t * 1.5) * (s * 0.03);
    headY += Math.cos(t * 2) * (s * 0.01);
  }

  const neckX = (lShoulderX + rShoulderX) / 2;
  const neckY = shoulderY - s * 0.03;
  const spineX = (neckX + hipX) / 2;
  const spineY = (neckY + hipY) / 2;

  return {
    head: [headX, headY],
    neck: [neckX, neckY],
    leftShoulder: [lShoulderX, shoulderY],
    rightShoulder: [rShoulderX, shoulderY],
    leftElbow: [lElbowX, lElbowY],
    rightElbow: [rElbowX, rElbowY],
    leftWrist: [lWristX, lWristY],
    rightWrist: [rWristX, rWristY],
    spine: [spineX, spineY],
    hip: [hipX, hipY],
    leftKnee: [lKneeX, lKneeY],
    rightKnee: [rKneeX, rKneeY],
    leftAnkle: [lAnkleX, lAnkleY],
    rightAnkle: [rAnkleX, rAnkleY],
  };
}

export function drawSkeletonOnCanvas(
  ctx: CanvasRenderingContext2D,
  joints: SkeletonJoints,
  color: string = '#6366F1',
  glow: boolean = true
) {
  const bones: [keyof SkeletonJoints, keyof SkeletonJoints][] = [
    ['head', 'neck'],
    ['neck', 'leftShoulder'],
    ['neck', 'rightShoulder'],
    ['leftShoulder', 'leftElbow'],
    ['leftElbow', 'leftWrist'],
    ['rightShoulder', 'rightElbow'],
    ['rightElbow', 'rightWrist'],
    ['neck', 'spine'],
    ['spine', 'hip'],
    ['hip', 'leftKnee'],
    ['leftKnee', 'leftAnkle'],
    ['hip', 'rightKnee'],
    ['rightKnee', 'rightAnkle'],
  ];

  ctx.save();

  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
  }

  // Draw bones
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const [start, end] of bones) {
    const [x1, y1] = joints[start];
    const [x2, y2] = joints[end];
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Draw joint nodes
  ctx.shadowBlur = 15;
  for (const key of Object.keys(joints) as (keyof SkeletonJoints)[]) {
    const [x, y] = joints[key];
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    const radius = key === 'head' ? 8 : 4.5;
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Ring around joint
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}
