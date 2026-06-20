import type { JsonRpcResponse } from '@/shared/types';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Content Script 消息桥接（Port 模式）
 *
 * 通过 browser.tabs.connect 建立到目标标签页 Content Script 的长连接 Port，
 * 与 content/index.ts 的 onConnect 监听匹配。
 * 支持请求/响应，自动超时清理。
 */
const PORT_NAME = 'content-script-bridge';
const DEFAULT_TIMEOUT = 10000;

export class ContentBridge {
  private ports = new Map<number, ReturnType<typeof browser.tabs.connect>>();
  private pending = new Map<string | number, PendingRequest>();
  private requestId = 0;
  private timeout: number;

  constructor(timeout?: number) {
    this.timeout = timeout ?? DEFAULT_TIMEOUT;
  }

  async sendToContent(
    tabId: number,
    method: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    const port = this.getOrCreatePort(tabId);
    const id = ++this.requestId;

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Content script request timeout: ${method} (${this.timeout}ms)`));
      }, this.timeout);

      this.pending.set(id, { resolve, reject, timer });

      port.postMessage({ id, method, params });
    });
  }

  private getOrCreatePort(tabId: number): ReturnType<typeof browser.tabs.connect> {
    let port = this.ports.get(tabId);
    if (port) return port;

    port = browser.tabs.connect(tabId, { name: PORT_NAME });

    port.onMessage.addListener((message: unknown) => {
      this.handleResponse(message);
    });

    port.onDisconnect.addListener(() => {
      this.ports.delete(tabId);
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Port disconnected'));
        this.pending.delete(id);
      }
    });

    this.ports.set(tabId, port);
    return port;
  }

  private handleResponse(message: unknown): void {
    if (!message || typeof message !== 'object') return;

    const msg = message as Record<string, unknown>;
    if (!('id' in msg)) return;

    const pending = this.pending.get(msg.id as string | number);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(msg.id as string | number);

    const response = msg as unknown as JsonRpcResponse;

    if (response.error) {
      pending.reject(new Error(response.error.message));
    } else {
      pending.resolve(response.result);
    }
  }

  disconnect(tabId?: number): void {
    if (tabId !== undefined) {
      const port = this.ports.get(tabId);
      if (port) {
        try {
          port.disconnect();
        } catch {
          /* ignore */
        }
        this.ports.delete(tabId);
      }
    } else {
      for (const [, port] of this.ports) {
        try {
          port.disconnect();
        } catch {
          /* ignore */
        }
      }
      this.ports.clear();
    }

    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Port disconnected'));
    }
    this.pending.clear();
  }
}
