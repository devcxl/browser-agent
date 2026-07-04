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
      'tabGroups',
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

    permissions.push('privacy', 'proxy');

    if (isMv3) {
      permissions.push('scripting');
    }

    const optional_permissions: string[] = ['management'];

    if (!isFirefox) {
      permissions.push(
        'sidePanel',
        'notifications', 'contextMenus',
        'declarativeNetRequest',
      );
      optional_permissions.push(
        'clipboardRead', 'clipboardWrite',
        'debugger',
      );
    }

    const manifest: Record<string, unknown> = {
      name: 'Browser Agent',
      description: 'AI-powered browser agent extension - manage tabs, bookmarks, history, and more with natural language',
      permissions,
      optional_permissions,
      host_permissions: ['<all_urls>'],
    };

    if (isFirefox) {
      manifest.action = {
        default_title: 'Browser Agent',
      };
    } else {
      manifest.side_panel = { default_path: 'sidepanel.html' };
      manifest.action = {
        default_title: 'Browser Agent',
      };
    }

    manifest.icons = {
      16: 'logo-16.png',
      32: 'logo-32.png',
      48: 'logo-48.png',
      128: 'logo-128.png',
    };
    if (!isFirefox) {
      (manifest.action as Record<string, unknown>).default_icon = {
        16: 'logo-16.png',
        32: 'logo-32.png',
        48: 'logo-48.png',
        128: 'logo-128.png',
      };
    }

    return manifest;
  },

  hooks: {
    'build:manifestGenerated': (wxt, manifest) => {
      if (wxt.config.browser === 'firefox') {
        manifest.browser_specific_settings = {
          gecko: {
            id: 'browser-agent@devcxl.cn',
            strict_min_version: '128.0',
            data_collection_permissions: {
              required: ['none'],
            },
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
