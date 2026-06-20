import type { IBrowserAdapter } from '@/adapters/types';

export class GroupsProxy {
  constructor(private adapter: IBrowserAdapter) {}

  async query(params: { queryInfo: Record<string, unknown> }) {
    return this.adapter.tabGroups.query(params.queryInfo as any);
  }

  async update(params: { groupId: number; updateProperties: Record<string, unknown> }) {
    return this.adapter.tabGroups.update(params.groupId, params.updateProperties as any);
  }
}
