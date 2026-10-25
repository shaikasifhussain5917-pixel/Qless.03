// ============================================================================
// QLess Smart Shopping - Scheduled Edge Function: Reconcile Expired Orders
// Store: STORE001 (QLess Mart)
//
// PURPOSE:
// Reconciles pending digital orders whose payment window has passed.
//
// FIX 4 CONSERVATIVE SAFETY POLICY:
// 1. Queries both the Razorpay Order entity and the Payment attempts list.
// 2. Never treats an empty /payments list as proof that payment is impossible.
// 3. Enforces a 15-minute additional safety grace buffer beyond payment_attempt_expires_at.
// 4. If status is 'paid', confirms order instead of cancelling.
// 5. If status is 'attempted' or attempts > 0, defers cancellation (in-flight payment).
// 6. Only cancels if:
//    - No gateway order was attached, OR
//    - Past the safety grace buffer AND status is strictly 'created' with 0 attempts and empty payments list, OR
//    - All payments are explicitly confirmed 'failed'.
// 7. Unknown or error states NEVER trigger stock restoration.
//
// STRICT LOCAL DEVELOPMENT PREPARATION — DO NOT DEPLOY.
// ============================================================================

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

import { createClient } from "@supabase/supabase-js";

interface ExpiredOrder {
  id: string;
  store_id: string;
  final_total: number;
  payment_status: string;
  payment_method: string;
  razorpay_order_id: string | null;
  payment_attempt_expires_at: string;
  created_at: string;
}

interface RazorpayOrderEntity {
  id: string;
  entity: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: "created" | "attempted" | "paid";
  attempts: number;
  created_at: number;
}

interface RazorpayPaymentItem {
  id: string;
  entity: string;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  order_id: string;
  method: string;
  created_at: number;
}

interface RazorpayOrderPaymentsResponse {
  entity: string;
  count: number;
  items: RazorpayPaymentItem[];
}

// Safety grace buffer: 15 minutes beyond payment_attempt_expires_at before cancellation
const SAFETY_GRACE_BUFFER_MS = 15 * 60 * 1000;

export async function reconcileExpiredOrders(req?: Request): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const razorpayKeyId = Deno.env.get("RAZORPAY_KEY_ID");
  const razorpayKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Missing Supabase configuration." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // 1. Fetch pending digital orders whose payment window has passed
  const { data: expiredOrders, error: fetchError } = await supabase
    .from("orders")
    .select(
      "id, store_id, final_total, payment_status, payment_method, razorpay_order_id, payment_attempt_expires_at, created_at"
    )
    .eq("payment_status", "PENDING")
    .neq("payment_method", "cash") // Cash orders are never cancelled by digital payment worker
    .lt("payment_attempt_expires_at", new Date().toISOString())
    .limit(50);

  if (fetchError) {
    console.error("[Reconciliation] Failed to query expired orders:", fetchError);
    return new Response(JSON.stringify({ error: fetchError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!expiredOrders || expiredOrders.length === 0) {
    return new Response(
      JSON.stringify({ message: "No expired orders pending reconciliation.", processed: 0 }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  const results = {
    totalEvaluated: expiredOrders.length,
    confirmedDueToPayment: 0,
    cancelledAndRestored: 0,
    skippedInFlight: 0,
    errors: 0,
  };

  const basicAuthHeader =
    razorpayKeyId && razorpayKeySecret
      ? "Basic " + btoa(`${razorpayKeyId}:${razorpayKeySecret}`)
      : null;

  for (const order of expiredOrders as ExpiredOrder[]) {
    try {
      // SCENARIO A: No Razorpay order was ever attached (abandoned before gateway initialization)
      if (!order.razorpay_order_id) {
        console.log(`[Reconciliation] Order ${order.id} has no gateway order attached. Cancelling safely.`);
        const { error: cancelErr } = await supabase.rpc("cancel_and_restore_pending_order", {
          p_order_id: order.id,
          p_reason: "Checkout abandoned prior to payment gateway initialization",
          p_idempotency_key: `RECON-ABANDON-${order.id}`,
        });

        if (cancelErr) {
          console.error(`[Reconciliation] Failed to cancel order ${order.id}:`, cancelErr);
          results.errors++;
        } else {
          results.cancelledAndRestored++;
        }
        continue;
      }

      // SCENARIO B: Gateway order exists — MUST query Razorpay before making any stock decisions!
      if (!basicAuthHeader) {
        console.warn(
          `[Reconciliation] Razorpay credentials missing. SKIPPING order ${order.id} to avoid unsafe stock restoration!`
        );
        results.skippedInFlight++;
        continue;
      }

      // FIX 4: Check safety grace buffer (Order must be expired + 15 min buffer before automated cancellation)
      const expiryTime = new Date(order.payment_attempt_expires_at).getTime();
      const nowTime = Date.now();
      const hasPassedSafetyBuffer = nowTime > expiryTime + SAFETY_GRACE_BUFFER_MS;

      // 1. Fetch Razorpay Order Entity
      const rzpOrderRes = await fetch(
        `https://api.razorpay.com/v1/orders/${encodeURIComponent(order.razorpay_order_id)}`,
        {
          headers: {
            Authorization: basicAuthHeader,
            Accept: "application/json",
          },
        }
      );

      if (!rzpOrderRes.ok) {
        console.error(`[Reconciliation] Failed to fetch order entity for ${order.id}. HTTP ${rzpOrderRes.status}. SKIPPING.`);
        results.errors++;
        continue;
      }

      const rzpOrderEntity: RazorpayOrderEntity = await rzpOrderRes.json();

      // If Razorpay order is 'paid', confirm it!
      if (rzpOrderEntity.status === "paid") {
        console.log(`[Reconciliation] Order ${order.id} is marked 'paid' on Razorpay. Retrieving payments...`);
      }

      // 2. Fetch Payments List for this Order
      const rzpPaymentsRes = await fetch(
        `https://api.razorpay.com/v1/orders/${encodeURIComponent(order.razorpay_order_id)}/payments`,
        {
          headers: {
            Authorization: basicAuthHeader,
            Accept: "application/json",
          },
        }
      );

      if (!rzpPaymentsRes.ok) {
        console.error(
          `[Reconciliation] Payments API error for order ${order.id}. Never restore stock on network or gateway error! SKIPPING.`
        );
        results.errors++;
        continue;
      }

      const paymentsData: RazorpayOrderPaymentsResponse = await rzpPaymentsRes.json();
      const payments = paymentsData.items || [];

      // Check for captured payment
      const capturedPayment = payments.find((p) => p.status === "captured");
      if (capturedPayment) {
        console.log(`[Reconciliation] Order ${order.id} has captured payment ${capturedPayment.id}. Confirming order!`);
        const { error: confirmErr } = await supabase.rpc("confirm_digital_order_payment", {
          p_order_id: order.id,
          p_gateway_reference: capturedPayment.id,
          p_razorpay_payment_id: capturedPayment.id,
          p_razorpay_signature: null,
          p_razorpay_order_id: order.razorpay_order_id,
        });

        if (confirmErr) {
          console.error(`[Reconciliation] Failed to confirm order ${order.id}:`, confirmErr);
          results.errors++;
        } else {
          results.confirmedDueToPayment++;
        }
        continue;
      }

      // Check for in-flight authorized payments
      const authorizedPayment = payments.find((p) => p.status === "authorized");
      if (authorizedPayment) {
        console.warn(`[Reconciliation] Order ${order.id} has payment in 'authorized' state (${authorizedPayment.id}). Deferring cancellation.`);
        results.skippedInFlight++;
        continue;
      }

      // If customer made attempts (attempts > 0) or order status is 'attempted', customer may be in bank verification!
      if (rzpOrderEntity.status === "attempted" || rzpOrderEntity.attempts > 0) {
        const hasFailedOnly = payments.length > 0 && payments.every((p) => p.status === "failed");
        if (!hasFailedOnly) {
          console.warn(`[Reconciliation] Order ${order.id} has attempted transactions that are not explicitly failed. Deferring cancellation.`);
          results.skippedInFlight++;
          continue;
        }
      }

      // FIX 4: Never cancel an order with a gateway order unless past safety buffer
      if (!hasPassedSafetyBuffer) {
        console.log(`[Reconciliation] Order ${order.id} is within the 15-minute safety grace buffer. Deferring cancellation.`);
        results.skippedInFlight++;
        continue;
      }

      // Safe to cancel only if:
      // (a) 0 attempts and empty payment list past safety buffer, OR
      // (b) all recorded payment attempts are explicitly 'failed'
      const hasZeroAttempts = rzpOrderEntity.attempts === 0 && payments.length === 0;
      const hasFailedOnly = payments.length > 0 && payments.every((p) => p.status === "failed");

      if (hasZeroAttempts || hasFailedOnly) {
        const reason = hasFailedOnly
          ? "Payment gateway confirmed payment failure"
          : "Payment grace window and safety buffer expired without transaction attempt";

        console.log(`[Reconciliation] Order ${order.id} verified safe to cancel (${reason}). Restoring stock.`);
        const { error: cancelErr } = await supabase.rpc("cancel_and_restore_pending_order", {
          p_order_id: order.id,
          p_reason: reason,
          p_idempotency_key: `RECON-SAFE-${order.id}`,
        });

        if (cancelErr) {
          console.error(`[Reconciliation] Failed to cancel order ${order.id}:`, cancelErr);
          results.errors++;
        } else {
          results.cancelledAndRestored++;
        }
      } else {
        console.warn(`[Reconciliation] Order ${order.id} in ambiguous state: status=${rzpOrderEntity.status}, attempts=${rzpOrderEntity.attempts}. Deferring for manual review.`);
        results.skippedInFlight++;
      }
    } catch (orderErr) {
      console.error(`[Reconciliation] Unexpected error processing order ${order.id}:`, orderErr);
      results.errors++;
    }
  }

  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export default reconcileExpiredOrders;
