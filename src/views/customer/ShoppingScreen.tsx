import { useState, useEffect, useMemo } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { AppView, ScanState } from "../../types";
import { fmt } from "../../utils/formatters";
import { useShopping } from "../../context/ShoppingContext";
import { StepBar } from "../../components/common/StepBar";
import { BarcodeScannerModal, DiscoveryTab } from "../../components/modals/BarcodeScannerModal";
import { ShoppingRouteModal } from "../../components/modals/ShoppingRouteModal";
import { ShareModal } from "../../components/modals/ShareModal";
import { CustomerLayout } from "../../layouts/CustomerLayout";
import { PaymentPage } from "../../components/checkout/PaymentPage";
import { ReviewOrderView } from "../../components/checkout/ReviewOrderView";
import { PaymentSuccessView } from "../../components/checkout/PaymentSuccessView";
import { ConfirmationModal } from "../../components/common/ConfirmationModal";
import {
  IcAlert,
  IcBack,
  IcBag,
  IcCamera,
  IcCatalog,
  IcCheck,
  IcScan,
  IcSearch,
  IcShare,
  IcShield,
} from "../../components/common/Icons";
import { useAuth } from "../../context/AuthContext";

export function ShoppingScreen() {
  const navigate = useNavigate();
  const {
    items,
    total,
    itemCount,
    sessionId,
    receiptId,
    paidAt,
    addProduct,
    changeQty,
    clearCart,
    completePayment,
    resetSession,
    selectedStore,
    completedOrder,
    saveCompletedOrder,
    walletBalance,
    appliedCoupon,
    setAppliedCoupon,
    refreshCartWithCatalog,
    catalogError,
    refreshCatalog,
  } = useShopping();
  const { hasValidEntrance } = useAuth();

  const [view, setView] = useState<AppView>("cart");
  const [shareOpen, setShareOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [discoveryTab, setDiscoveryTab] = useState<DiscoveryTab>("scan");
  const [routeModalOpen, setRouteModalOpen] = useState(false);

  // Confirmation dialog state for clearing the cart
  const [showClearCartConfirm, setShowClearCartConfirm] = useState(false);

  // Cart action notification banner
  const [cartAlert, setCartAlert] = useState<{ message: string; type: "error" | "success" } | null>(null);

  // Exit verification state
  const [scanState, setScanState] = useState<ScanState>("idle");

  // Synchronize cart with latest catalog prices on load
  useEffect(() => {
    refreshCartWithCatalog();
  }, [refreshCartWithCatalog]);

  const openDiscovery = (tab: DiscoveryTab = "scan") => {
    setDiscoveryTab(tab);
    setScannerOpen(true);
  };

  const handleDone = () => {
    resetSession();
    setView("cart");
  };

  const simulateExitScan = (outcome: "success" | "error") => {
    setScanState("verifying");
    setTimeout(() => {
      setScanState(outcome);
    }, 1400);
  };

  const resetExitScan = () => {
    setScanState("idle");
  };

  const handleConfirmClearCart = () => {
    clearCart();
    setShowClearCartConfirm(false);
    setCartAlert({ message: "Cart has been emptied.", type: "success" });
    setTimeout(() => setCartAlert(null), 3000);
  };

  // ── ENTRANCE QR GATE BARRIER ──
  // Customers cannot access the live shopping catalog until entrance QR is verified
  if (!hasValidEntrance) {
    return <Navigate to="/scan-store" replace />;
  }

  return (
    <CustomerLayout
      showHeader={true}
      showFooter={true}
      maxWidthClass={
        view === "checkout" || view === "payment" || view === "review-order" || view === "payment-success"
          ? "max-w-[560px]"
          : "max-w-[440px]"
      }
    >
      {/* Step progression */}
      <StepBar current={view} />

      {/* Live Catalog Error Alert */}
      {catalogError && (
        <div
          role="alert"
          aria-live="polite"
          className="mb-3 flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 qless-fade-in"
        >
          <div className="flex items-center gap-2">
            <span className="text-base">⚠️</span>
            <span>Live inventory sync issue: {catalogError}</span>
          </div>
          <button
            type="button"
            onClick={() => refreshCatalog()}
            className="rounded-lg bg-amber-200/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-900 hover:bg-amber-300 transition"
          >
            Retry Sync
          </button>
        </div>
      )}

      {/* Cart Notification Alert */}
      {cartAlert && (
        <div
          role="alert"
          aria-live="polite"
          className={`mb-3 flex items-center justify-between rounded-xl p-3 text-xs qless-fade-in ${
            cartAlert.type === "error"
              ? "bg-red-50 border border-red-200 text-red-800"
              : "bg-emerald-50 border border-emerald-200 text-emerald-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {cartAlert.type === "error" ? <IcAlert /> : <IcCheck />}
            <span>{cartAlert.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setCartAlert(null)}
            className="text-[10px] font-bold uppercase opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ────────────────── VIEW 1: CART ────────────────── */}
      {view === "cart" && (
        <div className="flex flex-1 flex-col qless-fade-in">
          <div className="flex-1 pb-56">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <h2 className="font-poppins text-2xl font-bold tracking-tight text-[#101828]">
                  Cart
                </h2>
                <p className="mt-0.5 text-xs text-[#667085]">
                  Items scanned at {selectedStore?.chain || "Supermarket"}.
                </p>
              </div>
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowClearCartConfirm(true)}
                  className="rounded-xl px-2.5 py-1 text-xs font-semibold text-[#667085] transition hover:bg-white hover:text-red-600 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Quick Search & Catalog Discovery Shortcuts */}
            <div className="mb-3.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => openDiscovery("search")}
                className="flex-1 flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-xs text-[#667085] shadow-2xs transition hover:border-slate-300 hover:text-[#101828] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16A36A]"
              >
                <IcSearch />
                <span className="truncate">Search by name or enter barcode…</span>
              </button>
              <button
                type="button"
                onClick={() => openDiscovery("catalog")}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-xs font-semibold text-[#101828] shadow-2xs transition hover:border-slate-300 hover:bg-slate-50 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#101828]"
              >
                <IcCatalog />
                <span>Catalog</span>
              </button>
            </div>

            {items.length === 0 ? (
              <div className="flex min-h-[300px] items-center justify-center rounded-3xl border border-slate-200/80 bg-white p-8 text-center shadow-xs">
                <div>
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 text-slate-400 border border-slate-100">
                    <IcBag />
                  </div>
                  <h3 className="mt-4 font-poppins text-lg font-bold text-[#101828]">
                    Cart is empty
                  </h3>
                  <p className="mx-auto mt-1 max-w-[240px] text-xs text-[#667085]">
                    Scan shelf barcodes or browse the store catalog to add items to your trip.
                  </p>
                  <div className="mt-5 flex justify-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => openDiscovery("scan")}
                      className="rounded-xl bg-[#16A36A] px-4 py-2.5 font-poppins text-xs font-semibold text-white shadow-sm transition hover:bg-[#15803d] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16A36A]"
                    >
                      Scan Barcode
                    </button>
                    <button
                      type="button"
                      onClick={() => openDiscovery("catalog")}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-poppins text-xs font-semibold text-[#101828] shadow-2xs transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                    >
                      Browse Catalog
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                {items.map((item) => (
                  <article
                    key={item.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-3.5 sm:p-4 shadow-2xs transition duration-200 hover:border-slate-300 gap-2 sm:gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="truncate font-poppins text-sm sm:text-base font-bold text-[#101828]">
                          {item.name}
                        </h3>
                        {item.category && (
                          <span className="rounded-md bg-slate-100 text-slate-600 px-1.5 py-0.5 text-[10px] font-medium border border-slate-200/60">
                            {item.category}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-[#667085]">
                        {item.unitSize ? `${item.unitSize} · ` : ""}{fmt(item.price)} each
                        {item.mrp && item.mrp > item.price && (
                          <span className="ml-1.5 text-[10px] text-[#9AA3AF] line-through font-medium">
                            {fmt(item.mrp)}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center justify-between sm:justify-end gap-3 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      <p className="font-poppins text-base sm:text-lg font-bold text-[#101828]">
                        {fmt(item.price * item.quantity)}
                      </p>
                      <div className="flex items-center gap-1 sm:gap-1.5 rounded-xl border border-slate-200 bg-slate-50/80 p-1 shadow-2xs">
                        <button
                          type="button"
                          onClick={() => changeQty(item.id, -1)}
                          aria-label={`Reduce quantity of ${item.name}`}
                          className="flex min-h-[44px] min-w-[44px] h-11 w-11 items-center justify-center rounded-lg text-base font-bold text-[#101828] transition bg-white hover:bg-slate-100 active:scale-95 shadow-2xs border border-slate-200/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#16A36A] cursor-pointer"
                        >
                          −
                        </button>
                        <span className="min-w-[28px] text-center text-xs font-bold text-[#101828]">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => changeQty(item.id, 1)}
                          aria-label={`Increase quantity of ${item.name}`}
                          className="flex min-h-[44px] min-w-[44px] h-11 w-11 items-center justify-center rounded-lg text-base font-bold text-[#101828] transition bg-white hover:bg-slate-100 active:scale-95 shadow-2xs border border-slate-200/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#16A36A] cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          {/* SmartFind: Floating Route Planner Action */}
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => setRouteModalOpen(true)}
              className="fixed right-4 sm:right-[max(1.25rem,calc(50vw-200px))] bottom-52 z-20 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#101828] text-white shadow-xl shadow-slate-900/25 border border-slate-700/60 hover:bg-slate-800 hover:scale-105 active:scale-95 transition-all cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16A36A]"
              title="SmartFind Aisle Route Planner"
              aria-label="SmartFind Aisle Route Planner"
            >
              <span className="text-xl group-hover:scale-110 transition-transform select-none">🗺️</span>
              <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#16A36A] text-[9px] font-bold text-white px-1 ring-2 ring-white shadow-xs">
                {items.length}
              </span>
            </button>
          )}

          {/* Sticky Bottom Action Bar */}
          <div className="fixed inset-x-0 bottom-0 z-20 px-3 pb-3 sm:px-4 sm:pb-4 bg-gradient-to-t from-[#F8FAFC] via-[#F8FAFC]/95 to-transparent pt-3">
            <div className="mx-auto w-full max-w-[440px] rounded-2xl border border-slate-200/90 bg-white/95 p-3.5 sm:p-4 shadow-[0_-8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl">
              <div className="mb-2.5 flex items-baseline justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#667085]">
                    Total
                  </p>
                  <p className="mt-0.5 font-poppins text-2xl font-extrabold tracking-tight text-[#101828]">
                    {fmt(total)}
                  </p>
                </div>
                <p className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-[#667085]">
                  {itemCount} {itemCount === 1 ? "item" : "items"}
                </p>
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => openDiscovery("scan")}
                  className="flex min-h-[44px] h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#16A36A] font-poppins text-xs sm:text-sm font-bold text-white shadow-sm transition hover:bg-[#15803d] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16A36A]"
                >
                  <IcScan /> Scan &amp; Add Item
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShareOpen(true)}
                    className="flex min-h-[44px] h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white font-poppins text-xs sm:text-sm font-semibold text-[#101828] transition hover:bg-slate-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                    title="Share Cart Session"
                    aria-label="Share Cart Session"
                  >
                    <IcShare />
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("review-order")}
                    disabled={items.length === 0}
                    className="flex-1 flex min-h-[44px] h-12 items-center justify-center gap-2 rounded-xl bg-[#101828] font-poppins text-xs sm:text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#101828]"
                  >
                    <IcBag /> Review Order
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── VIEW 2A: REVIEW ORDER ────────────────── */}
      {view === "review-order" && (
        <ReviewOrderView
          items={items}
          selectedStore={selectedStore}
          sessionId={sessionId}
          appliedCoupon={appliedCoupon}
          onApplyCoupon={setAppliedCoupon}
          onRemoveCoupon={() => setAppliedCoupon(null)}
          onBackToCart={() => setView("cart")}
          onProceedToPayment={() => setView("payment")}
        />
      )}

      {/* ────────────────── VIEW 2B: DEDICATED PAYMENT PAGE ────────────────── */}
      {(view === "payment" || view === "checkout") && (
        <PaymentPage
          items={items}
          selectedStore={selectedStore}
          sessionId={sessionId}
          receiptId={receiptId}
          walletBalance={walletBalance}
          appliedCoupon={appliedCoupon}
          onBack={() => setView("review-order")}
          onEditOrder={() => setView("review-order")}
          onPaymentSuccess={(order) => {
            saveCompletedOrder(order);
            completePayment(order.paidAt);
            setView("payment-success");
          }}
        />
      )}

      {/* ────────────────── VIEW 2B: PAYMENT SUCCESS HANDOFF ────────────────── */}
      {view === "payment-success" && completedOrder && (
        <PaymentSuccessView
          order={completedOrder}
          onContinueToReceipt={() => navigate(`/receipt/${completedOrder.orderId}`)}
        />
      )}

      {/* ────────────────── VIEW 3: EXIT VERIFICATION ────────────────── */}
      {view === "exit" && (
        <div className="flex flex-1 flex-col qless-fade-in">
          <div className="mb-5 text-center">
            <h2 className="font-poppins text-2xl font-bold tracking-tight text-[#0F2044]">
              {scanState === "success"
                ? "You're Good to Go"
                : scanState === "error"
                ? "Access Denied"
                : "Exit Verification"}
            </h2>
            <p className="mt-1 font-alegreya text-base text-[#7A8493]">
              {scanState === "success"
                ? "Payment verified. Exit the store safely."
                : scanState === "error"
                ? "Could not verify your receipt."
                : "Scan your receipt QR at the exit gate"}
            </p>
          </div>

          {/* Idle or Verifying State */}
          {(scanState === "idle" || scanState === "verifying") && (
            <div className="qless-fade-in">
              <div
                className={`relative mx-auto flex aspect-square w-full max-w-[280px] items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed bg-white/85 backdrop-blur-md shadow-[0_12px_32px_rgba(15,32,68,0.10)] ${
                  scanState === "verifying"
                    ? "border-[#2E9E44]/50 shadow-[0_0_28px_rgba(46,158,68,0.12)]"
                    : "qless-pulse-border"
                }`}
              >
                {/* Corner reticles */}
                <div className="pointer-events-none absolute inset-4" aria-hidden="true">
                  <span className="absolute left-0 top-0 h-6 w-6 rounded-tl-lg border-l-2 border-t-2 border-[#0F2044]/25" />
                  <span className="absolute right-0 top-0 h-6 w-6 rounded-tr-lg border-r-2 border-t-2 border-[#0F2044]/25" />
                  <span className="absolute bottom-0 left-0 h-6 w-6 rounded-bl-lg border-b-2 border-l-2 border-[#0F2044]/25" />
                  <span className="absolute bottom-0 right-0 h-6 w-6 rounded-br-lg border-b-2 border-r-2 border-[#0F2044]/25" />
                </div>

                {/* Scan line */}
                <div
                  className="absolute left-6 right-6 h-[2px] rounded-full bg-[#2E9E44]/60 qless-scan-line"
                  aria-hidden="true"
                />

                <div className="relative z-10 text-center px-4">
                  {scanState === "verifying" ? (
                    <>
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF8F0] text-[#2E9E44]">
                        <svg className="h-7 w-7 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                        </svg>
                      </div>
                      <p className="mt-4 font-poppins text-sm font-semibold text-[#2E9E44]">
                        Verifying…
                      </p>
                      <p className="mt-1 font-alegreya text-xs text-[#A0A8B4]">Please hold still</p>
                    </>
                  ) : (
                    <>
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F6F7F8] text-[#9AA3AF]">
                        <IcCamera />
                      </div>
                      <p className="mt-4 font-poppins text-sm font-semibold text-[#7A8493]">
                        Scan QR Code
                      </p>
                      <p className="mt-1 font-alegreya text-xs text-[#A0A8B4]">
                        Align your receipt QR within the frame
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-8 space-y-3">
                <button
                  type="button"
                  onClick={() => simulateExitScan("success")}
                  disabled={scanState === "verifying"}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2E9E44] font-poppins text-sm font-semibold text-white shadow-[0_10px_22px_rgba(46,158,68,0.22)] transition hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E9E44]"
                >
                  <IcScan /> Simulate Scan
                </button>
                <button
                  type="button"
                  onClick={() => simulateExitScan("error")}
                  disabled={scanState === "verifying"}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#D8DDE3] bg-white font-poppins text-sm font-semibold text-[#7A8493] transition hover:scale-[1.02] hover:bg-[#F8F9FA] hover:text-[#0F2044] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                >
                  Simulate Invalid QR
                </button>
                <div className="flex items-center gap-3 pt-1">
                  <div className="h-px flex-1 bg-[#EAEAEA]" />
                  <span className="font-alegreya text-xs text-[#A0A8B4]">or</span>
                  <div className="h-px flex-1 bg-[#EAEAEA]" />
                </div>
                <button
                  type="button"
                  onClick={handleDone}
                  disabled={scanState === "verifying"}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#D8DDE3] bg-white font-poppins text-sm font-semibold text-[#0F2044] transition hover:scale-[1.02] hover:bg-[#F8F9FA] active:scale-[0.98] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F2044]"
                >
                  <IcBack /> Exit Scanner
                </button>
              </div>
            </div>
          )}

          {/* Success State */}
          {scanState === "success" && (
            <div className="qless-fade-in">
              <div className="rounded-2xl border border-white/50 bg-white/85 p-6 text-center shadow-[0_8px_24px_rgba(15,32,68,0.10)] backdrop-blur-md qless-scale-in">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#EEF8F0] text-[#2E9E44]">
                  <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </div>
                <h3 className="mt-4 font-poppins text-xl font-bold text-[#0F2044]">
                  Verification Successful
                </h3>
                <p className="mt-1 font-alegreya text-sm text-[#7A8493]">
                  Payment verified. You may exit the store.
                </p>

                <div className="mt-5 rounded-xl border border-black/5 bg-[#F9FAFB] p-4 text-left space-y-2.5">
                  {[
                    { label: "Receipt ID", value: receiptId },
                    { label: "Amount Paid", value: fmt(total) },
                    { label: "Verified At", value: paidAt || "Just now" },
                    { label: "Session", value: `#${sessionId}` },
                    { label: "Store", value: selectedStore?.name || "Supermarket" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="font-alegreya text-xs text-[#7A8493]">{label}</span>
                      <span className="font-poppins text-xs font-semibold text-[#0F2044]">{value}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-[#2E9E44]/20 bg-[#EEF8F0] px-3.5 py-1 text-[#2E9E44]">
                  <IcShield />
                  <span className="font-poppins text-xs font-semibold">
                    Verified by QLESS Exit Gate (Demo)
                  </span>
                </div>
              </div>

              <div className="mt-4 space-y-2.5">
                <button
                  type="button"
                  onClick={handleDone}
                  className="flex h-12 w-full items-center justify-center rounded-xl bg-[#0F2044] font-poppins text-sm font-semibold text-white shadow-md transition hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F2044]"
                >
                  Done — Back to Cart
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/scan-store")}
                  className="flex h-11 w-full items-center justify-center rounded-xl border border-[#D8DDE3] bg-white font-poppins text-sm font-semibold text-[#7A8493] transition hover:bg-[#F8F9FA] hover:text-[#0F2044] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                >
                  Store Entrance Status
                </button>
              </div>
            </div>
          )}

          {/* Error State */}
          {scanState === "error" && (
            <div className="qless-fade-in">
              <div className="rounded-2xl border border-white/50 bg-white/85 p-6 text-center shadow-[0_8px_24px_rgba(15,32,68,0.10)] backdrop-blur-md qless-scale-in">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#FDF0EF] text-[#D64541]">
                  <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                    <path d="M7 7l10 10M17 7 7 17" />
                  </svg>
                </div>
                <h3 className="mt-4 font-poppins text-xl font-bold text-[#0F2044]">
                  Invalid or Unpaid Cart
                </h3>
                <p className="mt-1 font-alegreya text-sm text-[#7A8493]">
                  Please complete payment before exiting.
                </p>

                <div className="mt-5 rounded-xl border border-[#D64541]/10 bg-[#FDF0EF] p-4 text-left">
                  <p className="font-alegreya text-xs leading-5 text-[#B03A36]">
                    This QR code could not be verified by the gate scanner. If you have already paid,
                    please contact a store associate for manual exit clearance.
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2.5">
                <button
                  type="button"
                  onClick={resetExitScan}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2E9E44] font-poppins text-sm font-semibold text-white shadow-md transition hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E9E44]"
                >
                  Try Again
                </button>
                <button
                  type="button"
                  onClick={handleDone}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#D8DDE3] bg-white font-poppins text-sm font-semibold text-[#0F2044] transition hover:scale-[1.02] hover:bg-[#F8F9FA] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F2044]"
                >
                  <IcBack /> Exit Scanner
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Barcode scanner & product discovery modal */}
      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        initialTab={discoveryTab}
        onItemScanned={(product, quantity) => {
          const res = addProduct(product, quantity);
          if (!res.success) {
            setCartAlert({ message: res.error || "Could not add item to cart.", type: "error" });
          } else {
            setCartAlert({
              message: `Added ${quantity} × ${product.name} to cart.`,
              type: "success",
            });
            setTimeout(() => setCartAlert(null), 3000);
          }
        }}
        existingIds={items.map((i) => i.id)}
      />

      {/* Share Session Modal */}
      <ShareModal
        open={shareOpen}
        sessionId={sessionId}
        onClose={() => setShareOpen(false)}
      />

      {/* Confirmation Modal for Clearing Cart */}
      <ConfirmationModal
        open={showClearCartConfirm}
        title="Clear Entire Cart?"
        message="Are you sure you want to remove all items from your current shopping cart? This cannot be undone."
        confirmLabel="Yes, Clear Cart"
        cancelLabel="Keep Items"
        variant="danger"
        onConfirm={handleConfirmClearCart}
        onCancel={() => setShowClearCartConfirm(false)}
      />

      {/* SmartFind Shopping Route Modal */}
      <ShoppingRouteModal
        open={routeModalOpen}
        onClose={() => setRouteModalOpen(false)}
      />
    </CustomerLayout>
  );
}
