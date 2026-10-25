import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { CustomerLayout } from "../../layouts/CustomerLayout";
import { useAuth } from "../../context/AuthContext";
import { isSupabaseConfigured } from "../../lib/supabase";
import { LAUNCH_STORE, LAUNCH_STORE_ID } from "../../config/storeConfig";
import { fmt } from "../../utils/formatters";
import {
  CashierPendingOrder,
  fetchPendingCashOrders,
  searchPendingCashOrders,
  confirmCashPayment,
  fetchOrderDetails,
} from "../../services/cashierService";
import { EmptyState } from "../../components/common/EmptyState";
import { IcSearch } from "../../components/common/Icons";

export function CashierScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const storeId = user?.storeId || LAUNCH_STORE_ID;
  const terminalLabel = user?.terminalId || "Checkout Counter #03";

  // Pending queue state
  const [orders, setOrders] = useState<CashierPendingOrder[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modal / Selected order state
  const [selectedOrder, setSelectedOrder] = useState<CashierPendingOrder | null>(null);
  const [cashConfirmedChecked, setCashConfirmedChecked] = useState<boolean>(false);
  const [cashierNotes, setCashierNotes] = useState<string>("");
  const [isSettling, setIsSettling] = useState<boolean>(false);
  const isSettlingRef = useRef<boolean>(false);

  // Status banners
  const [successBanner, setSuccessBanner] = useState<{
    orderId: string;
    amount: number;
    message: string;
  } | null>(null);
  const [errorBanner, setErrorBanner] = useState<{
    message: string;
    isAmbiguous?: boolean;
    orderId?: string;
  } | null>(null);

  // Associate notification toast
  const [associateNotified, setAssociateNotified] = useState<boolean>(false);

  /**
   * Loads pending cash orders from the store database.
   */
  const loadQueue = useCallback(async (isSilent = false) => {
    if (!isSilent) {
      setIsLoading(true);
    }
    setFetchError(null);

    const res = await fetchPendingCashOrders(storeId);
    if (res.error) {
      setFetchError(res.error);
    } else {
      setOrders(res.orders);
    }

    if (!isSilent) {
      setIsLoading(false);
    }
  }, [storeId]);

  // Initial load on mount
  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // Auto-refresh queue every 15 seconds so new self-checkout cash orders appear in real time
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const interval = setInterval(() => {
      // Only background refresh when cashier is not currently in the middle of confirming an order
      if (!isSettlingRef.current && !selectedOrder) {
        loadQueue(true);
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [loadQueue, selectedOrder]);

  // Filtered orders matching search query
  const displayedOrders = useMemo(() => {
    return searchPendingCashOrders(orders, searchQuery);
  }, [orders, searchQuery]);

  const handleOpenSettleModal = (order: CashierPendingOrder) => {
    setSelectedOrder(order);
    setCashConfirmedChecked(false);
    setCashierNotes("");
    setErrorBanner(null);
  };

  const handleCloseModal = () => {
    if (isSettling) return;
    setSelectedOrder(null);
    setCashConfirmedChecked(false);
    setCashierNotes("");
  };

  const handleRequestAssociate = () => {
    setAssociateNotified(true);
    setTimeout(() => {
      setAssociateNotified(false);
    }, 4000);
  };

  /**
   * Confirms cash settlement for the selected order.
   * Invokes the database RPC function confirm_cash_order_payment.
   */
  const handleConfirmSettlement = async () => {
    if (!selectedOrder) return;
    if (!cashConfirmedChecked) return;
    if (isSettlingRef.current) return;

    isSettlingRef.current = true;
    setIsSettling(true);
    setErrorBanner(null);
    setSuccessBanner(null);

    const orderToSettle = selectedOrder;

    try {
      const res = await confirmCashPayment(orderToSettle.id, storeId);

      if (res.success) {
        // Successful database confirmation!
        setSuccessBanner({
          orderId: orderToSettle.id,
          amount: orderToSettle.finalTotal,
          message:
            res.message ||
            `Cash settlement confirmed. Order ${orderToSettle.id} is PAID and turnstile exit pass is active.`,
        });

        // Close modal and refresh pending queue immediately
        setSelectedOrder(null);
        await loadQueue(true);
      } else {
        // Handled or network error
        if (res.isNetworkError) {
          setErrorBanner({
            orderId: orderToSettle.id,
            message:
              res.error ||
              "Network outcome uncertain. Please re-check the order status before attempting to collect cash again.",
            isAmbiguous: true,
          });

          // Check if order was actually confirmed despite network glitch
          const check = await fetchOrderDetails(orderToSettle.id, storeId);
          if (check.order && check.order.paymentStatus === "CONFIRMED") {
            setSuccessBanner({
              orderId: orderToSettle.id,
              amount: orderToSettle.finalTotal,
              message: `Order ${orderToSettle.id} is confirmed in the database! Turnstile exit pass is active.`,
            });
            setSelectedOrder(null);
            await loadQueue(true);
            setErrorBanner(null);
          }
        } else {
          setErrorBanner({
            orderId: orderToSettle.id,
            message: res.error || "Failed to reconcile cash payment with store database.",
            isAmbiguous: false,
          });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unexpected settlement error";
      setErrorBanner({
        orderId: orderToSettle.id,
        message: msg,
        isAmbiguous: true,
      });
    } finally {
      isSettlingRef.current = false;
      setIsSettling(false);
    }
  };

  return (
    <CustomerLayout
      showHeader={true}
      showFooter={true}
      maxWidthClass="max-w-[640px]"
      onBack={() => navigate("/auth/role")}
      backLabel="Exit Cashier Station"
    >
      <div className="flex flex-1 flex-col space-y-4 pb-12 qless-fade-in w-full text-[#0F2044]">
        {/* Top Header Card */}
        <div className="rounded-3xl border border-white/70 bg-white/95 p-5 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-900 text-2xl text-white shadow-xs">
                🧑‍💼
              </div>
              <div>
                <h1 className="font-poppins text-lg font-bold text-[#0F2044]">
                  Cashier Assistance Desk
                </h1>
                <p className="text-xs text-[#7A8493]">
                  {user?.name ? `${user.name} · ${terminalLabel}` : "Counter Cash Settlements & Manual Overrides"}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1">
              {isSupabaseConfigured ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-[11px] font-bold text-emerald-800">
                  <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
                  <span>LIVE POS · {storeId}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-1 text-[10px] font-bold text-blue-800">
                  <span>DEMO SIMULATION</span>
                </span>
              )}
              <span className="text-[10px] font-mono text-[#7A8493]">
                {terminalLabel}
              </span>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs border-t border-black/5 pt-3">
            <div>
              <span className="text-[#7A8493]">Supermarket:</span>
              <p className="font-bold text-[#0F2044] truncate">{LAUNCH_STORE.name} ({storeId})</p>
            </div>
            <button
              type="button"
              onClick={() => loadQueue()}
              disabled={isLoading}
              className="flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2044] shadow-2xs hover:bg-slate-50 transition active:scale-95 disabled:opacity-50"
            >
              <span className={isLoading ? "animate-spin" : ""}>🔄</span>
              <span>{isLoading ? "Refreshing…" : "Refresh Queue"}</span>
            </button>
          </div>
        </div>

        {/* Success Alert Banner */}
        {successBanner && (
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50/95 p-4 text-emerald-900 shadow-xs qless-fade-in flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <span className="text-xl shrink-0 mt-0.5">✅</span>
              <div>
                <p className="font-bold text-xs sm:text-sm">
                  Cash Collected: {fmt(successBanner.amount)}
                </p>
                <p className="text-xs text-emerald-800 mt-0.5 leading-relaxed">
                  {successBanner.message}
                </p>
                <p className="text-[11px] font-mono font-semibold text-emerald-700 mt-1">
                  Order Ref: {successBanner.orderId} · Turnstile Exit Pass Issued
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSuccessBanner(null)}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-900"
            >
              ✕
            </button>
          </div>
        )}

        {/* Error Alert Banner */}
        {errorBanner && (
          <div
            className={`rounded-2xl border p-4 shadow-xs qless-fade-in flex items-start justify-between gap-3 ${
              errorBanner.isAmbiguous
                ? "border-amber-300 bg-amber-50 text-amber-950"
                : "border-red-200 bg-red-50 text-red-900"
            }`}
          >
            <div className="flex items-start gap-2.5">
              <span className="text-xl shrink-0 mt-0.5">
                {errorBanner.isAmbiguous ? "⚠️" : "⛔"}
              </span>
              <div>
                <p className="font-bold text-xs sm:text-sm">
                  {errorBanner.isAmbiguous
                    ? "Reconciliation Ambiguous (Network Issue)"
                    : "Payment Confirmation Declined"}
                </p>
                <p className="text-xs mt-0.5 leading-relaxed">
                  {errorBanner.message}
                </p>
                {errorBanner.orderId && (
                  <button
                    type="button"
                    onClick={() => loadQueue()}
                    className="mt-2 text-xs font-bold underline hover:opacity-80"
                  >
                    Re-check Order Status in Database →
                  </button>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="text-xs font-bold hover:opacity-80"
            >
              ✕
            </button>
          </div>
        )}

        {/* Associate Toast */}
        {associateNotified && (
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-3.5 text-indigo-900 qless-fade-in flex items-center gap-2.5 text-xs">
            <span className="text-base">🔔</span>
            <p className="font-medium">
              Floor assistant notified for terminal bay support.
            </p>
          </div>
        )}

        {/* Search & Queue Controls */}
        <div className="rounded-3xl border border-white/70 bg-white/95 p-4 shadow-sm backdrop-blur-md space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <h2 className="font-poppins text-sm font-bold text-[#0F2044] flex items-center gap-2">
                <span>Pending Cash Settlements</span>
                <span className="rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                  {orders.length} {orders.length === 1 ? "Order" : "Orders"}
                </span>
              </h2>
              <p className="text-[11px] text-[#7A8493]">
                Self-checkout customers awaiting cashier payment confirmation
              </p>
            </div>

            {/* Quick Call Associate Button */}
            <button
              type="button"
              onClick={handleRequestAssociate}
              className="self-start sm:self-auto flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2044] shadow-2xs hover:bg-slate-50 transition active:scale-95"
            >
              <span>🔔</span>
              <span>Call Floor Associate</span>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-[#7A8493]">
              <IcSearch />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Order ID (e.g. QL-2026-...) or Receipt Ref..."
              className="w-full rounded-2xl border border-black/10 bg-black/5 pl-9 pr-4 py-2.5 text-xs font-mono font-medium text-[#0F2044] placeholder-[#9AA3AF] focus:border-[#0F2044] focus:bg-white focus:outline-hidden transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-[#7A8493] hover:text-[#0F2044]"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Queue Display Area */}
        {isLoading ? (
          <div className="rounded-3xl border border-white/70 bg-white/95 p-10 shadow-sm text-center space-y-3">
            <span className="inline-block h-6 w-6 border-2 border-[#0F2044]/30 border-t-[#0F2044] rounded-full animate-spin" />
            <p className="text-xs font-semibold text-[#7A8493]">
              Loading pending cash orders from store database…
            </p>
          </div>
        ) : fetchError ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-center space-y-3">
            <p className="text-sm font-bold text-red-700">Failed to Connect to Cash Queue</p>
            <p className="text-xs text-red-600 max-w-sm mx-auto">{fetchError}</p>
            <button
              type="button"
              onClick={() => loadQueue()}
              className="rounded-xl bg-[#0F2044] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#1A3163] transition"
            >
              Retry Database Connection
            </button>
          </div>
        ) : displayedOrders.length === 0 ? (
          <div className="rounded-3xl border border-white/70 bg-white/95 p-8 shadow-sm text-center">
            {searchQuery ? (
              <EmptyState
                emoji="🔍"
                title="No Matching Orders"
                description={`No pending cash orders match "${searchQuery}". Check the order reference number on the customer's receipt.`}
                action={{
                  label: "Clear Search",
                  onClick: () => setSearchQuery(""),
                }}
              />
            ) : (
              <EmptyState
                emoji="💵"
                title="No Pending Cash Orders"
                description="All self-checkout cash orders have been reconciled! New cash orders will appear in this queue automatically as shoppers checkout."
                action={{
                  label: "Refresh Queue",
                  onClick: () => loadQueue(),
                }}
              />
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {displayedOrders.map((order) => {
              const formattedTime = new Date(order.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div
                  key={order.id}
                  className="rounded-3xl border border-white/80 bg-white/95 p-4 sm:p-5 shadow-sm hover:shadow-md transition backdrop-blur-md space-y-3"
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 border-b border-black/5 pb-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-[#0F2044] tracking-wide">
                          {order.id}
                        </span>
                        <span className="rounded-full bg-amber-50 border border-amber-300 px-2 py-0.5 text-[9px] font-bold text-amber-800 uppercase tracking-wider">
                          Cash Pending
                        </span>
                      </div>
                      <p className="text-[11px] text-[#7A8493] mt-0.5">
                        Receipt: <strong className="font-mono text-[#0F2044]">{order.receiptId}</strong> · Placed at {formattedTime}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] block">
                        Amount Due
                      </span>
                      <span className="font-poppins text-lg sm:text-xl font-extrabold text-[#2E9E44]">
                        {fmt(order.finalTotal)}
                      </span>
                    </div>
                  </div>

                  {/* Line Items Preview */}
                  <div className="bg-[#F8F9FA] rounded-2xl p-3 border border-black/5 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase text-[#8A94A3] border-b border-black/5 pb-1">
                      <span>Items ({order.items.reduce((s, i) => s + i.quantity, 0)} units)</span>
                      <span>Total</span>
                    </div>

                    <div className="divide-y divide-black/5 max-h-36 overflow-y-auto pr-1">
                      {order.items.map((item) => (
                        <div key={item.id} className="py-1.5 flex items-center justify-between">
                          <div className="min-w-0 pr-2 truncate">
                            <p className="font-semibold text-[#0F2044] truncate">{item.productName}</p>
                            <p className="text-[10px] text-[#7A8493]">
                              {item.unitSize ? `${item.unitSize} · ` : ""}Qty: {item.quantity} × {fmt(item.unitPrice)}
                            </p>
                          </div>
                          <span className="font-mono font-bold text-[#0F2044] shrink-0">
                            {fmt(item.totalPrice)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Card Action */}
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <span className="text-[11px] text-[#7A8493]">
                      Session: <span className="font-mono">{order.sessionId}</span>
                    </span>

                    <button
                      type="button"
                      onClick={() => handleOpenSettleModal(order)}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-[#0F2044] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#1A3163] active:scale-95 transition"
                    >
                      <span>💵</span>
                      <span>Collect Cash &amp; Settle ({fmt(order.finalTotal)})</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ────────────────── ORDER SETTLEMENT MODAL ────────────────── */}
        {selectedOrder && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cashier-modal-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs qless-fade-in"
          >
            <div className="w-full max-w-lg rounded-3xl border border-white/60 bg-white p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="flex items-start justify-between border-b border-black/5 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-lg">
                      💵
                    </span>
                    <div>
                      <h2
                        id="cashier-modal-title"
                        className="font-poppins text-base font-bold text-[#0F2044]"
                      >
                        Confirm Physical Cash Collection
                      </h2>
                      <p className="text-xs text-[#7A8493]">
                        Order Ref: <strong className="font-mono text-[#0F2044]">{selectedOrder.id}</strong>
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={isSettling}
                  className="rounded-xl border border-black/10 p-1.5 text-xs text-[#7A8493] hover:text-[#0F2044] hover:bg-slate-50 transition"
                >
                  ✕
                </button>
              </div>

              {/* Order Breakdown */}
              <div className="rounded-2xl border border-black/5 bg-[#F9FAFB] p-3.5 space-y-2 text-xs">
                <div className="flex justify-between text-[#7A8493]">
                  <span>Receipt Reference</span>
                  <span className="font-mono font-bold text-[#0F2044]">{selectedOrder.receiptId}</span>
                </div>
                <div className="flex justify-between text-[#7A8493]">
                  <span>Item Subtotal ({selectedOrder.items.length} lines)</span>
                  <span className="font-semibold text-[#0F2044]">{fmt(selectedOrder.subtotal)}</span>
                </div>
                {selectedOrder.mrpSavings > 0 && (
                  <div className="flex justify-between text-emerald-600 font-medium">
                    <span>Store MRP Savings</span>
                    <span>−{fmt(selectedOrder.mrpSavings)}</span>
                  </div>
                )}
                {selectedOrder.couponDiscount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-medium">
                    <span>Coupon Discount ({selectedOrder.couponCode || "PROMO"})</span>
                    <span>−{fmt(selectedOrder.couponDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[#7A8493]">
                  <span>Taxes (CGST + SGST)</span>
                  <span>+{fmt(selectedOrder.taxTotal)}</span>
                </div>
                <div className="flex justify-between border-t border-black/10 pt-2 font-poppins text-base font-extrabold text-[#0F2044]">
                  <span>Total Cash to Collect:</span>
                  <span className="text-[#2E9E44] text-lg">{fmt(selectedOrder.finalTotal)}</span>
                </div>
              </div>

              {/* Cashier Verification Checkbox (Requirement 3 & 4) */}
              <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/70 p-3.5 space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cashConfirmedChecked}
                    onChange={(e) => setCashConfirmedChecked(e.target.checked)}
                    disabled={isSettling}
                    className="mt-0.5 h-4 w-4 rounded-md border-emerald-400 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-emerald-950 leading-snug">
                    I confirm that I have physically received{" "}
                    <span className="underline decoration-emerald-600">{fmt(selectedOrder.finalTotal)}</span>{" "}
                    in cash from the customer for order {selectedOrder.id}.
                  </span>
                </label>
                <p className="text-[10px] text-emerald-800 pl-6.5">
                  Confirming this transaction will mark the order as PAID in the database and activate the customer&apos;s turnstile exit pass.
                </p>
              </div>

              {/* Optional Cashier Notes */}
              <div>
                <label
                  htmlFor="settle-notes-input"
                  className="block text-[11px] font-bold uppercase tracking-wider text-[#7A8493] mb-1"
                >
                  Cashier Shift Notes (Optional):
                </label>
                <input
                  id="settle-notes-input"
                  type="text"
                  value={cashierNotes}
                  onChange={(e) => setCashierNotes(e.target.value)}
                  placeholder={`Cash collected at ${terminalLabel}`}
                  disabled={isSettling}
                  className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-xs text-[#0F2044] focus:border-[#0F2044] outline-hidden"
                />
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-black/5">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={isSettling}
                  className="rounded-xl border border-black/10 bg-white py-2.5 text-xs font-bold text-[#0F2044] hover:bg-slate-50 transition disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleConfirmSettlement}
                  disabled={!cashConfirmedChecked || isSettling}
                  className="flex items-center justify-center gap-2 rounded-xl bg-[#2E9E44] py-2.5 text-xs font-bold text-white shadow-md hover:bg-[#288B3B] active:scale-95 transition disabled:opacity-50 disabled:pointer-events-none"
                >
                  {isSettling ? (
                    <>
                      <span className="h-3.5 w-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      <span>Reconciling RPC…</span>
                    </>
                  ) : (
                    <span>Confirm Cash Received →</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
