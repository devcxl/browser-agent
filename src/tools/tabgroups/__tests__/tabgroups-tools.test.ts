import { describe, it, expect, vi } from 'vitest';
import type { IJsonRpcClient } from '@/shared/types';
import { createTabGroupsTools } from '../index';

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

describe('TabGroups tools', () => {
  describe('createTabGroupsTools', () => {
    it('返回 2 个工具', () => {
      const rpc = createMockRpc();
      const tools = createTabGroupsTools(rpc);
      expect(tools).toHaveLength(2);
    });

    it('所有工具的 category 为 "tabGroups"', () => {
      const rpc = createMockRpc();
      const tools = createTabGroupsTools(rpc);
      for (const tool of tools) {
        expect(tool.category).toBe('tabGroups');
      }
    });

    it('tabGroups_query: riskLevel 为 low, confirmationRequired 为 false', () => {
      const rpc = createMockRpc();
      const tools = createTabGroupsTools(rpc);
      const queryTool = tools.find((t) => t.name === 'tabGroups_query')!;
      expect(queryTool).toBeDefined();
      expect(queryTool.riskLevel).toBe('low');
      expect(queryTool.confirmationRequired).toBe(false);
    });

    it('tabGroups_update: riskLevel 为 medium, confirmationRequired 为 false', () => {
      const rpc = createMockRpc();
      const tools = createTabGroupsTools(rpc);
      const updateTool = tools.find((t) => t.name === 'tabGroups_update')!;
      expect(updateTool).toBeDefined();
      expect(updateTool.riskLevel).toBe('medium');
      expect(updateTool.confirmationRequired).toBe(false);
    });

    it('tabGroups_query schema 正确', () => {
      const rpc = createMockRpc();
      const tools = createTabGroupsTools(rpc);
      const tool = tools.find((t) => t.name === 'tabGroups_query')!;

      expect(tool.schema.type).toBe('object');
      expect(tool.schema.properties).toBeDefined();

      const props = tool.schema.properties as Record<string, unknown>;
      const queryInfo = props.queryInfo as Record<string, unknown>;
      expect(queryInfo).toBeDefined();
      expect((queryInfo.type as string)).toBe('object');

      const qiProps = queryInfo.properties as Record<string, unknown>;
      expect(qiProps).toBeDefined();

      // 检查可选字段
      expect((qiProps.collapsed as Record<string, unknown>).type).toBe('boolean');
      expect((qiProps.title as Record<string, unknown>).type).toBe('string');
      expect((qiProps.windowId as Record<string, unknown>).type).toBe('number');

      // color 枚举
      const colorProp = qiProps.color as Record<string, unknown>;
      expect(colorProp.type).toBe('string');
      expect(colorProp.enum).toEqual([
        'grey', 'blue', 'red', 'yellow',
        'green', 'pink', 'purple', 'cyan', 'orange',
      ]);
    });

    it('tabGroups_update schema 正确', () => {
      const rpc = createMockRpc();
      const tools = createTabGroupsTools(rpc);
      const tool = tools.find((t) => t.name === 'tabGroups_update')!;

      expect(tool.schema.type).toBe('object');
      expect(tool.schema.required).toEqual(['groupId', 'updateProperties']);

      const props = tool.schema.properties as Record<string, unknown>;
      expect((props.groupId as Record<string, unknown>).type).toBe('number');

      const updateProps = props.updateProperties as Record<string, unknown>;
      expect(updateProps.type).toBe('object');

      const upProps = updateProps.properties as Record<string, unknown>;
      expect((upProps.collapsed as Record<string, unknown>).type).toBe('boolean');
      expect((upProps.title as Record<string, unknown>).type).toBe('string');

      const colorProp = upProps.color as Record<string, unknown>;
      expect(colorProp.type).toBe('string');
      expect(colorProp.enum).toEqual([
        'grey', 'blue', 'red', 'yellow',
        'green', 'pink', 'purple', 'cyan', 'orange',
      ]);
    });

    it('tabGroups_query execute 调用 rpc.request("tabGroups.query")', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue({ id: 1, collapsed: false, color: 'blue', title: 'Test', windowId: 1 });

      const tools = createTabGroupsTools(rpc);
      const tool = tools.find((t) => t.name === 'tabGroups_query')!;
      const result = await tool.execute({ queryInfo: { color: 'blue' } });

      expect(rpc.request).toHaveBeenCalledWith('tabGroups.query', { queryInfo: { color: 'blue' } });
      expect(result).toEqual({ success: true, data: { id: 1, collapsed: false, color: 'blue', title: 'Test', windowId: 1 } });
    });

    it('tabGroups_query execute 无参数时传递空对象', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue([]);

      const tools = createTabGroupsTools(rpc);
      const tool = tools.find((t) => t.name === 'tabGroups_query')!;
      await tool.execute({});

      expect(rpc.request).toHaveBeenCalledWith('tabGroups.query', {});
    });

    it('tabGroups_update execute 调用 rpc.request("tabGroups.update")', async () => {
      const rpc = createMockRpc();
      vi.mocked(rpc.request).mockResolvedValue({ id: 1, collapsed: true, color: 'red', title: 'Updated', windowId: 1 });

      const tools = createTabGroupsTools(rpc);
      const tool = tools.find((t) => t.name === 'tabGroups_update')!;
      const result = await tool.execute({ groupId: 1, updateProperties: { title: 'Updated', color: 'red' } });

      expect(rpc.request).toHaveBeenCalledWith('tabGroups.update', { groupId: 1, updateProperties: { title: 'Updated', color: 'red' } });
      expect(result).toEqual({ success: true, data: { id: 1, collapsed: true, color: 'red', title: 'Updated', windowId: 1 } });
    });

    it('tabGroups_query description 非空', () => {
      const rpc = createMockRpc();
      const tools = createTabGroupsTools(rpc);
      const tool = tools.find((t) => t.name === 'tabGroups_query')!;
      expect(tool.description).toBeTruthy();
    });

    it('tabGroups_update description 非空', () => {
      const rpc = createMockRpc();
      const tools = createTabGroupsTools(rpc);
      const tool = tools.find((t) => t.name === 'tabGroups_update')!;
      expect(tool.description).toBeTruthy();
    });
  });
});
