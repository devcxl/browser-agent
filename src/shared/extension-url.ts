/**
 * 扩展内资源 URL。
 *
 * WXT 会把 `browser.runtime.getURL` 的入参收窄成 `PublicPath` 字面量，
 * 而这些字面量都带前导斜杠（`'/sidepanel.html'`）。但该函数运行时就是
 * 直接转给 `chrome.runtime.getURL`，后者把 path 原样拼到
 * `chrome-extension://<id>/` 之后——带前导斜杠会拼出
 * `chrome-extension://<id>//sidepanel.html`，请求路径变成 `//sidepanel.html`
 * 而 404（见 `panel.test.ts` 对 iframe.src 的断言）。
 *
 * 所以这里按原生签名（`path: string`）调用，传不带前导斜杠的路径。
 */
export function extensionUrl(path: string): string {
  const getURL = browser.runtime.getURL as unknown as (path: string) => string;
  return getURL(path);
}
