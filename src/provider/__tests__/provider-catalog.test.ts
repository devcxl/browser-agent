import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProviderCatalog } from '../provider-catalog';
import type { CatalogProvider } from '../provider-catalog';
import { createI18nMock } from '@/test/i18n-mock';

const CACHE_KEY = 'browser_agent_provider_catalog';

/** 构造一份可供 fetch mock 返回的目录数据 */
function makeCatalogData(): Record<string, CatalogProvider> {
  return {
    openai: {
      id: 'openai',
      name: 'OpenAI',
      npm: '@ai-sdk/openai',
      api: '',
      env: ['OPENAI_API_KEY'],
      models: {
        'gpt-4o': { id: 'gpt-4o', name: 'GPT-4o' },
      },
    },
    custom: {
      id: 'custom',
      name: 'Custom',
      npm: '@ai-sdk/openai-compatible',
      api: 'https://custom.example.com/v1',
      env: ['CUSTOM_API_KEY'],
      models: {
        m1: { id: 'm1', name: 'M1' },
      },
    },
  };
}

function createStorageMock() {
  const storage: Record<string, unknown> = {};
  return {
    get: vi.fn(async (keys: string | string[] | null) => {
      const result: Record<string, unknown> = {};
      if (keys === null) return { ...storage };
      const keysArr = Array.isArray(keys) ? keys : [keys];
      for (const k of keysArr) {
        if (k in storage) result[k] = storage[k];
      }
      return result;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(storage, items);
    }),
    remove: vi.fn(async (key: string) => {
      delete storage[key];
    }),
  };
}

/** 全局 browser / fetch 环境构造与清理 */
function stubEnv() {
  const storageMock = createStorageMock();
  vi.stubGlobal('browser', {
    storage: { local: storageMock },
    i18n: createI18nMock(),
  });
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  return { storageMock, fetchMock };
}

/** 返回单例测试对象并在每个用例后重置单例与缓存 */
async function freshCatalog() {
  // 清空单例，确保每个用例都是干净的实例
  (ProviderCatalog as unknown as { instance: ProviderCatalog | null }).instance = null;
  const catalog = ProviderCatalog.getInstance();
  return catalog;
}

describe('ProviderCatalog', () => {
  let env: ReturnType<typeof stubEnv>;

  beforeEach(() => {
    env = stubEnv();
    // 快进时间：默认走 fetch 而非过期判断
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    (ProviderCatalog as unknown as { instance: ProviderCatalog | null }).instance = null;
  });

  describe('getCatalog / loadCatalog', () => {
    it('应该返回 fetch 到的目录并写入缓存', async () => {
      const data = makeCatalogData();
      env.fetchMock.mockResolvedValue({
        ok: true,
        json: async () => data,
      });

      const catalog = await freshCatalog();
      const result = await catalog.getCatalog();

      expect(env.fetchMock).toHaveBeenCalledTimes(1);
      expect(result.openai?.id).toBe('openai');
      // 已写入 storage
      expect(env.storageMock.set).toHaveBeenCalled();
      expect(env.storageMock.set.mock.calls[0]![0]![CACHE_KEY]).toMatchObject({
        data: { openai: expect.any(Object) },
        timestamp: expect.any(Number),
      });
    });

    it('并发调用只触发一次网络请求', async () => {
      const data = makeCatalogData();
      env.fetchMock.mockResolvedValue({ ok: true, json: async () => data });

      const catalog = await freshCatalog();
      const [a, b] = await Promise.all([catalog.getCatalog(), catalog.getCatalog()]);

      expect(env.fetchMock).toHaveBeenCalledTimes(1);
      expect(a).toBe(b);
    });

    it('fetch 失败时抛出友好错误', async () => {
      env.fetchMock.mockRejectedValue(new Error('network down'));

      const catalog = await freshCatalog();
      await expect(catalog.getCatalog()).rejects.toThrow('无法加载 Provider 目录，请检查网络连接');
    });

    it('fetch 返回非 2xx 时抛出错误', async () => {
      env.fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

      const catalog = await freshCatalog();
      await expect(catalog.getCatalog()).rejects.toThrow('无法加载 Provider 目录，请检查网络连接');
    });

    it('缓存命中时返回缓存数据，并后台刷新（静默）', async () => {
      const data = makeCatalogData();
      const now = Date.now();
      vi.setSystemTime(now);

      // 预置有效缓存
      env.storageMock.set.mockImplementation(async (items) => {
        const [k, v] = Object.entries(items)[0]!;
        (env.storageMock.get as ReturnType<typeof vi.fn>).mockImplementation(async (keys: string | null) => {
          const keysArr = Array.isArray(keys) ? keys : [keys];
          const result: Record<string, unknown> = {};
          if (k === keysArr[0]) result[k] = v;
          return result;
        });
      });
      // 简化：直接覆盖 get 返回缓存
      const cached = { data, timestamp: now - 1000 };
      (env.storageMock.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ [CACHE_KEY]: cached });
      env.fetchMock.mockResolvedValue({ ok: true, json: async () => makeCatalogData() });

      const catalog = await freshCatalog();
      const result = await catalog.getCatalog();

      expect(result).toBe(data); // 命中缓存
      // 后台 fetch 触发（fire-and-forget），需要放行微任务
      await vi.advanceTimersByTimeAsync(0);
      expect(env.fetchMock).toHaveBeenCalledTimes(1);
    });

    it('过期缓存会被忽略并重新 fetch', async () => {
      const now = Date.now();
      vi.setSystemTime(now);
      const expired = { data: makeCatalogData(), timestamp: now - 25 * 60 * 60 * 1000 };
      (env.storageMock.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ [CACHE_KEY]: expired });
      env.fetchMock.mockResolvedValue({ ok: true, json: async () => makeCatalogData() });

      const catalog = await freshCatalog();
      const result = await catalog.getCatalog();

      expect(env.fetchMock).toHaveBeenCalledTimes(1);
      expect(result.openai?.id).toBe('openai');
    });

    it('storage.get 抛错时降级为重新 fetch（readCache 容错）', async () => {
      (env.storageMock.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('storage unavailable'));
      env.fetchMock.mockResolvedValue({ ok: true, json: async () => makeCatalogData() });

      const catalog = await freshCatalog();
      const result = await catalog.getCatalog();

      expect(env.fetchMock).toHaveBeenCalledTimes(1);
      expect(result.openai?.id).toBe('openai');
    });

    it('storage.set 抛错时不影响返回（writeCache 容错）', async () => {
      env.fetchMock.mockResolvedValue({ ok: true, json: async () => makeCatalogData() });
      (env.storageMock.set as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('quota exceeded'));

      const catalog = await freshCatalog();
      const result = await catalog.getCatalog();

      expect(result.openai?.id).toBe('openai');
    });
  });

  describe('getProvider', () => {
    it('对已知 provider 自动填充默认 endpoint', async () => {
      env.fetchMock.mockResolvedValue({
        ok: true,
        json: async () => makeCatalogData(),
      });

      const catalog = await freshCatalog();
      const provider = await catalog.getProvider('openai');

      // openai 目录里 api 为空，应回填 known endpoint
      expect(provider?.api).toBe('https://api.openai.com/v1');
      expect(provider?.id).toBe('openai');
    });

    it('目录中已自带 api 的 provider 原样返回', async () => {
      env.fetchMock.mockResolvedValue({
        ok: true,
        json: async () => makeCatalogData(),
      });

      const catalog = await freshCatalog();
      const provider = await catalog.getProvider('custom');

      expect(provider?.api).toBe('https://custom.example.com/v1');
    });

    it('未知 provider 返回 null', async () => {
      env.fetchMock.mockResolvedValue({
        ok: true,
        json: async () => makeCatalogData(),
      });

      const catalog = await freshCatalog();
      const provider = await catalog.getProvider('nonexistent');

      expect(provider).toBeNull();
    });
  });

  describe('createProviderSnapshot', () => {
    it('模板转运行时快照', async () => {
      const template = makeCatalogData().openai!;
      const snapshot = ProviderCatalog.getInstance().createProviderSnapshot(template, {
        id: 'my-openai',
        apiKey: 'sk-1',
        isLocalTrusted: false,
      });

      expect(snapshot.id).toBe('my-openai');
      expect(snapshot.name).toBe('OpenAI');
      expect(snapshot.sourceProviderId).toBe('openai');
      expect(snapshot.providerId).toBe('openai');
      expect(snapshot.npm).toBe('@ai-sdk/openai');
      expect(snapshot.api).toBe('');
      expect(snapshot.endpoint).toBe('');
      expect(snapshot.models).toHaveProperty('gpt-4o');
      expect(snapshot.defaultModelId).toBe('gpt-4o');
      expect(snapshot.apiKey).toBe('sk-1');
    });
  });

  describe('migrateProviderConfig', () => {
    it('完整配置直接返回', async () => {
      const catalog = await freshCatalog();
      const cfg = {
        id: 'p1',
        name: 'P',
        providerId: 'openai',
        endpoint: 'https://api.openai.com/v1',
        apiKey: 'k',
        isLocalTrusted: false,
        npm: '@ai-sdk/openai',
        api: 'https://api.openai.com/v1',
        models: { 'gpt-4o': { id: 'gpt-4o', name: 'GPT-4o' } },
      };
      const result = await catalog.migrateProviderConfig(cfg);

      expect(result).toBe(cfg);
    });

    it('旧配置缺失 npm/api/models 时从 catalog 补齐', async () => {
      env.fetchMock.mockResolvedValue({
        ok: true,
        json: async () => makeCatalogData(),
      });

      const catalog = await freshCatalog();
      const legacy = {
        id: 'p2',
        name: 'P2',
        providerId: 'openai',
        endpoint: 'https://old.example.com/v1',
        apiKey: 'k',
        isLocalTrusted: true,
      };
      const result = await catalog.migrateProviderConfig(legacy);

      expect(result.npm).toBe('@ai-sdk/openai');
      expect(result.api).toBe('https://old.example.com/v1'); // 优先 endpoint
      expect(result.endpoint).toBe('https://old.example.com/v1');
      expect(result.models).toHaveProperty('gpt-4o');
      expect(result.defaultModelId).toBe('gpt-4o');
      expect(result.sourceProviderId).toBe('openai');
    });

    it('未知 provider 且无 endpoint 时使用默认空值补齐', async () => {
      env.fetchMock.mockResolvedValue({
        ok: true,
        json: async () => makeCatalogData(),
      });

      const catalog = await freshCatalog();
      const legacy = {
        id: 'p3',
        name: 'P3',
        providerId: 'unknown',
        apiKey: 'k',
        isLocalTrusted: false,
      };
      const result = await catalog.migrateProviderConfig(legacy);

      expect(result.npm).toBe('@ai-sdk/openai-compatible');
      expect(result.api).toBe('');
      expect(result.models).toEqual({});
      expect(result.sourceProviderId).toBe('unknown');
    });

    it('getProvider 抛错（fetch 失败）时 migrate 仍以空模板补齐', async () => {
      env.fetchMock.mockRejectedValue(new Error('network down'));

      const catalog = await freshCatalog();
      const legacy = {
        id: 'p4',
        name: 'P4',
        providerId: 'openai',
        apiKey: 'k',
        isLocalTrusted: false,
      };
      const result = await catalog.migrateProviderConfig(legacy);

      // fetch 失败被 migrate 内部 catch 吸收，回退为兼容默认值
      expect(result.npm).toBe('@ai-sdk/openai-compatible');
      expect(result.sourceProviderId).toBe('openai');
      expect(result.models).toEqual({});
    });
  });

  describe('getProviderList', () => {
    it('过滤掉既无 api 也不在 known endpoints 的 provider', async () => {
      const data = makeCatalogData();
      data.unknownNoEndpoint = {
        id: 'unknownNoEndpoint',
        name: 'No Endpoint',
        npm: '@ai-sdk/openai-compatible',
        api: '',
        env: [],
        models: {},
      };
      env.fetchMock.mockResolvedValue({ ok: true, json: async () => data });

      const catalog = await freshCatalog();
      const list = await catalog.getProviderList();

      const ids = list.map((p) => p.id);
      expect(ids).toContain('openai'); // known endpoint
      expect(ids).toContain('custom'); // has api
      expect(ids).not.toContain('unknownNoEndpoint');
    });
  });

  describe('clearCache', () => {
    it('清空本地缓存并重置内存目录', async () => {
      env.fetchMock.mockResolvedValue({ ok: true, json: async () => makeCatalogData() });

      const catalog = await freshCatalog();
      await catalog.getCatalog();
      expect(catalog['catalog']).not.toBeNull();

      await catalog.clearCache();

      expect(env.storageMock.remove).toHaveBeenCalledWith(CACHE_KEY);
      expect(catalog['catalog']).toBeNull();
    });
  });
});
