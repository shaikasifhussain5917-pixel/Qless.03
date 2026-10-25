import { BillSummary } from "../../utils/billing";
import { fmt } from "../../utils/formatters";
import { SupermarketStore, PaymentMethod } from "../../types";

interface OrderReviewSectionProps {
  bill: BillSummary;
  selectedStore: SupermarketStore | null;
  sessionId: string;
  onEditCart: () => void;
  selectedMethod?: PaymentMethod;
}

export function OrderReviewSection({
  bill,
  selectedStore,
  sessionId,
  onEditCart,
  selectedMethod,
}: OrderReviewSectionProps) {
  return (
    <div className="rounded-2xl border border-white/60 bg-white/90 p-5 shadow-[0_8px_24px_rgba(15,32,68,0.08)] backdrop-blur-md">
      {/* Supermarket Header & Session ID */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: selectedStore?.brandColor || "#2E9E44" }}
            />
            <h3 className="font-poppins text-base font-bold text-[#0F2044]">
              {selectedStore?.name || "Supermarket"}
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-[#7A8493]">
            {selectedStore?.branch || "Self-Checkout Bay"} · Session #{sessionId}
          </p>
        </div>

        <button
          type="button"
          onClick={onEditCart}
          className="rounded-xl border border-black/5 bg-[#F8F9FA] px-3 py-1.5 text-xs font-semibold text-[#0F2044] transition hover:bg-[#EEF2F6] active:scale-95"
          aria-label="Return to cart to edit quantities"
        >
          Edit Cart
        </button>
      </div>

      {/* Item List with Package Sizes, MRP, and Line Totals */}
      <div className="divide-y divide-black/5 py-3">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#8A94A3]">
          Items ({bill.itemCount})
        </p>

        {bill.items.map((item) => {
          const lineTotal = item.price * item.quantity;
          const lineMrp = (item.mrp && item.mrp > item.price ? item.mrp : item.price) * item.quantity;
          const lineSavings = lineMrp - lineTotal;

          return (
            <div key={item.id} className="py-3 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="text-2xl shrink-0 pt-0.5" aria-hidden="true">
                  {item.emoji || "🛍️"}
                </span>
                <div className="min-w-0">
                  <h4 className="font-poppins text-sm font-semibold text-[#0F2044] truncate">
                    {item.name}
                  </h4>
                  <p className="text-xs text-[#7A8493] mt-0.5">
                    {item.unitSize ? `${item.unitSize} · ` : ""}
                    Qty {item.quantity} × {fmt(item.price)}
                  </p>
                  {lineSavings > 0 && (
                    <span className="inline-block mt-1 text-[10px] font-bold text-[#2E9E44] bg-[#EEF8F0] px-1.5 py-0.2 rounded">
                      Saved {fmt(lineSavings)}
                    </span>
                  )}
                </div>
              </div>

              <div className="text-right shrink-0">
                <p className="font-poppins text-sm font-bold text-[#0F2044]">
                  {fmt(lineTotal)}
                </p>
                {lineMrp > lineTotal && (
                  <p className="text-[11px] text-[#9AA3AF] line-through font-medium">
                    {fmt(lineMrp)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Calculation & Tax Breakdown */}
      <div className="border-t border-black/5 pt-4 space-y-2 text-xs">
        <div className="flex justify-between text-[#7A8493]">
          <span>Merchandise Subtotal</span>
          <span className="font-semibold text-[#0F2044]">{fmt(bill.subtotal)}</span>
        </div>

        {bill.mrpSavings > 0 && (
          <div className="flex justify-between text-[#2E9E44]">
            <span>Store MRP Discount</span>
            <span className="font-semibold">−{fmt(bill.mrpSavings)}</span>
          </div>
        )}

        {bill.couponDiscount > 0 && (
          <div className="flex justify-between text-[#2E9E44] bg-[#EEF8F0] p-2 rounded-xl">
            <span className="font-semibold">
              Coupon ({bill.appliedCoupon?.code})
            </span>
            <span className="font-bold">−{fmt(bill.couponDiscount)}</span>
          </div>
        )}

        {/* GST / Tax Breakdown */}
        <div className="rounded-xl border border-black/5 bg-[#F9FAFB] p-3 space-y-1.5 text-[11px]">
          <div className="flex justify-between font-semibold text-[#0F2044]">
            <span>Mock GST (5% Self-Checkout Demo Rate)</span>
            <span>+{fmt(bill.taxTotal)}</span>
          </div>
          <div className="flex justify-between text-[#7A8493] pl-2 border-l-2 border-[#2E9E44]/40">
            <span>Central GST (CGST @ 2.5%)</span>
            <span>{fmt(bill.cgst)}</span>
          </div>
          <div className="flex justify-between text-[#7A8493] pl-2 border-l-2 border-[#2E9E44]/40">
            <span>State GST (SGST @ 2.5%)</span>
            <span>{fmt(bill.sgst)}</span>
          </div>
          <p className="mt-1 text-[10px] text-[#8A94A3] italic pt-1 border-t border-black/5">
            *Demonstration tax rate calculated on net merchandise subtotal.
          </p>
        </div>

        {/* Final Payable Total */}
        <div className="border-t border-black/5 pt-3 flex justify-between items-baseline">
          <div>
            <p className="font-poppins text-xs font-bold uppercase tracking-wider text-[#8A94A3]">
              Final Payable Amount
            </p>
            <p className="text-[11px] text-[#7A8493]">Inclusive of all demo taxes</p>
          </div>
          <p className="font-poppins text-2xl font-extrabold text-[#0F2044]">
            {fmt(bill.finalTotal)}
          </p>
        </div>

        {/* Selected Payment Method Badge */}
        {selectedMethod && (
          <div className="mt-2 flex items-center justify-between rounded-xl border border-black/5 bg-[#F9FAFB] p-2.5 text-xs">
            <span className="text-[10px] font-bold text-[#7A8493] uppercase tracking-wider">
              Selected Payment Method
            </span>
            <span className="font-poppins text-xs font-bold text-[#0F2044] flex items-center gap-1.5">
              <span>
                {selectedMethod === "cash"
                  ? "💵"
                  : selectedMethod === "upi"
                  ? "⚡"
                  : selectedMethod === "card"
                  ? "💳"
                  : "👛"}
              </span>
              <span>
                {selectedMethod === "cash"
                  ? "Cash — Pay at Counter #03"
                  : selectedMethod === "upi"
                  ? "UPI (Razorpay Test Mode)"
                  : selectedMethod === "card"
                  ? "Card (Razorpay Test Mode)"
                  : "QLess Wallet"}
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
