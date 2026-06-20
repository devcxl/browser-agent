import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  outDir: 'dist',

  manifest: ({ browser }) => ({
    name: 'Browser Agent',
    description: 'AI-powered browser agent extension - manage tabs, bookmarks, history, and more with natural language',
    version: '0.1.0',
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

  hooks: {
    'build:manifestGenerated': (wxt, manifest) => {
      if (wxt.config.browser === 'firefox') {
        manifest.browser_specific_settings = {
          gecko: {
            id: 'browser-agent@example.com',
            strict_min_version: '128.0',
          },
        };
      }
    },
  },

  vite: () => ({
    resolve: {
      alias: { '@': '/src' },
    },
    plugins: [tailwindcss()],
  }),
});
