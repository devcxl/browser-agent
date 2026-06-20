import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  outDir: 'dist',

  manifest: ({ browser, manifestVersion }) => {
    const isFirefox = browser === 'firefox';
    const isMv3 = manifestVersion === 3;

    const permissions: string[] = [
      'tabs',
      'storage',
      'sessions',
      'alarms',
      'bookmarks',
      'downloads',
      'cookies',
      'history',
    ];

    if (!isFirefox) {
      permissions.push('windows');
    }

    if (isMv3) {
      permissions.push('scripting');
    }

    if (!isFirefox) {
      permissions.push(
        'tabGroups', 'sidePanel', 'clipboardRead', 'clipboardWrite',
        'notifications', 'contextMenus',
      );
    }

    const manifest: Record<string, unknown> = {
      name: 'Browser Agent',
      description: 'AI-powered browser agent extension - manage tabs, bookmarks, history, and more with natural language',
      version: '0.1.0',
      permissions,
      host_permissions: ['<all_urls>'],
      action: {
        default_title: 'Browser Agent',
      },
    };

    if (isFirefox) {
      manifest.action = {
        default_title: 'Browser Agent',
      };
    } else {
      manifest.side_panel = { default_path: 'sidepanel.html' };
    }

    return manifest;
  },

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
