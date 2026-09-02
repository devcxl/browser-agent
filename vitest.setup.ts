import 'fake-indexeddb/auto';
import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { createI18nMock } from './src/test/i18n-mock';

// 标准扩展 i18n（_locales + browser.i18n）无 Provider 可包裹，
// 在全局兜底 stub browser.i18n，供所有直接渲染组件的测试使用。
// 需要 browser.storage 的测试请用 test-utils 的 mockBrowserStorage（同样内置 i18n）。
vi.stubGlobal('browser', { i18n: createI18nMock() });
