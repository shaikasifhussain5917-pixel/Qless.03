import { useEffect, useRef } from "react";
import { parseStockError, type StockErrorItem } from "../../utils/stockErrorParser";

export { parseStockError, type StockErrorItem };

export interface StockErrorModalProps {
  open: boolean;
  items: StockErrorItem[];
  onReviewCart: () => void;
  onClose: () => void;
}

/**
 * Modern, professional Insufficient Stock Modal for QLess self-checkout.
 * Replaces large footer error banners with an accessible, high-clarity centered dialog.
 */
export function StockErrorModal({
  open,
  items,
  onReviewCart,
  onClose,
}: StockErrorModalProps) {
  const primaryBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    // Focus primary action on open
    primaryBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open || !items || items.length === 0) return null;

  const isMultiple = items.length > 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="stock-error-title"
      aria-describedby="stock-error-description"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2044]/60 px-4 py-6 backdrop-blur-xs qless-fade-in"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-[480px] rounded-3xl bg-white p-6 sm:p-7 shadow-2xl border border-slate-100 qless-scale-in text-center"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Warning Icon inside circular container */}
        <div className="mx-auto mb-3.5 flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-red-50 border border-red-100 text-red-600 shadow-2xs">
          <svg
            className="h-7 w-7 sm:h-8 sm:w-8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        {/* Heading */}
        <h3
          id="stock-error-title"
          className="font-poppins text-xl sm:text-2xl font-bold tracking-tight text-[#0F2044]"
        >
          Insufficient Stock
        </h3>

        {/* Clear, friendly explanation */}
        <p
          id="stock-error-description"
          className="mt-1.5 text-xs sm:text-sm text-[#7A8493] leading-relaxed max-w-sm mx-auto"
        >
          We couldn&apos;t complete your order because the requested quantity is not available.
        </p>

        {/* Product Details Display */}
        {!isMultiple ? (
          // Single Product Layout
          <div className="mt-5 rounded-2xl bg-[#F8F9FA] border border-slate-200/80 p-4 text-left space-y-3">
            <div>
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#7A8493]">
                Product
              </span>
              <p className="font-poppins text-sm sm:text-base font-bold text-[#0F2044] leading-snug mt-0.5">
                {items[0].productName}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1 border-t border-slate-200/60">
              <div className="rounded-xl bg-white border border-slate-200/80 p-2.5 text-center shadow-2xs">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#7A8493]">
                  Available Stock
                </span>
                <span className={`block font-poppins text-base sm:text-lg font-bold mt-0.5 ${items[0].availableStock === 0 ? "text-red-600" : "text-[#0F2044]"}`}>
                  {items[0].availableStock}
                </span>
              </div>

              <div className="rounded-xl bg-white border border-slate-200/80 p-2.5 text-center shadow-2xs">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#7A8493]">
                  Requested Quantity
                </span>
                <span className="block font-poppins text-base sm:text-lg font-bold text-[#0F2044] mt-0.5">
                  {items[0].requestedQuantity}
                </span>
              </div>
            </div>
          </div>
        ) : (
          // Multiple Products Layout
          <div className="mt-5 space-y-2 text-left">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#7A8493] block px-1">
              Affected Products ({items.length})
            </span>
            <div className="max-h-[220px] overflow-y-auto space-y-2.5 pr-1">
              {items.map((item, idx) => (
                <div
                  key={`${item.productName}-${idx}`}
                  className="rounded-2xl bg-[#F8F9FA] border border-slate-200/80 p-3 space-y-2 shadow-2xs"
                >
                  <p className="font-poppins text-xs sm:text-sm font-bold text-[#0F2044] leading-snug">
                    {item.productName}
                  </p>
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/60">
                    <span className="text-slate-600">
                      Available:{" "}
                      <strong className={item.availableStock === 0 ? "text-red-600 font-bold" : "text-[#0F2044]"}>
                        {item.availableStock}
                      </strong>
                    </span>
                    <span className="text-slate-600">
                      Requested: <strong className="text-[#0F2044] font-bold">{item.requestedQuantity}</strong>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="mt-6 flex flex-col gap-2.5">
          <button
            ref={primaryBtnRef}
            type="button"
            onClick={onReviewCart}
            className="w-full flex h-11 sm:h-12 items-center justify-center rounded-xl bg-[#0F2044] font-poppins text-xs sm:text-sm font-semibold text-white shadow-md transition hover:bg-[#1A3163] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F2044]"
          >
            Review Cart
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full flex h-10 sm:h-11 items-center justify-center rounded-xl border border-slate-200 bg-white font-poppins text-xs sm:text-sm font-medium text-slate-700 transition hover:bg-slate-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
