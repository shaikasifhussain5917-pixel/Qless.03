import type { CompletedOrder, ExitQRPayload } from "../types/index.ts";
import { fmt } from "./formatters.ts";

/**
 * Storage key for persisting completed mock orders.
 *
 * NOTE: localStorage is utilized purely for client-side demonstration
 * and offline prototype persistence. Production enterprise architectures
 * require secure, tamper-proof server-side order storage with cryptographically
 * signed verification tokens.
 */
const STORAGE_KEY = "qless_order_history_v1";

/**
 * Safely retrieves stored orders from localStorage with corruption resilience.
 */
export function getOrderHistory(): CompletedOrder[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Filter and sanitize entries to guard against corrupted or invalid storage data
    return parsed.filter(
      (item): item is CompletedOrder =>
        item &&
        typeof item === "object" &&
        typeof item.orderId === "string" &&
        typeof item.finalTotal === "number" &&
        Array.isArray(item.items)
    );
  } catch (err) {
    console.warn("QLess: Unable to read order history from localStorage, resetting fallback:", err);
    return [];
  }
}

/**
 * Saves a completed order into localStorage, preventing duplicate entries.
 * Never stores sensitive card details, CVV, or passwords.
 */
export function saveOrderToHistory(order: CompletedOrder): CompletedOrder[] {
  if (!order || !order.orderId) return getOrderHistory();

  try {
    const current = getOrderHistory();

    const existingIndex = current.findIndex((o) => o.orderId === order.orderId);

    const now = new Date();
    const expiry = new Date(now.getTime() + 60 * 60 * 1000); // Valid for 1 hour

    // For demo orders, ensure mock pass expiry timestamps exist.
    // For live orders, do NOT generate fake exit pass timestamps while payment is PENDING!
    const sanitizedOrder: CompletedOrder = order.isLive
      ? {
          ...order,
          paymentStatus: order.paymentStatus || "PENDING",
          issuedAt: order.paymentStatus === "CONFIRMED" ? (order.issuedAt || now.toISOString()) : undefined,
          mockExpiry: order.paymentStatus === "CONFIRMED" ? (order.mockExpiry || expiry.toISOString()) : undefined,
        }
      : {
          ...order,
          isLive: false,
          paymentStatus: order.paymentStatus || (order.paymentMethod === "cash" ? "PENDING" : "CONFIRMED"),
          issuedAt: (order.paymentStatus === "CONFIRMED" || (!order.paymentStatus && order.paymentMethod !== "cash")) ? (order.issuedAt || now.toISOString()) : undefined,
          mockExpiry: (order.paymentStatus === "CONFIRMED" || (!order.paymentStatus && order.paymentMethod !== "cash")) ? (order.mockExpiry || expiry.toISOString()) : undefined,
        };

    let updated: CompletedOrder[];
    if (existingIndex !== -1) {
      updated = [...current];
      updated[existingIndex] = sanitizedOrder;
    } else {
      updated = [sanitizedOrder, ...current];
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.warn("QLess: Failed to persist order to localStorage:", err);
    return getOrderHistory();
  }
}

/**
 * Looks up an order by its unique orderId or receiptId.
 */
export function getOrderById(id: string): CompletedOrder | undefined {
  if (!id) return undefined;
  try {
    const cleanId = decodeURIComponent(id).trim().toLowerCase();
    const history = getOrderHistory();
    return history.find(
      (o) =>
        o.orderId.toLowerCase() === cleanId ||
        o.receiptId.toLowerCase() === cleanId
    );
  } catch {
    const cleanId = id.trim().toLowerCase();
    const history = getOrderHistory();
    return history.find(
      (o) =>
        o.orderId.toLowerCase() === cleanId ||
        o.receiptId.toLowerCase() === cleanId
    );
  }
}

/**
 * Generates an exit QR pass payload string.
 * NOTE: Frontend simulation only. Does not claim cryptographic signing.
 */
export function createExitQRPayload(order: CompletedOrder): string {
  // Never generate an exit pass payload for pending orders!
  if (order.paymentStatus !== "CONFIRMED") {
    return JSON.stringify({
      orderId: order.orderId,
      receiptId: order.receiptId,
      storeId: order.store?.id || "STORE001",
      storeName: order.store?.name || "QLess Mart",
      status: "PENDING_PAYMENT",
      message: "Payment is pending. This pass is not valid for turnstile clearance.",
    });
  }

  const payload: ExitQRPayload = {
    orderId: order.orderId,
    receiptId: order.receiptId,
    storeId: order.store?.id || "STORE001",
    storeName: order.store?.name || "QLess Mart",
    itemCount: order.itemCount,
    finalTotal: order.finalTotal,
    status: "PAID_SIMULATED",
    issuedAt: order.issuedAt || new Date().toISOString(),
    mockExpiry: order.mockExpiry || new Date(Date.now() + 3600000).toISOString(),
  };

  return JSON.stringify(payload);
}

/**
 * Formats a clean printable plain-text invoice receipt for download.
 */
export function formatReceiptText(order: CompletedOrder): string {
  const line = "==================================================";
  const divider = "--------------------------------------------------";

  let out = "";
  out += `${line}\n`;
  out += `          QLESS SMART SELF-CHECKOUT\n`;
  out += `           OFFICIAL DIGITAL RECEIPT\n`;
  out += `${line}\n`;
  out += `Store:      ${order.store?.name || "Supermarket"}\n`;
  out += `Branch:     ${order.store?.branch || "Self-Checkout Bay"}\n`;
  out += `Address:    ${order.store?.address || "Store Bay"}\n`;
  out += `Order Ref:  ${order.orderId}\n`;
  out += `Receipt ID: ${order.receiptId}\n`;
  out += `Session:    #${order.sessionId}\n`;
  out += `Date & Time:${order.paidAt}\n`;
  out += `Status:     PAID (SIMULATED)\n`;
  out += `Payment:    ${order.paymentMethod.toUpperCase()} (${order.paymentReference})\n`;
  out += `${divider}\n`;
  out += `ITEMS PURCHASED:\n`;

  for (const item of order.items) {
    const itemTotal = fmt(item.price * item.quantity);
    out += `  ${item.name}\n`;
    out += `    ${item.unitSize ? `[${item.unitSize}] ` : ""}${item.quantity} x ${fmt(item.price)} = ${itemTotal}\n`;
  }

  out += `${divider}\n`;
  out += `Subtotal:                ${fmt(order.subtotal)}\n`;
  if (order.mrpSavings > 0) {
    out += `Store MRP Savings:      -${fmt(order.mrpSavings)}\n`;
  }
  if (order.couponDiscount > 0) {
    out += `Coupon (${order.couponCode || "DISC"}):   -${fmt(order.couponDiscount)}\n`;
  }
  out += `${divider}\n`;
  out += `FINAL AMOUNT PAID:       ${fmt(order.finalTotal)}\n`;
  out += `${line}\n`;
  out += `Thank you for shopping queue-free with QLess!\n`;
  out += `Present your Exit QR Pass at the security gate.\n`;
  out += `* This is a simulated demonstration receipt.\n`;
  out += `${line}\n`;

  return out;
}

/**
 * Triggers a browser file download of the receipt text file.
 */
export function downloadReceiptFile(order: CompletedOrder): void {
  const content = formatReceiptText(order);
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `QLess-Receipt-${order.orderId}.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
