import { getAdapter } from '@/adapters';
import { CapabilityDetector } from '@/background/capability-detector';
import { BackgroundRpcServer } from '@/background/rpc-server';
import { JsonRpcRouter } from '@/shared/jsonrpc';

export default defineBackground(() => {
  const adapter = getAdapter();
  const capabilityDetector = new CapabilityDetector(adapter);

  const rpcServer = new BackgroundRpcServer();
  const router = new JsonRpcRouter(rpcServer);

  router.register('capability.detect', async () => {
    return capabilityDetector.detect();
  });

  browser.action.onClicked.addListener(() => {
    browser.tabs.create({ url: browser.runtime.getURL('chat.html') });
  });

  console.log('[Background] RPC server ready, capabilities:', capabilityDetector.detect());
});
