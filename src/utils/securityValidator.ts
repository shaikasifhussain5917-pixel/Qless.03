import type { CompletedOrder, ExitQRPayload, SupermarketStore, VerificationResult, CartItem } from "../types/index.ts";
import { getOrderById } from "./orderStorage.ts";
import { nowTime } from "./formatters.ts";
import { supabase, isSupabaseConfigured } from "../lib/supabase.ts";
import { LAUNCH_STORE_ID } from "../config/storeConfig.ts";

/**
 * Validates a customer exit QR pass payload defensively against supermarket store records.
 *
 * When Supabase is configured:
 * 1. Authoritative Database Lookup: Queries public.orders with associated line items and store.
 * 2. Gate Verification: Invokes PostgreSQL procedure public.verify_turnstile_exit_pass to
 *    atomically lock rows, verify payment status, check expiration, prevent duplicate
 *    redemptions, and record an immutable entry into public.security_logs.
 *
 * When Supabase is unconfigured:
 * Gracefully verifies against local demonstration storage.
 */
export async function validateExitQRPayload(
  rawText: string,
  currentStore?: SupermarketStore | null,
  sessionVerifiedMap?: Map<string, string>,
  terminalId: string = "Gate Turnstile #02"
): Promise<VerificationResult> {
  const verifiedAt = nowTime();

  if (!rawText || !rawText.trim()) {
    return {
      outcome: "failure",
      order: null,
      scannedPayload: null,
      rawPayload: "",
      failureReason: "INVALID_JSON",
      failureMessage: "Empty QR code detected. No payload data received.",
      verifiedAt,
    };
  }

  const trimmedText = rawText.trim();

  // 1. Guard against scanning store entrance QR codes as exit passes
  if (
    trimmedText.includes("QLESS_STORE_ENTRY") ||
    trimmedText.includes('"type":"QLESS_STORE_ENTRY"') ||
    trimmedText.includes('"type": "QLESS_STORE_ENTRY"')
  ) {
    return {
      outcome: "failure",
      order: null,
      scannedPayload: null,
      rawPayload: rawText,
      failureReason: "INVALID_JSON",
      failureMessage:
        "Store entrance QR code scanned. Entrance passes cannot be used as customer exit passes. Please scan the customer's checkout exit pass.",
      verifiedAt,
    };
  }

  // 2. Determine if payload is JSON or a direct manual Order ID / Pass ID
  let orderIdToLookup: string | null = null;
  let receiptIdToLookup: string | null = null;
  let parsedPayload: Record<string, unknown> | null = null;
  let typedPayload: Partial<ExitQRPayload> | null = null;

  if (trimmedText.startsWith("{")) {
    // Attempt JSON parse
    try {
      const parsed = JSON.parse(trimmedText);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        parsedPayload = parsed as Record<string, unknown>;
        if (typeof parsedPayload.orderId === "string" && parsedPayload.orderId.trim()) {
          orderIdToLookup = parsedPayload.orderId.trim();
        }
        if (typeof parsedPayload.receiptId === "string" && parsedPayload.receiptId.trim()) {
          receiptIdToLookup = parsedPayload.receiptId.trim();
        }

        const expiryRaw = (
          typeof parsedPayload.expiresAt === "string"
            ? parsedPayload.expiresAt
            : parsedPayload.mockExpiry
        ) as string | undefined;

        typedPayload = {
          orderId: orderIdToLookup || "",
          receiptId: receiptIdToLookup || undefined,
          storeId: typeof parsedPayload.storeId === "string" ? parsedPayload.storeId.trim() : undefined,
          storeName: typeof parsedPayload.storeName === "string" ? parsedPayload.storeName : undefined,
          itemCount: typeof parsedPayload.itemCount === "number" ? parsedPayload.itemCount : undefined,
          finalTotal: typeof parsedPayload.finalTotal === "number" ? parsedPayload.finalTotal : undefined,
          status: typeof parsedPayload.status === "string" ? parsedPayload.status : undefined,
          issuedAt: typeof parsedPayload.issuedAt === "string" ? parsedPayload.issuedAt : undefined,
          expiresAt: expiryRaw,
          mockExpiry: expiryRaw,
          paymentMethod: typeof parsedPayload.paymentMethod === "string" ? parsedPayload.paymentMethod : undefined,
        };
      } else {
        return {
          outcome: "failure",
          order: null,
          scannedPayload: null,
          rawPayload: rawText,
          failureReason: "INVALID_JSON",
          failureMessage: "Malformed QR payload structure. Expected an Exit Pass JSON object.",
          verifiedAt,
        };
      }
    } catch {
      return {
        outcome: "failure",
        order: null,
        scannedPayload: null,
        rawPayload: rawText,
        failureReason: "INVALID_JSON",
        failureMessage: "Invalid QR format. The scanned code does not contain valid JSON data.",
        verifiedAt,
      };
    }
  } else {
    // Plain text input: Direct manual Order ID or Receipt ID entry fallback
    // e.g. "QL-2026-C1369" or "REC-2610-52183C" or "ORD-..."
    orderIdToLookup = trimmedText;
    typedPayload = {
      orderId: trimmedText,
    };
  }

  if (!orderIdToLookup && !receiptIdToLookup) {
    return {
      outcome: "failure",
      order: null,
      scannedPayload: typedPayload,
      rawPayload: rawText,
      failureReason: "MISSING_FIELDS",
      failureMessage: "Exit pass is missing required order identifier.",
      verifiedAt,
    };
  }

  // ── BRANCH A: AUTHORITATIVE SUPABASE DATABASE VERIFICATION ──
  if (isSupabaseConfigured && supabase) {
    try {
      // 3a. Retrieve authoritative order record and line items from database
      let query = supabase
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
          stores (
            id,
            name,
            code,
            branch,
            address,
            chain
          ),
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
        `);

      if (orderIdToLookup) {
        query = query.eq("id", orderIdToLookup);
      } else if (receiptIdToLookup) {
        query = query.eq("receipt_id", receiptIdToLookup);
      }

      const { data: rawDbOrder, error: orderErr } = await query.maybeSingle();

      if (orderErr) {
        console.warn("[QLess Guard] Order lookup query error:", orderErr.message);
      }

      if (!rawDbOrder) {
        return {
          outcome: "failure",
          order: null,
          scannedPayload: typedPayload,
          rawPayload: rawText,
          failureReason: "UNKNOWN_ORDER",
          failureMessage: `Unknown order reference: No record found for '${orderIdToLookup || receiptIdToLookup}' in supermarket database.`,
          verifiedAt,
        };
      }

      const dbOrder = rawDbOrder as any;

      // 3b. Map database order to frontend CompletedOrder
      const mappedItems: CartItem[] = (dbOrder.order_items || []).map((it: any) => ({
        id: it.product_id || it.id,
        productId: it.product_id,
        name: it.product_name,
        category: it.category || "General",
        unitSize: it.unit_size || "",
        barcode: it.barcode,
        price: Number(it.unit_price),
        quantity: it.quantity,
        emoji: "🛍️",
      }));

      const mappedStore: SupermarketStore = {
        id: dbOrder.stores?.id || dbOrder.store_id || LAUNCH_STORE_ID,
        name: dbOrder.stores?.name || "QLess Mart",
        chain: dbOrder.stores?.chain || "QLess Mart",
        branch: dbOrder.stores?.branch || "HSR Layout Flagship",
        address: dbOrder.stores?.address || "",
        distance: "In-Store Terminal",
        timing: dbOrder.stores?.timing || "07:00 AM – 11:00 PM",
        isOpen: true,
        tagline: "Scan. Pay. Go. — Official Smart Self-Checkout Flagship",
        brandColor: "#0F2044",
        brandBg: "bg-blue-50 text-[#0F2044] border-blue-200",
      };

      const mappedOrder: CompletedOrder = {
        orderId: dbOrder.id,
        sessionId: dbOrder.session_id || "SES-OFFICIAL",
        receiptId: dbOrder.receipt_id,
        store: mappedStore,
        items: mappedItems,
        itemCount: mappedItems.reduce((acc, it) => acc + it.quantity, 0),
        subtotal: Number(dbOrder.subtotal),
        mrpSavings: Number(dbOrder.mrp_savings || 0),
        couponCode: dbOrder.coupon_code || undefined,
        couponDiscount: Number(dbOrder.coupon_discount || 0),
        taxableAmount: Number(dbOrder.taxable_amount),
        cgst: Number(dbOrder.cgst || 0),
        sgst: Number(dbOrder.sgst || 0),
        taxTotal: Number(dbOrder.tax_total || 0),
        finalTotal: Number(dbOrder.final_total),
        paymentMethod: dbOrder.payment_method,
        paymentReference: dbOrder.payment_reference,
        paidAt: dbOrder.paid_at
          ? new Date(dbOrder.paid_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : verifiedAt,
        paymentStatus: dbOrder.payment_status,
        issuedAt: dbOrder.created_at,
        expiresAt: typedPayload?.expiresAt,
        mockExpiry: typedPayload?.expiresAt,
        isLive: true,
      };

      // 3c. Store assignment validation
      const activeStoreId = currentStore?.id || LAUNCH_STORE_ID;
      if (dbOrder.store_id !== activeStoreId) {
        return {
          outcome: "failure",
          order: mappedOrder,
          scannedPayload: typedPayload,
          rawPayload: rawText,
          failureReason: "STORE_MISMATCH",
          failureMessage: `Store mismatch: Pass was issued for store '${dbOrder.store_id}', but this gate checkpoint belongs to '${activeStoreId}'.`,
          verifiedAt,
        };
      }

      // 3d. Authoritative Payment status validation
      if (dbOrder.payment_status !== "CONFIRMED") {
        return {
          outcome: "failure",
          order: mappedOrder,
          scannedPayload: typedPayload,
          rawPayload: rawText,
          failureReason: "STATUS_INVALID",
          failureMessage: `Customer exit is not authorized. Order payment is ${dbOrder.payment_status}. Please direct the customer to the cashier.`,
          verifiedAt,
        };
      }

      // 3e. Amount integrity check (if pass payload specifies an amount)
      if (
        typedPayload &&
        typeof typedPayload.finalTotal === "number" &&
        Math.abs(Number(dbOrder.final_total) - typedPayload.finalTotal) > 0.05
      ) {
        return {
          outcome: "failure",
          order: mappedOrder,
          scannedPayload: typedPayload,
          rawPayload: rawText,
          failureReason: "AMOUNT_MISMATCH",
          failureMessage: `Total amount mismatch: Pass declares ₹${typedPayload.finalTotal.toFixed(2)}, but database transaction total is ₹${Number(dbOrder.final_total).toFixed(2)}.`,
          verifiedAt,
        };
      }

      // 3f. Authoritative Database RPC execution: public.verify_turnstile_exit_pass
      const { data: rpcData, error: rpcError } = await (supabase.rpc as any)(
        "verify_turnstile_exit_pass",
        {
          p_order_id: dbOrder.id,
          p_terminal_id: terminalId || "Gate Turnstile #02",
        }
      );

      if (rpcError) {
        console.warn("[QLess Guard] verify_turnstile_exit_pass RPC error:", rpcError.message);
        return {
          outcome: "failure",
          order: mappedOrder,
          scannedPayload: typedPayload,
          rawPayload: rawText,
          failureMessage: rpcError.message || "Database turnstile verification RPC failed.",
          verifiedAt,
        };
      }

      const rpcResult = rpcData as {
        success?: boolean;
        outcome?: "success" | "duplicate_warning" | "failure";
        reason?: string;
        message?: string;
        verifiedAt?: string;
        firstVerifiedAt?: string;
      };

      // Handle duplicate exit pass redemption
      if (rpcResult.outcome === "duplicate_warning" || rpcResult.reason === "DUPLICATE_EXIT_SCAN") {
        const firstTimeStr = rpcResult.firstVerifiedAt
          ? new Date(rpcResult.firstVerifiedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "earlier";

        return {
          outcome: "duplicate_warning",
          order: mappedOrder,
          scannedPayload: typedPayload,
          rawPayload: rawText,
          failureReason: "DUPLICATE_EXIT_SCAN",
          failureMessage: rpcResult.message || `EXIT PASS ALREADY USED. Turnstile pass has already been used for gate exit at ${firstTimeStr}.`,
          firstVerifiedAt: firstTimeStr,
          verifiedAt,
          isDatabaseVerified: true,
        };
      }

      // Handle RPC failure (expired, unknown, store mismatch, unpaid)
      if (rpcResult.outcome === "failure" || !rpcResult.success) {
        return {
          outcome: "failure",
          order: mappedOrder,
          scannedPayload: typedPayload,
          rawPayload: rawText,
          failureReason: (rpcResult.reason as any) || "VERIFICATION_FAILED",
          failureMessage: rpcResult.message || "Turnstile gate clearance was denied by the database.",
          verifiedAt,
          isDatabaseVerified: true,
        };
      }

      // Clearance Approved!
      const clearanceTime = rpcResult.verifiedAt
        ? new Date(rpcResult.verifiedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : verifiedAt;

      return {
        outcome: "success",
        order: mappedOrder,
        scannedPayload: typedPayload,
        rawPayload: rawText,
        verifiedAt: clearanceTime,
        isDatabaseVerified: true,
      };
    } catch (err: unknown) {
      console.warn("[QLess Guard] Unexpected exception during live database verification:", err);
      return {
        outcome: "failure",
        order: null,
        scannedPayload: typedPayload,
        rawPayload: rawText,
        failureMessage:
          err instanceof Error ? err.message : "A network error occurred while contacting gate server.",
        verifiedAt,
      };
    }
  }

  // ── BRANCH B: DEMONSTRATION LOCAL STORAGE SIMULATION FALLBACK ──
  // (Used only when Supabase credentials are completely unconfigured)
  const lookupKey = orderIdToLookup || receiptIdToLookup || "";
  const storedOrder: CompletedOrder | undefined =
    getOrderById(lookupKey) || (receiptIdToLookup ? getOrderById(receiptIdToLookup) : undefined);

  if (!storedOrder) {
    return {
      outcome: "failure",
      order: null,
      scannedPayload: typedPayload,
      rawPayload: rawText,
      failureReason: "UNKNOWN_ORDER",
      failureMessage: `Unknown order reference: No record found for '${lookupKey}' in supermarket transaction history.`,
      verifiedAt,
    };
  }

  // Store location integrity
  if (currentStore && storedOrder.store?.id) {
    const isStoreMatch =
      storedOrder.store.id === currentStore.id ||
      storedOrder.store.id === LAUNCH_STORE_ID ||
      storedOrder.store.chain === currentStore.chain;

    if (!isStoreMatch) {
      return {
        outcome: "failure",
        order: storedOrder,
        scannedPayload: typedPayload,
        rawPayload: rawText,
        failureReason: "STORE_MISMATCH",
        failureMessage: `Store mismatch: Pass was issued for '${storedOrder.store?.name || storedOrder.store?.id}', but this gate checkpoint belongs to '${currentStore.name}'.`,
        verifiedAt,
      };
    }
  }

  // Authoritative payment status check in stored order
  if (storedOrder.paymentStatus !== "CONFIRMED") {
    return {
      outcome: "failure",
      order: storedOrder,
      scannedPayload: typedPayload,
      rawPayload: rawText,
      failureReason: "STATUS_INVALID",
      failureMessage: `Customer exit is not authorized. Order payment is ${storedOrder.paymentStatus || "PENDING"}. Please direct the customer to the cashier.`,
      verifiedAt,
    };
  }

  // Expiration check
  if (typedPayload?.expiresAt) {
    const expTime = new Date(typedPayload.expiresAt).getTime();
    if (!isNaN(expTime) && expTime <= Date.now()) {
      const expStr = new Date(typedPayload.expiresAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      return {
        outcome: "failure",
        order: storedOrder,
        scannedPayload: typedPayload,
        rawPayload: rawText,
        failureReason: "EXPIRED_PASS",
        failureMessage: `Turnstile gate pass has expired (expired at ${expStr}).`,
        verifiedAt,
      };
    }
  }

  // Amount integrity
  if (
    typedPayload &&
    typeof typedPayload.finalTotal === "number" &&
    Math.abs(storedOrder.finalTotal - typedPayload.finalTotal) > 0.05
  ) {
    return {
      outcome: "failure",
      order: storedOrder,
      scannedPayload: typedPayload,
      rawPayload: rawText,
      failureReason: "AMOUNT_MISMATCH",
      failureMessage: `Total amount mismatch: Pass declares ₹${typedPayload.finalTotal.toFixed(2)}, but recorded transaction total is ₹${storedOrder.finalTotal.toFixed(2)}.`,
      verifiedAt,
    };
  }

  // Session duplicate check in local demo mode
  if (sessionVerifiedMap && sessionVerifiedMap.has(storedOrder.orderId)) {
    const firstVerifiedAt = sessionVerifiedMap.get(storedOrder.orderId) || "earlier in this session";
    return {
      outcome: "duplicate_warning",
      order: storedOrder,
      scannedPayload: typedPayload,
      rawPayload: rawText,
      failureReason: "DUPLICATE_EXIT_SCAN",
      failureMessage: `EXIT PASS ALREADY USED. Turnstile pass has already been used for gate exit at ${firstVerifiedAt}.`,
      verifiedAt,
      firstVerifiedAt,
    };
  }

  return {
    outcome: "success",
    order: storedOrder,
    scannedPayload: typedPayload,
    rawPayload: rawText,
    verifiedAt,
    isDatabaseVerified: false,
  };
}

/**
 * Creates diagnostic test payloads for security guard testing.
 */
export function generateTestPayloads(baseOrder?: CompletedOrder | null) {
  const now = new Date();
  const validExpiry = new Date(now.getTime() + 3600000).toISOString();
  const expiredTime = new Date(now.getTime() - 600000).toISOString();

  const orderId = baseOrder?.orderId || "QL-2026-C1369";
  const receiptId = baseOrder?.receiptId || "REC-2610-52183C";
  const storeId = baseOrder?.store?.id || "STORE001";
  const finalTotal = baseOrder?.finalTotal ?? 10.5;

  return {
    valid: JSON.stringify({
      orderId,
      receiptId,
      storeId,
      finalTotal,
      status: "PAID_CONFIRMED",
      paymentMethod: baseOrder?.paymentMethod || "cash",
      issuedAt: now.toISOString(),
      expiresAt: validExpiry,
    }),
    statusUnpaid: JSON.stringify({
      orderId,
      receiptId,
      storeId,
      finalTotal,
      status: "PENDING_PAYMENT",
      issuedAt: now.toISOString(),
      expiresAt: validExpiry,
    }),
    expired: JSON.stringify({
      orderId,
      receiptId,
      storeId,
      finalTotal,
      status: "PAID_CONFIRMED",
      issuedAt: new Date(now.getTime() - 7200000).toISOString(),
      expiresAt: expiredTime,
    }),
    amountMismatch: JSON.stringify({
      orderId,
      receiptId,
      storeId,
      finalTotal: 999.99, // tampered amount
      status: "PAID_CONFIRMED",
      issuedAt: now.toISOString(),
      expiresAt: validExpiry,
    }),
    storeMismatch: JSON.stringify({
      orderId,
      receiptId,
      storeId: "STORE_OTHER_BRANCH",
      finalTotal,
      status: "PAID_CONFIRMED",
      issuedAt: now.toISOString(),
      expiresAt: validExpiry,
    }),
    unknownOrder: JSON.stringify({
      orderId: "QL-2026-FAKE999",
      receiptId: "REC-FAKE-999",
      storeId,
      finalTotal: 150.0,
      status: "PAID_CONFIRMED",
      issuedAt: now.toISOString(),
      expiresAt: validExpiry,
    }),
    entranceQR: JSON.stringify({
      type: "QLESS_STORE_ENTRY",
      storeCode: "QLM001",
      storeId: "STORE001",
    }),
    malformedJson: `{"orderId": "${orderId}", "status": "PAID_CONFIRMED", incomplete_json...`,
    plainOrderId: orderId,
  };
}
