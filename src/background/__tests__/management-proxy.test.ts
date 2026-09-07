import { describe, it, expect, vi } from 'vitest';
import { ManagementProxy } from '../proxies/management-proxy';
import type { IBrowserAdapter } from '@/adapters/types';

function createMockAdapter(): IBrowserAdapter {
  return {
    browserType: 'chrome',
    management: {
      getAll: vi.fn().mockResolvedValue([{ id: 'e1', name: 'Ext', enabled: true, version: '1', type: 'extension' }]),
      get: vi.fn().mockResolvedValue({ id: 'e1', name: 'Ext', enabled: true, version: '1', type: 'extension' }),
      setEnabled: vi.fn().mockResolvedValue(undefined),
    },
    addListener: vi.fn(),
  } as unknown as IBrowserAdapter;
}

describe('ManagementProxy', () => {
  it('getAll should delegate to adapter.management.getAll', async () => {
    const adapter = createMockAdapter();
    const proxy = new ManagementProxy(adapter);

    const result = await proxy.getAll();

    expect(adapter.management.getAll).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Ext');
  });

  it('get should delegate to adapter.management.get with id', async () => {
    const adapter = createMockAdapter();
    const proxy = new ManagementProxy(adapter);

    const result = await proxy.get({ id: 'e1' });

    expect(adapter.management.get).toHaveBeenCalledWith('e1');
    expect(result.id).toBe('e1');
  });

  it('setEnabled should delegate with id and enabled flag', async () => {
    const adapter = createMockAdapter();
    const proxy = new ManagementProxy(adapter);

    await proxy.setEnabled({ id: 'e1', enabled: false });

    expect(adapter.management.setEnabled).toHaveBeenCalledWith('e1', false);
  });
});
