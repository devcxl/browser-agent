import { generateText, type LanguageModel } from 'ai';
import type { ToolCategory } from '@/shared/types/tool';
import {
  LOCAL_CATEGORY_KEYWORDS,
  TOOL_CATEGORY_DESCRIPTIONS,
} from '@/shared/tool-categories';

// ---------------------------------------------------------------------------
// 分类 prompt
// ---------------------------------------------------------------------------

const CATEGORY_LISTING = (Object.keys(TOOL_CATEGORY_DESCRIPTIONS) as ToolCategory[])
  .map((category) => `- ${category}: ${TOOL_CATEGORY_DESCRIPTIONS[category]}`)
  .join('\n');

const CLASSIFIER_PROMPT = `你是浏览器工具分类器。根据用户消息判断需要用到哪些工具类别，以 JSON 字符串数组格式输出。

可用类别及其说明：
${CATEGORY_LISTING}

请精确判断用户消息涉及的类别，不要推理或解释，返回可能需要的类别数组。不要返回无关类别。若难以判断，返回空数组。` as const;

// ---------------------------------------------------------------------------
// 分类结果缓存（同一对话内复用，FIFO 上限防膨胀）
// ---------------------------------------------------------------------------

const CACHE_LIMIT = 100;

// ---------------------------------------------------------------------------
// ToolClassifier
// ---------------------------------------------------------------------------

export class ToolClassifier {
  private cache = new Map<string, ToolCategory[]>();

  /**
   * 工具预分类：优先本地关键词规则（零 LLM 往返），未命中时再用 LLM 兜底。
   * 将用户消息映射到工具类别列表。
   * 使用 generateText + 手动解析 JSON，避免依赖 provider 的
   * structuredOutputs/json_schema 支持（DeepSeek 等不兼容）。
   */
  async classify(
    userMessage: string,
    model: LanguageModel,
  ): Promise<ToolCategory[]> {
    const cached = this.cache.get(userMessage);
    if (cached) {
      console.debug('[ToolClassifier] 缓存命中:', cached);
      return cached;
    }

    const local = classifyByKeywords(userMessage);
    if (local !== null) {
      console.debug('[ToolClassifier] 本地规则命中:', local);
      this.remember(userMessage, local);
      return local;
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

      this.remember(userMessage, validCategories);

      return validCategories;
    } catch (err) {
      console.warn('[ToolClassifier] classify 失败, 返回空数组', err);
      return [];
    }
  }

  /** 清除缓存 */
  reset(): void {
    this.cache.clear();
  }

  /** 写入缓存并保持 FIFO 上限 */
  private remember(userMessage: string, categories: ToolCategory[]): void {
    if (this.cache.size >= CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(userMessage, categories);
  }
}

/**
 * 本地关键词规则分类：命中任意关键词即激活对应类别。
 * 返回 null 表示无法判断（交由 LLM 兜底）。
 */
function classifyByKeywords(userMessage: string): ToolCategory[] | null {
  const matched: ToolCategory[] = [];
  for (const [category, keywords] of Object.entries(LOCAL_CATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => userMessage.includes(keyword))) {
      matched.push(category as ToolCategory);
    }
  }
  return matched.length > 0 ? matched : null;
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
