import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { LAUNCH_STORE, LAUNCH_STORE_ID } from "../config/storeConfig";
import { VerificationLogEntry } from "../types";

export interface RawDbSecurityLog {
  id: string;
  store_id: string;
  order_id: string | null;
  receipt_id: string | null;
  guard_id: string | null;
  terminal_id: string;
  outcome: string;
  failure_reason: string | null;
  scanned_payload: string;
  has_discrepancy: boolean;
  discrepancy_note: string | null;
  created_at: string;
}

export interface LiveSecurityLogEntry extends VerificationLogEntry {
  storeId: string;
  guardId: string | null;
  terminalId: string;
  scannedPayload: string;
  createdAtRaw: string;
}

export interface FetchAdminSecurityLogsResult {
  logs: LiveSecurityLogEntry[];
  error: string | null;
}

/**
 * Safely maps a database security log record into a domain LiveSecurityLogEntry.
 * Extracts embedded payload metadata if available, but never invents fake metrics.
 */
export function mapDbSecurityLogToEntry(raw: RawDbSecurityLog): LiveSecurityLogEntry {
  let extractedItemCount = 0;
  let extractedFinalTotal = 0;

  // Attempt to parse JSON scanned_payload if present (e.g., from full QR payloads)
  if (raw.scanned_payload && raw.scanned_payload.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw.scanned_payload);
      if (typeof parsed.itemCount === "number") extractedItemCount = parsed.itemCount;
      if (typeof parsed.finalTotal === "number") extractedFinalTotal = parsed.finalTotal;
    } catch {
      // scanned_payload is not JSON or does not contain these fields; leave as zero
    }
  }

  const formattedTime = new Date(raw.created_at).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  return {
    id: raw.id,
    orderId: raw.order_id || "N/A",
    receiptId: raw.receipt_id || "N/A",
    storeName: LAUNCH_STORE.name,
    storeId: raw.store_id,
    guardId: raw.guard_id,
    terminalId: raw.terminal_id || "GATE-01",
    outcome: (raw.outcome === "success" || raw.outcome === "duplicate_warning" || raw.outcome === "failure")
      ? raw.outcome
      : "failure",
    failureReason: raw.failure_reason || undefined,
    timestamp: formattedTime,
    createdAtRaw: raw.created_at,
    hasDiscrepancy: Boolean(raw.has_discrepancy),
    discrepancyNote: raw.discrepancy_note || undefined,
    itemCount: extractedItemCount,
    finalTotal: extractedFinalTotal,
    scannedPayload: raw.scanned_payload,
  };
}

/**
 * Queries real audit events from public.security_logs for the specified store.
 * - Enforces store isolation (defaulting to STORE001).
 * - Orders newest first (created_at DESC).
 * - Enforced by RLS policy "Staff read store security logs" for STORE_ADMIN.
 * - Immutable: Does NOT provide deletion or mutation queries.
 * - Does not use service_role.
 */
export async function fetchAdminSecurityLogs(
  storeId: string = LAUNCH_STORE_ID
): Promise<FetchAdminSecurityLogsResult> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      logs: [],
      error: "Supabase connection is unconfigured. Security gate audit trail requires a live database connection.",
    };
  }

  try {
    const { data, error } = await supabase
      .from("security_logs")
      .select(`
        id,
        store_id,
        order_id,
        receipt_id,
        guard_id,
        terminal_id,
        outcome,
        failure_reason,
        scanned_payload,
        has_discrepancy,
        discrepancy_note,
        created_at
      `)
      .eq("store_id", storeId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[QLess AdminSecurity] Database query error:", error.message);
      return {
        logs: [],
        error: error.message || "Failed to load security audit logs from database.",
      };
    }

    if (!data) {
      return { logs: [], error: null };
    }

    const mapped = (data as unknown as RawDbSecurityLog[]).map(mapDbSecurityLogToEntry);
    return { logs: mapped, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error fetching security logs.";
    console.error("[QLess AdminSecurity] Unexpected exception:", message);
    return {
      logs: [],
      error: message,
    };
  }
}
