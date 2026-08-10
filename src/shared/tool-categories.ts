import type { ToolCategory } from './types/tool';

/**
 * 工具类别 → 一行说明（LLM 索引与分类 prompt 共用）。
 * 保持简短，避免在 system prompt 中重复消耗 token。
 */
export const TOOL_CATEGORY_DESCRIPTIONS: Record<ToolCategory, string> = {
  tabs: '标签页操作（打开、关闭、切换、移动、查询标签页信息）',
  windows: '窗口操作（创建、关闭、切换、调整窗口）',
  tabGroups: '标签组操作（创建、折叠、展开、管理标签组）',
  bookmarks: '书签操作（添加、删除、搜索、整理书签）',
  history: '历史记录操作（查询、删除浏览历史）',
  downloads: '下载操作（查询、管理下载文件）',
  sessions: '会话操作（保存、恢复浏览会话）',
  page: '页面操作（截图、获取页面内容、执行脚本）',
  cookies: 'Cookie 操作（读取、设置、删除 Cookie）',
  storage: '存储操作（localStorage/sessionStorage 读写）',
  clipboard: '剪贴板操作（读写剪贴板）',
  notifications: '通知操作（创建、管理浏览器通知）',
  contextMenus: '右键菜单操作',
  sidePanel: '侧边栏操作',
  alarms: '定时器/闹钟操作',
  system: '系统信息（内存、CPU、平台信息）',
  expert: '高级功能（需要 Expert Mode）',
  management: '扩展管理（安装、卸载、启用/禁用扩展）',
  privacy: '隐私设置（清除数据、隐私配置）',
  proxy: '代理设置',
  debugger: '调试器操作（attach/detach 调试器）',
  declarativeNetRequest: '网络请求规则',
};

/**
 * 本地关键词 → 类别映射。
 * 用户消息命中任意关键词即激活对应类别，避免为常见指令付出 LLM 往返。
 */
export const LOCAL_CATEGORY_KEYWORDS: Record<ToolCategory, readonly string[]> = {
  tabs: ['标签页', '标签', 'tab', 'tabs'],
  windows: ['窗口', 'window', '新窗口'],
  tabGroups: ['标签组', '分组', 'tab group'],
  bookmarks: ['书签', '收藏夹', '收藏', 'bookmark'],
  history: ['历史记录', '浏览历史', 'history'],
  downloads: ['下载', 'download'],
  sessions: ['会话', 'session', '上次会话'],
  page: ['页面', '截图', '网页', 'markdown', '脚本', 'page'],
  cookies: ['cookie', 'Cookie'],
  storage: ['storage', 'localStorage', 'sessionStorage'],
  clipboard: ['剪贴板', 'clipboard'],
  notifications: ['通知', 'notification'],
  contextMenus: ['右键菜单', 'context menu'],
  sidePanel: ['侧边栏', 'side panel'],
  alarms: ['闹钟', '定时器', 'alarm'],
  system: ['系统信息', '内存', 'cpu', '平台'],
  expert: ['高级功能', 'expert mode'],
  management: ['扩展', '安装扩展', '卸载扩展', 'extension'],
  privacy: ['隐私', '清除数据', 'privacy'],
  proxy: ['代理', 'proxy'],
  debugger: ['调试器', 'debugger'],
  declarativeNetRequest: ['网络请求规则', '请求规则'],
};
