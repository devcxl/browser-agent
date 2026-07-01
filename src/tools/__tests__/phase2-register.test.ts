import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IJsonRpcClient, IToolRegistry, ToolDefinition } from '@/shared/types';
import { registerPhase2Tools } from '../phase2-register';

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

function createMockRegistry(): IToolRegistry {
  const tools: ToolDefinition[] = [];
  return {
    register: vi.fn((tool: ToolDefinition) => { tools.push(tool); }),
    registerAll: vi.fn((t: ToolDefinition[]) => { tools.push(...t); }),
    getAllTools: vi.fn(() => [...tools]),
    getTool: vi.fn((name: string) => tools.find((t) => t.name === name)),
    getToolsByCategory: vi.fn((category) => tools.filter((t) => t.category === category)),
    toOpenAISchema: vi.fn(),
    unregisterCategory: vi.fn(),
    size: 0,
  };
}

describe('registerPhase2Tools', () => {
  let rpc: IJsonRpcClient;
  let registry: IToolRegistry;

  beforeEach(() => {
    rpc = createMockRpc();
    registry = createMockRegistry();
  });

  it('注册 46 个工具', () => {
    registerPhase2Tools(registry, rpc);
    const allTools = registry.getAllTools();
    expect(allTools).toHaveLength(46);
  });

  it('覆盖所有 12 个 category', () => {
    registerPhase2Tools(registry, rpc);
    const allTools = registry.getAllTools();

    const categories = new Set(allTools.map((t) => t.category));
    expect(categories.has('bookmarks')).toBe(true);
    expect(categories.has('history')).toBe(true);
    expect(categories.has('downloads')).toBe(true);
    expect(categories.has('cookies')).toBe(true);
    expect(categories.has('sessions')).toBe(true);

    // misc 工具分属 clipboard, notifications, storage, system
    expect(categories.has('clipboard')).toBe(true);
    expect(categories.has('notifications')).toBe(true);
    expect(categories.has('storage')).toBe(true);
    expect(categories.has('system')).toBe(true);

    // expert 工具
    expect(categories.has('management')).toBe(true);
    expect(categories.has('privacy')).toBe(true);
    expect(categories.has('proxy')).toBe(true);
    expect(categories.has('debugger')).toBe(true);
    expect(categories.has('declarativeNetRequest')).toBe(true);
    expect(categories.has('identity')).toBe(true);
  });

  it('cookies 工具数量正确', () => {
    registerPhase2Tools(registry, rpc);
    const cookiesTools = registry.getToolsByCategory('cookies');
    expect(cookiesTools).toHaveLength(5);
  });

  it('bookmarks 工具数量正确', () => {
    registerPhase2Tools(registry, rpc);
    const tools = registry.getToolsByCategory('bookmarks');
    expect(tools).toHaveLength(5);
  });

  it('history 工具数量正确', () => {
    registerPhase2Tools(registry, rpc);
    const tools = registry.getToolsByCategory('history');
    expect(tools).toHaveLength(3);
  });

  it('downloads 工具数量正确', () => {
    registerPhase2Tools(registry, rpc);
    const tools = registry.getToolsByCategory('downloads');
    expect(tools).toHaveLength(7);
  });

  it('每个工具都有 execute 函数', () => {
    registerPhase2Tools(registry, rpc);
    const allTools = registry.getAllTools();
    for (const tool of allTools) {
      expect(typeof tool.execute).toBe('function');
    }
  });

  it('每个工具都有 description', () => {
    registerPhase2Tools(registry, rpc);
    const allTools = registry.getAllTools();
    for (const tool of allTools) {
      expect(tool.description).toBeTruthy();
    }
  });

  it('registerAll 被调用 7 次（7 个域）', () => {
    registerPhase2Tools(registry, rpc);
    expect(registry.registerAll).toHaveBeenCalledTimes(7);
  });
});
