import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onRetry?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  retryCount: number;
}

export class DataErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
      errorInfo: null,
      retryCount: 0,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ApexChart Error Boundary caught:", error, errorInfo);
    this.setState({ errorInfo });
    
    // Notify parent handler if provided
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    const maxRetries = 5;
    const { retryCount } = this.state;

    if (retryCount >= maxRetries) {
      console.warn("Max retry attempts reached");
      return;
    }

    this.setState((prev) => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prev.retryCount + 1,
    }));

    // Retry logic - trigger a refresh
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      const { error, retryCount } = this.state;
      
      return (
        <div className="flex h-full items-center justify-center bg-gray-900 text-white">
          <div className="text-center">
            <p className="mb-2 text-red-500 font-semibold">
              {retryCount > 0 ? `加载失败 (${retryCount}/5)` : "图表加载失败"}
            </p>
            <p className="mb-4 text-sm text-gray-400">
              {error?.message || "未知错误"}
            </p>
            
            <button
              onClick={this.handleRetry}
              disabled={retryCount >= 5}
              className={`px-4 py-2 rounded ${
                retryCount >= 5
                  ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                  : "bg-blue-500 hover:bg-blue-600"
              }`}
            >
              {retryCount >= 5 ? "重试次数过多" : `重试 (${5 - retryCount})`}
            </button>
            
            {retryCount >= 5 && (
              <button
                onClick={() => window.location.reload()}
                className="ml-4 px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded"
              >
                刷新页面
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Higher-order component for easier usage
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options?: { onError?: (error: Error, info: ErrorInfo) => void; onRetry?: () => void }
) {
  return function WithErrorBoundary(props: P) {
    return (
      <DataErrorBoundary
        onError={options?.onError}
        onRetry={options?.onRetry}
      >
        <WrappedComponent {...props} />
      </DataErrorBoundary>
    );
  };
}
