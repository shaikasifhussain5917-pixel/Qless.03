import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { CompletedOrder, Coupon, PaymentMethod, PaymentProcessState, SupermarketStore, CartItem } from "../../types";
import { calculateBill, validateCartForCheckout } from "../../utils/billing";
import { fmt } from "../../utils/formatters";
import { IcAlert, IcBack, IcCheck } from "../common/Icons";
import { EmptyState } from "../common/EmptyState";
import { useShopping } from "../../context/ShoppingContext";
import { useAuth } from "../../context/AuthContext";
import { isSupabaseConfigured } from "../../lib/supabase";
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
  badge: string;
  badgeColorClass: string;
  icon: string;
  caption: string;
  disabled?: boolean;
}

const PAYMENT_OPTIONS: PaymentOptionConfig[] = [
  {
    id: "cash",
    name: "Cash — Pay at Cashier Counter",
    badge: "Active Pilot Method",
    badgeColorClass: "bg-emerald-100 border-emerald-300 text-emerald-800",
    icon: "💵",
    caption: "Pay with physical cash at Counter #03 before exit verification.",
    disabled: false,
  },
  {
    id: "upi",
    name: "UPI (Test Mode)",
    badge: "TEST MODE — Not a real payment",
    badgeColorClass: "bg-amber-100 border-amber-300 text-amber-900",
    icon: "⚡",
    caption: "Test digital payment via Razorpay mock UPI gateway.",
    disabled: false,
  },
  {
    id: "card",
    name: "Debit / Credit Card (Test Mode)",
    badge: "TEST MODE — Not a real payment",
    badgeColorClass: "bg-blue-100 border-blue-300 text-blue-900",
    icon: "💳",
    caption: "Test digital payment via Razorpay mock Card gateway.",
    disabled: false,
  },
  {
    id: "wallet",
    name: "QLess Wallet",
    badge: "Unavailable",
    badgeColorClass: "bg-slate-100 border-slate-300 text-slate-600",
    icon: "👛",
    caption: "QLess Wallet is not available during test mode.",
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
        setErrorMessage(cartValidation.errors.join(" "));
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

            if (result.isNetworkError) {
              setIsNetworkTimeout(true);
              setErrorMessage(
                result.error ||
                  "A network timeout occurred while contacting the database. You can safely retry without duplicate orders."
              );
            } else {
              setIsNetworkTimeout(false);
              setErrorMessage(result.error || "Checkout was declined by the store database.");
            }
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
          setErrorMessage(err instanceof Error ? err.message : "Error placing cash order.");
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
            setErrorMessage(checkoutResult.error || "Checkout was declined by the store database.");
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
        setErrorMessage(err instanceof Error ? err.message : "Error during digital checkout.");
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
        {/* ── B. ORDER SUMMARY CARD (Compact, Mobile-Friendly) ── */}
        <section
          aria-label="Order summary breakdown"
          className="rounded-2xl border border-white/80 bg-white/95 p-3.5 sm:p-4 shadow-[0_4px_16px_rgba(15,32,68,0.06)] backdrop-blur-md space-y-2.5"
        >
          <div className="flex items-center justify-between border-b border-black/5 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-base" aria-hidden="true">🧾</span>
              <h3 className="font-poppins text-xs font-bold uppercase tracking-wider text-[#0F2044]">
                Order Summary
              </h3>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                {bill.itemCount} {bill.itemCount === 1 ? "item" : "items"}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                if (onEditOrder) onEditOrder();
                else onBack();
              }}
              className="text-[11px] font-semibold text-[#2E9E44] hover:underline"
            >
              Edit Items
            </button>
          </div>

          {/* Compact Product List Preview */}
          <div className="text-xs space-y-1 pt-0.5">
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

          {/* Financial Breakdown */}
          <div className="border-t border-black/5 pt-2 space-y-1 text-xs text-[#7A8493]">
            <div className="flex justify-between">
              <span>Subtotal ({bill.itemCount} items)</span>
              <span className="font-mono text-[#0F2044]">{fmt(bill.subtotal)}</span>
            </div>

            {bill.mrpSavings > 0 && (
              <div className="flex justify-between text-[#2E9E44]">
                <span>Total MRP Savings</span>
                <span className="font-mono font-medium">-{fmt(bill.mrpSavings)}</span>
              </div>
            )}

            {bill.couponDiscount > 0 && (
              <div className="flex justify-between text-[#2E9E44]">
                <span>Coupon Discount ({appliedCoupon?.code || "APPLIED"})</span>
                <span className="font-mono font-medium">-{fmt(bill.couponDiscount)}</span>
              </div>
            )}

            <div className="flex justify-between text-[11px] text-[#8A94A3]">
              <span>Taxes (CGST 2.5% + SGST 2.5%)</span>
              <span className="font-mono">{fmt(bill.taxTotal)}</span>
            </div>

            {/* Total Amount Payable */}
            <div className="flex items-baseline justify-between border-t border-black/5 pt-2 text-[#0F2044]">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] block leading-none">
                  Total Payable
                </span>
                <span className="font-poppins text-lg sm:text-xl font-extrabold text-[#0F2044]">
                  {fmt(bill.finalTotal)}
                </span>
              </div>

              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                {selectedMethod === "cash" ? "💵 Cash at Counter" : selectedMethod === "upi" ? "⚡ UPI Test" : "💳 Card Test"}
              </span>
            </div>
          </div>
        </section>

        {/* ── C. PAYMENT METHOD SELECTION (Compact Cards) ── */}
        <section aria-label="Available payment methods" className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-poppins text-xs font-bold uppercase tracking-wider text-[#0F2044]">
              Select Payment Method
            </h3>
            <span className="text-[10px] text-[#7A8493]">
              Tap an option below
            </span>
          </div>

          <div
            role="radiogroup"
            aria-label="Payment method selection"
            className="space-y-2"
          >
            {PAYMENT_OPTIONS.map((method) => {
              const isSelected = selectedMethod === method.id;
              const isItemDisabled = isSubmittingRef.current || isCheckingOut || !!method.disabled;

              return (
                <div
                  key={method.id}
                  role="radio"
                  aria-checked={isSelected}
                  aria-disabled={isItemDisabled}
                  tabIndex={isItemDisabled ? -1 : 0}
                  onClick={() => {
                    if (!isItemDisabled) {
                      handleSelectPaymentMethod(method.id);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (isItemDisabled) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSelectPaymentMethod(method.id);
                    }
                  }}
                  className={`rounded-2xl border-2 p-3 transition-all outline-none ${
                    isItemDisabled
                      ? "cursor-not-allowed border-black/5 bg-slate-50/70 opacity-60"
                      : isSelected
                      ? "cursor-pointer border-[#2E9E44] bg-[#EEF8F0]/80 shadow-[0_4px_14px_rgba(46,158,68,0.14)] focus-visible:ring-2 focus-visible:ring-[#2E9E44]"
                      : "cursor-pointer border-black/5 bg-white/90 hover:border-black/15 hover:bg-white focus-visible:ring-2 focus-visible:ring-[#2E9E44]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0 pr-1">
                      {/* Radio Circle Indicator */}
                      <div
                        className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                          isSelected
                            ? "border-[#2E9E44] bg-[#2E9E44]"
                            : isItemDisabled
                            ? "border-slate-300 bg-slate-100"
                            : "border-[#D8DDE3] bg-white"
                        }`}
                      >
                        {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </div>

                      <span className="text-xl shrink-0" aria-hidden="true">
                        {method.icon}
                      </span>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-poppins text-xs sm:text-sm font-bold text-[#0F2044]">
                            {method.name}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.2 text-[9px] font-bold shrink-0 border ${method.badgeColorClass}`}
                          >
                            {method.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#7A8493] truncate mt-0.5">
                          {method.caption}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {method.disabled ? (
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                          Unavailable
                        </span>
                      ) : (
                        <span className="font-poppins text-xs font-bold text-[#0F2044]">
                          {fmt(bill.finalTotal)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Active Method Contextual Helper Notice */}
          <div className="pt-0.5">
            {selectedMethod === "cash" && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-xs text-amber-950 shadow-2xs space-y-1">
                <div className="flex items-start gap-2.5">
                  <span className="text-lg shrink-0" aria-hidden="true">💵</span>
                  <div>
                    <h4 className="font-poppins text-xs font-bold text-amber-900">
                      Cash at Cashier Counter #03
                    </h4>
                    <p className="text-[11px] leading-relaxed text-amber-800 mt-0.5">
                      Your order will be registered in the store database. Please proceed to <strong>Counter #03</strong> to pay in physical cash. Your exit pass will unlock upon cashier verification.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {selectedMethod === "upi" && (
              <div className="rounded-xl border border-emerald-300 bg-emerald-50/90 p-3 text-xs text-emerald-950 shadow-2xs space-y-1.5">
                <div className="flex items-start gap-2.5">
                  <span className="text-lg shrink-0" aria-hidden="true">⚡</span>
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="font-poppins text-xs font-bold text-emerald-900">
                        UPI Test Mode (Sandbox Simulation)
                      </h4>
                      <span className="rounded bg-emerald-200/80 px-1.5 py-0.2 text-[9px] font-bold text-emerald-900">
                        Demo
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-emerald-800">
                      In the Razorpay test popup, use test VPA:{" "}
                      <code className="bg-emerald-100 font-mono font-bold text-emerald-900 px-1 py-0.5 rounded">
                        success@razorpay
                      </code>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {selectedMethod === "card" && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/90 p-3 text-xs text-blue-950 shadow-2xs">
                <div className="flex items-start gap-2.5">
                  <span className="text-lg shrink-0" aria-hidden="true">💳</span>
                  <div>
                    <h4 className="font-poppins text-xs font-bold text-blue-900">
                      Card Payment Test Mode
                    </h4>
                    <p className="text-[11px] text-blue-800 mt-0.5">
                      Use Razorpay test cards in the popup to simulate Visa/Mastercard approval without real funds.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── ERROR ALERT BANNER ── */}
        {errorMessage && (
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
        <div className="mx-auto w-full max-w-[520px] rounded-2xl border border-white/80 bg-white/95 p-3.5 sm:p-4 shadow-[0_-10px_30px_rgba(15,32,68,0.14)] backdrop-blur-xl space-y-2.5">
          <div className="flex items-center justify-between text-xs border-b border-black/5 pb-2">
            <span className="text-[#7A8493] text-[11px]">Selected Method:</span>
            <span className="font-bold text-[#0F2044] flex items-center gap-1.5 text-xs">
              <span>{selectedMethod === "cash" ? "💵" : selectedMethod === "upi" ? "⚡" : selectedMethod === "card" ? "💳" : "👛"}</span>
              <span>
                {selectedMethod === "cash"
                  ? "Cash at Counter #03"
                  : selectedMethod === "upi"
                  ? "UPI (Test Mode)"
                  : selectedMethod === "card"
                  ? "Card (Test Mode)"
                  : "QLess Wallet"}
              </span>
            </span>
          </div>

          <button
            type="button"
            onClick={handleInitiatePayment}
            disabled={isProcessing || isWalletInsufficient || selectedMethod === "wallet"}
            className="flex h-12 sm:h-13 w-full items-center justify-center gap-2 rounded-xl bg-[#2E9E44] font-poppins text-xs sm:text-sm font-bold text-white shadow-[0_8px_20px_rgba(46,158,68,0.25)] transition hover:scale-[1.01] hover:bg-[#288B3B] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E9E44]"
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
            ) : selectedMethod === "wallet" ? (
              <span>Wallet Unavailable (Test Mode)</span>
            ) : pendingDigitalOrder && (selectedMethod === "upi" || selectedMethod === "card") ? (
              <>
                <IcCheck />
                <span>Retry Razorpay Payment — {fmt(bill.finalTotal)}</span>
              </>
            ) : (
              <>
                <IcCheck />
                <span>Pay {fmt(bill.finalTotal)} with {selectedMethod === "upi" ? "UPI" : "Card"} (Test Mode)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
