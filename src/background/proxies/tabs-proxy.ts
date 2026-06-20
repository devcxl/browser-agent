import type { IBrowserAdapter } from '@/adapters/types';

export class TabsProxy {
  constructor(private adapter: IBrowserAdapter) {}

  async query(params: { queryInfo: Record<string, unknown> }) {
    return this.adapter.tabs.query(params.queryInfo as any);
  }

  async get(params: { tabId: number }) {
    return this.adapter.tabs.get(params.tabId);
  }

  async create(params: { createProperties: Record<string, unknown> }) {
    return this.adapter.tabs.create(params.createProperties as any);
  }

  async update(params: { tabId: number; updateProperties: Record<string, unknown> }) {
    return this.adapter.tabs.update(params.tabId, params.updateProperties as any);
  }

  async remove(params: { tabIds: number[] }) {
    await this.adapter.tabs.remove(params.tabIds);
    return { removedCount: params.tabIds.length };
  }

  async move(params: { tabIds: number[]; moveProperties: { windowId?: number; index: number } }) {
    return this.adapter.tabs.move(params.tabIds, params.moveProperties);
  }

  async group(params: {
    tabIds: number[];
    groupId?: number;
    createProperties?: { windowId?: number };
  }) {
    const groupId = await this.adapter.tabs.group(params);
    return { groupId };
  }

  async ungroup(params: { tabIds: number[] }) {
    await this.adapter.tabs.ungroup(params.tabIds);
  }
}
