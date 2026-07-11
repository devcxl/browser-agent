/**
 * 下载整理 — 按文件类型分类下载记录，删除过期文件
 *
 * 适用场景：
 * - 用户说“帮我看看最近下载了什么”、“把下载目录整理一下”
 * - 下载文件夹积压过多，想清理
 */
import type { Skill } from '@/shared/types';

export const downloadCleanupSkill: Omit<Skill, 'id' | 'createdAt' | 'updatedAt' | 'enabled'> = {
  name: 'download-cleanup',
  description: '当用户想查看下载历史、按类型整理下载文件、或清理旧的下载记录时使用',
  prompt: `## 下载整理技能

你已激活“下载整理”技能。帮用户管理和清理下载记录。

### 步骤 1：分析下载状态
使用 \`downloads_search\` 获取下载历史。按以下维度分析：

**按文件类型统计：**
- 📄 文档（pdf、docx、xlsx、pptx、txt、md）
- 🖼️ 图片（png、jpg、gif、svg、webp）
- 📦 压缩包（zip、tar.gz、rar、7z）
- 💻 代码/程序（exe、msi、dmg、deb、sh、py、js、ts）
- 🎵 音视频（mp3、mp4、avi、mkv）
- ⚙️ 其他

**按时间统计：**
- 今天
- 最近 7 天
- 最近 30 天
- 更早

**按下载状态：**
- 已完成
- 进行中
- 已中断

### 步骤 2：展示下载概况
\`\`\`
下载概况（共 47 个文件）：

📄 文档（12 个）：最近的是"需求文档_v3.pdf"（2 小时前）
🖼️ 图片（18 个）：最近的是"screenshot.png"（30 分钟前）
📦 压缩包（5 个）：最近的是"project.tar.gz"（3 天前）
💻 程序（8 个）：最近的是"vscode.deb"（7 天前）
🎵 媒体（2 个）：最近的是"demo.mp4"（15 天前）
⚙️ 其他（2 个）

🟢 进行中：1 个 — "ubuntu.iso"（67%）
⚠️ 已中断：3 个
\`\`\`

### 步骤 3：清理建议
识别以下可清理项：

1. **超过 30 天的临时文件** — 文件名包含 temp、untitled、download、截图等
2. **重复下载** — 同一个 URL 下载了多次（只保留最新的）
3. **已中断的下载** — 长时间未恢复（超过 24 小时）
4. **过期的安装包** — 软件已有新版本的旧安装包

列出清理建议清单，等用户确认后：
- 使用 \`downloads_erase\` 删除下载记录（不删除本地文件）
- 提醒用户手动清理本地文件

### 步骤 4：管理进行中的下载
1. 对进行中的下载：
   - 使用 \`downloads_pause\` 暂停不紧急的大文件
   - 使用 \`downloads_cancel\` 取消不再需要的下载
   - 使用 \`downloads_resume\` 恢复暂停的下载
2. 使用 \`downloads_open\` 打开已完成的文件

### 步骤 5：汇报
\`\`\`
下载整理完成：
- 清理了 15 条下载记录
- 保留了 32 个文件记录
- 取消了 1 个不再需要的下载
- 3 个已中断的下载记录已清除
\`\`\`

### 重要提醒
- \`downloads_erase\` 只删除浏览器记录，不删除本地文件
- 不要取消用户可能仍需要的下载，先确认
- 按文件类型分类时，用文件扩展名判断，不要只看 MIME`,
  source: 'builtin:downloads',
  resources: [],
};
