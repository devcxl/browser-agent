import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbMock = {
  listConversationsByUpdatedAt: vi.fn(async () => []),
  getMessagesByConversation: vi.fn(async () => []),
  putConversation: vi.fn(async () => undefined),
  putMessagesBatch: vi.fn(async () => undefined),
};

/** 本机已配置的数据（默认实现，用例可临时覆盖） */
function localSettings(key: string): unknown {
  if (key === 'providers') {
    return [
      {
        id: 'local-provider',
        name: 'Local',
        apiKey: 'sk-local-secret',
        isLocalTrusted: true,
        extraHeaders: { Authorization: 'Bearer local-token', 'X-Trace': 'keep' },
      },
    ];
  }
  if (key === 'jevSettings') return { enabled: true, apiKey: 'jev-local-secret' };
  return undefined;
}

const storeMock = {
  get: vi.fn(async (key: string) => {
    if (key === 'providers') {
      return [
        {
          id: 'local-provider',
          name: 'Local',
          apiKey: 'sk-local-secret',
          isLocalTrusted: true,
          extraHeaders: { Authorization: 'Bearer local-token', 'X-Trace': 'keep' },
        },
      ];
    }
    if (key === 'jevSettings') return { enabled: true, apiKey: 'jev-local-secret' };
    return undefined;
  }),
  set: vi.fn(async () => undefined),
};

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

describe('全量快照：凭据不落盘、导入保留本机密钥', () => {
  beforeEach(() => {
    storeMock.get.mockImplementation(async (key: string) => localSettings(key));
    storeMock.set.mockClear();
    dbMock.putConversation.mockClear();
  });

  it('导出快照剥离 apiKey 与鉴权类 header', async () => {
    storeMock.get.mockImplementation(async (key: string) => {
      if (key === 'providers') {
        return [provider({ extraHeaders: { Authorization: 'Bearer t', 'X-Trace': 'keep' } })];
      }
      if (key === 'jevSettings') return { enabled: true, apiKey: 'jev-secret' };
      return undefined;
    });

    const text = await captureExport();

    expect(text).not.toContain('sk-exported-secret');
    expect(text).not.toContain('jev-secret');
    expect(text).not.toContain('Bearer t');

    const snapshot = JSON.parse(text);
    expect(snapshot.settings.providers[0].apiKey).toBe('');
    expect(snapshot.settings.providers[0].extraHeaders).toEqual({
      Authorization: '',
      'X-Trace': 'keep',
    });
    expect(snapshot.settings.jevSettings.apiKey).toBe('');
  });

  it('导入脱敏快照时按 provider id 回填本机 apiKey 与 header', async () => {
    const snapshot = JSON.stringify({
      format: 'browser-agent-snapshot',
      version: 1,
      exportedAt: 0,
      conversations: [],
      settings: {
        providers: [
          provider({ apiKey: '', extraHeaders: { Authorization: '', 'X-Trace': 'imported' } }),
        ],
        jevSettings: { enabled: true, apiKey: '' },
      },
    });

    await importFullSnapshot(snapshot);

    const [, providers] = storeMock.set.mock.calls.find(([key]) => key === 'providers') as [
      string,
      Array<{ apiKey: string; extraHeaders: Record<string, string> }>,
    ];
    expect(providers[0]!.apiKey).toBe('sk-local-secret');
    expect(providers[0]!.extraHeaders).toEqual({
      Authorization: 'Bearer local-token',
      'X-Trace': 'imported',
    });

    const [, jev] = storeMock.set.mock.calls.find(([key]) => key === 'jevSettings') as [
      string,
      { apiKey: string },
    ];
    expect(jev.apiKey).toBe('jev-local-secret');
  });

  it('导入携带密钥的快照时以文件内容为准', async () => {
    const snapshot = JSON.stringify({
      format: 'browser-agent-snapshot',
      version: 1,
      exportedAt: 0,
      conversations: [],
      settings: { providers: [provider({ apiKey: 'sk-in-file' })] },
    });

    await importFullSnapshot(snapshot);

    const [, providers] = storeMock.set.mock.calls.find(([key]) => key === 'providers') as [
      string,
      Array<{ apiKey: string }>,
    ];
    expect(providers[0]!.apiKey).toBe('sk-in-file');
  });
});
