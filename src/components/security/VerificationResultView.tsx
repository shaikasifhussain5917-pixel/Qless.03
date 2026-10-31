import { useState } from "react";
import { VerificationResult } from "../../types";
import { fmt } from "../../utils/formatters";
import { ItemInspectionPanel } from "./ItemInspectionPanel";

interface VerificationResultViewProps {
  result: VerificationResult;
  guardName?: string;
  terminalId?: string;
  onScanNext: () => void;
  onInspectionUpdated?: (summary: {
    inspectedCount: number;
    totalCount: number;
    hasDiscrepancy: boolean;
    note: string;
    isConfirmed?: boolean;
    confirmedAt?: string;
  }) => void;
}

export function VerificationResultView({
  result,
  guardName,
  terminalId,
  onScanNext,
  onInspectionUpdated,
}: VerificationResultViewProps) {
  const [showRawPayload, setShowRawPayload] = useState(false);
  const {
    outcome,
    order,
    scannedPayload,
    failureReason,
    failureMessage,
    verifiedAt,
    firstVerifiedAt,
    isDatabaseVerified,
  } = result;

  const isSuccess = outcome === "success";
  const isDuplicate = outcome === "duplicate_warning" || failureReason === "DUPLICATE_EXIT_SCAN";
  const isUnpaid =
    (order && order.paymentStatus !== "CONFIRMED") ||
    failureReason === "STATUS_INVALID" ||
    failureReason === "PAYMENT_NOT_COMPLETED" ||
    (typeof scannedPayload?.status === "string" && scannedPayload.status.includes("PENDING"));
  const isOtherFailure = outcome === "failure" && !isUnpaid;

  // Calculate distinct products count and total item quantity
  const distinctProductCount = order?.items ? order.items.length : 0;
  const totalItemQuantity = order?.items
    ? order.items.reduce((sum, item) => sum + item.quantity, 0)
    : (order?.itemCount ?? (typeof scannedPayload?.itemCount === "number" ? scannedPayload.itemCount : 0));

  const getFailureTitle = (reason?: string) => {
    switch (reason) {
      case "INVALID_JSON":
        return "Invalid QR Format";
      case "MISSING_FIELDS":
        return "Missing Required Metadata";
      case "UNKNOWN_ORDER":
        return "Unknown Transaction Reference";
      case "EXPIRED_PASS":
        return "Exit Pass Expired";
      case "STATUS_INVALID":
        return "Payment Not Completed";
      case "STORE_MISMATCH":
        return "Store Location Mismatch";
      case "AMOUNT_MISMATCH":
        return "Billed Total Mismatch";
      case "ITEM_COUNT_MISMATCH":
        return "Item Count Mismatch";
      case "DUPLICATE_EXIT_SCAN":
        return "Exit Pass Already Used";
      default:
        return "Verification Failed";
    }
  };

  return (
    <div className="space-y-4 qless-fade-in text-xs">
      {/* ── 1. STATUS HERO BANNER ── */}

      {/* CASE A: SUCCESS (GREEN PANEL) */}
      {isSuccess && (
        <div className="rounded-3xl border-2 border-[#2E9E44] bg-[#EEF8F0] p-4 sm:p-6 text-center shadow-md space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#2E9E44] text-white shadow-md">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-10 w-10"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#2E9E44] px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-xs">
              ✓ CUSTOMER VERIFIED
            </div>
            <h2 className="mt-2 font-poppins text-2xl font-black tracking-tight text-[#0F2044]">
              PAYMENT COMPLETED
            </h2>
            <p className="mt-1 font-poppins text-sm font-bold text-[#2E9E44]">
              Payment verified successfully. Customer may exit.
            </p>
          </div>

          {/* Key Verification Badges Required by Spec */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-[#2E9E44]/20 text-left">
            <div className="rounded-xl bg-white/90 p-2.5 border border-[#2E9E44]/20 shadow-2xs">
              <span className="block text-[10px] font-bold uppercase text-[#7A8493]">Order ID</span>
              <span className="font-mono text-xs font-bold text-[#0F2044] truncate block">
                {order?.orderId || scannedPayload?.orderId || "—"}
              </span>
            </div>

            <div className="rounded-xl bg-white/90 p-2.5 border border-[#2E9E44]/20 shadow-2xs">
              <span className="block text-[10px] font-bold uppercase text-[#7A8493]">Items Purchased</span>
              <span className="font-poppins text-xs font-bold text-[#0F2044]">
                {totalItemQuantity} units
              </span>
            </div>

            <div className="rounded-xl bg-white/90 p-2.5 border border-[#2E9E44]/20 shadow-2xs">
              <span className="block text-[10px] font-bold uppercase text-[#7A8493]">Distinct Products</span>
              <span className="font-poppins text-xs font-bold text-[#0F2044]">
                {distinctProductCount} products
              </span>
            </div>

            <div className="rounded-xl bg-white/90 p-2.5 border border-[#2E9E44]/20 shadow-2xs">
              <span className="block text-[10px] font-bold uppercase text-[#7A8493]">Total Paid</span>
              <span className="font-poppins text-sm font-extrabold text-[#2E9E44]">
                {order ? fmt(order.finalTotal) : fmt(scannedPayload?.finalTotal ?? 0)}
              </span>
            </div>

            <div className="rounded-xl bg-white/90 p-2.5 border border-[#2E9E44]/20 shadow-2xs">
              <span className="block text-[10px] font-bold uppercase text-[#7A8493]">Payment Method</span>
              <span className="font-poppins text-xs font-bold uppercase text-[#0F2044]">
                {order?.paymentMethod || scannedPayload?.paymentMethod || "CASH"}
              </span>
            </div>

            <div className="rounded-xl bg-white/90 p-2.5 border border-[#2E9E44]/20 shadow-2xs">
              <span className="block text-[10px] font-bold uppercase text-[#7A8493]">Exit Pass</span>
              <span className="inline-flex items-center gap-1 font-poppins text-xs font-extrabold text-[#2E9E44]">
                <span className="h-2 w-2 rounded-full bg-[#2E9E44]" /> VALID
              </span>
            </div>
          </div>

          <div className="text-[11px] font-semibold text-[#7A8493]">
            Verified at {verifiedAt} · {isDatabaseVerified ? "Authoritative PostgreSQL Clearance" : "Demo Verified"}
          </div>
        </div>
      )}

      {/* CASE B: UNPAID OR PENDING ORDER (AMBER / RED WARNING) */}
      {!isSuccess && isUnpaid && (
        <div className="rounded-3xl border-2 border-amber-400 bg-amber-50 p-4 sm:p-6 text-center shadow-md space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-md text-3xl">
            ⚠️
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-600 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-xs">
              PAYMENT NOT COMPLETED
            </div>
            <h2 className="mt-2 font-poppins text-xl font-black tracking-tight text-amber-950">
              Customer Exit Not Authorized
            </h2>
            <p className="mt-2 text-sm font-bold text-amber-900 leading-relaxed bg-white/80 border border-amber-200 rounded-xl p-3 max-w-md mx-auto">
              "Customer exit is not authorized. Please direct the customer to the cashier."
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-amber-200 text-left">
            <div className="rounded-xl bg-white/90 p-2.5 border border-amber-200 shadow-2xs">
              <span className="block text-[10px] font-bold uppercase text-[#7A8493]">Order Reference</span>
              <span className="font-mono text-xs font-bold text-[#0F2044] truncate block">
                {order?.orderId || scannedPayload?.orderId || "—"}
              </span>
            </div>

            <div className="rounded-xl bg-white/90 p-2.5 border border-amber-200 shadow-2xs">
              <span className="block text-[10px] font-bold uppercase text-[#7A8493]">Payment Status</span>
              <span className="font-poppins text-xs font-extrabold text-amber-800 uppercase">
                {order?.paymentStatus || scannedPayload?.status || "PENDING"}
              </span>
            </div>

            <div className="rounded-xl bg-white/90 p-2.5 border border-amber-200 shadow-2xs">
              <span className="block text-[10px] font-bold uppercase text-[#7A8493]">Amount Due</span>
              <span className="font-poppins text-sm font-extrabold text-red-600">
                {order ? fmt(order.finalTotal) : fmt(scannedPayload?.finalTotal ?? 0)}
              </span>
            </div>
          </div>

          <div className="rounded-xl bg-amber-100/80 border border-amber-300 p-3 text-left text-xs text-amber-950 space-y-1">
            <span className="font-bold">Reason Exit Pass Cannot Be Accepted:</span>
            <p className="text-[11px] leading-relaxed">
              {failureMessage || "Order payment has not been settled at the checkout cashier counter. Turnstile clearance requires an authorized cashier confirmation."}
            </p>
          </div>
        </div>
      )}

      {/* CASE C: ALREADY-USED EXIT PASS (AMBER WARNING) */}
      {!isSuccess && !isUnpaid && isDuplicate && (
        <div className="rounded-3xl border-2 border-amber-400 bg-amber-50 p-4 sm:p-6 text-center shadow-md space-y-3">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-md text-3xl">
            ⚠️
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-600 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-xs">
              DUPLICATE SCAN
            </div>
            <h2 className="mt-2 font-poppins text-xl font-black tracking-tight text-amber-950">
              EXIT PASS ALREADY USED
            </h2>
            <p className="mt-1 font-semibold text-amber-900">
              {failureMessage || `First cleared at ${firstVerifiedAt || "earlier in this shift"}.`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 max-w-sm mx-auto text-left">
            <div className="rounded-xl bg-white/90 p-2 border border-amber-200">
              <span className="block text-[10px] font-bold text-[#7A8493]">Order Reference</span>
              <span className="font-mono text-xs font-bold text-[#0F2044] truncate block">
                {order?.orderId || scannedPayload?.orderId || "—"}
              </span>
            </div>
            <div className="rounded-xl bg-white/90 p-2 border border-amber-200">
              <span className="block text-[10px] font-bold text-[#7A8493]">Receipt ID</span>
              <span className="font-mono text-xs font-bold text-[#0F2044] truncate block">
                {order?.receiptId || scannedPayload?.receiptId || "—"}
              </span>
            </div>
          </div>

          <div className="rounded-xl bg-white/80 border border-amber-200 p-2.5 text-[11px] text-amber-900 leading-relaxed max-w-md mx-auto">
            <strong>Security Rule Enforced:</strong> Each customer exit pass is single-use only. Re-scanning an already-consumed exit pass is blocked and logged into the security audit log.
          </div>
        </div>
      )}

      {/* CASE D: OTHER FAILURES (RED PANEL: Expired, Store Mismatch, Unknown, Tampered, Invalid JSON) */}
      {isOtherFailure && !isDuplicate && (
        <div className="rounded-3xl border-2 border-red-400 bg-red-50 p-4 sm:p-6 text-center shadow-md space-y-3">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-600 text-white shadow-md text-3xl">
            ✕
          </div>

          <div>
            <span className="inline-block rounded-full bg-red-600 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-xs">
              {getFailureTitle(failureReason)}
            </span>
            <h2 className="mt-2 font-poppins text-xl font-black tracking-tight text-red-950">
              VERIFICATION FAILED
            </h2>
            <p className="mt-2 text-xs font-semibold text-red-900 max-w-md mx-auto leading-relaxed">
              {failureMessage}
            </p>
          </div>

          <div className="rounded-xl bg-white/80 border border-red-200 p-2.5 text-[11px] text-red-800 leading-relaxed max-w-md mx-auto">
            Customer gate clearance denied. Please direct customer to customer service or the checkout cashier desk for manual assistance.
          </div>
        </div>
      )}

      {/* ── 2. AUTHORITATIVE CUSTOMER PURCHASE SUMMARY ── */}
      {order && (
        <div className="rounded-2xl border border-white/70 bg-white/95 p-4 sm:p-5 shadow-sm backdrop-blur-md space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-black/5 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base">🛒</span>
                <h3 className="font-poppins text-sm font-bold text-[#0F2044]">
                  Customer Purchase Summary
                </h3>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                    order.paymentStatus === "CONFIRMED"
                      ? "bg-[#EEF8F0] text-[#2E9E44]"
                      : "bg-amber-100 text-amber-900"
                  }`}
                >
                  {order.paymentStatus === "CONFIRMED" ? "PAID" : "UNPAID / PENDING"}
                </span>
              </div>
              <p className="text-[11px] text-[#7A8493] mt-0.5">
                Authoritative transaction items retrieved from supermarket database
              </p>
            </div>

            <div className="text-right">
              <span className="font-mono text-xs font-bold text-[#0F2044] block">
                {order.orderId}
              </span>
              <span className="text-[10px] text-[#7A8493]">Receipt #{order.receiptId}</span>
            </div>
          </div>

          {/* Store & Metadata Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-[#F9FAFB] p-3 rounded-xl border border-black/5">
            <div>
              <span className="text-[10px] font-bold uppercase text-[#8A94A3]">Store</span>
              <p className="font-semibold text-[#0F2044] truncate">{order.store?.name || "QLess Mart"}</p>
              <p className="text-[10px] text-[#7A8493] truncate">{order.store?.branch}</p>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase text-[#8A94A3]">Payment Status</span>
              <p
                className={`font-bold ${
                  order.paymentStatus === "CONFIRMED" ? "text-[#2E9E44]" : "text-amber-800"
                }`}
              >
                {order.paymentStatus || "PENDING"}
              </p>
              <p className="text-[10px] text-[#7A8493] uppercase truncate">
                {order.paymentMethod || "CASH"}
              </p>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase text-[#8A94A3]">Confirmation Time</span>
              <p className="font-semibold text-[#0F2044] truncate">{order.paidAt || "Recorded at Checkout"}</p>
              <p className="text-[10px] text-[#7A8493]">
                {order.issuedAt ? new Date(order.issuedAt).toLocaleDateString() : "Today"}
              </p>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase text-[#8A94A3]">Pass Expiry</span>
              <p className="font-semibold text-[#0F2044] truncate">
                {order.expiresAt
                  ? new Date(order.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  : "60 mins from issue"}
              </p>
              <p className="text-[10px] text-[#7A8493]">Single-use pass</p>
            </div>
          </div>

          {/* Distinction Callout Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl bg-blue-50/80 border border-blue-200 p-3 sm:px-4 sm:py-2.5 text-xs text-[#0F2044]">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="text-base shrink-0">📦</span>
              <div className="leading-snug">
                <span className="font-bold">Distinct Products:</span>{" "}
                <span className="font-poppins font-black text-blue-900">{distinctProductCount}</span>
                <span className="mx-1.5 text-black/20">|</span>
                <span className="font-bold">Total Quantity:</span>{" "}
                <span className="font-poppins font-black text-blue-900">{totalItemQuantity} units</span>
              </div>
            </div>
            <div className="font-poppins font-extrabold text-sm text-[#0F2044] self-end sm:self-auto">
              {fmt(order.finalTotal)}
            </div>
          </div>

          {/* Itemized Purchased Products List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#8A94A3] px-1">
              <span>Product Line Items ({distinctProductCount})</span>
              <span>Qty × Unit Price · Line Total</span>
            </div>

            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-xl border border-black/5 bg-[#F9FAFB] p-2.5 hover:bg-white transition"
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <span className="text-lg shrink-0">{item.emoji || "🛍️"}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-[#0F2044] truncate">{item.name}</p>
                      <p className="text-[10px] text-[#7A8493]">
                        {item.unitSize ? `${item.unitSize} · ` : ""}
                        {item.category || "Grocery"} · {fmt(item.price)} each
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-poppins text-xs font-bold text-[#0F2044]">
                      {item.quantity} × {fmt(item.price)}
                    </span>
                    <span className="block font-poppins text-xs font-extrabold text-[#2E9E44]">
                      {fmt(item.price * item.quantity)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Financial Breakdown Table */}
          <div className="rounded-xl bg-[#F8F9FA] p-3 text-xs space-y-1.5 border border-black/5">
            <div className="flex justify-between text-[#7A8493]">
              <span>Subtotal ({totalItemQuantity} items)</span>
              <span className="font-medium text-[#0F2044]">{fmt(order.subtotal)}</span>
            </div>

            {order.mrpSavings > 0 && (
              <div className="flex justify-between text-[#2E9E44]">
                <span>Total MRP Savings</span>
                <span className="font-medium">- {fmt(order.mrpSavings)}</span>
              </div>
            )}

            {order.couponDiscount > 0 && (
              <div className="flex justify-between text-[#2E9E44]">
                <span>Coupon Discount ({order.couponCode || "PROMO"})</span>
                <span className="font-medium">- {fmt(order.couponDiscount)}</span>
              </div>
            )}

            <div className="flex justify-between items-center border-t border-black/10 pt-2 font-poppins">
              <span className="text-sm font-bold text-[#0F2044]">Final Total</span>
              <span className="text-base font-extrabold text-[#0F2044]">{fmt(order.finalTotal)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── 3. GUARD PHYSICAL AUDIT & SPOT-CHECK INSPECTION TOOL ── */}
      {order && (
        <ItemInspectionPanel
          order={order}
          guardName={guardName}
          terminalId={terminalId}
          onInspectionUpdated={onInspectionUpdated}
          onScanNext={onScanNext}
        />
      )}

      {/* ── 4. RAW PAYLOAD INSPECTOR (Collapsible diagnostic tool) ── */}
      <div className="rounded-2xl border border-black/10 bg-[#F9FAFB] p-3">
        <button
          type="button"
          onClick={() => setShowRawPayload(!showRawPayload)}
          className="flex w-full items-center justify-between text-[11px] font-semibold text-[#7A8493] hover:text-[#0F2044]"
        >
          <span>{showRawPayload ? "Hide Raw Scanned Payload" : "Inspect Raw Scanned QR Payload"}</span>
          <span>{showRawPayload ? "▲" : "▼"}</span>
        </button>

        {showRawPayload && (
          <div className="mt-2 space-y-2 pt-2 border-t border-black/5 qless-scale-in">
            <pre className="max-h-36 overflow-x-auto rounded-xl bg-black/90 p-2.5 font-mono text-[10px] text-emerald-400">
              {result.rawPayload || "Empty payload"}
            </pre>
            {scannedPayload && (
              <div className="rounded-xl bg-white p-2 text-[10px] text-[#7A8493] space-y-0.5 border border-black/5">
                <p>
                  <strong>Parsed Order ID:</strong> {String(scannedPayload.orderId || "N/A")}
                </p>
                <p>
                  <strong>Parsed Status:</strong> {String(scannedPayload.status || "N/A")}
                </p>
                <p>
                  <strong>Parsed Total:</strong> ₹{String(scannedPayload.finalTotal ?? "N/A")}
                </p>
                <p>
                  <strong>Parsed Expiry:</strong>{" "}
                  {String(scannedPayload.expiresAt || scannedPayload.mockExpiry || "N/A")}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 5. SECURITY SYSTEM BADGE ── */}
      {isDatabaseVerified ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-[10.5px] text-emerald-900 leading-relaxed flex items-start gap-2">
          <span className="text-sm">🛡️</span>
          <div>
            <strong className="block font-bold">Authoritative Turnstile Database Clearance</strong>
            <span>
              Verified and redeemed via PostgreSQL procedure{" "}
              <code className="font-mono font-bold">public.verify_turnstile_exit_pass</code> with
              cross-store isolation, concurrency row locks, and immutable security shift logging.
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-[10.5px] text-blue-900 leading-relaxed">
          <strong>Demo Security Notice:</strong> This validation verifies exit pass records against supermarket state. In live deployments, turnstile gates execute authoritative database RPC clearance.
        </div>
      )}

      {/* ── 6. VISIBLE SCAN AGAIN ACTION BUTTON ── */}
      <div className="pt-2">
        <button
          type="button"
          onClick={onScanNext}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0F2044] font-poppins text-xs font-bold text-white shadow-md transition hover:bg-[#1A3163] active:scale-98"
        >
          <span>🔄</span>
          <span>Scan / Verify Another Pass</span>
        </button>
      </div>
    </div>
  );
}
