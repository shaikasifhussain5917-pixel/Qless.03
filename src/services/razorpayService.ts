/**
 * QLess Smart Shopping - Razorpay Test Mode Service
 * Store: STORE001 (QLess Mart)
 *
 * Responsibilities:
 * 1. Dynamically load the Razorpay checkout.js SDK on demand (only when digital payment is chosen).
 * 2. Invoke local Supabase Edge Functions with customer JWT.
 * 3. Never expose or handle Razorpay secret keys in frontend code.
 * 4. Coordinate order creation, checkout modal, and cryptographic payment verification.
 */

import { supabase } from "../lib/supabase";

export interface RazorpayOrderCreationResponse {
  success: boolean;
  orderId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  keyId: string;
  expiresAt?: string;
  isReused?: boolean;
  error?: string;
}

export interface RazorpayVerificationResponse {
  success: boolean;
  orderId: string;
  status: "CONFIRMED" | "REFUND_REQUIRED" | string;
  paymentId?: string;
  confirmedAt?: string;
  isDuplicate?: boolean;
  requiresRefund?: boolean;
  error?: string;
}

export interface RazorpayCheckoutSuccessCallbackPayload {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpayCheckoutSuccessCallbackPayload) => void;
  modal?: {
    ondismiss?: () => void;
    escape?: boolean;
    backdropclose?: boolean;
  };
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
    vpa?: string;
    method?: string;
  };
  notes?: Record<string, string>;
  theme?: {
    color?: string;
  };
  config?: Record<string, unknown>;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => {
      open: () => void;
      close: () => void;
    };
  }
}

let scriptLoadingPromise: Promise<boolean> | null = null;

/**
 * Dynamically loads https://checkout.razorpay.com/v1/checkout.js on demand.
 * Returns true if loaded successfully, false on network failure.
 */
export function loadRazorpayCheckoutScript(): Promise<boolean> {
  if (typeof window === "undefined") {
    return Promise.resolve(false);
  }

  if (window.Razorpay) {
    return Promise.resolve(true);
  }

  if (scriptLoadingPromise) {
    return scriptLoadingPromise;
  }

  scriptLoadingPromise = new Promise<boolean>((resolve) => {
    const existingScript = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(true));
      existingScript.addEventListener("error", () => resolve(false));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      console.error("[Razorpay Service] Failed to load Razorpay checkout.js script.");
      resolve(false);
    };

    document.body.appendChild(script);
  });

  return scriptLoadingPromise;
}

async function extractEdgeFunctionErrorMessage(
  error: unknown,
  fallback: string
): Promise<string> {
  if (!error || typeof error !== "object") return fallback;
  try {
    const errObj = error as { context?: { json?: () => Promise<unknown> }; message?: string };
    if (errObj.context && typeof errObj.context.json === "function") {
      const body = (await errObj.context.json()) as { error?: string; message?: string } | null;
      if (body && typeof body.error === "string" && body.error.trim()) {
        return body.error.trim();
      }
      if (body && typeof body.message === "string" && body.message.trim()) {
        return body.message.trim();
      }
    }
  } catch {
    // If context body was already consumed or not JSON
  }
  return (error as { message?: string })?.message || fallback;
}

/**
 * Requests server-side creation of a Razorpay Order for a pending QLess order.
 * Calls local Edge Function: create-razorpay-order
 */
export async function createRazorpayOrderServer(
  orderId: string
): Promise<RazorpayOrderCreationResponse> {
  if (!supabase) {
    return {
      success: false,
      orderId,
      razorpayOrderId: "",
      amount: 0,
      currency: "INR",
      keyId: "",
      error: "Supabase client is not available.",
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke("create-razorpay-order", {
      body: { orderId: orderId.trim() },
    });

    if (error) {
      console.error("[Razorpay Service] create-razorpay-order error:", error);
      const detailedError = await extractEdgeFunctionErrorMessage(
        error,
        "Failed to create Razorpay payment order on server."
      );
      return {
        success: false,
        orderId,
        razorpayOrderId: "",
        amount: 0,
        currency: "INR",
        keyId: "",
        error: detailedError,
      };
    }

    if (!data || !data.success) {
      return {
        success: false,
        orderId,
        razorpayOrderId: "",
        amount: 0,
        currency: "INR",
        keyId: "",
        error: data?.error || "Payment gateway rejected order creation.",
      };
    }

    return {
      success: true,
      orderId: data.orderId,
      razorpayOrderId: data.razorpayOrderId,
      amount: data.amount,
      currency: data.currency || "INR",
      keyId: data.keyId,
      expiresAt: data.expiresAt,
      isReused: data.isReused,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network error contacting create-razorpay-order";
    return {
      success: false,
      orderId,
      razorpayOrderId: "",
      amount: 0,
      currency: "INR",
      keyId: "",
      error: msg,
    };
  }
}

/**
 * Verifies client payment credentials server-side and marks order CONFIRMED.
 * Calls local Edge Function: verify-razorpay-payment
 */
export async function verifyRazorpayPaymentServer(params: {
  orderId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<RazorpayVerificationResponse> {
  if (!supabase) {
    return {
      success: false,
      orderId: params.orderId,
      status: "FAILED",
      error: "Supabase client is not available.",
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke("verify-razorpay-payment", {
      body: {
        orderId: params.orderId.trim(),
        razorpayOrderId: params.razorpayOrderId.trim(),
        razorpayPaymentId: params.razorpayPaymentId.trim(),
        razorpaySignature: params.razorpaySignature.trim(),
      },
    });

    if (error) {
      console.error("[Razorpay Service] verify-razorpay-payment error:", error);
      const detailedError = await extractEdgeFunctionErrorMessage(
        error,
        "Server payment verification failed."
      );
      return {
        success: false,
        orderId: params.orderId,
        status: "FAILED",
        error: detailedError,
      };
    }

    if (!data || !data.success) {
      return {
        success: false,
        orderId: params.orderId,
        status: data?.requiresRefund ? "REFUND_REQUIRED" : "FAILED",
        requiresRefund: data?.requiresRefund,
        error: data?.error || "Payment verification failed with server.",
      };
    }

    return {
      success: true,
      orderId: data.orderId,
      status: data.status || "CONFIRMED",
      paymentId: data.paymentId,
      confirmedAt: data.confirmedAt,
      isDuplicate: data.isDuplicate,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network error contacting verify-razorpay-payment";
    return {
      success: false,
      orderId: params.orderId,
      status: "FAILED",
      error: msg,
    };
  }
}

/**
 * Cancels a pending order and restores its reserved inventory in PostgreSQL.
 * Used when a customer explicitly cancels after an order was created, or when gateway creation fails.
 */
export async function cancelPendingOrderAndRestoreStock(
  orderId: string,
  reason: string = "Customer cancelled before payment completion"
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) {
    return { success: false, error: "Supabase client unavailable." };
  }

  try {
    const { data, error } = await (supabase.rpc as any)("cancel_and_restore_pending_order", {
      p_order_id: orderId.trim(),
      p_reason: reason.trim(),
      p_idempotency_key: `CUST-CANCEL-${orderId.trim()}-${Date.now()}`,
    });

    if (error) {
      console.error("[Razorpay Service] cancel_and_restore_pending_order error:", error);
      return { success: false, error: error.message };
    }

    const res = data as { success?: boolean; error?: string } | null;
    if (!res || !res.success) {
      return { success: false, error: res?.error || "Failed to cancel order." };
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network error during cancellation";
    return { success: false, error: msg };
  }
}
