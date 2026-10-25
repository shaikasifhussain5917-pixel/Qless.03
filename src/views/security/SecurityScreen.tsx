import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useShopping } from "../../context/ShoppingContext";
import { useAuth } from "../../context/AuthContext";
import { CustomerLayout } from "../../layouts/CustomerLayout";
import { GuardCameraScanner } from "../../components/security/GuardCameraScanner";
import { ManualVerificationTab } from "../../components/security/ManualVerificationTab";
import { VerificationResultView } from "../../components/security/VerificationResultView";
import { RecentVerificationsLog } from "../../components/security/RecentVerificationsLog";
import { validateExitQRPayload } from "../../utils/securityValidator";
import { VerificationLogEntry, VerificationResult } from "../../types";
import { IcBack } from "../../components/common/Icons";
import { isSupabaseConfigured } from "../../lib/supabase";

import {
  clearVerificationLogs,
  getVerificationLogs,
  saveVerificationLogEntry,
  updateVerificationLogEntry,
} from "../../utils/securityStorage";

type GuardTab = "camera" | "manual" | "log";

export function SecurityScreen() {
  const navigate = useNavigate();
  const { selectedStore, orderHistory } = useShopping();
  const { user, logout } = useAuth();

  // Active view tab
  const [activeTab, setActiveTab] = useState<GuardTab>("camera");

  // Camera active toggle
  const [isCameraScanning, setIsCameraScanning] = useState<boolean>(false);

  // Active verification result (null = scanner idle / input mode)
  const [activeResult, setActiveResult] = useState<VerificationResult | null>(null);

  // Session duplicate tracking: map of orderId -> firstVerifiedTimestamp
  const [sessionVerifiedMap, setSessionVerifiedMap] = useState<Map<string, string>>(new Map());

  // Session verification activity logs (persisted in demonstration storage)
  const [logEntries, setLogEntries] = useState<VerificationLogEntry[]>(() => getVerificationLogs());

  // Loading state during authoritative database RPC verification
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  // Current session log count
  const verifiedCount = useMemo(() => {
    return logEntries.filter((e) => e.outcome === "success").length;
  }, [logEntries]);

  // Dynamic Scan Status Indicator
  const scanStatusInfo = useMemo(() => {
    if (isVerifying) {
      return {
        label: "Verifying with Database…",
        colorClass: "bg-blue-500",
        badgeBg: "bg-blue-50 text-blue-800 border-blue-200",
        pulse: true,
      };
    }
    if (activeResult) {
      if (activeResult.outcome === "success") {
        return {
          label: "Customer Verified & Paid",
          colorClass: "bg-[#2E9E44]",
          badgeBg: "bg-[#EEF8F0] text-[#2E9E44] border-emerald-300",
          pulse: false,
        };
      }
      if (
        activeResult.outcome === "duplicate_warning" ||
        activeResult.failureReason === "STATUS_INVALID" ||
        activeResult.failureReason === "DUPLICATE_EXIT_SCAN"
      ) {
        return {
          label:
            activeResult.failureReason === "STATUS_INVALID"
              ? "Payment Not Completed"
              : "Duplicate Scan / Re-used Pass",
          colorClass: "bg-amber-500",
          badgeBg: "bg-amber-50 text-amber-900 border-amber-300",
          pulse: false,
        };
      }
      return {
        label: "Verification Denied",
        colorClass: "bg-red-500",
        badgeBg: "bg-red-50 text-red-900 border-red-300",
        pulse: false,
      };
    }
    if (isCameraScanning) {
      return {
        label: "Camera Active · Point at Exit QR",
        colorClass: "bg-[#2E9E44]",
        badgeBg: "bg-emerald-50 text-emerald-800 border-emerald-200",
        pulse: true,
      };
    }
    return {
      label: "Scanner Ready · Awaiting Customer",
      colorClass: "bg-slate-400",
      badgeBg: "bg-slate-50 text-slate-700 border-slate-200",
      pulse: false,
    };
  }, [isVerifying, activeResult, isCameraScanning]);

  const handleProcessPayload = async (rawPayload: string) => {
    // Turn off camera once decoded to show result clearly & prevent duplicate triggers
    setIsCameraScanning(false);
    setIsVerifying(true);

    try {
      // Run authoritative turnstile validator
      const result = await validateExitQRPayload(
        rawPayload,
        selectedStore,
        sessionVerifiedMap,
        user?.terminalId || "Gate Turnstile #02"
      );
      setActiveResult(result);

      // If success and not in map yet, add to session duplicate tracking
      if (result.outcome === "success" && result.order) {
        setSessionVerifiedMap((prev) => {
          const next = new Map(prev);
          if (!next.has(result.order!.orderId)) {
            next.set(result.order!.orderId, result.verifiedAt);
          }
          return next;
        });
      }

      // Append to session shift audit log
      const newLogEntry: VerificationLogEntry = {
        id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        orderId: result.order?.orderId || result.scannedPayload?.orderId || "UNKNOWN",
        receiptId: result.order?.receiptId || result.scannedPayload?.receiptId || "—",
        storeName: result.order?.store?.name || result.scannedPayload?.storeName || selectedStore?.name || "Store",
        finalTotal:
          result.order?.finalTotal ??
          (typeof result.scannedPayload?.finalTotal === "number" ? result.scannedPayload.finalTotal : 0),
        itemCount:
          result.order?.itemCount ??
          (typeof result.scannedPayload?.itemCount === "number" ? result.scannedPayload.itemCount : 0),
        outcome: result.outcome,
        failureReason: result.failureMessage,
        timestamp: result.verifiedAt,
        hasDiscrepancy: false,
      };

      const updatedLogs = saveVerificationLogEntry(newLogEntry);
      setLogEntries(updatedLogs);
    } catch (err: unknown) {
      console.error("[QLess Guard] Unexpected verification error:", err);
      setActiveResult({
        outcome: "failure",
        order: null,
        scannedPayload: null,
        rawPayload,
        failureMessage: err instanceof Error ? err.message : "An unexpected verification error occurred.",
        verifiedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResetForNextScan = () => {
    setActiveResult(null);
    setActiveTab("camera");
    setIsCameraScanning(false);
  };

  const handleInspectionUpdated = (summary: {
    inspectedCount: number;
    totalCount: number;
    hasDiscrepancy: boolean;
    note: string;
    isConfirmed?: boolean;
    confirmedAt?: string;
  }) => {
    if (!activeResult || !activeResult.order) return;

    const targetOrderId = activeResult.order.orderId;
    const matchingLog = logEntries.find((e) => e.orderId === targetOrderId);
    if (matchingLog) {
      const updated = updateVerificationLogEntry(matchingLog.id, {
        hasDiscrepancy: summary.hasDiscrepancy,
        discrepancyNote: summary.note,
        itemsConfirmed: summary.isConfirmed,
        itemsConfirmedAt: summary.confirmedAt,
        itemsConfirmedBy: user?.name,
      });
      setLogEntries(updated);
    }
  };

  const handleClearLogs = () => {
    clearVerificationLogs();
    setLogEntries([]);
  };

  return (
    <CustomerLayout
      showHeader={true}
      showFooter={true}
      maxWidthClass="max-w-4xl"
      onBack={() => navigate("/auth/role")}
      backLabel="Exit Security Station"
    >
      <div className="flex flex-1 flex-col qless-fade-in pb-16 w-full space-y-4">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between border-b border-black/5 pb-3">
          <button
            type="button"
            onClick={() => navigate("/auth/role")}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#7A8493] transition hover:text-[#0F2044]"
          >
            <IcBack />
            <span>Exit Station</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0F2044] px-3 py-1 text-[11px] font-bold text-white shadow-2xs">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              {user?.terminalId || "GATE TERMINAL #02"}
            </span>

            {user && (
              <span className="hidden sm:inline-block rounded-full bg-amber-100 border border-amber-200 px-2.5 py-0.5 text-[10px] font-bold text-amber-900">
                👤 {user.name} ({user.role})
              </span>
            )}

            <button
              type="button"
              onClick={() => {
                logout();
                navigate("/auth/guard");
              }}
              className="text-[11px] font-bold text-red-600 hover:text-red-700 bg-white border border-black/10 rounded-full px-2.5 py-0.5 shadow-2xs hover:bg-red-50 transition"
              title="Sign out of Guard Terminal"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Dashboard Title & Store Header Card */}
        <div className="rounded-2xl border border-white/70 bg-white/95 p-4 sm:p-5 shadow-sm backdrop-blur-md">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">🛡️</span>
                <div>
                  <h1 className="font-poppins text-lg sm:text-xl font-extrabold text-[#0F2044] tracking-tight">
                    Security Guard Verification Portal
                  </h1>
                  <p className="text-xs text-[#7A8493]">
                    Self-Checkout Automated Turnstile Gate &amp; Customer Exit Pass Inspector
                  </p>
                </div>
              </div>
            </div>

            <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-1">
              <span className="font-poppins text-xs font-bold text-[#0F2044]">
                {selectedStore?.name || "QLess Mart"}
              </span>
              <span className="text-[10px] text-[#7A8493]">{selectedStore?.branch || "Indiranagar Flagship"}</span>
            </div>
          </div>

          {/* Scanner Status Indicator & Shift Stats */}
          <div className="mt-4 pt-3 border-t border-black/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Real-time Status Indicator */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-[#7A8493] uppercase tracking-wider">
                Status:
              </span>
              <div
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${scanStatusInfo.badgeBg}`}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${scanStatusInfo.colorClass} ${
                    scanStatusInfo.pulse ? "animate-pulse" : ""
                  }`}
                />
                <span>{scanStatusInfo.label}</span>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs">
              <div>
                <span className="text-[10px] font-bold uppercase text-[#8A94A3]">Shift Cleared: </span>
                <span className="font-poppins font-bold text-[#2E9E44]">{verifiedCount} passes</span>
              </div>
              <span className="text-black/20 hidden sm:inline">|</span>
              <div>
                <span className="text-[10px] font-bold uppercase text-[#8A94A3]">Session Scans: </span>
                <span className="font-poppins font-bold text-[#0F2044]">{logEntries.length} total</span>
              </div>
              <span className="text-black/20 hidden sm:inline">|</span>
              <div>
                <span className="text-[10px] font-bold uppercase text-[#8A94A3]">Mode: </span>
                <span className="font-poppins font-bold text-blue-700">
                  {isSupabaseConfigured ? "Live Turnstile" : "Demo Check"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── LOADING SPINNER (While verifying against database) ── */}
        {isVerifying && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50/90 p-8 text-center shadow-sm backdrop-blur-md space-y-3 qless-scale-in">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-700 shadow-xs">
              <svg className="h-7 w-7 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
              </svg>
            </div>
            <h3 className="font-poppins text-base font-bold text-blue-950">
              Verifying Turnstile Gate Pass…
            </h3>
            <p className="text-xs text-blue-800 max-w-sm mx-auto leading-relaxed">
              Executing authoritative turnstile clearance RPC against supermarket database, checking payment status, and locking pass records.
            </p>
          </div>
        )}

        {/* ── CONDITIONAL: ACTIVE RESULT VIEW vs SCANNING PANEL ── */}
        {!isVerifying && activeResult ? (
          <VerificationResultView
            result={activeResult}
            guardName={user?.name}
            terminalId={user?.terminalId || "Gate Turnstile #02"}
            onScanNext={handleResetForNextScan}
            onInspectionUpdated={handleInspectionUpdated}
          />
        ) : !isVerifying ? (
          <div className="space-y-3.5">
            {/* Navigation Tabs */}
            <div className="flex rounded-2xl border border-black/10 bg-white/80 p-1 shadow-2xs backdrop-blur-sm gap-1">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("camera");
                  setIsCameraScanning(true);
                }}
                className={`flex-1 flex min-h-[44px] items-center justify-center gap-1 sm:gap-1.5 rounded-xl py-2 px-1 font-poppins text-[10.5px] sm:text-xs font-bold transition active:scale-95 ${
                  activeTab === "camera"
                    ? "bg-[#0F2044] text-white shadow-xs"
                    : "text-[#7A8493] hover:text-[#0F2044]"
                }`}
              >
                <span>📷</span>
                <span>Camera</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab("manual");
                  setIsCameraScanning(false);
                }}
                className={`flex-1 flex min-h-[44px] items-center justify-center gap-1 sm:gap-1.5 rounded-xl py-2 px-1 font-poppins text-[10.5px] sm:text-xs font-bold transition active:scale-95 ${
                  activeTab === "manual"
                    ? "bg-[#0F2044] text-white shadow-xs"
                    : "text-[#7A8493] hover:text-[#0F2044]"
                }`}
              >
                <span>⌨️</span>
                <span>Manual</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab("log");
                  setIsCameraScanning(false);
                }}
                className={`flex-1 flex min-h-[44px] items-center justify-center gap-1 sm:gap-1.5 rounded-xl py-2 px-1 font-poppins text-[10.5px] sm:text-xs font-bold transition active:scale-95 ${
                  activeTab === "log"
                    ? "bg-[#0F2044] text-white shadow-xs"
                    : "text-[#7A8493] hover:text-[#0F2044]"
                }`}
              >
                <span>📋</span>
                <span>Audit Log</span>
                {logEntries.length > 0 && (
                  <span className="rounded-full bg-emerald-500 text-white text-[9px] px-1.5 py-0.2">
                    {logEntries.length}
                  </span>
                )}
              </button>
            </div>

            {/* TAB 1: Camera QR Scanner */}
            {activeTab === "camera" && (
              <div className="rounded-2xl border border-white/60 bg-white/95 p-4 sm:p-5 shadow-sm backdrop-blur-md">
                <div className="mb-3 flex items-center justify-between border-b border-black/5 pb-2">
                  <div>
                    <h3 className="font-poppins text-xs font-bold text-[#0F2044]">
                      Live Turnstile Gate Scanner
                    </h3>
                    <p className="text-[10px] text-[#7A8493]">
                      Scan customer exit QR passes generated at self-checkout
                    </p>
                  </div>
                  <span className="rounded-full bg-[#EEF8F0] px-2.5 py-0.5 text-[10px] font-bold text-[#2E9E44]">
                    EXIT PASS QR ONLY
                  </span>
                </div>

                <GuardCameraScanner
                  isScanning={isCameraScanning}
                  onStartScanning={() => setIsCameraScanning(true)}
                  onStopScanning={() => setIsCameraScanning(false)}
                  onScanSuccess={handleProcessPayload}
                />
              </div>
            )}

            {/* TAB 2: Manual Pass ID Entry & Diagnostic Simulation */}
            {activeTab === "manual" && (
              <ManualVerificationTab
                onVerifyPayload={handleProcessPayload}
                orderHistory={orderHistory}
              />
            )}

            {/* TAB 3: Shift Activity Audit Log */}
            {activeTab === "log" && (
              <RecentVerificationsLog
                entries={logEntries}
                onClearLog={handleClearLogs}
              />
            )}
          </div>
        ) : null}

        {/* Global Return Link */}
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={() => navigate("/exit-pass")}
            className="text-xs font-semibold text-[#7A8493] hover:text-[#0F2044] hover:underline"
          >
            ← Switch to Shopper Mode (Customer Exit Pass)
          </button>
        </div>
      </div>
    </CustomerLayout>
  );
}
