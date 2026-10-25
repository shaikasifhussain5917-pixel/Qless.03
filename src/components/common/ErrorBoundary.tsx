import { Component, ErrorInfo, ReactNode } from "react";
import { IcAlert } from "./Icons";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Standard Application Error Boundary
 * Catches unexpected render-time errors gracefully without crashing the entire UI.
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("QLess Uncaught Error:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.hash = "#/";
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center bg-[#F9FAFB] text-[#0F2044]">
          <div className="w-full max-w-[460px] rounded-3xl border border-black/10 bg-white p-6 sm:p-8 shadow-xl space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-600 border border-red-200">
              <IcAlert />
            </div>

            <h2 className="font-poppins text-xl font-bold tracking-tight text-[#0F2044]">
              Something Went Wrong
            </h2>

            <p className="text-xs text-[#7A8493] leading-relaxed">
              An unexpected application error occurred while rendering this view. Your saved order history remains secure in local storage.
            </p>

            <div className="pt-2 flex flex-col sm:flex-row gap-2.5 justify-center">
              <button
                type="button"
                onClick={this.handleReset}
                className="rounded-xl bg-[#2E9E44] px-5 py-2.5 font-poppins text-xs font-semibold text-white shadow-sm hover:bg-[#288B3B] transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E9E44]"
              >
                Reload &amp; Return to Store
              </button>
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, error: null })}
                className="rounded-xl border border-black/10 bg-white px-4 py-2.5 font-poppins text-xs font-semibold text-[#0F2044] hover:bg-[#F8F9FA] transition"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
