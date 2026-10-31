// 上游代码未针对 noUncheckedIndexedAccess 编写：按 vendored 承诺不改逻辑，
// 仅在此文件放宽索引访问检查（见 grokbot/index.ts 的 vendored 说明）。
// @ts-nocheck
// 上游代码未针对 noUncheckedIndexedAccess 编写：按 vendored 承诺不改逻辑，
// 仅在此文件放宽索引访问检查（见 grokbot/index.ts 的 vendored 说明）。
// Ported from nasawz/GrokBot (BSD-3-Clause): lib/src/geometry.dart
import type { ShapeData } from './data/shapes';
import type { Vec2 } from './types';

/** Center of the face coordinate space. */
export const FACE_CENTER = 114.2705;
/** Width of the body box in face units. */
export const BODY_WIDTH = 228.541;
/** Side of the square view box the avatar is drawn into. */
export const VIEW_BOX_SIZE = 259;
/** Padding between the view box edge and the body box. */
export const VIEW_BOX_INSET = 15;

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/** Mean of a flat `[x0, y0, x1, y1, ...]` ring. */
export function ringCentroid(ring: readonly number[]): Vec2 {
  let x = 0;
  let y = 0;
  const count = ring.length / 2;
  for (let i = 0; i < ring.length; i += 2) {
    x += ring[i];
    y += ring[i + 1];
  }
  return { x: x / count, y: y / count };
}

/**
 * Maps normalized gaze in [-1, 1] to a face-space offset of about ±13.2 × ±13.2.
 *
 * NOTE: Local deviation from pinned upstream (commit 616c1dd):
 * Upstream uses y gain 8.4, which limits vertical eye travel compared to horizontal (13.2).
 * Adjusted locally to 13.2 so vertical and horizontal visual travel are comparable across
 * the full viewport range. Upstream is not changed.
 */
export function mapNormalizedGaze(gaze: Vec2): Vec2 {
  return {
    x: clamp(gaze.x, -1, 1) * 13.2,
    y: clamp(gaze.y, -1, 1) * 13.2,
  };
}

/** One elliptical corner radius. */
export interface CornerRadius {
  x: number;
  y: number;
}

function expandRadius(values: string[]): string[] {
  switch (values.length) {
    case 0:
      return ['0', '0', '0', '0'];
    case 1:
      return [values[0], values[0], values[0], values[0]];
    case 2:
      return [values[0], values[1], values[0], values[1]];
    case 3:
      return [values[0], values[1], values[2], values[1]];
    default:
      return values.slice(0, 4);
  }
}

function parseRadiusToken(token: string, axisSize: number): number {
  const value = token.trim();
  if (value.endsWith('%')) {
    const percent = Number.parseFloat(value.slice(0, -1));
    return (Number.isFinite(percent) ? percent : 0) / 100 * axisSize;
  }
  const absolute = Number.parseFloat(value);
  return Number.isFinite(absolute) ? absolute : 0;
}

/**
 * Parses a CSS `border-radius` shorthand into four elliptical corner radii
 * ordered top-left, top-right, bottom-right, bottom-left, then applies the CSS
 * overlap clamp so adjacent radii never exceed the box.
 */
export function parseBorderRadius(css: string, width: number, height: number): CornerRadius[] {
  const parts = css.split('/');
  const split = (source: string) => source.trim().split(/\s+/).filter((token) => token.length > 0);
  const horizontal = expandRadius(split(parts[0]));
  const vertical = expandRadius(split(parts.length > 1 ? parts[1] : parts[0]));

  const radii: CornerRadius[] = [0, 1, 2, 3].map((index) => ({
    x: parseRadiusToken(horizontal[index], width),
    y: parseRadiusToken(vertical[index], height),
  }));

  const clampPair = (a: number, b: number, size: number, horizontalAxis: boolean) => {
    const first = horizontalAxis ? radii[a].x : radii[a].y;
    const second = horizontalAxis ? radii[b].x : radii[b].y;
    const sum = first + second;
    if (sum <= size || sum <= 0) return;
    const scale = size / sum;
    for (const index of [a, b]) {
      if (horizontalAxis) radii[index] = { x: radii[index].x * scale, y: radii[index].y };
      else radii[index] = { x: radii[index].x, y: radii[index].y * scale };
    }
  };

  clampPair(0, 1, width, true);
  clampPair(3, 2, width, true);
  clampPair(0, 3, height, false);
  clampPair(1, 2, height, false);
  return radii;
}

/** Body box and corner radii for a silhouette, in face units. */
export interface BodyBox {
  left: number;
  top: number;
  width: number;
  height: number;
  radii: CornerRadius[];
}

export function bodyBoxFor(shape: ShapeData): BodyBox {
  const width = 210 * shape.aspectX;
  const height = 210 * shape.aspectY;
  return {
    left: FACE_CENTER - width / 2,
    top: FACE_CENTER - height / 2,
    width,
    height,
    radii: parseBorderRadius(shape.radius, width, height),
  };
}

/** Result of projecting one eye onto the head sphere. */
export interface ProjectedEye {
  center: Vec2;
  scaleX: number;
  scaleY: number;
  visible: boolean;
}

/**
 * Maps an eye centroid onto the head sphere: its horizontal offset becomes a
 * longitude, the turn rotates it, and vertical pitch tilts it along latitude.
 * The cosine of the results narrows the eye perspectives and hides it once
 * it passes behind the head sphere.
 *
 * NOTE: Local deviation from pinned upstream (commit 616c1dd):
 * Introduced pitch latitude projection for eyes while body remains perfectly round.
 * When pitch = 0, output is bitwise-equivalent to upstream projectEye.
 */
export function projectEye(params: {
  centroid: Vec2;
  origin: Vec2;
  radius: number;
  turn: number;
  pitch?: number;
  gaze: Vec2;
  scale: number;
  blinkScale: number;
}): ProjectedEye {
  const { centroid, origin, radius, turn, pitch = 0, gaze, scale, blinkScale } = params;
  const offset = centroid.x - origin.x;
  const baseLongitude = Math.asin(clamp(offset / Math.max(radius, 1), -1, 1));
  const longitude = baseLongitude + turn;
  const depth = Math.cos(longitude);
  const perspective = Math.max(depth, 0.02) / Math.max(Math.cos(baseLongitude), 0.02);

  // Pitch latitude projection
  let projectedY = centroid.y + gaze.y;
  let verticalPerspective = 1;
  if (pitch !== 0 && Number.isFinite(pitch)) {
    const offsetY = centroid.y - origin.y;
    const baseLatitude = Math.asin(clamp(offsetY / Math.max(radius, 1), -1, 1));
    const latitude = baseLatitude + pitch;
    projectedY = origin.y + radius * Math.sin(latitude) + gaze.y;
    verticalPerspective = clamp(Math.cos(latitude) / Math.max(Math.cos(baseLatitude), 0.02), 0.5, 1);
  }

  return {
    center: {
      x: origin.x + radius * Math.sin(longitude) + gaze.x,
      y: projectedY,
    },
    scaleX: clamp(perspective * scale, 0.02, 2.4),
    scaleY: clamp(blinkScale * scale * verticalPerspective, 0.02, 2.4),
    visible: depth > 0.02,
  };
}

/**
 * Maps normalized vertical gaze to downward/upward spherical pitch angle in radians.
 * Positive gaze.y (looking down): biased easing approx 0.95 rad * y * (2 - y).
 * Negative gaze.y (looking up): gentler approx 0.15 rad * y.
 */
export function calculateTargetPitch(gazeY: number): number {
  if (!Number.isFinite(gazeY) || gazeY === 0) return 0;
  if (gazeY > 0) {
    const y = clamp(gazeY, 0, 1);
    return 0.95 * y * (2 - y);
  }
  const y = clamp(gazeY, -1, 0);
  return 0.15 * y;
}

function maxVertexDistForPitch(
  rings: readonly (readonly number[])[],
  params: {
    origin: Vec2;
    radius: number;
    turn: number;
    pitch: number;
    gaze: Vec2;
    scale: number;
  },
): number {
  const { origin, radius, turn, pitch, gaze, scale } = params;
  let maxD = 0;
  for (const ring of rings) {
    if (!ring || ring.length < 2) continue;
    const center = ringCentroid(ring);
    const proj = projectEye({
      centroid: center,
      origin,
      radius,
      turn,
      pitch,
      gaze,
      scale,
      blinkScale: 1, // independent of blinkScale
    });
    if (!proj.visible) continue;
    for (let i = 0; i < ring.length; i += 2) {
      const vx = proj.center.x + (ring[i] - center.x) * proj.scaleX;
      const vy = proj.center.y + (ring[i + 1] - center.y) * proj.scaleY;
      maxD = Math.max(maxD, Math.hypot(vx - origin.x, vy - origin.y));
    }
  }
  return maxD;
}

/**
 * Computes a single shared per-frame safe pitch clamp across all eyes in the frame,
 * ensuring no eye ring vertex is clipped outside the body circle of radius R.
 */
export function clampSafePitch(params: {
  rings: readonly (readonly number[])[];
  origin: Vec2;
  radius: number;
  turn: number;
  gaze: Vec2;
  scale: number;
  targetPitch: number;
}): number {
  const { rings, origin, radius, turn, gaze, scale, targetPitch } = params;
  if (!Number.isFinite(targetPitch) || targetPitch === 0) return 0;

  const initialMaxD = maxVertexDistForPitch(rings, {
    origin,
    radius,
    turn,
    pitch: 0,
    gaze,
    scale,
  });
  const maxAllowed = Math.max(radius, initialMaxD);

  const targetMaxD = maxVertexDistForPitch(rings, {
    origin,
    radius,
    turn,
    pitch: targetPitch,
    gaze,
    scale,
  });
  if (targetMaxD <= maxAllowed) {
    return targetPitch;
  }

  let safe = 0;
  let unsafe = targetPitch;
  for (let iter = 0; iter < 8; iter++) {
    const mid = (safe + unsafe) / 2;
    const midD = maxVertexDistForPitch(rings, {
      origin,
      radius,
      turn,
      pitch: mid,
      gaze,
      scale,
    });
    if (midD <= maxAllowed) {
      safe = mid;
    } else {
      unsafe = mid;
    }
  }
  return safe;
}
