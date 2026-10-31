import { useState, useEffect, useCallback, useMemo } from "react";
import { AdminTab, CompletedOrder, Product, StockFilter, SupermarketStore, VerificationLogEntry } from "../../types";
import { fmt } from "../../utils/formatters";
import { fetchAdminInventory, AdminInventoryItem, adjustAdminStock } from "../../services/adminInventoryService";
import { fetchAdminOrders } from "../../services/adminOrderService";
import { fetchAdminSecurityLogs, LiveSecurityLogEntry } from "../../services/adminSecurityService";
import { LAUNCH_STORE_ID } from "../../config/storeConfig";
import { AdminCouponsModal } from "./AdminCouponsModal";
import { SalesPerformanceChart } from "./analytics/SalesPerformanceChart";
import { InventoryDoughnutChart } from "./analytics/InventoryDoughnutChart";
import { OrderStatusDistribution } from "./analytics/OrderStatusDistribution";

interface AdminOverviewTabProps {
  storeId?: string;
  catalog?: Product[];
  orderHistory?: CompletedOrder[];
  verificationLogs?: VerificationLogEntry[];
  selectedStore: SupermarketStore | null;
  onNavigateTab: (tab: AdminTab, options?: { stockFilter?: StockFilter; orderStatusFilter?: string }) => void;
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
  const [isCouponsModalOpen, setIsCouponsModalOpen] = useState<boolean>(false);
  const [inspectingOrder, setInspectingOrder] = useState<CompletedOrder | null>(null);
  const [restockingId, setRestockingId] = useState<number | null>(null);

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

  // Quick restocking directly from Dashboard Operational Insights
  const handleQuickRestock = async (item: AdminInventoryItem, delta: number) => {
    if (restockingId !== null) return;
    setRestockingId(item.productId);
    const res = await adjustAdminStock(targetStoreId, item.productId, delta, item.updatedAt);
    if (res.success && res.item) {
      const updated = res.item;
      setInventory((prev) =>
        prev.map((p) => (p.productId === updated.productId ? updated : p))
      );
    }
    setRestockingId(null);
  };

  // ── ORDER & REVENUE METRICS ──
  const confirmedOrders = useMemo(() => {
    return orders.filter((o) => (o.paymentStatus || "").toUpperCase() === "CONFIRMED");
  }, [orders]);

  const pendingOrders = useMemo(() => {
    return orders.filter((o) => (o.paymentStatus || "PENDING").toUpperCase() === "PENDING");
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

  // ── INVENTORY METRICS ──
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

  // ── SECURITY METRICS ──
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
    const countsMap: Record<number, { name: string; emoji: string; count: number; revenue: number; category?: string }> = {};
    for (const order of confirmedOrders) {
      for (const item of order.items) {
        if (!countsMap[item.id]) {
          countsMap[item.id] = {
            name: item.name,
            emoji: item.emoji || "🛍️",
            count: 0,
            revenue: 0,
            category: item.category,
          };
        }
        countsMap[item.id].count += item.quantity;
        countsMap[item.id].revenue += item.price * item.quantity;
      }
    }

    return Object.values(countsMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [confirmedOrders]);

  // Render loading state
  if (isLoading) {
    return (
      <div className="space-y-4 qless-fade-in text-xs">
        <div className="rounded-2xl border border-blue-200/80 bg-blue-50/70 p-4 text-blue-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <div>
              <p className="font-poppins font-bold text-xs">Connecting to Supabase Live Overview...</p>
              <p className="text-[11px] text-blue-800">
                Aggregating authoritative inventory, confirmed orders, and gate audit logs for {targetStoreId}.
              </p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-28 rounded-2xl border border-slate-200/70 bg-white animate-pulse p-4" />
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
                Database queries to Supabase failed. Fallback zeroes are not fabricated.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => loadDashboardData(false)}
            className="rounded-xl bg-red-600 px-4 py-2 font-poppins text-xs font-bold text-white hover:bg-red-700 transition active:scale-95 shadow-xs shrink-0 cursor-pointer"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 qless-fade-in text-xs">
      {/* ── FILTER & OPERATIONAL TOOLBAR ── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Node & Refresh info */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 text-xs font-bold shrink-0">
            🟢
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-poppins font-bold text-xs text-[#0F2044] truncate">
                {selectedStore?.name || "QLess Mart"} Operations
              </span>
              <span className="rounded-full bg-emerald-50 border border-emerald-200/80 px-2 py-0.2 text-[9.5px] font-bold uppercase tracking-wider text-emerald-800">
                Live Data
              </span>
            </div>
            <p className="text-[10.5px] text-slate-500 truncate">
              {lastRefreshed
                ? `Synchronized at ${lastRefreshed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}`
                : "Authoritative metrics loaded directly from Supabase tables"}
            </p>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={onOpenAddProductModal}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#2E9E44] px-3 py-1.5 font-poppins text-xs font-bold text-white shadow-2xs hover:bg-[#288B3B] transition active:scale-95 cursor-pointer"
          >
            <span>+</span>
            <span>Add Product</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab("inventory", { stockFilter: "alerts" })}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50/70 px-3 py-1.5 font-poppins text-xs font-bold text-amber-950 hover:bg-amber-100 transition active:scale-95 shadow-2xs cursor-pointer"
          >
            <span>📦</span>
            <span>Restock Inventory</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCouponsModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-poppins text-xs font-semibold text-[#0F2044] hover:bg-slate-50 transition active:scale-95 shadow-2xs cursor-pointer"
          >
            <span>🏷️</span>
            <span>Promos &amp; Coupons</span>
          </button>

          <button
            type="button"
            onClick={() => loadDashboardData(true)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-poppins text-xs font-semibold text-slate-600 hover:text-[#0F2044] hover:bg-slate-50 transition active:scale-95 shadow-2xs disabled:opacity-50 cursor-pointer"
            title="Refresh overview metrics"
          >
            <span className={isRefreshing ? "animate-spin inline-block text-emerald-600" : ""}>🔄</span>
            <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
          </button>
        </div>
      </div>

      {/* ── KPI METRICS CARDS (5 ESSENTIAL EXECUTIVE METRICS) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* 1. Today's Sales */}
        <button
          type="button"
          onClick={() => onNavigateTab("transactions", { orderStatusFilter: "CONFIRMED" })}
          className="w-full text-left rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs flex flex-col justify-between min-h-[125px] hover:border-emerald-300 hover:shadow-md transition active:scale-[0.99] group cursor-pointer"
          title="Click to view confirmed customer transactions"
        >
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Today's Sales
              </span>
              <span className="text-base group-hover:scale-110 transition">💰</span>
            </div>
            <p className="font-poppins text-xl font-extrabold text-[#0F2044]">
              {fmt(totalRevenue)}
            </p>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2 pt-1.5 border-t border-slate-100">
            <span>{confirmedOrders.length} confirmed order{confirmedOrders.length === 1 ? "" : "s"}</span>
            <span className="text-emerald-600 font-bold group-hover:translate-x-0.5 transition">View →</span>
          </div>
        </button>

        {/* 2. Total Orders */}
        <button
          type="button"
          onClick={() => onNavigateTab("transactions", { orderStatusFilter: "all" })}
          className="w-full text-left rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs flex flex-col justify-between min-h-[125px] hover:border-[#0F2044]/30 hover:shadow-md transition active:scale-[0.99] group cursor-pointer"
          title="Click to view all orders and receipts"
        >
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Total Orders
              </span>
              <span className="text-base group-hover:scale-110 transition">🧾</span>
            </div>
            <p className="font-poppins text-xl font-extrabold text-[#0F2044]">
              {orders.length}
            </p>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2 pt-1.5 border-t border-slate-100">
            <span className="truncate">{totalItemsSold} items · Avg {fmt(averageOrderValue)}</span>
            <span className="text-[#0F2044] font-bold group-hover:translate-x-0.5 transition shrink-0 ml-1">View →</span>
          </div>
        </button>

        {/* 3. Pending Orders */}
        <button
          type="button"
          onClick={() => onNavigateTab("transactions", { orderStatusFilter: "PENDING" })}
          className={`w-full text-left rounded-2xl border p-4 shadow-xs flex flex-col justify-between min-h-[125px] transition active:scale-[0.99] group cursor-pointer ${
            pendingOrders.length > 0
              ? "border-amber-300 bg-amber-50/70 hover:border-amber-400 hover:shadow-md"
              : "border-slate-200/80 bg-white hover:border-[#0F2044]/30 hover:shadow-md"
          }`}
          title="Click to view pending orders requiring cashier checkout or settlement"
        >
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${pendingOrders.length > 0 ? "text-amber-900" : "text-slate-400"}`}>
                Pending Orders
              </span>
              <span className="text-base group-hover:scale-110 transition">⏳</span>
            </div>
            <p className={`font-poppins text-xl font-extrabold ${pendingOrders.length > 0 ? "text-amber-950" : "text-[#0F2044]"}`}>
              {pendingOrders.length}
            </p>
          </div>
          <div className="flex items-center justify-between text-[10px] mt-2 pt-1.5 border-t border-slate-100">
            <span className={`truncate font-semibold ${pendingOrders.length > 0 ? "text-amber-900" : "text-slate-500"}`}>
              {pendingOrders.length > 0 ? "Awaiting cashier checkout" : "All orders cleared"}
            </span>
            <span className={`font-bold group-hover:translate-x-0.5 transition shrink-0 ml-1 ${pendingOrders.length > 0 ? "text-amber-900" : "text-slate-500"}`}>
              Filter →
            </span>
          </div>
        </button>

        {/* 4. Low Stock Alerts */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => onNavigateTab("inventory", { stockFilter: "alerts" })}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onNavigateTab("inventory", { stockFilter: "alerts" });
            }
          }}
          className={`w-full text-left rounded-2xl border p-4 shadow-xs flex flex-col justify-between min-h-[125px] cursor-pointer transition active:scale-[0.99] group ${
            allAlertProducts.length > 0
              ? "border-amber-300 bg-amber-50/70 hover:border-amber-400 hover:shadow-md"
              : "border-slate-200/80 bg-white hover:border-emerald-300 hover:shadow-md"
          }`}
          title="Click to view all products requiring restocking in Stock & Inventory"
        >
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900">
                Low Stock Alerts
              </span>
              <span className="text-base group-hover:scale-110 transition">⚠️</span>
            </div>
            <div className="flex items-baseline justify-between">
              <p className="font-poppins text-xl font-extrabold text-amber-950">
                {allAlertProducts.length}
              </p>
              <span className="text-[10px] font-bold text-amber-900 group-hover:underline">
                Restock →
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 mt-2 pt-1.5 border-t border-slate-100 flex-wrap">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigateTab("inventory", { stockFilter: "low_stock" });
              }}
              className="inline-flex items-center gap-1 rounded-md bg-amber-200/70 hover:bg-amber-300/80 px-2 py-0.5 text-[10px] font-bold text-amber-950 transition active:scale-95 cursor-pointer"
              title="Filter to products with stock between 1 and 10"
            >
              <span>{lowStockProducts.length} low</span>
              <span className="text-[9px]">→</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigateTab("inventory", { stockFilter: "out_of_stock" });
              }}
              className="inline-flex items-center gap-1 rounded-md bg-red-100 hover:bg-red-200 px-2 py-0.5 text-[10px] font-bold text-red-900 transition active:scale-95 cursor-pointer"
              title="Filter to products with zero stock"
            >
              <span>{outOfStockProducts.length} zero stock</span>
              <span className="text-[9px]">→</span>
            </button>
          </div>
        </div>

        {/* 5. Total Products */}
        <button
          type="button"
          onClick={() => onNavigateTab("products")}
          className="col-span-2 lg:col-span-1 w-full text-left rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs flex flex-col justify-between min-h-[125px] hover:border-[#0F2044]/30 hover:shadow-md transition active:scale-[0.99] group cursor-pointer"
          title="Click to view and edit products in catalog"
        >
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Total Products
              </span>
              <span className="text-base group-hover:scale-110 transition">🏷️</span>
            </div>
            <p className="font-poppins text-xl font-extrabold text-[#0F2044]">
              {inventory.length}
            </p>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2 pt-1.5 border-t border-slate-100">
            <span className="truncate">{availableCatalogSkus} active · {totalStockUnits} units</span>
            <span className="text-[#0F2044] font-bold group-hover:translate-x-0.5 transition shrink-0 ml-1">Catalog →</span>
          </div>
        </button>
      </div>

      {/* ── ANALYTICS SECTION: TWO COLUMNS (SALES + INVENTORY DISTRIBUTION) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Sales Performance Area/Line Chart (7 cols) */}
        <div className="lg:col-span-7">
          <SalesPerformanceChart orders={orders} />
        </div>

        {/* Right Column: Inventory Doughnut & Order Status (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <InventoryDoughnutChart
            inventory={inventory}
            onSelectStockFilter={(filter) => onNavigateTab("inventory", { stockFilter: filter })}
          />
          <OrderStatusDistribution
            orders={orders}
            onSelectStatusFilter={(status) => onNavigateTab("transactions", { orderStatusFilter: status })}
          />
        </div>
      </div>

      {/* ── OPERATIONAL INSIGHTS GRID ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* A. Restocking Alerts Table */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-50 text-amber-600 text-xs font-bold">
                ⚠️
              </span>
              <div>
                <h3 className="font-poppins text-xs font-bold text-[#0F2044]">
                  Restocking Alerts ({allAlertProducts.length})
                </h3>
                <p className="text-[10px] text-slate-400">Products requiring shelf replenishment</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab("inventory", { stockFilter: "alerts" })}
              className="text-[11px] font-bold text-[#2E9E44] hover:underline cursor-pointer"
            >
              All Alerts →
            </button>
          </div>

          {allAlertProducts.length === 0 ? (
            <div className="py-8 text-center text-slate-400">
              <span className="text-xl block mb-1">✅</span>
              <p className="font-semibold text-slate-600">All Shelves Fully Stocked</p>
              <p className="text-[10px]">All products currently have &gt; 10 units in Supabase inventory.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {allAlertProducts.slice(0, 5).map((item) => {
                const isOut = item.stockQuantity === 0;
                const isMutating = restockingId === item.productId;
                return (
                  <div
                    key={item.inventoryId}
                    className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 p-2.5 hover:bg-slate-50 transition"
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <span className="text-lg shrink-0">{item.emoji || "🛍️"}</span>
                      <div className="min-w-0">
                        <p className="font-bold text-[#0F2044] truncate">{item.name}</p>
                        <p className="text-[10px] text-slate-400">
                          {item.category} · {fmt(item.price)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`inline-block rounded-md px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider ${
                          isOut ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {isOut ? "Out of Stock" : `${item.stockQuantity} left`}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleQuickRestock(item, 20)}
                        disabled={isMutating}
                        className="rounded-lg bg-[#2E9E44] px-2 py-1 text-[10px] font-bold text-white hover:bg-[#288B3B] transition shadow-2xs disabled:opacity-50 cursor-pointer"
                        title="Quick restock +20 units in Supabase"
                      >
                        {isMutating ? "..." : "+20"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* B. Top-Selling Merchandise */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 text-xs font-bold">
                🏆
              </span>
              <div>
                <h3 className="font-poppins text-xs font-bold text-[#0F2044]">
                  Top Selling Merchandise
                </h3>
                <p className="text-[10px] text-slate-400">Calculated from confirmed self-checkout orders</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab("transactions", { orderStatusFilter: "CONFIRMED" })}
              className="text-[11px] font-bold text-[#2E9E44] hover:underline cursor-pointer"
            >
              View Sales →
            </button>
          </div>

          {bestSellers.length === 0 ? (
            <div className="py-8 text-center text-slate-400">
              <span className="text-xl block mb-1">🛍️</span>
              <p className="font-semibold text-slate-600">No Sales Completed Yet</p>
              <p className="text-[10px]">Confirmed transactions will dynamically populate best seller velocity.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {bestSellers.map((item, idx) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 p-2.5"
                >
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#0F2044] text-white text-[10px] font-bold shrink-0">
                      #{idx + 1}
                    </span>
                    <span className="text-base shrink-0">{item.emoji}</span>
                    <p className="font-bold text-[#0F2044] truncate">{item.name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-bold text-emerald-600">{item.count} sold</span>
                    <span className="block text-[10px] text-slate-400">{fmt(item.revenue)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── RECENT ORDERS & SECURITY ACTIVITY (TWO COLUMNS) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Transactions Table */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 text-blue-600 text-xs font-bold">
                🧾
              </span>
              <div>
                <h3 className="font-poppins text-xs font-bold text-[#0F2044]">
                  Recent Customer Transactions
                </h3>
                <p className="text-[10px] text-slate-400">Live order records from public.orders</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab("transactions")}
              className="text-[11px] font-bold text-[#2E9E44] hover:underline cursor-pointer"
            >
              All Orders ({orders.length}) →
            </button>
          </div>

          {orders.length === 0 ? (
            <div className="py-8 text-center text-slate-400">
              <span className="text-xl block mb-1">🛒</span>
              <p className="font-semibold text-slate-600">No Transactions Yet</p>
              <p className="text-[10px]">Customer self-checkout orders will stream here in real time.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[440px]">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="pb-2">Order Ref</th>
                    <th className="pb-2">Method</th>
                    <th className="pb-2 text-right">Amount</th>
                    <th className="pb-2 text-right">Status</th>
                    <th className="pb-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.slice(0, 5).map((order) => {
                    const isConfirmed = order.paymentStatus === "CONFIRMED";
                    const isPending = order.paymentStatus === "PENDING";
                    return (
                      <tr key={order.orderId} className="hover:bg-slate-50 transition">
                        <td className="py-2.5 font-mono font-bold text-[#0F2044]">{order.orderId}</td>
                        <td className="py-2.5">
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[9.5px] font-bold text-slate-700">
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
                        <td className="py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => setInspectingOrder(order)}
                            className="text-[10.5px] font-bold text-emerald-600 hover:underline cursor-pointer"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Turnstile Security Activity Table */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 text-xs font-bold">
                🛡️
              </span>
              <div>
                <h3 className="font-poppins text-xs font-bold text-[#0F2044]">
                  Turnstile Security Activity
                </h3>
                <p className="text-[10px] text-slate-400">
                  {verifiedGateCount} cleared · {flaggedGateCount} flagged ({duplicateGateCount} duplicate, {expiredGateCount} expired)
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab("security")}
              className="text-[11px] font-bold text-[#2E9E44] hover:underline cursor-pointer"
            >
              All Logs ({securityLogs.length}) →
            </button>
          </div>

          {securityLogs.length === 0 ? (
            <div className="py-8 text-center text-slate-400">
              <span className="text-xl block mb-1">🛡️</span>
              <p className="font-semibold text-slate-600">No Gate Events Logged Yet</p>
              <p className="text-[10px]">Turnstile scans by security guards will log verified and flagged events here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[440px]">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="pb-2">Time</th>
                    <th className="pb-2">Terminal</th>
                    <th className="pb-2">Pass Ref</th>
                    <th className="pb-2 text-right">Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {securityLogs.slice(0, 5).map((log) => {
                    const isSuccess = log.outcome === "success";
                    const isWarning = log.outcome === "duplicate_warning";
                    return (
                      <tr key={log.id} className="hover:bg-slate-50 transition">
                        <td className="py-2.5 text-slate-400 text-[10.5px]">{log.timestamp}</td>
                        <td className="py-2.5 font-mono text-slate-700 font-bold">{log.terminalId}</td>
                        <td className="py-2.5 font-mono font-bold text-[#0F2044] truncate max-w-[120px]">
                          {log.orderId || log.scannedPayload || "N/A"}
                        </td>
                        <td className="py-2.5 text-right">
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── ORDER DETAILS INSPECTION MODAL ── */}
      {inspectingOrder && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2044]/60 p-4 backdrop-blur-xs qless-fade-in"
        >
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl space-y-4 qless-scale-in max-h-[90vh] overflow-y-auto text-xs">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-poppins text-base font-bold text-[#0F2044]">
                  Transaction Details
                </h3>
                <p className="font-mono text-slate-400 text-[11px] mt-0.5">
                  Order ID: {inspectingOrder.orderId}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectingOrder(null)}
                className="h-8 w-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 hover:bg-slate-200 flex items-center justify-center transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Status & Payment strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 rounded-2xl bg-slate-50 p-3 border border-slate-100">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Status</span>
                <span className="font-bold text-emerald-700">{inspectingOrder.paymentStatus || "CONFIRMED"}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Payment Method</span>
                <span className="font-bold text-[#0F2044] uppercase">{inspectingOrder.paymentMethod}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Paid</span>
                <span className="font-poppins font-extrabold text-[#2E9E44]">{fmt(inspectingOrder.finalTotal)}</span>
              </div>
            </div>

            {/* Items List */}
            <div className="space-y-2">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
                Purchased Items ({inspectingOrder.itemCount})
              </p>
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                {inspectingOrder.items.map((it, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 bg-white">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{it.emoji || "🛍️"}</span>
                      <div>
                        <p className="font-bold text-[#0F2044]">{it.name}</p>
                        <p className="text-[10px] text-slate-400">
                          {fmt(it.price)} × {it.quantity}
                        </p>
                      </div>
                    </div>
                    <span className="font-bold text-[#0F2044]">{fmt(it.price * it.quantity)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Reconciliation */}
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-100 space-y-1.5 text-[11px]">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span>{fmt(inspectingOrder.subtotal)}</span>
              </div>
              {inspectingOrder.couponDiscount > 0 && (
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>Coupon Discount ({inspectingOrder.couponCode}):</span>
                  <span>-{fmt(inspectingOrder.couponDiscount)}</span>
                </div>
              )}
              {inspectingOrder.taxTotal > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Taxes:</span>
                  <span>{fmt(inspectingOrder.taxTotal)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-sm text-[#0F2044] pt-1.5 border-t border-slate-200">
                <span>Final Total:</span>
                <span className="text-[#2E9E44]">{fmt(inspectingOrder.finalTotal)}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setInspectingOrder(null)}
                className="rounded-xl bg-[#0F2044] px-4 py-2 font-bold text-white hover:bg-[#1A3163] transition cursor-pointer"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Coupons Modal */}
      <AdminCouponsModal
        isOpen={isCouponsModalOpen}
        onClose={() => setIsCouponsModalOpen(false)}
      />
    </div>
  );
}
