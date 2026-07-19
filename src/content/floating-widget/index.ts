/**
 * 浮动控件入口模块。
 *
 * startFloatingWidget() 是 content script 侧唯一对外暴露的启动函数。
 * 负责读取配置、判定挂载条件、创建/销毁 FloatingWidget 实例、
 * 订阅 storage 变更以实现热挂载/热卸载。
 */

import { FloatingWidget } from './widget';
import { shouldMount } from './blacklist';
import { ConfigStore } from '@/shared/storage/config-store';
import type { FloatingButtonSettings, UserPreferences } from '@/shared/types/storage';
import type { SupportedLang } from './strings';

/** 全局唯一实例引用 */
let activeWidget: FloatingWidget | null = null;
/** storage onChange 取消订阅函数 */
let unsubscribe: (() => void) | null = null;
/** 位置写入防抖 timer */
let positionDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 启动浮动控件（仅在 content script 中调用）。
 * - 读取 floatingButtonSettings
 * - 调用 shouldMount() 判定是否挂载
 * - 挂载成功后订阅 storage.onChanged 实现热更新
 */
export async function startFloatingWidget(): Promise<void> {
  const store = ConfigStore.getInstance();
  const settings = await store.get<FloatingButtonSettings>('floatingButtonSettings');
  const prefs = await store.get<UserPreferences>('preferences');
  const hostname = window.location.hostname;
  const lang: SupportedLang = prefs.language === 'en' ? 'en' : 'zh-CN';

  // 首次判定
  if (!shouldMount(settings, hostname)) return;

  mountWidget(settings, hostname, lang);

  // 订阅 storage 变更
  unsubscribe = store.onChange((changes) => {
    const newSettings = changes.floatingButtonSettings;
    const newPrefs = changes.preferences;

    // 语言变更：更新已挂载 widget（仅 prefs 变化时）
    if (newPrefs && !newSettings && activeWidget) {
      const newLang: SupportedLang = newPrefs.language === 'en' ? 'en' : 'zh-CN';
      activeWidget.setLang(newLang);
      return;
    }

    if (newSettings === undefined) return;

    if (activeWidget) {
      const newLang: SupportedLang = newPrefs?.language === 'en' ? 'en' : 'zh-CN';
      const stillAlive = activeWidget.apply(newSettings, newLang);
      if (!stillAlive) {
        // apply 内部已 destroy，置空引用后重新判断挂载
        activeWidget = null;
        if (shouldMount(newSettings, hostname)) {
          mountWidget(newSettings, hostname, newLang);
        }
      }
    } else {
      // 当前无实例但配置变更后应挂载
      if (shouldMount(newSettings, hostname)) {
        const newLang: SupportedLang = newPrefs?.language === 'en' ? 'en' : 'zh-CN';
        mountWidget(newSettings, hostname, newLang);
      }
    }
  });
}

/** 创建并挂载 FloatingWidget 实例 */
function mountWidget(settings: FloatingButtonSettings, hostname: string, lang: SupportedLang): void {
  if (activeWidget) {
    activeWidget.destroy();
    activeWidget = null;
  }

  activeWidget = new FloatingWidget(settings, hostname, lang);

  // 位置变更回调：防抖写入 storage
  activeWidget.setOnPositionChange((pos) => {
    if (positionDebounceTimer) clearTimeout(positionDebounceTimer);
    positionDebounceTimer = setTimeout(async () => {
      try {
        const current = await ConfigStore.getInstance().get<FloatingButtonSettings>('floatingButtonSettings');
        await ConfigStore.getInstance().set('floatingButtonSettings', {
          ...current,
          position: { side: pos.side, top: pos.top },
        });
      } catch {
        // 静默忽略写入错误（如 storage 不可用）
      }
    }, 300);
  });

  activeWidget.mount();
}

/**
 * 销毁浮动控件并清理所有监听（主要用于测试/卸载）。
 * 生产环境中由 FloatingWidget.destroy() 触发时会自动处理，
 * 此处作为扩展点暴露。
 */
export function stopFloatingWidget(): void {
  if (positionDebounceTimer) {
    clearTimeout(positionDebounceTimer);
    positionDebounceTimer = null;
  }

  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  if (activeWidget) {
    activeWidget.destroy();
    activeWidget = null;
  }
}
