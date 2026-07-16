import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/** Last-resort catch so a render crash shows a recovery screen instead of a blank page. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg-primary text-text-primary p-6">
        <div className="max-w-sm w-full text-center rounded-2xl border border-border/60 bg-bg-secondary/80 p-8">
          <p className="text-4xl mb-4" aria-hidden>
            ⚠️
          </p>
          <h1 className="text-lg font-semibold mb-2">Something went wrong</h1>
          <p className="text-sm text-text-secondary mb-6">
            Your trades are safe. Reload the page to keep journaling — if this keeps happening,
            report it from the Report a bug page.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 py-2.5 text-sm font-medium hover:bg-emerald-500/25 transition-colors"
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
