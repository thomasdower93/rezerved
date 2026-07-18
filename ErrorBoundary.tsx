import React, { Component, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="w-full max-w-2xl mx-auto mt-8 p-6 bg-white rounded-lg shadow-sm border border-red-200">
          <div className="flex items-start gap-4">
            <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                Unable to Load Table Map
              </h3>
              <p className="text-slate-600 mb-4">
                We encountered an issue loading the table layout for this restaurant. This
                might be due to missing configuration or a temporary issue.
              </p>
              {import.meta.env.DEV && this.state.error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-xs font-mono text-red-800 overflow-auto">
                  {this.state.error.message}
                </div>
              )}
              <div className="flex gap-3">
                <Button onClick={this.handleReset}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retry
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
