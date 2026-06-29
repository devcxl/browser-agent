import { useContext } from 'react';
import { I18nContext } from './I18nProvider';
import type { I18nContextValue } from './types';

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within an <I18nProvider>');
  }
  return ctx;
}
