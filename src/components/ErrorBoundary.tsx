import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logErrorToSupabase, FRIENDLY_ERROR_MESSAGE } from '../lib/error-logging';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
    logErrorToSupabase(error, 'rendering', 'global');
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-surface p-4">
          <div className="max-w-md w-full glass-morphism p-8 text-center space-y-6 rounded-[2rem] border border-error/20">
            <div className="w-20 h-20 bg-error/10 text-error rounded-full flex items-center justify-center mx-auto animate-pulse">
              <AlertCircle size={40} />
            </div>
            
            <div className="space-y-2">
              <h1 className="text-xl font-black text-on-surface uppercase tracking-tight">Đã xảy ra lỗi</h1>
              <p className="text-secondary text-sm leading-relaxed">
                {FRIENDLY_ERROR_MESSAGE}
              </p>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-primary text-white rounded-2xl font-black shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw size={20} />
              TẢI LẠI TRANG
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
