import React from 'react';
import { translate } from '@/shared/i18n';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-sm text-danger">
          <p className="font-semibold mb-2">{translate('error.renderError')}</p>
          <pre className="whitespace-pre-wrap break-all text-xs text-mute">
            {this.state.error?.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
