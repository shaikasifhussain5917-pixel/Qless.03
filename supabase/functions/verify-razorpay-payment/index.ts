// ============================================================================
// QLess Smart Shopping - Supabase Edge Function: Verify Razorpay Payment
// Store: STORE001 (QLess Mart)
//
// PURPOSE:
// Cryptographically verifies client-submitted Razorpay payment credentials
// against server secrets and Razorpay's authoritative API, then securely invokes
// public.confirm_digital_order_payment via service_role.
//
// SECURITY GUARANTEES:
// 1. Authenticates customer JWT from Authorization header.
// 2. Asserts order ownership (auth.uid() === order.customer_id).
// 3. FIX 6: Cryptographically verifies HMAC-SHA256 signature using timingSafeEqualHex
//    with strict 64-byte length validation and constant-time byte XOR comparison.
// 4. Fetches authoritative payment from Razorpay API; asserts:
//    - status === 'captured'
//    - amount === Math.round(final_total * 100)
//    - currency === 'INR'
//    - order_id === razorpay_order_id
// 5. Calls confirm_digital_order_payment RPC using service_role only.
// 6. Never allows client-side direct confirmation to create turnstile exit passes.
// 7. Handles late-capture refund-required responses safely.
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

interface VerifyPaymentRequestBody {
  orderId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
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

/**
 * Computes HMAC-SHA256 hex digest using Web Crypto API.
 */
export async function computeHmacSha256Hex(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * FIX 6: Genuinely constant-time 64-byte comparison for HMAC-SHA256 digests.
 * - Strict length validation (rejects any input that is not exactly 64 hex characters).
 * - Bitwise XOR over all 64 bytes with NO early character-by-character exit.
 */
export function timingSafeEqualHex(aHex: string, bHex: string): boolean {
  if (typeof aHex !== "string" || typeof bHex !== "string") {
    return false;
  }
  // Enforce expected 64-character SHA-256 hex length
  if (aHex.length !== 64 || bHex.length !== 64) {
    return false;
  }
  const enc = new TextEncoder();
  const aBytes = enc.encode(aHex.toLowerCase());
  const bBytes = enc.encode(bHex.toLowerCase());

  let diff = 0;
  for (let i = 0; i < 64; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

// Backward-compatible alias
export const timingSafeEqual = timingSafeEqualHex;

export async function verifyRazorpayPaymentHandler(req: Request): Promise<Response> {
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

  if (!supabaseUrl || !serviceRoleKey || !razorpayKeyId || !razorpayKeySecret) {
    return new Response(JSON.stringify({ error: "Server configuration missing: Supabase or Razorpay keys." }), {
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
  let body: VerifyPaymentRequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON request body." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = body;

  if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return new Response(
      JSON.stringify({
        error: "Missing required fields: orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature.",
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 3. Cryptographic HMAC-SHA256 signature verification (FIX 6: timing-safe 64-byte comparison)
  const expectedPayload = `${razorpayOrderId}|${razorpayPaymentId}`;
  const computedSignature = await computeHmacSha256Hex(expectedPayload, razorpayKeySecret);

  if (!timingSafeEqualHex(computedSignature, razorpaySignature.trim())) {
    console.error(`[Verify Payment] Signature mismatch for order ${orderId}.`);
    return new Response(JSON.stringify({ error: "Invalid cryptographic payment signature." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 4. Fetch authoritative order from DB
  const { data: order, error: orderFetchError } = await supabase
    .from("orders")
    .select("id, store_id, customer_id, final_total, payment_status, payment_method, razorpay_order_id")
    .eq("id", orderId.trim())
    .single();

  if (orderFetchError) {
    if (orderFetchError.code === "PGRST116") {
      return new Response(JSON.stringify({ error: `Order not found: ${orderId}` }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error(`[Verify Payment] Database error querying order ${orderId}:`, orderFetchError);
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

  // Verify ownership
  if (order.customer_id !== customerId) {
    return new Response(JSON.stringify({ error: "Forbidden: You do not own this order." }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify order payment method is not cash
  if (order.payment_method === "cash") {
    return new Response(JSON.stringify({ error: "Cash orders cannot be confirmed through digital verification." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify Razorpay order ID matches QLess order
  if (order.razorpay_order_id && order.razorpay_order_id !== razorpayOrderId.trim()) {
    return new Response(
      JSON.stringify({
        error: `Order mismatch: Order is associated with ${order.razorpay_order_id}, not ${razorpayOrderId}.`,
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 5. Query Razorpay API for authoritative payment details
  const basicAuthHeader = "Basic " + btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
  const rzpPaymentRes = await fetch(
    `https://api.razorpay.com/v1/payments/${encodeURIComponent(razorpayPaymentId.trim())}`,
    {
      headers: {
        Authorization: basicAuthHeader,
        Accept: "application/json",
      },
    }
  );

  if (!rzpPaymentRes.ok) {
    console.error(`[Verify Payment] Failed to fetch payment ${razorpayPaymentId} from Razorpay: ${rzpPaymentRes.status}`);
    return new Response(JSON.stringify({ error: "Payment verification failed with payment gateway." }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const paymentData = await rzpPaymentRes.json();

  // Assertions against authoritative gateway payload:
  if (paymentData.order_id !== razorpayOrderId.trim()) {
    return new Response(JSON.stringify({ error: "Payment entity does not belong to the specified Razorpay order." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (paymentData.status !== "captured") {
    return new Response(
      JSON.stringify({
        error: `Payment is in status '${paymentData.status}'. Only captured payments can be confirmed.`,
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (paymentData.currency !== "INR") {
    return new Response(JSON.stringify({ error: `Invalid currency: '${paymentData.currency}'. Expected INR.` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const expectedPaise = Math.round(Number(order.final_total) * 100);
  if (paymentData.amount !== expectedPaise) {
    return new Response(
      JSON.stringify({
        error: `Amount mismatch: Payment amount (${paymentData.amount} paise) does not match order total (${expectedPaise} paise).`,
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 6. Invoke authoritative database RPC using service_role
  const { data: confirmResult, error: confirmError } = await supabase.rpc("confirm_digital_order_payment", {
    p_order_id: order.id,
    p_gateway_reference: razorpayPaymentId.trim(),
    p_razorpay_payment_id: razorpayPaymentId.trim(),
    p_razorpay_signature: razorpaySignature.trim(),
    p_razorpay_order_id: razorpayOrderId.trim(),
  });

  if (confirmError) {
    console.error(`[Verify Payment] confirm_digital_order_payment RPC error for order ${order.id}:`, confirmError);
    return new Response(JSON.stringify({ error: confirmError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (confirmResult?.requiresRefund) {
    return new Response(
      JSON.stringify({
        success: false,
        requiresRefund: true,
        orderId: order.id,
        refundStatus: confirmResult.refundStatus,
        refundAmount: confirmResult.refundAmount,
        error: confirmResult.error || "Order was cancelled and stock restored. A durable refund job has been recorded.",
      }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!confirmResult?.success) {
    return new Response(JSON.stringify({ error: confirmResult?.error || "Order confirmation failed." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      success: true,
      orderId: order.id,
      status: "CONFIRMED",
      paymentId: razorpayPaymentId.trim(),
      confirmedAt: confirmResult.confirmedAt,
      isDuplicate: !!confirmResult.isDuplicate,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// Start Deno server when running under Supabase Edge Runtime
if (typeof Deno !== "undefined" && typeof (Deno as any).serve === "function") {
  (Deno as any).serve(verifyRazorpayPaymentHandler);
}

export default verifyRazorpayPaymentHandler;
