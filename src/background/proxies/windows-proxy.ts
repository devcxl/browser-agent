import type { IBrowserAdapter } from '@/adapters/types';

export class WindowsProxy {
  constructor(private adapter: IBrowserAdapter) {}

  async getAll(params?: { getInfo?: Record<string, unknown> }) {
    return this.adapter.windows.getAll(params?.getInfo as any);
  }

  async get(params: { windowId: number; getInfo?: Record<string, unknown> }) {
    return this.adapter.windows.get(params.windowId, params.getInfo as any);
  }

  async create(params?: { createData?: Record<string, unknown> }) {
    return this.adapter.windows.create(params?.createData as any);
  }

  async remove(params: { windowId: number }) {
    await this.adapter.windows.remove(params.windowId);
  }
}
