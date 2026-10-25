import type { SupermarketStore } from "../types/index.ts";

/**
 * Phase 11: Authoritative Single Launch Store Configuration
 * Store: QLess Mart (STORE001 / QLM001)
 *
 * NOTE: For the initial rollout, QLess operates with ONE store.
 * Multi-store switching UI is disabled in the public experience.
 * The database schema maintains store_id foreign keys across all records
 * so future locations can be provisioned seamlessly.
 */
export const LAUNCH_STORE: SupermarketStore = {
  id: "STORE001",
  name: "QLess Mart",
  chain: "QLess Mart",
  branch: "HSR Layout Flagship",
  address: "14th Main Road, Sector 4, HSR Layout, Bengaluru, Karnataka 560102",
  distance: "In-Store Terminal",
  timing: "07:00 AM – 11:00 PM",
  isOpen: true,
  tagline: "Scan. Pay. Go. — Official Smart Self-Checkout Flagship",
  brandColor: "#0F2044",
  brandBg: "bg-blue-50 text-[#0F2044] border-blue-200",
};

export const LAUNCH_STORE_CODE = "QLM001";
export const LAUNCH_STORE_ID = "STORE001";
export const STORE_ID = LAUNCH_STORE_ID;
export const STORE_CODE = LAUNCH_STORE_CODE;

/**
 * Entrance QR Code Payload Specification
 * Requirement 5: Identifies STORE001 without exposing sensitive internal data.
 * Does NOT contain catalog, prices, exact inventory quantities, or credentials.
 */
export interface StoreEntranceQRPayload {
  type: "QLESS_STORE_ENTRY";
  storeCode: string;
  storeId?: string;
  timestamp?: number;
}

/**
 * Generates the standard entrance QR string placed at the supermarket gate.
 */
export function generateEntranceQRPayload(storeCode = LAUNCH_STORE_CODE): string {
  const payload: StoreEntranceQRPayload = {
    type: "QLESS_STORE_ENTRY",
    storeCode,
    storeId: LAUNCH_STORE_ID,
  };
  return JSON.stringify(payload);
}

/**
 * Helper to parse and check store entrance QR data
 */
export function parseStoreEntranceQR(raw: string): {
  isValid: boolean;
  storeCode?: string;
  error?: string;
} {
  try {
    const trimmed = raw.trim();
    if (!trimmed) {
      return {
        isValid: false,
        error: "Store QR code cannot be empty.",
      };
    }

    // Allow raw store code (e.g. 'QLM001') or structured JSON
    if (trimmed.toUpperCase() === LAUNCH_STORE_CODE) {
      return { isValid: true, storeCode: LAUNCH_STORE_CODE };
    }

    // If it's a raw non-JSON text (e.g. manual code entry), check directly
    if (!trimmed.startsWith("{")) {
      return {
        isValid: false,
        error: `Store code '${trimmed}' does not match the active launch supermarket (${LAUNCH_STORE_CODE} · QLess Mart).`,
      };
    }

    const data = JSON.parse(trimmed) as Partial<StoreEntranceQRPayload>;
    if (data.type === "QLESS_STORE_ENTRY" && data.storeCode) {
      if (data.storeCode.toUpperCase() === LAUNCH_STORE_CODE) {
        return { isValid: true, storeCode: LAUNCH_STORE_CODE };
      }
      return {
        isValid: false,
        error: `Store code '${data.storeCode}' does not match the active launch supermarket (${LAUNCH_STORE_CODE} · QLess Mart).`,
      };
    }

    return {
      isValid: false,
      error: "Invalid QR format. Please scan the official QLess Mart entrance gate QR code.",
    };
  } catch {
    return {
      isValid: false,
      error: "Malformed QR code payload. Could not decode entrance token.",
    };
  }
}
