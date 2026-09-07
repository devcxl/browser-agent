import { describe, it, expect, vi } from 'vitest';
import { PrivacyProxy } from '../proxies/privacy-proxy';
import type { IBrowserAdapter } from '@/adapters/types';

function createMockAdapter(): IBrowserAdapter {
  return {
    browserType: 'chrome',
    privacy: {
      getNetworkSettings: vi.fn().mockResolvedValue({ levelOfControl: 'controllable_by_this_extension', value: { networkPredictionEnabled: true } }),
      setNetworkSetting: vi.fn().mockResolvedValue(undefined),
    },
    addListener: vi.fn(),
  } as unknown as IBrowserAdapter;
}

describe('PrivacyProxy', () => {
  it('getNetworkSettings should delegate to adapter.privacy.getNetworkSettings', async () => {
    const adapter = createMockAdapter();
    const proxy = new PrivacyProxy(adapter);

    const result = await proxy.getNetworkSettings();

    expect(adapter.privacy.getNetworkSettings).toHaveBeenCalled();
    expect(result.levelOfControl).toBe('controllable_by_this_extension');
  });

  it('setNetworkSetting should delegate with key and value', async () => {
    const adapter = createMockAdapter();
    const proxy = new PrivacyProxy(adapter);

    await proxy.setNetworkSetting({ key: 'networkPredictionEnabled', value: false });

    expect(adapter.privacy.setNetworkSetting).toHaveBeenCalledWith('networkPredictionEnabled', false);
  });
});
