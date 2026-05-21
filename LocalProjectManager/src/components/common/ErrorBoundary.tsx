import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional fallback UI; if omitted the default error card is shown */
  fallback?: ReactNode;
  /** Label shown in the error card (e.g. "Gantt Chart") */
  label?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Generic React Error Boundary with dark-theme styling.
 * Wrap each major view so a crash in one panel doesn't take down the whole app.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const tag = this.props.label ? `ErrorBoundary — ${this.props.label}` : 'ErrorBoundary';
    console.error(`[${tag}]`, error, info.componentStack);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const title = this.props.label
        ? `${this.props.label} 渲染出错`
        : '组件渲染出错';

      return (
        <div className="flex flex-col items-center justify-center h-full w-full p-8 select-none">
          <div className="max-w-md w-full bg-gray-800/60 border border-gray-700/50 rounded-xl p-6 backdrop-blur-sm shadow-lg">
            {/* Icon */}
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertTriangle size={20} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
                <p className="text-xs text-gray-500 mt-0.5">该区域遇到了意外错误</p>
              </div>
            </div>

            {/* Error message */}
            {this.state.error && (
              <div className="mb-4 p-3 rounded-lg bg-gray-900/50 border border-gray-700/30">
                <p className="text-xs text-gray-400 font-mono leading-relaxed break-all line-clamp-4">
                  {this.state.error.message}
                </p>
              </div>
            )}

            {/* Retry button */}
            <button
              onClick={this.handleRetry}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                         bg-gray-700/50 hover:bg-gray-700/80 border border-gray-600/30
                         text-sm text-gray-300 hover:text-gray-100
                         transition-all duration-200 active:scale-[0.98]"
            >
              <RefreshCw size={14} />
              重试
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
