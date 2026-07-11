/**
 * 死链检测 — 检测书签中的无效链接
 *
 * 适用场景：
 * - 用户说“帮我检查书签有没有打不开的”
 * - 书签积累多年有很多失效链接
 */
import type { Skill } from '@/shared/types';

export const bookmarkValidatorSkill: Omit<Skill, 'id' | 'createdAt' | 'updatedAt' | 'enabled'> = {
  name: 'bookmark-validator',
  description: '当用户怀疑书签链接已失效、想检查哪些书签打不开时使用',
  prompt: `## 死链检测技能

你已激活“死链检测”技能。请按以下步骤检测书签有效性：

### 步骤 1：获取所有书签
使用 \`bookmarks_search\` 或 \`bookmarks_getTree\` 获取所有书签叶子节点（有 url 的书签）。

### 步骤 2：准备检测
向用户说明：
- 将要逐一打开每个书签 URL
- 这会消耗一定时间，且会打开很多标签页
- 建议一次检测 20-30 个书签，分批进行

### 步骤 3：分批检测
对每批书签：
1. 使用 \`tabs_create\` 在新标签页中打开书签 URL（可在后台打开，不激活）
2. 等待几秒让页面加载
3. 使用 \`tabs_get\` 获取标签页状态，检查：
   - 页面是否正常加载（title 不为空、不是错误页）
   - HTTP 状态码（通过 page_getMetadata 等方法检测）
4. 使用 \`tabs_remove\` 关闭检测标签页
5. 记录结果：✅ 正常 / ❌ 无法访问 / ⚠️ 跳转到其他页面

### 步骤 4：整理报告
向用户汇报：
- 共检测了多少个书签
- ✅ 多少个正常
- ❌ 多少个无法访问（列出具体 URL 和标题）
- ⚠️ 多少个重定向到其他页面

### 步骤 5：清理建议
对无法访问的书签：
- 询问用户是要删除还是保留（可能是临时故障）
- 可以在书签标题前添加 [已失效] 前缀标记，而不是直接删除

### 重要提醒
- 检测速度不要太快，避免触发网站的 rate limit
- 每批之间间隔 2-3 秒
- 不要检测企业内部链接（如 localhost、内网 IP）
- 可以让用户选择只检测特定文件夹
- 检测过程中让用户知道进度`,
  source: 'builtin:bookmarks',
  resources: [],
};
