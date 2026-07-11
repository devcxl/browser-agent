/**
 * 页面内容提取 — 从当前页面提取结构化数据（链接、表格、图片等）
 *
 * 适用场景：
 * - 用户说“帮我把这页上所有链接提取出来”、“提取这个表格”
 * - 看到一页资源列表想导出
 */
import type { Skill } from '@/shared/types';

export const pageScraperSkill: Omit<Skill, 'id' | 'createdAt' | 'updatedAt' | 'enabled'> = {
  name: 'page-scraper',
  description: '当用户想从当前页面提取结构化数据，如所有链接、表格、图片列表时使用',
  prompt: `## 页面内容提取技能

你已激活“页面内容提取”技能。帮用户从页面中提取结构化信息。

### 步骤 1：确认提取目标
询问用户想提取什么：
- **所有链接** — 提取页面上所有链接（URL + 文本）
- **表格数据** — 提取页面上特定表格
- **图片列表** — 提取所有图片的 src 和 alt
- **联系方式** — 提取邮箱、电话、地址
- **代码块** — 提取页面中的代码片段
- **全文 Markdown** — 整个页面转为 Markdown

### 步骤 2：获取页面内容
1. 使用 \`tabs_query\` 确认当前活跃标签页
2. 使用 \`page_getMarkdown\` 获取页面 Markdown 版本（包含完整的文本内容和链接）
3. 使用 \`page_getMetadata\` 获取页面元数据作为上下文
4. 如果需要原文 HTML，使用 \`page_getContent\` 获取 Readability 提取后的内容

### 步骤 3：处理不同类型的提取

#### 提取所有链接：
从 Markdown 内容中解析所有 \`[text](url)\` 格式的链接，按域名分组展示：
\`\`\`
页面链接分析 — "React 生态工具汇总"

github.com (15 个)：
  - facebook/react — React 主仓库
  - pmndrs/zustand — 状态管理
  - ...

npmjs.com (8 个)：
  - package/react-router
  - ...
\`\`\`

#### 提取表格：
从 Markdown 内容中识别表格语法（\`| col | col |\`），格式化展示。

#### 提取图片：
从 Markdown 中解析所有 \`![alt](url)\`，列出图片 URL 和描述。

### 步骤 4：展示和保存结果
1. 直接在对话中以结构化格式展示提取结果
2. 询问是否需要导出：
   - 使用 \`page_viewMarkdown\` 在新标签页中以 Markdown 格式展示完整结果
   - 用户可以 Ctrl+S 保存到本地
   - 可以使用 \`clipboard_write\` 把结果复制到剪贴板

### 重要提醒
- 提取链接时过滤掉页面内导航链接（#锚点）
- 对于超大页面，提醒用户提取结果可能很长
- 提取的链接保持原始 URL，不做修改
- 页面 Markdown 转换可能丢失部分复杂布局，提醒用户`,
  source: 'builtin:cross',
  resources: [],
};
