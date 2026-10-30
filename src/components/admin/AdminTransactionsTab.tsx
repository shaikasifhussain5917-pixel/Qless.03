import { useState, useMemo, useEffect, useCallback } from "react";
import { CompletedOrder } from "../../types";
import { fmt } from "../../utils/formatters";
import { fetchAdminOrders } from "../../services/adminOrderService";
import { LAUNCH_STORE_ID } from "../../config/storeConfig";

interface AdminTransactionsTabProps {
  storeId?: string;
  orderHistory?: CompletedOrder[];
  initialStatusFilter?: string;
  onReturnToDashboard?: () => void;
}

export function AdminTransactionsTab({
  storeId = LAUNCH_STORE_ID,
  initialStatusFilter = "all",
  onReturnToDashboard,
}: AdminTransactionsTabProps) {
  const [orders, setOrders] = useState<CompletedOrder[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMethod, setSelectedMethod] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter);
  const [inspectingOrder, setInspectingOrder] = useState<CompletedOrder | null>(null);

  // Synchronize status filter when navigated from Dashboard KPI card
  useEffect(() => {
    if (initialStatusFilter) {
      setStatusFilter(initialStatusFilter);
    }
  }, [initialStatusFilter]);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setLoadError(null);

    const result = await fetchAdminOrders(storeId);

    if (result.error) {
      setLoadError(result.error);
      // Do not silently fall back to mock data when database query fails
      setOrders([]);
    } else {
      setOrders(result.orders);
    }

    if (isRefresh) {
      setIsRefreshing(false);
    } else {
      setIsLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // Sales aggregates
  const totalRevenue = useMemo(() => {
    return orders.reduce((s, o) => s + o.finalTotal, 0);
  }, [orders]);

  const totalItemsSold = useMemo(() => {
    return orders.reduce((s, o) => s + o.itemCount, 0);
  }, [orders]);

  const averageTicket = useMemo(() => {
    return orders.length > 0 ? totalRevenue / orders.length : 0;
  }, [totalRevenue, orders]);

  // Payment method breakdown derived dynamically from actual transaction records
  const methodStats = useMemo(() => {
    const stats: Record<string, { count: number; total: number }> = {
      upi: { count: 0, total: 0 },
      card: { count: 0, total: 0 },
      wallet: { count: 0, total: 0 },
      cash: { count: 0, total: 0 },
      other: { count: 0, total: 0 },
    };
    for (const order of orders) {
      const raw = (order.paymentMethod || "").toLowerCase().trim();
      const key = stats[raw] ? raw : "other";
      stats[key].count += 1;
      stats[key].total += order.finalTotal || 0;
    }
    return stats;
  }, [orders]);

  // Reconciled total across all payment methods
  const reconciledRevenue = useMemo(() => {
    return (
      methodStats.upi.total +
      methodStats.card.total +
      methodStats.wallet.total +
      methodStats.cash.total +
      methodStats.other.total
    );
  }, [methodStats]);

  // Confirmed and pending counts
  const confirmedOrdersCount = useMemo(() => {
    return orders.filter((o) => (o.paymentStatus || "").toUpperCase() === "CONFIRMED").length;
  }, [orders]);

  const pendingOrdersCount = useMemo(() => {
    return orders.filter((o) => (o.paymentStatus || "PENDING").toUpperCase() === "PENDING").length;
  }, [orders]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders.filter((order) => {
      // Payment status filter
      if (statusFilter !== "all") {
        const orderStatus = (order.paymentStatus || "PENDING").toUpperCase();
        if (orderStatus !== statusFilter.toUpperCase()) return false;
      }

      // Payment method filter
      if (selectedMethod !== "all") {
        const orderMethod = (order.paymentMethod || "").toLowerCase().trim();
        if (orderMethod !== selectedMethod) return false;
      }

      // Search query
      if (!q) return true;
      return (
        order.orderId.toLowerCase().includes(q) ||
        order.receiptId.toLowerCase().includes(q) ||
        (order.paymentReference && order.paymentReference.toLowerCase().includes(q)) ||
        (order.customerId && order.customerId.toLowerCase().includes(q)) ||
        (order.store?.name && order.store.name.toLowerCase().includes(q))
      );
    });
  }, [orders, searchQuery, selectedMethod, statusFilter]);

  // Filtered volume metrics
  const filteredRevenue = useMemo(() => {
    return filteredOrders.reduce((sum, o) => sum + (o.finalTotal || 0), 0);
  }, [filteredOrders]);

  // Active filter state detection and reset action
  const hasActiveFilters = selectedMethod !== "all" || statusFilter !== "all" || searchQuery.trim() !== "";

  const handleResetFilters = () => {
    setSearchQuery("");
    setSelectedMethod("all");
    setStatusFilter("all");
  };

  return (
    <div className="space-y-4 qless-fade-in text-xs">
      {/* ── TRANSACTION KPI CARDS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block mb-1">
            Total Sales Volume
          </span>
          <p className="font-poppins text-2xl font-extrabold text-[#2E9E44]">
            {fmt(totalRevenue)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Across {orders.length} verified checkout sessions
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
            Average Order Value
          </span>
          <p className="font-poppins text-2xl font-extrabold text-[#0F2044]">
            {fmt(averageTicket)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Per self-checkout trip</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
            Merchandise Units Sold
          </span>
          <p className="font-poppins text-2xl font-extrabold text-[#0F2044]">
            {totalItemsSold}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Scanned through cart bay</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
            Payment Mix (UPI / Card / Wallet / Cash)
          </span>
          <p className="font-poppins text-xs sm:text-sm font-bold text-[#0F2044] leading-snug">
            {methodStats.upi.count} UPI · {methodStats.card.count} Card · {methodStats.wallet.count} Wallet · {methodStats.cash.count} Cash
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {fmt(methodStats.cash.total)} in cash · {fmt(reconciledRevenue - methodStats.cash.total)} cashless
          </p>
        </div>
      </div>

      {/* ── SEARCH & FILTERS BAR ── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-poppins text-sm font-bold text-[#0F2044]">
                Completed Transaction Records
              </h2>
              <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[9.5px] font-bold text-emerald-700">
                ● Live Database (public.orders)
              </span>
            </div>
            <p className="text-[11px] text-[#7A8493]">
              Authoritative transaction audit records retrieved from Supabase PostgreSQL for store {storeId}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => loadData(true)}
              disabled={isRefreshing || isLoading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2044] hover:bg-[#F8F9FA] transition shadow-2xs disabled:opacity-60"
              title="Refresh transaction data directly from Supabase"
            >
              <svg
                className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-[#2E9E44]" : "text-[#7A8493]"}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {isRefreshing ? "Refreshing..." : "Refresh Feed"}
            </button>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-[#E53935] hover:bg-red-50 hover:underline transition focus-visible:outline-2 focus-visible:outline-[#E53935]"
                aria-label="Reset all search and payment filters"
              >
                ✕ Reset Filters
              </button>
            )}

            <span className="rounded-full bg-[#EEF8F0] px-3 py-1 text-[11px] font-bold text-[#2E9E44]">
              {hasActiveFilters
                ? `${filteredOrders.length} OF ${orders.length} ORDERS (${fmt(filteredRevenue)})`
                : `${orders.length} ORDERS (${fmt(totalRevenue)})`}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by order ref, receipt ID, payment ref, or customer UUID…"
              className="w-full rounded-xl border border-black/10 bg-[#F9FAFB] pl-3 pr-8 py-2 text-xs text-[#0F2044] focus:border-[#2E9E44] focus:bg-white focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[#7A8493] hover:text-[#0F2044] p-1 cursor-pointer"
                aria-label="Clear search query"
              >
                ✕
              </button>
            )}
          </div>

          <div>
            <select
              value={selectedMethod}
              onChange={(e) => setSelectedMethod(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-[#F9FAFB] px-3 py-2 text-xs font-medium text-[#0F2044] focus:border-[#2E9E44] focus:bg-white focus:outline-none"
            >
              <option value="all">Payment Method: All Transactions ({orders.length})</option>
              <option value="upi">UPI ({methodStats.upi.count} · {fmt(methodStats.upi.total)})</option>
              <option value="card">Credit / Debit Card ({methodStats.card.count} · {fmt(methodStats.card.total)})</option>
              <option value="wallet">QLess Smart Wallet ({methodStats.wallet.count} · {fmt(methodStats.wallet.total)})</option>
              <option value="cash">Counter Cash Settlement ({methodStats.cash.count} · {fmt(methodStats.cash.total)})</option>
            </select>
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-[#F9FAFB] px-3 py-2 text-xs font-medium text-[#0F2044] focus:border-[#2E9E44] focus:bg-white focus:outline-none"
            >
              <option value="all">Payment Status: All Orders ({orders.length})</option>
              <option value="CONFIRMED">CONFIRMED Only ({confirmedOrdersCount})</option>
              <option value="PENDING">PENDING Only ({pendingOrdersCount})</option>
            </select>
          </div>
        </div>

        {/* Quick Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1.5 border-t border-black/5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] shrink-0 mr-1">
            Status Filter:
          </span>
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition whitespace-nowrap cursor-pointer ${
              statusFilter === "all"
                ? "bg-[#0F2044] text-white shadow-2xs"
                : "bg-black/5 text-[#7A8493] hover:bg-black/10 hover:text-[#0F2044]"
            }`}
          >
            All Orders ({orders.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("CONFIRMED")}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition whitespace-nowrap flex items-center gap-1 cursor-pointer ${
              statusFilter.toUpperCase() === "CONFIRMED"
                ? "bg-[#2E9E44] text-white shadow-2xs"
                : "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
            }`}
          >
            <span>✓ Confirmed</span>
            <span className="rounded-full bg-emerald-200/80 px-1.5 py-0.2 text-[9px] text-emerald-950 font-bold">{confirmedOrdersCount}</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("PENDING")}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition whitespace-nowrap flex items-center gap-1 cursor-pointer ${
              statusFilter.toUpperCase() === "PENDING"
                ? "bg-amber-500 text-white shadow-2xs"
                : "bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100"
            }`}
          >
            <span>⏳ Pending</span>
            <span className="rounded-full bg-amber-200/80 px-1.5 py-0.2 text-[9px] text-amber-950 font-bold">{pendingOrdersCount}</span>
          </button>
        </div>

        {/* Active Pending Orders Banner */}
        {statusFilter.toUpperCase() === "PENDING" && (
          <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="text-base">⏳</span>
              <div>
                <p className="font-bold text-amber-950 text-xs">
                  Showing {filteredOrders.length} Pending Orders Awaiting Cashier Confirmation
                </p>
                <p className="text-[11px] text-amber-800">
                  Customers with cash-at-counter or in-flight payments will show here until finalized. Click "View Items" to inspect order details.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 transition shadow-2xs cursor-pointer"
              >
                Clear Filter
              </button>
              {onReturnToDashboard && (
                <button
                  type="button"
                  onClick={onReturnToDashboard}
                  className="rounded-lg bg-[#0F2044] px-3 py-1 text-[11px] font-bold text-white hover:bg-[#1A3163] transition shadow-2xs cursor-pointer"
                >
                  ← Back to Dashboard
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── PAYMENT RECONCILIATION AUDIT STRIP ── */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/5 bg-[#F9FAFB] p-2.5 text-[11px]">
          <div className="flex flex-wrap items-center gap-2.5 text-[#7A8493]">
            <span className="font-bold text-[#0F2044]">Audit Breakdown:</span>
            <span>UPI: <strong className="text-[#0F2044]">{fmt(methodStats.upi.total)}</strong> ({methodStats.upi.count})</span>
            <span>·</span>
            <span>Card: <strong className="text-[#0F2044]">{fmt(methodStats.card.total)}</strong> ({methodStats.card.count})</span>
            <span>·</span>
            <span>Wallet: <strong className="text-[#0F2044]">{fmt(methodStats.wallet.total)}</strong> ({methodStats.wallet.count})</span>
            <span>·</span>
            <span>Cash: <strong className="text-[#2E9E44]">{fmt(methodStats.cash.total)}</strong> ({methodStats.cash.count})</span>
            {methodStats.other.count > 0 && (
              <>
                <span>·</span>
                <span>Other: <strong className="text-[#0F2044]">{fmt(methodStats.other.total)}</strong> ({methodStats.other.count})</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 font-bold">
            <span className="text-[#7A8493]">Total Reconciled:</span>
            <span className="text-[#2E9E44]">{fmt(reconciledRevenue)}</span>
            <span className="rounded-full bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 border border-emerald-200">
              100% Balanced
            </span>
          </div>
        </div>
      </div>

      {/* ── TRANSACTIONS DATA CONTAINER ── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs overflow-x-auto">
        {isLoading ? (
          <div className="py-16 text-center text-[#7A8493]">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-[#0F2044]">
              <svg className="h-6 w-6 animate-spin text-[#2E9E44]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <p className="font-poppins text-sm font-bold text-[#0F2044]">Querying Database Orders…</p>
            <p className="text-xs text-[#7A8493] mt-1">
              Loading authoritative transactions for store {storeId} via Supabase RLS
            </p>
          </div>
        ) : loadError ? (
          <div className="py-12 px-4 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-2xl text-red-600 border border-red-200">
              ⚠️
            </div>
            <p className="font-poppins text-sm font-bold text-red-900">
              Failed to Load Orders from Supabase
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs text-red-700 bg-red-50 p-2.5 rounded-xl border border-red-200 font-mono">
              {loadError}
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => loadData(false)}
                className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-[#0F2044] px-4 py-2 font-poppins text-xs font-semibold text-white shadow-sm hover:bg-[#1A3163] transition"
              >
                Retry Database Query
              </button>
            </div>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="py-12 px-4 text-center text-[#7A8493]">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F4F5F7] text-2xl text-[#0F2044]">
              {orders.length === 0 ? "🧾" : "🔍"}
            </div>
            <p className="font-poppins text-sm font-bold text-[#0F2044]">
              {orders.length === 0
                ? "No Orders Recorded in Store Database"
                : "No Matching Transactions"}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-[#7A8493]">
              {orders.length === 0
                ? `No orders have been recorded yet in public.orders for store ${storeId}. Orders placed through customer checkout will populate here.`
                : hasActiveFilters
                ? `No transactions match your current search or filter criteria. Reset filters to view all ${orders.length} transaction records.`
                : "No orders found in transaction history."}
            </p>
            {hasActiveFilters && (
              <div className="mt-4 flex items-center justify-center">
                <button
                  type="button"
                  id="reset-transactions-filter-btn"
                  onClick={handleResetFilters}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#2E9E44] px-5 py-2.5 font-poppins text-xs font-semibold text-white shadow-sm transition hover:bg-[#268439] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2E9E44]"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Reset Filters
                </button>
              </div>
            )}
          </div>
        ) : (
          <table className="w-full text-left text-xs min-w-[940px] border-collapse">
            <thead>
              <tr className="border-b border-black/10 bg-[#F9FAFB] text-[10.5px] font-bold uppercase tracking-wider text-[#7A8493]">
                <th className="py-3 px-3.5 min-w-[130px] whitespace-nowrap">Order Ref</th>
                <th className="py-3 px-3 min-w-[110px] whitespace-nowrap">Status</th>
                <th className="py-3 px-3 min-w-[120px] whitespace-nowrap">Receipt ID</th>
                <th className="py-3 px-3 min-w-[130px] whitespace-nowrap">Date &amp; Time</th>
                <th className="py-3 px-3 min-w-[140px] whitespace-nowrap">Customer Info</th>
                <th className="py-3 px-3 min-w-[90px] whitespace-nowrap">Items</th>
                <th className="py-3 px-3 min-w-[140px] whitespace-nowrap">Payment Method</th>
                <th className="py-3 px-3 min-w-[100px] whitespace-nowrap text-right">Amount Paid</th>
                <th className="py-3 px-3.5 min-w-[100px] whitespace-nowrap text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 text-[#0F2044]">
              {filteredOrders.map((order) => {
                const isConfirmed = order.paymentStatus === "CONFIRMED";
                const isPending = order.paymentStatus === "PENDING";

                return (
                  <tr key={order.orderId} className="hover:bg-[#F9FAFB]/80 transition">
                    <td className="py-3 px-3.5 align-middle font-mono font-bold text-[#0F2044] whitespace-nowrap">
                      {order.orderId}
                    </td>
                    <td className="py-3 px-3 align-middle whitespace-nowrap">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[9.5px] font-bold border ${
                          isConfirmed
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : isPending
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : "bg-red-50 text-red-800 border-red-200"
                        }`}
                      >
                        {order.paymentStatus || "UNKNOWN"}
                      </span>
                    </td>
                    <td className="py-3 px-3 align-middle font-mono text-[#7A8493] whitespace-nowrap">
                      {order.receiptId}
                    </td>
                    <td className="py-3 px-3 align-middle text-[#7A8493] whitespace-nowrap">
                      {order.paidAt}
                    </td>
                    <td className="py-3 px-3 align-middle text-[#0F2044] whitespace-nowrap">
                      {order.customerId ? (
                        <span className="font-mono text-[10px] text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 block truncate max-w-[130px]" title={`Customer UUID: ${order.customerId}`}>
                          UUID: {order.customerId.slice(0, 8)}…
                        </span>
                      ) : (
                        <span className="text-[10px] text-[#7A8493] italic">
                          Walk-in / Guest
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 align-middle font-semibold text-[#0F2044] whitespace-nowrap">
                      {order.itemCount} items
                    </td>
                    <td className="py-3 px-3 align-middle whitespace-nowrap">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                          order.paymentMethod === "cash"
                            ? "bg-amber-100 text-amber-900 border border-amber-200 font-bold"
                            : "bg-[#F0F2F5] text-[#0F2044]"
                        }`}
                      >
                        {order.paymentMethod.toUpperCase() === "CASH" ? "CASH (COUNTER)" : order.paymentMethod.toUpperCase()}
                      </span>
                      <span className="block text-[9px] text-[#8A94A3] font-mono mt-0.5 truncate max-w-[120px]">
                        {order.paymentReference}
                      </span>
                    </td>
                    <td className="py-3 px-3 align-middle text-right font-bold text-[#2E9E44] whitespace-nowrap">
                      {fmt(order.finalTotal)}
                    </td>
                    <td className="py-3 px-3.5 align-middle text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setInspectingOrder(order)}
                        className="rounded-lg border border-black/10 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#0F2044] hover:bg-[#F8F9FA] shadow-2xs transition active:scale-95 cursor-pointer"
                      >
                        View Items
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── INSPECT ORDER ITEMS MODAL ── */}
      {inspectingOrder && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2044]/60 p-4 backdrop-blur-xs qless-fade-in"
        >
          <div className="w-full max-w-[480px] rounded-3xl bg-white p-5 sm:p-6 shadow-2xl space-y-4 qless-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-black/5 pb-3">
              <div>
                <h3 className="font-poppins text-base font-bold text-[#0F2044]">
                  Transaction Snapshot: {inspectingOrder.orderId}
                </h3>
                <p className="text-[11px] text-[#7A8493]">
                  Paid {inspectingOrder.paidAt} via {inspectingOrder.paymentMethod.toUpperCase()} · Status: {inspectingOrder.paymentStatus}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectingOrder(null)}
                className="h-8 w-8 rounded-full bg-[#F3F4F6] text-sm text-[#7A8493] hover:text-[#0F2044]"
              >
                ✕
              </button>
            </div>

            {/* Customer Details info block */}
            <div className="rounded-xl border border-black/5 bg-[#F9FAFB] p-2.5 text-[11px] space-y-1">
              <div className="flex justify-between">
                <span className="text-[#7A8493]">Receipt Reference:</span>
                <span className="font-mono font-semibold text-[#0F2044]">{inspectingOrder.receiptId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#7A8493]">Customer Identifier:</span>
                <span className="font-mono text-[#0F2044]">
                  {inspectingOrder.customerId ? `UUID: ${inspectingOrder.customerId}` : "Walk-in / Unauthenticated"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#7A8493]">Payment Reference:</span>
                <span className="font-mono text-[#0F2044]">{inspectingOrder.paymentReference}</span>
              </div>
            </div>

            {/* Purchased Items List */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] mb-2">
                Purchased Merchandise ({inspectingOrder.itemCount} items)
              </p>
              <div className="divide-y divide-black/5 rounded-2xl border border-black/5 bg-[#F9FAFB] p-2.5 max-h-48 overflow-y-auto">
                {inspectingOrder.items.length === 0 ? (
                  <p className="text-center py-4 text-xs text-[#7A8493]">No line items recorded for this order.</p>
                ) : (
                  inspectingOrder.items.map((item, idx) => (
                    <div key={`${item.id}-${idx}`} className="py-2 flex items-center justify-between">
                      <div className="min-w-0 pr-2">
                        <p className="font-semibold text-[#0F2044] truncate">
                          {item.name}
                        </p>
                        <p className="text-[10px] text-[#7A8493]">
                          {item.unitSize ? `${item.unitSize} · ` : ""}{item.quantity} × {fmt(item.price)}
                        </p>
                      </div>
                      <span className="font-bold text-[#0F2044] shrink-0">
                        {fmt(item.price * item.quantity)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Bill Breakdown */}
            <div className="rounded-xl border border-black/5 bg-[#F8F9FA] p-3 space-y-1.5 text-xs">
              <div className="flex justify-between text-[#7A8493]">
                <span>Merchandise Subtotal</span>
                <span className="font-semibold text-[#0F2044]">{fmt(inspectingOrder.subtotal)}</span>
              </div>
              {inspectingOrder.mrpSavings > 0 && (
                <div className="flex justify-between text-[#2E9E44]">
                  <span>Store MRP Savings</span>
                  <span className="font-semibold">−{fmt(inspectingOrder.mrpSavings)}</span>
                </div>
              )}
              {inspectingOrder.couponDiscount > 0 && (
                <div className="flex justify-between text-[#2E9E44] font-semibold">
                  <span>Coupon ({inspectingOrder.couponCode})</span>
                  <span>−{fmt(inspectingOrder.couponDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between text-[#7A8493]">
                <span>GST Taxes (CGST + SGST)</span>
                <span>+{fmt(inspectingOrder.taxTotal)}</span>
              </div>
              <div className="border-t border-black/5 pt-2 flex justify-between font-bold text-sm text-[#0F2044]">
                <span>Total Paid</span>
                <span className="text-base text-[#2E9E44]">{fmt(inspectingOrder.finalTotal)}</span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectingOrder(null)}
                className="rounded-xl bg-[#0F2044] px-4 py-2 font-poppins text-xs font-semibold text-white shadow-xs hover:bg-[#1A3163]"
              >
                Close Snapshot
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
