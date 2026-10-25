import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { CompletedOrder, CartItem, PaymentMethod } from "../types";
import { saveOrderToHistory, getOrderById } from "../utils/orderStorage";
import { LAUNCH_STORE } from "../config/storeConfig";

export interface LiveExitPass {
  id: string;
  orderId: string;
  storeId: string;
  qrPayload: string;
  issuedAt: string;
  expiresAt: string;
  status: "ISSUED" | "VERIFIED" | "EXPIRED" | "REVOKED";
  verifiedAt?: string | null;
}

export interface CustomerOrderSyncResult {
  success: boolean;
  order?: CompletedOrder;
  exitPass?: LiveExitPass | null;
  paymentStatus?: "PENDING" | "CONFIRMED" | "FAILED" | "REFUNDED" | string;
  isConfirmed: boolean;
  isPending: boolean;
  isExitPassValid: boolean;
  isTerminal: boolean;
  notFound?: boolean;
  forbidden?: boolean;
  error?: string;
}

interface RawDbOrderWithItems {
  id: string;
  store_id: string;
  customer_id: string | null;
  session_id: string;
  receipt_id: string;
  subtotal: number | string;
  mrp_savings: number | string;
  coupon_code: string | null;
  coupon_discount: number | string;
  taxable_amount: number | string;
  cgst: number | string;
  sgst: number | string;
  tax_total: number | string;
  final_total: number | string;
  payment_method: "upi" | "card" | "wallet" | "cash";
  payment_status: "PENDING" | "CONFIRMED" | "FAILED" | "REFUNDED";
  payment_reference: string;
  paid_at: string;
  created_at: string;
  order_items?: Array<{
    id: string;
    product_id: number | null;
    product_name: string;
    barcode: string;
    unit_price: number | string;
    quantity: number;
    total_price: number | string;
    category?: string | null;
    unit_size?: string | null;
  }> | null;
}

interface RawDbExitPass {
  id: string;
  order_id: string;
  store_id: string;
  qr_payload: string;
  issued_at: string;
  expires_at: string;
  status: "ISSUED" | "VERIFIED" | "EXPIRED" | "REVOKED";
  verified_at: string | null;
}

/**
 * Fetches the authoritative order and its associated exit pass from Supabase.
 *
 * Security & Ownership Guarantees:
 * 1. Checks Supabase RLS through authenticated client.
 * 2. If currentUserId is passed, explicitly verifies order.customer_id === currentUserId.
 * 3. Never fabricates exit pass payloads on the frontend.
 * 4. Verifies database payment_status === 'CONFIRMED' before checking exit-pass record.
 * 5. Checks exit_pass status and expiration timestamp (expires_at > now).
 * 6. Keeps localStorage in sync with authoritative database state.
 */
export async function fetchCustomerOrderLive(
  orderId: string,
  currentUserId?: string
): Promise<CustomerOrderSyncResult> {
  const cleanOrderId = orderId.trim();
  if (!cleanOrderId) {
    return {
      success: false,
      isConfirmed: false,
      isPending: false,
      isExitPassValid: false,
      isTerminal: true,
      error: "Order identifier is required.",
    };
  }

  // 1. Prototype Simulation Fallback (when Supabase is genuinely unconfigured)
  if (!isSupabaseConfigured || !supabase) {
    const localOrder = getOrderById(cleanOrderId);
    if (!localOrder) {
      return {
        success: false,
        notFound: true,
        isConfirmed: false,
        isPending: false,
        isExitPassValid: false,
        isTerminal: true,
        error: `Order '${cleanOrderId}' was not found.`,
      };
    }

    const isConfirmed = localOrder.paymentStatus === "CONFIRMED";
    const isPending = localOrder.paymentStatus === "PENDING";
    const isTerminal = localOrder.paymentStatus === "FAILED" || localOrder.paymentStatus === "REFUNDED";

    return {
      success: true,
      order: localOrder,
      exitPass: null,
      paymentStatus: localOrder.paymentStatus,
      isConfirmed,
      isPending,
      isExitPassValid: isConfirmed,
      isTerminal,
    };
  }

  // 2. Authoritative Database Fetch (Supabase Configured)
  try {
    const { data: rawOrder, error: orderError } = await supabase
      .from("orders")
      .select(`
        id,
        store_id,
        customer_id,
        session_id,
        receipt_id,
        subtotal,
        mrp_savings,
        coupon_code,
        coupon_discount,
        taxable_amount,
        cgst,
        sgst,
        tax_total,
        final_total,
        payment_method,
        payment_status,
        payment_reference,
        paid_at,
        created_at,
        order_items (
          id,
          product_id,
          product_name,
          barcode,
          unit_price,
          quantity,
          total_price,
          category,
          unit_size
        )
      `)
      .eq("id", cleanOrderId)
      .maybeSingle();

    if (orderError) {
      console.warn("[QLess OrderSync] Error fetching customer order:", orderError.message);
      return {
        success: false,
        isConfirmed: false,
        isPending: false,
        isExitPassValid: false,
        isTerminal: false,
        error: orderError.message || "Failed to load order from database.",
      };
    }

    if (!rawOrder) {
      return {
        success: false,
        notFound: true,
        isConfirmed: false,
        isPending: false,
        isExitPassValid: false,
        isTerminal: true,
        error: `Order '${cleanOrderId}' was not found in the store database.`,
      };
    }

    const dbOrder = rawOrder as unknown as RawDbOrderWithItems;

    // 3. Customer Ownership Verification
    if (currentUserId && dbOrder.customer_id && dbOrder.customer_id !== currentUserId) {
      return {
        success: false,
        forbidden: true,
        isConfirmed: false,
        isPending: false,
        isExitPassValid: false,
        isTerminal: true,
        error: "Access Denied: You do not have permission to view this customer order.",
      };
    }

    const paymentStatus = dbOrder.payment_status;
    const isConfirmed = paymentStatus === "CONFIRMED";
    const isPending = paymentStatus === "PENDING";
    const isTerminal = paymentStatus === "FAILED" || paymentStatus === "REFUNDED";

    // 4. Fetch Exit Pass ONLY if Order is Confirmed
    let exitPass: LiveExitPass | null = null;
    let isExitPassValid = false;

    if (isConfirmed) {
      const { data: rawPass, error: passError } = await supabase
        .from("exit_passes")
        .select(`
          id,
          order_id,
          store_id,
          qr_payload,
          issued_at,
          expires_at,
          status,
          verified_at
        `)
        .eq("order_id", dbOrder.id)
        .maybeSingle();

      if (passError) {
        console.warn("[QLess OrderSync] Error fetching exit pass:", passError.message);
      } else if (rawPass) {
        const pass = rawPass as unknown as RawDbExitPass;
        exitPass = {
          id: pass.id,
          orderId: pass.order_id,
          storeId: pass.store_id,
          qrPayload: pass.qr_payload,
          issuedAt: pass.issued_at,
          expiresAt: pass.expires_at,
          status: pass.status,
          verifiedAt: pass.verified_at,
        };

        // Pass validity criteria:
        // 1. Status is ISSUED or VERIFIED (not REVOKED or EXPIRED)
        // 2. Expiration timestamp is strictly in the future (expires_at > now)
        const isExpired = new Date(pass.expires_at).getTime() <= Date.now();
        const isPermittedStatus = pass.status === "ISSUED" || pass.status === "VERIFIED";

        isExitPassValid = !isExpired && isPermittedStatus;
      }
    }

    // 5. Construct Domain CompletedOrder
    const mappedItems: CartItem[] = (dbOrder.order_items || []).map((item) => ({
      id: item.product_id || 0,
      name: item.product_name,
      price: Number(item.unit_price) || 0,
      quantity: item.quantity,
      unitSize: item.unit_size || undefined,
      category: item.category || undefined,
    }));

    const mappedOrder: CompletedOrder = {
      orderId: dbOrder.id,
      sessionId: dbOrder.session_id,
      receiptId: dbOrder.receipt_id,
      store: LAUNCH_STORE,
      items: mappedItems,
      itemCount: mappedItems.reduce((acc, i) => acc + i.quantity, 0),
      subtotal: Number(dbOrder.subtotal) || 0,
      mrpSavings: Number(dbOrder.mrp_savings) || 0,
      couponCode: dbOrder.coupon_code || undefined,
      couponDiscount: Number(dbOrder.coupon_discount) || 0,
      taxableAmount: Number(dbOrder.taxable_amount) || 0,
      cgst: Number(dbOrder.cgst) || 0,
      sgst: Number(dbOrder.sgst) || 0,
      taxTotal: Number(dbOrder.tax_total) || 0,
      finalTotal: Number(dbOrder.final_total) || 0,
      paymentMethod: dbOrder.payment_method as PaymentMethod,
      paymentReference: dbOrder.payment_reference,
      paidAt: dbOrder.paid_at,
      paymentStatus: dbOrder.payment_status,
      isLive: true,
      issuedAt: exitPass?.issuedAt,
      mockExpiry: exitPass?.expiresAt,
    };

    // 6. Synchronize Local Storage with Authoritative DB State
    saveOrderToHistory(mappedOrder);

    return {
      success: true,
      order: mappedOrder,
      exitPass,
      paymentStatus: dbOrder.payment_status,
      isConfirmed,
      isPending,
      isExitPassValid,
      isTerminal,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Network error syncing customer order";
    console.warn("[QLess OrderSync] Exception during customer order sync:", message);
    return {
      success: false,
      isConfirmed: false,
      isPending: false,
      isExitPassValid: false,
      isTerminal: false,
      error: message,
    };
  }
}
