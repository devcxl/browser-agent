import type { IBrowserAdapter } from '@/adapters/types';
import type { DownloadQuery, DownloadOptions } from '@/shared/types';

export class DownloadsProxy {
  constructor(private adapter: IBrowserAdapter) {}

  async search(params: DownloadQuery) {
    return this.adapter.downloads.search(params);
  }

  async download(params: DownloadOptions) {
    return this.adapter.downloads.download(params);
  }

  async erase(params: DownloadQuery) {
    return this.adapter.downloads.erase(params);
  }

  async open(params: { downloadId: number }) {
    await this.adapter.downloads.open(params.downloadId);
    return { success: true };
  }

  async cancel(params: { downloadId: number }) {
    await this.adapter.downloads.cancel(params.downloadId);
    return { success: true };
  }

  async pause(params: { downloadId: number }) {
    await this.adapter.downloads.pause(params.downloadId);
    return { success: true };
  }

  async resume(params: { downloadId: number }) {
    await this.adapter.downloads.resume(params.downloadId);
    return { success: true };
  }
}
