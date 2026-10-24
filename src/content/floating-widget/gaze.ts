/**
 * 悬浮球眼睛追踪的归一化计算（#215）。
 *
 * 将指针相对头像中心的偏移换算为引擎接受的 gaze 向量：
 * - 方向优先：gaze 始终是指针方向上的单位向量按「沿射线到视口边界的进度」缩放，
 *   因此对角线、停靠在任意边缘时方向都不会被歪曲。
 * - 用整块视口作为行程：把射线上从中心到视口边界的那段距离当作满偏距离，
 *   不再有固定 240px 硬饱和；指针越往页面里走，偏转持续加深，直到贴住边界才满偏。
 * - 轻度缓动 r(2-r)：靠近指针时响应更明显，同时 r=0→0、r=1→1 且全程单调，
 *   不会在中心附近产生跳变，也不引入 EMA / 延迟。
 * - 结果落在 [-1, 1]，与 `GrokBot.update({ gaze })` 的约定一致
 * - 视口尺寸非法（0 / 负数 / NaN / Infinity）或坐标非有限数时返回 0，
 *   保证任何输入都不会向引擎传入 NaN
 */

import type { Vec2 } from './grokbot';

/** computeGaze 输入：指针位置、头像中心与视口尺寸 */
export interface GazeInput {
  /** 指针横坐标（clientX） */
  pointerX: number;
  /** 指针纵坐标（clientY） */
  pointerY: number;
  /** 头像中心横坐标 */
  centerX: number;
  /** 头像中心纵坐标 */
  centerY: number;
  /** 视口宽度 */
  viewportWidth: number;
  /** 视口高度 */
  viewportHeight: number;
}

const GAZE_MIN = -1;
const GAZE_MAX = 1;

function isFiniteInput(input: GazeInput): boolean {
  return (
    Number.isFinite(input.pointerX) &&
    Number.isFinite(input.pointerY) &&
    Number.isFinite(input.centerX) &&
    Number.isFinite(input.centerY) &&
    Number.isFinite(input.viewportWidth) &&
    Number.isFinite(input.viewportHeight) &&
    input.viewportWidth > 0 &&
    input.viewportHeight > 0
  );
}

/**
 * 沿偏移方向走多远（以偏移向量长度为 1）会到达视口边界。
 * 返回 1 表示指针正好落在边界上，小于 1 表示已越界，大于 1 表示还没到边界。
 */
function resolveEdgeParameter(dx: number, dy: number, input: GazeInput): number {
  let edge = Number.POSITIVE_INFINITY;
  if (dx > 0) edge = Math.min(edge, (input.viewportWidth - input.centerX) / dx);
  else if (dx < 0) edge = Math.min(edge, input.centerX / -dx);
  if (dy > 0) edge = Math.min(edge, (input.viewportHeight - input.centerY) / dy);
  else if (dy < 0) edge = Math.min(edge, input.centerY / -dy);
  return edge;
}

function clampAxis(value: number): number {
  return Math.min(GAZE_MAX, Math.max(GAZE_MIN, value));
}

/** 计算指针方向对应的注视向量 */
export function computeGaze(input: GazeInput): Vec2 {
  if (!isFiniteInput(input)) return { x: 0, y: 0 };

  const dx = input.pointerX - input.centerX;
  const dy = input.pointerY - input.centerY;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { x: 0, y: 0 };

  const edge = resolveEdgeParameter(dx, dy, input);
  // edge <= 0：中心已贴在边界上且朝视口外看，没有行程，直接按满偏处理
  const progress = edge > 0 ? Math.min(1, 1 / edge) : 1;
  const eased = progress * (2 - progress);
  const scale = eased / length;

  return {
    x: clampAxis(dx * scale),
    y: clampAxis(dy * scale),
  };
}
