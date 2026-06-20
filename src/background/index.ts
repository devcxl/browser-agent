import type { JsonRpcRequest, JsonRpcResponse, BrowserState } from '@/shared/types';
import { JsonRpcRouter } from './jsonrpc-router';
import { TabsProxy } from './proxies/tabs-proxy';
import { WindowsProxy } from './proxies/windows-proxy';
import { GroupsProxy } from './proxies/groups-proxy';
import { BrowserEventHub } from './browser-event-hub';
import { CapabilityDetector } from './capability-detector';
import { ContentBridge } from './content-bridge';
import { getAdapter } from '@/adapters';

export function initBackground(): {
  router: JsonRpcRouter;
  eventHub: BrowserEventHub;
  destroy: () => void;
} {
  const adapter = getAdapter();
  const router = new JsonRpcRouter();
  const tabsProxy = new TabsProxy(adapter);
  const windowsProxy = new WindowsProxy(adapter);
  const groupsProxy = new GroupsProxy(adapter);
  const eventHub = new BrowserEventHub(adapter);
  const capabilityDetector = new CapabilityDetector(adapter);
  const contentBridge = new ContentBridge();

  // 注册 RPC 方法
  router.register('tabs.query', (p) => tabsProxy.query(p as any));
  router.register('tabs.get', (p) => tabsProxy.get(p as any));
  router.register('tabs.create', (p) => tabsProxy.create(p as any));
  router.register('tabs.update', (p) => tabsProxy.update(p as any));
  router.register('tabs.remove', (p) => tabsProxy.remove(p as any));
  router.register('tabs.move', (p) => tabsProxy.move(p as any));
  router.register('tabs.group', (p) => tabsProxy.group(p as any));
  router.register('tabs.ungroup', (p) => tabsProxy.ungroup(p as any));

  router.register('windows.getAll', (p) => windowsProxy.getAll(p as any));
  router.register('windows.get', (p) => windowsProxy.get(p as any));
  router.register('windows.create', (p) => windowsProxy.create(p as any));
  router.register('windows.remove', (p) => windowsProxy.remove(p as any));

  router.register('tabGroups.query', (p) => groupsProxy.query(p as any));
  router.register('tabGroups.update', (p) => groupsProxy.update(p as any));

  router.register('capability.detect', () => capabilityDetector.detect());
  router.register('content.execute', (p) =>
    contentBridge.sendToContent(
      (p as any).tabId,
      (p as any).method,
      (p as any).params,
    ),
  );

  // 管理已连接的 Chat Page Port
  const connectedPorts = new Set<ReturnType<typeof browser.runtime.connect>>();

  // 监听 Chat Page 连接
  const onConnectHandler = (port: { onMessage: { addListener: (fn: any) => void }; onDisconnect: { addListener: (fn: any) => void }; postMessage: (msg: unknown) => void; name: string }) => {
    // 只处理 Chat Page 的连接
    if (port.name !== 'chat-page') return;

    connectedPorts.add(port as any);

    port.onMessage.addListener(async (message: unknown) => {
      const msg = message as JsonRpcRequest;
      if (msg.jsonrpc === '2.0' && msg.id !== undefined) {
        const response: JsonRpcResponse = await router.handle(msg);
        port.postMessage(response);
      }
    });

    port.onDisconnect.addListener(() => {
      connectedPorts.delete(port as any);
    });
  };

  browser.runtime.onConnect.addListener(onConnectHandler as any);

  // 事件推送：广播到所有已连接的 Chat Page
  eventHub.onStateChanged((state: BrowserState) => {
    const notification = {
      jsonrpc: '2.0',
      method: 'browser.stateChanged',
      params: { state },
    };
    for (const port of connectedPorts) {
      try {
        (port as any).postMessage(notification);
      } catch {
        connectedPorts.delete(port);
      }
    }
  });

  eventHub.start();

  return {
    router,
    eventHub,
    destroy: () => {
      eventHub.stop();
      browser.runtime.onConnect.removeListener(onConnectHandler as any);
      connectedPorts.clear();
    },
  };
}
