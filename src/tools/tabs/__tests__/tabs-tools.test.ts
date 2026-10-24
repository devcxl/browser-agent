import { describe, it, expect, vi } from 'vitest';
import type { IJsonRpcClient } from '@/shared/types';
import { createTabsTools } from '../index';
import {
  createTabsQueryTool,
  createTabsCreateTool,
  createTabsUpdateTool,
  createTabsRemoveTool,
  createTabsMoveTool,
  createTabsGroupTool,
  createTabsUngroupTool,
} from '../tabs-tools';

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
    it('should return 7 tools', () => {
      const rpc = createMockRpc();
      const tools = createTabsTools(rpc);
      expect(tools).toHaveLength(7);
    });

    it('should no longer expose tabs_get (merged into tabs_query)', () => {
      const rpc = createMockRpc();
      const names = createTabsTools(rpc).map((tool) => tool.name);
      expect(names).not.toContain('tabs_get');
      expect(names).toEqual([
        'tabs_query',
        'tabs_create',
        'tabs_update',
        'tabs_remove',
        'tabs_move',
        'tabs_group',
        'tabs_ungroup',
      ]);
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

    it('should return success result with tabs data', async () => {
      const rpc = createMockRpc();
      const mockTabs = [{ id: 1, title: 'Test' }];
      vi.mocked(rpc.request).mockResolvedValue(mockTabs);
      const tool = createTabsQueryTool(rpc);
      const result = await tool.execute({});
      expect(rpc.request).toHaveBeenCalledWith('tabs.query', { queryInfo: {} });
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

  describe('tabs_create', () => {
    it('should call rpc.request("tabs.create", params)', async () => {
      const rpc = createMockRpc();
      const tool = createTabsCreateTool(rpc);
      const params = { createProperties: { url: 'https://example.com', active: true } };
      await tool.execute(params);
      expect(rpc.request).toHaveBeenCalledWith('tabs.create', params);
    });

    it('should have correct metadata', () => {
      const rpc = createMockRpc();
      const tool = createTabsCreateTool(rpc);
      expect(tool.name).toBe('tabs_create');
      expect(tool.category).toBe('tabs');
      expect(tool.riskLevel).toBe('medium');
      expect(tool.confirmationRequired).toBe(false);
      expect(tool.requireBackground).toBe(true);
    });
  });

  describe('tabs_update', () => {
    it('should call rpc.request("tabs.update", params)', async () => {
      const rpc = createMockRpc();
      const tool = createTabsUpdateTool(rpc);
      const params = { tabId: 3, updateProperties: { url: 'https://new-url.com' } };
      await tool.execute(params);
      expect(rpc.request).toHaveBeenCalledWith('tabs.update', params);
    });

    it('should require tabId in schema', () => {
      const rpc = createMockRpc();
      const tool = createTabsUpdateTool(rpc);
      expect(tool.schema.required).toContain('tabId');
    });

    it('should have correct metadata', () => {
      const rpc = createMockRpc();
      const tool = createTabsUpdateTool(rpc);
      expect(tool.name).toBe('tabs_update');
      expect(tool.category).toBe('tabs');
      expect(tool.riskLevel).toBe('medium');
      expect(tool.confirmationRequired).toBe(false);
      expect(tool.requireBackground).toBe(true);
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

  describe('tabs_move', () => {
    it('should call rpc.request("tabs.move", params)', async () => {
      const rpc = createMockRpc();
      const tool = createTabsMoveTool(rpc);
      const params = { tabIds: [1, 2], moveProperties: { index: 0 } };
      await tool.execute(params);
      expect(rpc.request).toHaveBeenCalledWith('tabs.move', params);
    });

    it('should require tabIds and moveProperties in schema', () => {
      const rpc = createMockRpc();
      const tool = createTabsMoveTool(rpc);
      expect(tool.schema.required).toContain('tabIds');
      expect(tool.schema.required).toContain('moveProperties');
    });

    it('should have correct metadata', () => {
      const rpc = createMockRpc();
      const tool = createTabsMoveTool(rpc);
      expect(tool.name).toBe('tabs_move');
      expect(tool.category).toBe('tabs');
      expect(tool.riskLevel).toBe('medium');
      expect(tool.confirmationRequired).toBe(false);
      expect(tool.requireBackground).toBe(true);
    });
  });

  describe('tabs_group', () => {
    it('should call rpc.request("tabs.group", params)', async () => {
      const rpc = createMockRpc();
      const tool = createTabsGroupTool(rpc);
      const params = { tabIds: [1, 2, 3] };
      await tool.execute(params);
      expect(rpc.request).toHaveBeenCalledWith('tabs.group', params);
    });

    it('should require tabIds in schema', () => {
      const rpc = createMockRpc();
      const tool = createTabsGroupTool(rpc);
      expect(tool.schema.required).toContain('tabIds');
    });

    it('should have correct metadata', () => {
      const rpc = createMockRpc();
      const tool = createTabsGroupTool(rpc);
      expect(tool.name).toBe('tabs_group');
      expect(tool.category).toBe('tabs');
      expect(tool.riskLevel).toBe('medium');
      expect(tool.confirmationRequired).toBe(false);
      expect(tool.requireBackground).toBe(true);
    });
  });

  describe('tabs_ungroup', () => {
    it('should call rpc.request("tabs.ungroup", params)', async () => {
      const rpc = createMockRpc();
      const tool = createTabsUngroupTool(rpc);
      const params = { tabIds: [1, 2] };
      await tool.execute(params);
      expect(rpc.request).toHaveBeenCalledWith('tabs.ungroup', params);
    });

    it('should require tabIds in schema', () => {
      const rpc = createMockRpc();
      const tool = createTabsUngroupTool(rpc);
      expect(tool.schema.required).toContain('tabIds');
    });

    it('should have correct metadata', () => {
      const rpc = createMockRpc();
      const tool = createTabsUngroupTool(rpc);
      expect(tool.name).toBe('tabs_ungroup');
      expect(tool.category).toBe('tabs');
      expect(tool.riskLevel).toBe('medium');
      expect(tool.confirmationRequired).toBe(false);
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
