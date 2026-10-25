import { useState, useEffect, useCallback, useMemo } from "react";
import { AdminTab, CompletedOrder, Product, SupermarketStore, VerificationLogEntry } from "../../types";
import { fmt } from "../../utils/formatters";
import { fetchAdminInventory, AdminInventoryItem } from "../../services/adminInventoryService";
import { fetchAdminOrders } from "../../services/adminOrderService";
import { fetchAdminSecurityLogs, LiveSecurityLogEntry } from "../../services/adminSecurityService";
import { LAUNCH_STORE_ID } from "../../config/storeConfig";

interface AdminOverviewTabProps {
  storeId?: string;
  catalog?: Product[];
  orderHistory?: CompletedOrder[];
  verificationLogs?: VerificationLogEntry[];
  selectedStore: SupermarketStore | null;
  onNavigateTab: (tab: AdminTab) => void;
  onOpenAddProductModal: () => void;
}

export function AdminOverviewTab({
  storeId,
  selectedStore,
  onNavigateTab,
  onOpenAddProductModal,
}: AdminOverviewTabProps) {
  const targetStoreId = storeId || selectedStore?.id || LAUNCH_STORE_ID;

  // Live data states
  const [inventory, setInventory] = useState<AdminInventoryItem[]>([]);
  const [orders, setOrders] = useState<CompletedOrder[]>([]);
  const [securityLogs, setSecurityLogs] = useState<LiveSecurityLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  // Live data loader
  const loadDashboardData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setLoadError(null);

    try {
      const [invRes, ordersRes, secRes] = await Promise.all([
        fetchAdminInventory(targetStoreId),
        fetchAdminOrders(targetStoreId),
        fetchAdminSecurityLogs(targetStoreId),
      ]);

      if (invRes.error) {
        throw new Error(`Inventory: ${invRes.error}`);
      }
      if (ordersRes.error) {
        throw new Error(`Orders: ${ordersRes.error}`);
      }
      if (secRes.error) {
        throw new Error(`Security: ${secRes.error}`);
      }

      setInventory(invRes.items);
      setOrders(ordersRes.orders);
      setSecurityLogs(secRes.logs);
      setLastRefreshed(new Date());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load live overview metrics.";
      setLoadError(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [targetStoreId]);

  useEffect(() => {
    loadDashboardData(false);
  }, [loadDashboardData]);

  // ── ORDER & REVENUE METRICS (Confirmed paid orders only) ──
  const confirmedOrders = useMemo(() => {
    return orders.filter((o) => o.paymentStatus === "CONFIRMED");
  }, [orders]);

  const pendingOrders = useMemo(() => {
    return orders.filter((o) => o.paymentStatus === "PENDING");
  }, [orders]);

  const totalRevenue = useMemo(() => {
    return confirmedOrders.reduce((sum, order) => sum + (Number(order.finalTotal) || 0), 0);
  }, [confirmedOrders]);

  const totalItemsSold = useMemo(() => {
    return confirmedOrders.reduce((sum, order) => sum + (Number(order.itemCount) || 0), 0);
  }, [confirmedOrders]);

  const averageOrderValue = useMemo(() => {
    return confirmedOrders.length > 0 ? totalRevenue / confirmedOrders.length : 0;
  }, [totalRevenue, confirmedOrders]);

  // ── INVENTORY METRICS (Authoritative store_inventory values) ──
  const totalStockUnits = useMemo(() => {
    return inventory.reduce((sum, p) => sum + p.stockQuantity, 0);
  }, [inventory]);

  const lowStockProducts = useMemo(() => {
    return inventory.filter((p) => p.stockQuantity <= 10 && p.stockQuantity > 0);
  }, [inventory]);

  const outOfStockProducts = useMemo(() => {
    return inventory.filter((p) => p.stockQuantity === 0);
  }, [inventory]);

  const allAlertProducts = useMemo(() => {
    return inventory.filter((p) => p.stockQuantity <= 10);
  }, [inventory]);

  const availableCatalogSkus = useMemo(() => {
    return inventory.filter((p) => p.isAvailable).length;
  }, [inventory]);

  // ── SECURITY METRICS (Actual database logs) ──
  const verifiedGateCount = useMemo(() => {
    return securityLogs.filter((v) => v.outcome === "success").length;
  }, [securityLogs]);

  const duplicateGateCount = useMemo(() => {
    return securityLogs.filter(
      (v) => v.outcome === "duplicate_warning" || v.failureReason === "DUPLICATE_EXIT_SCAN"
    ).length;
  }, [securityLogs]);

  const expiredGateCount = useMemo(() => {
    return securityLogs.filter(
      (v) => v.failureReason === "EXPIRED_PASS" || v.failureReason === "EXPIRED_EXIT_PASS"
    ).length;
  }, [securityLogs]);

  const flaggedGateCount = useMemo(() => {
    return securityLogs.filter(
      (v) => v.hasDiscrepancy || v.outcome === "failure" || v.outcome === "duplicate_warning"
    ).length;
  }, [securityLogs]);

  // ── BEST SELLERS (From confirmed order items) ──
  const bestSellers = useMemo(() => {
    const countsMap: Record<number, { name: string; emoji: string; count: number; revenue: number }> = {};
    for (const order of confirmedOrders) {
      for (const item of order.items) {
        if (!countsMap[item.id]) {
          countsMap[item.id] = {
            name: item.name,
            emoji: item.emoji || "🛍️",
            count: 0,
            revenue: 0,
          };
        }
        countsMap[item.id].count += item.quantity;
        countsMap[item.id].revenue += item.price * item.quantity;
      }
    }

    const sorted = Object.values(countsMap).sort((a, b) => b.count - a.count);
    return sorted.slice(0, 5);
  }, [confirmedOrders]);

  // Render loading state
  if (isLoading) {
    return (
      <div className="space-y-5 qless-fade-in text-xs">
        <div className="rounded-2xl border border-blue-200/80 bg-blue-50/70 p-4 text-blue-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <div>
              <p className="font-poppins font-bold text-xs">Connecting to Supabase Live Overview...</p>
              <p className="text-[11px] text-blue-800">Aggregating live store inventory, confirmed orders, and gate logs for {targetStoreId}.</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-28 rounded-2xl border border-black/5 bg-white/70 animate-pulse p-4" />
          ))}
        </div>
      </div>
    );
  }

  // Render error state with retry
  if (loadError) {
    return (
      <div className="space-y-4 qless-fade-in text-xs">
        <div className="rounded-2xl border border-red-200 bg-red-50/80 p-5 text-red-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <h3 className="font-poppins font-bold text-sm text-red-950">Failed to Load Live Overview</h3>
              <p className="text-xs text-red-800 mt-0.5">{loadError}</p>
              <p className="text-[11px] text-red-700 mt-1">
                Database queries to Supabase failed. Mock or stale zeroes are not displayed.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => loadDashboardData(false)}
            className="rounded-xl bg-red-600 px-4 py-2 font-poppins text-xs font-bold text-white hover:bg-red-700 transition active:scale-95 shadow-xs shrink-0"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 qless-fade-in text-xs">
      {/* ── LIVE DATABASE BANNER & REFRESH BAR ── */}
      <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-3.5 text-emerald-950 leading-relaxed flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <span className="text-base shrink-0">🟢</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-poppins font-bold text-xs text-[#0F2044]">
                Live Store Operations: {selectedStore?.name || "QLess Mart"} ({targetStoreId})
              </span>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-800 shrink-0">
                Live Supabase Verified
              </span>
            </div>
            <p className="text-[11px] text-[#4A5568]">
              Metrics are calculated directly from authoritative Supabase tables: <code className="font-mono text-[10px] bg-white/70 px-1 py-0.5 rounded">store_inventory</code>, <code className="font-mono text-[10px] bg-white/70 px-1 py-0.5 rounded">orders</code>, and <code className="font-mono text-[10px] bg-white/70 px-1 py-0.5 rounded">security_logs</code>.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          {lastRefreshed && (
            <span className="text-[10px] text-[#7A8493] hidden md:inline">
              Refreshed {lastRefreshed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}
            </span>
          )}
          <button
            type="button"
            onClick={() => loadDashboardData(true)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3 py-1.5 font-poppins text-[11px] font-bold text-emerald-800 hover:bg-emerald-50 transition active:scale-95 shadow-2xs disabled:opacity-50"
            title="Refresh all metrics from Supabase"
          >
            <span className={isRefreshing ? "animate-spin inline-block" : ""}>🔄</span>
            <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
          </button>
        </div>
      </div>

      {/* ── KPI METRICS CARDS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Total Confirmed Revenue */}
        <div className="rounded-2xl border border-white/70 bg-white/95 p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between text-[#8A94A3] mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Confirmed Revenue</span>
            <span className="text-base">💰</span>
          </div>
          <p className="font-poppins text-xl font-extrabold text-[#0F2044]">
            {fmt(totalRevenue)}
          </p>
          <p className="text-[10px] text-[#7A8493] mt-1">
            {confirmedOrders.length} confirmed trip{confirmedOrders.length === 1 ? "" : "s"}
            {pendingOrders.length > 0 && ` (${pendingOrders.length} pending)`}
          </p>
        </div>

        {/* Total Orders */}
        <div className="rounded-2xl border border-white/70 bg-white/95 p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between text-[#8A94A3] mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Total Orders</span>
            <span className="text-base">🧾</span>
          </div>
          <p className="font-poppins text-xl font-extrabold text-[#0F2044]">
            {orders.length}
          </p>
          <p className="text-[10px] text-[#7A8493] mt-1">
            {totalItemsSold} items · Avg {fmt(averageOrderValue)}
          </p>
        </div>

        {/* Catalog SKUs & Units */}
        <div className="rounded-2xl border border-white/70 bg-white/95 p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between text-[#8A94A3] mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Catalog SKUs</span>
            <span className="text-base">🏷️</span>
          </div>
          <p className="font-poppins text-xl font-extrabold text-[#0F2044]">
            {inventory.length}
          </p>
          <p className="text-[10px] text-[#7A8493] mt-1">
            {availableCatalogSkus} active · {totalStockUnits} total units
          </p>
        </div>

        {/* Low Stock Alerts */}
        <div className={`rounded-2xl border p-4 shadow-sm backdrop-blur-md ${
          allAlertProducts.length > 0
            ? "border-amber-300 bg-amber-50/70"
            : "border-white/70 bg-white/95"
        }`}>
          <div className="flex items-center justify-between text-[#8A94A3] mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900">
              Low Stock Alert
            </span>
            <span className="text-base">⚠️</span>
          </div>
          <p className="font-poppins text-xl font-extrabold text-amber-950">
            {allAlertProducts.length}
          </p>
          <p className="text-[10px] text-amber-800 mt-1">
            {lowStockProducts.length} low · {outOfStockProducts.length} zero stock
          </p>
        </div>

        {/* Security Gate Clearances */}
        <div className="col-span-2 lg:col-span-1 rounded-2xl border border-white/70 bg-white/95 p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between text-[#8A94A3] mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Gate Clearances</span>
            <span className="text-base">🛡️</span>
          </div>
          <p className="font-poppins text-xl font-extrabold text-[#0F2044]">
            {verifiedGateCount}
          </p>
          <p className="text-[10px] text-[#7A8493] mt-1">
            {flaggedGateCount} flagged ({duplicateGateCount} dup, {expiredGateCount} exp)
          </p>
        </div>
      </div>

      {/* ── QUICK ACTIONS TOOLBAR ── */}
      <div className="rounded-2xl border border-white/70 bg-white/95 p-4 shadow-sm backdrop-blur-md space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3]">
          Supermarket Quick Operations
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <button
            type="button"
            onClick={onOpenAddProductModal}
            className="flex items-center justify-center gap-2 rounded-xl bg-[#2E9E44] px-3.5 py-2.5 font-poppins text-xs font-bold text-white shadow-xs hover:bg-[#288B3B] transition active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2E9E44]"
          >
            <span>+</span>
            <span>Add New Product</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab("stock-import")}
            className="flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 font-poppins text-xs font-bold text-emerald-900 hover:bg-emerald-100 transition active:scale-95 shadow-2xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <span>📥</span>
            <span>Smart Stock Import</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab("inventory")}
            className="flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-3.5 py-2.5 font-poppins text-xs font-semibold text-[#0F2044] hover:bg-[#F8F9FA] transition active:scale-95 shadow-2xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#0F2044]"
          >
            <span>📦</span>
            <span>Adjust Inventory</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab("locations")}
            className="flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/70 px-3.5 py-2.5 font-poppins text-xs font-bold text-indigo-900 hover:bg-indigo-100 transition active:scale-95 shadow-2xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-600"
          >
            <span>📍</span>
            <span>Product Locations</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab("transactions")}
            className="flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-3.5 py-2.5 font-poppins text-xs font-semibold text-[#0F2044] hover:bg-[#F8F9FA] transition active:scale-95 shadow-2xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#0F2044]"
          >
            <span>💳</span>
            <span>View Sales ({orders.length})</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab("gate-qr")}
            className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 font-poppins text-xs font-bold text-emerald-900 hover:bg-emerald-100 transition active:scale-95 shadow-2xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <span>🚪</span>
            <span>Gate QR Pass</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab("security")}
            className="flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-3.5 py-2.5 font-poppins text-xs font-semibold text-[#0F2044] hover:bg-[#F8F9FA] transition active:scale-95 shadow-2xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#0F2044]"
          >
            <span>🛡️</span>
            <span>Gate Audit Logs ({securityLogs.length})</span>
          </button>
        </div>

        {/* Smart Stock Import Banner */}
        <div className="rounded-xl border border-emerald-300/80 bg-gradient-to-r from-emerald-50/90 via-teal-50/70 to-white p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#2E9E44] text-sm text-white">
              📥
            </span>
            <div>
              <p className="font-poppins font-bold text-[#0F2044] text-xs leading-tight">
                Smart Stock Import &amp; Barcode Intake
              </p>
              <p className="text-[11px] text-[#7A8493]">
                Receive inventory batches using camera scanner or hardware USB barcode scanner without manual typing.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab("stock-import")}
            className="shrink-0 rounded-lg bg-[#2E9E44] px-3 py-1.5 font-poppins text-[11px] font-bold text-white hover:bg-[#288B3B] transition active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2E9E44]"
          >
            Import Stock →
          </button>
        </div>

        {/* Entrance Gate QR Pass Banner */}
        <div className="rounded-xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50/80 via-teal-50/50 to-white p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#2E9E44] text-sm text-white">
              🚪
            </span>
            <div>
              <p className="font-poppins font-bold text-[#0F2044] text-xs leading-tight">
                Store Entrance Turnstile QR Pass ({selectedStore?.code || "QLM001"})
              </p>
              <p className="text-[11px] text-[#7A8493]">
                Display, print, or download the official turnstile entrance QR code for {selectedStore?.name || "QLess Mart"} turnstiles.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab("gate-qr")}
            className="shrink-0 rounded-lg bg-[#2E9E44] px-3 py-1.5 font-poppins text-[11px] font-bold text-white hover:bg-[#288B3B] transition active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2E9E44]"
          >
            Open Gate Pass →
          </button>
        </div>

        {/* SmartFind Floor Plan Shortcut Banner */}
        <div className="rounded-xl border border-indigo-200/80 bg-gradient-to-r from-indigo-50/80 via-blue-50/60 to-white p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0F2044] text-sm text-white">
              🗺️
            </span>
            <div>
              <p className="font-poppins font-bold text-[#0F2044] text-xs leading-tight">
                SmartFind Floor Plan &amp; Rack Mapping
              </p>
              <p className="text-[11px] text-[#7A8493]">
                Configure aisle gondolas, rack codes, shelf heights, and walking sequences for {targetStoreId}.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab("locations")}
            className="shrink-0 rounded-lg bg-[#0F2044] px-3 py-1.5 font-poppins text-[11px] font-bold text-white hover:bg-[#1A3366] transition active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#0F2044]"
          >
            Manage Locations →
          </button>
        </div>
      </div>

      {/* ── TWO COLUMN SECTION: LOW STOCK WARNINGS & BEST SELLERS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Low Stock Alerts */}
        <div className="rounded-2xl border border-white/70 bg-white/95 p-4 shadow-sm backdrop-blur-md space-y-3">
          <div className="flex items-center justify-between border-b border-black/5 pb-2.5">
            <div className="flex items-center gap-1.5">
              <span className="text-base">⚠️</span>
              <h3 className="font-poppins text-xs font-bold text-[#0F2044]">
                Low Stock Warnings (≤ 10 Units)
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab("inventory")}
              className="text-[11px] font-semibold text-[#2E9E44] hover:underline"
            >
              Manage Stock ({allAlertProducts.length}) →
            </button>
          </div>

          {allAlertProducts.length === 0 ? (
            <div className="p-4 text-center text-[#7A8493]">
              <span className="text-xl block mb-1">✅</span>
              All products currently have healthy stock levels (&gt; 10 units in Supabase).
            </div>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {allAlertProducts.slice(0, 5).map((item) => (
                <div
                  key={item.inventoryId}
                  className="flex items-center justify-between rounded-xl border border-amber-200/80 bg-amber-50/50 p-2.5"
                >
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <span className="text-lg">{item.emoji || "🛍️"}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-[#0F2044] truncate">{item.name}</p>
                      <p className="text-[10px] text-[#7A8493]">
                        {item.category} · {fmt(item.price)}
                        {!item.isAvailable && " · (Marked Unavailable)"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold ${
                      item.stockQuantity === 0
                        ? "bg-red-100 text-red-800"
                        : "bg-amber-100 text-amber-900"
                    }`}>
                      {item.stockQuantity === 0 ? "Out of Stock" : `${item.stockQuantity} left`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Best-Selling Products */}
        <div className="rounded-2xl border border-white/70 bg-white/95 p-4 shadow-sm backdrop-blur-md space-y-3">
          <div className="flex items-center justify-between border-b border-black/5 pb-2.5">
            <div className="flex items-center gap-1.5">
              <span className="text-base">🏆</span>
              <h3 className="font-poppins text-xs font-bold text-[#0F2044]">
                Top Selling Merchandise
              </h3>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3]">
              From Confirmed Orders
            </span>
          </div>

          {bestSellers.length === 0 ? (
            <div className="p-4 text-center text-[#7A8493]">
              <span className="text-xl block mb-1">🛍️</span>
              No items from confirmed sales yet. Completed self-checkout customer orders will compute real-time best sellers here.
            </div>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {bestSellers.map((item, idx) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between rounded-xl border border-black/5 bg-[#F9FAFB] p-2.5"
                >
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#0F2044] text-white text-[10px] font-bold">
                      #{idx + 1}
                    </span>
                    <span className="text-base">{item.emoji}</span>
                    <p className="font-semibold text-[#0F2044] truncate">{item.name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-bold text-[#2E9E44]">{item.count} sold</span>
                    <span className="block text-[10px] text-[#7A8493]">{fmt(item.revenue)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── RECENT LIVE ORDERS TABLE ── */}
      <div className="rounded-2xl border border-white/70 bg-white/95 p-4 shadow-sm backdrop-blur-md space-y-3">
        <div className="flex items-center justify-between border-b border-black/5 pb-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-base">🧾</span>
            <h3 className="font-poppins text-xs font-bold text-[#0F2044]">
              Recent Customer Transactions (Live Supabase)
            </h3>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab("transactions")}
            className="text-[11px] font-semibold text-[#2E9E44] hover:underline"
          >
            All Transactions ({orders.length}) →
          </button>
        </div>

        {orders.length === 0 ? (
          <div className="p-6 text-center text-[#7A8493]">
            <span className="text-2xl block mb-1.5">🛒</span>
            <p className="font-semibold text-[#0F2044]">No Transactions Found</p>
            <p className="text-[11px] mt-0.5">
              Customer orders placed via self-checkout will appear here in real time.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-black/5 text-[10px] font-bold uppercase tracking-wider text-[#8A94A3]">
                  <th className="pb-2">Order Ref</th>
                  <th className="pb-2">Date &amp; Time</th>
                  <th className="pb-2">Items</th>
                  <th className="pb-2">Payment Method</th>
                  <th className="pb-2 text-right">Amount</th>
                  <th className="pb-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {orders.slice(0, 5).map((order) => {
                  const isConfirmed = order.paymentStatus === "CONFIRMED";
                  const isPending = order.paymentStatus === "PENDING";
                  return (
                    <tr key={order.orderId} className="hover:bg-[#F9FAFB]">
                      <td className="py-2.5 font-mono font-bold text-[#0F2044]">{order.orderId}</td>
                      <td className="py-2.5 text-[#7A8493]">{order.paidAt}</td>
                      <td className="py-2.5 font-semibold text-[#0F2044]">{order.itemCount} items</td>
                      <td className="py-2.5">
                        <span className="rounded-md bg-[#F0F2F5] px-2 py-0.5 text-[10px] font-semibold text-[#0F2044]">
                          {order.paymentMethod.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-bold text-[#0F2044]">
                        {fmt(order.finalTotal)}
                      </td>
                      <td className="py-2.5 text-right">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                            isConfirmed
                              ? "bg-emerald-100 text-emerald-800"
                              : isPending
                              ? "bg-amber-100 text-amber-900"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {order.paymentStatus || "PENDING"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── RECENT SECURITY GATE ACTIVITY ── */}
      <div className="rounded-2xl border border-white/70 bg-white/95 p-4 shadow-sm backdrop-blur-md space-y-3">
        <div className="flex items-center justify-between border-b border-black/5 pb-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-base">🛡️</span>
            <h3 className="font-poppins text-xs font-bold text-[#0F2044]">
              Recent Security Gate Verifications (Live Audit Trail)
            </h3>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab("security")}
            className="text-[11px] font-semibold text-[#2E9E44] hover:underline"
          >
            All Security Logs ({securityLogs.length}) →
          </button>
        </div>

        {securityLogs.length === 0 ? (
          <div className="p-4 text-center text-[#7A8493]">
            <span className="text-xl block mb-1">🛡️</span>
            No gate verification events logged yet for {targetStoreId}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-black/5 text-[10px] font-bold uppercase tracking-wider text-[#8A94A3]">
                  <th className="pb-2">Timestamp</th>
                  <th className="pb-2">Terminal</th>
                  <th className="pb-2">Order / Pass Ref</th>
                  <th className="pb-2">Outcome</th>
                  <th className="pb-2 text-right">Reason / Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {securityLogs.slice(0, 5).map((log) => {
                  const isSuccess = log.outcome === "success";
                  const isWarning = log.outcome === "duplicate_warning";
                  return (
                    <tr key={log.id} className="hover:bg-[#F9FAFB]">
                      <td className="py-2 text-[#7A8493]">{log.timestamp}</td>
                      <td className="py-2 font-mono text-[#0F2044]">{log.terminalId}</td>
                      <td className="py-2 font-mono font-bold text-[#0F2044]">{log.orderId || log.scannedPayload || "N/A"}</td>
                      <td className="py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                            isSuccess
                              ? "bg-emerald-100 text-emerald-800"
                              : isWarning
                              ? "bg-amber-100 text-amber-900"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {log.outcome.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2 text-right text-[11px] text-[#7A8493]">
                        {log.failureReason || log.discrepancyNote || (isSuccess ? "Gate Opened" : "None")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
