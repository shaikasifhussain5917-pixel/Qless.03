import { CompletedOrder } from "../../types";
import { fmt } from "../../utils/formatters";

interface ReceiptPlaceholderViewProps {
  order: CompletedOrder | null;
  onStartNewTrip: () => void;
  onReviewOrder: () => void;
}

export function ReceiptPlaceholderView({
  order,
  onStartNewTrip,
  onReviewOrder,
}: ReceiptPlaceholderViewProps) {
  return (
    <div className="flex flex-1 flex-col qless-fade-in pb-12 max-w-[480px] mx-auto w-full">
      {/* Header */}
      <div className="text-center py-5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900 mb-2">
          <span className="h-2 w-2 rounded-full bg-amber-600 animate-pulse" />
          PHASE 4 PREVIEW · DIGITAL RECEIPT &amp; EXIT PASS
        </span>
        <h2 className="font-poppins text-2xl font-bold tracking-tight text-[#0F2044]">
          Digital Receipt Experience
        </h2>
        <p className="mt-1 text-xs text-[#7A8493] font-alegreya">
          Under development for Phase 4: Digital Receipt &amp; Security QR Clearance
        </p>
      </div>

      {/* Information Card */}
      <div className="rounded-2xl border border-white/60 bg-white/95 p-6 shadow-[0_8px_24px_rgba(15,32,68,0.08)] backdrop-blur-md space-y-4">
        <div className="rounded-2xl border-2 border-dashed border-[#2E9E44]/40 bg-[#EEF8F0]/50 p-5 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF8F0] text-3xl shadow-xs">
            🧾
          </div>
          <h3 className="mt-3 font-poppins text-base font-bold text-[#0F2044]">
            Order Safely Recorded
          </h3>
          <p className="mt-1 text-xs text-[#7A8493] max-w-[320px] mx-auto leading-relaxed">
            Your simulated checkout for Order <strong className="text-[#0F2044]">{order?.orderId || "#QL-ORD"}</strong> was completed with all discount calculations and item quantities verified.
          </p>
        </div>

        {order && (
          <div className="rounded-xl border border-black/5 bg-[#F9FAFB] p-4 text-xs space-y-2">
            <div className="flex justify-between text-[#7A8493]">
              <span>Store Branch</span>
              <span className="font-semibold text-[#0F2044]">{order.store?.name} · {order.store?.branch}</span>
            </div>
            <div className="flex justify-between text-[#7A8493]">
              <span>Items Total</span>
              <span className="font-semibold text-[#0F2044]">{order.itemCount} items ({fmt(order.finalTotal)})</span>
            </div>
            <div className="flex justify-between text-[#7A8493]">
              <span>Payment Time</span>
              <span className="font-semibold text-[#0F2044]">{order.paidAt}</span>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3.5 text-xs text-blue-900 leading-relaxed space-y-1">
          <p className="font-bold flex items-center gap-1.5">
            <span>🚀</span> Next Phase Scope (Phase 4):
          </p>
          <ul className="list-disc pl-5 text-[11px] text-blue-800 space-y-0.5">
            <li>Customer Digital E-Receipt &amp; Tax Invoice download</li>
            <li>Cryptographic Exit Gate QR Pass generation</li>
            <li>Security associate exit scanner verification</li>
          </ul>
        </div>
      </div>

      {/* Navigation Actions */}
      <div className="mt-5 space-y-2.5">
        <button
          type="button"
          onClick={onStartNewTrip}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2E9E44] font-poppins text-sm font-semibold text-white shadow-md transition hover:scale-[1.01] hover:bg-[#288B3B] active:scale-[0.98]"
        >
          Start New Shopping Trip
        </button>

        <button
          type="button"
          onClick={onReviewOrder}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#D8DDE3] bg-white font-poppins text-xs font-semibold text-[#0F2044] transition hover:bg-[#F8F9FA] active:scale-[0.98]"
        >
          Review Payment Confirmation
        </button>
      </div>
    </div>
  );
}
