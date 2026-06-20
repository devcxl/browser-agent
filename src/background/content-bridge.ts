/**
 * Content Script 消息桥接
 *
 * 将 Background 的请求转发到指定标签页的 Content Script，
 * 并返回 JSON-RPC 格式的响应。
 */
export class ContentBridge {
  async sendToContent(
    tabId: number,
    method: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    const response = await browser.tabs.sendMessage(tabId, {
      jsonrpc: '2.0',
      method,
      params,
    }) as Record<string, unknown> | undefined;

    if (response?.error) {
      throw new Error((response.error as Record<string, unknown>).message as string);
    }
    return response?.result;
  }
}
