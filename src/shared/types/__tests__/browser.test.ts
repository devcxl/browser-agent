import { describe, it, expect } from 'vitest';
import type {
  Tab,
  Window,
  WindowType,
  WindowState,
  TabGroup,
  TabGroupColor,
  BrowserState,
  StateChanges,
  LowSensitivityContext,
  Capabilities,
  TabQueryInfo,
  TabCreateProperties,
  TabUpdateProperties,
  WindowGetInfo,
  WindowCreateData,
  WindowUpdateInfo,
  TabGroupQueryInfo,
  TabGroupUpdateProperties,
} from '../browser';

describe('Browser types', () => {
  describe('Tab', () => {
    it('should accept a valid tab object', () => {
      const tab: Tab = {
        id: 1,
        index: 0,
        windowId: 1,
        groupId: -1,
        title: 'Test',
        url: 'https://example.com',
        active: true,
        pinned: false,
        discarded: false,
        incognito: false,
        status: 'complete',
      };
      expect(tab.id).toBe(1);
      expect(tab.groupId).toBe(-1);
      expect(tab.active).toBe(true);
    });

    it('should allow optional fields to be omitted', () => {
      const tab: Tab = {
        index: 0,
        windowId: 1,
        groupId: 0,
        active: false,
        pinned: false,
        discarded: false,
        incognito: false,
      };
      expect(tab.title).toBeUndefined();
      expect(tab.url).toBeUndefined();
    });
  });

  describe('Window', () => {
    it('should accept a valid window object', () => {
      const win: Window = {
        id: 1,
        focused: true,
        incognito: false,
        alwaysOnTop: false,
        type: 'normal',
        state: 'normal',
      };
      expect(win.focused).toBe(true);
    });
  });

  describe('WindowType', () => {
    it('should only allow valid window types', () => {
      const types: WindowType[] = ['normal', 'popup', 'panel', 'devtools'];
      expect(types).toHaveLength(4);
    });
  });

  describe('WindowState', () => {
    it('should only allow valid window states', () => {
      const states: WindowState[] = ['normal', 'minimized', 'maximized', 'fullscreen'];
      expect(states).toHaveLength(4);
    });
  });

  describe('TabGroup', () => {
    it('should accept a valid tab group object', () => {
      const group: TabGroup = {
        id: 1,
        collapsed: false,
        color: 'blue',
        windowId: 1,
      };
      expect(group.color).toBe('blue');
    });
  });

  describe('TabGroupColor', () => {
    it('should only allow valid colors', () => {
      const colors: TabGroupColor[] = [
        'grey', 'blue', 'red', 'yellow',
        'green', 'pink', 'purple', 'cyan', 'orange',
      ];
      expect(colors).toHaveLength(9);
    });
  });

  describe('BrowserState', () => {
    it('should contain windows, tabs, tabGroups and capturedAt', () => {
      const state: BrowserState = {
        windows: [],
        tabs: [],
        tabGroups: [],
        capturedAt: Date.now(),
      };
      expect(state.capturedAt).toBeGreaterThan(0);
    });
  });

  describe('StateChanges', () => {
    it('should have all required array fields', () => {
      const changes: StateChanges = {
        addedTabs: [],
        removedTabs: [],
        updatedTabs: [],
        addedWindows: [],
        removedWindows: [],
        changedGroups: [],
      };
      expect(changes.addedTabs).toEqual([]);
    });
  });

  describe('LowSensitivityContext', () => {
    it('should accept a valid low sensitivity context', () => {
      const ctx: LowSensitivityContext = {
        currentWindow: {
          id: 1,
          tabs: [{
            title: 'Test',
            url: 'https://example.com',
            active: true,
            pinned: false,
            groupId: -1,
          }],
        },
        allWindows: [{
          id: 1,
          focused: true,
          tabCount: 1,
        }],
        tabGroups: [{
          id: 1,
          color: 'blue',
          tabCount: 1,
        }],
      };
      expect(ctx.currentWindow.tabs).toHaveLength(1);
    });
  });

  describe('Capabilities', () => {
    it('should have all 22 boolean fields', () => {
      const caps: Capabilities = {
        tabs: true,
        windows: true,
        tabGroups: true,
        bookmarks: true,
        history: true,
        downloads: true,
        cookies: true,
        sessions: true,
        scripting: true,
        clipboard: true,
        notifications: true,
        contextMenus: true,
        sidePanel: true,
        alarms: true,
        proxy: false,
        privacy: false,
        management: false,
        debugger: false,
        webRequest: false,
        declarativeNetRequest: false,
        nativeMessaging: false,
        identity: false,
      };
      const fields = Object.keys(caps) as (keyof Capabilities)[];
      expect(fields).toHaveLength(22);
    });
  });

  describe('TabQueryInfo', () => {
    it('should allow partial query', () => {
      const query: TabQueryInfo = { active: true, currentWindow: true };
      expect(query.active).toBe(true);
    });
  });

  describe('TabCreateProperties', () => {
    it('should accept create properties', () => {
      const props: TabCreateProperties = { url: 'https://example.com', active: true };
      expect(props.url).toBe('https://example.com');
    });
  });

  describe('TabUpdateProperties', () => {
    it('should accept update properties', () => {
      const props: TabUpdateProperties = { url: 'https://example.com', pinned: true };
      expect(props.pinned).toBe(true);
    });
  });

  describe('WindowGetInfo', () => {
    it('should accept window get info', () => {
      const info: WindowGetInfo = { populate: true };
      expect(info.populate).toBe(true);
    });
  });

  describe('WindowCreateData', () => {
    it('should accept window create data', () => {
      const data: WindowCreateData = { url: 'https://example.com', type: 'normal' };
      expect(data.url).toBe('https://example.com');
    });
  });

  describe('WindowUpdateInfo', () => {
    it('should accept window update info', () => {
      const info: WindowUpdateInfo = { focused: true, state: 'maximized' };
      expect(info.state).toBe('maximized');
    });
  });

  describe('TabGroupQueryInfo', () => {
    it('should accept group query', () => {
      const q: TabGroupQueryInfo = { color: 'red' };
      expect(q.color).toBe('red');
    });
  });

  describe('TabGroupUpdateProperties', () => {
    it('should accept group update', () => {
      const props: TabGroupUpdateProperties = { collapsed: true, color: 'green' };
      expect(props.collapsed).toBe(true);
    });
  });
});
