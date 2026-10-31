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
    <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs">
      {/* Supermarket Header & Session ID */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: selectedStore?.brandColor || "#16A36A" }}
            />
            <h3 className="font-poppins text-base font-bold text-[#101828]">
              {selectedStore?.name || "Supermarket"}
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-[#667085]">
            {selectedStore?.branch || "Self-Checkout Bay"} · Session #{sessionId}
          </p>
        </div>

        <button
          type="button"
          onClick={onEditCart}
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#101828] transition hover:bg-slate-50 active:scale-95 shadow-2xs"
          aria-label="Return to cart to edit quantities"
        >
          Edit Cart
        </button>
      </div>

      {/* Item List with Package Sizes, MRP, and Line Totals */}
      <div className="divide-y divide-slate-100 py-3">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#667085]">
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
                  <h4 className="font-poppins text-sm font-bold text-[#101828] truncate">
                    {item.name}
                  </h4>
                  <p className="text-xs text-[#667085] mt-0.5">
                    {item.unitSize ? `${item.unitSize} · ` : ""}
                    Qty {item.quantity} × {fmt(item.price)}
                  </p>
                  {lineSavings > 0 && (
                    <span className="inline-block mt-1 text-[10px] font-bold text-[#16A36A] bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.2 rounded">
                      Saved {fmt(lineSavings)}
                    </span>
                  )}
                </div>
              </div>

              <div className="text-right shrink-0">
                <p className="font-poppins text-sm font-bold text-[#101828]">
                  {fmt(lineTotal)}
                </p>
                {lineMrp > lineTotal && (
                  <p className="text-[11px] text-slate-400 line-through font-medium">
                    {fmt(lineMrp)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Calculation & Tax Breakdown */}
      <div className="border-t border-slate-100 pt-4 space-y-2 text-xs">
        <div className="flex justify-between text-[#667085]">
          <span>Merchandise Subtotal</span>
          <span className="font-semibold text-[#101828]">{fmt(bill.subtotal)}</span>
        </div>

        {bill.mrpSavings > 0 && (
          <div className="flex justify-between items-center text-emerald-700 bg-emerald-50/70 px-2.5 py-1.5 rounded-xl border border-emerald-200/60 text-[11px]">
            <span className="font-medium">Total MRP Savings (Already Discounted)</span>
            <span className="font-bold">Saved {fmt(bill.mrpSavings)}</span>
          </div>
        )}

        {bill.couponDiscount > 0 && (
          <div className="flex justify-between text-[#16A36A] bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-200/60">
            <span className="font-semibold">
              Coupon ({bill.appliedCoupon?.code})
            </span>
            <span className="font-bold">−{fmt(bill.couponDiscount)}</span>
          </div>
        )}

        {/* Final Payable Total */}
        <div className="border-t border-slate-100 pt-3 flex justify-between items-baseline">
          <div>
            <p className="font-poppins text-xs font-bold uppercase tracking-wider text-[#667085]">
              Final Payable Amount
            </p>
          </div>
          <p className="font-poppins text-2xl font-extrabold text-[#101828]">
            {fmt(bill.finalTotal)}
          </p>
        </div>

        {/* Selected Payment Method Badge */}
        {selectedMethod && (
          <div className="mt-2 flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50 p-2.5 text-xs">
            <span className="text-[10px] font-bold text-[#667085] uppercase tracking-wider">
              Selected Payment Method
            </span>
            <span className="font-poppins text-xs font-bold text-[#101828] flex items-center gap-1.5">
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
