import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbMock = {
  listConversationsByUpdatedAt: vi.fn(async () => []),
  getMessagesByConversation: vi.fn(async () => []),
  putConversation: vi.fn(async () => undefined),
  putMessagesBatch: vi.fn(async () => undefined),
};

const storeMock = {
  get: vi.fn(async (key: string) => {
    if (key === 'jevSettings') return { enabled: true, apiKey: 'jev-local-secret' };
    return undefined;
  }),
  set: vi.fn(async (..._args: unknown[]) => undefined),
};

/** storeMock.set 的类型友好视图：set 的 mock 实现签名与真实调用签名不一致（vi.fn 泛型推断限制） */
const setMock = storeMock.set as unknown as { mock: { calls: unknown[][] }; mockClear: () => void };
const getMock = storeMock.get as unknown as { mock: { calls: unknown[][] }; mockClear: () => void };

vi.mock('@/shared/db/database', () => ({
  Database: { getInstance: () => dbMock },
}));

vi.mock('@/shared/storage', () => ({
  ConfigStore: { getInstance: () => storeMock },
}));

const { exportFullSnapshot, importFullSnapshot } = await import('../data-transfer');

function provider(overrides: Record<string, unknown> = {}) {
  return {
    id: 'local-provider',
    name: 'Local',
    apiKey: 'sk-exported-secret',
    isLocalTrusted: true,
    ...overrides,
  };
}

/** 拦截 createObjectURL，拿到导出的 Blob 内容 */
async function captureExport(): Promise<string> {
  let captured: Blob | undefined;
  const original = URL.createObjectURL;
  URL.createObjectURL = ((blob: Blob) => {
    captured = blob;
    return 'blob:mock';
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = () => undefined;
  try {
    await exportFullSnapshot();
  } finally {
    URL.createObjectURL = original;
  }
  if (!captured) throw new Error('未触发下载');
  return captured.text();
}

function importedValue(key: string): unknown {
  const call = setMock.mock.calls.find(([name]) => name === key);
  return call?.[1];
}

describe('全量快照：providers 不进备份、导入忽略旧备份的 providers', () => {
  beforeEach(() => {
    storeMock.get.mockImplementation((async (key: string) => {
      if (key === 'providers') {
        return [provider({ extraHeaders: { Authorization: 'Bearer local-token' } })];
      }
      if (key === 'jevSettings') return { enabled: true, apiKey: 'jev-local-secret' };
      return undefined;
    }) as never);
    setMock.mockClear();
    getMock.mockClear();
    dbMock.putConversation.mockClear();
  });

  it('导出快照完全不包含 providers，也不读取本机 providers', async () => {
    const text = await captureExport();
    const snapshot = JSON.parse(text);

    expect(snapshot.settings).not.toHaveProperty('providers');
    expect(text).not.toContain('local-provider');
    expect(text).not.toContain('sk-exported-secret');
    expect(getMock.mock.calls.some(([key]) => key === 'providers')).toBe(false);
  });

  it('导出仍脱敏 Jev apiKey', async () => {
    const text = await captureExport();
    const snapshot = JSON.parse(text);

    expect(text).not.toContain('jev-local-secret');
    expect(snapshot.settings.jevSettings.apiKey).toBe('');
  });

  it('导入旧备份时忽略 providers，保留本机配置', async () => {
    const snapshot = JSON.stringify({
      format: 'browser-agent-snapshot',
      version: 1,
      exportedAt: 0,
      conversations: [],
      settings: {
        providers: [provider({ apiKey: 'sk-in-file' })],
        agentSettings: { maxToolRounds: 5 },
      },
    });

    const result = await importFullSnapshot(snapshot);

    expect(setMock.mock.calls.some(([key]) => key === 'providers')).toBe(false);
    expect(importedValue('agentSettings')).toEqual({ maxToolRounds: 5 });
    expect(result.settingsKeys).not.toContain('providers');
  });

  it('导入时仍按本机配置回填 Jev apiKey', async () => {
    const snapshot = JSON.stringify({
      format: 'browser-agent-snapshot',
      version: 1,
      exportedAt: 0,
      conversations: [],
      settings: { jevSettings: { enabled: true, apiKey: '' } },
    });

    await importFullSnapshot(snapshot);

    expect(importedValue('jevSettings')).toEqual({
      enabled: true,
      apiKey: 'jev-local-secret',
    });
  });
});
