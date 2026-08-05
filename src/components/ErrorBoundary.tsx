import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Catches render-time crashes so they show a message instead of a blank page.
 *
 * Without this, any thrown error during render unmounts the whole tree and
 * leaves an empty document — which looks identical to "the server isn't
 * running" and sends you debugging the wrong thing.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-xl space-y-4 rounded-lg bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-red-700">Something broke</h1>
          <p className="text-sm text-slate-700">
            An unexpected error stopped the page rendering. The full stack trace is in the
            browser console (F12).
          </p>
          <pre className="overflow-auto rounded-md bg-slate-900 p-4 text-xs text-slate-100">
            {error.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
          >
            Reload
          </button>
        </div>
      </main>
    );
  }
}
