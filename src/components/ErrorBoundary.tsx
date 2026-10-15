import React from 'react';

interface Props {
  children: React.ReactNode;
  /** Label shown in the fallback UI, e.g. "Safety Memory" */
  moduleName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Route/module-level Error Boundary.
 *
 * Without this, an uncaught render-time exception anywhere in a page
 * (e.g. calling .toLowerCase() on a null field from the API) causes React
 * to unmount the entire tree, which is why a single bad field previously
 * took down the whole app (sidebar included) instead of just the page.
 *
 * This boundary is placed around <Outlet /> in AppShell, so the sidebar,
 * header, and navigation stay mounted and usable even if the page content
 * throws. Logs the technical error to the console for debugging; never
 * exposes a raw stack trace to the user.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary]${this.props.moduleName ? ` ${this.props.moduleName}` : ''} caught:`, error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const name = this.props.moduleName || 'This module';
      return (
        <div className="flex flex-col items-center justify-center gap-space-md p-space-2xl rounded-xl bg-surface-container-low border border-error/40 text-center max-w-2xl mx-auto mt-space-2xl">
          <span className="material-symbols-outlined text-error text-[48px]">report</span>
          <h2 className="font-headline-md text-headline-md text-on-surface font-bold uppercase">
            {name} Error
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-md">
            The {name} module encountered an unexpected processing error. The rest of PRECURSOR-X is
            unaffected — you can retry or return to the dashboard.
          </p>
          <div className="flex items-center gap-space-sm mt-space-xs">
            <button
              onClick={this.handleRetry}
              className="px-space-md py-2 rounded-lg bg-primary-container text-on-primary-container font-label-code-sm text-label-code-sm font-semibold hover:bg-primary transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">refresh</span>
              <span>Retry</span>
            </button>
            <button
              onClick={() => {
                window.location.href = '/dashboard';
              }}
              className="px-space-md py-2 rounded-lg bg-surface-container-high text-on-surface hover:bg-surface-bright font-label-code-sm text-label-code-sm transition-colors"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
