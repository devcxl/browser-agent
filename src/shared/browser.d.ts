/**
 * webextension-polyfill 的 browser 全局声明
 * 由 WXT 在运行时注入，此处为 tsc 提供类型
 */
declare namespace browser.runtime {
  interface Port {
    name: string;
    disconnect(): void;
    postMessage(message: unknown): void;
    onMessage: {
      addListener(callback: (message: unknown, port: Port) => void): void;
      removeListener(callback: (message: unknown, port: Port) => void): void;
    };
    onDisconnect: {
      addListener(callback: (port: Port) => void): void;
      removeListener(callback: (port: Port) => void): void;
    };
  }

  function connect(connectInfo?: { name?: string }): Port;
  const onConnect: {
    addListener(callback: (port: Port) => void): void;
    removeListener(callback: (port: Port) => void): void;
  };
}

declare namespace browser.tabs {
  function sendMessage(tabId: number, message: unknown): Promise<unknown>;
}

declare namespace browser.notifications {
  // present if notifications API is available
}

declare namespace browser.contextMenus {
  // present if contextMenus API is available
}

declare namespace browser.alarms {
  // present if alarms API is available
}

declare namespace browser.webRequest {
  // present if webRequest API is available
}

declare namespace browser {
  const runtime: typeof browser.runtime;
  const tabs: typeof browser.tabs;
  const notifications: typeof browser.notifications | undefined;
  const contextMenus: typeof browser.contextMenus | undefined;
  const alarms: typeof browser.alarms | undefined;
  const webRequest: typeof browser.webRequest | undefined;
}
