import { useEffect, useRef } from "react";
import { IcAlert } from "./Icons";

interface ConfirmationModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary" | "warning";
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Reusable, Accessible Confirmation Dialog
 * Adheres to WAI-ARIA modal guidelines, keyboard Escape listener, and clear visual hierarchy.
 */
export function ConfirmationModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    // Focus confirm button when opened
    confirmBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmColorClasses =
    variant === "danger"
      ? "bg-red-600 hover:bg-red-700 text-white focus-visible:ring-red-500 shadow-xs"
      : variant === "warning"
      ? "bg-amber-600 hover:bg-amber-700 text-white focus-visible:ring-amber-500 shadow-xs"
      : "bg-[#0F2044] hover:bg-[#1A3163] text-white focus-visible:ring-[#0F2044] shadow-xs";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-description"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2044]/55 px-4 backdrop-blur-xs qless-fade-in"
      onMouseDown={onCancel}
    >
      <div
        className="w-full max-w-[420px] rounded-3xl bg-white p-6 shadow-2xl qless-scale-in space-y-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3.5">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
              variant === "danger"
                ? "bg-red-50 text-red-600 border border-red-200"
                : variant === "warning"
                ? "bg-amber-50 text-amber-600 border border-amber-200"
                : "bg-blue-50 text-[#0F2044] border border-blue-200"
            }`}
          >
            <IcAlert />
          </div>

          <div className="flex-1">
            <h3
              id="confirm-modal-title"
              className="font-poppins text-base font-bold text-[#0F2044]"
            >
              {title}
            </h3>
            <p
              id="confirm-modal-description"
              className="mt-1 text-xs text-[#7A8493] leading-relaxed"
            >
              {message}
            </p>
          </div>
        </div>

        <div className="pt-2 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-black/10 bg-white px-4 py-2.5 text-xs font-semibold text-[#0F2044] hover:bg-[#F8F9FA] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            className={`rounded-xl px-4 py-2.5 font-poppins text-xs font-semibold transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 ${confirmColorClasses}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
