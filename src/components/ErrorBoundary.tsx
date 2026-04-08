import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw, Clock } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      let errorMessage = 'Đã xảy ra lỗi không mong muốn.';
      let isQuotaError = false;

      try {
        const parsedError = JSON.parse(this.state.error?.message || '{}');
        if (parsedError.userFriendlyMessage) {
          errorMessage = parsedError.userFriendlyMessage;
        }
        if (parsedError.error?.includes('Quota exceeded')) {
          isQuotaError = true;
        }
      } catch {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-surface-container-lowest p-6">
          <div className="max-w-md w-full bg-white rounded-[2.5rem] p-8 shadow-2xl shadow-primary/10 border border-primary/10 text-center">
            <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-6 ${isQuotaError ? 'bg-primary/10 text-primary' : 'bg-error-container text-error'}`}>
              {isQuotaError ? <Clock size={40} /> : <AlertTriangle size={40} />}
            </div>
            
            <h2 className="text-2xl font-black text-on-surface mb-4">
              {isQuotaError ? 'Hệ thống kho TMĐT - Hết lượt truy cập' : 'Ối! Có lỗi xảy ra'}
            </h2>
            
            <p className="text-secondary mb-8 font-medium leading-relaxed">
              {errorMessage}
            </p>

            <div className="space-y-3">
              <button
                onClick={this.handleReset}
                className="w-full py-4 bg-primary text-white rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <RefreshCcw size={20} />
                THỬ TẢI LẠI TRANG
              </button>
              
              <p className="text-[10px] text-secondary uppercase tracking-widest font-bold">
                {isQuotaError ? 'Hạn ngạch sẽ được làm mới sau 24h' : 'Vui lòng liên hệ quản trị viên nếu lỗi tiếp tục'}
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
