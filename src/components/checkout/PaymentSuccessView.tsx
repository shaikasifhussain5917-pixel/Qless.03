import { CompletedOrder } from "../../types";
import { fmt } from "../../utils/formatters";
import { IcCheck } from "../common/Icons";

interface PaymentSuccessViewProps {
  order: CompletedOrder;
  onContinueToReceipt: () => void;
}

export function PaymentSuccessView({
  order,
  onContinueToReceipt,
}: PaymentSuccessViewProps) {
  const isPending = order.paymentStatus === "PENDING";
  const isCash = order.paymentMethod === "cash";

  const methodLabel =
    order.paymentMethod === "cash"
      ? "Cash (Counter #03)"
      : order.paymentMethod === "upi"
      ? `UPI ${isPending ? "(Pending Settlement)" : "(Simulated)"}`
      : order.paymentMethod === "card"
      ? `Credit / Debit Card ${isPending ? "(Pending Settlement)" : "(Simulated)"}`
      : `QLess Smart Wallet ${isPending ? "(Pending Settlement)" : ""}`;

  return (
    <div className="flex flex-1 flex-col qless-fade-in pb-12 max-w-[480px] mx-auto w-full">
      {/* Success / Pending Hero */}
      <div className="text-center py-6">
        {isPending ? (
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-50 text-amber-700 shadow-[0_12px_28px_rgba(217,119,6,0.18)] ring-8 ring-amber-50/60">
            <span className="text-3xl">{isCash ? "💵" : "⏳"}</span>
          </div>
        ) : (
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-[#EEF8F0] text-[#2E9E44] shadow-[0_12px_28px_rgba(46,158,68,0.22)] ring-8 ring-[#EEF8F0]/60 animate-bounce duration-1000">
            <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        )}

        <h2 className="mt-4 font-poppins text-2xl font-bold tracking-tight text-[#0F2044]">
          {isPending
            ? isCash
              ? "Cash Order Placed"
              : "Order Created — Payment Pending"
            : "Payment Confirmed"}
        </h2>
        <p className="mt-1 text-xs text-[#7A8493] font-alegreya">
          {isPending
            ? isCash
              ? "Awaiting cash settlement with an authorized cashier at Counter #03"
              : "Recorded in database with status PENDING. Awaiting payment authorization."
            : "Simulated self-checkout transaction successful"}
        </p>
      </div>

      {/* Order Identity Card */}
      <div className="rounded-2xl border border-white/60 bg-white/95 p-5 shadow-[0_8px_24px_rgba(15,32,68,0.08)] backdrop-blur-md space-y-4">
        <div className="flex items-center justify-between border-b border-black/5 pb-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3]">
              Order Reference
            </p>
            <p className="font-mono text-sm font-bold text-[#0F2044]">
              {order.orderId}
            </p>
          </div>
          {isPending ? (
            <span className="rounded-full bg-amber-50 border border-amber-300 px-3 py-1 text-xs font-bold text-amber-800">
              PENDING · {fmt(order.finalTotal)}
            </span>
          ) : (
            <span className="rounded-full bg-[#EEF8F0] px-3 py-1 text-xs font-bold text-[#2E9E44]">
              PAID · {fmt(order.finalTotal)}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-[#8A94A3] text-[11px]">Supermarket</p>
            <p className="font-semibold text-[#0F2044] truncate">
              {order.store?.name || "Supermarket"}
            </p>
            <p className="text-[10px] text-[#7A8493]">{order.store?.branch}</p>
          </div>
          <div>
            <p className="text-[#8A94A3] text-[11px]">Date &amp; Time</p>
            <p className="font-semibold text-[#0F2044]">{order.paidAt}</p>
          </div>
          <div>
            <p className="text-[#8A94A3] text-[11px]">Payment Method</p>
            <p className="font-semibold text-[#0F2044] truncate">{methodLabel}</p>
          </div>
          <div>
            <p className="text-[#8A94A3] text-[11px]">Items Purchased</p>
            <p className="font-semibold text-[#0F2044]">
              {order.itemCount} items
            </p>
          </div>
        </div>

        {/* Itemised Purchased Lines */}
        <div className="border-t border-black/5 pt-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] mb-2">
            Purchased Merchandise
          </p>
          <div className="max-h-48 overflow-y-auto divide-y divide-black/5 pr-1 text-xs">
            {order.items.map((item) => (
              <div key={item.id} className="py-2 flex items-center justify-between">
                <div className="min-w-0 pr-2">
                  <p className="font-semibold text-[#0F2044] truncate">
                    {item.emoji || "🛍️"} {item.name}
                  </p>
                  <p className="text-[10px] text-[#7A8493]">
                    {item.unitSize ? `${item.unitSize} · ` : ""}Qty {item.quantity} × {fmt(item.price)}
                  </p>
                </div>
                <p className="font-bold text-[#0F2044] shrink-0">
                  {fmt(item.price * item.quantity)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Bill Breakdown Summary */}
        <div className="border-t border-black/5 pt-3 space-y-1.5 text-xs">
          <div className="flex justify-between text-[#7A8493]">
            <span>Items Subtotal</span>
            <span>{fmt(order.subtotal)}</span>
          </div>
          {order.mrpSavings > 0 && (
            <div className="flex justify-between text-[#2E9E44] text-[11px] font-medium bg-emerald-50 px-2 py-1 rounded-lg">
              <span>Store MRP Savings</span>
              <span>Saved {fmt(order.mrpSavings)}</span>
            </div>
          )}
          {order.couponDiscount > 0 && (
            <div className="flex justify-between text-[#2E9E44] font-semibold">
              <span>Coupon ({order.couponCode})</span>
              <span>−{fmt(order.couponDiscount)}</span>
            </div>
          )}
          <div className="border-t border-black/5 pt-2 flex justify-between font-bold text-sm text-[#0F2044]">
            <span>{isPending ? "Amount Due (Pending)" : "Amount Paid"}</span>
            <span className={`text-base ${isPending ? "text-amber-800" : "text-[#2E9E44]"}`}>
              {fmt(order.finalTotal)}
            </span>
          </div>
        </div>

        {/* Informative Notice Box */}
        {isPending ? (
          <div className="rounded-xl bg-amber-50/80 p-3 text-[11px] text-amber-900 border border-amber-200 text-left leading-relaxed">
            <p className="font-bold flex items-center gap-1.5 mb-0.5">
              <span>ℹ️</span> {isCash ? "Cashier Confirmation Required" : "Payment Settlement Pending"}
            </p>
            <p className="text-[10.5px] text-amber-800">
              {isCash
                ? "This order is registered in the store database with status PENDING. Please present this order reference to Cashier Counter #03 to pay in cash. Turnstile gate passes are unlocked upon cashier confirmation."
                : "This order has been recorded in the database with status PENDING. No real digital payment was collected yet. Turnstile gate exit passes will be unlocked once payment is confirmed."}
            </p>
          </div>
        ) : (
          <div className="rounded-xl bg-[#F8F9FA] p-3 text-[11px] text-[#7A8493] text-center border border-black/5">
            This was a simulated self-checkout transaction. No real payment gateways, credit cards, or bank accounts were debited.
          </div>
        )}
      </div>

      {/* Action: Continue to Receipt */}
      <div className="mt-5 space-y-3">
        <button
          type="button"
          onClick={onContinueToReceipt}
          className="flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-[#0F2044] font-poppins text-sm font-semibold text-white shadow-lg transition hover:bg-[#1A3163] hover:scale-[1.01] active:scale-[0.98]"
        >
          <IcCheck />
          <span>View Order Details &amp; Receipt</span>
        </button>
      </div>
    </div>
  );
}
