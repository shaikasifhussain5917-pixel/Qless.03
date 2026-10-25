import { supabase, isSupabaseConfigured } from "../lib/supabase.ts";
import type { Json } from "../types/database.types.ts";
import type { CompletedOrder } from "../types/index.ts";

/**
 * Sanitized item structure submitted to PostgreSQL.
 * Discards all client-calculated prices, totals, discounts, names, MRP, or GST.
 */
export interface CheckoutCartItemPayload {
  productId: number;
  quantity: number;
}

/**
 * Acceptable payment methods recognized by public.process_self_checkout_order.
 */
export type CheckoutPaymentMethod = "upi" | "card" | "wallet" | "cash";

const VALID_PAYMENT_METHODS: ReadonlySet<string> = new Set<CheckoutPaymentMethod>([
  "upi",
  "card",
  "wallet",
  "cash",
]);

/**
 * Input arguments for processCheckoutOrder.
 * The idempotency key must be supplied by the caller (retained for identical retries).
 */
export interface ProcessCheckoutOrderParams {
  storeId: string;
  items: Array<{ productId?: number; id?: number; quantity: number }>;
  paymentMethod: string;
  idempotencyKey: string;
  couponCode?: string | null;
}

/**
 * Authoritative response returned by public.process_self_checkout_order RPC.
 */
export interface CheckoutOrderResult {
  success: boolean;
  orderId?: string;
  receiptId?: string;
  storeId?: string;
  itemCount?: number;
  subtotal?: number;
  mrpSavings?: number;
  couponCode?: string | null;
  couponDiscount?: number;
  taxableAmount?: number;
  cgst?: number;
  sgst?: number;
  taxTotal?: number;
  finalTotal?: number;
  paymentMethod?: string;
  paymentStatus?: string;
  isDuplicate?: boolean;
  isNetworkError?: boolean;
  order?: CompletedOrder;
  message?: string;
  error?: string;
}

/**
 * Validates and sanitizes cart items to strict `{ productId, quantity }` payload.
 *
 * Rules:
 * - Rejects empty carts
 * - Rejects invalid product IDs (non-integer, <= 0)
 * - Rejects non-integer or non-positive quantities (<= 0)
 * - Rejects duplicate product IDs
 * - Strips any client-calculated pricing, MRP, discounts, or metadata
 */
export function sanitizeCheckoutItems(
  items: Array<{ productId?: number; id?: number; quantity: number }>
): { valid: true; items: CheckoutCartItemPayload[] } | { valid: false; error: string } {
  if (!Array.isArray(items) || items.length === 0) {
    return { valid: false, error: "Cart is empty. Please add items to checkout." };
  }

  const seenIds = new Set<number>();
  const sanitized: CheckoutCartItemPayload[] = [];

  for (let i = 0; i < items.length; i++) {
    const raw = items[i];
    if (!raw || typeof raw !== "object") {
      return { valid: false, error: `Malformed cart item at index ${i}.` };
    }

    // Support either productId or id from CartItem
    const rawId = raw.productId !== undefined ? raw.productId : raw.id;
    const rawQty = raw.quantity;

    if (rawId === undefined || rawId === null) {
      return { valid: false, error: `Missing product ID at index ${i}.` };
    }

    const productId = Number(rawId);
    if (!Number.isInteger(productId) || productId <= 0) {
      return {
        valid: false,
        error: `Invalid product ID (${rawId}) at index ${i}: must be a positive integer.`,
      };
    }

    const quantity = Number(rawQty);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return {
        valid: false,
        error: `Invalid quantity for product ${productId}: must be a positive integer (at least 1).`,
      };
    }

    if (seenIds.has(productId)) {
      return { valid: false, error: `Duplicate product ID ${productId} in cart.` };
    }

    seenIds.add(productId);
    sanitized.push({ productId, quantity });
  }

  return { valid: true, items: sanitized };
}

/**
 * Validates checkout parameters before RPC dispatch.
 */
export function validateCheckoutParams(
  params: ProcessCheckoutOrderParams
): { valid: true; sanitizedItems: CheckoutCartItemPayload[] } | { valid: false; error: string } {
  if (!params || typeof params !== "object") {
    return { valid: false, error: "Invalid checkout parameters." };
  }

  const cleanStoreId = params.storeId?.trim();
  if (!cleanStoreId) {
    return { valid: false, error: "Store ID is required." };
  }

  const cleanKey = params.idempotencyKey?.trim();
  if (!cleanKey) {
    return { valid: false, error: "Missing or empty idempotency key." };
  }

  const cleanMethod = params.paymentMethod?.trim().toLowerCase();
  if (!cleanMethod || !VALID_PAYMENT_METHODS.has(cleanMethod)) {
    return {
      valid: false,
      error: `Invalid payment method: '${params.paymentMethod}'. Supported methods: upi, card, wallet, cash.`,
    };
  }

  // Razorpay Test Mode: Allow 'cash', 'upi', and 'card'.
  // 'wallet' remains temporarily disabled during test mode.
  if (cleanMethod === "wallet") {
    return {
      valid: false,
      error: "QLess Wallet is not supported during Razorpay Test Mode. Please choose UPI, Card, or Cash.",
    };
  }

  const itemsResult = sanitizeCheckoutItems(params.items);
  if (!itemsResult.valid) {
    return itemsResult;
  }

  return { valid: true, sanitizedItems: itemsResult.items };
}

/**
 * Executes authoritative self-checkout order processing via Supabase RPC.
 *
 * Calls:
 * public.process_self_checkout_order(
 *   p_store_id,
 *   p_items,
 *   p_payment_method,
 *   p_idempotency_key,
 *   p_coupon_code
 * )
 *
 * Security Guarantees:
 * - Submits only store ID, sanitized items array, payment method, idempotency key, and coupon code.
 * - Never sends client prices, subtotals, GST, or final totals.
 * - Requires caller-managed idempotency key (preventing duplicate creations on retry).
 * - Never confirms payments or marks orders as paid from the client.
 * - Returns clean, typed errors without exposing secrets or connection strings.
 */
export async function processCheckoutOrder(
  params: ProcessCheckoutOrderParams
): Promise<CheckoutOrderResult> {
  // 1. Client-side pre-flight validation
  const validation = validateCheckoutParams(params);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // 2. Verify Supabase configuration
  if (!isSupabaseConfigured || !supabase) {
    return {
      success: false,
      error: "Supabase client is not configured or unavailable. Live checkout requires configured credentials.",
    };
  }

  const cleanStoreId = params.storeId.trim();
  const cleanKey = params.idempotencyKey.trim();
  const cleanMethod = params.paymentMethod.trim().toLowerCase();
  const cleanCoupon =
    params.couponCode && params.couponCode.trim() !== ""
      ? params.couponCode.trim().toUpperCase()
      : null;

  try {
    // 3. Dispatch authoritative RPC
    const rpcArgs = {
      p_store_id: cleanStoreId,
      p_items: validation.sanitizedItems as unknown as Json,
      p_payment_method: cleanMethod,
      p_idempotency_key: cleanKey,
      p_coupon_code: cleanCoupon,
    };

    const { data, error } = await (supabase.rpc as any)("process_self_checkout_order", rpcArgs);

    // 4. Handle PostgREST transport / execution error
    if (error) {
      console.warn("[QLess Checkout] process_self_checkout_order RPC error:", error.message);
      const isNetwork =
        error.message?.toLowerCase().includes("failed to fetch") ||
        error.message?.toLowerCase().includes("network") ||
        error.message?.toLowerCase().includes("timeout") ||
        error.message?.toLowerCase().includes("connection") ||
        error.message?.toLowerCase().includes("aborted");
      return {
        success: false,
        error: error.message || "An unexpected error occurred during database checkout processing.",
        isNetworkError: isNetwork,
      };
    }

    if (!data || typeof data !== "object") {
      return {
        success: false,
        error: "Malformed response received from checkout transaction.",
      };
    }

    const payload = data as Record<string, unknown>;

    // 5. Handle business logic rejection from the function
    if (payload.success === false) {
      const errMsg = typeof payload.error === "string" ? payload.error : "Checkout was declined by the store database.";
      return {
        success: false,
        error: errMsg,
        isNetworkError: false,
      };
    }

    // 6. Return authoritative order details
    return {
      success: true,
      orderId: typeof payload.orderId === "string" ? payload.orderId : undefined,
      receiptId: typeof payload.receiptId === "string" ? payload.receiptId : undefined,
      storeId: typeof payload.storeId === "string" ? payload.storeId : cleanStoreId,
      finalTotal: typeof payload.finalTotal === "number" ? payload.finalTotal : Number(payload.finalTotal) || 0,
      paymentMethod: typeof payload.paymentMethod === "string" ? payload.paymentMethod : cleanMethod,
      paymentStatus: typeof payload.paymentStatus === "string" ? payload.paymentStatus : "PENDING",
      isDuplicate: Boolean(payload.isDuplicate),
      message: typeof payload.message === "string" ? payload.message : undefined,
      // Present on new order creation:
      itemCount: typeof payload.itemCount === "number" ? payload.itemCount : payload.itemCount ? Number(payload.itemCount) : undefined,
      subtotal: typeof payload.subtotal === "number" ? payload.subtotal : payload.subtotal ? Number(payload.subtotal) : undefined,
      mrpSavings: typeof payload.mrpSavings === "number" ? payload.mrpSavings : payload.mrpSavings ? Number(payload.mrpSavings) : undefined,
      couponCode: typeof payload.couponCode === "string" ? payload.couponCode : (payload.couponCode as null | undefined),
      couponDiscount: typeof payload.couponDiscount === "number" ? payload.couponDiscount : payload.couponDiscount ? Number(payload.couponDiscount) : undefined,
      taxableAmount: typeof payload.taxableAmount === "number" ? payload.taxableAmount : payload.taxableAmount ? Number(payload.taxableAmount) : undefined,
      cgst: typeof payload.cgst === "number" ? payload.cgst : payload.cgst ? Number(payload.cgst) : undefined,
      sgst: typeof payload.sgst === "number" ? payload.sgst : payload.sgst ? Number(payload.sgst) : undefined,
      taxTotal: typeof payload.taxTotal === "number" ? payload.taxTotal : payload.taxTotal ? Number(payload.taxTotal) : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error during checkout";
    console.warn("[QLess Checkout] Network exception during checkout dispatch:", message);
    return {
      success: false,
      error: message,
      isNetworkError: true,
    };
  }
}
