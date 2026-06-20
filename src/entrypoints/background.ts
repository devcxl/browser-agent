import { initBackground } from '@/background/index';

export default defineBackground(() => {
  initBackground();

  browser.action.onClicked.addListener(() => {
    browser.tabs.create({ url: browser.runtime.getURL('chat.html') });
  });
});
