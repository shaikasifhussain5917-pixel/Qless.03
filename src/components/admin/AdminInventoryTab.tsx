import { useState, useMemo, useEffect, useCallback } from "react";
import { ProductCategory, StockFilter } from "../../types";
import { PRODUCT_CATEGORIES } from "../../data/mockCatalog";
import { fmt } from "../../utils/formatters";
import {
  AdminInventoryItem,
  fetchAdminInventory,
  adjustAdminStock,
  setAdminStock,
  updateAdminPrice,
  setAdminAvailability,
} from "../../services/adminInventoryService";
import { LAUNCH_STORE_ID } from "../../config/storeConfig";

interface AdminInventoryTabProps {
  storeId?: string;
  initialStockFilter?: StockFilter;
  onReturnToDashboard?: () => void;
}

export function AdminInventoryTab({
  storeId = LAUNCH_STORE_ID,
  initialStockFilter = "all",
  onReturnToDashboard,
}: AdminInventoryTabProps) {
  const [inventory, setInventory] = useState<AdminInventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory>("All");
  const [stockFilter, setStockFilter] = useState<StockFilter>(initialStockFilter);

  // Synchronize filter when navigated from external tab/KPI cards
  useEffect(() => {
    if (initialStockFilter) {
      setStockFilter(initialStockFilter);
    }
  }, [initialStockFilter]);

  // In-flight mutation tracking
  const [mutatingProductId, setMutatingProductId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Stock edit modal/inline state
  const [editingStockId, setEditingStockId] = useState<number | null>(null);
  const [editingStockValue, setEditingStockValue] = useState<string>("");

  // Price edit inline state
  const [editingPriceId, setEditingPriceId] = useState<number | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState<string>("");

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setLoadError(null);

    const result = await fetchAdminInventory(storeId);

    if (result.error) {
      setLoadError(result.error);
      setInventory([]);
    } else {
      setInventory(result.items);
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

  // Aggregate inventory statistics
  const totalStockUnits = useMemo(() => {
    return inventory.reduce((sum, p) => sum + p.stockQuantity, 0);
  }, [inventory]);

  const lowStockCount = useMemo(() => {
    return inventory.filter((p) => p.stockQuantity <= 10 && p.stockQuantity > 0).length;
  }, [inventory]);

  const outOfStockCount = useMemo(() => {
    return inventory.filter((p) => p.stockQuantity === 0).length;
  }, [inventory]);

  const healthyStockCount = useMemo(() => {
    return inventory.filter((p) => p.stockQuantity > 10).length;
  }, [inventory]);

  // Filtered inventory list
  const filteredInventory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return inventory.filter((item) => {
      // Category filter
      if (selectedCategory !== "All" && item.category !== selectedCategory) {
        return false;
      }

      // Stock filter
      const stock = item.stockQuantity;
      if (stockFilter === "in_stock" && stock <= 10) return false;
      if (stockFilter === "low_stock" && (stock > 10 || stock === 0)) return false;
      if (stockFilter === "out_of_stock" && stock > 0) return false;
      if (stockFilter === "alerts" && stock > 10) return false;

      // Search
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.barcode.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    });
  }, [inventory, searchQuery, selectedCategory, stockFilter]);

  // Quick delta adjustment with OCC protection
  const handleQuickAdjust = async (
    item: AdminInventoryItem,
    delta: number
  ) => {
    if (mutatingProductId !== null) return; // Prevent duplicate concurrent submissions
    setMutatingProductId(item.productId);
    setFeedback(null);

    const res = await adjustAdminStock(
      storeId,
      item.productId,
      delta,
      item.updatedAt
    );

    if (res.success && res.item) {
      const updated = res.item;
      setInventory((prev) =>
        prev.map((p) => (p.productId === updated.productId ? updated : p))
      );
      setFeedback({
        type: "success",
        message: `✓ Updated stock for "${updated.name}" to ${updated.stockQuantity} units (${delta > 0 ? `+${delta}` : delta}).`,
      });
    } else {
      setFeedback({
        type: "error",
        message: res.error || "Failed to adjust stock in database.",
      });
      // If conflict occurred, refresh authoritative stock
      if (res.conflict) {
        loadData(true);
      }
    }

    setMutatingProductId(null);
  };

  // Batch restock: add +25 to all items that are low or out of stock
  const handleRestockAllLow = async () => {
    const itemsToRestock = inventory.filter((p) => p.stockQuantity <= 10);
    if (itemsToRestock.length === 0 || mutatingProductId !== null) return;

    setMutatingProductId(-1); // -1 signifies batch operation in progress
    setFeedback({
      type: "success",
      message: `Replenishing ${itemsToRestock.length} low-stock items (+25 units each)...`,
    });

    let successCount = 0;
    let failCount = 0;

    for (const item of itemsToRestock) {
      const res = await adjustAdminStock(storeId, item.productId, 25, item.updatedAt);
      if (res.success) {
        successCount++;
      } else {
        failCount++;
      }
    }

    // Refresh entire inventory from Supabase to guarantee authoritative synchronization
    await loadData(true);

    if (failCount === 0) {
      setFeedback({
        type: "success",
        message: `✓ Successfully restocked ${successCount} low-stock items with +25 units in Supabase.`,
      });
    } else {
      setFeedback({
        type: "error",
        message: `Batch restock finished: ${successCount} succeeded, ${failCount} failed.`,
      });
    }

    setMutatingProductId(null);
  };

  // Start manual edit
  const handleStartEditStock = (item: AdminInventoryItem) => {
    setEditingStockId(item.productId);
    setEditingStockValue(String(item.stockQuantity));
  };

  // Save manual stock quantity
  const handleSaveStock = async (item: AdminInventoryItem) => {
    const val = Number(editingStockValue);
    if (isNaN(val) || val < 0) {
      setFeedback({
        type: "error",
        message: "Stock quantity must be a non-negative number.",
      });
      return;
    }

    setMutatingProductId(item.productId);
    setFeedback(null);

    const res = await setAdminStock(storeId, item.productId, val);

    if (res.success && res.item) {
      const updated = res.item;
      setInventory((prev) =>
        prev.map((p) => (p.productId === updated.productId ? updated : p))
      );
      setFeedback({
        type: "success",
        message: `✓ Explicit stock for "${updated.name}" set to ${updated.stockQuantity} units.`,
      });
      setEditingStockId(null);
      setEditingStockValue("");
    } else {
      setFeedback({
        type: "error",
        message: res.error || "Failed to set stock quantity in database.",
      });
    }

    setMutatingProductId(null);
  };

  // Save price update
  const handleSavePrice = async (item: AdminInventoryItem) => {
    const val = Number(editingPriceValue);
    if (isNaN(val) || val <= 0) {
      setFeedback({
        type: "error",
        message: "Selling price must be greater than zero.",
      });
      return;
    }

    setMutatingProductId(item.productId);
    setFeedback(null);

    const res = await updateAdminPrice(storeId, item.productId, val);

    if (res.success && res.item) {
      const updated = res.item;
      setInventory((prev) =>
        prev.map((p) => (p.productId === updated.productId ? updated : p))
      );
      setFeedback({
        type: "success",
        message: `✓ Store price for "${updated.name}" updated to ${fmt(updated.price)} in public.store_inventory.`,
      });
      setEditingPriceId(null);
      setEditingPriceValue("");
    } else {
      setFeedback({
        type: "error",
        message: res.error || "Failed to update price in database.",
      });
    }

    setMutatingProductId(null);
  };

  // Toggle availability
  const handleToggleAvailability = async (item: AdminInventoryItem) => {
    if (mutatingProductId !== null) return;
    setMutatingProductId(item.productId);
    setFeedback(null);

    const nextState = !item.isAvailable;
    const res = await setAdminAvailability(storeId, item.productId, nextState);

    if (res.success && res.item) {
      const updated = res.item;
      setInventory((prev) =>
        prev.map((p) => (p.productId === updated.productId ? updated : p))
      );
      setFeedback({
        type: "success",
        message: `✓ Availability for "${updated.name}" set to ${nextState ? "ACTIVE (Visible)" : "HIDDEN"}.`,
      });
    } else {
      setFeedback({
        type: "error",
        message: res.error || "Failed to toggle availability in database.",
      });
    }

    setMutatingProductId(null);
  };

  return (
    <div className="space-y-4 qless-fade-in text-xs">
      {/* ── INVENTORY SUMMARY STATS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setStockFilter("all")}
          className={`rounded-2xl border p-4 text-left transition-all duration-200 cursor-pointer ${
            stockFilter === "all"
              ? "border-[#0F2044] bg-white shadow-sm ring-2 ring-[#0F2044]/15"
              : "border-slate-200/80 bg-white shadow-xs hover:border-slate-300 hover:shadow-sm"
          }`}
          title="Click to view all inventory items"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
              Total Units
            </span>
            <span className="h-2 w-2 rounded-full bg-slate-400" />
          </div>
          <p className="font-poppins text-2xl font-extrabold text-[#0F2044]">
            {totalStockUnits}
          </p>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
            <span>Across {inventory.length} store SKUs</span>
            <span className="font-bold text-[#0F2044]">All →</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStockFilter("in_stock")}
          className={`rounded-2xl border p-4 text-left transition-all duration-200 cursor-pointer ${
            stockFilter === "in_stock"
              ? "border-emerald-600 bg-white shadow-sm ring-2 ring-emerald-600/15"
              : "border-slate-200/80 bg-white shadow-xs hover:border-emerald-300 hover:shadow-sm"
          }`}
          title="Click to filter to healthy stock (>10)"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-700">
              Healthy Stock (&gt;10)
            </span>
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          </div>
          <p className="font-poppins text-2xl font-extrabold text-emerald-700">
            {healthyStockCount}
          </p>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
            <span>Adequate shelf volume</span>
            <span className="font-bold text-emerald-700">Filter →</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStockFilter("low_stock")}
          className={`rounded-2xl border p-4 text-left transition-all duration-200 cursor-pointer ${
            stockFilter === "low_stock"
              ? "border-amber-500 bg-white shadow-sm ring-2 ring-amber-500/20"
              : "border-slate-200/80 bg-white shadow-xs hover:border-amber-300 hover:shadow-sm"
          }`}
          title="Click to filter to low stock (1-10)"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-amber-700">
              Low Stock (1-10)
            </span>
            <span className="h-2 w-2 rounded-full bg-amber-500" />
          </div>
          <p className="font-poppins text-2xl font-extrabold text-amber-800">
            {lowStockCount}
          </p>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
            <span>Reorder recommended</span>
            <span className="font-bold text-amber-800">Filter →</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStockFilter("out_of_stock")}
          className={`rounded-2xl border p-4 text-left transition-all duration-200 cursor-pointer ${
            stockFilter === "out_of_stock"
              ? "border-rose-600 bg-white shadow-sm ring-2 ring-rose-600/20"
              : "border-slate-200/80 bg-white shadow-xs hover:border-rose-300 hover:shadow-sm"
          }`}
          title="Click to filter to out of stock (0)"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-rose-700">
              Out of Stock (0)
            </span>
            <span className="h-2 w-2 rounded-full bg-rose-500" />
          </div>
          <p className="font-poppins text-2xl font-extrabold text-rose-800">
            {outOfStockCount}
          </p>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
            <span>Immediate restock needed</span>
            <span className="font-bold text-rose-800">Filter →</span>
          </div>
        </button>
      </div>

      {/* ── CONTROLS & BATCH RESTOCK BAR ── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-poppins text-sm font-bold text-[#0F2044]">
                Stock &amp; Inventory Control
              </h2>
              <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                ● Live Supabase
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Authoritative stock quantities and pricing for store {storeId} enforced by database policies.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {onReturnToDashboard && (
              <button
                type="button"
                onClick={onReturnToDashboard}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs cursor-pointer"
              >
                ← Back to Dashboard
              </button>
            )}

            <button
              type="button"
              onClick={() => loadData(true)}
              disabled={isRefreshing || isLoading || mutatingProductId !== null}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2044] hover:bg-slate-50 transition shadow-2xs disabled:opacity-60 cursor-pointer"
              title="Refresh inventory from Supabase"
            >
              <svg
                className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-emerald-600" : "text-slate-400"}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>

            {(lowStockCount > 0 || outOfStockCount > 0) && (
              <button
                type="button"
                onClick={handleRestockAllLow}
                disabled={mutatingProductId !== null || isRefreshing}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 font-poppins text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition active:scale-95 shrink-0 disabled:opacity-60 cursor-pointer"
                title="Atomically add +25 stock to all low and out-of-stock items in Supabase"
              >
                <span>⚡</span>
                <span>
                  {mutatingProductId === -1
                    ? "Restocking Low Items..."
                    : `Restock All Low (+25)`}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Action Feedback Banner */}
        {feedback && (
          <div
            className={`p-2.5 rounded-xl text-xs flex items-center justify-between border ${
              feedback.type === "success"
                ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                : "bg-red-50 text-red-900 border-red-200"
            }`}
          >
            <span className="font-medium">{feedback.message}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-xs font-bold px-2 py-0.5 rounded hover:bg-black/5 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Unified Search & Quick Filter Controls */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 pt-1">
          {/* Search & Department */}
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">
                🔍
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search product, brand, or barcode…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-8 pr-3 py-1.5 text-xs text-[#0F2044] placeholder-slate-400 focus:border-emerald-600 focus:bg-white focus:outline-hidden transition"
              />
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as ProductCategory)}
              className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-1.5 text-xs font-medium text-[#0F2044] focus:border-emerald-600 focus:bg-white focus:outline-hidden transition"
            >
              {PRODUCT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  Dept: {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Filter Segmented Pills */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setStockFilter("all")}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition whitespace-nowrap cursor-pointer ${
                stockFilter === "all"
                  ? "bg-[#0F2044] text-white shadow-2xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              All ({inventory.length})
            </button>
            <button
              type="button"
              onClick={() => setStockFilter("low_stock")}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition whitespace-nowrap flex items-center gap-1 cursor-pointer ${
                stockFilter === "low_stock"
                  ? "bg-amber-500 text-white shadow-2xs"
                  : "bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100"
              }`}
            >
              <span>Low Stock</span>
              <span className="rounded-full bg-amber-200/90 px-1.5 py-0.2 text-[9px] text-amber-950 font-extrabold">{lowStockCount}</span>
            </button>
            <button
              type="button"
              onClick={() => setStockFilter("out_of_stock")}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition whitespace-nowrap flex items-center gap-1 cursor-pointer ${
                stockFilter === "out_of_stock"
                  ? "bg-rose-600 text-white shadow-2xs"
                  : "bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100"
              }`}
            >
              <span>Out of Stock</span>
              <span className="rounded-full bg-rose-200/90 px-1.5 py-0.2 text-[9px] text-rose-950 font-extrabold">{outOfStockCount}</span>
            </button>
            <button
              type="button"
              onClick={() => setStockFilter("in_stock")}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition whitespace-nowrap cursor-pointer ${
                stockFilter === "in_stock"
                  ? "bg-emerald-600 text-white shadow-2xs"
                  : "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
              }`}
            >
              Healthy ({healthyStockCount})
            </button>
          </div>
        </div>

        {/* Filter Context Indicator */}
        {(stockFilter !== "all" || searchQuery || selectedCategory !== "All") && (
          <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px] text-slate-500">
            <span>
              Showing <strong>{filteredInventory.length}</strong> of {inventory.length} items
              {stockFilter !== "all" && ` (${stockFilter.replace("_", " ")})`}
              {selectedCategory !== "All" && ` in ${selectedCategory}`}
            </span>
            <button
              type="button"
              onClick={() => {
                setStockFilter("all");
                setSearchQuery("");
                setSelectedCategory("All");
              }}
              className="text-xs font-semibold text-rose-600 hover:underline cursor-pointer"
            >
              ✕ Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* ── INVENTORY DATA TABLE CONTAINER ── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-slate-400">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-[#0F2044]">
              <svg className="h-6 w-6 animate-spin text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <p className="font-poppins text-sm font-bold text-[#0F2044]">Querying Database Inventory…</p>
            <p className="text-xs text-slate-400 mt-1">
              Loading authoritative stock and pricing for store {storeId} via Supabase
            </p>
          </div>
        ) : loadError ? (
          <div className="py-12 px-4 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-2xl text-red-600 border border-red-200">
              ⚠️
            </div>
            <p className="font-poppins text-sm font-bold text-red-900">
              Failed to Load Store Inventory from Supabase
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs text-red-700 bg-red-50 p-2.5 rounded-xl border border-red-200 font-mono">
              {loadError}
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => loadData(false)}
                className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-[#0F2044] px-4 py-2 font-poppins text-xs font-semibold text-white shadow-sm hover:bg-[#1A3163] transition cursor-pointer"
              >
                Retry Database Query
              </button>
            </div>
          </div>
        ) : filteredInventory.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <span className="text-2xl block mb-2">📦</span>
            <p className="font-poppins text-sm font-bold text-[#0F2044]">
              {inventory.length === 0
                ? "No Products Found in Store Inventory"
                : "No Products Match Inventory Filter"}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {inventory.length === 0
                ? `Store ${storeId} has no records in public.store_inventory.`
                : "Try adjusting your search query, department, or stock status filter."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4 min-w-[210px]">Product &amp; SKU</th>
                  <th className="py-3 px-3 min-w-[130px]">Barcode / Dept</th>
                  <th className="py-3 px-3 min-w-[120px]">Store Price</th>
                  <th className="py-3 px-3 min-w-[130px]">Authoritative Stock</th>
                  <th className="py-3 px-3 min-w-[90px]">Status</th>
                  <th className="py-3 px-4 min-w-[180px] text-right pr-6">Quick Restock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[#0F2044]">
                {filteredInventory.map((item) => {
                  const stock = item.stockQuantity;
                  const isOut = stock === 0;
                  const isLow = stock <= 10 && stock > 0;
                  const maxCap = 60;
                  const barPercent = Math.min(100, Math.round((stock / maxCap) * 100));
                  const isMutating = mutatingProductId === item.productId || mutatingProductId === -1;

                  return (
                    <tr key={item.productId} className="hover:bg-slate-50/60 transition-colors">
                      {/* Product Name */}
                      <td className="py-3 px-4 align-middle">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 border border-slate-200/60 text-lg shadow-2xs">
                            {item.emoji || "🛍️"}
                          </span>
                          <div className="min-w-0">
                            <p className="font-bold text-[#0F2044] truncate max-w-[200px]" title={item.name}>
                              {item.name}
                            </p>
                            <p className="text-[10.5px] text-slate-500 truncate">
                              {item.brand} · {item.unitSize}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Barcode & Dept */}
                      <td className="py-3 px-3 align-middle whitespace-nowrap">
                        <p className="font-mono text-[11px] text-slate-800 font-medium">{item.barcode}</p>
                        <span className="text-[10px] text-slate-500 font-medium block">
                          {item.category}
                        </span>
                      </td>

                      {/* Store Price & MRP */}
                      <td className="py-3 px-3 align-middle whitespace-nowrap">
                        {editingPriceId === item.productId ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="0.5"
                              min="1"
                              value={editingPriceValue}
                              onChange={(e) => setEditingPriceValue(e.target.value)}
                              className="w-16 rounded-lg border border-emerald-500 bg-white p-1 text-center font-bold text-xs"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => handleSavePrice(item)}
                              disabled={isMutating}
                              className="rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingPriceId(null)}
                              className="rounded-lg border border-slate-200 px-1.5 py-1 text-[10px] text-slate-600 hover:bg-slate-100 cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div
                            onClick={() => {
                              setEditingPriceId(item.productId);
                              setEditingPriceValue(String(item.price));
                            }}
                            className="cursor-pointer group inline-flex items-baseline gap-1"
                            title="Click to edit selling price in public.store_inventory"
                          >
                            <span className="font-poppins font-bold text-xs text-[#0F2044]">
                              {fmt(item.price)}
                            </span>
                            {item.mrp > item.price && (
                              <span className="text-[10px] text-slate-400 line-through">
                                {fmt(item.mrp)}
                              </span>
                            )}
                            <span className="text-[10px] text-emerald-600 opacity-0 group-hover:opacity-100 transition">
                              ✏️
                            </span>
                          </div>
                        )}
                        <span className="text-[9.5px] text-slate-400 block">Store price</span>
                      </td>

                      {/* Authoritative Stock & Mini Capacity Bar */}
                      <td className="py-3 px-3 align-middle whitespace-nowrap">
                        {editingStockId === item.productId ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              value={editingStockValue}
                              onChange={(e) => setEditingStockValue(e.target.value)}
                              className="w-16 rounded-lg border border-emerald-500 bg-white p-1 text-center font-bold text-xs"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveStock(item)}
                              disabled={isMutating}
                              className="rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                            >
                              Set
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingStockId(null)}
                              className="rounded-lg border border-slate-200 px-1.5 py-1 text-[10px] text-slate-600 hover:bg-slate-100 cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div
                            onClick={() => handleStartEditStock(item)}
                            className="cursor-pointer group flex items-baseline gap-1"
                            title="Click to set explicit stock quantity in Supabase"
                          >
                            <span
                              className={`font-poppins font-bold text-xs ${
                                isOut ? "text-rose-600" : isLow ? "text-amber-600" : "text-[#0F2044]"
                              }`}
                            >
                              {stock}
                            </span>
                            <span className="text-[10px] text-slate-500">units</span>
                            <span className="text-[10px] text-emerald-600 opacity-0 group-hover:opacity-100 transition">
                              ✏️
                            </span>
                          </div>
                        )}
                        {/* Status Label + Mini Shelf Capacity Fill */}
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-semibold ${
                              isOut ? "text-rose-600" : isLow ? "text-amber-600" : "text-emerald-700"
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${
                              isOut ? "bg-rose-500" : isLow ? "bg-amber-500" : "bg-emerald-500"
                            }`} />
                            {isOut ? "Out of stock" : isLow ? "Low stock" : "In stock"}
                          </span>
                          <span className="text-[9.5px] text-slate-400">· {barPercent}%</span>
                        </div>
                      </td>

                      {/* Availability Control */}
                      <td className="py-3 px-3 align-middle whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleToggleAvailability(item)}
                          disabled={isMutating}
                          className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-bold transition border cursor-pointer ${
                            item.isAvailable
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200/80 hover:bg-emerald-100"
                              : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
                          } disabled:opacity-50`}
                          title={item.isAvailable ? "Click to hide from customer catalog" : "Click to make available to shoppers"}
                        >
                          {item.isAvailable ? "✓ Active" : "✕ Hidden"}
                        </button>
                      </td>

                      {/* Quick Adjustment Steppers with Pure Round Corners & Ample Margin */}
                      <td className="py-3 px-4 align-middle text-right whitespace-nowrap pr-6">
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleQuickAdjust(item, -1)}
                            disabled={stock < 1 || isMutating}
                            className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-semibold text-[#0F2044] hover:bg-slate-50 disabled:opacity-30 transition cursor-pointer shadow-2xs"
                            title="Decrease 1 unit in Supabase"
                          >
                            -1
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickAdjust(item, 1)}
                            disabled={isMutating}
                            className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-semibold text-[#0F2044] hover:bg-slate-50 disabled:opacity-50 transition cursor-pointer shadow-2xs"
                            title="Increase 1 unit in Supabase"
                          >
                            +1
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickAdjust(item, 5)}
                            disabled={isMutating}
                            className="h-7 w-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-semibold text-[#0F2044] hover:bg-slate-50 disabled:opacity-50 transition cursor-pointer shadow-2xs"
                            title="Increase 5 units in Supabase"
                          >
                            +5
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickAdjust(item, 20)}
                            disabled={isMutating}
                            className="h-7 px-2.5 flex items-center justify-center rounded-lg bg-emerald-600 text-white text-[10.5px] font-bold hover:bg-emerald-700 disabled:opacity-50 transition shadow-2xs cursor-pointer"
                            title="Restock 20 units in Supabase"
                          >
                            +20 Restock
                          </button>
                        </div>
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
