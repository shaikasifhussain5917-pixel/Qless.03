import { useState, useMemo, useEffect, useCallback } from "react";
import { VerificationLogEntry } from "../../types";
import { fetchAdminSecurityLogs, LiveSecurityLogEntry } from "../../services/adminSecurityService";
import { LAUNCH_STORE_ID } from "../../config/storeConfig";

interface AdminSecurityTabProps {
  storeId?: string;
  verificationLogs?: VerificationLogEntry[];
  onClearLogs?: () => void;
}

export function AdminSecurityTab({
  storeId = LAUNCH_STORE_ID,
}: AdminSecurityTabProps) {
  const [logs, setLogs] = useState<LiveSecurityLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setLoadError(null);

    const result = await fetchAdminSecurityLogs(storeId);

    if (result.error) {
      setLoadError(result.error);
      // Do not silently fall back to mock data when database query fails
      setLogs([]);
    } else {
      setLogs(result.logs);
    }

    if (isRefresh) {
      setIsRefreshing(false);
    } else {
      setIsLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  const verifiedCount = useMemo(() => {
    return logs.filter((v) => v.outcome === "success").length;
  }, [logs]);

  const duplicateCount = useMemo(() => {
    return logs.filter((v) => v.outcome === "duplicate_warning").length;
  }, [logs]);

  const failureCount = useMemo(() => {
    return logs.filter((v) => v.outcome === "failure").length;
  }, [logs]);

  const discrepancyCount = useMemo(() => {
    return logs.filter((v) => v.hasDiscrepancy).length;
  }, [logs]);

  const passRate = useMemo(() => {
    return logs.length > 0
      ? Math.round((verifiedCount / logs.length) * 100)
      : 100;
  }, [verifiedCount, logs]);

  return (
    <div className="space-y-4 qless-fade-in text-xs">
      {/* ── SECURITY KPI CARDS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
              Verified Clearances
            </span>
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
          </div>
          <p className="font-poppins text-2xl font-extrabold text-[#0F2044]">
            {verifiedCount}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">{passRate}% gate clearance rate</p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
              Duplicate Scans
            </span>
            <span className="h-2 w-2 rounded-full bg-amber-500"></span>
          </div>
          <p className="font-poppins text-2xl font-extrabold text-[#0F2044]">
            {duplicateCount}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Attempted repeat exits</p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700">
              Gate Denials / Failures
            </span>
            <span className="h-2 w-2 rounded-full bg-rose-500"></span>
          </div>
          <p className="font-poppins text-2xl font-extrabold text-[#0F2044]">
            {failureCount}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Expired, mismatched, or fake</p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700">
              Flagged Discrepancies
            </span>
            <span className="h-2 w-2 rounded-full bg-purple-500"></span>
          </div>
          <p className="font-poppins text-2xl font-extrabold text-[#0F2044]">
            {discrepancyCount}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Item spot-check issues</p>
        </div>
      </div>

      {/* ── SECURITY LOG HEADER ── */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-poppins text-sm font-bold text-[#0F2044]">
                Security Gate Audit Trail
              </h2>
              <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[9.5px] font-bold text-emerald-700">
                ● Live Database (public.security_logs)
              </span>
            </div>
            <p className="text-[11px] text-[#7A8493]">
              Authoritative chronological log of exit turnstile verifications from Supabase PostgreSQL for store {storeId}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => loadData(true)}
              disabled={isRefreshing || isLoading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2044] hover:bg-[#F8F9FA] transition shadow-2xs disabled:opacity-60"
              title="Refresh security log feed directly from Supabase"
            >
              <svg
                className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-[#2E9E44]" : "text-[#7A8493]"}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {isRefreshing ? "Refreshing..." : "Refresh Feed"}
            </button>

            <span className="rounded-full bg-blue-50 border border-blue-200 px-2.5 py-1 text-[10px] font-bold text-blue-800">
              {logs.length} EVENTS RECORDED
            </span>

            {/* Security Architecture Compliance: Audit logs are immutable in Supabase */}
            <span
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 cursor-help"
              title="Audit records are protected by database RLS policy and cannot be cleared or deleted"
            >
              🔒 Immutable Audit Trail
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-2.5 text-[10.5px] text-blue-950 leading-relaxed">
          <strong>Security Architecture Notice:</strong> Turnstile gate verification events are logged directly into <code className="font-mono font-bold bg-blue-100/80 px-1 py-0.5 rounded">public.security_logs</code> via server-side verification procedures. As a certified compliance requirement, audit records are immutable and tamper-evident; deletion is permanently prohibited by database security policy.
        </div>
      </div>

      {/* ── AUDIT LOG DATA CONTAINER ── */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs overflow-x-auto">
        {isLoading ? (
          <div className="py-16 text-center text-[#7A8493]">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-[#0F2044]">
              <svg className="h-6 w-6 animate-spin text-[#2E9E44]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <p className="font-poppins text-sm font-bold text-[#0F2044]">Querying Security Audit Trail…</p>
            <p className="text-xs text-[#7A8493] mt-1">
              Loading authoritative gate verification events for store {storeId} via Supabase RLS
            </p>
          </div>
        ) : loadError ? (
          <div className="py-12 px-4 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-2xl text-red-600 border border-red-200">
              ⚠️
            </div>
            <p className="font-poppins text-sm font-bold text-red-900">
              Failed to Load Security Logs from Supabase
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs text-red-700 bg-red-50 p-2.5 rounded-xl border border-red-200 font-mono">
              {loadError}
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => loadData(false)}
                className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-[#0F2044] px-4 py-2 font-poppins text-xs font-semibold text-white shadow-sm hover:bg-[#1A3163] transition"
              >
                Retry Database Query
              </button>
            </div>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-[#7A8493]">
            <span className="text-2xl block mb-2">🛡️</span>
            <p className="font-poppins text-sm font-bold text-[#0F2044]">No Gate Verifications Recorded in Store Database</p>
            <p className="text-xs mt-1">
              When guards or turnstiles verify customer QR passes for store {storeId}, audit records will populate here in real-time.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs min-w-[720px]">
            <thead>
              <tr className="border-b border-black/5 text-[10px] font-bold uppercase tracking-wider text-[#8A94A3]">
                <th className="pb-2.5">Time</th>
                <th className="pb-2.5">Order Ref</th>
                <th className="pb-2.5">Checkpoint / Terminal</th>
                <th className="pb-2.5">Scanned Ref</th>
                <th className="pb-2.5">Outcome</th>
                <th className="pb-2.5">Audit / Discrepancy Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {logs.map((log) => {
                const isSuccess = log.outcome === "success";
                const isDuplicate = log.outcome === "duplicate_warning";

                return (
                  <tr key={log.id} className="hover:bg-[#F9FAFB]/80 transition">
                    <td className="py-3 font-mono text-[11px] text-[#7A8493]">
                      {log.timestamp}
                    </td>
                    <td className="py-3 font-mono font-bold text-[#0F2044]">
                      {log.orderId !== "N/A" ? log.orderId : (
                        <span className="text-[10px] font-normal text-[#8A94A3] italic">—</span>
                      )}
                    </td>
                    <td className="py-3 text-[#0F2044]">
                      <span className="font-semibold">{log.storeName}</span>
                      <span className="block text-[10px] font-mono text-slate-500">
                        {log.terminalId}
                      </span>
                    </td>
                    <td className="py-3 font-mono text-[11px] text-[#7A8493] max-w-[140px] truncate" title={log.scannedPayload}>
                      {log.scannedPayload}
                    </td>
                    <td className="py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          isSuccess
                            ? "bg-emerald-50 text-[#2E9E44] border border-emerald-200"
                            : isDuplicate
                            ? "bg-amber-50 text-amber-800 border border-amber-200"
                            : "bg-red-50 text-red-700 border border-red-200"
                        }`}
                      >
                        {isSuccess
                          ? "✓ Verified"
                          : isDuplicate
                          ? "⚠ Repeat Exit"
                          : "✗ Denied"}
                      </span>
                    </td>
                    <td className="py-3 text-[11px]">
                      {log.hasDiscrepancy ? (
                        <span className="font-medium text-purple-800 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200 block">
                          Spot Check: {log.discrepancyNote || "Quantity mismatch flagged"}
                        </span>
                      ) : log.failureReason ? (
                        <span className="text-red-700 font-mono block text-[10px]">
                          Reason: {log.failureReason}
                        </span>
                      ) : (
                        <span className="text-emerald-700">All scanned items cleared</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
