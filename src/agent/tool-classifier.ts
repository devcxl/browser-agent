import { generateObject } from 'ai';
import { z } from 'zod';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import type { ToolCategory } from '@/shared/types/tool';

// ---------------------------------------------------------------------------
// 分类 prompt
// ---------------------------------------------------------------------------

const CLASSIFIER_PROMPT = `你是浏览器工具分类器。根据用户消息判断需要用到哪些工具类别。

可用类别及其说明：
- tabs: 标签页操作（打开、关闭、切换、移动、查询标签页信息）
- windows: 窗口操作（创建、关闭、切换、调整窗口）
- tabGroups: 标签组操作（创建、折叠、展开、管理标签组）
- bookmarks: 书签操作（添加、删除、搜索、整理书签）
- history: 历史记录操作（查询、删除浏览历史）
- downloads: 下载操作（查询、管理下载文件）
- sessions: 会话操作（保存、恢复浏览会话）
- page: 页面操作（截图、获取页面内容、执行脚本）
- cookies: Cookie 操作（读取、设置、删除 Cookie）
- storage: 存储操作（localStorage/sessionStorage 读写）
- clipboard: 剪贴板操作（读写剪贴板）
- notifications: 通知操作（创建、管理浏览器通知）
- contextMenus: 右键菜单操作
- sidePanel: 侧边栏操作
- alarms: 定时器/闹钟操作
- system: 系统信息（内存、CPU、平台信息）
- expert: 高级功能（需要 Expert Mode）
- management: 扩展管理（安装、卸载、启用/禁用扩展）
- privacy: 隐私设置（清除数据、隐私配置）
- proxy: 代理设置
- debugger: 调试器操作（attach/detach 调试器）
- declarativeNetRequest: 网络请求规则

请精确判断用户消息涉及的类别，只返回真正需要的类别名数组。不要返回无关类别。若难以判断，返回空数组。` as const;

// ---------------------------------------------------------------------------
// 分类结果缓存（同一对话内复用）
// ---------------------------------------------------------------------------

interface CacheEntry {
  userMessage: string;
  categories: ToolCategory[];
  timestamp: number;
}

// ---------------------------------------------------------------------------
// ToolClassifier
// ---------------------------------------------------------------------------

export class ToolClassifier {
  private cache: CacheEntry | null = null;

  /**
   * LLM 预分类：将用户消息映射到工具类别列表。
   * 使用 generateObject 要求 LLM 输出 string 数组。
   */
  async classify(
    userMessage: string,
    model: LanguageModelV4,
  ): Promise<ToolCategory[]> {
    // 缓存命中：同一消息直接返回
    if (this.cache?.userMessage === userMessage) {
      return this.cache.categories;
    }

    try {
      const result = await generateObject({
        model,
        output: 'array' as const,
        schema: z.string(),
        system: CLASSIFIER_PROMPT,
        prompt: `用户消息: ${userMessage}`,
        maxOutputTokens: 100,
        temperature: 0,
      });

      const raw = result.object as string[];

      // 保护：只保留实际存在的 category 名称
      const validCategories = raw.filter((c): c is ToolCategory =>
        CATEGORY_NAMES.has(c as ToolCategory),
      );

      this.cache = {
        userMessage,
        categories: validCategories,
        timestamp: Date.now(),
      };

      return validCategories;
    } catch {
      // 分类失败时返回空，让 prepareStep 使用全量工具
      return [];
    }
  }

  /** 清除缓存 */
  reset(): void {
    this.cache = null;
  }
}

// 所有合法 category 名称的集合
const CATEGORY_NAMES: ReadonlySet<ToolCategory> = new Set([
  'tabs',
  'windows',
  'tabGroups',
  'bookmarks',
  'history',
  'downloads',
  'sessions',
  'page',
  'cookies',
  'storage',
  'clipboard',
  'notifications',
  'contextMenus',
  'sidePanel',
  'alarms',
  'system',
  'expert',
  'management',
  'privacy',
  'proxy',
  'debugger',
  'declarativeNetRequest',
]);
