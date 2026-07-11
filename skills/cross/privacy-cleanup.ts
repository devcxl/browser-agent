/**
 * 隐私深度清洁 — 保留白名单站点，按站点粒度清扫 cookie / 历史
 *
 * 适用场景：
 * - 用户说“帮我把除了常用网站外的浏览记录都清了”
 * - 只想清理特定域名的隐私数据
 */
import type { Skill } from '@/shared/types';

export const privacyCleanupSkill: Omit<Skill, 'id' | 'createdAt' | 'updatedAt' | 'enabled'> = {
  name: 'privacy-cleanup',
  description: '当用户想清除浏览痕迹，但需要保留特定网站（如工作邮箱、内部系统）的登录状态时使用',
  prompt: `## 隐私深度清洁技能

你已激活“隐私深度清洁”技能。帮助用户精确清理浏览器隐私数据。

### 步骤 1：确认白名单
首先询问用户要保留哪些网站（白名单）。如果用户不想手动指定，可以：
- 从书签中分析常用网站（使用 \`bookmarks_getTree\` 提取高频域名）
- 从最近 7 天活跃的标签页中推测
- 提供预定义分类：“保留工作相关，清理其他”、“保留所有 .edu 域名”

### 步骤 2：清理 Cookie
使用 \`cookies_getAll\` 获取所有 cookie，按域名分组。
对白名单外的域名：
1. 使用 \`cookies_remove\` 逐个删除该域名下的 cookie
2. 汇报每个域名删除了多少个 cookie

### 步骤 3：清理历史记录
使用 \`history_search\` 搜索历史记录。
对白名单外的域名：
1. 使用 \`history_delete\` 按 URL 删除对应历史条目
2. 可以按域名批量处理

注意：\`history_delete\` 是高风险操作，会触发用户确认。

### 步骤 4：（可选）清理本地存储
使用 \`storage_local_get\` 检查扩展本地存储中是否有要清理的数据。

### 步骤 5：检查专家隐私设置
如果用户启用了 Expert Mode：
- 使用 \`privacy_getNetworkSettings\` 查看当前 WebRTC 等隐私设置
- 建议优化项（如禁用 WebRTC 泄露内网 IP）

### 步骤 6：汇报
\`\`\`
清理完毕：
- Cookie：删除了 X 个域名的 Y 个 cookie
- 历史记录：删除了 X 条记录
- 白名单保留：A.com, B.com, C.com ...
- 已启用隐私保护建议：...
\`\`\`

### 重要提醒
- 删除操作需要用户确认
- 不要清理扩展自身的 storage
- 清理 cookie 可能导致已登录网站退出，提醒用户
- 可以建议用户先导出书签作为备份`,
  source: 'builtin:cross',
  resources: [],
};
