/**
 * 标签页结果裁剪：进入 LLM 上下文前剔除仅 UI 需要的重量级字段。
 *
 * 重点是 favIconUrl —— 常为 data: 内联 SVG，单条可达数 KB～数十 KB，
 * 列表查询时会把上下文迅速挤占。openerTabId / width / height 对模型
 * 推进任务同样没有价值，一并剔除。
 */

/** 从单个标签页对象中剔除图标等重量级字段 */
export function sanitizeTab<T extends Record<string, unknown>>(tab: T): T {
  const result = { ...tab } as Record<string, unknown>;
  delete result.favIconUrl;
  delete result.openerTabId;
  delete result.width;
  delete result.height;
  return result as T;
}

/** 批量裁剪标签页 */
export function sanitizeTabs<T extends Record<string, unknown>>(tabs: T[] | undefined | null): T[] {
  return (tabs ?? []).map(sanitizeTab);
}

/**
 * 裁剪窗口对象：保留窗口自身字段，仅对其内嵌的 tabs 数组做裁剪
 * （window_list 等窗口工具在 populate 时会带出标签页）。
 */
export function sanitizeWindow<T extends { tabs?: Record<string, unknown>[] }>(window: T): T {
  if (!window.tabs) return window;
  return { ...window, tabs: sanitizeTabs(window.tabs) };
}

export function sanitizeWindows<T extends { tabs?: Record<string, unknown>[] }>(
  windows: T[] | undefined | null,
): T[] {
  return (windows ?? []).map(sanitizeWindow);
}
