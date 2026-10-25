import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { CompletedOrder, CartItem, PaymentMethod } from "../types";
import { LAUNCH_STORE, LAUNCH_STORE_ID } from "../config/storeConfig";

export interface RawDbAdminOrderItem {
  id: string;
  product_id: number | null;
  product_name: string;
  barcode: string;
  unit_price: number | string;
  quantity: number;
  total_price: number | string;
  category?: string | null;
  unit_size?: string | null;
}

export interface RawDbAdminOrder {
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
  paid_at: string;
  created_at: string;
  order_items?: RawDbAdminOrderItem[] | null;
}

export interface FetchAdminOrdersResult {
  orders: CompletedOrder[];
  error: string | null;
}

/**
 * Maps raw database order and its order_items into domain CompletedOrder format.
 * Preserves actual database fields without fabricating missing customer or store details.
 */
export function mapDbOrderToCompletedOrder(raw: RawDbAdminOrder): CompletedOrder {
  const mappedItems: CartItem[] = (raw.order_items || []).map((item) => ({
    id: item.product_id || 0,
    name: item.product_name,
    price: Number(item.unit_price) || 0,
    quantity: item.quantity,
    unitSize: item.unit_size || undefined,
    category: (item.category as any) || undefined,
  }));

  const calculatedItemCount = mappedItems.reduce((acc, i) => acc + i.quantity, 0);

  return {
    orderId: raw.id,
    sessionId: raw.session_id,
    receiptId: raw.receipt_id,
    store: {
      ...LAUNCH_STORE,
      id: raw.store_id || LAUNCH_STORE_ID,
    },
    items: mappedItems,
    itemCount: calculatedItemCount,
    subtotal: Number(raw.subtotal) || 0,
    mrpSavings: Number(raw.mrp_savings) || 0,
    couponCode: raw.coupon_code || undefined,
    couponDiscount: Number(raw.coupon_discount) || 0,
    taxableAmount: Number(raw.taxable_amount) || 0,
    cgst: Number(raw.cgst) || 0,
    sgst: Number(raw.sgst) || 0,
    taxTotal: Number(raw.tax_total) || 0,
    finalTotal: Number(raw.final_total) || 0,
    paymentMethod: (raw.payment_method || "cash").toLowerCase() as PaymentMethod,
    paymentReference: raw.payment_reference,
    paidAt: raw.paid_at ? new Date(raw.paid_at).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }) : raw.created_at,
    paymentStatus: raw.payment_status,
    customerId: raw.customer_id,
    createdAt: raw.created_at,
    isLive: true,
  };
}

/**
 * Queries real orders from public.orders joined with order_items for the given store.
 * - Enforces store isolation (defaulting to STORE001).
 * - Orders by created_at DESC (newest first).
 * - Uses existing authenticated Supabase client under RLS ("Staff read assigned store orders").
 * - Does not use service_role.
 * - Does not modify or delete any database records.
 */
export async function fetchAdminOrders(
  storeId: string = LAUNCH_STORE_ID
): Promise<FetchAdminOrdersResult> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      orders: [],
      error: "Supabase connection is unconfigured. Admin transaction feed requires a live database connection.",
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
      .eq("store_id", storeId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[QLess AdminOrders] Database query error:", error.message);
      return {
        orders: [],
        error: error.message || "Failed to load store orders from database.",
      };
    }

    if (!data) {
      return { orders: [], error: null };
    }

    const mapped = (data as unknown as RawDbAdminOrder[]).map(mapDbOrderToCompletedOrder);
    return { orders: mapped, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error fetching admin orders.";
    console.error("[QLess AdminOrders] Unexpected exception:", message);
    return {
      orders: [],
      error: message,
    };
  }
}
