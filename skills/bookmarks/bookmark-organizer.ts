/**
 * 书签整理 — 按域名/类别自动创建文件夹并整理书签
 *
 * 适用场景：
 * - 用户说“我的书签栏太乱了，帮我整理一下”
 * - 大量书签零散堆放无分类
 */
import type { Skill } from '@/shared/types';

export const bookmarkOrganizerSkill: Omit<Skill, 'id' | 'createdAt' | 'updatedAt' | 'enabled'> = {
  name: 'bookmark-organizer',
  description: '当用户书签栏杂乱无章、没有分类，想按类别整理书签时使用',
  prompt: `## 书签分类整理技能

你已激活“书签分类整理”技能。请按以下步骤整理书签：

### 步骤 1：获取书签树
使用 \`bookmarks_getTree\` 获取完整书签结构。

### 步骤 2：分析当前结构
识别：
- 哪些书签在顶层（无文件夹）需要整理
- 哪些文件夹下书签过多需要拆分子文件夹
- 当前已有的文件夹名称和结构

### 步骤 3：制定分类方案
根据书签 URL 域名自动归类：

| 域名模式 | 类别名 | 示例 |
|-----------|--------|------|
| github.com, gitlab.com, gitee.com | 代码托管 | |
| stackoverflow.com, segmentfault.com | 技术问答 | |
| *.medium.com, *.dev.to | 技术博客 | |
| docs.*, *.readthedocs.io | 技术文档 | |
| youtube.com, bilibili.com | 视频 | |
| twitter.com, weibo.com, reddit.com | 社交 | |
| *.notion.so, *.feishu.cn | 笔记/文档 | |
| scholar.google.com, arxiv.org | 学术 | |
| 其它 | 其他 / 按域名分组 | |

也可以按主题分类：
- **开发工具**：IDE 文档、库文档、工具站
- **学习资料**：教程、课程、电子书
- **设计资源**：图标、配色、UI 灵感
- **新闻资讯**：技术新闻、博客
- **个人**：邮箱、日历、网盘

### 步骤 4：创建文件夹并移动书签
1. 使用 \`bookmarks_create\` 创建分类文件夹（父文件夹为书签栏）
2. 使用 \`bookmarks_update\` 将书签移动到对应文件夹
3. 对于原有文件夹中的书签，先询问用户是否重新整理

### 步骤 5：汇报结果
向用户汇报：
1. 创建了哪些文件夹
2. 每个文件夹下有多少书签
3. 是否有无法归类的书签（留在原位或放入“其他”）

### 重要提醒
- 不要移动用户明确命名的自定义文件夹
- 如果某个域名下书签超过 20 个，建议进一步细分
- 移动前先向用户展示完整的分类方案，确认后再执行
- 特别小心书签栏和“其他书签”的区别`,
  source: 'builtin:bookmarks',
  resources: [],
};
