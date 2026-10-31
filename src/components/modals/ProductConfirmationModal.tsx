import { useState, useEffect } from "react";
import { Product, ProductLocation } from "../../types";
import { fmt } from "../../utils/formatters";
import { IcAdd, IcClose, IcAlert } from "../common/Icons";

interface ProductConfirmationModalProps {
  product: Product | null;
  location?: ProductLocation | null;
  open: boolean;
  onConfirm: (product: Product, quantity: number) => void;
  onCancel: () => void;
  sourceLabel?: string; // e.g. "Barcode Scanned", "Manual Match", "Catalog Item"
}

export function ProductConfirmationModal({
  product,
  location,
  open,
  onConfirm,
  onCancel,
  sourceLabel = "Product Found",
}: ProductConfirmationModalProps) {
  const [quantity, setQuantity] = useState(1);

  // Reset quantity when modal opens or product changes
  useEffect(() => {
    if (open) {
      setQuantity(1);
    }
  }, [open, product]);

  // Handle ESC key to dismiss
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onCancel]);

  if (!open || !product) return null;

  const isOutOfStock =
    product.isAvailable === false ||
    (product.stockQuantity !== undefined && product.stockQuantity <= 0);

  const totalPrice = product.price * quantity;
  const totalMrp = product.mrp ? product.mrp * quantity : undefined;
  const savings = totalMrp ? totalMrp - totalPrice : 0;

  const handleIncrement = () => {
    if (isOutOfStock) return;
    setQuantity((q) => {
      const maxAvailable = product.stockQuantity !== undefined ? Math.min(99, product.stockQuantity) : 99;
      return Math.min(q + 1, maxAvailable);
    });
  };

  const handleDecrement = () => setQuantity((q) => Math.max(q - 1, 1));

  const handleAdd = () => {
    if (isOutOfStock) return;
    onConfirm(product, quantity);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#0F2044]/50 px-0 sm:px-4 backdrop-blur-xs qless-fade-in"
      onMouseDown={onCancel}
    >
      <div
        className="w-full max-w-[440px] rounded-t-3xl sm:rounded-3xl bg-white p-4 sm:p-6 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] shadow-[0_-16px_60px_rgba(15,32,68,0.25)] sm:shadow-[0_24px_70px_rgba(15,32,68,0.2)] qless-bottom-sheet sm:qless-scale-in"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="confirm-product-title"
        aria-modal="true"
      >
        {/* Mobile top handle */}
        <div className="flex justify-center pb-2.5 sm:hidden">
          <div className="h-1.5 w-12 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between pb-2.5 sm:pb-3 border-b border-black/5 gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0 flex-1 mr-1">
            <span className="rounded-full bg-[#EEF8F0] px-2.5 py-0.5 text-[10px] sm:text-[11px] font-bold text-[#2E9E44]">
              {sourceLabel}
            </span>
            {isOutOfStock ? (
              <span className="rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-red-700">
                Out of Stock
              </span>
            ) : product.discountBadge ? (
              <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-amber-800">
                {product.discountBadge}
              </span>
            ) : null}
          </div>
          <button
            onClick={onCancel}
            aria-label="Close confirmation"
            className="flex min-h-[44px] min-w-[44px] h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#7A8493] hover:bg-[#F6F7F8] hover:text-[#0F2044] transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-400 cursor-pointer"
          >
            <IcClose />
          </button>
        </div>

        {/* Product Visual & Identity */}
        <div className="py-3 sm:py-4">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="flex h-16 w-16 sm:h-20 sm:w-20 shrink-0 items-center justify-center rounded-2xl bg-[#F8F9FA] border border-black/5 text-3xl sm:text-4xl shadow-inner">
              {product.emoji}
            </div>

            <div className="min-w-0 flex-1">
              <h3
                id="confirm-product-title"
                className="font-poppins text-base sm:text-lg font-bold text-[#0F2044] leading-snug break-words"
              >
                {product.name}
              </h3>
              <p className="mt-0.5 text-[11px] sm:text-xs text-[#7A8493]">
                {product.category} {product.unitSize && `· ${product.unitSize}`}
              </p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-poppins text-lg sm:text-xl font-bold text-[#2E9E44]">
                  {fmt(product.price)}
                </span>
                {product.mrp && product.mrp > product.price && (
                  <span className="text-[11px] sm:text-xs text-[#9AA3AF] line-through font-medium">
                    {fmt(product.mrp)}
                  </span>
                )}
                <span className="text-[10px] sm:text-[11px] text-[#7A8493]">each</span>
              </div>
            </div>
          </div>

          {/* Out of Stock Warning Banner */}
          {isOutOfStock && (
            <div
              role="alert"
              className="mt-3.5 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 font-medium"
            >
              <IcAlert />
              <span>This product is currently unavailable and cannot be added to the shopping cart.</span>
            </div>
          )}

          {/* Barcode Tag */}
          <div className="mt-3.5 flex items-center justify-between rounded-xl bg-[#F9FAFB] border border-black/5 px-3 py-2 text-xs">
            <span className="text-[#7A8493]">Barcode</span>
            <span className="font-mono font-semibold text-[#0F2044] tracking-wider">
              {product.barcode}
            </span>
          </div>

          {/* SmartFind Location Info */}
          {location && (
            <div className="mt-2 flex items-center justify-between rounded-xl bg-blue-50/80 border border-blue-200/60 px-3 py-2 text-xs text-blue-900">
              <span className="font-semibold flex items-center gap-1.5">
                <span>📍</span>
                <span>Shelf Location</span>
              </span>
              <span className="font-poppins font-bold text-blue-950">
                Aisle {location.aisleCode} · Rack {location.rackCode} · Shelf {location.shelfCode}
              </span>
            </div>
          )}

          {product.description && (
            <p className="mt-2.5 text-xs text-[#7A8493] leading-relaxed">
              {product.description}
            </p>
          )}
        </div>

        {/* Quantity Controls & Line Total */}
        <div className="rounded-2xl border border-black/5 bg-[#F8F9FA] p-3.5 mb-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-[#0F2044] uppercase tracking-wider">
                Select Quantity
              </p>
              <p className="text-[11px] text-[#7A8493]">
                {fmt(product.price)} × {quantity}
              </p>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 rounded-2xl bg-white border border-black/10 p-1 shadow-xs">
              <button
                type="button"
                onClick={handleDecrement}
                disabled={quantity <= 1 || isOutOfStock}
                aria-label="Decrease quantity"
                className="flex min-h-[44px] min-w-[44px] h-11 w-11 items-center justify-center rounded-xl text-xl font-bold text-[#0F2044] transition hover:bg-[#F0F2F5] active:scale-95 disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2E9E44]"
              >
                −
              </button>
              <span className="min-w-[32px] text-center font-poppins text-base font-bold text-[#0F2044]">
                {quantity}
              </span>
              <button
                type="button"
                onClick={handleIncrement}
                disabled={isOutOfStock}
                aria-label="Increase quantity"
                className="flex min-h-[44px] min-w-[44px] h-11 w-11 items-center justify-center rounded-xl text-xl font-bold text-[#0F2044] transition hover:bg-[#F0F2F5] active:scale-95 disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2E9E44]"
              >
                +
              </button>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-black/5 flex items-center justify-between">
            <span className="text-xs font-semibold text-[#7A8493]">Line Total</span>
            <div className="text-right">
              <span className="font-poppins text-lg font-extrabold text-[#0F2044]">
                {fmt(totalPrice)}
              </span>
              {savings > 0 && !isOutOfStock && (
                <p className="text-[10px] font-semibold text-[#2E9E44]">
                  You save {fmt(savings)}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleAdd}
            disabled={isOutOfStock}
            className="flex min-h-[48px] h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#16A36A] font-poppins text-xs sm:text-sm font-bold text-white shadow-sm transition hover:bg-[#15803d] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:opacity-60 disabled:hover:scale-100 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16A36A]"
          >
            {isOutOfStock ? (
              <span>Out of Stock — Cannot Add</span>
            ) : (
              <>
                <IcAdd />
                <span>Add {quantity} to Cart · {fmt(totalPrice)}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="flex min-h-[44px] h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white font-poppins text-xs font-semibold text-[#667085] transition hover:bg-slate-50 hover:text-[#101828] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            Cancel / Scan Another Product
          </button>
        </div>
      </div>
    </div>
  );
}
