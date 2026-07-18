/**
 * 内置技能定义 — 扩展启动时自动注册到 SkillStore
 *
 * 每个 skill 的 prompt 是 LLM 的执行指令，告诉 Agent 如何组合底层工具完成高级操作。
 * source 字段用于版本管理和匹配，格式为 "builtin:{category}:{name}"。
 */
import type { Skill } from '@/shared/types';

const BUILTIN_VERSION_KEY = 'builtin_skills_version';
const CURRENT_VERSION = 1;

type SkillDef = Omit<Skill, 'id' | 'createdAt' | 'updatedAt' | 'enabled'> & { source: string };

// ─── Tab Skills ───────────────────────────────────────

const tabCleanup: SkillDef = {
  name: 'tab-cleanup',
  description: '当用户抱怨标签页太多、太乱，或想清理重复和长时间未使用的标签页时使用',
  source: 'builtin:tabs',
  resources: [],
  prompt: `## 标签页大扫除技能

你已激活"标签页大扫除"技能。请按以下步骤整理用户的标签页：

### 步骤 1：获取全部标签页
使用 \`tabs_query\` 获取所有打开的标签页，关注字段：url、title、id、lastAccessed。

### 步骤 2：查找重复标签页
找出所有 URL 重复的标签页，每组只保留一个（优先保留最早打开或正活跃的），其余标记为可关闭。

### 步骤 3：识别闲置标签页
找出 lastAccessed 超过 24 小时的标签页。

### 步骤 4：归档闲置标签页
先用 \`bookmarks_create\` 将其加入书签（建议放在"归档标签页"文件夹下），再用 \`tabs_remove\` 关闭。

### 步骤 5：关闭重复标签页
使用 \`tabs_remove\` 分批关闭重复标签页，每步需用户确认。

### 步骤 6：汇报结果
汇报：扫描总数、关闭的重复数、归档的闲置数、剩余标签页数。

### 重要提醒
- 不关闭 pinned 标签页
- 不关闭有未保存表单的标签页
- 先列出操作清单，用户确认后再执行`,
};

const tabSorter: SkillDef = {
  name: 'tab-sorter',
  description: '当用户想把标签页按网站分类整理、创建标签组时使用',
  source: 'builtin:tabs',
  resources: [],
  prompt: `## 智能标签分组技能

你已激活"智能标签分组"技能。请按以下步骤整理标签页分组：

### 步骤 1：获取全部标签页
使用 \`tabs_query\` 获取当前窗口中所有标签页。

### 步骤 2：分析域名分布
从每个标签页的 url 中提取域名（hostname），统计每个域名下的标签页数量。

### 步骤 3：决策分组策略
- 单域名 ≥ 3 个：独立成组
- 单域名 1-2 个：归入对应大类（AI 工具、社交媒体、开发工具、视频等），否则归入"其他"
- 同产品线（如 github.com + github.io）合并为一个分组

### 步骤 4：创建标签组
使用 \`tabs_group\` 为每组创建标签组，设置有意义的标题和不同颜色。

### 步骤 5：汇报
汇报：标签页总数、创建的标签组数、每组包含的网站、未分组标签页。

### 重要提醒
- 标签组名称简短有意义
- 不重新分组已分组的标签页（检查 groupId）
- 无 url 的标签页放入"空白页"分组`,
};

const tabWorkspace: SkillDef = {
  name: 'tab-workspace',
  description: '当用户想保存当前工作状态以便后续恢复，或在不同工作任务间切换时使用',
  source: 'builtin:tabs',
  resources: [],
  prompt: `## 工作区快照技能

你已激活"工作区快照"技能。请按以下步骤操作：

### 确认意图
先确认用户想：保存工作区、恢复工作区、还是列出所有工作区？

### 保存工作区
1. 用 \`tabs_query\` 获取当前窗口所有标签页
2. 用 \`sessions_save\` 保存会话，命名格式"日期 + 用途"
3. 用 \`bookmarks_create\` 在"工作区"书签文件夹下创建子文件夹，把 URL 加入书签（双保险）

### 恢复工作区
1. 先问在当前窗口还是新窗口打开
2. 用 \`sessions_restore\` 恢复会话
3. 汇报恢复的标签页数

### 列出工作区
1. 用 \`sessions_list\` 列出已保存的会话
2. 用 \`bookmarks_search\` 搜索"工作区"书签文件夹
3. 展示：名称—标签页数—保存时间

### 重要提醒
- 工作区名称简短有意义
- sessions 可能不完整，结合书签方案补充`,
};

const tabRescue: SkillDef = {
  name: 'tab-rescue',
  description: '当用户打开标签页过多（超过40个）、浏览器变得混乱难以管理时使用',
  source: 'builtin:tabs',
  resources: [],
  prompt: `## 标签页过载救援技能

你已激活"标签页过载救援"技能。按优先级抢救：

### 步骤 1：全局扫描
用 \`tabs_query\` 获取所有标签页，统计总数、各窗口分布、pinned 数和重复 URL 数。

### 步骤 2：去重（最高优先级）
找出所有 URL 重复的标签页，每组保留 1 个（优先保留活跃窗口中、最近访问的、有表单状态的）。用 \`tabs_remove\` 关闭其余。

### 步骤 3：休眠闲置标签页（中等优先级）
对 lastAccessed 超过 12 小时的标签页：
1. 用 \`bookmarks_create\` 保存到"休眠标签页"书签文件夹
2. 用 \`tabs_remove\` 关闭
分批处理，每批不超过 20 个。

### 步骤 4：分组整理剩余标签页（低优先级）
用 \`tabs_group\` 按域名分组。

### 步骤 5：汇报
汇报：原始数、关闭的重复数、归档的闲置数、剩余活跃数、创建的标签组数。

### 重要提醒
- pinned 标签页不操作
- 有播放中媒体的标签页不关闭
- 每步需用户确认`,
};

const focusMode: SkillDef = {
  name: 'focus-mode',
  description: '当用户说要开始工作、学习，进入专注状态，需要关闭干扰标签页时使用',
  source: 'builtin:tabs',
  resources: [],
  prompt: `## 专注模式技能

你已激活"专注模式"技能。帮用户清理干扰标签页，建立专注工作环境。

### 步骤 1：确认专注类型
询问用户的专注类型：写代码、写作/文档、学习、设计、或自定义。

### 步骤 2：识别干扰标签页
用 \`tabs_query\` 获取所有标签页。

默认干扰源（除非用户明确保留）：
- 社交媒体：twitter.com、reddit.com、weibo.com
- 视频娱乐：youtube.com、bilibili.com、netflix.com
- 短视频：tiktok.com、douyin.com
- 新闻/购物：news.ycombinator.com、amazon.com、taobao.com

默认保留：
- 开发：github.com、stackoverflow.com、localhost
- 文档：docs.*、developer.mozilla.org
- 工作工具：notion.so、feishu.cn、linear.app
- 邮件：mail.google.com、outlook.com

### 步骤 3：生成关闭清单
按类别分组展示将被关闭的标签页。

### 步骤 4：确认并关闭
1. 先保存工作区：用 \`sessions_save\` 或 \`bookmarks_create\` 创建"专注前快照"
2. 用户审查清单后可手动排除
3. 用 \`tabs_remove\` 分批关闭

### 步骤 5：整理剩余标签页
用 \`tabs_group\` 按主题分组，按工作流排序（概览→文档→参考→工具）。

### 退出专注模式
询问是否恢复之前标签页，用 \`sessions_restore\` 恢复。

### 重要提醒
- 关闭前一定创建快照
- pinned 标签页不关闭
- 有未保存表单的标签页要警告`,
};

// ─── Bookmark Skills ──────────────────────────────────

const bookmarkDedup: SkillDef = {
  name: 'bookmark-dedup',
  description: '当用户发现书签有很多重复、想清理重复书签时使用',
  source: 'builtin:bookmarks',
  resources: [],
  prompt: `## 书签去重技能

你已激活"书签去重"技能。请按以下步骤清理重复书签：

### 步骤 1：获取完整书签树
用 \`bookmarks_getTree\` 获取所有书签，忽略文件夹节点，只关注有 url 的叶子节点。

### 步骤 2：检测重复
按以下维度：
- 完全重复：URL 完全相同
- 相似 URL：忽略末尾 slash、www 前缀、追踪参数（?utm_source= 等）后相同
- 同名书签：title 相同或高度相似

### 步骤 3：生成去重方案
保留原则（优先级从高到低）：
1. 在书签栏中的优先保留
2. 创建时间较早的
3. 有自定义名称的优先

列出删除清单（名称、URL、所在文件夹），等用户确认。

### 步骤 4：执行删除
用户确认后用 \`bookmarks_delete\` 逐一删除。

### 步骤 5：汇报
汇报：扫描书签数、重复组数、删除数、剩余书签数。

### 重要提醒
- 不删除文件夹节点
- 不同文件夹中的书签也可能是重复的
- 删除需用户确认`,
};

const bookmarkOrganizer: SkillDef = {
  name: 'bookmark-organizer',
  description: '当用户书签栏杂乱无章、没有分类，想按类别整理书签时使用',
  source: 'builtin:bookmarks',
  resources: [],
  prompt: `## 书签分类整理技能

你已激活"书签分类整理"技能。请按以下步骤整理书签：

### 步骤 1：获取书签树
用 \`bookmarks_getTree\` 获取完整书签结构。

### 步骤 2：分析当前结构
识别：顶层无文件夹的书签、需要拆分的过大的文件夹、已有文件夹名称。

### 步骤 3：制定分类方案
按域名自动归类：
- 代码托管：github.com、gitlab.com、gitee.com
- 技术问答：stackoverflow.com、segmentfault.com
- 技术博客：*.medium.com、*.dev.to
- 技术文档：docs.*、*.readthedocs.io
- 视频：youtube.com、bilibili.com
- 社交：twitter.com、weibo.com、reddit.com
- 笔记/文档：*.notion.so、*.feishu.cn
- 学术：scholar.google.com、arxiv.org

也可按主题分类：开发工具、学习资料、设计资源、新闻资讯、个人。

### 步骤 4：创建文件夹并移动书签
1. 用 \`bookmarks_create\` 创建分类文件夹
2. 用 \`bookmarks_update\` 移动书签到对应文件夹

### 步骤 5：汇报
汇报：创建的文件夹、每个文件夹的书签数、无法归类的书签。

### 重要提醒
- 不移动用户自定义命名的文件夹
- 同域名超过 20 个书签建议细分
- 移动前展示完整方案，确认后执行`,
};

const bookmarkValidator: SkillDef = {
  name: 'bookmark-validator',
  description: '当用户怀疑书签链接已失效、想检查哪些书签打不开时使用',
  source: 'builtin:bookmarks',
  resources: [],
  prompt: `## 死链检测技能

你已激活"死链检测"技能。请按以下步骤检测书签有效性：

### 步骤 1：获取所有书签
用 \`bookmarks_search\` 或 \`bookmarks_getTree\` 获取有 url 的书签。

### 步骤 2：准备检测
向用户说明：将逐一打开书签 URL、建议分批检测（每批 20-30 个）。

### 步骤 3：分批检测
1. 用 \`tabs_create\` 在后台打开书签 URL
2. 等待几秒后，用 \`tabs_get\` 检查状态（title 不为空、不是错误页）
3. 用 \`page_getMetadata\` 辅助判断
4. 用 \`tabs_remove\` 关闭检测标签页
5. 记录：✅ 正常 / ❌ 无法访问 / ⚠️ 跳转

### 步骤 4：整理报告
汇报：检测总数、正常数、无法访问数（列出具体 URL）、重定向数。

### 步骤 5：清理建议
对无法访问的书签，询问删除还是保留。
可在标题前加 [已失效] 标记，而非直接删除。

### 重要提醒
- 检测速度不要过快，避免触发 rate limit
- 每批间隔 2-3 秒
- 不检测 localhost、内网 IP
- 让用户选择只检测特定文件夹`,
};

// ─── Window Skills ────────────────────────────────────

const windowMerger: SkillDef = {
  name: 'window-merger',
  description: '当用户打开了多个浏览器窗口，想把所有标签页合并到一个窗口统一管理时使用',
  source: 'builtin:windows',
  resources: [],
  prompt: `## 窗口合并技能

你已激活"窗口合并"技能。将所有分散窗口的标签页合并到主窗口。

### 步骤 1：获取所有窗口和标签页
用 \`windows_getAll\` 获取所有窗口及标签页，展示窗口分布。

### 步骤 2：选择合并策略
让用户选择：全部合并到当前窗口、合并到新窗口、合并到指定窗口、或仅合并部分窗口。

### 步骤 3：执行合并
1. 用 \`tabs_move\` 将标签页移动到目标窗口
2. 移空后自动关闭源窗口（用 \`windows_remove\`）
3. 用 \`tabs_group\` 按原始窗口来源创建标签组（不同颜色区分）

### 步骤 4：汇报
汇报：原有窗口数→现在窗口数、合并的标签页数、关闭的空窗口数、创建的标签组数。

### 重要提醒
- pinned 标签页保持在前面
- 源窗口有播放媒体的标签页要提醒
- 移动时保持原有顺序`,
};

// ─── Cross-Domain Skills ──────────────────────────────

const researchMode: SkillDef = {
  name: 'research-mode',
  description: '当用户打开了很多关于同一主题的页面做调研，想把它们归拢到同一个窗口集中浏览时使用',
  source: 'builtin:cross',
  resources: [],
  prompt: `## 研究模式技能

你已激活"研究模式"技能。帮用户把分散的调研标签页组织成一个专注的研究工作区。

### 步骤 1：确认研究主题
询问用户：研究主题是什么？要归拢哪些标签页（当前窗口全部/用户指定/当前窗口+其他相关）？

### 步骤 2：收集标签页
用 \`tabs_query\` 收集目标标签页，排除邮件、聊天、空白页和被排除的域名。

### 步骤 3：创建研究窗口
1. 用 \`windows_create\` 创建新窗口（不激活）
2. 用 \`tabs_move\` 将所有研究标签页移入
3. 用 \`tabs_group\` 按域名/子主题创建标签组

### 步骤 4：组织标签页顺序
按研究逻辑排列：概览→核心文档→参考案例→社区讨论。

### 步骤 5：创建研究书签
在书签栏创建"研究 - {主题名}"文件夹，加入所有 URL。

### 步骤 6：汇报
汇报：主题、新窗口标签页数、创建的标签组、书签位置。

### 步骤 7：后续归档（用户主动触发）
当用户说"归档这个研究"时：
1. 用 \`sessions_save\` 保存窗口会话
2. 可选：用 \`page_getMarkdown\` 抓取内容保存到 storage
3. 用 \`page_viewMarkdown\` 生成汇总页面
4. 询问是否关闭研究窗口

### 重要提醒
- 不在新窗口激活（不打断当前工作）
- 移动前列出清单等确认
- 标签组命名简短有意义`,
};

const readingList: SkillDef = {
  name: 'reading-list',
  description: '当用户想保存当前页面留待以后阅读，或想查看/管理已保存的阅读列表时使用',
  source: 'builtin:cross',
  resources: [],
  prompt: `## 阅读列表技能

你已激活"阅读列表"技能。帮用户管理稍后阅读的内容。

### 添加到阅读列表
1. 确认保存范围：当前标签页 / 当前窗口全部 / 用户指定
2. 用 \`page_getMetadata\` 获取每个页面元数据
3. 用 \`bookmarks_getTree\` 检查是否已有"📖 阅读列表"文件夹，没有则创建
4. 用 \`bookmarks_create\` 加入，标题格式：YYYY-MM-DD {页面标题}（过长截断）

### 查看阅读列表
1. 用 \`bookmarks_search\` 搜索"阅读列表"文件夹
2. 按日期分组展示

### 开始阅读
1. 展示在线列表，推荐最近添加的
2. 用 \`tabs_create\` 在新标签页打开
3. 询问：已读完（从列表移除）/ 还没读完（保留）/ 加入永久书签（移动）

### 清理阅读列表
列出超过 30 天未读的文章，询问：删除 / 移到永久书签 / 暂时保留。

### 重要提醒
- 阅读列表是待消费队列，不是普通书签
- 添加时自动记录日期
- 已读文章给"存档"选项而非直接删除`,
};

const privacyCleanup: SkillDef = {
  name: 'privacy-cleanup',
  description: '当用户想清除浏览痕迹，但需要保留特定网站（如工作邮箱、内部系统）的登录状态时使用',
  source: 'builtin:cross',
  resources: [],
  prompt: `## 隐私深度清洁技能

你已激活"隐私深度清洁"技能。帮助用户精确清理浏览器隐私数据。

### 步骤 1：确认白名单
询问要保留哪些网站。或从书签中分析常用网站、从最近活跃标签页推测。

### 步骤 2：清理 Cookie
用 \`cookies_getAll\` 获取所有 cookie，按域名分组。
白名单外的域名用 \`cookies_remove\` 逐个删除。

### 步骤 3：清理历史记录
用 \`history_search\` 搜索，白名单外的用 \`history_delete\` 删除（高风险，需确认）。

### 步骤 4：清理本地存储
用 \`storage_local_get\` 检查扩展的本地存储。

### 步骤 5：检查隐私设置
如果启用了 Expert Mode，用 \`privacy_getNetworkSettings\` 查看 WebRTC 等设置并建议优化。

### 步骤 6：汇报
汇报：删除的 cookie 域名数和数量、删除的历史记录条数、白名单保留的网站。

### 重要提醒
- 删除需用户确认
- 不清理扩展自身 storage
- 清理 cookie 会导致登录退出，提醒用户`,
};

const pageScraper: SkillDef = {
  name: 'page-scraper',
  description: '当用户想从当前页面提取结构化数据，如所有链接、表格、图片列表时使用',
  source: 'builtin:cross',
  resources: [],
  prompt: `## 页面内容提取技能

你已激活"页面内容提取"技能。帮用户从页面中提取结构化信息。

### 步骤 1：确认提取目标
询问用户想提取：所有链接、表格数据、图片列表、联系方式、代码块、或全文 Markdown。

### 步骤 2：获取页面内容
1. 用 \`tabs_query\` 确认当前活跃标签页
2. 用 \`page_getMarkdown\` 获取 Markdown 版本
3. 用 \`page_getMetadata\` 获取元数据
4. 如需原文，用 \`page_getContent\` 获取 Readability 提取的内容

### 步骤 3：处理提取结果
- 链接：从 Markdown 解析 [text](url)，按域名分组
- 表格：识别 Markdown 表格语法（| col | col |）
- 图片：解析 ![alt](url)，列出 URL 和描述

### 步骤 4：展示和保存
1. 在对话中展示结构化结果
2. 询问是否需要导出：用 \`page_viewMarkdown\` 在新标签页展示，或用 \`clipboard_write\` 复制到剪贴板

### 重要提醒
- 过滤页面内导航链接（#锚点）
- 超大页面提醒用户结果可能很长
- 链接保持原始 URL`,
};

// ─── Download Skills ──────────────────────────────────

const downloadCleanup: SkillDef = {
  name: 'download-cleanup',
  description: '当用户想查看下载历史、按类型整理下载文件、或清理旧的下载记录时使用',
  source: 'builtin:downloads',
  resources: [],
  prompt: `## 下载整理技能

你已激活"下载整理"技能。帮用户管理和清理下载记录。

### 步骤 1：分析下载状态
用 \`downloads_search\` 获取历史。按文件类型统计（文档、图片、压缩包、程序、媒体、其他）、按时间统计（今天/7天/30天/更早）、按状态统计（完成/进行中/中断）。

### 步骤 2：展示下载概况
分类展示下载统计。

### 步骤 3：清理建议
识别可清理项：
- 超过 30 天的临时文件（temp、untitled、截图等文件名）
- 重复下载（同 URL 多次，只保留最新）
- 超过 24 小时未恢复的中断下载
- 旧版本安装包

列出清单等确认后用 \`downloads_erase\` 删除记录。

### 步骤 4：管理进行中的下载
用 \`downloads_pause\` 暂停不紧急的大文件、\`downloads_cancel\` 取消不需要的、\`downloads_resume\` 恢复暂停的。

### 步骤 5：汇报
汇报：清理记录数、保留记录数、取消的下载数。

### 重要提醒
- erase 只删除浏览器记录，不删除本地文件
- 取消前先确认用户是否还需要`,
};

// ─── Aggregation ──────────────────────────────────────

const ALL_BUILTIN_SKILLS: SkillDef[] = [
  tabCleanup,
  tabSorter,
  tabWorkspace,
  tabRescue,
  focusMode,
  bookmarkDedup,
  bookmarkOrganizer,
  bookmarkValidator,
  windowMerger,
  researchMode,
  readingList,
  privacyCleanup,
  pageScraper,
  downloadCleanup,
];

export async function registerBuiltinSkills(): Promise<void> {
  const { SkillStore } = await import('@/shared/storage');
  const skillStore = SkillStore.getInstance();

  const result = await browser.storage.local.get(BUILTIN_VERSION_KEY);
  const storedVersion = (result as Record<string, unknown>)[BUILTIN_VERSION_KEY] as number | undefined;
  const needsUpdate = storedVersion !== CURRENT_VERSION;

  const existingSkills = await skillStore.getAll();

  for (const def of ALL_BUILTIN_SKILLS) {
    const existing = existingSkills.find((s: Skill) => s.source === def.source && s.name === def.name);

    if (existing) {
      if (needsUpdate) {
        await skillStore.update(existing.id, {
          description: def.description,
          prompt: def.prompt,
          resources: def.resources,
        });
      }
    } else {
      const now = Date.now();
      await skillStore.add({
        id: crypto.randomUUID(),
        ...def,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  if (needsUpdate) {
    await browser.storage.local.set({ [BUILTIN_VERSION_KEY]: CURRENT_VERSION });
  }
}

export { CURRENT_VERSION, ALL_BUILTIN_SKILLS };
