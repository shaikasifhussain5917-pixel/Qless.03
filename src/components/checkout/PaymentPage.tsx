import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { CompletedOrder, Coupon, PaymentMethod, PaymentProcessState, SupermarketStore, CartItem } from "../../types";
import { calculateBill, validateCartForCheckout } from "../../utils/billing";
import { fmt } from "../../utils/formatters";
import { IcAlert, IcBack, IcCheck } from "../common/Icons";
import { EmptyState } from "../common/EmptyState";
import { useShopping } from "../../context/ShoppingContext";
import { useAuth } from "../../context/AuthContext";
import { isSupabaseConfigured } from "../../lib/supabase";
import { StockErrorModal, parseStockError, type StockErrorItem } from "../ui/StockErrorModal";
import {
  loadRazorpayCheckoutScript,
  createRazorpayOrderServer,
  verifyRazorpayPaymentServer,
  cancelPendingOrderAndRestoreStock,
  RazorpayCheckoutOptions,
  RazorpayCheckoutSuccessCallbackPayload,
} from "../../services/razorpayService";

export interface PaymentPageProps {
  items: CartItem[];
  selectedStore: SupermarketStore | null;
  sessionId: string;
  receiptId: string;
  walletBalance: number;
  appliedCoupon: Coupon | null;
  onBack: () => void;
  onPaymentSuccess: (order: CompletedOrder) => void;
  onEditOrder?: () => void;
}

interface PaymentOptionConfig {
  id: PaymentMethod;
  name: string;
  iconType: "cash" | "upi" | "card" | "wallet";
  disabled?: boolean;
}

function PaymentTileIcon({ type, className = "h-8 w-8" }: { type: "cash" | "upi" | "card" | "wallet"; className?: string }) {
  if (type === "cash") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect width="20" height="12" x="2" y="6" rx="2" />
        <circle cx="12" cy="12" r="2" />
        <path d="M6 12h.01M18 12h.01" />
      </svg>
    );
  }
  if (type === "upi") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    );
  }
  if (type === "card") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect width="20" height="14" x="2" y="5" rx="2" />
        <line x1="2" x2="22" y1="10" y2="10" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </svg>
  );
}

const PAYMENT_OPTIONS: PaymentOptionConfig[] = [
  {
    id: "cash",
    name: "Cash at Counter",
    iconType: "cash",
    disabled: false,
  },
  {
    id: "upi",
    name: "UPI",
    iconType: "upi",
    disabled: false,
  },
  {
    id: "card",
    name: "Credit/Debit Card",
    iconType: "card",
    disabled: false,
  },
  {
    id: "wallet",
    name: "QLess Wallet",
    iconType: "wallet",
    disabled: true,
  },
];

/**
 * PaymentPage — Dedicated, Mobile-Optimized Supermarket Payment Screen
 *
 * Requirements satisfied:
 * 1. Dedicated payment page opened at the top every time.
 * 2. Order summary and total displayed immediately with item breakdown.
 * 3. All payment options displayed in compact, accessible cards without requiring scrolling.
 * 4. Cash is the active pilot method, selected by default.
 * 5. Primary button clearly displays "Place Cash Order — ₹[Total]" when Cash is selected.
 * 6. Single synchronous source of truth for payment selection, preventing stale closures.
 * 7. In-flight digital order state reset and clean cart restoration upon switching to Cash.
 * 8. Authoritative backend pricing, inventory locks, idempotency, and cashier verification preserved.
 */
export function PaymentPage({
  items,
  selectedStore,
  sessionId,
  walletBalance,
  appliedCoupon,
  onBack,
  onPaymentSuccess,
  onEditOrder,
}: PaymentPageProps) {
  const {
    executeCheckout,
    isCheckingOut,
    clearActiveIdempotencyKey,
    restoreCartItems,
  } = useShopping();
  const { user, isAuthenticated, hasValidEntrance, entranceSession } = useAuth();

  // Scroll to top on mount to ensure immediate visibility
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  // ── 1. SINGLE SOURCE OF TRUTH PAYMENT METHOD STATE ──
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("cash");
  const selectedMethodRef = useRef<PaymentMethod>("cash");

  useEffect(() => {
    selectedMethodRef.current = selectedMethod;
  }, [selectedMethod]);

  const [processState, setProcessState] = useState<PaymentProcessState>("ready");
  const [processMessage, setProcessMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isNetworkTimeout, setIsNetworkTimeout] = useState<boolean>(false);
  const [stockModalItems, setStockModalItems] = useState<StockErrorItem[] | null>(null);

  /**
   * Dispatches checkout errors: Insufficient stock errors open the professional StockErrorModal
   * and suppress the footer alert note. Non-stock errors are shown in the footer note.
   */
  const handleCheckoutError = useCallback(
    (err: string | null | undefined, isNetwork = false) => {
      if (!err) return;
      const parsed = parseStockError(err);
      if (parsed && parsed.length > 0) {
        setStockModalItems(parsed);
        setErrorMessage(null);
        setIsNetworkTimeout(false);
      } else {
        setStockModalItems(null);
        setIsNetworkTimeout(isNetwork);
        setErrorMessage(err);
      }
    },
    []
  );

  // Retain pending digital order reference if staged in database
  const [pendingDigitalOrder, setPendingDigitalOrder] = useState<CompletedOrder | null>(null);

  // Submission lock ref
  const isSubmittingRef = useRef<boolean>(false);
  const activePaymentAttemptIdRef = useRef<number>(0);
  const activeRazorpayInstanceRef = useRef<{ close?: () => void } | null>(null);

  // Expandable item breakdown toggle (defaults to compact preview on mobile)
  const [showItemDetails, setShowItemDetails] = useState<boolean>(false);

  // ── 2. EFFECTIVE CART ITEMS & BILL SUMMARY ──
  const effectiveItems = useMemo<CartItem[]>(() => {
    if (items && items.length > 0) return items;
    if (pendingDigitalOrder?.items && pendingDigitalOrder.items.length > 0) {
      return pendingDigitalOrder.items;
    }
    return [];
  }, [items, pendingDigitalOrder]);

  const bill = useMemo(() => {
    if (
      pendingDigitalOrder &&
      selectedMethod !== "cash" &&
      pendingDigitalOrder.paymentMethod === selectedMethod
    ) {
      return {
        items: pendingDigitalOrder.items || [],
        itemCount: pendingDigitalOrder.itemCount,
        subtotal: pendingDigitalOrder.subtotal,
        totalMrp: (pendingDigitalOrder.subtotal || 0) + (pendingDigitalOrder.mrpSavings || 0),
        mrpSavings: pendingDigitalOrder.mrpSavings,
        couponDiscount: pendingDigitalOrder.couponDiscount,
        taxableAmount: pendingDigitalOrder.taxableAmount,
        cgst: pendingDigitalOrder.cgst,
        sgst: pendingDigitalOrder.sgst,
        taxTotal: pendingDigitalOrder.taxTotal,
        finalTotal: pendingDigitalOrder.finalTotal,
        appliedCoupon: null,
      };
    }
    return calculateBill(effectiveItems, appliedCoupon);
  }, [effectiveItems, appliedCoupon, pendingDigitalOrder, selectedMethod]);

  /**
   * Resets and cleans all stale Razorpay and digital test state when changing payment methods.
   * Guarantees that selecting Cash immediately switches source of truth to Cash.
   */
  const handleSelectPaymentMethod = useCallback(
    (newMethod: PaymentMethod) => {
      // Prevent switching only while an atomic database checkout request is in-flight
      if (isSubmittingRef.current || isCheckingOut) {
        return;
      }

      if (newMethod === selectedMethodRef.current && !errorMessage) {
        return;
      }

      // 1. Invalidate any pending async callbacks immediately
      activePaymentAttemptIdRef.current += 1;

      // 2. Programmatically close active Razorpay modal if open
      if (activeRazorpayInstanceRef.current && typeof activeRazorpayInstanceRef.current.close === "function") {
        try {
          activeRazorpayInstanceRef.current.close();
        } catch {}
        activeRazorpayInstanceRef.current = null;
      }

      // 3. Clear stale idempotency key from previous method
      clearActiveIdempotencyKey();

      // 4. Synchronously update ref and state
      selectedMethodRef.current = newMethod;
      setSelectedMethod(newMethod);

      // 5. Clear stale errors, warnings, and messages relating to previous method
      setErrorMessage(null);
      setIsNetworkTimeout(false);
      setStockModalItems(null);
      setProcessState("ready");
      setProcessMessage("");

      // 6. When switching to Cash: immediately restore cart items if cart was emptied by digital order
      if (newMethod === "cash" && pendingDigitalOrder) {
        if ((!items || items.length === 0) && pendingDigitalOrder.items && pendingDigitalOrder.items.length > 0) {
          restoreCartItems(pendingDigitalOrder.items);
        }
      }
    },
    [
      isCheckingOut,
      errorMessage,
      pendingDigitalOrder,
      clearActiveIdempotencyKey,
      items,
      restoreCartItems,
    ]
  );

  /**
   * Authoritative Payment Submission Dispatcher
   */
  const handleInitiatePayment = async () => {
    // 1. Guard against duplicate submissions
    if (
      isSubmittingRef.current ||
      isCheckingOut ||
      processState === "validating" ||
      processState === "processing" ||
      processState === "success"
    ) {
      return;
    }

    const methodToSubmit = selectedMethodRef.current;
    const attemptId = ++activePaymentAttemptIdRef.current;

    setErrorMessage(null);
    setIsNetworkTimeout(false);

    // 2. Pre-flight Cart Revalidation (only if fresh order or cash)
    if (!pendingDigitalOrder || methodToSubmit === "cash") {
      const itemsToValidate =
        items && items.length > 0
          ? items
          : pendingDigitalOrder?.items && pendingDigitalOrder.items.length > 0
          ? pendingDigitalOrder.items
          : [];

      const cartValidation = validateCartForCheckout(itemsToValidate, appliedCoupon);
      if (!cartValidation.isValid) {
        handleCheckoutError(cartValidation.errors.join(" "));
        return;
      }
    }

    // 3. Restriction: QLess wallet is disabled during test mode
    if (methodToSubmit === "wallet") {
      setErrorMessage("QLess Wallet is not available during test mode. Please choose Cash or UPI.");
      return;
    }

    // 4. Authoritative Supabase Checkout Flow
    if (isSupabaseConfigured) {
      if (!isAuthenticated || !user?.id) {
        setErrorMessage("Authentication required: Please sign in before proceeding to checkout.");
        return;
      }

      if (!hasValidEntrance || !entranceSession) {
        setErrorMessage("Active store entrance session required. Please scan entrance QR code.");
        return;
      }

      // CASH FLOW: Unaltered physical cash settlement at Cashier Counter #03
      if (methodToSubmit === "cash") {
        isSubmittingRef.current = true;
        setProcessState("processing");
        setProcessMessage("Registering cash order in store database…");

        try {
          // Guarantee items are in active cart before submitting cash order
          if ((!items || items.length === 0) && pendingDigitalOrder?.items?.length) {
            restoreCartItems(pendingDigitalOrder.items);
          }

          const result = await executeCheckout("cash");

          if (activePaymentAttemptIdRef.current !== attemptId || selectedMethodRef.current !== "cash") {
            return;
          }

          if (!result.success) {
            isSubmittingRef.current = false;
            setProcessState("failure");
            handleCheckoutError(
              result.error || "Checkout was declined by the store database.",
              result.isNetworkError
            );
            return;
          }

          // If a prior uncompleted pending digital order existed, release its stock lock safely
          if (pendingDigitalOrder && pendingDigitalOrder.orderId !== result.orderId) {
            const staleOrderId = pendingDigitalOrder.orderId;
            setPendingDigitalOrder(null);
            if (isSupabaseConfigured && staleOrderId) {
              cancelPendingOrderAndRestoreStock(
                staleOrderId,
                "Customer placed order with Cash at Counter"
              ).catch(() => {});
            }
          } else if (pendingDigitalOrder) {
            setPendingDigitalOrder(null);
          }

          setProcessState("success");
          setProcessMessage("Cash order placed! Settle in cash at Counter #03.");

          if (result.order) {
            setTimeout(() => {
              if (activePaymentAttemptIdRef.current === attemptId) {
                onPaymentSuccess(result.order!);
              }
            }, 350);
          }
        } catch (err: unknown) {
          if (activePaymentAttemptIdRef.current !== attemptId) return;
          isSubmittingRef.current = false;
          setProcessState("failure");
          handleCheckoutError(err instanceof Error ? err.message : "Error placing cash order.");
        } finally {
          isSubmittingRef.current = false;
        }
        return;
      }

      // DIGITAL FLOW: UPI and Card via Razorpay Test Mode
      isSubmittingRef.current = true;
      setProcessState("processing");
      setProcessMessage("Loading Razorpay Test Checkout…");

      try {
        const scriptLoaded = await loadRazorpayCheckoutScript();
        if (activePaymentAttemptIdRef.current !== attemptId || selectedMethodRef.current !== methodToSubmit) {
          return;
        }

        if (!scriptLoaded) {
          isSubmittingRef.current = false;
          setProcessState("failure");
          setErrorMessage("Failed to load Razorpay Checkout SDK. Please check your internet connection.");
          return;
        }

        let activeOrder: CompletedOrder;
        if (pendingDigitalOrder && pendingDigitalOrder.paymentMethod === methodToSubmit) {
          activeOrder = pendingDigitalOrder;
        } else {
          setProcessMessage("Authorizing order with store database & reserving inventory…");
          const checkoutResult = await executeCheckout(methodToSubmit);

          if (activePaymentAttemptIdRef.current !== attemptId || selectedMethodRef.current !== methodToSubmit) {
            return;
          }

          if (!checkoutResult.success || !checkoutResult.order || !checkoutResult.orderId) {
            isSubmittingRef.current = false;
            setProcessState("failure");
            handleCheckoutError(
              checkoutResult.error || "Checkout was declined by the store database.",
              checkoutResult.isNetworkError
            );
            return;
          }
          activeOrder = checkoutResult.order;
          setPendingDigitalOrder(activeOrder);
        }

        setProcessMessage("Initializing Razorpay Test gateway session…");
        const rzpOrderRes = await createRazorpayOrderServer(activeOrder.orderId);

        if (activePaymentAttemptIdRef.current !== attemptId || selectedMethodRef.current !== methodToSubmit) {
          return;
        }

        if (!rzpOrderRes.success) {
          isSubmittingRef.current = false;
          setProcessState("failure");
          setErrorMessage(
            rzpOrderRes.error ||
              "Order is reserved in database, but Razorpay order creation failed. You can retry or switch to Cash."
          );
          return;
        }

        setProcessMessage(
          methodToSubmit === "upi"
            ? "Awaiting UPI payment in Razorpay Test Checkout (Enter test VPA: success@razorpay)…"
            : "Awaiting payment in Razorpay Test Checkout…"
        );

        if (!window.Razorpay) {
          isSubmittingRef.current = false;
          setProcessState("failure");
          setErrorMessage("Razorpay SDK not available on window object.");
          return;
        }

        const options: RazorpayCheckoutOptions = {
          key: rzpOrderRes.keyId,
          amount: rzpOrderRes.amount,
          currency: rzpOrderRes.currency,
          name: "QLess Mart",
          description: `Order ${activeOrder.orderId}`,
          order_id: rzpOrderRes.razorpayOrderId,
          prefill: {
            name: user?.name || "QLess Shopper",
            email: user?.email || "shopper@qless.local",
            contact: user?.phone || "9999999999",
            method: methodToSubmit === "upi" ? "upi" : undefined,
            vpa: methodToSubmit === "upi" ? "success@razorpay" : undefined,
          },
          config:
            methodToSubmit === "upi"
              ? {
                  display: {
                    blocks: {
                      upi: {
                        name: "Pay via UPI (Razorpay Test Mode)",
                        instruments: [{ method: "upi" }],
                      },
                    },
                    sequence: ["block.upi"],
                    preferences: {
                      show_default_blocks: true,
                    },
                  },
                }
              : undefined,
          theme: { color: "#2E9E44" },
          handler: async (response: RazorpayCheckoutSuccessCallbackPayload) => {
            if (activePaymentAttemptIdRef.current !== attemptId || selectedMethodRef.current !== methodToSubmit) {
              return;
            }

            setProcessState("processing");
            setProcessMessage("Verifying cryptographic signature with server…");

            try {
              const verifyRes = await verifyRazorpayPaymentServer({
                orderId: activeOrder.orderId,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              });

              if (activePaymentAttemptIdRef.current !== attemptId || selectedMethodRef.current !== methodToSubmit) {
                return;
              }

              if (!verifyRes.success || verifyRes.status !== "CONFIRMED") {
                isSubmittingRef.current = false;
                setProcessState("failure");
                setErrorMessage(verifyRes.error || "Payment verification failed with server.");
                return;
              }

              const confirmedOrder: CompletedOrder = {
                ...activeOrder,
                paymentStatus: "CONFIRMED",
                paymentReference: response.razorpay_payment_id,
                paidAt: verifyRes.confirmedAt || new Date().toISOString(),
              };

              setPendingDigitalOrder(null);
              setProcessState("success");
              setProcessMessage("Payment verified! Generating exit pass…");

              setTimeout(() => {
                if (activePaymentAttemptIdRef.current === attemptId) {
                  onPaymentSuccess(confirmedOrder);
                }
              }, 350);
            } catch (vErr: unknown) {
              if (activePaymentAttemptIdRef.current !== attemptId) return;
              setProcessState("failure");
              setErrorMessage("An unexpected error occurred during server payment verification.");
            } finally {
              isSubmittingRef.current = false;
            }
          },
          modal: {
            ondismiss: () => {
              if (activePaymentAttemptIdRef.current !== attemptId || selectedMethodRef.current !== methodToSubmit) {
                return;
              }
              isSubmittingRef.current = false;
              activeRazorpayInstanceRef.current = null;
              setProcessState("ready");
              setProcessMessage("");
              setErrorMessage(
                "Razorpay checkout modal closed. You can retry payment, or switch to Cash to pay at Counter #03."
              );
            },
          },
        };

        const razorpayInstance = new window.Razorpay(options);
        activeRazorpayInstanceRef.current = razorpayInstance;
        razorpayInstance.open();
      } catch (err: unknown) {
        if (activePaymentAttemptIdRef.current !== attemptId) return;
        isSubmittingRef.current = false;
        setProcessState("failure");
        handleCheckoutError(err instanceof Error ? err.message : "Error during digital checkout.");
      } finally {
        isSubmittingRef.current = false;
      }
      return;
    }

    // 5. Offline Demonstration Simulation Mode (ONLY when Supabase is unconfigured)
    isSubmittingRef.current = true;
    setProcessState("validating");
    setProcessMessage("Processing checkout simulation…");

    setTimeout(async () => {
      if (activePaymentAttemptIdRef.current !== attemptId || selectedMethodRef.current !== methodToSubmit) {
        return;
      }

      setProcessState("success");
      setProcessMessage(
        methodToSubmit === "cash"
          ? "Cash order placed (Demo Mode)! Settle at counter."
          : "Digital payment simulated successfully!"
      );

      const result = await executeCheckout(methodToSubmit);
      isSubmittingRef.current = false;

      if (result.order) {
        setTimeout(() => {
          if (activePaymentAttemptIdRef.current === attemptId) {
            onPaymentSuccess(result.order!);
          }
        }, 300);
      }
    }, 600);
  };

  const isProcessing =
    processState === "validating" ||
    processState === "processing" ||
    processState === "success";

  const isWalletInsufficient = selectedMethod === "wallet" && walletBalance < bill.finalTotal;

  // Empty cart fallback
  if (effectiveItems.length === 0 && !isProcessing) {
    return (
      <div className="flex flex-1 flex-col qless-fade-in pb-24 max-w-[520px] mx-auto w-full">
        <EmptyState
          emoji="🛒"
          title="Your Cart is Empty"
          description="There are no items in your active shopping session. Please return to the store and scan items before proceeding to payment."
          action={{
            label: "Return to Store",
            onClick: onBack,
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col qless-fade-in pb-28 max-w-[520px] mx-auto w-full px-2 sm:px-0">
      {/* ── A. HEADER ── */}
      <div className="mb-3 sm:mb-4">
        <button
          type="button"
          onClick={onBack}
          disabled={isProcessing}
          className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#7A8493] transition hover:text-[#0F2044] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E9E44] rounded-lg py-1 pr-2"
        >
          <IcBack />
          <span>Back to Order Review</span>
        </button>

        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-poppins text-xl sm:text-2xl font-bold tracking-tight text-[#0F2044]">
              Choose Payment Method
            </h2>
            <p className="mt-0.5 text-xs text-[#7A8493]">
              Review your order and select how you&apos;d like to pay.
            </p>
          </div>
          <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[10px] font-bold text-emerald-800 tracking-wider">
            {selectedStore?.name ? selectedStore.name : "QLess Mart"} {sessionId ? `· #${sessionId.slice(0, 6)}` : ""}
          </span>
        </div>
      </div>

      <div className="space-y-3 sm:space-y-3.5">
        {/* ── B. ORDER SUMMARY CARD (Simple, Clean, Easy to Understand) ── */}
        <section
          aria-label="Order summary breakdown"
          className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs space-y-3"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-base" aria-hidden="true">🧾</span>
              <h3 className="font-poppins text-xs sm:text-sm font-bold uppercase tracking-wider text-[#0F2044]">
                Order Summary
              </h3>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-700">
                {bill.itemCount} {bill.itemCount === 1 ? "item" : "items"}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                if (onEditOrder) onEditOrder();
                else onBack();
              }}
              className="text-xs font-semibold text-[#2E9E44] hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2E9E44] rounded"
            >
              Edit Items
            </button>
          </div>

          {/* Compact Product List Preview */}
          <div className="text-xs space-y-1.5">
            {effectiveItems.slice(0, showItemDetails ? undefined : 2).map((item) => (
              <div key={item.id} className="flex items-center justify-between text-[#0F2044]">
                <div className="flex items-center gap-2 truncate pr-2">
                  <span className="shrink-0">{item.emoji || "🛍️"}</span>
                  <span className="truncate text-xs font-medium">{item.name}</span>
                  <span className="text-[11px] text-[#7A8493] shrink-0 font-mono">
                    ×{item.quantity}
                  </span>
                </div>
                <span className="font-semibold shrink-0">{fmt(item.price * item.quantity)}</span>
              </div>
            ))}

            {effectiveItems.length > 2 && (
              <button
                type="button"
                onClick={() => setShowItemDetails(!showItemDetails)}
                className="text-[11px] font-semibold text-[#7A8493] hover:text-[#0F2044] pt-0.5 transition"
              >
                {showItemDetails
                  ? "▲ Show less"
                  : `▼ View all ${effectiveItems.length} items`}
              </button>
            )}
          </div>

          {/* Simplified Order Summary: Items Subtotal, Discount (if applicable), Total Payable */}
          <div className="border-t border-slate-100 pt-3 space-y-2 text-xs text-[#7A8493]">
            <div className="flex items-center justify-between">
              <span>Items Subtotal ({bill.itemCount} {bill.itemCount === 1 ? "item" : "items"})</span>
              <span className="font-mono font-medium text-[#0F2044]">{fmt(bill.subtotal)}</span>
            </div>

            {bill.couponDiscount > 0 && (
              <div className="flex items-center justify-between text-[#2E9E44]">
                <span>Discount ({appliedCoupon?.code || "Coupon"})</span>
                <span className="font-mono font-semibold">−{fmt(bill.couponDiscount)}</span>
              </div>
            )}

            {bill.mrpSavings > 0 && (
              <div className="flex items-center justify-between text-emerald-700 bg-emerald-50/80 px-2.5 py-1.5 rounded-xl border border-emerald-200/60 text-[11px]">
                <span className="font-medium">Total MRP Savings (Already Discounted)</span>
                <span className="font-mono font-bold">Saved {fmt(bill.mrpSavings)}</span>
              </div>
            )}

            {/* Total Amount Payable */}
            <div className="flex items-baseline justify-between border-t border-slate-100 pt-3 text-[#0F2044]">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] block leading-none mb-1">
                  Total Payable
                </span>
                <span className="text-[10px] text-slate-400">
                  Inclusive of all charges
                </span>
              </div>
              <div className="text-right">
                <span className="font-poppins text-xl sm:text-2xl font-extrabold text-[#0F2044] block">
                  {fmt(bill.finalTotal)}
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200/80 inline-block mt-0.5">
                  {selectedMethod === "cash" ? "💵 Cash at Counter" : selectedMethod === "upi" ? "⚡ UPI Test" : "💳 Card Test"}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── C. PAYMENT METHOD SELECTION (Apple-Style Minimal 2x2 Grid) ── */}
        <section aria-label="Available payment methods" className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-poppins text-xs font-bold uppercase tracking-wider text-[#0F2044]">
              Select Payment Method
            </h3>
            <span className="text-[11px] text-[#7A8493]">
              Choose one
            </span>
          </div>

          {/* 2×2 Grid of Equal Square Tiles */}
          <div
            role="radiogroup"
            aria-label="Payment method selection"
            className="grid grid-cols-2 gap-3 sm:gap-4 max-w-sm sm:max-w-md mx-auto"
          >
            {PAYMENT_OPTIONS.map((method) => {
              const isSelected = selectedMethod === method.id;
              const isItemDisabled = isSubmittingRef.current || isCheckingOut || !!method.disabled;

              return (
                <button
                  key={method.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-disabled={isItemDisabled}
                  disabled={isItemDisabled}
                  onClick={() => {
                    if (!isItemDisabled) {
                      handleSelectPaymentMethod(method.id);
                    }
                  }}
                  className={`aspect-square w-full min-h-[110px] max-h-[125px] flex flex-col items-center justify-center rounded-2xl transition-all duration-200 outline-none select-none ${
                    isItemDisabled
                      ? "bg-slate-50 border border-slate-200/60 text-slate-300 opacity-60 cursor-not-allowed"
                      : isSelected
                      ? "bg-[#EEF4FF] border-2 border-[#1E40AF] text-[#1E40AF] shadow-xs scale-[1.02] cursor-pointer"
                      : "bg-white border border-slate-200/90 text-slate-700 hover:border-slate-300 hover:bg-slate-50/60 active:scale-95 shadow-2xs cursor-pointer"
                  }`}
                >
                  <PaymentTileIcon
                    type={method.iconType}
                    className={`h-9 w-9 transition-transform duration-200 ${
                      isSelected ? "scale-110 text-[#1E40AF]" : isItemDisabled ? "text-slate-300" : "text-slate-700"
                    }`}
                  />
                  <span className={`mt-2 font-poppins text-xs transition-colors ${
                    isSelected ? "font-bold text-[#1E40AF]" : isItemDisabled ? "font-medium text-slate-400" : "font-semibold text-slate-800"
                  }`}>
                    {method.name}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Contextual Information Displayed Below the Grid */}
          <div className="pt-1">
            {selectedMethod === "cash" && (
              <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3.5 text-xs text-blue-950 flex items-start gap-2.5 qless-fade-in shadow-2xs">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-800 text-xs font-bold mt-0.5">
                  📍
                </span>
                <div className="min-w-0 flex-1">
                  <h4 className="font-poppins text-xs font-bold text-blue-950">
                    Pay at Cashier Counter #03
                  </h4>
                  <p className="text-[11px] text-blue-800/80 mt-0.5 leading-relaxed">
                    Settle with physical cash at Counter #03. Your digital exit pass will unlock upon cashier verification.
                  </p>
                </div>
              </div>
            )}

            {selectedMethod === "upi" && (
              <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3.5 text-xs text-blue-950 space-y-1.5 qless-fade-in shadow-2xs">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-800 text-xs font-bold">
                    ⚡
                  </span>
                  <h4 className="font-poppins text-xs font-bold text-blue-950">
                    Test Mode — Not a real payment
                  </h4>
                </div>
                <p className="text-[11px] text-blue-800/80 leading-relaxed">
                  In the Razorpay test popup, use test VPA:{" "}
                  <code className="bg-blue-100/90 font-mono font-bold text-blue-900 px-1 py-0.5 rounded">
                    success@razorpay
                  </code>
                </p>
              </div>
            )}

            {selectedMethod === "card" && (
              <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3.5 text-xs text-blue-950 space-y-1.5 qless-fade-in shadow-2xs">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-800 text-xs font-bold">
                    💳
                  </span>
                  <h4 className="font-poppins text-xs font-bold text-blue-950">
                    Test Mode — Not a real payment
                  </h4>
                </div>
                <p className="text-[11px] text-blue-800/80 leading-relaxed">
                  Use Razorpay test cards in the popup to simulate Visa/Mastercard approval without real funds.
                </p>
              </div>
            )}

            {selectedMethod === "wallet" && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700 flex items-center gap-2.5 qless-fade-in shadow-2xs">
                <span className="text-base">👛</span>
                <p className="font-medium text-slate-700">Currently unavailable</p>
              </div>
            )}
          </div>
        </section>

        {/* ── ERROR ALERT BANNER (Non-stock errors only; insufficient stock displays professional modal) ── */}
        {errorMessage && !parseStockError(errorMessage) && (
          <div
            role="alert"
            aria-live="polite"
            className={`rounded-2xl p-3.5 text-xs qless-scale-in space-y-2 ${
              isNetworkTimeout
                ? "border border-amber-300 bg-amber-50 text-amber-900"
                : "border border-red-200 bg-red-50 text-red-800"
            }`}
          >
            <div className="flex items-start gap-2">
              <span className={`mt-0.5 shrink-0 ${isNetworkTimeout ? "text-amber-600" : "text-red-600"}`}>
                {isNetworkTimeout ? "⏳" : <IcAlert />}
              </span>
              <div className="flex-1">
                <p className="font-bold font-poppins">
                  {isNetworkTimeout ? "Network Timeout" : "Checkout Note"}
                </p>
                <p className="mt-0.5 leading-relaxed">{errorMessage}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── D. PRIMARY ACTION BUTTON (Fixed Bottom Bar, Highly Visible on Mobile) ── */}
      <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-3 sm:pb-4">
        <div className="mx-auto w-full max-w-[520px] rounded-2xl border border-slate-200/80 bg-white/95 p-3.5 sm:p-4 shadow-[0_-10px_30px_rgba(15,32,68,0.1)] backdrop-blur-xl space-y-2.5">
          <div className="flex items-center justify-between text-xs border-b border-black/5 pb-2">
            <span className="text-[#7A8493] text-[11px]">Selected Method:</span>
            <span className="font-bold text-[#0F2044] flex items-center gap-1.5 text-xs">
              <span>{selectedMethod === "cash" ? "💵" : selectedMethod === "upi" ? "⚡" : selectedMethod === "card" ? "💳" : "👛"}</span>
              <span>
                {selectedMethod === "cash"
                  ? "Cash at Counter #03"
                  : selectedMethod === "upi"
                  ? "UPI"
                  : selectedMethod === "card"
                  ? "Credit/Debit Card"
                  : "QLess Wallet"}
              </span>
            </span>
          </div>

          <button
            type="button"
            onClick={handleInitiatePayment}
            disabled={isProcessing || isWalletInsufficient || selectedMethod === "wallet"}
            className="flex h-12 sm:h-13 w-full items-center justify-center gap-2 rounded-xl bg-[#16A36A] font-poppins text-xs sm:text-sm font-bold text-white shadow-sm transition hover:bg-[#15803d] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16A36A]"
          >
            {isProcessing ? (
              <>
                <svg className="h-4.5 w-4.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                </svg>
                <span>{processMessage || "Processing payment…"}</span>
              </>
            ) : selectedMethod === "cash" ? (
              <>
                <IcCheck />
                <span>Place Cash Order — {fmt(bill.finalTotal)}</span>
              </>
            ) : selectedMethod === "upi" ? (
              <>
                <IcCheck />
                <span>Continue with UPI — {fmt(bill.finalTotal)}</span>
              </>
            ) : selectedMethod === "card" ? (
              <>
                <IcCheck />
                <span>Continue with Card — {fmt(bill.finalTotal)}</span>
              </>
            ) : selectedMethod === "wallet" ? (
              <span>Wallet Currently Unavailable</span>
            ) : pendingDigitalOrder ? (
              <>
                <IcCheck />
                <span>Retry Payment — {fmt(bill.finalTotal)}</span>
              </>
            ) : (
              <>
                <IcCheck />
                <span>Pay {fmt(bill.finalTotal)}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── INSUFFICIENT STOCK POPUP MODAL ── */}
      <StockErrorModal
        open={Boolean(stockModalItems && stockModalItems.length > 0)}
        items={stockModalItems || []}
        onReviewCart={() => {
          setStockModalItems(null);
          if (onEditOrder) {
            onEditOrder();
          } else {
            onBack();
          }
        }}
        onClose={() => {
          setStockModalItems(null);
        }}
      />
    </div>
  );
}
