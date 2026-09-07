import { describe, it, expect, vi } from 'vitest';
import { DnrProxy } from '../proxies/dnr-proxy';
import type { IBrowserAdapter } from '@/adapters/types';

function createMockAdapter(): IBrowserAdapter {
  return {
    browserType: 'chrome',
    declarativeNetRequest: {
      getDynamicRules: vi.fn().mockResolvedValue([{ id: 1, action: { type: 'block' }, condition: { urlFilter: '*://x.com/*' } }]),
      addDynamicRules: vi.fn().mockResolvedValue(undefined),
      removeDynamicRules: vi.fn().mockResolvedValue(undefined),
    },
    addListener: vi.fn(),
  } as unknown as IBrowserAdapter;
}

describe('DnrProxy', () => {
  it('getDynamicRules should delegate to adapter', async () => {
    const adapter = createMockAdapter();
    const proxy = new DnrProxy(adapter);

    const result = await proxy.getDynamicRules();

    expect(adapter.declarativeNetRequest.getDynamicRules).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(1);
  });

  it('addDynamicRules should delegate with rules array', async () => {
    const adapter = createMockAdapter();
    const proxy = new DnrProxy(adapter);

    const rule = { id: 2, action: { type: 'block' as const }, condition: { urlFilter: '*://y.com/*' } };
    await proxy.addDynamicRules({ rules: [rule] });

    expect(adapter.declarativeNetRequest.addDynamicRules).toHaveBeenCalledWith([rule]);
  });

  it('removeDynamicRules should delegate with ruleIds', async () => {
    const adapter = createMockAdapter();
    const proxy = new DnrProxy(adapter);

    await proxy.removeDynamicRules({ ruleIds: [1, 2] });

    expect(adapter.declarativeNetRequest.removeDynamicRules).toHaveBeenCalledWith([1, 2]);
  });
});
