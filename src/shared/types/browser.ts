// ==================== Tab ====================

export interface Tab {
  id?: number;
  index: number;
  windowId: number;
  groupId: number;        // -1 表示未分组（chrome.tabGroups.TAB_GROUP_ID_NONE）
  openerTabId?: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
  active: boolean;
  pinned: boolean;
  audible?: boolean;
  mutedInfo?: { muted: boolean };
  discarded: boolean;
  status?: 'loading' | 'complete';
  incognito: boolean;
  width?: number;
  height?: number;
}

// ==================== Window ====================

export type WindowType = 'normal' | 'popup' | 'panel' | 'devtools';
export type WindowState = 'normal' | 'minimized' | 'maximized' | 'fullscreen';

export interface Window {
  id?: number;
  focused: boolean;
  top?: number;
  left?: number;
  width?: number;
  height?: number;
  incognito: boolean;
  type?: WindowType;
  state?: WindowState;
  alwaysOnTop: boolean;
  title?: string;
}

// ==================== TabGroup ====================

export type TabGroupColor =
  | 'grey' | 'blue' | 'red' | 'yellow'
  | 'green' | 'pink' | 'purple' | 'cyan' | 'orange';

export interface TabGroup {
  id: number;
  collapsed: boolean;
  color: TabGroupColor;
  title?: string;
  windowId: number;
}

// ==================== 浏览器状态 ====================

/** 完整浏览器状态（背景同步用） */
export interface BrowserState {
  windows: Window[];
  tabs: Tab[];
  tabGroups: TabGroup[];
  capturedAt: number;
}

/** 状态变更信息 */
export interface StateChanges {
  addedTabs: number[];
  removedTabs: number[];
  updatedTabs: number[];
  addedWindows: number[];
  removedWindows: number[];
  changedGroups: number[];
}

/** 低敏浏览器上下文，注入 LLM system prompt */
export interface LowSensitivityContext {
  currentWindow: {
    id?: number;
    tabs: Array<{
      id?: number;
      title: string;
      url: string;
      active: boolean;
      pinned: boolean;
      groupId: number;
    }>;
  };
  allWindows: Array<{
    id?: number;
    focused: boolean;
    tabCount: number;
    title?: string;
  }>;
  tabGroups: Array<{
    id: number;
    title?: string;
    color: TabGroupColor;
    tabCount: number;
  }>;
  activeTab?: {
    id?: number;
    title: string;
    url: string;
    windowId: number;
  };
}

// ==================== Capabilities ====================

/** 浏览器能力检测结果，覆盖 17 个能力域 */
export interface Capabilities {
  // 基础
  tabs: boolean;
  windows: boolean;
  tabGroups: boolean;
  bookmarks: boolean;
  history: boolean;
  downloads: boolean;
  cookies: boolean;
  sessions: boolean;
  scripting: boolean;
  clipboard: boolean;
  notifications: boolean;
  contextMenus: boolean;
  sidePanel: boolean;
  alarms: boolean;
  // Expert
  proxy: boolean;
  privacy: boolean;
  management: boolean;
  debugger: boolean;
  webRequest: boolean;
  declarativeNetRequest: boolean;
  nativeMessaging: boolean;
  identity: boolean;
}

// ==================== Tab 查询/创建/更新参数 ====================

export interface TabQueryInfo {
  active?: boolean;
  pinned?: boolean;
  audible?: boolean;
  muted?: boolean;
  highlighted?: boolean;
  discarded?: boolean;
  autoDiscardable?: boolean;
  currentWindow?: boolean;
  lastFocusedWindow?: boolean;
  status?: 'loading' | 'complete';
  title?: string;
  url?: string | string[];
  groupId?: number;
  windowId?: number;
  windowType?: WindowType;
  index?: number;
}

export interface TabCreateProperties {
  windowId?: number;
  index?: number;
  url?: string;
  active?: boolean;
  pinned?: boolean;
  openerTabId?: number;
}

export interface TabUpdateProperties {
  url?: string;
  active?: boolean;
  pinned?: boolean;
  muted?: boolean;
  openerTabId?: number;
  autoDiscardable?: boolean;
}

// ==================== Window 查询/创建/更新参数 ====================

export interface WindowGetInfo {
  populate?: boolean;
  windowTypes?: WindowType[];
}

export interface WindowCreateData {
  url?: string | string[];
  tabId?: number;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  focused?: boolean;
  incognito?: boolean;
  type?: WindowType;
  state?: WindowState;
}

export interface WindowUpdateInfo {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  focused?: boolean;
  drawAttention?: boolean;
  state?: WindowState;
}

// ==================== TabGroup 查询/更新参数 ====================

export interface TabGroupQueryInfo {
  collapsed?: boolean;
  title?: string;
  color?: TabGroupColor;
  windowId?: number;
}

export interface TabGroupUpdateProperties {
  collapsed?: boolean;
  title?: string;
  color?: TabGroupColor;
}

// ==================== History ====================

export interface HistoryItem {
  id: string;
  url?: string;
  title?: string;
  lastVisitTime?: number;
  visitCount?: number;
  typedCount?: number;
}

export interface HistorySearchParams {
  text: string;
  startTime?: number;
  endTime?: number;
  maxResults?: number;
}

export interface HistoryDeleteParams {
  url?: string;
  startTime?: number;
  endTime?: number;
}

// ==================== Notifications ====================

export interface NotificationsCreateOptions {
  type?: string;
  iconUrl?: string;
  title: string;
  message: string;
  priority?: number;
}

// ==================== Bookmarks ====================

export interface BookmarkSearchQuery {
  query?: string;
  url?: string;
  title?: string;
}

export interface BookmarkCreateArg {
  parentId?: string;
  index?: number;
  title?: string;
  url?: string;
}

export interface BookmarkChangesArg {
  title?: string;
  url?: string;
}

export interface BookmarkTreeNode {
  id: string;
  parentId?: string;
  index?: number;
  url?: string;
  title: string;
  dateAdded?: number;
  dateGroupModified?: number;
  children?: BookmarkTreeNode[];
}

// ==================== Downloads ====================

export interface DownloadQuery {
  query?: string;
  startedBefore?: number;
  startedAfter?: number;
  endedBefore?: number;
  endedAfter?: number;
  totalBytesGreater?: number;
  totalBytesLess?: number;
  filenameRegex?: string;
  urlRegex?: string;
  limit?: number;
  orderBy?: string;
  id?: number;
  exists?: boolean;
  filename?: string;
  state?: 'in_progress' | 'interrupted' | 'complete';
  danger?: string;
}

export interface DownloadOptions {
  url: string;
  filename?: string;
  conflictAction?: 'uniquify' | 'overwrite' | 'prompt';
  method?: 'GET' | 'POST';
  headers?: Array<{ name: string; value: string }>;
  body?: string;
  saveAs?: boolean;
}

export interface DownloadItem {
  id: number;
  url: string;
  filename: string;
  danger?: string;
  mime?: string;
  startTime: string;
  endTime?: string;
  state: 'in_progress' | 'interrupted' | 'complete';
  paused?: boolean;
  canResume?: boolean;
  error?: number;
  totalBytes: number;
  fileSize: number;
  exists: boolean;
  byExtensionId?: string;
  byExtensionName?: string;
}

// ==================== Cookies ====================

export interface CookieDetails {
  url: string;
  name: string;
  storeId?: string;
}

export interface CookieGetAllDetails {
  url?: string;
  domain?: string;
  name?: string;
  path?: string;
  secure?: boolean;
  session?: boolean;
  storeId?: string;
}

export interface CookieSetDetails {
  url: string;
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'no_restriction' | 'lax' | 'strict';
  expirationDate?: number;
  storeId?: string;
}

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'no_restriction' | 'lax' | 'strict';
  session: boolean;
  expirationDate?: number;
  storeId?: string;
}

export interface CookieStore {
  id: string;
  tabIds: number[];
}

// ==================== Sessions ====================

export interface SessionFilter {
  maxResults?: number;
}

export interface Session {
  lastModified: number;
  tab?: Tab;
  window?: Window;
}

// ==================== Storage ====================

export interface StorageGetParams {
  keys?: string | string[];
}

export interface StorageSetParams {
  items: Record<string, unknown>;
}

export interface StorageRemoveParams {
  keys?: string | string[];
}
