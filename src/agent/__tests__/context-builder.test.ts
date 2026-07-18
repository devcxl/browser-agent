import { describe, it, expect, vi } from 'vitest';
import { ContextBuilder } from '../context-builder';
import type { AgentConfig } from '@/shared/types/agent';
import type { IToolRegistry, ToolDefinition } from '@/registry/types';
import type { IConversationManager, StoredMessage, Conversation } from '@/shared/types/conversation';
import type { LowSensitivityContext } from '@/shared/types/browser';
import type { Skill } from '@/shared/types/skill';

function createMockToolRegistry(tools: ToolDefinition[]): IToolRegistry {
  const map = new Map(tools.map((t) => [t.name, t]));
  return {
    getAllTools: vi.fn().mockReturnValue(tools),
    getTool: vi.fn().mockImplementation((name: string) => map.get(name)),
    register: vi.fn(),
    registerAll: vi.fn(),
    getToolsByCategory: vi.fn().mockReturnValue([]),
    toOpenAISchema: vi.fn().mockReturnValue([]),
    unregisterCategory: vi.fn(),
  };
}

function createMockConversationManager(): IConversationManager {
  return {
    create: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    addMessage: vi.fn(),
    getRecentMessages: vi.fn(),
    generateSummary: vi.fn(),
    needsSummary: vi.fn(),
  };
}

const defaultConfig: AgentConfig = {
  maxToolRounds: 15,
  systemPrompt: 'You are a browser assistant.',
  contextWindowTokens: 128000,
  tokenBudgetMargin: 4096,
  microcompactKeepRecent: 10,
  microcompactMinChars: 500,
  microcompactExcludeTools: [],
  summaryThreshold: { messageCount: 30, estimatedTokens: 12_000 },
};

const defaultBrowserContext: LowSensitivityContext = {
  currentWindow: {
    tabs: [
      { id: 1, title: 'Tab 1', url: 'https://example.com', active: true, pinned: false, groupId: -1 },
    ],
  },
  allWindows: [{ id: 1, focused: true, tabCount: 1 }],
  tabGroups: [],
  activeTab: { id: 1, title: 'Tab 1', url: 'https://example.com', windowId: 1 },
};

describe('ContextBuilder skill 注入', () => {
  const toolRegistry = createMockToolRegistry([]);
  const conversationManager = createMockConversationManager();

  beforeEach(() => {
    vi.mocked(conversationManager.get).mockResolvedValue(undefined);
    vi.mocked(conversationManager.getRecentMessages).mockResolvedValue([]);
  });

  it('不传可选参数时输出与默认一致', async () => {
    const builder = new ContextBuilder(defaultConfig, toolRegistry, conversationManager);
    const messages = await builder.build('conv-1', defaultBrowserContext);

    expect(messages).toHaveLength(2);
    expect(messages[0]!.content).toContain('You are a browser assistant.');
    expect(messages[0]!.content).toContain('## Available Tools');
    expect(messages[0]!.content).not.toContain('## 可用技能');
    expect(messages[0]!.content).not.toContain('## 已激活的技能');
  });

  it('传入 allSkills 时包含可用技能列表', async () => {
    const allSkills: Skill[] = [
      { id: 's1', name: 'git', description: 'Git 操作', prompt: 'Git skill prompt', enabled: true, createdAt: 0, updatedAt: 0 },
      { id: 's2', name: 'docker', description: 'Docker 操作', prompt: 'Docker skill prompt', enabled: false, createdAt: 0, updatedAt: 0 },
    ];

    const builder = new ContextBuilder(defaultConfig, toolRegistry, conversationManager);
    const messages = await builder.build('conv-1', defaultBrowserContext, undefined, allSkills);

    const first = messages[0]!;
    expect(first.content).toContain('## 可用技能');
    expect(first.content).toContain('- git: Git 操作');
    expect(first.content).toContain('- docker: Docker 操作');
  });

  it('传入匹配的 activeSkillNames 时注入已激活技能 prompt', async () => {
    const allSkills: Skill[] = [
      { id: 's1', name: 'git', description: 'Git 操作', prompt: 'Git skill prompt', enabled: true, createdAt: 0, updatedAt: 0 },
    ];

    const builder = new ContextBuilder(defaultConfig, toolRegistry, conversationManager);
    const messages = await builder.build('conv-1', defaultBrowserContext, ['git'], allSkills);

    const first = messages[0]!;
    expect(first.content).toContain('## 已激活的技能');
    expect(first.content).toContain('### git');
    expect(first.content).toContain('Git skill prompt');
  });

  it('传入不匹配的 activeSkillNames 时不注入已激活技能 prompt', async () => {
    const allSkills: Skill[] = [
      { id: 's1', name: 'git', description: 'Git 操作', prompt: 'Git skill prompt', enabled: true, createdAt: 0, updatedAt: 0 },
    ];

    const builder = new ContextBuilder(defaultConfig, toolRegistry, conversationManager);
    const messages = await builder.build('conv-1', defaultBrowserContext, ['nonexistent'], allSkills);

    expect(messages[0]!.content).not.toContain('## 已激活的技能');
    expect(messages[0]!.content).not.toContain('### git');
  });

  it('activeSkillNames 为空数组时不注入已激活技能', async () => {
    const allSkills: Skill[] = [
      { id: 's1', name: 'git', description: 'Git 操作', prompt: 'Git skill prompt', enabled: true, createdAt: 0, updatedAt: 0 },
    ];

    const builder = new ContextBuilder(defaultConfig, toolRegistry, conversationManager);
    const messages = await builder.build('conv-1', defaultBrowserContext, [], allSkills);

    expect(messages[0]!.content).not.toContain('## 已激活的技能');
  });

  it('allSkills 中有多个技能，activeSkillNames 只激活部分', async () => {
    const allSkills: Skill[] = [
      { id: 's1', name: 'git', description: 'Git 操作', prompt: 'Git skill prompt', enabled: true, createdAt: 0, updatedAt: 0 },
      { id: 's2', name: 'docker', description: 'Docker 操作', prompt: 'Docker skill prompt', enabled: false, createdAt: 0, updatedAt: 0 },
      { id: 's3', name: 'npm', description: 'NPM 操作', prompt: 'Npm skill prompt', enabled: true, createdAt: 0, updatedAt: 0 },
    ];

    const builder = new ContextBuilder(defaultConfig, toolRegistry, conversationManager);
    const messages = await builder.build('conv-1', defaultBrowserContext, ['git', 'npm'], allSkills);

    const first = messages[0]!;
    expect(first.content).toContain('## 可用技能');
    expect(first.content).toContain('- git: Git 操作');
    expect(first.content).toContain('- docker: Docker 操作');
    expect(first.content).toContain('- npm: NPM 操作');
    expect(first.content).toContain('## 已激活的技能');
    expect(first.content).toContain('### git');
    expect(first.content).toContain('Git skill prompt');
    expect(first.content).toContain('### npm');
    expect(first.content).toContain('Npm skill prompt');
    expect(first.content).not.toContain('### docker');
    expect(first.content).not.toContain('Docker skill prompt');
  });
});

describe('ContextBuilder', () => {
  it('正常构建上下文（messages[0] 为 system prompt 含工具列表）', async () => {
    const tools: ToolDefinition[] = [
      {
        name: 'tabs_query',
        description: '查询标签页',
        schema: { type: 'object', properties: {} },
        category: 'tabs',
        riskLevel: 'low',
        confirmationRequired: false,
        resultSensitivity: 'low',
        execute: vi.fn(),
      },
    ];
    const toolRegistry = createMockToolRegistry(tools);
    const conversationManager = createMockConversationManager();
    vi.mocked(conversationManager.get).mockResolvedValue(undefined);
    vi.mocked(conversationManager.getRecentMessages).mockResolvedValue([]);

    const builder = new ContextBuilder(defaultConfig, toolRegistry, conversationManager);
    const messages = await builder.build('conv-1', defaultBrowserContext);

    expect(messages).toHaveLength(2); // system + tools + browser context
    const first = messages[0]!;
    expect(first.role).toBe('system');
    expect(first.content).toContain('You are a browser assistant.');
    expect(first.content).toContain('## Available Tools');
    expect(first.content).toContain('tabs_query');
    expect(first.content).toContain('查询标签页');
  });

  it('有会话摘要', async () => {
    const tools: ToolDefinition[] = [];
    const toolRegistry = createMockToolRegistry(tools);
    const conversationManager = createMockConversationManager();
    vi.mocked(conversationManager.get).mockResolvedValue({
      id: 'conv-1',
      title: 'test',
      titleGenerated: true,
      createdAt: 0,
      updatedAt: 0,
      messages: [],
      summary: '用户已完成了标签页查询',
      sensitiveDataGranted: false,
    } satisfies Conversation);
    vi.mocked(conversationManager.getRecentMessages).mockResolvedValue([]);

    const builder = new ContextBuilder(defaultConfig, toolRegistry, conversationManager);
    const messages = await builder.build('conv-1', defaultBrowserContext);

    const summaryMsg = messages.find(
      (m) => m.content?.startsWith('## Conversation Summary'),
    );
    expect(summaryMsg).toBeDefined();
    expect(summaryMsg!.content).toContain('用户已完成了标签页查询');
  });

  it('有摘要时只加载摘要截止点之后的完整历史', async () => {
    const toolRegistry = createMockToolRegistry([]);
    const conversationManager = createMockConversationManager();
    const historyMessages: StoredMessage[] = [
      { id: 'm1', role: 'user', content: '已被摘要的旧问题' },
      { id: 'm2', role: 'assistant', content: '已被摘要的旧回答' },
      { id: 'm3', role: 'user', content: '最近问题' },
      { id: 'm4', role: 'assistant', content: '最近回答' },
    ];
    vi.mocked(conversationManager.get).mockResolvedValue({
      id: 'conv-1',
      title: 'test',
      titleGenerated: true,
      createdAt: 0,
      updatedAt: 0,
      messages: historyMessages,
      summary: '旧对话摘要',
      summaryUpToIndex: 2,
      sensitiveDataGranted: false,
    });
    vi.mocked(conversationManager.getRecentMessages).mockResolvedValue(historyMessages);

    const builder = new ContextBuilder(defaultConfig, toolRegistry, conversationManager);
    const messages = await builder.build('conv-1', defaultBrowserContext);

    expect(messages.some((message) => message.content === '已被摘要的旧问题')).toBe(false);
    expect(messages.some((message) => message.content === '最近问题')).toBe(true);
    expect(conversationManager.getRecentMessages).not.toHaveBeenCalled();
  });

  it('有浏览器上下文', async () => {
    const tools: ToolDefinition[] = [];
    const toolRegistry = createMockToolRegistry(tools);
    const conversationManager = createMockConversationManager();
    vi.mocked(conversationManager.get).mockResolvedValue(undefined);
    vi.mocked(conversationManager.getRecentMessages).mockResolvedValue([]);

    const builder = new ContextBuilder(defaultConfig, toolRegistry, conversationManager);
    const messages = await builder.build('conv-1', defaultBrowserContext);

    const ctxMsg = messages.find((m) => m.content?.startsWith('## Current Browser Context'));
    expect(ctxMsg).toBeDefined();
    expect(ctxMsg!.content).toContain('https://example.com');
    expect(ctxMsg!.content).toContain('Tab 1');
  });

  it('有历史消息', async () => {
    const tools: ToolDefinition[] = [];
    const toolRegistry = createMockToolRegistry(tools);
    const conversationManager = createMockConversationManager();
    vi.mocked(conversationManager.get).mockResolvedValue(undefined);

    const historyMessages: StoredMessage[] = [
      { id: 'm1', role: 'user', content: '打开新标签页', timestamp: 100 },
      { id: 'm2', role: 'assistant', content: '已打开', timestamp: 200 },
    ];
    vi.mocked(conversationManager.getRecentMessages).mockResolvedValue(historyMessages);

    const builder = new ContextBuilder(defaultConfig, toolRegistry, conversationManager);
    const messages = await builder.build('conv-1', defaultBrowserContext);

    const userMsg = messages.find((m) => m.content === '打开新标签页');
    const asstMsg = messages.find((m) => m.content === '已打开');
    expect(userMsg).toBeDefined();
    expect(userMsg!.role).toBe('user');
    expect(asstMsg).toBeDefined();
    expect(asstMsg!.role).toBe('assistant');
  });

  it('工具列表正确', async () => {
    const tools: ToolDefinition[] = [
      {
        name: 'tabs_query',
        description: '查询标签页',
        schema: { type: 'object', properties: {} },
        category: 'tabs',
        riskLevel: 'low',
        confirmationRequired: false,
        resultSensitivity: 'low',
        execute: vi.fn(),
      },
      {
        name: 'tabs_create',
        description: '创建标签页',
        schema: { type: 'object', properties: { url: { type: 'string' } } },
        category: 'tabs',
        riskLevel: 'low',
        confirmationRequired: false,
        resultSensitivity: 'low',
        execute: vi.fn(),
      },
    ];
    const toolRegistry = createMockToolRegistry(tools);
    const conversationManager = createMockConversationManager();
    vi.mocked(conversationManager.get).mockResolvedValue(undefined);
    vi.mocked(conversationManager.getRecentMessages).mockResolvedValue([]);

    const builder = new ContextBuilder(defaultConfig, toolRegistry, conversationManager);
    const messages = await builder.build('conv-1', defaultBrowserContext);

    const first = messages[0]!;
    expect(first.content).toContain('- **tabs_query**');
    expect(first.content).toContain('- **tabs_create**');
    expect(first.content).toContain('查询标签页');
    expect(first.content).toContain('创建标签页');
  });
});

describe('ContextBuilder — Token 预算截断', () => {
  it('消息在预算内时不触发截断', async () => {
    const toolRegistry = createMockToolRegistry([]);
    const conversationManager = createMockConversationManager();
    vi.mocked(conversationManager.get).mockResolvedValue(undefined);

    const historyMessages: StoredMessage[] = [
      { id: 'm1', role: 'user', content: 'hello', timestamp: 100 },
      { id: 'm2', role: 'assistant', content: 'hi', timestamp: 200 },
    ];
    vi.mocked(conversationManager.getRecentMessages).mockResolvedValue(historyMessages);

    const config: AgentConfig = {
      ...defaultConfig,
      contextWindowTokens: 10000,
      tokenBudgetMargin: 100,
    };

    const builder = new ContextBuilder(config, toolRegistry, conversationManager);
    const messages = await builder.build('conv-1', defaultBrowserContext);

    // 应该保留所有消息（含 system + browser context + 2 条历史）
    expect(messages.filter((m) => m.role === 'system').length).toBeGreaterThanOrEqual(2);
    expect(messages.find((m) => m.role === 'user')).toBeDefined();
    expect(messages.find((m) => m.role === 'assistant')).toBeDefined();
  });

  it('token 超出预算时截断最旧的非 system 消息', async () => {
    const toolRegistry = createMockToolRegistry([]);
    const conversationManager = createMockConversationManager();
    vi.mocked(conversationManager.get).mockResolvedValue(undefined);

    // 创建大量长消息，使 token 远超预算
    const longContent = 'x'.repeat(2000); // ~1000 tokens
    const historyMessages: StoredMessage[] = [
      { id: 'm1', role: 'user', content: longContent, timestamp: 100 },
      { id: 'm2', role: 'assistant', content: longContent, timestamp: 200 },
      { id: 'm3', role: 'user', content: longContent, timestamp: 300 },
      { id: 'm4', role: 'assistant', content: longContent, timestamp: 400 },
      { id: 'm5', role: 'user', content: 'keep-this', timestamp: 500 },
      { id: 'm6', role: 'assistant', content: 'kept', timestamp: 600 },
    ];
    vi.mocked(conversationManager.getRecentMessages).mockResolvedValue(historyMessages);

    const config: AgentConfig = {
      ...defaultConfig,
      contextWindowTokens: 2000, // 预算远小于消息量
      tokenBudgetMargin: 100,
    };

    const builder = new ContextBuilder(config, toolRegistry, conversationManager);
    const messages = await builder.build('conv-1', defaultBrowserContext);

    // 最早的消息应该被丢弃，最后的消息保留
    const userMsgs = messages.filter((m) => m.role === 'user');
    expect(userMsgs.length).toBeGreaterThan(0);
    // 最后一条 user 消息 'keep-this' 应该保留
    expect(userMsgs.some((m) => m.content === 'keep-this')).toBe(true);
    // 早期消息被截断（内容以大量 x 开头）
    const allNonSystem = messages.filter((m) => m.role !== 'system');
    // 最早的消息 m1 不应该在结果中
    expect(allNonSystem.some((m) => m.content === longContent)).toBe(false);
  });

  it('截断后对齐到 user 消息边界', async () => {
    const toolRegistry = createMockToolRegistry([]);
    const conversationManager = createMockConversationManager();
    vi.mocked(conversationManager.get).mockResolvedValue(undefined);

    const longContent = 'x'.repeat(2000);
    const historyMessages: StoredMessage[] = [
      { id: 'm1', role: 'user', content: longContent, timestamp: 100 },
      { id: 'm2', role: 'assistant', content: 'middle', timestamp: 200 },
      { id: 'm3', role: 'tool', content: 'tool-result', timestamp: 300, toolCallId: 'tc-1' },
      { id: 'm4', role: 'user', content: 'last-user-msg', timestamp: 400 },
      { id: 'm5', role: 'assistant', content: 'last-assistant', timestamp: 500 },
    ];
    vi.mocked(conversationManager.getRecentMessages).mockResolvedValue(historyMessages);

    const config: AgentConfig = {
      ...defaultConfig,
      contextWindowTokens: 1500,
      tokenBudgetMargin: 100,
    };

    const builder = new ContextBuilder(config, toolRegistry, conversationManager);
    const messages = await builder.build('conv-1', defaultBrowserContext);

    const nonSystem = messages.filter((m) => m.role !== 'system');
    if (nonSystem.length > 0) {
      // 第一条非 system 消息必须是 user 角色
      expect(nonSystem[0]!.role).toBe('user');
      // 不应该从中途的 assistant 或 tool 消息开始
      expect(nonSystem[0]!.content).not.toBe('middle');
      expect(nonSystem[0]!.content).not.toBe('tool-result');
    }
  });

  it('保留 system 消息不变', async () => {
    const toolRegistry = createMockToolRegistry([]);
    const conversationManager = createMockConversationManager();
    vi.mocked(conversationManager.get).mockResolvedValue({
      id: 'conv-1',
      title: 'test',
      titleGenerated: true,
      createdAt: 0,
      updatedAt: 0,
      messages: [],
      summary: 'important summary',
      sensitiveDataGranted: false,
    } satisfies Conversation);

    const longContent = 'x'.repeat(2000);
    const historyMessages: StoredMessage[] = [
      { id: 'm1', role: 'user', content: longContent, timestamp: 100 },
      { id: 'm2', role: 'user', content: longContent, timestamp: 200 },
    ];
    vi.mocked(conversationManager.getRecentMessages).mockResolvedValue(historyMessages);

    const config: AgentConfig = {
      ...defaultConfig,
      contextWindowTokens: 500,
      tokenBudgetMargin: 100,
    };

    const builder = new ContextBuilder(config, toolRegistry, conversationManager);
    const messages = await builder.build('conv-1', defaultBrowserContext);

    // system 消息应该全部保留
    const systemMsgs = messages.filter((m) => m.role === 'system');
    expect(systemMsgs.length).toBeGreaterThanOrEqual(2);
    // 摘要应该保留
    expect(systemMsgs.some((m) => m.content?.includes('important summary'))).toBe(true);
  });
});

describe('ContextBuilder — 工具结果微压缩', () => {
  it('短工具结果不触发压缩', async () => {
    const toolRegistry = createMockToolRegistry([]);
    const conversationManager = createMockConversationManager();
    vi.mocked(conversationManager.get).mockResolvedValue(undefined);

    const historyMessages: StoredMessage[] = [
      {
        id: 'a1', role: 'assistant', content: 'calling tool', timestamp: 100,
        toolCalls: [{ id: 'tc-1', name: 'time_get', params: {} }],
      },
      { id: 't1', role: 'tool', content: 'short result', timestamp: 200, toolCallId: 'tc-1' },
    ];
    vi.mocked(conversationManager.getRecentMessages).mockResolvedValue(historyMessages);

    const config: AgentConfig = {
      ...defaultConfig,
      microcompactKeepRecent: 0, // 不保留任何结果，全部候选
      microcompactMinChars: 500,
    };

    const builder = new ContextBuilder(config, toolRegistry, conversationManager);
    const messages = await builder.build('conv-1', defaultBrowserContext);

    // 短结果不应该被压缩
    const toolMsgs = messages.filter((m) => m.role === 'tool');
    expect(toolMsgs.length).toBe(1);
    expect(toolMsgs[0]!.content).toBe('short result');
  });

  it('超出 minChars 的旧工具结果被替换为占位符', async () => {
    const toolRegistry = createMockToolRegistry([]);
    const conversationManager = createMockConversationManager();
    vi.mocked(conversationManager.get).mockResolvedValue(undefined);

    const longResult = 'x'.repeat(1000); // > 500 minChars
    const historyMessages: StoredMessage[] = [
      {
        id: 'a1', role: 'assistant', content: 'calling', timestamp: 100,
        toolCalls: [{ id: 'tc-1', name: 'page_getContent', params: {} }],
      },
      { id: 't1', role: 'tool', content: longResult, timestamp: 200, toolCallId: 'tc-1' },
      {
        id: 'a2', role: 'assistant', content: 'calling again', timestamp: 300,
        toolCalls: [{ id: 'tc-2', name: 'tabs_query', params: {} }],
      },
      { id: 't2', role: 'tool', content: longResult, timestamp: 400, toolCallId: 'tc-2' },
    ];
    vi.mocked(conversationManager.getRecentMessages).mockResolvedValue(historyMessages);

    const config: AgentConfig = {
      ...defaultConfig,
      microcompactKeepRecent: 1, // 只保留最近 1 条
      microcompactMinChars: 500,
    };

    const builder = new ContextBuilder(config, toolRegistry, conversationManager);
    const messages = await builder.build('conv-1', defaultBrowserContext);

    const toolMsgs = messages.filter((m) => m.role === 'tool');
    expect(toolMsgs.length).toBe(2);
    // 第一条（旧）被压缩
    expect(toolMsgs[0]!.content).toContain('result compressed');
    expect(toolMsgs[0]!.content).toContain('page_getContent');
    // 第二条（最近）保持原样
    expect(toolMsgs[1]!.content).toBe(longResult);
  });

  it('排除列表中的工具不会被压缩', async () => {
    const toolRegistry = createMockToolRegistry([]);
    const conversationManager = createMockConversationManager();
    vi.mocked(conversationManager.get).mockResolvedValue(undefined);

    const longResult = 'x'.repeat(1000);
    const historyMessages: StoredMessage[] = [
      {
        id: 'a1', role: 'assistant', content: 'calling', timestamp: 100,
        toolCalls: [{ id: 'tc-1', name: 'page_getScreenshot', params: {} }],
      },
      { id: 't1', role: 'tool', content: longResult, timestamp: 200, toolCallId: 'tc-1' },
      {
        id: 'a2', role: 'assistant', content: 'calling again', timestamp: 300,
        toolCalls: [{ id: 'tc-2', name: 'page_getContent', params: {} }],
      },
      { id: 't2', role: 'tool', content: longResult, timestamp: 400, toolCallId: 'tc-2' },
    ];
    vi.mocked(conversationManager.getRecentMessages).mockResolvedValue(historyMessages);

    const config: AgentConfig = {
      ...defaultConfig,
      microcompactKeepRecent: 0,
      microcompactMinChars: 500,
      microcompactExcludeTools: ['page_getScreenshot'],
    };

    const builder = new ContextBuilder(config, toolRegistry, conversationManager);
    const messages = await builder.build('conv-1', defaultBrowserContext);

    const toolMsgs = messages.filter((m) => m.role === 'tool');
    expect(toolMsgs.length).toBe(2);
    // page_getScreenshot 被排除，不压缩
    expect(toolMsgs[0]!.content).toBe(longResult);
    // page_getContent 不在排除列表中，被压缩
    expect(toolMsgs[1]!.content).toContain('result compressed');
    expect(toolMsgs[1]!.content).toContain('page_getContent');
  });

  it('保留的最近 N 条不触发压缩', async () => {
    const toolRegistry = createMockToolRegistry([]);
    const conversationManager = createMockConversationManager();
    vi.mocked(conversationManager.get).mockResolvedValue(undefined);

    const longResult = 'x'.repeat(1000);
    const historyMessages: StoredMessage[] = [
      { id: 'u1', role: 'user', content: 'query', timestamp: 50 },
      {
        id: 'a1', role: 'assistant', content: 'calling', timestamp: 100,
        toolCalls: [{ id: 'tc-1', name: 'page_getContent', params: {} }],
      },
      { id: 't1', role: 'tool', content: longResult, timestamp: 200, toolCallId: 'tc-1' },
      {
        id: 'a2', role: 'assistant', content: 'calling', timestamp: 300,
        toolCalls: [{ id: 'tc-2', name: 'page_getContent', params: {} }],
      },
      { id: 't2', role: 'tool', content: longResult, timestamp: 400, toolCallId: 'tc-2' },
      {
        id: 'a3', role: 'assistant', content: 'calling', timestamp: 500,
        toolCalls: [{ id: 'tc-3', name: 'page_getContent', params: {} }],
      },
      { id: 't3', role: 'tool', content: longResult, timestamp: 600, toolCallId: 'tc-3' },
    ];
    vi.mocked(conversationManager.getRecentMessages).mockResolvedValue(historyMessages);

    const config: AgentConfig = {
      ...defaultConfig,
      microcompactKeepRecent: 3, // 保留全部 3 条
      microcompactMinChars: 500,
    };

    const builder = new ContextBuilder(config, toolRegistry, conversationManager);
    const messages = await builder.build('conv-1', defaultBrowserContext);

    const toolMsgs = messages.filter((m) => m.role === 'tool');
    expect(toolMsgs.length).toBe(3);
    // 全部 3 条都在保留范围内，不应压缩
    for (const msg of toolMsgs) {
      expect(msg.content).toBe(longResult);
    }
  });
});
