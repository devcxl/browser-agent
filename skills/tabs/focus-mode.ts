/**
 * 专注模式 — 关闭非工作标签页，保留生产力相关页面
 *
 * 适用场景：
 * - 用户说“我要开始工作了，帮我把无关页面关了”、“进入专注模式”
 * - 准备开始编码/写作/学习，需要排除干扰
 */
import type { Skill } from '@/shared/types';

export const focusModeSkill: Omit<Skill, 'id' | 'createdAt' | 'updatedAt' | 'enabled'> = {
  name: 'focus-mode',
  description: '当用户说要开始工作、学习，进入专注状态，需要关闭干扰标签页时使用',
  prompt: `## 专注模式技能

你已激活“专注模式”技能。帮用户清理干扰标签页，建立专注工作环境。

### 步骤 1：确认专注类型
询问用户当前的工作类型，这决定了保留什么：
- **写代码** → 保留 GitHub、文档、StackOverflow、localhost
- **写作/文档** → 保留 Notion、Google Docs、参考资料
- **学习** → 保留教程、文档、技术博客
- **设计** → 保留 Figma、Dribbble、设计系统文档
- **自定义** → 用户指定保留的域名或标签页

### 步骤 2：识别干扰标签页
使用 \`tabs_query\` 获取所有标签页。按以下规则标记：

**默认干扰源（除非用户明确保留）：**
- 社交媒体：twitter.com、reddit.com、weibo.com、tieba.baidu.com
- 视频娱乐：youtube.com、bilibili.com、netflix.com、iqiyi.com
- 短视频：tiktok.com、douyin.com
- 新闻：news.ycombinator.com、zhihu.com（非技术类）
- 购物：amazon.com、taobao.com、jd.com
- 游戏：任何游戏相关网站

**默认保留：**
- 开发：github.com、gitlab.com、stackoverflow.com、localhost、*.dev
- 文档：docs.*、developer.mozilla.org、*.readthedocs.io
- 工作工具：notion.so、feishu.cn、linear.app、jira.*
- 邮件/日历：mail.google.com、outlook.com、calendar.google.com

### 步骤 3：生成关闭清单
列出所有将被关闭的标签页，按类别分组展示：
\`\`\`
将要关闭的干扰标签页：

📱 社交媒体（3 个）：
  - twitter.com — Home
  - reddit.com — r/programming

📺 视频（2 个）：
  - youtube.com — 某个视频
  - bilibili.com — 首页

❓ 不确定（1 个）：
  - zhihu.com — 如何优化 React 性能？（可能算学习？）
\`\`\`

### 步骤 4：确认并关闭
1. 让用户审查清单，可以手动排除某些标签页
2. 先保存工作区：用 \`sessions_save\` 或 \`bookmarks_create\` 创建“专注前快照”，方便恢复
3. 用 \`tabs_remove\` 分批关闭干扰标签页

### 步骤 5：整理剩余标签页
对保留的标签页：
- 用 \`tabs_group\` 按主题分组
- 按工作流排序（概览 → 文档 → 参考 → 工具）

### 退出专注模式
当用户说“退出专注模式”时：
- 询问是否恢复之前的标签页（从快照中）
- 用 \`sessions_restore\` 或逐个打开之前保存的书签

### 重要提醒
- 关闭前一定先创建快照，确保可恢复
- pinned 标签页不关闭
- 有未保存表单内容的标签页要警告
- 用户可以随时说“保留这个”来排除某个标签页`,
  source: 'builtin:tabs',
  resources: [],
};
