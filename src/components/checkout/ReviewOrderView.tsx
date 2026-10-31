import { useMemo } from "react";
import { CartItem, Coupon, SupermarketStore } from "../../types";
import { calculateBill } from "../../utils/billing";
import { fmt } from "../../utils/formatters";
import { OrderReviewSection } from "./OrderReviewSection";
import { CouponSection } from "./CouponSection";
import { IcBack, IcCheck } from "../common/Icons";

interface ReviewOrderViewProps {
  items: CartItem[];
  selectedStore: SupermarketStore | null;
  sessionId: string;
  appliedCoupon: Coupon | null;
  onApplyCoupon: (coupon: Coupon) => void;
  onRemoveCoupon: () => void;
  onBackToCart: () => void;
  onProceedToPayment: () => void;
}

/**
 * ReviewOrderView — Dedicated Order Review & Coupon Application Screen
 * Part of modern customer flow: Cart → Review Order → Payment Page → Confirmation
 */
export function ReviewOrderView({
  items,
  selectedStore,
  sessionId,
  appliedCoupon,
  onApplyCoupon,
  onRemoveCoupon,
  onBackToCart,
  onProceedToPayment,
}: ReviewOrderViewProps) {
  const bill = useMemo(() => calculateBill(items, appliedCoupon), [items, appliedCoupon]);

  return (
    <div className="space-y-4 pb-28 qless-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
        <button
          type="button"
          onClick={onBackToCart}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-poppins text-xs font-semibold text-[#101828] transition hover:bg-slate-50 active:scale-95 shadow-2xs"
        >
          <IcBack /> Back to Cart
        </button>
        <span className="font-poppins text-xs font-bold text-[#667085]">
          Step 2 of 4 · Order Review
        </span>
      </div>

      <div>
        <h2 className="font-poppins text-xl font-bold tracking-tight text-[#101828]">
          Review Your Order
        </h2>
        <p className="mt-0.5 text-xs text-[#667085]">
          Verify your items and apply any promo coupons before choosing your payment method.
        </p>
      </div>

      {/* Item List & Calculations */}
      <OrderReviewSection
        bill={bill}
        selectedStore={selectedStore}
        sessionId={sessionId}
        onEditCart={onBackToCart}
      />

      {/* Coupon Application Section */}
      <CouponSection
        appliedCoupon={appliedCoupon}
        onApplyCoupon={onApplyCoupon}
        onRemoveCoupon={onRemoveCoupon}
        subtotal={bill.subtotal}
      />

      {/* Sticky Bottom Action Bar with Safe Area Support */}
      <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:px-4 sm:pb-4">
        <div className="mx-auto w-full max-w-[520px] rounded-2xl border border-slate-200/90 bg-white/95 p-3.5 sm:p-4 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur-xl">
          <div className="mb-2.5 flex items-baseline justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085] block leading-none">
                Total Payable
              </span>
              <span className="font-poppins text-xl sm:text-2xl font-extrabold text-[#101828]">
                {fmt(bill.finalTotal)}
              </span>
            </div>
            <span className="text-xs text-[#667085] bg-slate-50 border border-slate-200/60 rounded-full px-2.5 py-0.5">
              {bill.itemCount} {bill.itemCount === 1 ? "item" : "items"}
            </span>
          </div>

          <button
            type="button"
            onClick={onProceedToPayment}
            disabled={items.length === 0}
            className="flex h-12 sm:h-13 w-full items-center justify-center gap-2 rounded-xl bg-[#101828] font-poppins text-xs sm:text-sm font-bold text-white shadow-sm transition hover:scale-[1.01] hover:bg-slate-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#101828]"
          >
            <IcCheck /> Proceed to Payment — {fmt(bill.finalTotal)}
          </button>
        </div>
      </div>
    </div>
  );
}
