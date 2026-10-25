import { useState } from "react";
import { CompletedOrder } from "../../types";
import { generateTestPayloads } from "../../utils/securityValidator";
import { createExitQRPayload } from "../../utils/orderStorage";
import { fmt } from "../../utils/formatters";

interface ManualVerificationTabProps {
  onVerifyPayload: (rawPayload: string) => void;
  orderHistory: CompletedOrder[];
}

export function ManualVerificationTab({
  onVerifyPayload,
  orderHistory,
}: ManualVerificationTabProps) {
  const [inputPayload, setInputPayload] = useState<string>("");
  const [selectedHistoricalOrder, setSelectedHistoricalOrder] = useState<string>(
    orderHistory[0]?.orderId || ""
  );

  const testCases = generateTestPayloads(orderHistory[0] || null);

  const handleApplyHistoricalOrder = (orderId: string) => {
    setSelectedHistoricalOrder(orderId);
    const order = orderHistory.find((o) => o.orderId === orderId);
    if (order) {
      const payloadStr = createExitQRPayload(order);
      setInputPayload(payloadStr);
    }
  };

  const handleTestPreset = (presetText: string) => {
    setInputPayload(presetText);
    onVerifyPayload(presetText);
  };

  return (
    <div className="space-y-4 text-xs qless-fade-in">
      {/* 1. Direct Manual Pass ID or QR Payload Submission */}
      <div className="rounded-2xl border border-white/60 bg-white/95 p-4 shadow-sm backdrop-blur-md space-y-3">
        <div className="flex items-center justify-between">
          <label htmlFor="manual-qr-payload" className="font-poppins text-xs font-bold text-[#0F2044]">
            Manual Order ID / Exit Pass ID or JSON Payload
          </label>
          <span className="text-[10px] font-bold text-[#2E9E44] bg-[#EEF8F0] px-2 py-0.5 rounded-full">
            Manual Entry Fallback
          </span>
        </div>

        <p className="text-[11px] text-[#7A8493] leading-relaxed">
          Enter customer's Order ID (e.g. <code className="font-mono font-semibold">QL-2026-C1369</code> or <code className="font-mono font-semibold">ORD-...</code>), Receipt ID, or paste the raw exit pass JSON payload:
        </p>

        <textarea
          id="manual-qr-payload"
          rows={3}
          value={inputPayload}
          onChange={(e) => setInputPayload(e.target.value)}
          placeholder='Enter Order ID (e.g. QL-2026-C1369) or paste JSON payload...'
          className="w-full rounded-xl border border-black/10 bg-[#F9FAFB] p-2.5 font-mono text-base sm:text-xs text-[#0F2044] focus:border-[#2E9E44] focus:bg-white focus:outline-none shadow-inner"
        />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onVerifyPayload(inputPayload)}
            disabled={!inputPayload.trim()}
            className="flex-1 min-h-[44px] rounded-xl bg-[#0F2044] py-2.5 font-poppins text-xs font-semibold text-white shadow-sm transition hover:bg-[#1A3163] active:scale-95 disabled:opacity-40"
          >
            Verify Exit Pass / Order
          </button>
          {inputPayload && (
            <button
              type="button"
              onClick={() => setInputPayload("")}
              className="min-h-[44px] rounded-xl border border-black/10 px-4 py-2 text-xs font-semibold text-[#7A8493] hover:bg-[#F8F9FA]"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* 2. Select from Stored Order History */}
      {orderHistory.length > 0 && (
        <div className="rounded-2xl border border-white/60 bg-white/95 p-4 shadow-sm backdrop-blur-md space-y-2.5">
          <p className="font-poppins text-xs font-bold text-[#0F2044]">
            Load Pass from Stored Order History
          </p>
          <p className="text-[11px] text-[#7A8493]">
            Select an actual completed customer purchase from demonstration storage:
          </p>

          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {orderHistory.map((order) => (
              <div
                key={order.orderId}
                onClick={() => handleApplyHistoricalOrder(order.orderId)}
                className={`flex cursor-pointer items-center justify-between rounded-xl border p-2.5 transition ${
                  selectedHistoricalOrder === order.orderId
                    ? "border-[#2E9E44] bg-[#EEF8F0]/70 font-semibold"
                    : "border-black/5 bg-[#F9FAFB] hover:bg-white"
                }`}
              >
                <div>
                  <p className="font-mono text-[11px] font-bold text-[#0F2044]">{order.orderId}</p>
                  <p className="text-[10px] text-[#7A8493]">
                    {order.store?.name || "Store"} · {order.paidAt} ({order.itemCount} items) ·{" "}
                    <span className={order.paymentStatus === "CONFIRMED" ? "text-[#2E9E44] font-bold" : "text-amber-800"}>
                      {order.paymentStatus || "CONFIRMED"}
                    </span>
                  </p>
                </div>
                <div className="text-right">
                  <span className="font-bold text-[#2E9E44]">{fmt(order.finalTotal)}</span>
                  <span className="block text-[9px] text-[#8A94A3]">Click to Load</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Diagnostic Simulation Presets for Security Testing */}
      <div className="rounded-2xl border border-amber-200/70 bg-amber-50/50 p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <p className="font-poppins text-xs font-bold text-amber-950 flex items-center gap-1.5">
            <span>🧪</span> Diagnostic Verification Presets
          </p>
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
            One-Click Test Cases
          </span>
        </div>

        <p className="text-[11px] text-amber-800 leading-relaxed">
          Test realistic valid, unpaid, expired, store-mismatch, and entrance QR conditions:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
          <button
            type="button"
            onClick={() => handleTestPreset(testCases.valid)}
            className="flex min-h-[44px] items-center justify-center rounded-xl bg-[#2E9E44] px-3 py-2 font-poppins text-xs font-bold text-white shadow-2xs hover:bg-[#288B3B] transition active:scale-95 text-center"
            title="Valid Exit Pass matching stored order"
          >
            ✓ 1. Valid Paid Pass
          </button>

          <button
            type="button"
            onClick={() => handleTestPreset(testCases.statusUnpaid)}
            className="flex min-h-[44px] items-center justify-center rounded-xl border border-amber-300 bg-amber-100 px-3 py-2 font-poppins text-xs font-bold text-amber-900 shadow-2xs hover:bg-amber-200 transition active:scale-95 text-center"
            title="Unpaid/Pending order without completed payment"
          >
            ⚠️ 2. Unpaid / Pending
          </button>

          <button
            type="button"
            onClick={() => handleTestPreset(testCases.expired)}
            className="flex min-h-[44px] items-center justify-center rounded-xl border border-red-300 bg-white px-3 py-2 font-poppins text-xs font-bold text-red-700 shadow-2xs hover:bg-red-50 transition active:scale-95 text-center"
            title="Pass with expired timestamp"
          >
            ✗ 3. Expired Pass
          </button>

          <button
            type="button"
            onClick={() => handleTestPreset(testCases.amountMismatch)}
            className="flex min-h-[44px] items-center justify-center rounded-xl border border-red-300 bg-white px-3 py-2 font-poppins text-xs font-bold text-red-700 shadow-2xs hover:bg-red-50 transition active:scale-95 text-center"
            title="Tampered payment total"
          >
            ✗ 4. Amount Mismatch
          </button>

          <button
            type="button"
            onClick={() => handleTestPreset(testCases.storeMismatch)}
            className="flex min-h-[44px] items-center justify-center rounded-xl border border-red-300 bg-white px-3 py-2 font-poppins text-xs font-bold text-red-700 shadow-2xs hover:bg-red-50 transition active:scale-95 text-center"
            title="Pass from a different store"
          >
            ✗ 5. Store Mismatch
          </button>

          <button
            type="button"
            onClick={() => handleTestPreset(testCases.unknownOrder)}
            className="flex min-h-[44px] items-center justify-center rounded-xl border border-red-300 bg-white px-3 py-2 font-poppins text-xs font-bold text-red-700 shadow-2xs hover:bg-red-50 transition active:scale-95 text-center"
            title="Order reference not in database"
          >
            ✗ 6. Unknown Order
          </button>

          <button
            type="button"
            onClick={() => handleTestPreset(testCases.entranceQR)}
            className="flex min-h-[44px] items-center justify-center rounded-xl border border-amber-300 bg-white px-3 py-2 font-poppins text-xs font-bold text-amber-900 shadow-2xs hover:bg-amber-50 transition active:scale-95 text-center"
            title="Store Entrance QR code (Must be rejected as exit pass)"
          >
            🚫 7. Entrance QR Code
          </button>

          <button
            type="button"
            onClick={() => handleTestPreset(testCases.plainOrderId)}
            className="flex min-h-[44px] items-center justify-center rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 font-poppins text-xs font-bold text-blue-900 shadow-2xs hover:bg-blue-100 transition active:scale-95 text-center"
            title="Manual Plain Order ID string input"
          >
            ⌨️ 8. Plain Order ID
          </button>

          <button
            type="button"
            onClick={() => handleTestPreset(testCases.malformedJson)}
            className="flex min-h-[44px] items-center justify-center rounded-xl border border-red-300 bg-white px-3 py-2 font-poppins text-xs font-bold text-red-700 shadow-2xs hover:bg-red-50 transition active:scale-95 text-center"
            title="Corrupted or non-JSON QR"
          >
            ✗ 9. Malformed JSON
          </button>
        </div>
      </div>
    </div>
  );
}
