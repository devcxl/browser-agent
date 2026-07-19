/**
 * 拖拽吸附纯函数模块。
 * 零 DOM / 浏览器 API 依赖，所有函数可在 Node.js 环境运行。
 */

/** 默认点击判定阈值（像素） */
const DEFAULT_CLICK_THRESHOLD = 5;

/**
 * 判定一次指针移动是否应视为"点击"而非"拖拽"。
 * @param movePx  指针累计移动距离（像素）
 * @param threshold 判定阈值，默认 5px
 * @returns 移动距离小于阈值时返回 true（视为点击）
 */
export function isClick(movePx: number, threshold: number = DEFAULT_CLICK_THRESHOLD): boolean {
  return Math.abs(movePx) < threshold;
}

/**
 * 根据水平坐标与视口宽度决定吸附侧。
 * @param clientX 指针/元素水平坐标
 * @param vw      视口宽度
 * @returns 左侧 'left' 或右侧 'right'
 */
export function resolveSide(clientX: number, vw: number): 'left' | 'right' {
  return clientX < vw / 2 ? 'left' : 'right';
}

/** 垂直方向最小上边距 */
const MIN_TOP = 8;

/**
 * 将垂直坐标 clamp 到安全区域内。
 * @param pointerY   指针/元素垂直坐标
 * @param buttonSize 按钮高度
 * @param vh         视口高度
 * @returns clamp 后的 top 值，范围 [8, vh - buttonSize - 8]
 */
export function clampTop(pointerY: number, buttonSize: number, vh: number): number {
  const maxTop = vh - buttonSize - MIN_TOP;
  return Math.min(Math.max(pointerY, MIN_TOP), maxTop);
}
