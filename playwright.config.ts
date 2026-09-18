import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  retries: 1,
  use: {
    // 新 headless 模式支持加载扩展；headless shell 无法加载。
    // 因此依赖扩展的 e2e 必须使用 channel: 'chromium'（见下方 project）。
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chrome',
      use: {
        browserName: 'chromium',
        // 扩展加载需要完整 Chromium，headless shell 不支持 --load-extension
        channel: 'chromium',
      },
    },
  ],
});
