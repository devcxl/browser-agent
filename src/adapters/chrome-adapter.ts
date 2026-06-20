import type {
  Tab,
  Window,
  TabGroup,
  TabQueryInfo,
  TabCreateProperties,
  TabUpdateProperties,
  WindowGetInfo,
  WindowCreateData,
  WindowUpdateInfo,
  TabGroupQueryInfo,
  TabGroupUpdateProperties,
} from '@/shared/types';
import type { IBrowserAdapter } from './types';
import { BrowserEvent } from './types';

/**
 * Chrome 浏览器适配器
 * 直接封装 chrome.tabs / chrome.windows / chrome.tabGroups API
 */
export class ChromeAdapter implements IBrowserAdapter {
  readonly browserType = 'chrome' as const;

  // ── Tabs ────────────────────────────────────────────

  tabs = {
    query: (queryInfo: TabQueryInfo): Promise<Tab[]> =>
      chrome.tabs.query(queryInfo) as Promise<Tab[]>,

    get: (tabId: number): Promise<Tab> =>
      chrome.tabs.get(tabId) as Promise<Tab>,

    create: (createProperties: TabCreateProperties): Promise<Tab> =>
      chrome.tabs.create(createProperties) as Promise<Tab>,

    update: (tabId: number, updateProperties: TabUpdateProperties): Promise<Tab> =>
      chrome.tabs.update(tabId, updateProperties) as Promise<Tab>,

    remove: (tabIds: number | number[]): Promise<void> =>
      (chrome.tabs.remove as any)(tabIds),

    move: (
      tabIds: number | number[],
      moveProperties: { windowId?: number; index: number },
    ): Promise<Tab | Tab[]> =>
      (chrome.tabs.move as any)(tabIds, moveProperties) as Promise<Tab | Tab[]>,

    group: (options: {
      tabIds: number | number[];
      groupId?: number;
      createProperties?: { windowId?: number };
    }): Promise<number> =>
      chrome.tabs.group(options),

    ungroup: (tabIds: number | number[]): Promise<void> =>
      chrome.tabs.ungroup(tabIds),

    getCurrent: (): Promise<Tab> =>
      chrome.tabs.getCurrent() as Promise<Tab>,

    reload: (tabId: number): Promise<void> =>
      chrome.tabs.reload(tabId),

    duplicate: (tabId: number): Promise<Tab> =>
      chrome.tabs.duplicate(tabId) as Promise<Tab>,

    highlight: (highlightInfo: { tabs: number[] | number; windowId?: number }): Promise<Window> =>
      chrome.tabs.highlight(highlightInfo) as Promise<Window>,
  };

  // ── Windows ─────────────────────────────────────────

  windows = {
    getAll: (getInfo?: WindowGetInfo): Promise<Window[]> =>
      (chrome.windows.getAll as any)(getInfo) as Promise<Window[]>,

    get: (windowId: number, getInfo?: WindowGetInfo): Promise<Window> =>
      (chrome.windows.get as any)(windowId, getInfo) as Promise<Window>,

    create: (createData?: WindowCreateData): Promise<Window> =>
      chrome.windows.create(createData as chrome.windows.CreateData) as Promise<Window>,

    update: (windowId: number, updateInfo: WindowUpdateInfo): Promise<Window> =>
      chrome.windows.update(windowId, updateInfo) as Promise<Window>,

    remove: (windowId: number): Promise<void> =>
      chrome.windows.remove(windowId),

    getCurrent: (getInfo?: WindowGetInfo): Promise<Window> =>
      (chrome.windows.getCurrent as any)(getInfo) as Promise<Window>,

    getLastFocused: (getInfo?: WindowGetInfo): Promise<Window> =>
      (chrome.windows.getLastFocused as any)(getInfo) as Promise<Window>,
  };

  // ── TabGroups ───────────────────────────────────────

  tabGroups = {
    query: (queryInfo: TabGroupQueryInfo): Promise<TabGroup[]> =>
      chrome.tabGroups.query(queryInfo) as Promise<TabGroup[]>,

    get: (groupId: number): Promise<TabGroup> =>
      chrome.tabGroups.get(groupId) as Promise<TabGroup>,

    update: (groupId: number, updateProperties: TabGroupUpdateProperties): Promise<TabGroup> =>
      chrome.tabGroups.update(groupId, updateProperties) as Promise<TabGroup>,

    move: (
      groupId: number,
      moveProperties: { windowId?: number; index: number },
    ): Promise<TabGroup> =>
      chrome.tabGroups.move(groupId, moveProperties) as Promise<TabGroup>,
  };

  // ── Event ───────────────────────────────────────────

  addListener(event: BrowserEvent, callback: (...args: any[]) => void): () => void {
    const api = this.resolveEventApi(event);
    api.addListener(callback);
    return () => api.removeListener(callback);
  }

  private resolveEventApi(event: BrowserEvent): chrome.events.Event<any> {
    const [namespace, eventName] = event.split('.') as [string, string];
    switch (namespace) {
      case 'tabs': return (chrome.tabs as any)[eventName];
      case 'windows': return (chrome.windows as any)[eventName];
      case 'tabGroups': return (chrome.tabGroups as any)[eventName];
      default:
        throw new Error(`Unknown event namespace: ${namespace}`);
    }
  }
}
