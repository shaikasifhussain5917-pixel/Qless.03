import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { CompletedOrder, Coupon, PaymentMethod, PaymentProcessState, SupermarketStore, CartItem } from "../../types";
import { calculateBill, validateCartForCheckout } from "../../utils/billing";
import { fmt } from "../../utils/formatters";
import { OrderReviewSection } from "./OrderReviewSection";
import { CouponSection } from "./CouponSection";
import { PaymentMethodSection } from "./PaymentMethodSection";
import { CardFormData } from "./CardPaymentForm";
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

interface CheckoutViewProps {
  items: CartItem[];
  selectedStore: SupermarketStore | null;
  sessionId: string;
  receiptId: string;
  walletBalance: number;
  deductWalletBalance: (amount: number) => boolean;
  addWalletDemoBalance: (amount: number) => void;
  appliedCoupon: Coupon | null;
  onApplyCoupon: (coupon: Coupon) => void;
  onRemoveCoupon: () => void;
  onBackToCart: () => void;
  onPaymentSuccess: (order: CompletedOrder) => void;
}

/**
 * CheckoutView — Authoritative Self-Checkout Payment Screen
 *
 * Implements:
 * 1. Live database self-checkout via ShoppingContext.executeCheckout() and public.process_self_checkout_order.
 * 2. Razorpay Test Mode integration for UPI and Card payments with server-side HMAC verification.
 * 3. Enforces customer authentication and active store entrance session prerequisites.
 * 4. Client-side duplicate payment submission protection using submission lock ref.
 * 5. Idempotency preservation on network timeouts with safe retry using identical key.
 * 6. Order retention and stock cancellation controls if gateway initialization fails.
 * 7. Single source of truth for payment method selection with synchronous ref and stale state teardown.
 * 8. Preserves demo simulation mode strictly when Supabase is unconfigured.
 */
export function CheckoutView({
  items,
  selectedStore,
  sessionId,
  walletBalance,
  deductWalletBalance: _deductWalletBalance,
  addWalletDemoBalance,
  appliedCoupon,
  onApplyCoupon,
  onRemoveCoupon,
  onBackToCart,
  onPaymentSuccess,
}: CheckoutViewProps) {
  const {
    executeCheckout,
    isCheckingOut,
    activeIdempotencyKey,
    clearActiveIdempotencyKey,
    restoreCartItems,
  } = useShopping();
  const { user, isAuthenticated, hasValidEntrance, entranceSession } = useAuth();

  // ── 1. SINGLE SOURCE OF TRUTH PAYMENT METHOD STATE ──
  // React state drives the UI re-renders, while synchronous ref eliminates closure race conditions
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("cash");
  const selectedMethodRef = useRef<PaymentMethod>("cash");

  useEffect(() => {
    selectedMethodRef.current = selectedMethod;
  }, [selectedMethod]);

  const [processState, setProcessState] = useState<PaymentProcessState>("ready");
  const [processMessage, setProcessMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isNetworkTimeout, setIsNetworkTimeout] = useState<boolean>(false);

  // Retain pending digital order if created in database before gateway completion
  const [pendingDigitalOrder, setPendingDigitalOrder] = useState<CompletedOrder | null>(null);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);

  // Submission ref lock to prevent rapid repeated clicks from bypassing React re-renders
  const isSubmittingRef = useRef<boolean>(false);

  // Generation counter to immediately cancel/ignore pending asynchronous callbacks from abandoned payment attempts
  const activePaymentAttemptIdRef = useRef<number>(0);

  // Active Razorpay modal instance reference for clean programmatic dismissal on method switch
  const activeRazorpayInstanceRef = useRef<{ close?: () => void } | null>(null);

  // Explicit test control toggle to demonstrate both success and failure deterministically (demo mode only)
  const [simulateOutcome, setSimulateOutcome] = useState<"success" | "failure">("success");

  // Card form state & validation
  const [cardFormData, setCardFormData] = useState<CardFormData>({
    cardholderName: "",
    cardNumber: "",
    expiryDate: "",
    cvv: "",
  });
  const [cardErrors] = useState<Partial<Record<keyof CardFormData, string>>>({});

  // Confirmation modal when returning to cart would discard an applied coupon
  const [showDiscardCouponModal, setShowDiscardCouponModal] = useState(false);

  // ── EFFECTIVE CART ITEMS ──
  // Guarantees that items are never dropped to 0 if cart was emptied while staging an in-flight digital order
  const effectiveItems = useMemo<CartItem[]>(() => {
    if (items && items.length > 0) return items;
    if (pendingDigitalOrder?.items && pendingDigitalOrder.items.length > 0) {
      return pendingDigitalOrder.items;
    }
    return [];
  }, [items, pendingDigitalOrder]);

  // Compute live bill summary with GST and discounts from trusted billing utility,
  // or authoritative snapshot if an active digital order is being retried
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
   * Guarantees that selecting Cash immediately switches source of truth to Cash, closes any
   * pending Razorpay modal, discards unsubmitted digital state, and clears old payment errors.
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

      // 1. Immediately invalidate any pending async callbacks (Razorpay handler, ondismiss, setTimeout)
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

  const handleCancelPendingOrder = async () => {
    if (!pendingDigitalOrder) return;
    setIsCancelling(true);
    setProcessState("processing");
    setProcessMessage("Cancelling order and restoring inventory in store database…");

    try {
      const res = await cancelPendingOrderAndRestoreStock(
        pendingDigitalOrder.orderId,
        "Customer cancelled after payment failure or dismissal"
      );

      if (!res.success) {
        setProcessState("failure");
        setErrorMessage(res.error || "Failed to cancel order and restore stock.");
        return;
      }

      const orderToRestore = pendingDigitalOrder;
      setPendingDigitalOrder(null);
      setErrorMessage(null);
      setProcessState("ready");
      setProcessMessage("");

      if ((!items || items.length === 0) && orderToRestore.items && orderToRestore.items.length > 0) {
        restoreCartItems(orderToRestore.items);
      }

      onBackToCart();
    } catch (err: unknown) {
      setProcessState("failure");
      setErrorMessage(err instanceof Error ? err.message : "Error cancelling order.");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleInitiatePayment = async () => {
    // 1. Duplicate submission guard (both ref lock and component state check)
    if (
      isSubmittingRef.current ||
      isCheckingOut ||
      isCancelling ||
      processState === "validating" ||
      processState === "processing" ||
      processState === "success"
    ) {
      return;
    }

    // Always use the latest synchronous selected method from ref!
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

    // 3. Restriction: QLess wallet is disabled during Razorpay Test Mode
    if (methodToSubmit === "wallet") {
      setErrorMessage(
        "QLess Wallet is not supported during Razorpay Test Mode. Please choose UPI, Card, or Cash."
      );
      return;
    }

    // 4. Live Supabase Authoritative Checkout
    if (isSupabaseConfigured) {
      if (!isAuthenticated || !user?.id) {
        setErrorMessage(
          "Authentication required: You must be logged in as an authenticated shopper before checkout."
        );
        return;
      }

      if (!hasValidEntrance || !entranceSession) {
        setErrorMessage(
          "Active store entrance session required. Please scan the supermarket entrance gate QR code before checking out."
        );
        return;
      }

      // CASH FLOW: Unaltered original cash-at-counter settlement
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
                  "A network timeout occurred while contacting the database. The order status is currently unknown. You can safely retry without creating duplicate orders."
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
          setProcessMessage("Cash order placed! Please visit cashier counter to settle payment.");

          if (result.order) {
            setTimeout(() => {
              if (activePaymentAttemptIdRef.current === attemptId) {
                onPaymentSuccess(result.order!);
              }
            }, 400);
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
        // Step A: Load SDK on demand
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

        // Step B: Ensure QLess order exists in PostgreSQL (or reuse existing pending order)
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

        // Step C: Request server-side Razorpay order creation via Edge Function
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
              "Order is reserved in the store database, but Razorpay order creation failed. You can retry payment or cancel the order to restore inventory."
          );
          return;
        }

        // Step D: Open Razorpay Checkout modal
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
              return; // Stale callback from superseded or cancelled attempt
            }

            // Step E: Server-side cryptographic HMAC verification
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
                setErrorMessage(
                  verifyRes.error || "Payment verification failed with server. Order not confirmed."
                );
                return;
              }

              // Step F: Mark confirmed and transition to exit pass
              const confirmedOrder: CompletedOrder = {
                ...activeOrder,
                paymentStatus: "CONFIRMED",
                paymentReference: response.razorpay_payment_id,
                paidAt: verifyRes.confirmedAt || new Date().toISOString(),
              };

              setPendingDigitalOrder(null);
              setProcessState("success");
              setProcessMessage("Payment verified & confirmed! Generating exit pass…");

              setTimeout(() => {
                if (activePaymentAttemptIdRef.current === attemptId) {
                  onPaymentSuccess(confirmedOrder);
                }
              }, 400);
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
                return; // Stale or already changed to Cash
              }
              isSubmittingRef.current = false;
              activeRazorpayInstanceRef.current = null;
              setProcessState("ready");
              setProcessMessage("");
              setErrorMessage(
                "Razorpay checkout modal closed. Your order remains pending with reserved stock. Click 'Retry Payment' to complete or 'Cancel Order' to release stock."
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
    setProcessMessage("Validating checkout details & catalog pricing…");

    setTimeout(async () => {
      if (activePaymentAttemptIdRef.current !== attemptId || selectedMethodRef.current !== methodToSubmit) {
        return;
      }
      setProcessState("processing");
      setProcessMessage("Contacting payment gateway simulation…");

      setTimeout(async () => {
        if (activePaymentAttemptIdRef.current !== attemptId || selectedMethodRef.current !== methodToSubmit) {
          return;
        }

        if (simulateOutcome === "failure") {
          isSubmittingRef.current = false;
          setProcessState("failure");
          setIsNetworkTimeout(false);
          setErrorMessage(
            "Payment clearance declined: Test failure simulation mode was active. Your mock account was not debited."
          );
        } else {
          setProcessState("success");
          setProcessMessage(
            methodToSubmit === "cash"
              ? "Cash order placed (Demo Mode)! Visit cashier counter to settle payment."
              : "Digital payment simulated successfully (Demo Mode)!"
          );

          const result = await executeCheckout(methodToSubmit);
          isSubmittingRef.current = false;

          if (result.order) {
            setTimeout(() => {
              if (activePaymentAttemptIdRef.current === attemptId) {
                onPaymentSuccess(result.order!);
              }
            }, 400);
          }
        }
      }, 900);
    }, 500);
  };

  const handleBackToCartClick = () => {
    if (appliedCoupon) {
      setShowDiscardCouponModal(true);
    } else {
      onBackToCart();
    }
  };

  const handleConfirmDiscardCouponAndBack = () => {
    setShowDiscardCouponModal(false);
    onRemoveCoupon();
    onBackToCart();
  };

  const isProcessing =
    processState === "validating" ||
    processState === "processing" ||
    processState === "success";

  const isWalletInsufficient = selectedMethod === "wallet" && walletBalance < bill.finalTotal;

  // Empty cart edge case resilience (only when not in an active order flow)
  if (effectiveItems.length === 0 && !isProcessing) {
    return (
      <div className="flex flex-1 flex-col qless-fade-in pb-32 max-w-[560px] mx-auto w-full">
        <EmptyState
          emoji="🛒"
          title="Your Cart is Empty"
          description="There are no items in your active shopping session. Please return to the cart and scan items to proceed to checkout."
          action={{
            label: "Return to Cart",
            onClick: onBackToCart,
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col qless-fade-in pb-32 max-w-[560px] mx-auto w-full">
      {/* Top Header */}
      <div className="mb-4">
        <button
          type="button"
          onClick={handleBackToCartClick}
          disabled={isProcessing}
          className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#7A8493] transition hover:text-[#0F2044] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E9E44]"
        >
          <IcBack />
          <span>Back to Cart</span>
        </button>

        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-poppins text-2xl font-bold tracking-tight text-[#0F2044]">
              Review &amp; Pay
            </h2>
            <p className="mt-0.5 text-xs text-[#7A8493]">
              Self-checkout order verification for {selectedStore?.name || "Store"}
            </p>
          </div>

          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider ${
            isSupabaseConfigured
              ? "bg-[#0F2044] text-white border border-blue-400"
              : "bg-slate-700 text-white"
          }`}>
            {isSupabaseConfigured ? "LIVE STORE CHECKOUT" : "DEMO CHECKOUT"}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {/* 1. Order Review Section */}
        <OrderReviewSection
          bill={bill}
          selectedStore={selectedStore}
          sessionId={sessionId}
          onEditCart={handleBackToCartClick}
          selectedMethod={selectedMethod}
        />

        {/* 2. Mock Coupon System */}
        <CouponSection
          subtotal={bill.subtotal}
          appliedCoupon={bill.appliedCoupon}
          onApplyCoupon={onApplyCoupon}
          onRemoveCoupon={onRemoveCoupon}
        />

        {/* Active Pending Digital Order Banner (Only when digital method is active) */}
        {pendingDigitalOrder && selectedMethod !== "cash" && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50/95 p-4 text-xs text-amber-950 qless-fade-in shadow-xs space-y-3">
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0" aria-hidden="true">⏳</span>
              <div className="space-y-1">
                <h4 className="font-poppins text-sm font-bold text-amber-900">
                  Order Reserved in Database (Payment Incomplete)
                </h4>
                <p className="text-xs leading-relaxed text-amber-800">
                  Order ID: <strong className="font-mono text-amber-950">{pendingDigitalOrder.orderId}</strong>. Inventory is reserved for your session. Complete Razorpay payment or cancel the order to return items to store inventory.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1 border-t border-amber-200">
              <button
                type="button"
                disabled={isProcessing || isCancelling}
                onClick={handleCancelPendingOrder}
                className="rounded-xl border border-red-300 bg-white px-3.5 py-2 text-xs font-bold text-red-700 hover:bg-red-50 active:scale-95 transition disabled:opacity-50"
              >
                {isCancelling ? "Cancelling & Restoring Stock…" : "Cancel Order & Restore Stock"}
              </button>
            </div>
          </div>
        )}

        {/* Razorpay Test Mode & Cash Informational Banner */}
        {(!pendingDigitalOrder || selectedMethod === "cash") && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50/90 p-3.5 text-xs text-blue-950 flex items-start gap-3 shadow-xs">
            <span className="text-xl shrink-0" aria-hidden="true">💳</span>
            <div className="space-y-0.5">
              <h4 className="font-poppins text-xs font-bold text-blue-900">
                Payment Options Available
              </h4>
              <p className="text-[11px] leading-relaxed text-blue-800">
                Choose <strong>UPI</strong> or <strong>Card</strong> for Razorpay Test Mode, or select <strong>Cash</strong> to settle in physical cash at Cashier Counter #03.
              </p>
            </div>
          </div>
        )}

        {/* 3. Payment Method Selection */}
        <PaymentMethodSection
          selectedMethod={selectedMethod}
          onSelectMethod={handleSelectPaymentMethod}
          finalTotal={bill.finalTotal}
          sessionId={sessionId}
          walletBalance={walletBalance}
          onAddDemoWalletBalance={addWalletDemoBalance}
          cardFormData={cardFormData}
          onCardFormChange={setCardFormData}
          cardErrors={cardErrors}
          disabled={isSubmittingRef.current || isCheckingOut}
        />

        {/* 4. Deterministic Simulation Outcome Switch (Demo Mode) OR Live Database Audit Badge */}
        {!isSupabaseConfigured ? (
          <div className="rounded-xl border border-black/10 bg-[#F9FAFB] p-3 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div>
              <span className="font-bold text-[#0F2044]">
                Simulate Payment Outcome:
              </span>
              <p className="text-[10px] text-[#7A8493]">
                Deterministic test toggle for success vs failure states
              </p>
            </div>

            <div className="flex rounded-lg border border-black/10 bg-white p-0.5 shadow-2xs">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => setSimulateOutcome("success")}
                className={`px-3 py-1 text-xs font-bold rounded-md transition ${
                  simulateOutcome === "success"
                    ? "bg-[#2E9E44] text-white shadow-xs"
                    : "text-[#7A8493] hover:text-[#0F2044]"
                }`}
              >
                ✓ Success
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => setSimulateOutcome("failure")}
                className={`px-3 py-1 text-xs font-bold rounded-md transition ${
                  simulateOutcome === "failure"
                    ? "bg-red-600 text-white shadow-xs"
                    : "text-[#7A8493] hover:text-[#0F2044]"
                }`}
              >
                ✗ Failure (Test)
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900 flex items-start gap-2.5">
            <span className="text-base shrink-0">🔒</span>
            <div>
              <p className="font-bold">Authoritative Supabase PostgreSQL Checkout</p>
              <p className="text-[11px] text-blue-800 mt-0.5 leading-relaxed">
                Order creation dispatches to <code className="font-mono font-bold">public.process_self_checkout_order</code> with atomic inventory locks, server-side GST, and idempotency key enforcement.
              </p>
            </div>
          </div>
        )}

        {/* 5. Error & Failure Alert Card */}
        {errorMessage && (
          <div
            role="alert"
            aria-live="polite"
            className={`rounded-2xl p-4 text-xs qless-scale-in space-y-2.5 ${
              isNetworkTimeout
                ? "border border-amber-300 bg-amber-50 text-amber-900"
                : "border border-red-200 bg-red-50 text-red-800"
            }`}
          >
            <div className="flex items-start gap-2.5">
              <span className={`mt-0.5 shrink-0 ${isNetworkTimeout ? "text-amber-600 text-base" : "text-red-600"}`}>
                {isNetworkTimeout ? "⏳" : <IcAlert />}
              </span>
              <div className="flex-1">
                <p className="font-bold font-poppins">
                  {isNetworkTimeout ? "Network Timeout — Order Status Unknown" : "Checkout Declined"}
                </p>
                <p className={`mt-0.5 leading-relaxed ${isNetworkTimeout ? "text-amber-800" : "text-red-700"}`}>
                  {errorMessage}
                </p>
                {isNetworkTimeout && activeIdempotencyKey && (
                  <p className="mt-1 text-[11px] text-amber-700 font-mono">
                    Idempotency Key: {activeIdempotencyKey.slice(0, 8)}... (retained for safe retry)
                  </p>
                )}
              </div>
            </div>

            {processState === "failure" && (
              <div className="pt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setProcessState("ready");
                    setErrorMessage(null);
                    setIsNetworkTimeout(false);
                    handleInitiatePayment();
                  }}
                  className={`rounded-xl px-4 py-2 font-poppins text-xs font-semibold text-white shadow-xs transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 ${
                    isNetworkTimeout
                      ? "bg-amber-800 hover:bg-amber-900 focus-visible:ring-amber-500"
                      : "bg-red-800 hover:bg-red-900 focus-visible:ring-red-500"
                  }`}
                >
                  {isNetworkTimeout ? "Safe Retry (Same Key)" : "Retry Checkout"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProcessState("ready");
                    setErrorMessage(null);
                    setIsNetworkTimeout(false);
                  }}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold bg-white transition ${
                    isNetworkTimeout
                      ? "border-amber-300 text-amber-900 hover:bg-amber-100/50"
                      : "border-red-300 text-red-800 hover:bg-red-50"
                  }`}
                >
                  Edit Payment Method
                </button>
                <button
                  type="button"
                  onClick={handleBackToCartClick}
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-[#0F2044] hover:bg-slate-50 transition"
                >
                  Back to Cart
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 6. Sticky Bottom Pay Bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 px-4 pb-4">
        <div className="mx-auto w-full max-w-[560px] rounded-2xl border border-white/60 bg-white/95 p-4 shadow-[0_-12px_34px_rgba(15,32,68,0.16)] backdrop-blur-xl">
          {/* Active Payment Method Line in Sticky Summary */}
          <div className="mb-2.5 flex items-center justify-between text-xs border-b border-black/5 pb-2">
            <span className="text-[11px] font-semibold text-[#7A8493]">
              Payment Method:
            </span>
            <span className="font-poppins text-xs font-bold text-[#0F2044] flex items-center gap-1.5">
              <span>{selectedMethod === "cash" ? "💵" : selectedMethod === "upi" ? "⚡" : selectedMethod === "card" ? "💳" : "👛"}</span>
              <span>
                {selectedMethod === "cash"
                  ? "Cash — Pay at Counter #03"
                  : selectedMethod === "upi"
                  ? "UPI (Razorpay Test Mode)"
                  : selectedMethod === "card"
                  ? "Card (Razorpay Test Mode)"
                  : "QLess Wallet"}
              </span>
            </span>
          </div>

          <div className="mb-3 flex items-baseline justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3]">
                Total Payable
              </span>
              <p className="font-poppins text-2xl font-extrabold text-[#0F2044]">
                {fmt(bill.finalTotal)}
              </p>
            </div>
            <span className="text-xs text-[#7A8493]">
              {bill.itemCount} {bill.itemCount === 1 ? "item" : "items"}
            </span>
          </div>

          <button
            type="button"
            onClick={handleInitiatePayment}
            disabled={isProcessing || isWalletInsufficient || selectedMethod === "wallet"}
            className="flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-[#2E9E44] font-poppins text-sm font-bold text-white shadow-[0_8px_20px_rgba(46,158,68,0.25)] transition hover:scale-[1.01] hover:bg-[#288B3B] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E9E44]"
          >
            {isProcessing ? (
              <>
                <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                </svg>
                <span>{processMessage || "Processing payment…"}</span>
              </>
            ) : selectedMethod === "cash" ? (
              <>
                <IcCheck />
                <span>Place Cash Order — Pay at Counter</span>
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

      {/* Discard Coupon Confirmation Modal */}
      {showDiscardCouponModal && (
        <div
          role="dialog"
          aria-labelledby="discard-coupon-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2044]/50 px-4 backdrop-blur-sm qless-fade-in"
        >
          <div className="w-full max-w-[400px] rounded-2xl bg-white p-5 shadow-2xl qless-scale-in space-y-3">
            <h4
              id="discard-coupon-title"
              className="font-poppins text-base font-bold text-[#0F2044]"
            >
              Return to Cart?
            </h4>
            <p className="text-xs text-[#7A8493] leading-relaxed">
              You have applied coupon <strong className="text-[#2E9E44]">{appliedCoupon?.code}</strong>. Returning to the cart will discard this coupon so you can edit items and re-apply it when ready.
            </p>
            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDiscardCouponModal(false)}
                className="rounded-xl border border-black/10 px-3.5 py-2 text-xs font-semibold text-[#0F2044] hover:bg-[#F8F9FA]"
              >
                Stay in Checkout
              </button>
              <button
                type="button"
                onClick={handleConfirmDiscardCouponAndBack}
                className="rounded-xl bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-700 shadow-xs"
              >
                Discard &amp; Return to Cart
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
