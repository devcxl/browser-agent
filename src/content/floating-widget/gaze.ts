/**
 * 悬浮球眼睛追踪的归一化计算（#215）。
 *
 * 将指针相对头像中心的偏移换算为引擎接受的 gaze 向量：
 * - 以固定参考距离归一化（视口短边的一半，上限 240px），而不是半视口：
 *   悬浮球吸附在屏幕边缘，用半视口会让靠近按钮的一侧几乎没有行程，
 *   眼睛看起来「卡住」；固定参考距离让光标靠近时响应更线性。
 * - 结果钳制在 [-1, 1]，与 `GrokBot.update({ gaze })` 的约定一致
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
/** 满偏距离上限（px）：更远的光标不再增加偏转 */
const MAX_REFERENCE_DISTANCE = 240;

/** 满偏参考距离：短边的一半，避免小视口下过早饱和 */
function resolveReferenceDistance(viewportWidth: number, viewportHeight: number): number {
  const shortSide = Math.min(viewportWidth, viewportHeight);
  if (!Number.isFinite(shortSide) || shortSide <= 0) return 0;
  return Math.min(MAX_REFERENCE_DISTANCE, shortSide / 2);
}

function normalizeAxis(offset: number, reference: number): number {
  if (reference <= 0 || !Number.isFinite(offset)) return 0;
  const raw = offset / reference;
  return Math.min(GAZE_MAX, Math.max(GAZE_MIN, raw));
}

/** 计算指针方向对应的注视向量 */
export function computeGaze(input: GazeInput): Vec2 {
  const reference = resolveReferenceDistance(input.viewportWidth, input.viewportHeight);
  return {
    x: normalizeAxis(input.pointerX - input.centerX, reference),
    y: normalizeAxis(input.pointerY - input.centerY, reference),
  };
}
