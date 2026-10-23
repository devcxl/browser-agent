/**
 * 聊天面板宽度约束（#214）。
 *
 * 设置写入、ConfigStore 读取、面板渲染共用同一套规则，避免各处实现漂移：
 * - 缺省/非法值 → DEFAULT
 * - 按 STEP 四舍五入到最近刻度
 * - 限制在 [MIN, MAX]
 * - 若给定视口宽度且小于结果 → 取视口宽度（可能低于 MIN，保证面板不溢出屏幕）
 */

/** 面板最小宽度（px） */
export const PANEL_WIDTH_MIN = 320;
/** 面板最大宽度（px） */
export const PANEL_WIDTH_MAX = 720;
/** 滑杆/取整步进（px） */
export const PANEL_WIDTH_STEP = 10;
/** 面板默认宽度（px） */
export const PANEL_WIDTH_DEFAULT = 420;

/**
 * 将任意输入收敛为合法的面板宽度。
 * @param value 原始宽度（可能来自 storage / 表单 / 旧版本）
 * @param viewportWidth 视口宽度；提供时作为上限
 */
export function clampPanelWidth(value: unknown, viewportWidth?: number): number {
  const numeric =
    typeof value === 'number' && Number.isFinite(value) ? value : PANEL_WIDTH_DEFAULT;

  const stepped = Math.round(numeric / PANEL_WIDTH_STEP) * PANEL_WIDTH_STEP;
  let width = Math.min(PANEL_WIDTH_MAX, Math.max(PANEL_WIDTH_MIN, stepped));

  if (typeof viewportWidth === 'number' && Number.isFinite(viewportWidth) && viewportWidth > 0) {
    width = Math.min(width, Math.floor(viewportWidth));
  }

  return width;
}
