import React, { Component, ReactNode } from 'react';
import { Button } from './Button';
import { logAppError } from '../services/errorLogger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  restaurantId?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class FloorplanErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[FloorplanErrorBoundary] Caught error:', error, errorInfo);
    this.setState({ errorInfo });
    logAppError({
      area: 'floorplan',
      event_type: 'floorplan_load_failed',
      restaurant_id: this.props.restaurantId,
      message: error.message,
      metadata: { component: 'FloorplanErrorBoundary' },
    });
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isDebug = typeof window !== 'undefined' &&
                     import.meta.env.DEV &&
                     new URLSearchParams(window.location.search).has('debug');

      return (
        <div className="w-full h-full flex items-center justify-center bg-gray-50 p-8">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-red-200 p-8">
            <div className="text-center">
              <div className="text-red-600 text-5xl mb-4">⚠</div>
              <h2 className="text-2xl font-bold text-slate-900 mb-3">
                Something Went Wrong
              </h2>
              <p className="text-slate-600 mb-6">
                We encountered an error while loading the floorplan. Please try reloading.
              </p>

              {isDebug && this.state.error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-left">
                  <div className="font-semibold text-red-800 text-sm mb-2">
                    Error Details:
                  </div>
                  <div className="text-xs font-mono text-red-700 break-all mb-3">
                    {this.state.error.message}
                  </div>
                  {this.state.errorInfo && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-red-700 hover:text-red-800">
                        Stack trace
                      </summary>
                      <pre className="mt-2 text-xs text-red-600 overflow-auto max-h-40">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              <Button onClick={this.handleReload} className="w-full">
                Reload
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
