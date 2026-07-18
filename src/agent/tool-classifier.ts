import { generateText, type LanguageModel } from 'ai';
import type { ToolCategory } from '@/shared/types/tool';

// ---------------------------------------------------------------------------
// 分类 prompt
// ---------------------------------------------------------------------------

const CLASSIFIER_PROMPT = `你是浏览器工具分类器。根据用户消息判断需要用到哪些工具类别，以 JSON 字符串数组格式输出。

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

请精确判断用户消息涉及的类别，不要推理或解释，返回可能需要的类别数组。不要返回无关类别。若难以判断，返回空数组。` as const;

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
   * 使用 generateText + 手动解析 JSON，避免依赖 provider 的
   * structuredOutputs/json_schema 支持（DeepSeek 等不兼容）。
   */
  async classify(
    userMessage: string,
    model: LanguageModel,
  ): Promise<ToolCategory[]> {
    if (this.cache?.userMessage === userMessage) {
      console.debug('[ToolClassifier] 缓存命中:', this.cache.categories);
      return this.cache.categories;
    }

    try {
      console.debug('[ToolClassifier] 开始 generateText 分类...');
      const t0 = performance.now();

      const result = await generateText({
        model,
        system: CLASSIFIER_PROMPT,
        prompt: `用户消息: ${userMessage}`,
        maxOutputTokens: 512,
        temperature: 0,
        reasoning: 'none',
      });

      const raw = parseCategoryArray(result.text);
      if (raw.length === 0 && !result.text.trim() && result.finishReason !== 'length') {
        raw.push(...parseCategoryArray(result.reasoningText ?? ''));
      }
      console.debug('[ToolClassifier] generateText 完成', {
        text: result.text.slice(0, 200),
        reasoningLength: result.reasoningText?.length ?? 0,
        finishReason: result.finishReason,
        usage: result.usage,
        raw,
        elapsed: `${(performance.now() - t0).toFixed(0)}ms`,
      });

      const validCategories = raw.filter((c): c is ToolCategory =>
        CATEGORY_NAMES.has(c as ToolCategory),
      );

      if (validCategories.length !== raw.length) {
        console.debug('[ToolClassifier] 过滤无效类别:', raw.filter(c => !CATEGORY_NAMES.has(c as ToolCategory)));
      }

      this.cache = {
        userMessage,
        categories: validCategories,
        timestamp: Date.now(),
      };

      return validCategories;
    } catch (err) {
      console.warn('[ToolClassifier] classify 失败, 返回空数组', err);
      return [];
    }
  }

  /** 清除缓存 */
  reset(): void {
    this.cache = null;
  }
}

/**
 * 从模型输出中提取类别名数组。
 * 兼容 markdown code fence 与首尾多余文本，优先取最后一个合法数组片段。
 */
function parseCategoryArray(text: string): string[] {
  const matches = text.match(/\[[\s\S]*?\]/g) ?? [];
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    try {
      const parsed: unknown = JSON.parse(matches[index]!);
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
        return parsed;
      }
    } catch {
      // 尝试更早的数组片段
    }
  }
  return [];
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
