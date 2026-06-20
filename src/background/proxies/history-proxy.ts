import type { IBrowserAdapter } from '@/adapters/types';
import type { HistorySearchParams, HistoryDeleteParams } from '@/shared/types';

export class HistoryProxy {
  constructor(private adapter: IBrowserAdapter) {}

  async search(params: HistorySearchParams) {
    return this.adapter.history.search(params);
  }

  async delete(params: HistoryDeleteParams) {
    if (params.url) {
      await this.adapter.history.deleteUrl(params.url);
    } else if (params.startTime !== undefined && params.endTime !== undefined) {
      await this.adapter.history.deleteRange({
        startTime: params.startTime,
        endTime: params.endTime,
      });
    } else {
      throw new Error('history.delete requires either url or both startTime and endTime');
    }
    return { success: true };
  }

  async deleteAll() {
    await this.adapter.history.deleteAll();
    return { success: true };
  }
}
