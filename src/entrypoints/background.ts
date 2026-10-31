import { initBackground } from '@/background/index';
import { extensionUrl } from '@/shared/extension-url';

export default defineBackground(() => {
  initBackground();

  browser.action.onClicked.addListener(() => {
    browser.tabs.create({ url: extensionUrl('sidepanel.html') });
  });
});
