import { VerificationLogEntry } from "../types";

const SECURITY_LOG_STORAGE_KEY = "qless_verification_logs_v1";

/**
 * Retrieves security checkpoint verification log entries from localStorage.
 */
export function getVerificationLogs(): VerificationLogEntry[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(SECURITY_LOG_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item): item is VerificationLogEntry =>
        item &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        typeof item.orderId === "string" &&
        typeof item.outcome === "string"
    );
  } catch (err) {
    console.warn("QLess: Unable to read security logs from localStorage:", err);
    return [];
  }
}

/**
 * Appends a new verification log entry to persistent demonstration storage.
 */
export function saveVerificationLogEntry(entry: VerificationLogEntry): VerificationLogEntry[] {
  if (!entry || !entry.id) return getVerificationLogs();

  try {
    const current = getVerificationLogs();
    const updated = [entry, ...current];
    window.localStorage.setItem(SECURITY_LOG_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.warn("QLess: Failed to save verification log to localStorage:", err);
    return getVerificationLogs();
  }
}

/**
 * Updates an existing verification log entry (e.g. when discrepancy notes are recorded).
 */
export function updateVerificationLogEntry(
  id: string,
  updates: Partial<VerificationLogEntry>
): VerificationLogEntry[] {
  try {
    const current = getVerificationLogs();
    const updated = current.map((entry) =>
      entry.id === id ? { ...entry, ...updates } : entry
    );
    window.localStorage.setItem(SECURITY_LOG_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.warn("QLess: Failed to update verification log:", err);
    return getVerificationLogs();
  }
}

/**
 * Clears the demonstration verification log history.
 */
export function clearVerificationLogs(): void {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(SECURITY_LOG_STORAGE_KEY);
    }
  } catch (err) {
    console.warn("QLess: Failed to clear verification logs:", err);
  }
}

/**
 * Persists guard physical item inspection confirmation.
 * Validates server authorization and records immutable audit log in public.security_logs.
 */
export async function confirmPhysicalItemInspection({
  orderId,
  terminalId = "Gate Turnstile #02",
  itemsChecked,
  hasDiscrepancy = false,
  discrepancyNote,
}: {
  orderId: string;
  terminalId?: string;
  itemsChecked: number;
  hasDiscrepancy?: boolean;
  discrepancyNote?: string;
}): Promise<{
  success: boolean;
  confirmedAt: string;
  error?: string;
  isDatabasePersisted: boolean;
}> {
  const confirmedAt = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // Dynamically check Supabase client to avoid circular dependencies
  try {
    const { supabase, isSupabaseConfigured } = await import("../lib/supabase.ts");
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await (supabase.rpc as any)("confirm_guard_item_inspection", {
        p_order_id: orderId,
        p_terminal_id: terminalId,
        p_items_checked: itemsChecked,
        p_has_discrepancy: hasDiscrepancy,
        p_discrepancy_note: discrepancyNote || null,
      });

      if (error) {
        console.warn("[QLess Guard] confirm_guard_item_inspection RPC error:", error.message);
        return {
          success: false,
          confirmedAt,
          error: error.message || "Failed to persist inspection to server database.",
          isDatabasePersisted: false,
        };
      }

      if (data && data.success === false) {
        return {
          success: false,
          confirmedAt,
          error: data.error || "Inspection confirmation was denied.",
          isDatabasePersisted: false,
        };
      }

      return {
        success: true,
        confirmedAt: data?.confirmedAt
          ? new Date(data.confirmedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : confirmedAt,
        isDatabasePersisted: true,
      };
    }
  } catch (err: unknown) {
    console.warn("[QLess Guard] Exception verifying item inspection via Supabase:", err);
    return {
      success: false,
      confirmedAt,
      error: err instanceof Error ? err.message : "Network error contacting server.",
      isDatabasePersisted: false,
    };
  }

  // Demonstration local fallback mode (unconfigured credentials)
  return {
    success: true,
    confirmedAt,
    isDatabasePersisted: false,
  };
}
