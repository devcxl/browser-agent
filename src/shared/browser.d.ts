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

declare namespace browser {
  const runtime: typeof browser.runtime;
}
