// ============================================================================
// QLess Smart Shopping - Supabase Edge Function: Razorpay Webhook Handler
// Store: STORE001 (QLess Mart)
//
// PURPOSE:
// Concurrency-safe, deduplicated asynchronous processing of Razorpay webhooks.
//
// SECURITY GUARANTEES:
// 1. Verifies X-Razorpay-Signature HMAC-SHA256 against raw request body using RAZORPAY_WEBHOOK_SECRET
//    with timing-safe 64-byte comparison (FIX 6).
// 2. Durable Event Deduplication: Persists incoming events in public.razorpay_webhook_events;
//    safely returns idempotent 200 OK on duplicate event deliveries (FIX 5).
// 3. Durable Refund Recovery: Late-capture refund obligations are recorded in public.order_refund_jobs.
//    If the external refund API call fails or times out, the handler returns HTTP 500 so Razorpay
//    retries the webhook, and the durable database job remains pending (FIX 1).
// 4. Robust Refund Binding: refund.processed resolves the order primarily by payment_id
//    (orders.razorpay_payment_id), treating notes.qless_order_id as supplementary check.
//    Handles missing notes safely and rejects contradictory associations (FIX 2).
// 5. Ignores payment.authorized (never confirms uncaptured payments).
// 6. Never logs secrets, webhook secrets, card numbers, or customer credentials.
//
// STRICT LOCAL DEVELOPMENT PREPARATION — DO NOT DEPLOY.
// ============================================================================

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

import { createClient } from "@supabase/supabase-js";
import { computeHmacSha256Hex, timingSafeEqualHex } from "../verify-razorpay-payment/index.ts";

interface RazorpayWebhookPayload {
  entity: string;
  account_id: string;
  event: string;
  contains: string[];
  payload: {
    payment?: {
      entity: {
        id: string;
        order_id: string;
        amount: number;
        currency: string;
        status: string;
        method: string;
        notes?: Record<string, string>;
      };
    };
    refund?: {
      entity: {
        id: string;
        payment_id: string;
        amount: number;
        currency: string;
        status: string;
        notes?: Record<string, string>;
      };
    };
  };
  created_at: number;
}

export async function razorpayWebhookHandler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const razorpayKeyId = Deno.env.get("RAZORPAY_KEY_ID");
  const razorpayKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  const webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");

  if (!supabaseUrl || !serviceRoleKey || !webhookSecret) {
    console.error("[Webhook Handler] Server configuration missing.");
    return new Response(JSON.stringify({ error: "Server configuration missing." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 1. Read raw request body as string
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("X-Razorpay-Signature") || "";

  if (!signatureHeader) {
    console.warn("[Webhook Handler] Rejected: Missing X-Razorpay-Signature header.");
    return new Response(JSON.stringify({ error: "Missing signature header." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. Cryptographic signature verification over raw request body (FIX 6: timingSafeEqualHex)
  const expectedSignature = await computeHmacSha256Hex(rawBody, webhookSecret);
  if (!timingSafeEqualHex(expectedSignature, signatureHeader.trim())) {
    console.warn("[Webhook Handler] Rejected: Invalid webhook HMAC signature.");
    return new Response(JSON.stringify({ error: "Invalid webhook signature." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3. Parse JSON event payload
  let eventPayload: RazorpayWebhookPayload;
  try {
    eventPayload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Malformed JSON payload." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const event = eventPayload.event;

  // Extract unique event ID from Razorpay header or payload
  const eventId =
    req.headers.get("X-Razorpay-Event-Id") ||
    `EVT-${event}-${eventPayload.created_at}-${eventPayload.payload?.payment?.entity?.id || eventPayload.payload?.refund?.entity?.id || "GEN"}`;

  // 4. FIX 5: Webhook Event Deduplication in Database
  const paymentEntityId = eventPayload.payload?.payment?.entity?.id || null;
  const { data: startResult } = await supabase.rpc("record_webhook_event_start", {
    p_event_id: eventId,
    p_event_type: event,
    p_payment_id: paymentEntityId,
    p_order_id: null,
  });

  // If already processed to completion, return 200 immediately (idempotent replay safety)
  if (startResult?.isDuplicate && startResult?.status === "PROCESSED") {
    console.log(`[Webhook Handler] Event ${eventId} already processed successfully. Returning idempotent 200.`);
    return new Response(JSON.stringify({ success: true, isDuplicate: true, message: "Event already processed." }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // 5. Handle Event: payment.captured
    if (event === "payment.captured") {
      const payment = eventPayload.payload?.payment?.entity;
      if (!payment) {
        await supabase.rpc("record_webhook_event_finish", {
          p_event_id: eventId,
          p_status: "FAILED",
          p_error: "Missing payment entity",
        });
        return new Response(JSON.stringify({ error: "Missing payment entity in payload." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Security: Reject non-INR currencies
      if (payment.currency !== "INR") {
        console.warn(`[Webhook Handler] Rejected payment ${payment.id}: Non-INR currency '${payment.currency}'`);
        await supabase.rpc("record_webhook_event_finish", {
          p_event_id: eventId,
          p_status: "FAILED",
          p_error: "Non-INR currency",
        });
        return new Response(JSON.stringify({ error: "Unsupported currency." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Locate QLess order: either via notes.qless_order_id or razorpay_order_id
      let qlessOrderId = payment.notes?.qless_order_id?.trim();
      let orderRecord = null;

      if (qlessOrderId) {
        const { data } = await supabase.from("orders").select("*").eq("id", qlessOrderId).single();
        orderRecord = data;
      }

      if (!orderRecord && payment.order_id) {
        const { data } = await supabase
          .from("orders")
          .select("*")
          .eq("razorpay_order_id", payment.order_id)
          .single();
        orderRecord = data;
        if (orderRecord) qlessOrderId = orderRecord.id;
      }

      if (!orderRecord || !qlessOrderId) {
        console.warn(`[Webhook Handler] Order not found for Razorpay payment ${payment.id} (order_id: ${payment.order_id}).`);
        await supabase.rpc("record_webhook_event_finish", {
          p_event_id: eventId,
          p_status: "FAILED",
          p_error: "Order not found",
        });
        return new Response(JSON.stringify({ message: "Order not found. Stored for manual reconciliation." }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Amount validation
      const expectedPaise = Math.round(Number(orderRecord.final_total) * 100);
      if (payment.amount !== expectedPaise) {
        console.error(
          `[Webhook Handler] Amount mismatch for order ${qlessOrderId}: expected ${expectedPaise} paise, received ${payment.amount} paise.`
        );
        await supabase.rpc("record_webhook_event_finish", {
          p_event_id: eventId,
          p_status: "FAILED",
          p_order_id: qlessOrderId,
          p_error: "Amount mismatch",
        });
        return new Response(JSON.stringify({ error: "Amount mismatch detected." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Invoke confirm_digital_order_payment RPC via service_role
      const { data: confirmResult, error: confirmError } = await supabase.rpc("confirm_digital_order_payment", {
        p_order_id: qlessOrderId,
        p_gateway_reference: payment.id,
        p_razorpay_payment_id: payment.id,
        p_razorpay_signature: signatureHeader,
        p_razorpay_order_id: payment.order_id,
      });

      if (confirmError) {
        console.error(`[Webhook Handler] Failed to confirm payment for order ${qlessOrderId}:`, confirmError);
        await supabase.rpc("record_webhook_event_finish", {
          p_event_id: eventId,
          p_status: "FAILED",
          p_order_id: qlessOrderId,
          p_error: confirmError.message,
        });
        return new Response(JSON.stringify({ error: confirmError.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      // FIX 2: Safe Refund Retries & Gateway Reconciliation
      if (confirmResult?.requiresRefund) {
        console.warn(
          `[Webhook Handler] Order ${qlessOrderId} was CANCELLED before payment capture. Reconciling / initiating refund for payment ${payment.id}...`
        );

        if (!razorpayKeyId || !razorpayKeySecret) {
          console.error("[Webhook Handler] Razorpay credentials missing. Cannot reconcile or initiate refund.");
          return new Response(JSON.stringify({ error: "Gateway credentials unavailable." }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const basicAuth = "Basic " + btoa(`${razorpayKeyId}:${razorpayKeySecret}`);

        // 1. Query Razorpay's authoritative refund records for this payment
        let existingRefunds: any[] = [];
        try {
          const queryRes = await fetch(
            `https://api.razorpay.com/v1/payments/${encodeURIComponent(payment.id)}/refunds`,
            {
              method: "GET",
              headers: {
                Authorization: basicAuth,
                Accept: "application/json",
              },
            }
          );

          if (!queryRes.ok) {
            const queryErr = await queryRes.text();
            console.error(`[Webhook Handler] Failed to query authoritative refunds: ${queryRes.status} ${queryErr}`);
            // Gateway query failed: preserve durable refund job and defer
            await supabase
              .from("order_refund_jobs")
              .update({
                last_error: `Failed to query refund records from gateway: ${queryRes.status}`,
                updated_at: new Date().toISOString(),
              })
              .eq("order_id", qlessOrderId)
              .eq("payment_id", payment.id);

            return new Response(
              JSON.stringify({ error: "Refund query to gateway failed. Preserving durable job for retry." }),
              { status: 500, headers: { "Content-Type": "application/json" } }
            );
          }

          const queryData = await queryRes.json();
          existingRefunds = Array.isArray(queryData?.items) ? queryData.items : [];
        } catch (queryEx: any) {
          console.error(`[Webhook Handler] Network timeout querying gateway refunds for ${payment.id}:`, queryEx);
          // Ambiguous gateway result: preserve durable refund job
          await supabase
            .from("order_refund_jobs")
            .update({
              last_error: `Network timeout querying gateway refunds: ${queryEx?.message || "timeout"}`,
              updated_at: new Date().toISOString(),
            })
            .eq("order_id", qlessOrderId)
            .eq("payment_id", payment.id);

          return new Response(
            JSON.stringify({ error: "Refund query network timeout. Preserving durable job for retry." }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }

        // 2 & 3. Reconcile if a refund already exists for this payment
        if (existingRefunds.length > 0) {
          const matchingRefund = existingRefunds.find((rf: any) => rf.payment_id === payment.id) || existingRefunds[0];

          // Check for notes contradiction or amount mismatch
          const refundNotesOrder = matchingRefund.notes?.qless_order_id?.trim();
          const amountPaise = Number(matchingRefund.amount);

          if (refundNotesOrder && refundNotesOrder !== qlessOrderId) {
            console.error(
              `[Webhook Handler] Contradictory order ID in gateway refund notes: notes says ${refundNotesOrder}, order is ${qlessOrderId}`
            );
            await supabase
              .from("order_refund_jobs")
              .update({
                status: "MANUAL_REVIEW",
                last_error: `Contradictory order ID in gateway refund notes (${refundNotesOrder} vs ${qlessOrderId})`,
                updated_at: new Date().toISOString(),
              })
              .eq("order_id", qlessOrderId)
              .eq("payment_id", payment.id);

            await supabase.rpc("record_webhook_event_finish", {
              p_event_id: eventId,
              p_status: "FAILED",
              p_order_id: qlessOrderId,
              p_error: "Contradictory order ID in gateway refund notes",
            });

            return new Response(JSON.stringify({ error: "Contradictory refund association. Flagged for manual review." }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          if (amountPaise !== expectedPaise) {
            console.error(
              `[Webhook Handler] Mismatched gateway refund amount for order ${qlessOrderId}: expected ${expectedPaise}, gateway has ${amountPaise}`
            );
            await supabase
              .from("order_refund_jobs")
              .update({
                status: "MANUAL_REVIEW",
                last_error: `Amount mismatch: expected ${expectedPaise} paise, gateway refund is ${amountPaise} paise`,
                updated_at: new Date().toISOString(),
              })
              .eq("order_id", qlessOrderId)
              .eq("payment_id", payment.id);

            await supabase.rpc("record_webhook_event_finish", {
              p_event_id: eventId,
              p_status: "FAILED",
              p_order_id: qlessOrderId,
              p_error: "Gateway refund amount mismatch",
            });

            return new Response(JSON.stringify({ error: "Gateway refund amount mismatch. Flagged for manual review." }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Authoritative confirmation: only complete if status is 'processed'
          if (matchingRefund.status === "processed") {
            console.log(`[Webhook Handler] Existing authoritative refund found (${matchingRefund.id}). Reconciling...`);
            await supabase.rpc("record_order_refund_confirmation", {
              p_order_id: qlessOrderId,
              p_refund_id: matchingRefund.id,
              p_refund_amount: Number(matchingRefund.amount) / 100,
              p_reason: matchingRefund.notes?.reason || "Authoritative refund reconciled via Razorpay API",
            });

            await supabase.rpc("record_webhook_event_finish", {
              p_event_id: eventId,
              p_status: "PROCESSED",
              p_order_id: qlessOrderId,
            });

            return new Response(
              JSON.stringify({
                success: true,
                reconciled: true,
                refundId: matchingRefund.id,
                message: "Existing refund reconciled successfully.",
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          } else {
            // Status is pending or processing on gateway: do not mark complete, do not dispatch duplicate
            console.log(`[Webhook Handler] Existing gateway refund ${matchingRefund.id} is in status '${matchingRefund.status}'. Preserving job.`);
            await supabase
              .from("order_refund_jobs")
              .update({
                status: "PROCESSING",
                refund_id: matchingRefund.id,
                last_error: `Gateway refund pending: ${matchingRefund.status}`,
                updated_at: new Date().toISOString(),
              })
              .eq("order_id", qlessOrderId)
              .eq("payment_id", payment.id);

            return new Response(
              JSON.stringify({
                success: true,
                pending: true,
                refundId: matchingRefund.id,
                message: "Gateway refund is pending processing. Awaiting authoritative webhook confirmation.",
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
        }

        // 4. Atomic claim with lease ownership & stale recovery
        // Uses claim_order_refund_job RPC or atomic lease query
        let claimedJob: { id: string; retry_count?: number } | null = null;
        const { data: claimResult, error: claimError } = await supabase.rpc("claim_order_refund_job", {
          p_order_id: qlessOrderId,
          p_payment_id: payment.id,
          p_lease_seconds: 300,
        });

        if (!claimError && claimResult) {
          if (!claimResult.isClaimed) {
            console.warn(
              `[Webhook Handler] Refund job for order ${qlessOrderId} payment ${payment.id} not claimed: ${claimResult.message || claimResult.error || claimResult.status}`
            );
            return new Response(
              JSON.stringify({ message: claimResult.message || "Refund job currently active or already completed." }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          claimedJob = { id: claimResult.jobId, retry_count: claimResult.retryCount };
          if (claimResult.wasStaleRecovery) {
            console.log(`[Webhook Handler] Stale refund job lease recovered for order ${qlessOrderId}. Re-attempting refund dispatch.`);
          }
        } else {
          // Direct atomic query fallback with lease expiration check
          const nowIso = new Date().toISOString();
          const leaseExpiryIso = new Date(Date.now() + 300 * 1000).toISOString();

          // Try to claim PENDING
          let { data: claimed } = await supabase
            .from("order_refund_jobs")
            .update({
              status: "PROCESSING",
              lease_expires_at: leaseExpiryIso,
              updated_at: nowIso,
            })
            .eq("order_id", qlessOrderId)
            .eq("payment_id", payment.id)
            .eq("status", "PENDING")
            .select("id, retry_count")
            .maybeSingle();

          // If not PENDING, check if PROCESSING with expired lease
          if (!claimed) {
            const { data: staleClaimed } = await supabase
              .from("order_refund_jobs")
              .update({
                status: "PROCESSING",
                lease_expires_at: leaseExpiryIso,
                updated_at: nowIso,
              })
              .eq("order_id", qlessOrderId)
              .eq("payment_id", payment.id)
              .eq("status", "PROCESSING")
              .lt("lease_expires_at", nowIso)
              .select("id, retry_count")
              .maybeSingle();
            claimed = staleClaimed;
          }

          if (!claimed) {
            console.warn(
              `[Webhook Handler] Refund job for order ${qlessOrderId} payment ${payment.id} already claimed or processing by concurrent worker.`
            );
            return new Response(
              JSON.stringify({ message: "Refund job already claimed or completed by concurrent worker." }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          claimedJob = claimed;
        }

        // 5. Dispatch new refund request to Razorpay
        try {
          const refundRes = await fetch(
            `https://api.razorpay.com/v1/payments/${encodeURIComponent(payment.id)}/refund`,
            {
              method: "POST",
              headers: {
                Authorization: basicAuth,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                amount: payment.amount,
                notes: {
                  qless_order_id: qlessOrderId,
                  reason: "Automatic refund: Order cancelled before capture",
                },
              }),
            }
          );

          if (!refundRes.ok) {
            const refundErr = await refundRes.text();
            console.error(`[Webhook Handler] Gateway refund API error: ${refundRes.status} ${refundErr}`);
            if (refundErr.toLowerCase().includes("already") && refundErr.toLowerCase().includes("refund")) {
              console.log("[Webhook Handler] Gateway reported payment already refunded. Will reconcile on next check.");
            }
            await supabase
              .from("order_refund_jobs")
              .update({
                status: "PENDING",
                lease_expires_at: null,
                retry_count: (claimedJob.retry_count || 0) + 1,
                last_error: `Gateway refund API error: ${refundRes.status} ${refundErr}`,
                updated_at: new Date().toISOString(),
              })
              .eq("id", claimedJob.id);

            return new Response(
              JSON.stringify({ error: "Refund request to gateway failed. Will retry via webhook." }),
              { status: 500, headers: { "Content-Type": "application/json" } }
            );
          }

          const refundData = await refundRes.json();
          console.log(`[Webhook Handler] Gateway refund accepted: ${refundData.id}, status: ${refundData.status}`);

          if (refundData.status === "processed") {
            await supabase.rpc("record_order_refund_confirmation", {
              p_order_id: qlessOrderId,
              p_refund_id: refundData.id,
              p_refund_amount: Number(refundData.amount) / 100,
              p_reason: "Automatic refund: Order cancelled before capture",
            });
          } else {
            await supabase
              .from("order_refund_jobs")
              .update({
                status: "PROCESSING",
                refund_id: refundData.id,
                lease_expires_at: null,
                last_error: `Gateway refund pending: ${refundData.status}`,
                updated_at: new Date().toISOString(),
              })
              .eq("id", claimedJob.id);
          }
        } catch (rfErr: any) {
          console.error(`[Webhook Handler] Network timeout/exception initiating refund for order ${qlessOrderId}:`, rfErr);
          await supabase
            .from("order_refund_jobs")
            .update({
              status: "PENDING",
              lease_expires_at: null,
              retry_count: (claimedJob.retry_count || 0) + 1,
              last_error: rfErr?.message || "Refund network timeout",
              updated_at: new Date().toISOString(),
            })
            .eq("id", claimedJob.id);

          return new Response(
            JSON.stringify({ error: "Refund network timeout. Awaiting webhook retry." }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
      }

      await supabase.rpc("record_webhook_event_finish", {
        p_event_id: eventId,
        p_status: "PROCESSED",
        p_order_id: qlessOrderId,
      });

      return new Response(JSON.stringify({ success: true, processedEvent: event }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 6. FIX 2: Robust Refund Binding for refund.processed
    if (event === "refund.processed") {
      const refund = eventPayload.payload?.refund?.entity;
      if (!refund || !refund.payment_id) {
        return new Response(JSON.stringify({ error: "Missing refund or payment_id." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Resolve order primarily by stored payment_id (the trusted database anchor)
      const { data: matchedOrder } = await supabase
        .from("orders")
        .select("id, final_total, refund_status")
        .eq("razorpay_payment_id", refund.payment_id.trim())
        .single();

      if (!matchedOrder) {
        console.warn(`[Webhook Handler] No order found matching payment_id ${refund.payment_id}`);
        await supabase.rpc("record_webhook_event_finish", {
          p_event_id: eventId,
          p_status: "FAILED",
          p_error: "Order not found for payment_id",
        });
        return new Response(JSON.stringify({ message: "Refund unassociated. Logged for manual review." }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Check notes as supplementary check: If notes present and contradicts, flag for manual review
      const notesOrderId = refund.notes?.qless_order_id?.trim();
      if (notesOrderId && notesOrderId !== matchedOrder.id) {
        console.error(`[Webhook Handler] Contradictory order ID in refund notes: notes says ${notesOrderId}, payment belongs to ${matchedOrder.id}`);
        await supabase
          .from("order_refund_jobs")
          .update({
            status: "MANUAL_REVIEW",
            last_error: `Contradictory order ID in refund notes: ${notesOrderId} vs ${matchedOrder.id}`,
            updated_at: new Date().toISOString(),
          })
          .eq("order_id", matchedOrder.id);

        await supabase.rpc("record_webhook_event_finish", {
          p_event_id: eventId,
          p_status: "FAILED",
          p_order_id: matchedOrder.id,
          p_error: "Contradictory order ID in refund notes",
        });
        return new Response(JSON.stringify({ error: "Contradictory order association." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Amount verification: Must match expected order total
      const expectedPaise = Math.round(Number(matchedOrder.final_total) * 100);
      if (Number(refund.amount) !== expectedPaise) {
        console.error(
          `[Webhook Handler] Mismatched refund amount for order ${matchedOrder.id}: expected ${expectedPaise}, received ${refund.amount}`
        );
        await supabase
          .from("order_refund_jobs")
          .update({
            status: "MANUAL_REVIEW",
            last_error: `Refund amount mismatch: expected ${expectedPaise} paise, received ${refund.amount} paise`,
            updated_at: new Date().toISOString(),
          })
          .eq("order_id", matchedOrder.id);

        await supabase.rpc("record_webhook_event_finish", {
          p_event_id: eventId,
          p_status: "FAILED",
          p_order_id: matchedOrder.id,
          p_error: "Refund amount mismatch",
        });
        return new Response(JSON.stringify({ error: "Refund amount mismatch. Flagged for manual review." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Authoritative status check: Only mark complete if refund.status is 'processed'
      if (refund.status && refund.status !== "processed") {
        console.log(`[Webhook Handler] Refund ${refund.id} received in non-processed status '${refund.status}'. Preserving.`);
        await supabase
          .from("order_refund_jobs")
          .update({
            status: "PROCESSING",
            refund_id: refund.id,
            last_error: `Refund webhook received in status '${refund.status}'`,
            updated_at: new Date().toISOString(),
          })
          .eq("order_id", matchedOrder.id);

        await supabase.rpc("record_webhook_event_finish", {
          p_event_id: eventId,
          p_status: "PROCESSED",
          p_order_id: matchedOrder.id,
        });

        return new Response(JSON.stringify({ success: true, pending: true, refundId: refund.id }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const refundAmountRupees = Number(refund.amount) / 100;
      await supabase.rpc("record_order_refund_confirmation", {
        p_order_id: matchedOrder.id,
        p_refund_id: refund.id,
        p_refund_amount: refundAmountRupees,
        p_reason: refund.notes?.reason || "Refund processed via Razorpay webhook",
      });

      await supabase.rpc("record_webhook_event_finish", {
        p_event_id: eventId,
        p_status: "PROCESSED",
        p_order_id: matchedOrder.id,
      });

      return new Response(JSON.stringify({ success: true, processedEvent: event }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 7. Handle Event: payment.failed
    if (event === "payment.failed") {
      const payment = eventPayload.payload?.payment?.entity;
      console.log(`[Webhook Handler] Payment failed reported for payment ${payment?.id} (order: ${payment?.order_id})`);
      await supabase.rpc("record_webhook_event_finish", {
        p_event_id: eventId,
        p_status: "PROCESSED",
      });
      return new Response(JSON.stringify({ success: true, processedEvent: event }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Default acknowledgement for ignored events
    await supabase.rpc("record_webhook_event_finish", {
      p_event_id: eventId,
      p_status: "IGNORED",
    });

    return new Response(JSON.stringify({ message: `Event ${event} acknowledged.` }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[Webhook Handler] Unhandled error:", err);
    await supabase.rpc("record_webhook_event_finish", {
      p_event_id: eventId,
      p_status: "FAILED",
      p_error: err?.message || "Internal error",
    });
    return new Response(JSON.stringify({ error: "Internal webhook processing error." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export default razorpayWebhookHandler;
