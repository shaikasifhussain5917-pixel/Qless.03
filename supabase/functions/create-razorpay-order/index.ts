// ============================================================================
// QLess Smart Shopping - Supabase Edge Function: Create Razorpay Order
// Store: STORE001 (QLess Mart)
//
// PURPOSE:
// Concurrency-safe, idempotent server-side creation of Razorpay Orders.
//
// SECURITY GUARANTEES:
// 1. Authenticates customer JWT from Authorization header.
// 2. Asserts order ownership (auth.uid() === order.customer_id).
// 3. Verifies order is PENDING, non-cash, and stock is not restored.
// 4. FIX 3: reserve_order_payment_creation row-locks order in SQL,
//    preventing concurrent requests from creating duplicate Razorpay orders.
// 5. Reuses existing Razorpay order ID if already created and grace window is active.
// 6. Calculates amount in paise strictly from authoritative database final_total.
// 7. Attaches gateway order ID and sets 15-minute lockout via attach_razorpay_order_id.
// 8. Returns Razorpay Public Key ID only; NEVER exposes Key Secret.
//
// STRICT LOCAL DEVELOPMENT PREPARATION — DO NOT DEPLOY.
// ============================================================================

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve?: (handler: (req: Request) => Promise<Response> | Response) => void;
};

import { createClient } from "npm:@supabase/supabase-js@2";

interface CreateOrderRequestBody {
  orderId: string;
}

const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function isOriginAllowed(origin: string): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // Allow local development on any port (e.g. 5173, 5174, 4173, 3000)
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  // Allow Vercel preview and production deployments
  if (/^https:\/\/([a-z0-9-]+[.])?vercel[.]app$/.test(origin)) return true;
  return false;
}

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allowOrigin = isOriginAllowed(origin) ? origin : "http://localhost:5173";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, prefer, x-customer-jwt",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export async function createRazorpayOrderHandler(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const razorpayKeyId = Deno.env.get("RAZORPAY_KEY_ID")?.trim();
  const razorpayKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET")?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Server configuration missing: Supabase URL/Key." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!razorpayKeyId || !razorpayKeySecret) {
    return new Response(JSON.stringify({ error: "Server configuration missing: Razorpay API keys." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 1. Authenticate customer JWT
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized: Missing Authorization header." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized: Invalid or expired customer session." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const customerId = userData.user.id;

  // 2. Parse request body
  let body: CreateOrderRequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON request body." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const orderId = body.orderId?.trim();
  if (!orderId) {
    return new Response(JSON.stringify({ error: "Missing required parameter: orderId." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 3. Query authoritative order details
  const { data: order, error: orderFetchError } = await supabase
    .from("orders")
    .select("id, store_id, customer_id, receipt_id, final_total, payment_status, payment_method, razorpay_order_id, payment_attempt_expires_at, stock_restored")
    .eq("id", orderId)
    .single();

  if (orderFetchError) {
    if (orderFetchError.code === "PGRST116") {
      return new Response(JSON.stringify({ error: `Order not found: ${orderId}` }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error(`[Razorpay Order Creation] Database error querying order ${orderId}:`, orderFetchError);
    return new Response(JSON.stringify({ error: `Database error querying order: ${orderFetchError.message}` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!order) {
    return new Response(JSON.stringify({ error: `Order not found: ${orderId}` }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 4. Verify ownership
  if (order.customer_id !== customerId) {
    return new Response(JSON.stringify({ error: "Forbidden: You do not own this order." }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 5. Verify payment method is digital (not cash)
  if (order.payment_method === "cash") {
    return new Response(
      JSON.stringify({ error: "Cash orders must be settled at the cashier counter, not through Razorpay." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 6. Verify order status is PENDING and stock is not restored
  if (order.payment_status !== "PENDING" || order.stock_restored) {
    return new Response(
      JSON.stringify({ error: `Cannot create payment: Order is in status ${order.payment_status} or inventory was already restored.` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 7. FIX 3: Concurrency reservation via reserve_order_payment_creation RPC
  const { data: reserveResult, error: reserveError } = await supabase.rpc("reserve_order_payment_creation", {
    p_order_id: order.id,
    p_lock_duration_seconds: 60,
  });

  if (reserveError || !reserveResult?.success) {
    if (reserveResult?.isLocked) {
      return new Response(
        JSON.stringify({ error: "Payment creation already in progress for this order. Please retry in a moment." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ error: reserveResult?.error || reserveError?.message || "Order reservation failed." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Idempotent reuse if Razorpay order was already attached
  if (reserveResult?.isExisting && reserveResult.razorpayOrderId) {
    const amountInPaise = Math.round(Number(order.final_total) * 100);
    return new Response(
      JSON.stringify({
        success: true,
        orderId: order.id,
        razorpayOrderId: reserveResult.razorpayOrderId,
        amount: amountInPaise,
        currency: "INR",
        keyId: razorpayKeyId,
        expiresAt: reserveResult.expiresAt,
        isReused: true,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 8. Calculate authoritative amount in paise
  const amountInPaise = Math.round(Number(order.final_total) * 100);
  if (isNaN(amountInPaise) || amountInPaise <= 0) {
    return new Response(JSON.stringify({ error: "Invalid order amount. Must be greater than zero." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Helper to safely release the concurrency lock if it still belongs to this request
  const releaseLockIfOurs = async () => {
    if (reserveResult?.isReserved && reserveResult.lockedUntil) {
      try {
        await supabase
          .from("orders")
          .update({ payment_creation_locked_until: null })
          .eq("id", order.id)
          .eq("payment_creation_locked_until", reserveResult.lockedUntil);
      } catch (releaseErr) {
        console.warn("[Razorpay Order Creation] Failed to release lock lease:", releaseErr);
      }
    }
  };

  // 9. Create order on Razorpay server-side
  const basicAuthHeader = "Basic " + btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
  const rzpPayload = {
    amount: amountInPaise,
    currency: "INR",
    receipt: order.receipt_id || order.id,
    notes: {
      qless_order_id: order.id,
      store_id: order.store_id,
      customer_id: customerId,
    },
  };

  let rzpResponse: Response;
  try {
    rzpResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(rzpPayload),
    });
  } catch (fetchErr: unknown) {
    await releaseLockIfOurs();
    console.error("[Razorpay Order Creation] Network/fetch error:", fetchErr);
    return new Response(
      JSON.stringify({ error: "Network error contacting payment gateway. Please retry." }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!rzpResponse.ok) {
    await releaseLockIfOurs();
    const errText = await rzpResponse.text();
    try {
      const errJson = JSON.parse(errText);
      const code = errJson?.error?.code || "";
      const desc = errJson?.error?.description || "";
      console.error(`[Razorpay Order Creation] Gateway Error: ${rzpResponse.status} [${code}] ${desc}`);
    } catch {
      console.error(`[Razorpay Order Creation] Gateway Error: ${rzpResponse.status}`);
    }
    return new Response(
      JSON.stringify({ error: "Payment gateway rejected order creation. Please try again later." }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const rzpOrderData = await rzpResponse.json();
  const razorpayOrderId = rzpOrderData.id;

  // 10. Bind Razorpay Order ID to QLess Order via attach_razorpay_order_id RPC
  const { data: attachResult, error: attachError } = await supabase.rpc("attach_razorpay_order_id", {
    p_order_id: order.id,
    p_razorpay_order_id: razorpayOrderId,
    p_validity_minutes: 15,
  });

  if (attachError || !attachResult?.success) {
    await releaseLockIfOurs();
    console.error("[Razorpay Order Attachment] Failed to attach order ID:", attachError || attachResult);
    return new Response(
      JSON.stringify({ error: attachResult?.error || "Failed to link gateway order to checkout session." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      orderId: order.id,
      razorpayOrderId: razorpayOrderId,
      amount: amountInPaise,
      currency: "INR",
      keyId: razorpayKeyId,
      expiresAt: attachResult.expiresAt,
    }),
    { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// Start Deno server when running under Supabase Edge Runtime
if (typeof Deno !== "undefined" && typeof (Deno as any).serve === "function") {
  (Deno as any).serve(createRazorpayOrderHandler);
}

export default createRazorpayOrderHandler;
