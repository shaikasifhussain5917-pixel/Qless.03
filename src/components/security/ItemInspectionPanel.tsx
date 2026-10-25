import { useState } from "react";
import { CompletedOrder } from "../../types";
import { fmt } from "../../utils/formatters";
import { confirmPhysicalItemInspection } from "../../utils/securityStorage";

interface ItemInspectionPanelProps {
  order: CompletedOrder;
  guardName?: string;
  terminalId?: string;
  onInspectionUpdated?: (summary: {
    inspectedCount: number;
    totalCount: number;
    hasDiscrepancy: boolean;
    note: string;
    isConfirmed?: boolean;
    confirmedAt?: string;
  }) => void;
  onScanNext?: () => void;
}

export function ItemInspectionPanel({
  order,
  guardName = "Security Officer",
  terminalId = "Gate Turnstile #02",
  onInspectionUpdated,
  onScanNext,
}: ItemInspectionPanelProps) {
  // Map item id -> inspected quantity
  const [inspectedMap, setInspectedMap] = useState<Record<number, number>>({});
  const [isFlagged, setIsFlagged] = useState<boolean>(false);
  const [discrepancyNote, setDiscrepancyNote] = useState<string>("");

  // Confirmation state
  const [isConfirmed, setIsConfirmed] = useState<boolean>(false);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [confirmedAtTime, setConfirmedAtTime] = useState<string>("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isDbPersisted, setIsDbPersisted] = useState<boolean>(false);

  const totalBilledItems = order.items.reduce((s, i) => s + i.quantity, 0);
  const distinctProductCount = order.items.length;

  const inspectedTotal = order.items.reduce((sum, item) => {
    return sum + (inspectedMap[item.id] || 0);
  }, 0);

  // Check if every item has been fully checked
  const isAllInspected =
    totalBilledItems > 0 &&
    inspectedTotal >= totalBilledItems &&
    order.items.every((item) => (inspectedMap[item.id] || 0) === item.quantity);

  const handleToggleItemFull = (id: number, quantity: number) => {
    if (isConfirmed) return; // Locked once confirmed
    setValidationError(null);

    setInspectedMap((prev) => {
      const current = prev[id] || 0;
      const next = current === quantity ? 0 : quantity;
      const updated = { ...prev, [id]: next };

      const newInspectedTotal = order.items.reduce(
        (sum, item) => sum + (updated[item.id] || 0),
        0
      );

      onInspectionUpdated?.({
        inspectedCount: newInspectedTotal,
        totalCount: totalBilledItems,
        hasDiscrepancy: isFlagged,
        note: discrepancyNote,
        isConfirmed: false,
      });

      return updated;
    });
  };

  const handleMarkAllInspected = () => {
    if (isConfirmed) return;
    setValidationError(null);

    const fullMap: Record<number, number> = {};
    for (const item of order.items) {
      fullMap[item.id] = item.quantity;
    }
    setInspectedMap(fullMap);

    onInspectionUpdated?.({
      inspectedCount: totalBilledItems,
      totalCount: totalBilledItems,
      hasDiscrepancy: isFlagged,
      note: discrepancyNote,
      isConfirmed: false,
    });
  };

  const handleResetInspection = () => {
    setInspectedMap({});
    setIsFlagged(false);
    setDiscrepancyNote("");
    setIsConfirmed(false);
    setIsConfirming(false);
    setConfirmedAtTime("");
    setValidationError(null);

    onInspectionUpdated?.({
      inspectedCount: 0,
      totalCount: totalBilledItems,
      hasDiscrepancy: false,
      note: "",
      isConfirmed: false,
    });
  };

  const handleNoteChange = (note: string) => {
    setDiscrepancyNote(note);
    onInspectionUpdated?.({
      inspectedCount: inspectedTotal,
      totalCount: totalBilledItems,
      hasDiscrepancy: isFlagged,
      note,
      isConfirmed,
      confirmedAt: confirmedAtTime,
    });
  };

  const handleToggleFlag = () => {
    const nextFlag = !isFlagged;
    setIsFlagged(nextFlag);
    setValidationError(null);

    onInspectionUpdated?.({
      inspectedCount: inspectedTotal,
      totalCount: totalBilledItems,
      hasDiscrepancy: nextFlag,
      note: discrepancyNote,
      isConfirmed,
      confirmedAt: confirmedAtTime,
    });
  };

  const handleConfirmItems = async () => {
    // Prevent double submission
    if (isConfirming || isConfirmed) return;

    // Validation 1: All items must be checked
    if (!isAllInspected) {
      setValidationError("Please verify all purchased items before confirming.");
      return;
    }

    // Validation 2: If discrepancy is flagged, normal confirmation is blocked
    if (isFlagged) {
      setValidationError(
        "A security discrepancy has been flagged. Normal item confirmation is blocked. Please resolve or follow the discrepancy escalation workflow."
      );
      return;
    }

    setValidationError(null);
    setIsConfirming(true);

    try {
      // Server-side audit logging & verification
      const res = await confirmPhysicalItemInspection({
        orderId: order.orderId,
        terminalId,
        itemsChecked: totalBilledItems,
        hasDiscrepancy: false,
        discrepancyNote: "",
      });

      if (!res.success) {
        setValidationError(res.error || "Unable to record inspection confirmation on server.");
        setIsConfirming(false);
        return;
      }

      setIsDbPersisted(res.isDatabasePersisted);
      setConfirmedAtTime(res.confirmedAt);
      setIsConfirmed(true);

      onInspectionUpdated?.({
        inspectedCount: totalBilledItems,
        totalCount: totalBilledItems,
        hasDiscrepancy: false,
        note: discrepancyNote,
        isConfirmed: true,
        confirmedAt: res.confirmedAt,
      });
    } catch (err: unknown) {
      setValidationError(err instanceof Error ? err.message : "Error confirming inspection.");
    } finally {
      setIsConfirming(false);
    }
  };

  const progressPercent =
    totalBilledItems > 0 ? Math.min(100, Math.round((inspectedTotal / totalBilledItems) * 100)) : 0;

  return (
    <div className="rounded-2xl border border-black/10 bg-white/95 p-4 sm:p-5 shadow-sm space-y-4 text-xs">
      {/* ── 1. SUCCESS PANEL (Displayed after confirmation) ── */}
      {isConfirmed ? (
        <div className="rounded-2xl border-2 border-[#2E9E44] bg-[#EEF8F0] p-5 text-center space-y-4 qless-scale-in">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#2E9E44] text-white shadow-md text-2xl">
            ✓
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#2E9E44] px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-xs">
              ✓ ITEMS CONFIRMED
            </div>
            <h3 className="mt-2 font-poppins text-lg font-black tracking-tight text-[#0F2044]">
              Physical Inspection Completed
            </h3>
            <p className="mt-1 text-xs font-semibold text-[#2E9E44]">
              "All purchased items have been physically checked against the receipt."
            </p>
          </div>

          {/* Inspection Summary Stats Required by Spec */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2 border-t border-[#2E9E44]/20 text-left">
            <div className="rounded-xl bg-white/90 p-2.5 border border-[#2E9E44]/20 shadow-2xs">
              <span className="block text-[10px] font-bold uppercase text-[#7A8493]">Order ID</span>
              <span className="font-mono text-xs font-bold text-[#0F2044] truncate block">
                {order.orderId}
              </span>
            </div>

            <div className="rounded-xl bg-white/90 p-2.5 border border-[#2E9E44]/20 shadow-2xs">
              <span className="block text-[10px] font-bold uppercase text-[#7A8493]">Distinct Products</span>
              <span className="font-poppins text-xs font-bold text-[#0F2044]">
                {distinctProductCount} products
              </span>
            </div>

            <div className="rounded-xl bg-white/90 p-2.5 border border-[#2E9E44]/20 shadow-2xs">
              <span className="block text-[10px] font-bold uppercase text-[#7A8493]">Total Quantity Checked</span>
              <span className="font-poppins text-xs font-bold text-[#0F2044]">
                {totalBilledItems} units
              </span>
            </div>

            <div className="rounded-xl bg-white/90 p-2.5 border border-[#2E9E44]/20 shadow-2xs">
              <span className="block text-[10px] font-bold uppercase text-[#7A8493]">Total Order Amount</span>
              <span className="font-poppins text-sm font-extrabold text-[#2E9E44]">
                {fmt(order.finalTotal)}
              </span>
            </div>

            <div className="rounded-xl bg-white/90 p-2.5 border border-[#2E9E44]/20 shadow-2xs">
              <span className="block text-[10px] font-bold uppercase text-[#7A8493]">Inspection Timestamp</span>
              <span className="font-poppins text-xs font-bold text-[#0F2044]">
                {confirmedAtTime || "Just now"}
              </span>
            </div>

            <div className="rounded-xl bg-white/90 p-2.5 border border-[#2E9E44]/20 shadow-2xs">
              <span className="block text-[10px] font-bold uppercase text-[#7A8493]">Confirmation Status</span>
              <span className="font-poppins text-[11px] font-bold text-[#2E9E44] flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[#2E9E44]" /> Confirmed by Guard ({guardName})
              </span>
            </div>
          </div>

          {isDbPersisted && (
            <div className="text-[10.5px] font-semibold text-[#2E9E44] bg-white/80 border border-[#2E9E44]/30 rounded-xl p-2 inline-flex items-center gap-1.5 mx-auto">
              <span>🛡️</span>
              <span>Authoritative Physical Inspection Audit Log Recorded into Database</span>
            </div>
          )}

          <div className="pt-2 flex flex-col sm:flex-row gap-2">
            {onScanNext && (
              <button
                type="button"
                onClick={onScanNext}
                className="flex-1 flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0F2044] font-poppins text-xs font-bold text-white shadow-md transition hover:bg-[#1A3163] active:scale-98"
              >
                <span>🔄</span>
                <span>Scan / Verify Another Pass</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsConfirmed(false)}
              className="rounded-xl border border-black/10 bg-white px-4 py-2 font-poppins text-xs font-semibold text-[#7A8493] hover:text-[#0F2044] hover:bg-[#F8F9FA] transition"
            >
              Review Checklist
            </button>
          </div>
        </div>
      ) : (
        /* ── 2. ACTIVE CHECKLIST & CONFIRMATION INTERFACE ── */
        <>
          {/* Header & Action Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-black/5 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-poppins text-sm font-bold text-[#0F2044]">
                  Guard Physical Item Inspection
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                    isFlagged
                      ? "bg-red-100 text-red-800"
                      : isAllInspected
                      ? "bg-[#EEF8F0] text-[#2E9E44]"
                      : "bg-blue-50 text-blue-800"
                  }`}
                >
                  {isFlagged
                    ? "Discrepancy Flagged"
                    : isAllInspected
                    ? "All Items Checked"
                    : `${inspectedTotal} / ${totalBilledItems} Verified`}
                </span>
              </div>
              <p className="text-[11px] text-[#7A8493] mt-0.5">
                Audit customer items in cart against the verified snapshot receipt
              </p>
            </div>

            {/* Action Buttons: Confirm Items, Mark All Checked, Reset */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleMarkAllInspected}
                className="min-h-[44px] flex-1 sm:flex-initial rounded-xl border border-[#2E9E44]/40 bg-[#EEF8F0] px-3 py-2 font-poppins text-[11px] font-bold text-[#2E9E44] shadow-2xs hover:bg-[#2E9E44] hover:text-white transition active:scale-95"
              >
                ✓ Mark All Checked
              </button>

              <button
                type="button"
                onClick={handleResetInspection}
                className="min-h-[44px] rounded-xl border border-black/10 bg-white px-3 py-2 font-poppins text-[11px] font-semibold text-[#7A8493] hover:bg-[#F8F9FA] transition"
              >
                Reset
              </button>

              {/* Prominent Confirm Items Button */}
              <button
                type="button"
                id="btn-confirm-items"
                onClick={handleConfirmItems}
                disabled={!isAllInspected || isFlagged || isConfirming}
                className={`min-h-[44px] w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 font-poppins text-xs font-bold text-white shadow-sm transition active:scale-95 ${
                  isAllInspected && !isFlagged
                    ? "bg-[#2E9E44] hover:bg-[#288B3B] cursor-pointer"
                    : "bg-slate-300 opacity-60 cursor-not-allowed"
                }`}
              >
                {isConfirming ? (
                  <>
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                    </svg>
                    <span>Confirming…</span>
                  </>
                ) : (
                  <>
                    <span>✓</span>
                    <span>Confirm Items</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Validation Notice / Warning Banner */}
          {validationError && (
            <div className="rounded-xl border border-red-300 bg-red-50 p-2.5 text-xs text-red-900 flex items-start gap-2 qless-scale-in">
              <span className="text-base shrink-0">⚠️</span>
              <p className="font-semibold leading-relaxed">{validationError}</p>
            </div>
          )}

          {!isAllInspected && !validationError && !isFlagged && (
            <div className="rounded-xl bg-blue-50/70 border border-blue-200/60 p-2.5 text-[11px] text-blue-900 flex items-center justify-between">
              <span>Please verify all purchased items before confirming.</span>
              <span className="font-bold text-blue-800">
                {totalBilledItems - inspectedTotal} item(s) remaining
              </span>
            </div>
          )}

          {isFlagged && !validationError && (
            <div className="rounded-xl bg-amber-50 border border-amber-300 p-2.5 text-[11px] text-amber-950 flex items-center gap-2">
              <span>⚠️</span>
              <span>
                Discrepancy flagged: Normal item confirmation is blocked. Please log notes below.
              </span>
            </div>
          )}

          {/* Progress Bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-[#7A8493]">
              <span>Audit Progress</span>
              <span className="font-semibold text-[#0F2044]">
                {progressPercent}% ({inspectedTotal} of {totalBilledItems} items checked)
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-black/5 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  isFlagged ? "bg-red-500" : isAllInspected ? "bg-[#2E9E44]" : "bg-blue-600"
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Item Checklist */}
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {order.items.map((item) => {
              const inspectedQty = inspectedMap[item.id] || 0;
              const isItemDone = inspectedQty === item.quantity;

              return (
                <div
                  key={item.id}
                  onClick={() => handleToggleItemFull(item.id, item.quantity)}
                  className={`flex min-h-[44px] cursor-pointer items-center justify-between rounded-xl border p-2.5 transition ${
                    isItemDone
                      ? "border-[#2E9E44]/40 bg-[#EEF8F0]/50"
                      : inspectedQty > 0
                      ? "border-blue-200 bg-blue-50/30"
                      : "border-black/5 bg-[#F9FAFB] hover:bg-white"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <input
                      type="checkbox"
                      checked={isItemDone}
                      onChange={() => {}} // handled by parent onClick
                      className="h-5 w-5 rounded text-[#2E9E44] focus:ring-0 cursor-pointer shrink-0"
                    />
                    <span className="text-base shrink-0">{item.emoji || "🛍️"}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-[#0F2044] truncate">{item.name}</p>
                      <p className="text-[10px] text-[#7A8493]">
                        {item.unitSize ? `${item.unitSize} · ` : ""}
                        {fmt(item.price)} each
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      className={`font-poppins text-xs font-bold ${
                        isItemDone ? "text-[#2E9E44]" : "text-[#0F2044]"
                      }`}
                    >
                      {inspectedQty} / {item.quantity} Qty
                    </span>
                    <span className="block text-[10px] font-semibold text-[#7A8493]">
                      {fmt(item.price * item.quantity)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Discrepancy Recording Section */}
          <div className="pt-2 border-t border-black/5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex min-h-[44px] items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isFlagged}
                  onChange={handleToggleFlag}
                  className="h-5 w-5 rounded text-red-600 focus:ring-0 cursor-pointer"
                />
                <span className="font-poppins text-xs font-bold text-red-800">
                  Flag Security Discrepancy
                </span>
              </label>
              <span className="text-[10px] text-[#7A8493]">
                Log unverified or extra items
              </span>
            </div>

            {isFlagged && (
              <div className="space-y-1.5 qless-scale-in">
                <textarea
                  rows={2}
                  value={discrepancyNote}
                  onChange={(e) => handleNoteChange(e.target.value)}
                  placeholder="Describe discrepancy (e.g. Unscanned item found in cart, missing product, or quantity discrepancy)..."
                  className="w-full rounded-xl border border-red-300 bg-red-50/50 p-2.5 text-base sm:text-xs text-red-950 focus:border-red-500 focus:bg-white focus:outline-none"
                />
                <p className="text-[10px] text-red-700 italic">
                  * Note will be attached to this session's audit log record.
                </p>
              </div>
            )}
          </div>

          {/* Honest Notice */}
          <div className="rounded-xl bg-[#F8F9FA] p-2.5 text-[10px] text-[#7A8493] leading-relaxed border border-black/5">
            <strong>Security Notice:</strong> Physical item inspection confirms cart items match the receipt. Payment verification remains independent and authoritative via turnstile gate exit pass clearance.
          </div>
        </>
      )}
    </div>
  );
}
