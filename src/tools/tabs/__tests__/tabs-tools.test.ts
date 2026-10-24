import { describe, it, expect, vi } from 'vitest';
import type { IJsonRpcClient } from '@/shared/types';
import { createTabsTools } from '../index';
import { createTabsQueryTool, createTabsManageTool, createTabsRemoveTool } from '../tabs-tools';

function createMockRpc(): IJsonRpcClient {
  return {
    request: vi.fn().mockResolvedValue(undefined),
    notify: vi.fn(),
    onRequest: vi.fn(),
    onNotification: vi.fn(),
    offRequest: vi.fn(),
    offNotification: vi.fn(),
    disconnect: vi.fn(),
    connected: true,
  };
}

describe('Tabs tools', () => {
  describe('createTabsTools', () => {
    it('should return 3 tools', () => {
      const rpc = createMockRpc();
      const tools = createTabsTools(rpc);
      expect(tools).toHaveLength(3);
    });

    it('should expose tabs_query, tabs_manage and tabs_remove only', () => {
      const rpc = createMockRpc();
      const names = createTabsTools(rpc).map((tool) => tool.name);
      expect(names).toEqual(['tabs_query', 'tabs_manage', 'tabs_remove']);
    });

    it('should no longer expose the fragmented tab mutation tools', () => {
      const rpc = createMockRpc();
      const names = createTabsTools(rpc).map((tool) => tool.name);
      for (const retired of ['tabs_get', 'tabs_create', 'tabs_update', 'tabs_move', 'tabs_group', 'tabs_ungroup']) {
        expect(names).not.toContain(retired);
      }
    });
  });

  describe('tabs_query', () => {
    it('should call rpc.request("tabs.get", { tabId }) when tabId is provided', async () => {
      const rpc = createMockRpc();
      const tool = createTabsQueryTool(rpc);
      await tool.execute({ tabId: 5 });
      expect(rpc.request).toHaveBeenCalledWith('tabs.get', { tabId: 5 });
    });

    it('should return the full tab object when tabId is provided', async () => {
      const rpc = createMockRpc();
      const mockTab = { id: 5, title: 'Test', url: 'https://example.com', active: true, pinned: false };
      vi.mocked(rpc.request).mockResolvedValue(mockTab);
      const tool = createTabsQueryTool(rpc);
      const result = await tool.execute({ tabId: 5 });
      expect(result).toEqual({ success: true, data: mockTab });
    });

    it('should prefer tabId over queryInfo when both are provided', async () => {
      const rpc = createMockRpc();
      const tool = createTabsQueryTool(rpc);
      await tool.execute({ tabId: 3, queryInfo: { active: true } });
      expect(rpc.request).toHaveBeenCalledWith('tabs.get', { tabId: 3 });
      expect(rpc.request).not.toHaveBeenCalledWith('tabs.query', expect.anything());
    });

    it('should call rpc.request("tabs.query", { queryInfo }) when queryInfo is provided', async () => {
      const rpc = createMockRpc();
      const tool = createTabsQueryTool(rpc);
      await tool.execute({ queryInfo: { active: true, currentWindow: true } });
      expect(rpc.request).toHaveBeenCalledWith('tabs.query', {
        queryInfo: { active: true, currentWindow: true },
      });
    });

    it('should return success result with tabs data, defaulting to currentWindow', async () => {
      const rpc = createMockRpc();
      const mockTabs = [{ id: 1, title: 'Test' }];
      vi.mocked(rpc.request).mockResolvedValue(mockTabs);
      const tool = createTabsQueryTool(rpc);
      const result = await tool.execute({});
      expect(rpc.request).toHaveBeenCalledWith('tabs.query', { queryInfo: { currentWindow: true } });
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockTabs);
    });

    it('should return error result when rpc fails', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockRejectedValue(new Error('RPC failed'));
      const tool = createTabsQueryTool(rpc);
      const result = await tool.execute({ tabId: 1 });
      expect(result).toEqual({ success: false, error: 'RPC failed' });
    });

    it('should have correct metadata', () => {
      const rpc = createMockRpc();
      const tool = createTabsQueryTool(rpc);
      expect(tool.name).toBe('tabs_query');
      expect(tool.category).toBe('tabs');
      expect(tool.riskLevel).toBe('low');
      expect(tool.confirmationRequired).toBe(false);
      expect(tool.resultSensitivity).toBe('sensitive');
      expect(tool.requireBackground).toBe(true);
    });

    it('should expose optional tabId and queryInfo in schema', () => {
      const rpc = createMockRpc();
      const tool = createTabsQueryTool(rpc);
      expect(tool.schema.properties).toHaveProperty('tabId');
      expect(tool.schema.properties).toHaveProperty('queryInfo');
      expect(tool.schema.required).toBeUndefined();
    });
  });

  describe('tabs_manage', () => {
    describe('metadata', () => {
      it('should have correct metadata', () => {
        const rpc = createMockRpc();
        const tool = createTabsManageTool(rpc);
        expect(tool.name).toBe('tabs_manage');
        expect(tool.category).toBe('tabs');
        expect(tool.riskLevel).toBe('medium');
        expect(tool.confirmationRequired).toBe(false);
        expect(tool.resultSensitivity).toBe('low');
        expect(tool.requireBackground).toBe(true);
      });

      it('should require only action and expose the action enum', () => {
        const rpc = createMockRpc();
        const tool = createTabsManageTool(rpc);
        expect(tool.schema.required).toEqual(['action']);
        const properties = tool.schema.properties as Record<string, { type?: string; enum?: string[] }>;
        expect(properties.action.type).toBe('string');
        expect(properties.action.enum).toEqual(['create', 'update', 'move', 'group', 'ungroup']);
      });

      it('should expose the shared mutation parameters in schema', () => {
        const rpc = createMockRpc();
        const tool = createTabsManageTool(rpc);
        const properties = tool.schema.properties as Record<string, unknown>;
        for (const key of ['url', 'active', 'pinned', 'tabId', 'tabIds', 'index', 'windowId', 'groupId']) {
          expect(properties).toHaveProperty(key);
        }
      });
    });

    describe('action "create"', () => {
      it('should call rpc.request("tabs.create", { createProperties })', async () => {
        const rpc = createMockRpc();
        const mockTab = { id: 11, url: 'https://example.com' };
        vi.mocked(rpc.request).mockResolvedValue(mockTab);
        const tool = createTabsManageTool(rpc);

        const result = await tool.execute({
          action: 'create',
          url: 'https://example.com',
          active: false,
          pinned: true,
          windowId: 2,
          index: 1,
        });

        expect(rpc.request).toHaveBeenCalledWith('tabs.create', {
          createProperties: {
            url: 'https://example.com',
            active: false,
            pinned: true,
            windowId: 2,
            index: 1,
          },
        });
        expect(result).toEqual({ success: true, data: mockTab });
      });
    });

    describe('action "update"', () => {
      it('should call rpc.request("tabs.update", { tabId, updateProperties })', async () => {
        const rpc = createMockRpc();
        const mockTab = { id: 3, url: 'https://new-url.com' };
        vi.mocked(rpc.request).mockResolvedValue(mockTab);
        const tool = createTabsManageTool(rpc);

        const result = await tool.execute({
          action: 'update',
          tabId: 3,
          url: 'https://new-url.com',
          active: true,
          pinned: false,
        });

        expect(rpc.request).toHaveBeenCalledWith('tabs.update', {
          tabId: 3,
          updateProperties: { url: 'https://new-url.com', active: true, pinned: false },
        });
        expect(result).toEqual({ success: true, data: mockTab });
      });

      it('should return an error when tabId is missing', async () => {
        const rpc = createMockRpc();
        const tool = createTabsManageTool(rpc);

        const result = await tool.execute({ action: 'update', url: 'https://new-url.com' });

        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
        expect(rpc.request).not.toHaveBeenCalled();
      });
    });

    describe('action "move"', () => {
      it('should call rpc.request("tabs.move", { tabIds, moveProperties })', async () => {
        const rpc = createMockRpc();
        const mockResult = [{ id: 1, index: 0 }];
        vi.mocked(rpc.request).mockResolvedValue(mockResult);
        const tool = createTabsManageTool(rpc);

        const result = await tool.execute({
          action: 'move',
          tabIds: [1, 2],
          index: 0,
          windowId: 5,
        });

        expect(rpc.request).toHaveBeenCalledWith('tabs.move', {
          tabIds: [1, 2],
          moveProperties: { index: 0, windowId: 5 },
        });
        expect(result).toEqual({ success: true, data: mockResult });
      });

      it('should wrap a single tabId into tabIds', async () => {
        const rpc = createMockRpc();
        const tool = createTabsManageTool(rpc);

        await tool.execute({ action: 'move', tabId: 7, index: 2 });

        expect(rpc.request).toHaveBeenCalledWith('tabs.move', {
          tabIds: [7],
          moveProperties: { index: 2, windowId: undefined },
        });
      });

      it('should return an error when tabIds/tabId is missing', async () => {
        const rpc = createMockRpc();
        const tool = createTabsManageTool(rpc);

        const result = await tool.execute({ action: 'move', index: 0 });

        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
        expect(rpc.request).not.toHaveBeenCalled();
      });

      it('should return an error when index is missing', async () => {
        const rpc = createMockRpc();
        const tool = createTabsManageTool(rpc);

        const result = await tool.execute({ action: 'move', tabIds: [1] });

        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
        expect(rpc.request).not.toHaveBeenCalled();
      });
    });

    describe('action "group"', () => {
      it('should call rpc.request("tabs.group", { tabIds, groupId })', async () => {
        const rpc = createMockRpc();
        vi.mocked(rpc.request).mockResolvedValue(42);
        const tool = createTabsManageTool(rpc);

        const result = await tool.execute({ action: 'group', tabIds: [1, 2, 3], groupId: 42 });

        expect(rpc.request).toHaveBeenCalledWith('tabs.group', { tabIds: [1, 2, 3], groupId: 42 });
        expect(result).toEqual({ success: true, data: 42 });
      });

      it('should wrap a single tabId into tabIds', async () => {
        const rpc = createMockRpc();
        const tool = createTabsManageTool(rpc);

        await tool.execute({ action: 'group', tabId: 9 });

        expect(rpc.request).toHaveBeenCalledWith('tabs.group', { tabIds: [9], groupId: undefined });
      });

      it('should return an error when tabIds/tabId is missing', async () => {
        const rpc = createMockRpc();
        const tool = createTabsManageTool(rpc);

        const result = await tool.execute({ action: 'group' });

        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
        expect(rpc.request).not.toHaveBeenCalled();
      });
    });

    describe('action "ungroup"', () => {
      it('should call rpc.request("tabs.ungroup", { tabIds })', async () => {
        const rpc = createMockRpc();
        vi.mocked(rpc.request).mockResolvedValue(undefined);
        const tool = createTabsManageTool(rpc);

        const result = await tool.execute({ action: 'ungroup', tabIds: [1, 2] });

        expect(rpc.request).toHaveBeenCalledWith('tabs.ungroup', { tabIds: [1, 2] });
        expect(result).toEqual({ success: true, data: undefined });
      });

      it('should wrap a single tabId into tabIds', async () => {
        const rpc = createMockRpc();
        const tool = createTabsManageTool(rpc);

        await tool.execute({ action: 'ungroup', tabId: 4 });

        expect(rpc.request).toHaveBeenCalledWith('tabs.ungroup', { tabIds: [4] });
      });

      it('should return an error when tabIds/tabId is missing', async () => {
        const rpc = createMockRpc();
        const tool = createTabsManageTool(rpc);

        const result = await tool.execute({ action: 'ungroup' });

        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
        expect(rpc.request).not.toHaveBeenCalled();
      });
    });

    it('should return an error for an unknown action', async () => {
      const rpc = createMockRpc();
      const tool = createTabsManageTool(rpc);

      const result = await tool.execute({ action: 'explode', tabIds: [1] });

      expect(result.success).toBe(false);
      expect(result.error).toContain('explode');
      expect(rpc.request).not.toHaveBeenCalled();
    });

    it('should return { success: false, error } when rpc fails', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockRejectedValue(new Error('RPC failed'));
      const tool = createTabsManageTool(rpc);

      const result = await tool.execute({ action: 'create', url: 'https://example.com' });

      expect(result).toEqual({ success: false, error: 'RPC failed' });
    });
  });

  describe('tabs_remove', () => {
    it('should call rpc.request("tabs.remove", params)', async () => {
      const rpc = createMockRpc();
      const tool = createTabsRemoveTool(rpc);
      const params = { tabIds: [1, 2] };
      await tool.execute(params);
      expect(rpc.request).toHaveBeenCalledWith('tabs.remove', params);
    });

    it('should require tabIds in schema', () => {
      const rpc = createMockRpc();
      const tool = createTabsRemoveTool(rpc);
      expect(tool.schema.required).toContain('tabIds');
    });

    it('should have confirmationRequired === true', () => {
      const rpc = createMockRpc();
      const tool = createTabsRemoveTool(rpc);
      expect(tool.confirmationRequired).toBe(true);
    });

    it('should have riskLevel === "high"', () => {
      const rpc = createMockRpc();
      const tool = createTabsRemoveTool(rpc);
      expect(tool.riskLevel).toBe('high');
    });

    it('should have preflight function', () => {
      const rpc = createMockRpc();
      const tool = createTabsRemoveTool(rpc);
      expect(typeof tool.preflight).toBe('function');
    });

    describe('preflight', () => {
      it('should return affectedObjects with tab details', async () => {
        const rpc = createMockRpc();
        vi.mocked(rpc.request).mockImplementation(async (method, params) => {
          if (method === 'tabs.get') {
            const { tabId } = params as { tabId: number };
            return { id: tabId, title: `Tab ${tabId}`, url: `https://tab${tabId}.com` };
          }
          return undefined;
        });

        const tool = createTabsRemoveTool(rpc);
        const result = await tool.preflight!({ tabIds: [1, 2, 3] });

        expect(result.affectedObjects).toHaveLength(3);
        expect(result.affectedObjects[0]).toMatchObject({
          type: 'tab',
          id: '1',
          title: 'Tab 1',
          url: 'https://tab1.com',
        });
        expect(rpc.request).toHaveBeenCalledTimes(3);
      });

      it('should add warning when removing more than 5 tabs', async () => {
        const rpc = createMockRpc();
        vi.mocked(rpc.request).mockResolvedValue({ id: 1, title: 'Tab', url: 'https://tab.com' });

        const tool = createTabsRemoveTool(rpc);
        const result = await tool.preflight!({ tabIds: [1, 2, 3, 4, 5, 6] });

        expect(result.warnings.length).toBeGreaterThanOrEqual(1);
        expect(result.warnings[0]).toContain('6');
      });

      it('should not add warning for 5 or fewer tabs', async () => {
        const rpc = createMockRpc();
        vi.mocked(rpc.request).mockResolvedValue({ id: 1, title: 'Tab', url: 'https://tab.com' });

        const tool = createTabsRemoveTool(rpc);
        const result = await tool.preflight!({ tabIds: [1, 2, 3, 4, 5] });

        expect(result.warnings).toHaveLength(0);
      });

      it('should tolerate individual tabs.get failures', async () => {
        const rpc = createMockRpc();
        vi.mocked(rpc.request).mockImplementation(async (method, params) => {
          if (method === 'tabs.get') {
            const { tabId } = params as { tabId: number };
            if (tabId === 2) throw new Error('Tab not found');
            return { id: tabId, title: `Tab ${tabId}`, url: `https://tab${tabId}.com` };
          }
          return undefined;
        });

        const tool = createTabsRemoveTool(rpc);
        const result = await tool.preflight!({ tabIds: [1, 2, 3] });

        // Should still return results for successful fetches
        expect(result.affectedObjects).toHaveLength(2);
        expect(result.affectedObjects[0].id).toBe('1');
        expect(result.affectedObjects[1].id).toBe('3');
      });

      it('should handle empty tabIds', async () => {
        const rpc = createMockRpc();
        const tool = createTabsRemoveTool(rpc);
        const result = await tool.preflight!({ tabIds: [] });

        expect(result.affectedObjects).toHaveLength(0);
        expect(result.warnings).toHaveLength(0);
      });
    });

    it('should have correct metadata', () => {
      const rpc = createMockRpc();
      const tool = createTabsRemoveTool(rpc);
      expect(tool.name).toBe('tabs_remove');
      expect(tool.category).toBe('tabs');
      expect(tool.requireBackground).toBe(true);
    });
  });

  describe('all tools', () => {
    it('should all have category === "tabs"', () => {
      const rpc = createMockRpc();
      const tools = createTabsTools(rpc);
      for (const tool of tools) {
        expect(tool.category).toBe('tabs');
      }
    });

    it('should all have requireBackground === true', () => {
      const rpc = createMockRpc();
      const tools = createTabsTools(rpc);
      for (const tool of tools) {
        expect(tool.requireBackground).toBe(true);
      }
    });
  });
});
