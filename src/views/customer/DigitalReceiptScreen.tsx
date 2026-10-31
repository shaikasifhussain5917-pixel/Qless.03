import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useShopping } from "../../context/ShoppingContext";
import { useAuth } from "../../context/AuthContext";
import { getOrderById, downloadReceiptFile } from "../../utils/orderStorage";
import { CustomerLayout } from "../../layouts/CustomerLayout";
import { fmt } from "../../utils/formatters";
import { IcBack, IcCheck, IcAlert, IcPrinter, IcDownload, IcLock, IcQrCode, IcCart } from "../../components/common/Icons";
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
        <div className="no-print flex items-center justify-between border-b border-slate-200/80 pb-3">
          <button
            onClick={() => navigate("/history")}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-slate-900"
          >
            <IcBack />
            <span>Order History</span>
          </button>

          {isPending ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-800 shadow-2xs">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span>PAYMENT PENDING · COUNTER SETTLEMENT</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700 shadow-2xs">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-white">
                <IcCheck />
              </span>
              <span>OFFICIAL RECEIPT · PAID (CONFIRMED)</span>
            </span>
          )}
        </div>

        {/* Sync Error Notice with Retry */}
        {syncError && (
          <div
            role="alert"
            className="no-print rounded-2xl border border-red-200 bg-red-50/90 p-3.5 text-xs text-red-800 flex items-start justify-between gap-3 qless-scale-in"
          >
            <div className="flex items-start gap-2 min-w-0">
              <span className="mt-0.5 text-red-600 shrink-0">
                <IcAlert />
              </span>
              <div>
                <p className="font-bold text-red-900">Sync Error</p>
                <p className="text-[11px] text-red-700 leading-snug mt-0.5">{syncError}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => syncOrder(true)}
              className="rounded-lg bg-red-800 px-3 py-1.5 text-[11px] font-semibold text-white shrink-0 hover:bg-red-900 active:scale-95 transition"
            >
              Retry Sync
            </button>
          </div>
        )}

        {/* Printable Official Invoice Card */}
        {order && (
          <article className="printable-receipt rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm space-y-5">
            {/* Supermarket & Brand Header */}
            <div className="text-center border-b border-slate-100 pb-4">
              <div className="text-[10px] font-bold tracking-widest text-emerald-600 uppercase mb-1">
                QLess Smart Self-Checkout
              </div>
              <div className="flex items-center justify-center gap-2 mb-1">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: order.store?.brandColor || "#16A34A" }}
                />
                <h1 className="font-poppins text-lg font-bold text-slate-900 tracking-tight">
                  {order.store?.name || "QLess Mart"}
                </h1>
              </div>
              <p className="text-xs text-slate-500">
                {order.store?.branch || "Indiranagar Branch"} · {order.store?.address || "Store Bay"}
              </p>
              <p className="text-[11px] font-mono font-medium text-slate-400 mt-1">
                DIGITAL RECEIPT · SELF-CHECKOUT TERMINAL
              </p>
            </div>

            {/* Receipt Identifiers Metadata */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50/70 p-3.5 rounded-2xl border border-slate-100">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Order Reference
                </p>
                <p className="font-mono font-semibold text-slate-900 select-all">
                  {order.orderId}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Receipt Number
                </p>
                <p className="font-mono font-semibold text-slate-900 select-all">
                  {order.receiptId}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Date &amp; Time
                </p>
                <p className="font-medium text-slate-800">
                  {order.paidAt ? new Date(order.paidAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Just now"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Payment Status
                </p>
                <p className={`font-semibold ${isPending ? "text-amber-800" : "text-emerald-700"}`}>
                  {isPending ? "PENDING (Pay at Cashier)" : "CONFIRMED (Paid)"}
                </p>
              </div>
            </div>

            {/* Itemised Breakdown */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Purchased Merchandise ({order.itemCount} items)
              </p>
              <div className="divide-y divide-slate-100 text-xs max-h-56 overflow-y-auto pr-1">
                {order.items.map((item, idx) => (
                  <div key={idx} className="py-2.5 flex items-center justify-between">
                    <div className="min-w-0 pr-2">
                      <p className="font-medium text-slate-900 truncate">{item.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {item.unitSize ? `${item.unitSize} · ` : ""}Qty {item.quantity} × {fmt(item.price)}
                      </p>
                    </div>
                    <p className="font-semibold text-slate-900 shrink-0">
                      {fmt(item.price * item.quantity)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Totals */}
            <div className="border-t border-slate-100 pt-3.5 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Items Subtotal</span>
                <span className="font-medium text-slate-900">{fmt(order.subtotal)}</span>
              </div>
              {order.mrpSavings > 0 && (
                <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700">
                  <span>Store MRP Savings (Instant Discount)</span>
                  <span>Saved {fmt(order.mrpSavings)}</span>
                </div>
              )}
              {order.couponDiscount > 0 && (
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span>Coupon ({order.couponCode || "PROMO"})</span>
                  <span>−{fmt(order.couponDiscount)}</span>
                </div>
              )}

              {/* Grand Total */}
              <div className="border-t border-slate-200 pt-3 flex items-baseline justify-between">
                <div>
                  <p className="font-poppins text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {isPending ? "Total Amount Due" : "Total Amount Paid"}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {isPending
                      ? `Payment Pending via ${paymentLabel}`
                      : `Paid via ${paymentLabel}`}
                  </p>
                </div>
                <p className={`font-poppins text-2xl font-bold tracking-tight ${isPending ? "text-amber-800" : "text-slate-900"}`}>
                  {fmt(order.finalTotal)}
                </p>
              </div>
            </div>

            {/* Pending Notice in Receipt */}
            {isPending && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900 space-y-1">
                <p className="font-bold flex items-center gap-1.5 text-amber-900">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-200 text-amber-900 text-[10px]">!</span>
                  <span>Cash Payment Required at Counter</span>
                </p>
                <p className="text-[11px] text-amber-800 leading-snug">
                  Please proceed to Cashier Counter #03 and show order reference <strong>{order.orderId}</strong>. Once the cashier records cash collection, this invoice will be marked as paid and your exit pass will unlock automatically.
                </p>
              </div>
            )}

            {/* Footer Receipt Notice */}
            <div className="border-t border-slate-100 pt-3.5 text-center text-[11px] text-slate-400 space-y-0.5">
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
              className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl font-poppins text-sm font-semibold text-white transition hover:opacity-95 active:scale-[0.99] shadow-sm ${
                isPending
                  ? "bg-amber-600 hover:bg-amber-700 shadow-amber-500/20"
                  : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20"
              }`}
            >
              {isPending ? <IcLock className="h-4 w-4" /> : <IcQrCode className="h-4 w-4" />}
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
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white font-poppins text-xs font-semibold text-slate-800 shadow-xs hover:bg-slate-50 transition active:scale-[0.98]"
              >
                <IcPrinter className="h-4 w-4 text-slate-500" />
                <span>Print Receipt</span>
              </button>

              <button
                type="button"
                onClick={handleDownload}
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white font-poppins text-xs font-semibold text-slate-800 shadow-xs hover:bg-slate-50 transition active:scale-[0.98]"
              >
                <IcDownload className="h-4 w-4 text-slate-500" />
                <span>Download Text</span>
              </button>
            </div>

            {/* Start New Trip */}
            <button
              type="button"
              onClick={handleStartNewTrip}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/70 font-poppins text-xs font-semibold text-slate-700 hover:bg-white hover:border-slate-400 transition"
            >
              <IcCart className="h-4 w-4 text-slate-500" />
              <span>Start New Shopping Trip</span>
            </button>
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
