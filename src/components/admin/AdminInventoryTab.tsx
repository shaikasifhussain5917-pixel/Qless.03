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
}

export function AdminInventoryTab({
  storeId = LAUNCH_STORE_ID,
}: AdminInventoryTabProps) {
  const [inventory, setInventory] = useState<AdminInventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory>("All");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");

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
        <div className="rounded-2xl border border-white/70 bg-white/95 p-4 shadow-sm backdrop-blur-md">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] block mb-1">
            Total Inventory Units
          </span>
          <p className="font-poppins text-xl font-extrabold text-[#0F2044]">
            {totalStockUnits}
          </p>
          <p className="text-[10px] text-[#7A8493] mt-0.5">Across {inventory.length} store SKUs</p>
        </div>

        <div className="rounded-2xl border border-white/70 bg-white/95 p-4 shadow-sm backdrop-blur-md">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#2E9E44] block mb-1">
            Healthy Stock (&gt;10)
          </span>
          <p className="font-poppins text-xl font-extrabold text-[#2E9E44]">
            {healthyStockCount}
          </p>
          <p className="text-[10px] text-[#7A8493] mt-0.5">Adequate shelf capacity</p>
        </div>

        <div className="rounded-2xl border border-amber-300 bg-amber-50/70 p-4 shadow-sm backdrop-blur-md">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 block mb-1">
            Low Stock (&le;10)
          </span>
          <p className="font-poppins text-xl font-extrabold text-amber-950">
            {lowStockCount}
          </p>
          <p className="text-[10px] text-amber-800 mt-0.5">Reorder recommended</p>
        </div>

        <div className="rounded-2xl border border-red-200 bg-red-50/70 p-4 shadow-sm backdrop-blur-md">
          <span className="text-[10px] font-bold uppercase tracking-wider text-red-900 block mb-1">
            Out of Stock (0)
          </span>
          <p className="font-poppins text-xl font-extrabold text-red-950">
            {outOfStockCount}
          </p>
          <p className="text-[10px] text-red-800 mt-0.5">Immediate restock required</p>
        </div>
      </div>

      {/* ── CONTROLS & BATCH RESTOCK BAR ── */}
      <div className="rounded-2xl border border-white/70 bg-white/95 p-4 shadow-sm backdrop-blur-md space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-poppins text-sm font-bold text-[#0F2044]">
                Inventory Stock Control &amp; Replenishment
              </h2>
              <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[9.5px] font-bold text-emerald-700">
                ● Live Database (public.store_inventory)
              </span>
            </div>
            <p className="text-[11px] text-[#7A8493]">
              Authoritative stock and store-level pricing for store {storeId} enforced by PostgreSQL Row Level Security
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => loadData(true)}
              disabled={isRefreshing || isLoading || mutatingProductId !== null}
              className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2044] hover:bg-[#F8F9FA] transition shadow-2xs disabled:opacity-60"
              title="Refresh inventory from Supabase"
            >
              <svg
                className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-[#2E9E44]" : "text-[#7A8493]"}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {isRefreshing ? "Refreshing..." : "Refresh Inventory"}
            </button>

            {(lowStockCount > 0 || outOfStockCount > 0) && (
              <button
                type="button"
                onClick={handleRestockAllLow}
                disabled={mutatingProductId !== null || isRefreshing}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-[#2E9E44] px-4 py-2 font-poppins text-xs font-bold text-white shadow-xs hover:bg-[#288B3B] transition active:scale-95 shrink-0 disabled:opacity-60"
                title="Atomically add +25 stock to all low and out-of-stock items in Supabase"
              >
                <span>⚡</span>
                <span>
                  {mutatingProductId === -1
                    ? "Restocking Low Items..."
                    : `Restock All Low Items (+25)`}
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
            <span>{feedback.message}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-xs font-bold px-2 py-0.5 rounded hover:bg-black/5"
            >
              ✕
            </button>
          </div>
        )}

        {/* Search & Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          <div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search product, brand, or barcode…"
              className="w-full rounded-xl border border-black/10 bg-[#F9FAFB] px-3 py-2 text-xs text-[#0F2044] focus:border-[#2E9E44] focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as ProductCategory)}
              className="w-full rounded-xl border border-black/10 bg-[#F9FAFB] px-3 py-2 text-xs font-medium text-[#0F2044] focus:border-[#2E9E44] focus:bg-white focus:outline-none"
            >
              {PRODUCT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  Department: {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value as StockFilter)}
              className="w-full rounded-xl border border-black/10 bg-[#F9FAFB] px-3 py-2 text-xs font-medium text-[#0F2044] focus:border-[#2E9E44] focus:bg-white focus:outline-none"
            >
              <option value="all">Status: All Inventory ({inventory.length})</option>
              <option value="low_stock">Low Stock Alerts (&le;10)</option>
              <option value="out_of_stock">Out of Stock Only (0)</option>
              <option value="in_stock">Healthy Stock (&gt;10)</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── INVENTORY DATA CONTAINER ── */}
      <div className="rounded-2xl border border-white/70 bg-white/95 p-4 shadow-sm backdrop-blur-md overflow-x-auto">
        {isLoading ? (
          <div className="py-16 text-center text-[#7A8493]">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-[#0F2044]">
              <svg className="h-6 w-6 animate-spin text-[#2E9E44]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <p className="font-poppins text-sm font-bold text-[#0F2044]">Querying Database Inventory…</p>
            <p className="text-xs text-[#7A8493] mt-1">
              Loading authoritative stock and pricing for store {storeId} via Supabase RLS
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
                className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-[#0F2044] px-4 py-2 font-poppins text-xs font-semibold text-white shadow-sm hover:bg-[#1A3163] transition"
              >
                Retry Database Query
              </button>
            </div>
          </div>
        ) : filteredInventory.length === 0 ? (
          <div className="p-8 text-center text-[#7A8493]">
            <span className="text-2xl block mb-2">📦</span>
            <p className="font-poppins text-sm font-bold text-[#0F2044]">
              {inventory.length === 0
                ? "No Products Found in Store Inventory"
                : "No Products Match Inventory Filter"}
            </p>
            <p className="text-xs text-[#7A8493] mt-1">
              {inventory.length === 0
                ? `Store ${storeId} has no records in public.store_inventory.`
                : "Try adjusting your search query, department, or stock status filter."}
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs min-w-[850px]">
            <thead>
              <tr className="border-b border-black/5 text-[10px] font-bold uppercase tracking-wider text-[#8A94A3]">
                <th className="pb-2.5">Product &amp; SKU</th>
                <th className="pb-2.5">Barcode / Dept</th>
                <th className="pb-2.5">Store Price &amp; MRP</th>
                <th className="pb-2.5">Authoritative Stock</th>
                <th className="pb-2.5">Capacity Bar</th>
                <th className="pb-2.5">Availability</th>
                <th className="pb-2.5 text-right">Quick Stock Adjustment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {filteredInventory.map((item) => {
                const stock = item.stockQuantity;
                const isOut = stock === 0;
                const isLow = stock <= 10 && stock > 0;
                const maxCap = 60;
                const barPercent = Math.min(100, Math.round((stock / maxCap) * 100));
                const isMutating = mutatingProductId === item.productId || mutatingProductId === -1;

                return (
                  <tr key={item.productId} className="hover:bg-[#F9FAFB]/80 transition">
                    {/* Product Name */}
                    <td className="py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl shrink-0">{item.emoji || "🛍️"}</span>
                        <div>
                          <p className="font-semibold text-[#0F2044]">{item.name}</p>
                          <p className="text-[10px] text-[#7A8493]">
                            {item.brand} · {item.unitSize}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Barcode & Dept */}
                    <td className="py-3">
                      <p className="font-mono text-[11px] text-[#7A8493]">{item.barcode}</p>
                      <p className="text-[10px] text-[#8A94A3]">{item.category}</p>
                    </td>

                    {/* Store Price & MRP */}
                    <td className="py-3">
                      {editingPriceId === item.productId ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.5"
                            min="1"
                            value={editingPriceValue}
                            onChange={(e) => setEditingPriceValue(e.target.value)}
                            className="w-16 rounded-lg border border-[#2E9E44] bg-white p-1 text-center font-bold text-xs"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleSavePrice(item)}
                            disabled={isMutating}
                            className="rounded-lg bg-[#2E9E44] px-2 py-1 text-[10px] font-bold text-white hover:bg-[#288B3B] disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingPriceId(null)}
                            className="rounded-lg border border-black/10 px-1.5 py-1 text-[10px] text-slate-600 hover:bg-slate-100"
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
                          className="cursor-pointer group flex items-baseline gap-1"
                          title="Click to edit store-specific selling price in public.store_inventory"
                        >
                          <span className="font-poppins font-bold text-sm text-[#0F2044]">
                            {fmt(item.price)}
                          </span>
                          {item.mrp > item.price && (
                            <span className="text-[10px] text-[#8A94A3] line-through">
                              {fmt(item.mrp)}
                            </span>
                          )}
                          <span className="text-[10px] text-[#2E9E44] opacity-0 group-hover:opacity-100 transition">
                            ✏️
                          </span>
                        </div>
                      )}
                      <span className="text-[9px] text-[#8A94A3] block">Store-specific</span>
                    </td>

                    {/* Authoritative Stock */}
                    <td className="py-3">
                      {editingStockId === item.productId ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            value={editingStockValue}
                            onChange={(e) => setEditingStockValue(e.target.value)}
                            className="w-16 rounded-lg border border-[#2E9E44] bg-white p-1 text-center font-bold text-xs"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveStock(item)}
                            disabled={isMutating}
                            className="rounded-lg bg-[#2E9E44] px-2 py-1 text-[10px] font-bold text-white hover:bg-[#288B3B] disabled:opacity-50"
                          >
                            Set
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingStockId(null)}
                            className="rounded-lg border border-black/10 px-1.5 py-1 text-[10px] text-slate-600 hover:bg-slate-100"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={() => handleStartEditStock(item)}
                          className="cursor-pointer group flex items-center gap-1.5"
                          title="Click to set explicit stock quantity in Supabase"
                        >
                          <span
                            className={`font-poppins font-bold text-sm ${
                              isOut ? "text-red-600" : isLow ? "text-amber-600" : "text-[#0F2044]"
                            }`}
                          >
                            {stock}
                          </span>
                          <span className="text-[10px] text-[#7A8493]">units</span>
                          <span className="text-[10px] text-[#2E9E44] opacity-0 group-hover:opacity-100 transition">
                            ✏️
                          </span>
                        </div>
                      )}
                      <span
                        className={`inline-block rounded-full px-2 py-0.2 text-[8.5px] font-bold uppercase mt-0.5 ${
                          isOut
                            ? "bg-red-100 text-red-800"
                            : isLow
                            ? "bg-amber-100 text-amber-900"
                            : "bg-[#EEF8F0] text-[#2E9E44]"
                        }`}
                      >
                        {isOut ? "OUT OF STOCK" : isLow ? "LOW STOCK" : "IN STOCK"}
                      </span>
                    </td>

                    {/* Stock Bar */}
                    <td className="py-3 min-w-[100px]">
                      <div className="h-2 w-full rounded-full bg-black/5 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            isOut ? "bg-red-500" : isLow ? "bg-amber-500" : "bg-[#2E9E44]"
                          }`}
                          style={{ width: `${barPercent}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-[#8A94A3] mt-0.5 block">{barPercent}% capacity</span>
                    </td>

                    {/* Availability Control */}
                    <td className="py-3">
                      <button
                        type="button"
                        onClick={() => handleToggleAvailability(item)}
                        disabled={isMutating}
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold transition border ${
                          item.isAvailable
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                            : "bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200"
                        } disabled:opacity-50`}
                        title={item.isAvailable ? "Click to hide from customer catalog" : "Click to make available to shoppers"}
                      >
                        {item.isAvailable ? "✓ Active" : "✕ Hidden"}
                      </button>
                    </td>

                    {/* Quick Adjustment Steppers */}
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleQuickAdjust(item, -5)}
                          disabled={stock < 5 || isMutating}
                          className="rounded-lg border border-black/10 bg-white px-2 py-1 text-[10px] font-semibold text-[#0F2044] hover:bg-[#F8F9FA] disabled:opacity-30 transition"
                          title="Decrease 5 units in Supabase"
                        >
                          -5
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickAdjust(item, -1)}
                          disabled={stock < 1 || isMutating}
                          className="rounded-lg border border-black/10 bg-white px-2 py-1 text-[10px] font-semibold text-[#0F2044] hover:bg-[#F8F9FA] disabled:opacity-30 transition"
                          title="Decrease 1 unit in Supabase"
                        >
                          -1
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickAdjust(item, 1)}
                          disabled={isMutating}
                          className="rounded-lg border border-black/10 bg-white px-2 py-1 text-[10px] font-semibold text-[#0F2044] hover:bg-[#F8F9FA] disabled:opacity-50 transition"
                          title="Increase 1 unit in Supabase"
                        >
                          +1
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickAdjust(item, 5)}
                          disabled={isMutating}
                          className="rounded-lg border border-black/10 bg-white px-2 py-1 text-[10px] font-semibold text-[#0F2044] hover:bg-[#F8F9FA] disabled:opacity-50 transition"
                          title="Increase 5 units in Supabase"
                        >
                          +5
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickAdjust(item, 20)}
                          disabled={isMutating}
                          className="rounded-lg bg-[#2E9E44] px-2.5 py-1 text-[10px] font-bold text-white hover:bg-[#288B3B] disabled:opacity-50 transition"
                          title="Restock 20 units in Supabase"
                        >
                          +20
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── SECURITY NOTICE ── */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-[11px] text-emerald-950 leading-relaxed">
        <strong>Authoritative Synchronized Inventory:</strong> Changes made here immediately update <code className="font-mono font-bold bg-emerald-100 px-1 py-0.5 rounded">public.store_inventory</code> for store {storeId}. Self-checkout stock verification and customer catalog views reflect these authoritative database quantities and prices in real-time.
      </div>
    </div>
  );
}
