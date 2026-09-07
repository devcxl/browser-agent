import { describe, it, expect, vi } from 'vitest';
import { ProxySettingsProxy } from '../proxies/proxy-proxy';
import type { IBrowserAdapter } from '@/adapters/types';

function createMockAdapter(): IBrowserAdapter {
  return {
    browserType: 'chrome',
    proxy: {
      getSettings: vi.fn().mockResolvedValue({ levelOfControl: 'controllable_by_this_extension', value: { mode: 'system' } }),
      setSettings: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    },
    addListener: vi.fn(),
  } as unknown as IBrowserAdapter;
}

describe('ProxySettingsProxy', () => {
  it('getSettings should delegate to adapter.proxy.getSettings', async () => {
    const adapter = createMockAdapter();
    const proxy = new ProxySettingsProxy(adapter);

    const result = await proxy.getSettings();

    expect(adapter.proxy.getSettings).toHaveBeenCalled();
    expect(result.value).toEqual({ mode: 'system' });
  });

  it('setSettings should delegate with the whole value object', async () => {
    const adapter = createMockAdapter();
    const proxy = new ProxySettingsProxy(adapter);

    const value = { mode: 'fixed_servers', rules: { singleProxy: { scheme: 'http', host: 'localhost', port: 8888 } } };
    await proxy.setSettings({ value });

    expect(adapter.proxy.setSettings).toHaveBeenCalledWith({ value });
  });

  it('clear should delegate to adapter.proxy.clear', async () => {
    const adapter = createMockAdapter();
    const proxy = new ProxySettingsProxy(adapter);

    await proxy.clear();

    expect(adapter.proxy.clear).toHaveBeenCalled();
  });
});
