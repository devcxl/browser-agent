/**
 * 黑名单匹配纯函数模块。
 * 零 DOM / 浏览器 API 依赖，所有函数可在 Node.js 环境运行。
 */

/** 浮动按钮设置 */
export interface FloatingButtonSettings {
  /** 是否启用浮动按钮 */
  enabled: boolean;
  /** 黑名单域名列表 */
  blacklist: string[];
}

/**
 * 判断 hostname 是否在黑名单中。
 * 支持精确匹配 + 子域名后缀匹配，大小写不敏感。
 *
 * @param blacklist 黑名单域名列表
 * @param hostname  待检查的主机名
 * @returns 命中黑名单时返回 true
 *
 * @example
 * isBlacklisted(['example.com'], 'example.com')     // true（精确匹配）
 * isBlacklisted(['example.com'], 'sub.example.com') // true（子域名匹配）
 * isBlacklisted(['example.com'], 'myexample.com')   // false（部分字符串不匹配）
 */
export function isBlacklisted(blacklist: string[], hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return blacklist.some((blocked) => {
    const lowerBlocked = blocked.toLowerCase();
    return lower === lowerBlocked || lower.endsWith('.' + lowerBlocked);
  });
}

/**
 * 将 hostname 添加到黑名单（去重，返回新数组）。
 *
 * @param blacklist 当前黑名单
 * @param hostname  要添加的主机名
 * @returns 去重后的新数组（不修改原数组）
 */
export function addToBlacklist(blacklist: string[], hostname: string): string[] {
  const lower = hostname.toLowerCase();
  if (blacklist.some((item) => item.toLowerCase() === lower)) {
    return [...blacklist];
  }
  return [...blacklist, hostname];
}

/**
 * 判定浮动按钮是否应在此页面挂载。
 * 早退判定：enabled 为 true 且 hostname 不在黑名单中。
 *
 * @param settings 浮动按钮设置
 * @param hostname 当前页面主机名
 * @returns 应挂载时返回 true
 */
export function shouldMount(settings: FloatingButtonSettings, hostname: string): boolean {
  return settings.enabled && !isBlacklisted(settings.blacklist, hostname);
}
