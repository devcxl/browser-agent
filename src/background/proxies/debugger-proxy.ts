import type { IBrowserAdapter } from '@/adapters/types';

export class DebuggerProxy {
  constructor(private adapter: IBrowserAdapter) {}

  async getTargets() {
    return this.adapter.debugger.getTargets();
  }

  async attach(p: { targetId: string }) {
    await this.adapter.debugger.attach(p.targetId);
  }

  async detach(p: { targetId: string }) {
    await this.adapter.debugger.detach(p.targetId);
  }
}
