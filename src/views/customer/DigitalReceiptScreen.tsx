import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useShopping } from "../../context/ShoppingContext";
import { useAuth } from "../../context/AuthContext";
import { getOrderById, downloadReceiptFile } from "../../utils/orderStorage";
import { CustomerLayout } from "../../layouts/CustomerLayout";
import { fmt } from "../../utils/formatters";
import { IcBack, IcCheck, IcAlert } from "../../components/common/Icons";
import { EmptyState } from "../../components/common/EmptyState";
import { isSupabaseConfigured } from "../../lib/supabase";
import { fetchCustomerOrderLive } from "../../services/customerOrderService";
import { CompletedOrder } from "../../types";

export function DigitalReceiptScreen() {
  const navigate = useNavigate();
  const { orderId: paramOrderId } = useParams<{ orderId?: string }>();
  const { completedOrder, selectedHistoryOrder, resetSession } = useShopping();
  const { user } = useAuth();

  // Resolve target order ID
  const targetOrderId = useMemo(() => {
    if (paramOrderId) return paramOrderId.trim();
    if (completedOrder?.orderId) return completedOrder.orderId.trim();
    if (selectedHistoryOrder?.orderId) return selectedHistoryOrder.orderId.trim();
    return null;
  }, [paramOrderId, completedOrder, selectedHistoryOrder]);

  // Component state
  const [order, setOrder] = useState<CompletedOrder | null>(() => {
    if (targetOrderId) {
      const local = getOrderById(targetOrderId);
      if (local) return local;
    }
    if (completedOrder) return completedOrder;
    if (selectedHistoryOrder) return selectedHistoryOrder;
    return null;
  });

  const [isPending, setIsPending] = useState<boolean>(() => {
    const s = order?.paymentStatus || "PENDING";
    return s === "PENDING";
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState<boolean>(false);
  const [isNotFound, setIsNotFound] = useState<boolean>(false);

  const isFetchingRef = useRef<boolean>(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Authoritative Live Order Synchronizer
   */
  const syncOrder = useCallback(
    async (isManualRetry: boolean = false) => {
      if (!targetOrderId) return;
      if (isFetchingRef.current) return;

      isFetchingRef.current = true;
      if (isManualRetry) {
        setIsSyncing(true);
        setSyncError(null);
      }

      try {
        const result = await fetchCustomerOrderLive(targetOrderId, user?.id);

        if (result.forbidden) {
          setIsForbidden(true);
          setSyncError("Access Denied: You do not have permission to view this customer order.");
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
          return;
        }

        if (result.notFound) {
          setIsNotFound(true);
          setSyncError(`Order '${targetOrderId}' was not found in the store database.`);
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
          return;
        }

        if (!result.success) {
          setSyncError(result.error || "Could not refresh receipt status from store database.");
          return;
        }

        setSyncError(null);
        if (result.order) {
          setOrder(result.order);
        }

        setIsPending(result.isPending);

        // If order confirmed or reached terminal state, stop polling
        if (result.isConfirmed || result.isTerminal) {
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Error syncing receipt";
        setSyncError(msg);
      } finally {
        isFetchingRef.current = false;
        setIsSyncing(false);
      }
    },
    [targetOrderId, user?.id]
  );

  useEffect(() => {
    if (!targetOrderId) return;

    let isMounted = true;
    syncOrder(false);

    if (isSupabaseConfigured) {
      pollTimerRef.current = setInterval(() => {
        if (!isMounted) return;
        syncOrder(false);
      }, 5000);
    }

    return () => {
      isMounted = false;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [targetOrderId, syncOrder]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    if (order) {
      downloadReceiptFile(order);
    }
  };

  const handleStartNewTrip = () => {
    resetSession();
    navigate("/scan-store");
  };

  // Forbidden State
  if (isForbidden) {
    return (
      <CustomerLayout showHeader={true} showFooter={true} onBack={() => navigate("/history")}>
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center max-w-[440px] mx-auto w-full">
          <EmptyState
            emoji="⛔"
            title="Access Denied"
            description="You do not have permission to view this customer order receipt."
            action={{
              label: "Return to Order History",
              onClick: () => navigate("/history"),
            }}
          />
        </div>
      </CustomerLayout>
    );
  }

  // Not Found State
  if (isNotFound || (!order && !isSyncing)) {
    return (
      <CustomerLayout showHeader={true} showFooter={true} onBack={() => navigate("/shop")}>
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center max-w-[440px] mx-auto w-full">
          <EmptyState
            emoji="🧾"
            title="No Receipt Found"
            description="There is no purchase associated with this reference. Complete a self-checkout payment or check your shopping history."
            action={{
              label: "Go to Cart / Shop",
              onClick: () => navigate("/shop"),
            }}
            secondaryAction={{
              label: "View History",
              onClick: () => navigate("/history"),
            }}
          />
        </div>
      </CustomerLayout>
    );
  }

  const paymentLabel =
    order?.paymentMethod === "upi"
      ? `UPI · ${order.paymentReference}`
      : order?.paymentMethod === "card"
      ? `Card · ${order.paymentReference}`
      : order?.paymentMethod === "cash"
      ? "Cash at Cashier Counter"
      : `Wallet · ${order?.paymentReference || "Direct"}`;

  return (
    <CustomerLayout
      showHeader={true}
      showFooter={true}
      maxWidthClass="max-w-[500px]"
      onBack={() => navigate("/history")}
      backLabel="Shopping History"
    >
      <div className="flex flex-1 flex-col qless-fade-in pb-12 w-full space-y-4">
        {/* Top Action Bar (hidden during printing) */}
        <div className="no-print flex items-center justify-between border-b border-black/5 pb-3">
          <button
            onClick={() => navigate("/history")}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#7A8493] transition hover:text-[#0F2044]"
          >
            <IcBack />
            <span>Order History</span>
          </button>

          {isPending ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-300 px-3 py-1 text-xs font-bold text-amber-800 shadow-2xs">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              <span>PAYMENT PENDING · COUNTER SETTLEMENT</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#EEF8F0] border border-emerald-300 px-3 py-1 text-xs font-bold text-[#2E9E44] shadow-2xs">
              <IcCheck />
              <span>OFFICIAL RECEIPT · PAID (CONFIRMED)</span>
            </span>
          )}
        </div>

        {/* Sync Error Notice with Retry */}
        {syncError && (
          <div
            role="alert"
            className="no-print rounded-2xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800 flex items-start justify-between gap-3 qless-scale-in"
          >
            <div className="flex items-start gap-2 min-w-0">
              <span className="mt-0.5 text-red-600 shrink-0">
                <IcAlert />
              </span>
              <div>
                <p className="font-bold">Sync Error</p>
                <p className="text-[11px] text-red-700 leading-snug mt-0.5">{syncError}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => syncOrder(true)}
              className="rounded-lg bg-red-800 px-3 py-1.5 text-[11px] font-bold text-white shrink-0 hover:bg-red-900 active:scale-95 transition"
            >
              Retry Sync
            </button>
          </div>
        )}

        {/* Printable Official Invoice Card */}
        {order && (
          <article className="printable-receipt rounded-3xl border border-white/70 bg-white/95 p-6 shadow-[0_12px_36px_rgba(15,32,68,0.08)] backdrop-blur-md space-y-5">
            {/* Supermarket & Brand Header */}
            <div className="text-center border-b border-black/5 pb-4">
              <div className="text-[11px] font-bold tracking-widest text-[#2E9E44] uppercase mb-1">
                QLess Smart Self-Checkout
              </div>
              <div className="flex items-center justify-center gap-2 mb-1">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: order.store?.brandColor || "#2E9E44" }}
                />
                <h1 className="font-poppins text-lg font-extrabold text-[#0F2044] tracking-tight">
                  {order.store?.name || "QLess Mart"}
                </h1>
              </div>
              <p className="text-xs text-[#7A8493]">
                {order.store?.branch || "Indiranagar Branch"} · {order.store?.address || "Store Bay"}
              </p>
              <p className="text-[11px] font-mono font-medium text-[#8A94A3] mt-1">
                TAX INVOICE · SELF-CHECKOUT TERMINAL
              </p>
            </div>

            {/* Receipt Identifiers Metadata */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-[#F8F9FA] p-3.5 rounded-2xl border border-black/5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3]">
                  Order Reference
                </p>
                <p className="font-mono font-bold text-[#0F2044] select-all">
                  {order.orderId}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3]">
                  Receipt Number
                </p>
                <p className="font-mono font-bold text-[#0F2044] select-all">
                  {order.receiptId}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3]">
                  Date &amp; Time
                </p>
                <p className="font-medium text-[#0F2044]">
                  {order.paidAt ? new Date(order.paidAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Just now"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3]">
                  Payment Status
                </p>
                <p className={`font-bold ${isPending ? "text-amber-800" : "text-[#2E9E44]"}`}>
                  {isPending ? "PENDING (Pay at Cashier)" : "CONFIRMED (Paid)"}
                </p>
              </div>
            </div>

            {/* Itemised Breakdown */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] mb-2">
                Purchased Merchandise ({order.itemCount} items)
              </p>
              <div className="divide-y divide-black/5 text-xs max-h-56 overflow-y-auto pr-1">
                {order.items.map((item, idx) => (
                  <div key={idx} className="py-2 flex items-center justify-between">
                    <div className="min-w-0 pr-2">
                      <p className="font-semibold text-[#0F2044] truncate">{item.name}</p>
                      <p className="text-[10px] text-[#7A8493]">
                        {item.unitSize ? `${item.unitSize} · ` : ""}Qty {item.quantity} × {fmt(item.price)}
                      </p>
                    </div>
                    <p className="font-bold text-[#0F2044] shrink-0">
                      {fmt(item.price * item.quantity)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Totals */}
            <div className="border-t border-black/5 pt-3 space-y-1.5 text-xs">
              <div className="flex justify-between text-[#7A8493]">
                <span>Items Subtotal</span>
                <span>{fmt(order.subtotal)}</span>
              </div>
              {order.mrpSavings > 0 && (
                <div className="flex justify-between text-[#2E9E44]">
                  <span>Store MRP Savings</span>
                  <span>−{fmt(order.mrpSavings)}</span>
                </div>
              )}
              {order.couponDiscount > 0 && (
                <div className="flex justify-between text-[#2E9E44] font-semibold">
                  <span>Coupon ({order.couponCode || "PROMO"})</span>
                  <span>−{fmt(order.couponDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between text-[#7A8493]">
                <span>Central GST (CGST @ 2.5%)</span>
                <span>+{fmt(order.cgst)}</span>
              </div>
              <div className="flex justify-between text-[#7A8493]">
                <span>State GST (SGST @ 2.5%)</span>
                <span>+{fmt(order.sgst)}</span>
              </div>
              <div className="flex justify-between font-semibold text-[#0F2044] pt-1 border-t border-black/5">
                <span>Total Tax (5% Grocery GST)</span>
                <span>+{fmt(order.taxTotal)}</span>
              </div>

              {/* Grand Total */}
              <div className="border-t border-black/10 pt-3 flex items-baseline justify-between">
                <div>
                  <p className="font-poppins text-xs font-bold uppercase tracking-wider text-[#8A94A3]">
                    {isPending ? "Total Amount Due" : "Total Amount Paid"}
                  </p>
                  <p className="text-[10px] text-[#7A8493]">
                    {isPending
                      ? `Payment Pending via ${paymentLabel}`
                      : `Paid via ${paymentLabel}`}
                  </p>
                </div>
                <p className={`font-poppins text-2xl font-extrabold ${isPending ? "text-amber-800" : "text-[#0F2044]"}`}>
                  {fmt(order.finalTotal)}
                </p>
              </div>
            </div>

            {/* Pending Notice in Receipt */}
            {isPending && (
              <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-3 text-xs text-amber-900 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <span>ℹ️</span> Cash Payment Required at Counter
                </p>
                <p className="text-[11px] text-amber-800 leading-snug">
                  Please proceed to Cashier Counter #03 and show order reference <strong>{order.orderId}</strong>. Once the cashier records cash collection, this invoice will be marked as paid and your exit pass will unlock automatically.
                </p>
              </div>
            )}

            {/* Footer Receipt Notice */}
            <div className="border-t border-black/5 pt-3 text-center text-[10px] text-[#8A94A3] space-y-0.5">
              <p>Thank you for using QLess Smart Self-Checkout!</p>
              <p>
                {isPending
                  ? "Complete cash payment at the counter to unlock your Turnstile Gate Pass."
                  : "Scan your Customer Exit QR Pass at the automated turnstile gate to leave."}
              </p>
            </div>
          </article>
        )}

        {/* Action Controls (hidden during printing) */}
        {order && (
          <div className="no-print space-y-2.5">
            {/* Primary Action: View Customer Exit Pass */}
            <button
              type="button"
              onClick={() => navigate(`/exit-pass/${order.orderId}`)}
              className={`flex h-13 w-full items-center justify-center gap-2 rounded-2xl font-poppins text-sm font-bold text-white transition hover:scale-[1.01] active:scale-[0.98] ${
                isPending
                  ? "bg-amber-600 hover:bg-amber-700 shadow-[0_8px_20px_rgba(217,119,6,0.25)]"
                  : "bg-[#2E9E44] hover:bg-[#288B3B] shadow-[0_8px_20px_rgba(46,158,68,0.25)]"
              }`}
            >
              <span>{isPending ? "🔒" : "📱"}</span>
              <span>
                {isPending
                  ? "View Exit Pass Status (Locked)"
                  : "Show Customer Exit QR Pass"}
              </span>
            </button>

            {/* Print & Download Button Group */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-black/10 bg-white font-poppins text-xs font-semibold text-[#0F2044] shadow-xs hover:bg-[#F8F9FA] transition active:scale-95"
              >
                <span>🖨️</span>
                <span>Print Receipt</span>
              </button>

              <button
                type="button"
                onClick={handleDownload}
                className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-black/10 bg-white font-poppins text-xs font-semibold text-[#0F2044] shadow-xs hover:bg-[#F8F9FA] transition active:scale-95"
              >
                <span>📥</span>
                <span>Download Text</span>
              </button>
            </div>

            {/* Start New Trip */}
            <button
              type="button"
              onClick={handleStartNewTrip}
              className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#0F2044]/30 bg-white/60 font-poppins text-xs font-semibold text-[#0F2044] hover:bg-white transition"
            >
              <span>🛒</span>
              <span>Start New Shopping Trip</span>
            </button>
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
