import { describe, it, expect} from 'vitest';
import { ContextManager } from '../context-manager';
import type { AgentConfig } from '@/shared/types/agent';
import type { ModelMessage } from 'ai';

const defaultConfig: AgentConfig = {
  maxToolRounds: 15,
  systemPrompt: 'You are a browser assistant.',
  maxContextMessages: 20,
  contextWindowTokens: 128000,
  tokenBudgetMargin: 4096,
  microcompactKeepRecent: 10,
  microcompactMinChars: 500,
  microcompactExcludeTools: [],
  summaryThreshold: { messageCount: 30, estimatedTokens: 12_000 },
};

function makeSystemMsg(content: string): ModelMessage {
  return { role: 'system', content };
}

function makeUserMsg(content: string): ModelMessage {
  return { role: 'user', content };
}

function makeToolCallMsg(calls: Array<{ id: string; name: string; args: unknown }>): ModelMessage {
  return {
    role: 'assistant',
    content: calls.map((c) => ({
      type: 'tool-call' as const,
      toolCallId: c.id,
      toolName: c.name,
      input: c.args,
    })),
  } as ModelMessage;
}

function makeToolResultMsg(results: Array<{ id: string; name: string; output: string }>): ModelMessage {
  return {
    role: 'tool',
    content: results.map((r) => ({
      type: 'tool-result' as const,
      toolCallId: r.id,
      toolName: r.name,
      output: { type: 'text' as const, value: r.output },
    })),
  } as ModelMessage;
}

// ────────────────────────────────────────────────

describe('ContextManager.prepareStep', () => {
  it('stepNumber < 2 时不执行任何操作', () => {
    const cm = new ContextManager(defaultConfig);
    const msgs: ModelMessage[] = [makeSystemMsg('test')];

    const r0 = cm.prepareStep(0, msgs);
    const r1 = cm.prepareStep(1, msgs);

    expect(r0.messages).toBe(msgs);
    expect(r1.messages).toBe(msgs);
  });

  it('奇数步不执行任何操作（第3步等）', () => {
    const cm = new ContextManager(defaultConfig);
    const msgs: ModelMessage[] = [makeSystemMsg('test')];

    const r = cm.prepareStep(3, msgs);
    expect(r.messages).toBe(msgs);
  });

  it('偶数步（stepNumber >= 2）执行微压缩和预算截断', () => {
    const cm = new ContextManager(defaultConfig);
    const msgs: ModelMessage[] = [makeSystemMsg('test'), makeUserMsg('hello')];

    const r = cm.prepareStep(2, msgs);
    // 消息数量不变（预算充足，无压缩候选）
    expect(r.messages).toHaveLength(2);
  });
});

// ────────────────────────────────────────────────

describe('ContextManager — Token 预算截断', () => {
  it('消息在预算内时不触发截断', () => {
    const cm = new ContextManager(defaultConfig);
    const msgs: ModelMessage[] = [
      makeSystemMsg('system'),
      makeUserMsg('hello'),
    ];

    const result = cm.prepareStep(2, msgs).messages;
    expect(result).toHaveLength(2);
  });

  it('token 超出预算时截断最旧的非 system 消息', () => {
    const config: AgentConfig = {
      ...defaultConfig,
      contextWindowTokens: 200,
      tokenBudgetMargin: 50,
      microcompactKeepRecent: 100, // 不压缩
    };
    const cm = new ContextManager(config);

    const longContent = 'x'.repeat(2000); // ~1000 tokens
    const msgs: ModelMessage[] = [
      makeSystemMsg('short'),
      makeUserMsg(longContent),
      { role: 'assistant', content: longContent },
      makeUserMsg('keep-this'),
      { role: 'assistant', content: 'kept' },
    ];

    const result = cm.prepareStep(2, msgs).messages;

    // system 应该保留
    expect(result.filter((m) => m.role === 'system')).toHaveLength(1);

    // 最后一条 user 消息 'keep-this' 应该被保留
    const userMsgs = result.filter((m) => m.role === 'user');
    expect(userMsgs.some((m) => m.content === 'keep-this')).toBe(true);

    // 早期长消息应该被截断
    const allContent = result.map((m) => (typeof m.content === 'string' ? m.content : ''));
    const longCount = allContent.filter((c) => c === longContent).length;
    expect(longCount).toBe(0);
  });

  it('截断后对齐到 user 消息边界', () => {
    const config: AgentConfig = {
      ...defaultConfig,
      contextWindowTokens: 200,
      tokenBudgetMargin: 50,
      microcompactKeepRecent: 100,
    };
    const cm = new ContextManager(config);

    const longContent = 'x'.repeat(2000);
    const msgs: ModelMessage[] = [
      makeSystemMsg('system'),
      makeUserMsg(longContent),
      { role: 'assistant', content: 'middle' },
      makeUserMsg('last-user-msg'),
      { role: 'assistant', content: 'last-assistant' },
    ];

    const result = cm.prepareStep(2, msgs).messages;
    const nonSystem = result.filter((m) => m.role !== 'system');
    if (nonSystem.length > 0) {
      // 第一条非 system 消息必须是 user 角色
      expect(nonSystem[0]!.role).toBe('user');
      expect(nonSystem[0]!.content).not.toBe('middle');
    }
  });

  it('保留所有 system 消息不变', () => {
    const config: AgentConfig = {
      ...defaultConfig,
      contextWindowTokens: 200,
      tokenBudgetMargin: 50,
      microcompactKeepRecent: 100,
    };
    const cm = new ContextManager(config);

    const longContent = 'x'.repeat(2000);
    const msgs: ModelMessage[] = [
      makeSystemMsg('important system 1'),
      makeSystemMsg('important system 2'),
      makeUserMsg(longContent),
      makeUserMsg(longContent),
    ];

    const result = cm.prepareStep(2, msgs).messages;

    const systemMsgs = result.filter((m) => m.role === 'system');
    expect(systemMsgs).toHaveLength(2);
    expect(systemMsgs[0]!.content).toBe('important system 1');
    expect(systemMsgs[1]!.content).toBe('important system 2');
  });
});

// ────────────────────────────────────────────────

describe('ContextManager — 工具结果微压缩', () => {
  it('短工具结果不触发压缩', () => {
    const config: AgentConfig = {
      ...defaultConfig,
      microcompactKeepRecent: 0,
      microcompactMinChars: 500,
    };
    const cm = new ContextManager(config);

    const msgs: ModelMessage[] = [
      makeSystemMsg('system'),
      makeUserMsg('query'),
      makeToolCallMsg([{ id: 'tc-1', name: 'time_get', args: {} }]),
      makeToolResultMsg([{ id: 'tc-1', name: 'time_get', output: 'short' }]),
    ];

    const result = cm.prepareStep(2, msgs).messages;
    const toolMsgs = result.filter((m) => m.role === 'tool');
    expect(toolMsgs).toHaveLength(1);
    const toolContent = toolMsgs[0]!.content;
    expect(Array.isArray(toolContent)).toBe(true);
    if (Array.isArray(toolContent) && toolContent[0]?.type === 'tool-result') {
      const output = toolContent[0].output;
      expect(output && typeof output === 'object' && 'value' in output ? output.value : '').toBe('short');
    }
  });

  it('超出 minChars 的旧工具结果被替换为占位符', () => {
    const config: AgentConfig = {
      ...defaultConfig,
      microcompactKeepRecent: 1, // 只保留最近 1 条
      microcompactMinChars: 500,
    };
    const cm = new ContextManager(config);

    const longResult = 'x'.repeat(1000);
    const msgs: ModelMessage[] = [
      makeSystemMsg('system'),
      makeUserMsg('query'),
      makeToolCallMsg([{ id: 'tc-1', name: 'page_getContent', args: {} }]),
      makeToolResultMsg([{ id: 'tc-1', name: 'page_getContent', output: longResult }]),
      makeToolCallMsg([{ id: 'tc-2', name: 'tabs_query', args: {} }]),
      makeToolResultMsg([{ id: 'tc-2', name: 'tabs_query', output: longResult }]),
    ];

    const result = cm.prepareStep(2, msgs).messages;
    const toolMsgs = result.filter((m) => m.role === 'tool');
    expect(toolMsgs).toHaveLength(2);

    // 第一条 tool 消息（旧）应该被压缩
    const firstToolContent = toolMsgs[0]!.content;
    expect(Array.isArray(firstToolContent)).toBe(true);
    if (Array.isArray(firstToolContent) && firstToolContent[0]?.type === 'tool-result') {
      const output = firstToolContent[0].output;
      const value = output && typeof output === 'object' && 'value' in output ? output.value : '';
      expect(value).toContain('result compressed');
      expect(value).toContain('page_getContent');
    }

    // 第二条 tool 消息（最近）保持原样
    const secondToolContent = toolMsgs[1]!.content;
    expect(Array.isArray(secondToolContent)).toBe(true);
    if (Array.isArray(secondToolContent) && secondToolContent[0]?.type === 'tool-result') {
      const output = secondToolContent[0].output;
      const value = output && typeof output === 'object' && 'value' in output ? output.value : '';
      expect(value).toBe(longResult);
    }
  });

  it('排除列表中的工具不会被压缩', () => {
    const config: AgentConfig = {
      ...defaultConfig,
      microcompactKeepRecent: 0,
      microcompactMinChars: 500,
      microcompactExcludeTools: ['page_getScreenshot'],
    };
    const cm = new ContextManager(config);

    const longResult = 'x'.repeat(1000);
    const msgs: ModelMessage[] = [
      makeSystemMsg('system'),
      makeUserMsg('query'),
      makeToolCallMsg([{ id: 'tc-1', name: 'page_getScreenshot', args: {} }]),
      makeToolResultMsg([{ id: 'tc-1', name: 'page_getScreenshot', output: longResult }]),
      makeToolCallMsg([{ id: 'tc-2', name: 'page_getContent', args: {} }]),
      makeToolResultMsg([{ id: 'tc-2', name: 'page_getContent', output: longResult }]),
    ];

    const result = cm.prepareStep(2, msgs).messages;
    const toolMsgs = result.filter((m) => m.role === 'tool');
    expect(toolMsgs).toHaveLength(2);

    // page_getScreenshot 在排除列表，不压缩
    const firstToolContent = toolMsgs[0]!.content;
    if (Array.isArray(firstToolContent) && firstToolContent[0]?.type === 'tool-result') {
      const output = firstToolContent[0].output;
      const value = output && typeof output === 'object' && 'value' in output ? output.value : '';
      expect(value).toBe(longResult);
    }

    // page_getContent 不在排除列表，被压缩
    const secondToolContent = toolMsgs[1]!.content;
    if (Array.isArray(secondToolContent) && secondToolContent[0]?.type === 'tool-result') {
      const output = secondToolContent[0].output;
      const value = output && typeof output === 'object' && 'value' in output ? output.value : '';
      expect(value).toContain('result compressed');
    }
  });

  it('保留的最近 N 条不触发压缩', () => {
    const config: AgentConfig = {
      ...defaultConfig,
      microcompactKeepRecent: 3, // 保留全部 3 条
      microcompactMinChars: 500,
    };
    const cm = new ContextManager(config);

    const longResult = 'x'.repeat(1000);
    const msgs: ModelMessage[] = [
      makeSystemMsg('system'),
      makeUserMsg('query'),
      makeToolCallMsg([{ id: 'tc-1', name: 'page_getContent', args: {} }]),
      makeToolResultMsg([{ id: 'tc-1', name: 'page_getContent', output: longResult }]),
      makeToolCallMsg([{ id: 'tc-2', name: 'page_getContent', args: {} }]),
      makeToolResultMsg([{ id: 'tc-2', name: 'page_getContent', output: longResult }]),
      makeToolCallMsg([{ id: 'tc-3', name: 'page_getContent', args: {} }]),
      makeToolResultMsg([{ id: 'tc-3', name: 'page_getContent', output: longResult }]),
    ];

    const result = cm.prepareStep(2, msgs).messages;
    const toolMsgs = result.filter((m) => m.role === 'tool');
    expect(toolMsgs).toHaveLength(3);

    for (const msg of toolMsgs) {
      if (Array.isArray(msg.content) && msg.content[0]?.type === 'tool-result') {
        const output = msg.content[0].output;
        const value = output && typeof output === 'object' && 'value' in output ? output.value : '';
        expect(value).toBe(longResult);
      }
    }
  });
});

// ────────────────────────────────────────────────

describe('ContextManager — repairToolCallIntegrity', () => {
  it('移除孤立 tool-result（无匹配 tool-call）', () => {
    const config: AgentConfig = {
      ...defaultConfig,
      contextWindowTokens: 200,
      tokenBudgetMargin: 50,
      microcompactKeepRecent: 100,
    };
    const cm = new ContextManager(config);

    // 被截断后的场景：tool-result 失去了前置的 assistant(tool-call)
    const longContent = 'x'.repeat(2000);
    const msgs: ModelMessage[] = [
      makeSystemMsg('system'),
      makeToolResultMsg([{ id: 'orphan-tc', name: 'unknown', output: 'orphan result' }]),
      makeUserMsg(longContent),
      makeUserMsg(longContent),
    ];

    const result = cm.prepareStep(2, msgs).messages;

    // 孤立 tool-result 应该被移除
    const toolMsgs = result.filter((m) => m.role === 'tool');
    expect(toolMsgs).toHaveLength(0);
  });

  it('保留有匹配 tool-call 的 tool-result', () => {
    const config: AgentConfig = {
      ...defaultConfig,
      microcompactKeepRecent: 100,
    };
    const cm = new ContextManager(config);

    const msgs: ModelMessage[] = [
      makeSystemMsg('system'),
      makeUserMsg('query'),
      makeToolCallMsg([{ id: 'tc-1', name: 'tabs_query', args: {} }]),
      makeToolResultMsg([{ id: 'tc-1', name: 'tabs_query', output: 'result' }]),
    ];

    const result = cm.prepareStep(2, msgs).messages;
    const toolMsgs = result.filter((m) => m.role === 'tool');
    expect(toolMsgs).toHaveLength(1);
  });
});

// ────────────────────────────────────────────────

describe('ContextManager — injectBrowserContext', () => {
  it('将 browser context 注入到 system message', () => {
    const cm = new ContextManager(defaultConfig);
    const msgs: ModelMessage[] = [makeSystemMsg('base system'), makeUserMsg('hello')];

    const injected = cm.injectBrowserContext(msgs, '{"tabs": []}');
    const systemMsgs = injected.filter((m) => m.role === 'system');
    expect(systemMsgs).toHaveLength(1);
    expect(systemMsgs[0]!.content).toContain('base system');
    expect(systemMsgs[0]!.content).toContain('## 当前浏览器上下文');
    expect(systemMsgs[0]!.content).toContain('"tabs": []');
  });

  it('没有 system message 时返回原数组', () => {
    const cm = new ContextManager(defaultConfig);
    const msgs: ModelMessage[] = [makeUserMsg('hello')];

    const injected = cm.injectBrowserContext(msgs, 'test');
    expect(injected).toHaveLength(1);
    expect(injected[0]!.content).toBe('hello');
  });
});

describe('ContextManager — injectSkillPrompts', () => {
  it('将技能 prompt 注入到 system message', () => {
    const cm = new ContextManager(defaultConfig);
    const msgs: ModelMessage[] = [makeSystemMsg('base system')];

    const injected = cm.injectSkillPrompts(msgs, ['skill1 prompt', 'skill2 prompt']);
    const systemMsgs = injected.filter((m) => m.role === 'system');
    expect(systemMsgs).toHaveLength(1);
    expect(systemMsgs[0]!.content).toContain('base system');
    expect(systemMsgs[0]!.content).toContain('## 已激活的技能');
    expect(systemMsgs[0]!.content).toContain('skill1 prompt');
    expect(systemMsgs[0]!.content).toContain('skill2 prompt');
  });

  it('空技能列表不修改消息', () => {
    const cm = new ContextManager(defaultConfig);
    const msgs: ModelMessage[] = [makeSystemMsg('base system')];

    const injected = cm.injectSkillPrompts(msgs, []);
    expect(injected).toBe(msgs);
  });

  it('没有 system message 时返回原数组', () => {
    const cm = new ContextManager(defaultConfig);
    const msgs: ModelMessage[] = [makeUserMsg('hello')];

    const injected = cm.injectSkillPrompts(msgs, ['prompt']);
    expect(injected).toHaveLength(1);
  });
});
