import type { ProviderConfig, ProviderModelConfig as CatalogModel } from '@/shared/types/llm';

export type { ProviderModelConfig as CatalogModel } from '@/shared/types/llm';

export interface CatalogProvider {
  id: string;
  name: string;
  npm: string;
  api: string;
  env: string[];
  models: Record<string, CatalogModel>;
}

interface CatalogData {
  [providerId: string]: CatalogProvider;
}

const API_URL = 'https://models.dev/api.json';
const CACHE_KEY = 'browser_agent_provider_catalog';
const CACHE_TTL = 24 * 60 * 60 * 1000;

const KNOWN_ENDPOINTS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  cohere: 'https://api.cohere.com/v2',
  mistral: 'https://api.mistral.ai/v1',
  azure: '',
  'amazon-bedrock': '',
  'google-vertex': '',
  xai: 'https://api.x.ai/v1',
  groq: 'https://api.groq.com/openai/v1',
  perplexity: 'https://api.perplexity.ai',
  deepinfra: 'https://api.deepinfra.com/v1/openai',
  togetherai: 'https://api.together.xyz/v1',
  cerebras: 'https://api.cerebras.ai/v1',
  vercel: 'https://api.vercel.ai/v1',
}; // 24 小时

interface CacheEntry {
  data: CatalogData;
  timestamp: number;
}

export class ProviderCatalog {
  private static instance: ProviderCatalog | null = null;

  static getInstance(): ProviderCatalog {
    if (!ProviderCatalog.instance) {
      ProviderCatalog.instance = new ProviderCatalog();
    }
    return ProviderCatalog.instance;
  }

  private catalog: CatalogData | null = null;
  private loading: Promise<CatalogData> | null = null;

  async getCatalog(): Promise<CatalogData> {
    if (this.catalog) return this.catalog;
    if (this.loading) return this.loading;

    this.loading = this.loadCatalog();
    try {
      this.catalog = await this.loading;
      return this.catalog;
    } finally {
      this.loading = null;
    }
  }

  private async loadCatalog(): Promise<CatalogData> {
    const cached = await this.readCache();
    if (cached) {
      this.fetchAndCacheInBackground();
      return cached;
    }

    try {
      const data = await this.fetchCatalog();
      this.writeCache(data);
      return data;
    } catch {
      throw new Error('无法加载 Provider 目录，请检查网络连接');
    }
  }

  private async readCache(): Promise<CatalogData | null> {
    try {
      const result = await browser.storage.local.get(CACHE_KEY);
      const entry = result[CACHE_KEY] as CacheEntry | undefined;
      if (!entry) return null;
      if (Date.now() - entry.timestamp > CACHE_TTL) return null;
      return entry.data;
    } catch {
      return null;
    }
  }

  private async writeCache(data: CatalogData): Promise<void> {
    try {
      const entry: CacheEntry = { data, timestamp: Date.now() };
      await browser.storage.local.set({ [CACHE_KEY]: entry });
    } catch {
      // storage 满或不支持，静默忽略
    }
  }

  private fetchAndCacheInBackground(): void {
    this.fetchCatalog()
      .then((data) => this.writeCache(data))
      .catch(() => {});
  }

  private async fetchCatalog(): Promise<CatalogData> {
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error(`获取 Provider 目录失败: HTTP ${response.status}`);
    }
    return response.json() as Promise<CatalogData>;
  }

  /** 获取特定 provider 的元数据 */
  async getProvider(providerId: string): Promise<CatalogProvider | null> {
    const catalog = await this.getCatalog();
    const raw = catalog[providerId];
    if (!raw) return null;
    // 填充已知的默认 endpoint
    if (!raw.api && KNOWN_ENDPOINTS[providerId]) {
      return { ...raw, api: KNOWN_ENDPOINTS[providerId]! };
    }
    return raw;
  }

  /** 将目录模板转换为插件运行时使用的独立 Provider 快照。 */
  createProviderSnapshot(template: CatalogProvider, config: Pick<ProviderConfig, 'id' | 'apiKey' | 'isLocalTrusted'>): ProviderConfig {
    return {
      ...config,
      name: template.name,
      sourceProviderId: template.id,
      npm: template.npm,
      api: template.api,
      env: template.env,
      models: structuredClone(template.models),
      defaultModelId: Object.values(template.models)[0]?.id,
      // 保留旧字段，便于升级前的调用方和已存储数据平滑过渡。
      providerId: template.id,
      endpoint: template.api,
    };
  }

  /** 为旧 ProviderConfig 补齐本地模型目录快照。 */
  async migrateProviderConfig(config: ProviderConfig): Promise<ProviderConfig> {
    if (config.npm && config.api && config.models) return config;

    let template: CatalogProvider | null = null;
    try {
      template = config.providerId ? await this.getProvider(config.providerId) : null;
    } catch {
      template = null;
    }

    const fallbackApi = config.endpoint ?? template?.api ?? '';
    return {
      ...config,
      sourceProviderId: config.sourceProviderId ?? config.providerId,
      npm: config.npm ?? template?.npm ?? '@ai-sdk/openai-compatible',
      api: config.api ?? fallbackApi,
      env: config.env ?? template?.env ?? [],
      models: config.models ?? structuredClone(template?.models ?? {}),
      defaultModelId: config.defaultModelId ?? Object.values(template?.models ?? {})[0]?.id,
      endpoint: fallbackApi,
    };
  }

  /** 获取 provider 列表（用于下拉选择） */
  async getProviderList(): Promise<Array<{ id: string; name: string; npm: string }>> {
    const catalog = await this.getCatalog();
    return Object.values(catalog)
      .filter((p) => {
        // 过滤掉没有 endpoint 且不在已知列表中的 provider
        if (p.api) return true;
        if (KNOWN_ENDPOINTS[p.id]) return true;
        return false;
      })
      .map((p) => ({
        id: p.id,
        name: p.name,
        npm: p.npm,
      }));
  }

  /** 清空缓存（用于强制刷新） */
  async clearCache(): Promise<void> {
    await browser.storage.local.remove(CACHE_KEY);
    this.catalog = null;
  }
}
