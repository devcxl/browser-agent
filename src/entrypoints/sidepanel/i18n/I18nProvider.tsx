import React, { createContext, useState, useEffect, useCallback } from 'react';
import type { Locale, MessageSchema, I18nContextValue } from './types';
import type { StorageSchema } from '@/shared/types';
import { ConfigStore } from '@/shared/storage';
import zhCN from '../locales/zh-CN.json';
import en from '../locales/en.json';

const messagesMap: Record<Locale, MessageSchema> = {
  'zh-CN': zhCN as MessageSchema,
  'en': en as MessageSchema,
};

export const I18nContext = createContext<I18nContextValue | null>(null);

function resolveMessage(obj: Record<string, unknown>, key: string): string {
  const keys = key.split('.');
  let current: unknown = obj;
  for (const k of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      // eslint-disable-next-line no-console
      console.warn(`[i18n] key "${key}" not found (intermediate "${k}" is not an object)`);
      return key;
    }
      current = (current as Record<string, unknown>)[k];
    }
    if (typeof current !== 'string') {
      // eslint-disable-next-line no-console
      console.warn(`[i18n] key "${key}" not found or not a string`);
      return key;
    }
    return current;
  }

  function applyVars(template: string, vars?: Record<string, string | number>): string {
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (_, key: string) => {
      if (vars[key] === undefined) {
        // eslint-disable-next-line no-console
        console.warn(`[i18n] variable "{${key}}" not provided`);
        return `{${key}}`;
      }
      return String(vars[key]);
    });
  }

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('zh-CN');
  const [messages, setMessages] = useState<MessageSchema>(messagesMap['zh-CN']);

  // 初始从 ConfigStore 读取
  useEffect(() => {
    ConfigStore.getInstance().get<StorageSchema['preferences']>('preferences').then((prefs) => {
      if (prefs.language && (prefs.language === 'zh-CN' || prefs.language === 'en')) {
        setLocaleState(prefs.language);
        setMessages(messagesMap[prefs.language]);
      }
    });
  }, []);

  // 监听 ConfigStore 变更（跨标签页同步）
  useEffect(() => {
    const unsub = ConfigStore.getInstance().onChange((changes: Partial<StorageSchema>) => {
      const prefs = changes.preferences;
      if (prefs?.language) {
        const lang = prefs.language as Locale;
        if (lang === 'zh-CN' || lang === 'en') {
          setLocaleState(lang);
          setMessages(messagesMap[lang]);
        }
      }
    });
    return unsub;
  }, []);

  const t = useCallback((key: string, vars?: Record<string, string | number>): string => {
    const template = resolveMessage(messages as unknown as Record<string, unknown>, key);
    return applyVars(template, vars);
  }, [messages]);

  const setLanguage = useCallback(async (lang: Locale) => {
    const store = ConfigStore.getInstance();
    const prefs = await store.get('preferences');
    await store.set('preferences', { ...prefs, language: lang });
    setLocaleState(lang);
    setMessages(messagesMap[lang]);
  }, []);

  return (
    <I18nContext.Provider value={{ locale, t, setLanguage }}>
      {children}
    </I18nContext.Provider>
  );
}
