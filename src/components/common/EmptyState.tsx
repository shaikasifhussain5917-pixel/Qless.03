import { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  emoji?: string;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: "primary" | "secondary";
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Standardized Reusable Empty State Component
 * Provides consistent visuals for empty carts, zero search results, missing receipts, and clear order history.
 */
export function EmptyState({
  icon,
  emoji,
  title,
  description,
  action,
  secondaryAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-white/60 bg-white/85 p-8 text-center shadow-sm backdrop-blur-md qless-fade-in my-auto w-full">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F6F7F8] border border-black/5 text-3xl mb-4 text-[#7A8493] shadow-inner">
        {emoji || icon || "🛍️"}
      </div>

      <h3 className="font-poppins text-lg font-bold text-[#0F2044]">
        {title}
      </h3>

      <p className="mt-1.5 text-xs text-[#7A8493] max-w-xs leading-relaxed">
        {description}
      </p>

      {(action || secondaryAction) && (
        <div className="mt-6 flex flex-col sm:flex-row gap-2.5 w-full max-w-xs justify-center">
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className={`flex-1 rounded-xl px-4 py-2.5 font-poppins text-xs font-semibold shadow-xs transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 ${
                action.variant === "secondary"
                  ? "border border-black/10 bg-white text-[#0F2044] hover:bg-[#F8F9FA] focus-visible:ring-slate-400"
                  : "bg-[#2E9E44] text-white hover:bg-[#288B3B] focus-visible:ring-[#2E9E44]"
              }`}
            >
              {action.label}
            </button>
          )}

          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="flex-1 rounded-xl border border-black/10 bg-white px-4 py-2.5 font-poppins text-xs font-semibold text-[#0F2044] hover:bg-[#F8F9FA] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
