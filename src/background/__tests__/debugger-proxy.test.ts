import { describe, it, expect, vi } from 'vitest';
import { DebuggerProxy } from '../proxies/debugger-proxy';
import type { IBrowserAdapter } from '@/adapters/types';

function createMockAdapter(): IBrowserAdapter {
  return {
    browserType: 'chrome',
    debugger: {
      getTargets: vi.fn().mockResolvedValue([{ id: 't1', type: 'page', title: 'x', url: 'https://x' }]),
      attach: vi.fn().mockResolvedValue(undefined),
      detach: vi.fn().mockResolvedValue(undefined),
      sendCommand: vi.fn(),
    },
    addListener: vi.fn(),
  } as unknown as IBrowserAdapter;
}

describe('DebuggerProxy', () => {
  it('getTargets should delegate to adapter.debugger.getTargets', async () => {
    const adapter = createMockAdapter();
    const proxy = new DebuggerProxy(adapter);

    const result = await proxy.getTargets();

    expect(adapter.debugger.getTargets).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('t1');
  });

  it('attach should delegate to adapter.debugger.attach with targetId', async () => {
    const adapter = createMockAdapter();
    const proxy = new DebuggerProxy(adapter);

    await proxy.attach({ targetId: 't1' });

    expect(adapter.debugger.attach).toHaveBeenCalledWith('t1');
  });

  it('detach should delegate to adapter.debugger.detach with targetId', async () => {
    const adapter = createMockAdapter();
    const proxy = new DebuggerProxy(adapter);

    await proxy.detach({ targetId: 't1' });

    expect(adapter.debugger.detach).toHaveBeenCalledWith('t1');
  });
});
