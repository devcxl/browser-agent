import { describe, it, expect, vi } from 'vitest';
import type { ToolResult } from '@/shared/types';
import { createPageTools } from '../index';

function createMockExecute(): (params: Record<string, unknown>) => Promise<ToolResult> {
  return vi.fn().mockResolvedValue({ success: true, data: {} });
}

describe('page 类工具集', () => {
  it('不注册 page_eval：MV3 内容脚本隔离世界的 CSP 禁止 eval/new Function', () => {
    const names = createPageTools(createMockExecute()).map((tool) => tool.name);
    expect(names).not.toContain('page_eval');
  });
});
