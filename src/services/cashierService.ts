import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { LAUNCH_STORE_ID } from "../config/storeConfig";

export interface CashierOrderItem {
  id: string;
  productId: number | null;
  productName: string;
  barcode: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  category?: string | null;
  unitSize?: string | null;
}

export interface CashierPendingOrder {
  id: string;
  storeId: string;
  customerId: string | null;
  sessionId: string;
  receiptId: string;
  subtotal: number;
  mrpSavings: number;
  couponCode: string | null;
  couponDiscount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  taxTotal: number;
  finalTotal: number;
  paymentMethod: "cash";
  paymentStatus: "PENDING" | "CONFIRMED" | "FAILED" | "REFUNDED";
  paymentReference: string;
  createdAt: string;
  paidAt?: string | null;
  items: CashierOrderItem[];
}

export interface ConfirmCashPaymentResult {
  success: boolean;
  orderId?: string;
  message?: string;
  error?: string;
  isNetworkError?: boolean;
  confirmedOrder?: CashierPendingOrder;
}

interface RawDbOrder {
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
  payment_method: string;
  payment_status: string;
  payment_reference: string;
  created_at: string;
  paid_at: string | null;
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

function mapRawOrder(raw: RawDbOrder): CashierPendingOrder {
  return {
    id: raw.id,
    storeId: raw.store_id,
    customerId: raw.customer_id,
    sessionId: raw.session_id,
    receiptId: raw.receipt_id,
    subtotal: Number(raw.subtotal) || 0,
    mrpSavings: Number(raw.mrp_savings) || 0,
    couponCode: raw.coupon_code,
    couponDiscount: Number(raw.coupon_discount) || 0,
    taxableAmount: Number(raw.taxable_amount) || 0,
    cgst: Number(raw.cgst) || 0,
    sgst: Number(raw.sgst) || 0,
    taxTotal: Number(raw.tax_total) || 0,
    finalTotal: Number(raw.final_total) || 0,
    paymentMethod: "cash",
    paymentStatus: raw.payment_status as CashierPendingOrder["paymentStatus"],
    paymentReference: raw.payment_reference,
    createdAt: raw.created_at,
    paidAt: raw.paid_at,
    items: (raw.order_items || []).map((item) => ({
      id: item.id,
      productId: item.product_id,
      productName: item.product_name,
      barcode: item.barcode,
      unitPrice: Number(item.unit_price) || 0,
      quantity: item.quantity,
      totalPrice: Number(item.total_price) || 0,
      category: item.category,
      unitSize: item.unit_size,
    })),
  };
}

/**
 * Fetches all pending cash orders for the specified store from public.orders.
 * Cashiers have SELECT access via RLS policy "Staff read assigned store orders".
 */
export async function fetchPendingCashOrders(
  storeId: string = LAUNCH_STORE_ID
): Promise<{ orders: CashierPendingOrder[]; error?: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      orders: [],
      error: "Supabase connection is unconfigured. Cashier desk requires a live database connection.",
    };
  }

  try {
    const { data, error } = await supabase
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
        created_at,
        paid_at,
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
      .eq("store_id", storeId)
      .eq("payment_status", "PENDING")
      .eq("payment_method", "cash")
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("[QLess Cashier] fetchPendingCashOrders failed:", error.message);
      return {
        orders: [],
        error: error.message || "Failed to load pending cash orders from store database.",
      };
    }

    const rawOrders = (data as unknown as RawDbOrder[]) || [];
    const orders = rawOrders.map(mapRawOrder);
    return { orders };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network error fetching pending orders";
    console.warn("[QLess Cashier] fetchPendingCashOrders exception:", msg);
    return { orders: [], error: msg };
  }
}

/**
 * Searches the pending orders in memory by order ID, receipt ID, or session ID.
 */
export function searchPendingCashOrders(
  orders: CashierPendingOrder[],
  query: string
): CashierPendingOrder[] {
  const q = query.trim().toLowerCase();
  if (!q) return orders;

  return orders.filter(
    (o) =>
      o.id.toLowerCase().includes(q) ||
      o.receiptId.toLowerCase().includes(q) ||
      o.sessionId.toLowerCase().includes(q)
  );
}

/**
 * Fetches single order by ID to authoritatively verify payment status.
 */
export async function fetchOrderDetails(
  orderId: string,
  storeId: string = LAUNCH_STORE_ID
): Promise<{ order: CashierPendingOrder | null; error?: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { order: null, error: "Database not configured." };
  }

  try {
    const { data, error } = await supabase
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
        created_at,
        paid_at,
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
      .eq("id", orderId.trim())
      .eq("store_id", storeId)
      .maybeSingle();

    if (error) {
      return { order: null, error: error.message };
    }

    if (!data) {
      return { order: null, error: `Order '${orderId}' not found in store database.` };
    }

    return { order: mapRawOrder(data as unknown as RawDbOrder) };
  } catch (err: unknown) {
    return {
      order: null,
      error: err instanceof Error ? err.message : "Error verifying order status.",
    };
  }
}

/**
 * Confirms cash payment for an order by invoking the secure database RPC function:
 * public.confirm_cash_order_payment(p_order_id TEXT)
 *
 * Requirements:
 * - Caller must be an authenticated cashier or store_admin in public.store_staff.
 * - Order must have payment_method = 'cash'.
 * - Cashiers cannot confirm their own personal orders (segregation of duties).
 * - After RPC success, re-verifies authoritative order status in public.orders before reporting success.
 */
export async function confirmCashPayment(
  orderId: string,
  storeId: string = LAUNCH_STORE_ID
): Promise<ConfirmCashPaymentResult> {
  const cleanOrderId = orderId.trim();
  if (!cleanOrderId) {
    return { success: false, error: "Order reference is required." };
  }

  if (!isSupabaseConfigured || !supabase) {
    return {
      success: false,
      error: "Supabase connection is unconfigured. Cannot perform cash payment reconciliation.",
    };
  }

  // 1. Invoke the secure database RPC function
  let rpcData: unknown = null;
  try {
    const { data, error } = await (supabase.rpc as any)("confirm_cash_order_payment", {
      p_order_id: cleanOrderId,
    });

    if (error) {
      console.warn("[QLess Cashier] confirm_cash_order_payment RPC error:", error.message);
      const isNetwork =
        error.message?.toLowerCase().includes("failed to fetch") ||
        error.message?.toLowerCase().includes("network") ||
        error.message?.toLowerCase().includes("timeout") ||
        error.message?.toLowerCase().includes("aborted");

      return {
        success: false,
        error: error.message || "Failed to confirm cash settlement in store database.",
        isNetworkError: isNetwork,
      };
    }

    rpcData = data;
  } catch (err: unknown) {
    console.warn("[QLess Cashier] confirm_cash_order_payment exception:", err);
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "An unexpected network error occurred while reconciling cash payment.",
      isNetworkError: true,
    };
  }

  // 2. Validate RPC payload response
  if (!rpcData || typeof rpcData !== "object") {
    return {
      success: false,
      error: "Invalid or empty response received from cash payment settlement procedure.",
    };
  }

  const payload = rpcData as {
    success?: boolean;
    error?: string;
    message?: string;
    orderId?: string;
    confirmedAt?: string;
    cashierId?: string;
  };

  if (!payload.success) {
    return {
      success: false,
      error: payload.error || "Cash settlement was declined by the store database.",
    };
  }

  // 3. Authoritative Database Verification (Step 4)
  // Re-fetch the order directly from public.orders to guarantee that payment_status is CONFIRMED
  // and payment_method is cash, relying on database state rather than assuming frontend optimism.
  const { order: verifiedOrder, error: verifyError } = await fetchOrderDetails(
    cleanOrderId,
    storeId
  );

  if (verifyError || !verifiedOrder) {
    return {
      success: false,
      error:
        "Cash payment was recorded, but authoritative verification failed. Please refresh the queue to inspect current order status.",
      isNetworkError: true,
    };
  }

  if (verifiedOrder.paymentStatus !== "CONFIRMED") {
    return {
      success: false,
      error: `Order payment status is '${verifiedOrder.paymentStatus}', expected 'CONFIRMED'. Payment reconciliation unverified.`,
    };
  }

  return {
    success: true,
    orderId: cleanOrderId,
    message: payload.message || "Cash payment confirmed and turnstile gate pass issued.",
    confirmedOrder: verifiedOrder,
  };
}
