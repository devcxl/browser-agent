/**
 * 浮动组件内置文案模块。
 * 零 DOM / 浏览器 API 依赖，所有函数可在 Node.js 环境运行。
 * 支持简体中文（zh-CN）和英文（en）两套文案。
 */

/** 浮动组件所有 UI 字面量接口 */
export interface FloatingWidgetStrings {
  /** 浮动按钮的 aria-label */
  buttonAriaLabel: string;
  /** 菜单项：在此站点隐藏 */
  hideOnThisSite: string;
  /** 菜单项：关闭面板 */
  closePanel: string;
  /** 面板加载失败提示 */
  loadError: string;
  /** 面板标题 */
  panelTitle: string;
}

/** 简体中文字面量 */
const zhCN: FloatingWidgetStrings = {
  buttonAriaLabel: '打开聊天',
  hideOnThisSite: '在此站点隐藏',
  closePanel: '关闭面板',
  loadError: '加载失败，请稍后重试',
  panelTitle: 'AI 助手',
};

/** 英文字面量 */
const en: FloatingWidgetStrings = {
  buttonAriaLabel: 'Open chat',
  hideOnThisSite: 'Hide on this site',
  closePanel: 'Close panel',
  loadError: 'Failed to load, please try again later',
  panelTitle: 'AI Assistant',
};

/** 支持的语言 */
export type SupportedLang = 'zh-CN' | 'en';

const STRINGS_MAP: Record<SupportedLang, FloatingWidgetStrings> = {
  'zh-CN': zhCN,
  'en': en,
};

/**
 * 根据语言获取对应文案。
 * @param lang 语言标识
 * @returns 对应语言的 FloatingWidgetStrings 字面量对象（每次返回新引用）
 */
export function getStrings(lang: SupportedLang): FloatingWidgetStrings {
  return { ...STRINGS_MAP[lang] };
}
