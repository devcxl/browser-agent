import { describe, it, expect, vi } from 'vitest';
import { createPageGetScreenshotTool } from '../page-get-screenshot';
import type { IJsonRpcClient } from '@/shared/types/jsonrpc';

function createMockRpc(): IJsonRpcClient {
  return {
    request: vi.fn().mockResolvedValue({
      success: true,
      data: { format: 'png', dataUrl: 'data:image/png;base64,xxx' },
    }),
    notify: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as IJsonRpcClient;
}

describe('page_getScreenshot tool', () => {
  it('should return tool definition with correct metadata', () => {
    const rpc = createMockRpc();
    const tool = createPageGetScreenshotTool(rpc);

    expect(tool.name).toBe('page_getScreenshot');
    expect(tool.category).toBe('page');
    expect(tool.riskLevel).toBe('high');
    expect(tool.confirmationRequired).toBe(true);
    expect(tool.requireBackground).toBe(true);
    expect(tool.resultSensitivity).toBe('sensitive');
  });

  it('should default format to png when omitted', async () => {
    const rpc = createMockRpc();
    const tool = createPageGetScreenshotTool(rpc);

    const result = await tool.execute({ quality: 80 });

    expect(rpc.request).toHaveBeenCalledWith('tabs.captureScreenshot', {
      format: 'png',
      quality: 80,
    });
    expect(result.success).toBe(true);
  });

  it('should pass jpeg format and undefined quality through', async () => {
    const rpc = createMockRpc();
    const tool = createPageGetScreenshotTool(rpc);

    await tool.execute({ format: 'jpeg' });

    expect(rpc.request).toHaveBeenCalledWith('tabs.captureScreenshot', {
      format: 'jpeg',
      quality: undefined,
    });
  });
});
