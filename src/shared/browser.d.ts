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
  function connectNative(application: string): Port;

  const onConnect: {
    addListener(callback: (port: Port) => void): void;
    removeListener(callback: (port: Port) => void): void;
  };
}

declare namespace browser.tabs {
  function query(queryInfo: Record<string, unknown>): Promise<any[]>;
  function get(tabId: number): Promise<any>;
  function create(createProperties: Record<string, unknown>): Promise<any>;
  function update(tabId: number, updateProperties: Record<string, unknown>): Promise<any>;
  function remove(tabIds: number | number[]): Promise<void>;
  function sendMessage(tabId: number, message: unknown): Promise<any>;
  function connect(tabId: number, connectInfo?: { name?: string }): browser.runtime.Port;
}

declare namespace browser.storage {
  interface StorageArea {
    get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
    set(items: Record<string, unknown>): Promise<void>;
    remove(keys: string | string[]): Promise<void>;
  }
  const local: StorageArea;
  const sync: StorageArea;
  const session: StorageArea;
}

declare namespace browser {
  const runtime: typeof browser.runtime;
  const tabs: typeof browser.tabs;
  const storage: typeof browser.storage;
}
