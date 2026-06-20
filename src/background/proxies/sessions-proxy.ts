import type { IBrowserAdapter } from '@/adapters/types';
import type { SessionFilter } from '@/shared/types';

export class SessionsProxy {
  constructor(private adapter: IBrowserAdapter) {}

  async save() {
    const sessions = await this.adapter.sessions.getRecentlyClosed({ maxResults: 25 });
    return { saved: true, count: sessions.length };
  }

  async restore(params: { sessionId: string }) {
    return this.adapter.sessions.restore(params.sessionId);
  }

  async list(params?: SessionFilter) {
    return this.adapter.sessions.getRecentlyClosed(params);
  }

  async delete(_params: { sessionId: string }) {
    // chrome.sessions 没有 delete API，已关闭的会话会在浏览器重启或超过 MAX_SESSION_RESULTS 后自动清除
    // Firefox 也没有 delete API
    return { success: false, error: 'Sessions cannot be manually deleted' };
  }
}
