import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  outDir: 'dist',

  manifest: ({ browser }) => ({
    name: 'Browser Agent',
    description: 'AI-powered browser agent extension',
    permissions: [
      'tabs',
      'windows',
      'storage',
      'sessions',
      'scripting',
      'alarms',
      ...(browser === 'chrome'
        ? ['tabGroups', 'sidePanel', 'clipboardRead', 'clipboardWrite', 'notifications', 'contextMenus']
        : []),
    ],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'Browser Agent',
    },
    ...(browser === 'chrome'
      ? { side_panel: { default_path: 'sidepanel.html' } }
      : { browser_action: { default_title: 'Browser Agent' } }),
  }),

  vite: () => ({
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  }),
});
