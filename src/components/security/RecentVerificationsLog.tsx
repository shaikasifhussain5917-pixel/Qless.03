import { VerificationLogEntry } from "../../types";
import { fmt } from "../../utils/formatters";

interface RecentVerificationsLogProps {
  entries: VerificationLogEntry[];
  onClearLog: () => void;
  onSelectEntry?: (entry: VerificationLogEntry) => void;
}

export function RecentVerificationsLog({
  entries,
  onClearLog,
  onSelectEntry,
}: RecentVerificationsLogProps) {
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-white/60 bg-white/90 p-8 text-center shadow-sm backdrop-blur-md">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF8F0] text-2xl text-[#2E9E44] mb-3">
          📋
        </div>
        <h4 className="font-poppins text-sm font-bold text-[#0F2044]">
          No Verifications Yet
        </h4>
        <p className="mt-1 text-xs text-[#7A8493] max-w-xs mx-auto">
          Scan or manually verify customer exit passes. Audit records for this guard shift will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 qless-fade-in text-xs">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-poppins text-xs font-bold text-[#0F2044]">
            Recent Shift Verification Activity
          </h4>
          <p className="text-[11px] text-[#7A8493]">
            {entries.length} attempt{entries.length === 1 ? "" : "s"} recorded in current browser session
          </p>
        </div>
        <button
          type="button"
          onClick={onClearLog}
          className="rounded-xl border border-black/10 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#7A8493] hover:text-[#0F2044] hover:bg-[#F8F9FA] transition"
        >
          Clear Log
        </button>
      </div>

      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {entries.map((entry) => {
          const isSuccess = entry.outcome === "success";
          const isDuplicate = entry.outcome === "duplicate_warning";

          return (
            <div
              key={entry.id}
              onClick={() => onSelectEntry?.(entry)}
              className={`rounded-xl border p-3 transition backdrop-blur-sm ${
                isSuccess
                  ? "border-[#2E9E44]/30 bg-white hover:border-[#2E9E44]"
                  : isDuplicate
                  ? "border-amber-300 bg-amber-50/40 hover:border-amber-400"
                  : "border-red-200 bg-red-50/40 hover:border-red-300"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-bold text-[#0F2044]">
                      {entry.orderId}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.2 text-[9px] font-bold uppercase tracking-wider ${
                        isSuccess
                          ? "bg-[#EEF8F0] text-[#2E9E44]"
                          : isDuplicate
                          ? "bg-amber-100 text-amber-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {isSuccess ? "VERIFIED" : isDuplicate ? "DUPLICATE" : "FAILED"}
                    </span>
                  </div>
                  <p className="text-[10.5px] text-[#7A8493] mt-0.5">
                    {entry.storeName} · {entry.itemCount} items · {entry.timestamp}
                  </p>
                </div>

                <div className="text-right">
                  <span className="font-poppins text-xs font-extrabold text-[#0F2044]">
                    {entry.finalTotal > 0 ? fmt(entry.finalTotal) : "—"}
                  </span>
                </div>
              </div>

              {entry.failureReason && (
                <div className="mt-1.5 rounded-lg bg-red-50 p-1.5 text-[10px] text-red-700">
                  <strong>Reason:</strong> {entry.failureReason}
                </div>
              )}

              {entry.itemsConfirmed && (
                <div className="mt-1.5 rounded-lg bg-[#EEF8F0] p-1.5 text-[10px] text-[#2E9E44] border border-[#2E9E44]/20 flex items-center gap-1 font-semibold">
                  <span>✓</span>
                  <span>Items physically checked &amp; confirmed{entry.itemsConfirmedAt ? ` at ${entry.itemsConfirmedAt}` : ""}</span>
                </div>
              )}

              {entry.hasDiscrepancy && (
                <div className="mt-1.5 rounded-lg bg-amber-50 p-1.5 text-[10px] text-amber-800 border border-amber-200/60">
                  <strong>⚠️ Discrepancy Note:</strong> {entry.discrepancyNote || "Unspecified discrepancy flagged"}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
