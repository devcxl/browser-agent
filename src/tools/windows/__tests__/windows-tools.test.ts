import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IJsonRpcClient, ToolDefinition } from '@/shared/types';
import { createWindowsTools } from '../index';

function createMockRpc(): IJsonRpcClient {
  return {
    request: vi.fn(),
    notify: vi.fn(),
    onRequest: vi.fn(),
    onNotification: vi.fn(),
    offRequest: vi.fn(),
    offNotification: vi.fn(),
    disconnect: vi.fn(),
    connected: true,
  };
}

describe('createWindowsTools', () => {
  let rpc: IJsonRpcClient;

  beforeEach(() => {
    rpc = createMockRpc();
  });

  it('should return 4 tool definitions', () => {
    const tools = createWindowsTools(rpc);
    expect(tools).toHaveLength(4);
  });

  describe('windows_getAll', () => {
    let tool: ToolDefinition;

    beforeEach(() => {
      tool = createWindowsTools(rpc).find((t) => t.name === 'windows_getAll')!;
    });

    it('should have correct metadata', () => {
      expect(tool.category).toBe('windows');
      expect(tool.riskLevel).toBe('low');
      expect(tool.confirmationRequired).toBe(false);
      expect(tool.name).toBe('windows_getAll');
    });

    it('should call rpc.request("windows.getAll") and return result', async () => {
      const mockWindows = [{ id: 1 }, { id: 2 }];
      vi.mocked(rpc.request).mockResolvedValue(mockWindows);

      const result = await tool.execute({});

      expect(rpc.request).toHaveBeenCalledWith('windows.getAll', {});
      expect(result).toEqual({ success: true, data: mockWindows });
    });

    it('should pass getInfo params to rpc', async () => {
      vi.mocked(rpc.request).mockResolvedValue([]);

      await tool.execute({ getInfo: { populate: true, windowTypes: ['normal'] } });

      expect(rpc.request).toHaveBeenCalledWith('windows.getAll', {
        getInfo: { populate: true, windowTypes: ['normal'] },
      });
    });

    it('should handle rpc error gracefully', async () => {
      vi.mocked(rpc.request).mockRejectedValue(new Error('RPC failed'));

      const result = await tool.execute({});

      expect(result).toEqual({ success: false, error: 'RPC failed' });
    });
  });

  describe('windows_get', () => {
    let tool: ToolDefinition;

    beforeEach(() => {
      tool = createWindowsTools(rpc).find((t) => t.name === 'windows_get')!;
    });

    it('should have correct metadata', () => {
      expect(tool.category).toBe('windows');
      expect(tool.riskLevel).toBe('low');
      expect(tool.confirmationRequired).toBe(false);
      expect(tool.name).toBe('windows_get');
    });

    it('should call rpc.request("windows.get") with windowId', async () => {
      const mockWindow = { id: 42, focused: true };
      vi.mocked(rpc.request).mockResolvedValue(mockWindow);

      const result = await tool.execute({ windowId: 42 });

      expect(rpc.request).toHaveBeenCalledWith('windows.get', { windowId: 42 });
      expect(result).toEqual({ success: true, data: mockWindow });
    });

    it('should pass getInfo when provided', async () => {
      vi.mocked(rpc.request).mockResolvedValue({});

      await tool.execute({ windowId: 1, getInfo: { populate: true } });

      expect(rpc.request).toHaveBeenCalledWith('windows.get', {
        windowId: 1,
        getInfo: { populate: true },
      });
    });

    it('should handle rpc error', async () => {
      vi.mocked(rpc.request).mockRejectedValue(new Error('Not found'));

      const result = await tool.execute({ windowId: 999 });

      expect(result).toEqual({ success: false, error: 'Not found' });
    });
  });

  describe('windows_create', () => {
    let tool: ToolDefinition;

    beforeEach(() => {
      tool = createWindowsTools(rpc).find((t) => t.name === 'windows_create')!;
    });

    it('should have correct metadata', () => {
      expect(tool.category).toBe('windows');
      expect(tool.riskLevel).toBe('medium');
      expect(tool.confirmationRequired).toBe(false);
      expect(tool.name).toBe('windows_create');
    });

    it('should call rpc.request("windows.create") with createData', async () => {
      const mockWindow = { id: 10, focused: true };
      vi.mocked(rpc.request).mockResolvedValue(mockWindow);

      const result = await tool.execute({
        createData: { url: 'https://example.com', focused: true },
      });

      expect(rpc.request).toHaveBeenCalledWith('windows.create', {
        createData: { url: 'https://example.com', focused: true },
      });
      expect(result).toEqual({ success: true, data: mockWindow });
    });

    it('should handle empty createData', async () => {
      vi.mocked(rpc.request).mockResolvedValue({ id: 1 });

      const result = await tool.execute({});

      expect(rpc.request).toHaveBeenCalledWith('windows.create', {});
      expect(result).toEqual({ success: true, data: { id: 1 } });
    });

    it('should handle rpc error', async () => {
      vi.mocked(rpc.request).mockRejectedValue(new Error('Create failed'));

      const result = await tool.execute({ createData: { url: 'about:blank' } });

      expect(result).toEqual({ success: false, error: 'Create failed' });
    });
  });

  describe('windows_remove', () => {
    let tool: ToolDefinition;

    beforeEach(() => {
      tool = createWindowsTools(rpc).find((t) => t.name === 'windows_remove')!;
    });

    it('should have correct metadata', () => {
      expect(tool.category).toBe('windows');
      expect(tool.riskLevel).toBe('high');
      expect(tool.confirmationRequired).toBe(true);
      expect(tool.name).toBe('windows_remove');
      expect(typeof tool.preflight).toBe('function');
    });

    it('should call rpc.request("windows.remove") with windowId', async () => {
      vi.mocked(rpc.request).mockResolvedValue(undefined);

      const result = await tool.execute({ windowId: 5 });

      expect(rpc.request).toHaveBeenCalledWith('windows.remove', { windowId: 5 });
      expect(result).toEqual({ success: true });
    });

    it('should handle rpc error', async () => {
      vi.mocked(rpc.request).mockRejectedValue(new Error('Window not found'));

      const result = await tool.execute({ windowId: 999 });

      expect(result).toEqual({ success: false, error: 'Window not found' });
    });

    describe('preflight', () => {
      it('should return tabs and window affected objects', async () => {
        const mockTabs = [
          { id: 1, title: 'Tab A', url: 'https://a.com' },
          { id: 2, title: 'Tab B', url: 'https://b.com' },
        ];
        const mockWindow = { id: 42, title: 'My Window' };
        vi.mocked(rpc.request)
          .mockResolvedValueOnce(mockTabs)
          .mockResolvedValueOnce(mockWindow);

        const result = await tool.preflight!({ windowId: 42 });

        expect(rpc.request).toHaveBeenCalledWith('tabs.query', {
          queryInfo: { windowId: 42 },
        });
        expect(rpc.request).toHaveBeenCalledWith('windows.get', { windowId: 42 });

        expect(result.affectedObjects).toHaveLength(3);
        // First two are tabs
        expect(result.affectedObjects[0]).toMatchObject({
          type: 'tab',
          id: '1',
          title: 'Tab A',
          url: 'https://a.com',
          reason: 'will be closed',
        });
        expect(result.affectedObjects[1]).toMatchObject({
          type: 'tab',
          id: '2',
          title: 'Tab B',
          url: 'https://b.com',
          reason: 'will be closed',
        });
        // Last is the window itself
        expect(result.affectedObjects[2]).toMatchObject({
          type: 'window',
          id: '42',
          title: 'My Window',
          reason: 'will be removed',
        });
        expect(result.warnings).toEqual([]);
      });

      it('should return warning for empty window', async () => {
        vi.mocked(rpc.request)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce({ id: 42 });

        const result = await tool.preflight!({ windowId: 42 });

        expect(result.affectedObjects).toHaveLength(1);
        expect(result.affectedObjects[0]).toMatchObject({
          type: 'window',
          id: '42',
          reason: 'will be removed',
        });
        expect(result.warnings).toEqual([
          'Window has no tabs',
        ]);
      });

      it('should not crash when tabs.query fails', async () => {
        vi.mocked(rpc.request)
          .mockRejectedValueOnce(new Error('Permission denied'))
          .mockResolvedValueOnce({ id: 42, title: 'Test' });

        const result = await tool.preflight!({ windowId: 42 });

        expect(result.affectedObjects).toHaveLength(1);
        expect(result.affectedObjects[0]).toMatchObject({
          type: 'window',
          id: '42',
          title: 'Test',
          reason: 'will be removed',
        });
        expect(result.warnings).toContain('Unable to list tabs: Permission denied');
      });

      it('should not crash when windows.get fails', async () => {
        const mockTabs = [{ id: 1, title: 'Tab', url: 'https://x.com' }];
        vi.mocked(rpc.request)
          .mockResolvedValueOnce(mockTabs)
          .mockRejectedValueOnce(new Error('Access denied'));

        const result = await tool.preflight!({ windowId: 42 });

        expect(result.affectedObjects).toHaveLength(2);
        expect(result.affectedObjects[0]).toMatchObject({ type: 'tab' });
        expect(result.affectedObjects[1]).toMatchObject({
          type: 'window',
          id: '42',
          title: 'Window 42',
          reason: 'will be removed',
        });
        expect(result.warnings).toContain('Unable to get window info: Access denied');
      });
    });
  });
});
