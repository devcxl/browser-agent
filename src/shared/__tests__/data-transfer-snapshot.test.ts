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

const { exportFullSnapshot, importFullSnapshot, parseSnapshot, SNAPSHOT_SETTINGS_KEYS } =
  await import('../data-transfer');

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

describe('全量快照：providers 与 Jev 设置不进备份、导入忽略旧备份中的配置', () => {
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

  it('导出快照完全不包含 Jev 设置，也不读取本机 Jev 设置', async () => {
    const text = await captureExport();
    const snapshot = JSON.parse(text);

    expect(snapshot.settings).not.toHaveProperty('jevSettings');
    expect(text).not.toContain('jev-local-secret');
    expect(getMock.mock.calls.some(([key]) => key === 'jevSettings')).toBe(false);
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

  it('导入旧备份时忽略任意 jevSettings，保留本机 Jev 设置', async () => {
    const snapshot = JSON.stringify({
      format: 'browser-agent-snapshot',
      version: 1,
      exportedAt: 0,
      conversations: [],
      settings: {
        jevSettings: { enabled: false, apiKey: 'sk-in-file', arbitrary: { nested: true } },
        agentSettings: { maxToolRounds: 5 },
      },
    });

    const result = await importFullSnapshot(snapshot);

    expect(setMock.mock.calls.some(([key]) => key === 'jevSettings')).toBe(false);
    expect(getMock.mock.calls.some(([key]) => key === 'jevSettings')).toBe(false);
    expect(result.settingsKeys).not.toContain('jevSettings');
    expect(importedValue('agentSettings')).toEqual({ maxToolRounds: 5 });
  });

  it('settings 缺失（undefined/null）时导入不抛错且 settingsKeys 为空，正常恢复会话', async () => {
    const rawNoSettings = JSON.stringify({
      format: 'browser-agent-snapshot',
      version: 1,
      exportedAt: 0,
      conversations: [
        {
          id: 'c-test',
          title: '会话测试',
          messages: [{ id: 'm-test', role: 'user', content: 'hello' }],
        },
      ],
    });

    const parsed = parseSnapshot(rawNoSettings);
    expect(parsed.settings).toEqual({});

    const result = await importFullSnapshot(rawNoSettings);
    expect(result.conversations).toBe(1);
    expect(result.messages).toBe(1);
    expect(result.settingsKeys).toEqual([]);
    expect(dbMock.putConversation).toHaveBeenCalled();
    expect(dbMock.putMessagesBatch).toHaveBeenCalled();

    // 当 settings 显式为 null 时
    const rawNullSettings = JSON.stringify({
      format: 'browser-agent-snapshot',
      version: 1,
      exportedAt: 0,
      conversations: [],
      settings: null,
    });
    const parsedNull = parseSnapshot(rawNullSettings);
    expect(parsedNull.settings).toEqual({});
    const resultNull = await importFullSnapshot(rawNullSettings);
    expect(resultNull.settingsKeys).toEqual([]);
  });

  it('SNAPSHOT_SETTINGS_KEYS 作为唯一事实来源，导出覆盖全部合法可配置键且不含敏感键', async () => {
    expect(SNAPSHOT_SETTINGS_KEYS).not.toContain('providers');
    expect(SNAPSHOT_SETTINGS_KEYS).not.toContain('jevSettings');

    storeMock.get.mockImplementation((async (key: string) => {
      if ((SNAPSHOT_SETTINGS_KEYS as readonly string[]).includes(key)) {
        return { mockVal: key };
      }
      return undefined;
    }) as never);

    const text = await captureExport();
    const snapshot = JSON.parse(text);

    // 导出的 settings 键与 SNAPSHOT_SETTINGS_KEYS 完全一致
    expect(Object.keys(snapshot.settings).sort()).toEqual([...SNAPSHOT_SETTINGS_KEYS].sort());
  });
});
