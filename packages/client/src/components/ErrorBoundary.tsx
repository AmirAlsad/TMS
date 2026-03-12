import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallbackLabel?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center">
          <p className="text-sm font-medium text-red-500 dark:text-red-400">
            {this.props.fallbackLabel ?? 'Something went wrong'}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            {this.state.error?.message}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-3 px-3 py-1.5 text-xs font-semibold rounded-lg
                       bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400
                       hover:bg-indigo-100 dark:hover:bg-indigo-800/40 transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
