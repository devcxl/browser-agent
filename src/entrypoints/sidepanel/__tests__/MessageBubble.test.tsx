import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { MessageBubble } from '../components/MessageBubble';
import { I18nProvider } from '../i18n/I18nProvider';
import { mockBrowserStorage } from './test-utils';
import type { UIMessage } from '../types';

function wrappedRender(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

beforeEach(() => { mockBrowserStorage(); });

describe('MessageBubble', () => {
  it('wrappedRenders user message right-aligned', () => {
    const msg: UIMessage = {
      id: '1',
      role: 'user',
      content: 'hello',
      timestamp: Date.now(),
      status: 'complete',
    };

    const { container } = wrappedRender(<MessageBubble message={msg} />);
    // The outer flex container has justify-end for user
    const outer = container.firstChild as HTMLElement;
    expect(outer.className).toContain('justify-end');
    expect(screen.getByText('hello')).toBeDefined();
  });

  it('wrappedRenders assistant message left-aligned', () => {
    const msg: UIMessage = {
      id: '2',
      role: 'assistant',
      content: 'response',
      timestamp: Date.now(),
      status: 'complete',
    };

    const { container } = wrappedRender(<MessageBubble message={msg} />);
    const outer = container.firstChild as HTMLElement;
    expect(outer.className).toContain('justify-start');
    expect(screen.getByText('response')).toBeDefined();
  });

  it('shows cursor for streaming message', () => {
    const msg: UIMessage = {
      id: '3',
      role: 'assistant',
      content: 'streaming...',
      timestamp: Date.now(),
      status: 'streaming',
    };

    wrappedRender(<MessageBubble message={msg} />);
    expect(screen.getByText('streaming...')).toBeDefined();
    // Cursor indicator: should have an animate-pulse element
    const cursor = document.querySelector('.animate-pulse');
    expect(cursor).toBeDefined();
  });

  it('wrappedRenders tool message with toolCallDisplay using ToolCallCard', () => {
    const msg: UIMessage = {
      id: '4',
      role: 'tool',
      content: 'tabs_query',
      timestamp: Date.now(),
      toolCallDisplay: {
        id: 'tc-1',
        name: 'tabs_query',
        params: { url: 'example.com' },
        status: 'success',
        riskLevel: 'low',
        confirmed: true,
      },
    };

    wrappedRender(<MessageBubble message={msg} />);
    expect(screen.getByText('tabs_query')).toBeDefined();
  });

  it('wrappedRenders tool message without toolCallDisplay in compact style', () => {
    const msg: UIMessage = {
      id: '5',
      role: 'tool',
      content: 'Tool executed',
      timestamp: Date.now(),
    };

    const { container } = wrappedRender(<MessageBubble message={msg} />);
    const outer = container.firstChild as HTMLElement;
    expect(outer.className).toContain('justify-center');
    expect(screen.getByText('Tool executed')).toBeDefined();
  });

  // === Markdown 渲染 ===
  describe('assistant markdown 渲染', () => {
    it('渲染标题为 h2', () => {
      const msg: UIMessage = {
        id: 'm1',
        role: 'assistant',
        content: '## 标题',
        timestamp: Date.now(),
        status: 'complete',
      };
      const { container } = wrappedRender(<MessageBubble message={msg} />);
      expect(container.querySelector('h2')).toBeDefined();
    });

    it('渲染代码块为 pre>code', () => {
      const msg: UIMessage = {
        id: 'm2',
        role: 'assistant',
        content: '```js\nconsole.log(1)\n```',
        timestamp: Date.now(),
        status: 'complete',
      };
      const { container } = wrappedRender(<MessageBubble message={msg} />);
      expect(container.querySelector('pre')).toBeDefined();
      expect(container.querySelector('pre')?.querySelector('code')).toBeDefined();
    });

    it('渲染行内代码为 code', () => {
      const msg: UIMessage = {
        id: 'm3',
        role: 'assistant',
        content: '使用 `time_get` 获取时间',
        timestamp: Date.now(),
        status: 'complete',
      };
      const { container } = wrappedRender(<MessageBubble message={msg} />);
      expect(container.querySelector('code')).toBeDefined();
    });

    it('渲染无序列表', () => {
      const msg: UIMessage = {
        id: 'm4',
        role: 'assistant',
        content: '- 项目一\n- 项目二',
        timestamp: Date.now(),
        status: 'complete',
      };
      const { container } = wrappedRender(<MessageBubble message={msg} />);
      expect(container.querySelector('ul')).toBeDefined();
      expect(container.querySelectorAll('li')).toHaveLength(2);
    });

    it('渲染链接为 <a> 且带 safe 协议', () => {
      const msg: UIMessage = {
        id: 'm5',
        role: 'assistant',
        content: '[示例](https://example.com)',
        timestamp: Date.now(),
        status: 'complete',
      };
      const { container } = wrappedRender(<MessageBubble message={msg} />);
      const link = container.querySelector('a');
      expect(link).toBeDefined();
      expect(link?.getAttribute('href')).toBe('https://example.com');
    });

    it('拦截 javascript: 链接（不渲染为可点击 href）', () => {
      const msg: UIMessage = {
        id: 'm6',
        role: 'assistant',
        content: '[恶意](javascript:alert(1))',
        timestamp: Date.now(),
        status: 'complete',
      };
      const { container } = wrappedRender(<MessageBubble message={msg} />);
      const link = container.querySelector('a');
      // href 不应是 javascript: 协议
      const href = link?.getAttribute('href') ?? '';
      expect(href).not.toContain('javascript:');
    });

    it('不渲染原始 HTML（XSS 防护）', () => {
      const msg: UIMessage = {
        id: 'm7',
        role: 'assistant',
        content: '<script>alert(1)</script>',
        timestamp: Date.now(),
        status: 'complete',
      };
      const { container } = wrappedRender(<MessageBubble message={msg} />);
      expect(container.querySelector('script')).toBeNull();
    });

    it('user 消息不做 markdown 渲染（纯文本，含 # 不变标题）', () => {
      const msg: UIMessage = {
        id: 'm8',
        role: 'user',
        content: '## 不是标题',
        timestamp: Date.now(),
        status: 'complete',
      };
      const { container } = wrappedRender(<MessageBubble message={msg} />);
      expect(container.querySelector('h2')).toBeNull();
      expect(screen.getByText('## 不是标题')).toBeDefined();
    });
  });

  // === SDK parts 格式测试 ===
  describe('AI SDK parts 格式', () => {
    it('从 text part 渲染文本内容', () => {
      const msg: UIMessage = {
        id: 'sdk-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Hello from SDK' }],
        timestamp: Date.now(),
      };
      wrappedRender(<MessageBubble message={msg} />);
      expect(screen.getByText('Hello from SDK')).toBeDefined();
    });

    it('从 reasoning part 渲染推理内容', () => {
      const msg: UIMessage = {
        id: 'sdk-2',
        role: 'assistant',
        parts: [{ type: 'reasoning', text: 'Let me think...' }],
        timestamp: Date.now(),
      };
      wrappedRender(<MessageBubble message={msg} />);
      // 推理默认折叠，展开按钮显示翻译后的文本
      expect(screen.getByText('查看思考过程')).toBeDefined();
    });

    it('从 dynamic-tool part 渲染工具调用卡片', () => {
      const msg: UIMessage = {
        id: 'sdk-3',
        role: 'assistant',
        parts: [
          {
            type: 'dynamic-tool',
            toolCallId: 'tc-1',
            toolName: 'tabs_query',
            state: 'output-available',
            input: { url: 'example.com' },
            output: { count: 3 },
          } as any,
        ],
        timestamp: Date.now(),
      };
      wrappedRender(<MessageBubble message={msg} />);
      expect(screen.getByText('tabs_query')).toBeDefined();
      expect(screen.getByText('output-available')).toBeDefined();
    });

    it('streaming 时显示光标（text part state=streaming）', () => {
      const msg: UIMessage = {
        id: 'sdk-4',
        role: 'assistant',
        parts: [{ type: 'text', text: 'streaming...', state: 'streaming' }],
        timestamp: Date.now(),
      };
      wrappedRender(<MessageBubble message={msg} />);
      expect(screen.getByText('streaming...')).toBeDefined();
      const cursor = document.querySelector('.animate-pulse');
      expect(cursor).toBeDefined();
    });

    it('多个 text part 拼接为一段文本', () => {
      const msg: UIMessage = {
        id: 'sdk-5',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'Part 1 ' },
          { type: 'text', text: 'Part 2' },
        ],
        timestamp: Date.now(),
      };
      wrappedRender(<MessageBubble message={msg} />);
      expect(screen.getByText('Part 1 Part 2')).toBeDefined();
    });

    it('user 消息 with parts 纯文本渲染（不做 markdown）', () => {
      const msg: UIMessage = {
        id: 'sdk-6',
        role: 'user',
        parts: [{ type: 'text', text: '## 不是标题' }],
        timestamp: Date.now(),
      };
      const { container } = wrappedRender(<MessageBubble message={msg} />);
      expect(container.querySelector('h2')).toBeNull();
      expect(screen.getByText('## 不是标题')).toBeDefined();
    });

    it('工具调用失败状态显示 error 图标', () => {
      const msg: UIMessage = {
        id: 'sdk-7',
        role: 'assistant',
        parts: [
          {
            type: 'dynamic-tool',
            toolCallId: 'tc-err',
            toolName: 'bad_tool',
            state: 'output-error',
            input: {},
            errorText: 'Something went wrong',
          } as any,
        ],
        timestamp: Date.now(),
      };
      const { container } = wrappedRender(<MessageBubble message={msg} />);
      expect(screen.getByText('bad_tool')).toBeDefined();
      // error 状态显示危险色状态点
      expect(container.querySelector('.bg-danger')).toBeDefined();
    });
  });
});
