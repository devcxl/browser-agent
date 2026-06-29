import React from 'react';
import { I18nContext } from './i18n/I18nProvider';
import type { I18nContextValue } from './i18n/types';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };
  static contextType = I18nContext;
  declare context: I18nContextValue;

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      const { t } = this.context;
      return (
        <div className="p-4 text-sm text-danger">
          <p className="font-semibold mb-2">{t('error.renderError')}</p>
          <pre className="whitespace-pre-wrap break-all text-xs text-mute">
            {this.state.error?.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
