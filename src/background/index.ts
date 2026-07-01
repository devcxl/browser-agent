import type { JsonRpcRequest, JsonRpcResponse, BrowserState } from '@/shared/types';
import { JsonRpcRouter } from './jsonrpc-router';
import { TabsProxy } from './proxies/tabs-proxy';
import { WindowsProxy } from './proxies/windows-proxy';
import { GroupsProxy } from './proxies/groups-proxy';
import { HistoryProxy } from './proxies/history-proxy';
import { BookmarksProxy } from './proxies/bookmarks-proxy';
import { DownloadsProxy } from './proxies/downloads-proxy';
import { CookiesProxy } from './proxies/cookies-proxy';
import { SessionsProxy } from './proxies/sessions-proxy';
import { StorageProxy } from './proxies/storage-proxy';
import { BrowserEventHub } from './browser-event-hub';
import { CapabilityDetector } from './capability-detector';
import { ContentBridge } from './content-bridge';
import { ManagementProxy } from './proxies/management-proxy';
import { PrivacyProxy } from './proxies/privacy-proxy';
import { ProxySettingsProxy } from './proxies/proxy-proxy';
import { DebuggerProxy } from './proxies/debugger-proxy';
import { DnrProxy } from './proxies/dnr-proxy';
import { IdentityProxy } from './proxies/identity-proxy';
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
  const historyProxy = new HistoryProxy(adapter);
  const bookmarksProxy = new BookmarksProxy(adapter);
  const downloadsProxy = new DownloadsProxy(adapter);
  const cookiesProxy = new CookiesProxy(adapter);
  const sessionsProxy = new SessionsProxy(adapter);
  const storageProxy = new StorageProxy(adapter);
  const eventHub = new BrowserEventHub(adapter);
  const capabilityDetector = new CapabilityDetector(adapter);
  const contentBridge = new ContentBridge();
  const managementProxy = new ManagementProxy(adapter);
  const privacyProxy = new PrivacyProxy(adapter);
  const proxySettingsProxy = new ProxySettingsProxy(adapter);
  const debuggerProxy = new DebuggerProxy(adapter);
  const dnrProxy = new DnrProxy(adapter);
  const identityProxy = new IdentityProxy(adapter);

  const resolveContentTabId = async (tabId: unknown): Promise<number> => {
    if (typeof tabId === 'number') return tabId;

    const tabs = await adapter.tabs.query({ active: true, currentWindow: true });
    const activeTabId = tabs[0]?.id;
    if (typeof activeTabId !== 'number') {
      throw new Error('无法确定当前活动标签页');
    }
    return activeTabId;
  };

  // ── Tabs ────────────────────────────────────────────
  router.register('tabs.query', (p) => tabsProxy.query(p as any));
  router.register('tabs.get', (p) => tabsProxy.get(p as any));
  router.register('tabs.create', (p) => tabsProxy.create(p as any));
  router.register('tabs.update', (p) => tabsProxy.update(p as any));
  router.register('tabs.remove', (p) => tabsProxy.remove(p as any));
  router.register('tabs.move', (p) => tabsProxy.move(p as any));
  router.register('tabs.group', (p) => tabsProxy.group(p as any));
  router.register('tabs.ungroup', (p) => tabsProxy.ungroup(p as any));

  // ── Windows ─────────────────────────────────────────
  router.register('windows.getAll', (p) => windowsProxy.getAll(p as any));
  router.register('windows.get', (p) => windowsProxy.get(p as any));
  router.register('windows.create', (p) => windowsProxy.create(p as any));
  router.register('windows.remove', (p) => windowsProxy.remove(p as any));

  // ── TabGroups ───────────────────────────────────────
  router.register('tabGroups.query', (p) => groupsProxy.query(p as any));
  router.register('tabGroups.update', (p) => groupsProxy.update(p as any));

  // ── History ─────────────────────────────────────────
  router.register('history.search', (p) => historyProxy.search(p as any));
  router.register('history.delete', (p) => historyProxy.delete(p as any));
  router.register('history.deleteAll', () => historyProxy.deleteAll());

  // ── Bookmarks ───────────────────────────────────────
  router.register('bookmarks.search', (p) => bookmarksProxy.search(p as any));
  router.register('bookmarks.create', (p) => bookmarksProxy.create(p as any));
  router.register('bookmarks.update', (p) => bookmarksProxy.update(p as any));
  router.register('bookmarks.delete', (p) => bookmarksProxy.remove(p as any));
  router.register('bookmarks.getTree', () => bookmarksProxy.getTree());

  // ── Downloads ───────────────────────────────────────
  router.register('downloads.search', (p) => downloadsProxy.search(p as any));
  router.register('downloads.download', (p) => downloadsProxy.download(p as any));
  router.register('downloads.erase', (p) => downloadsProxy.erase(p as any));
  router.register('downloads.open', (p) => downloadsProxy.open(p as any));
  router.register('downloads.cancel', (p) => downloadsProxy.cancel(p as any));
  router.register('downloads.pause', (p) => downloadsProxy.pause(p as any));
  router.register('downloads.resume', (p) => downloadsProxy.resume(p as any));

  // ── Cookies ─────────────────────────────────────────
  router.register('cookies.get', (p) => cookiesProxy.get(p as any));
  router.register('cookies.getAll', (p) => cookiesProxy.getAll(p as any));
  router.register('cookies.set', (p) => cookiesProxy.set(p as any));
  router.register('cookies.remove', (p) => cookiesProxy.remove(p as any));
  router.register('cookies.getAllCookieStores', () => cookiesProxy.getAllCookieStores());

  // ── Sessions ────────────────────────────────────────
  router.register('sessions.save', () => sessionsProxy.save());
  router.register('sessions.restore', (p) => sessionsProxy.restore(p as any));
  router.register('sessions.list', (p) => sessionsProxy.list(p as any));
  router.register('sessions.delete', (p) => sessionsProxy.delete(p as any));

  // ── Storage ─────────────────────────────────────────
  router.register('storage.local.get', (p) => storageProxy.get(p as any));
  router.register('storage.local.set', (p) => storageProxy.set(p as any));
  router.register('storage.local.remove', (p) => storageProxy.remove(p as any));

  // ── Notifications ───────────────────────────────────
  router.register('notifications.create', (p) => adapter.notifications.create(p as any));

  // ── Capability & Content ────────────────────────────
  router.register('capability.detect', async () => capabilityDetector.detect());
  router.register('content.execute', async (p) => {
    const params = p as any;
    const tabId = await resolveContentTabId(params.tabId);
    return contentBridge.sendToContent(tabId, params.method, params.params);
  });

  // ── Screenshot ──────────────────────────────────────
  router.register('tabs.captureScreenshot', async (p) => {
    const params = p as any;
    const format = (params.format ?? 'png') as 'png' | 'jpeg';
    const quality = params.quality as number | undefined;

    const tabs = await adapter.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.windowId) {
      return { success: false, error: '未找到当前活动标签页' };
    }

    const dataUrl = await (browser.tabs as any).captureVisibleTab(tab.windowId, { format, quality });
    return { success: true, data: dataUrl };
  });

  // ── Markdown Viewer ─────────────────────────────────
  router.register('page.viewMarkdown', async (p) => {
    const params = p as any;
    const markdown = params.markdown as string;

    const viewId = crypto.randomUUID();
    await adapter.storage.local.set({ [`markdown:${viewId}`]: markdown });

    const url = (browser.runtime as any).getURL(`markdown-viewer.html?viewId=${viewId}`);
    await adapter.tabs.create({ url, active: true });

    return { success: true, data: { viewId, url } };
  });

  // ── Expert: Management ─────────────────────────────
  router.register('management.getAll', () => managementProxy.getAll());
  router.register('management.get', (p) => managementProxy.get(p as any));
  router.register('management.setEnabled', (p) => managementProxy.setEnabled(p as any));

  // ── Expert: Privacy ────────────────────────────────
  router.register('privacy.getNetworkSettings', () => privacyProxy.getNetworkSettings());
  router.register('privacy.setNetworkSetting', (p) => privacyProxy.setNetworkSetting(p as any));

  // ── Expert: Proxy ──────────────────────────────────
  router.register('proxy.getSettings', () => proxySettingsProxy.getSettings());
  router.register('proxy.setSettings', (p) => proxySettingsProxy.setSettings(p as any));
  router.register('proxy.clear', () => proxySettingsProxy.clear());

  // ── Expert: Debugger ──────────────────────────────
  router.register('debugger.getTargets', () => debuggerProxy.getTargets());
  router.register('debugger.attach', (p) => debuggerProxy.attach(p as any));
  router.register('debugger.detach', (p) => debuggerProxy.detach(p as any));

  // ── Expert: DeclarativeNetRequest ─────────────────
  router.register('dnr.getDynamicRules', () => dnrProxy.getDynamicRules());
  router.register('dnr.addDynamicRules', (p) => dnrProxy.addDynamicRules(p as any));
  router.register('dnr.removeDynamicRules', (p) => dnrProxy.removeDynamicRules(p as any));

  // ── Expert: Identity ──────────────────────────────
  router.register('identity.getAuthToken', (p) => identityProxy.getAuthToken(p as any));
  router.register('identity.clearCachedToken', (p) => identityProxy.clearCachedToken(p as any));

  // 管理已连接的 Chat Page Port
  const connectedPorts = new Set<ReturnType<typeof browser.runtime.connect>>();

  // 监听 Chat Page 连接
  const onConnectHandler = (port: { onMessage: { addListener: (fn: any) => void }; onDisconnect: { addListener: (fn: any) => void }; postMessage: (msg: unknown) => void; name: string }) => {
    // 只处理 Chat Agent 的连接
    if (port.name !== 'chat-agent') return;

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
