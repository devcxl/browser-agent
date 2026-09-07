import { describe, it, expect, vi } from 'vitest';
import { createPageViewMarkdownTool } from '../page-view-markdown';
import type { IJsonRpcClient } from '@/shared/types/jsonrpc';

function createMockRpc(): IJsonRpcClient {
  return {
    request: vi.fn().mockResolvedValue({ success: true }),
    notify: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as IJsonRpcClient;
}

describe('page_viewMarkdown tool', () => {
  it('should return tool definition with correct metadata', () => {
    const rpc = createMockRpc();
    const tool = createPageViewMarkdownTool(rpc);

    expect(tool.name).toBe('page_viewMarkdown');
    expect(tool.category).toBe('page');
    expect(tool.riskLevel).toBe('low');
    expect(tool.confirmationRequired).toBe(false);
    expect(tool.requireBackground).toBe(true);
    expect(tool.resultSensitivity).toBe('low');
  });

  it('should forward markdown and default title to rpc', async () => {
    const rpc = createMockRpc();
    const tool = createPageViewMarkdownTool(rpc);

    const result = await tool.execute({ markdown: '# Hello' });

    expect(rpc.request).toHaveBeenCalledWith('page.viewMarkdown', {
      markdown: '# Hello',
      title: 'Markdown Preview',
    });
    expect(result).toEqual({ success: true });
  });

  it('should forward custom title when provided', async () => {
    const rpc = createMockRpc();
    const tool = createPageViewMarkdownTool(rpc);

    await tool.execute({ markdown: 'body', title: '自定义标题' });

    expect(rpc.request).toHaveBeenCalledWith('page.viewMarkdown', {
      markdown: 'body',
      title: '自定义标题',
    });
  });
});
