import type { IBrowserAdapter } from '@/adapters/types';

export class HistoryProxy {
  constructor(private adapter: IBrowserAdapter) {}

  async search(params: { text: string; startTime?: number; endTime?: number; maxResults?: number }) {
    return this.adapter.history.search(params);
  }

  async delete(params: { url?: string; startTime?: number; endTime?: number }) {
    if (params.url) {
      await this.adapter.history.deleteUrl(params.url);
    } else if (params.startTime !== undefined && params.endTime !== undefined) {
      await this.adapter.history.deleteRange({
        startTime: params.startTime,
        endTime: params.endTime,
      });
    }
    return { success: true };
  }

  async deleteAll() {
    await this.adapter.history.deleteAll();
    return { success: true };
  }
}
