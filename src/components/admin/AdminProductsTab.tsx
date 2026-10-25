import { useState, useMemo, useEffect, useCallback } from "react";
import { Product, ProductCategory, StockFilter } from "../../types";
import { PRODUCT_CATEGORIES } from "../../data/mockCatalog";
import { fmt } from "../../utils/formatters";
import {
  fetchAdminInventory,
  updateAdminPrice,
  setAdminStock,
  setAdminAvailability,
  AdminInventoryItem,
} from "../../services/adminInventoryService";
import { LAUNCH_STORE_ID } from "../../config/storeConfig";
import { ProductImage } from "../common/ProductImage";

interface AdminProductsTabProps {
  storeId?: string;
  catalog?: Product[];
  onAddProduct?: (data: Omit<Product, "id"> & { id?: number }) => { success: boolean; error?: string };
  onUpdateProduct?: (id: number, updates: Partial<Product>) => { success: boolean; error?: string };
  onDeleteProduct?: (id: number) => { success: boolean; error?: string };
  isAddModalOpen?: boolean;
  onOpenAddModal?: () => void;
  onCloseAddModal?: () => void;
}

export function AdminProductsTab({
  storeId,
  isAddModalOpen,
  onOpenAddModal,
  onCloseAddModal,
}: AdminProductsTabProps) {
  const targetStoreId = storeId || LAUNCH_STORE_ID;

  // Live Supabase inventory state
  const [items, setItems] = useState<AdminInventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  // Search & filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory>("All");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [availabilityFilter, setAvailabilityFilter] = useState<"all" | "available" | "hidden">("all");

  // Edit product modal state
  const [editingItem, setEditingItem] = useState<AdminInventoryItem | null>(null);
  const [deactivatingItem, setDeactivatingItem] = useState<AdminInventoryItem | null>(null);
  const [isMutating, setIsMutating] = useState(false);

  // Feedback notifications
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Editable store-specific form fields
  const [priceInput, setPriceInput] = useState("");
  const [mrpInput, setMrpInput] = useState("");
  const [stockInput, setStockInput] = useState("");
  const [isAvailableInput, setIsAvailableInput] = useState(true);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Live data loader
  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setLoadError(null);

    const res = await fetchAdminInventory(targetStoreId);
    if (res.error) {
      setLoadError(res.error);
      setItems([]);
    } else {
      setItems(res.items);
      setLastRefreshed(new Date());
    }

    if (isRefresh) {
      setIsRefreshing(false);
    } else {
      setIsLoading(false);
    }
  }, [targetStoreId]);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // Open edit modal
  const openEditModal = (item: AdminInventoryItem) => {
    setEditingItem(item);
    setPriceInput(String(item.price));
    setMrpInput(item.mrp && item.mrp > 0 ? String(item.mrp) : "");
    setStockInput(String(item.stockQuantity));
    setIsAvailableInput(item.isAvailable);
    setFormErrors({});
  };

  // Validate store-specific fields
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    const priceNum = Number(priceInput);
    if (isNaN(priceNum) || priceNum <= 0) {
      errors.price = "Selling price must be greater than ₹0.";
    }

    if (mrpInput.trim()) {
      const mrpNum = Number(mrpInput);
      if (isNaN(mrpNum) || mrpNum < priceNum) {
        errors.mrp = "MRP must be greater than or equal to selling price.";
      }
    }

    const stockNum = Number(stockInput);
    if (isNaN(stockNum) || stockNum < 0) {
      errors.stock = "Stock quantity cannot be negative.";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Save store-specific product updates
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    if (!validateForm()) return;

    setIsMutating(true);
    const newPrice = Number(priceInput);
    const newMrp = mrpInput.trim() ? Number(mrpInput) : undefined;
    const newStock = Number(stockInput);

    try {
      // 1. Update Price and MRP in store_inventory
      if (newPrice !== editingItem.price || newMrp !== editingItem.mrp) {
        const priceRes = await updateAdminPrice(targetStoreId, editingItem.productId, newPrice, newMrp);
        if (!priceRes.success) {
          throw new Error(priceRes.error || "Failed to update price in database.");
        }
      }

      // 2. Update stock quantity if changed
      if (newStock !== editingItem.stockQuantity) {
        const stockRes = await setAdminStock(targetStoreId, editingItem.productId, newStock);
        if (!stockRes.success) {
          throw new Error(stockRes.error || "Failed to update stock quantity in database.");
        }
      }

      // 3. Update availability if changed
      if (isAvailableInput !== editingItem.isAvailable) {
        const availRes = await setAdminAvailability(targetStoreId, editingItem.productId, isAvailableInput);
        if (!availRes.success) {
          throw new Error(availRes.error || "Failed to update store availability in database.");
        }
      }

      setFeedback({
        type: "success",
        message: `Saved updates for '${editingItem.name}' to Supabase (Price: ${fmt(newPrice)}, Stock: ${newStock}).`,
      });
      setEditingItem(null);
      await loadData(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update product.";
      setFormErrors({ general: msg });
    } finally {
      setIsMutating(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  // Safe Deactivate / Reactivate
  const handleToggleAvailability = async (item: AdminInventoryItem, newStatus: boolean) => {
    setIsMutating(true);
    try {
      const res = await setAdminAvailability(targetStoreId, item.productId, newStatus);
      if (!res.success) {
        throw new Error(res.error || "Failed to update availability.");
      }
      setFeedback({
        type: "success",
        message: newStatus
          ? `'${item.name}' reactivated and visible in customer catalog.`
          : `'${item.name}' safely deactivated and hidden from customer catalog.`,
      });
      setDeactivatingItem(null);
      await loadData(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update availability.";
      setFeedback({ type: "error", message: msg });
    } finally {
      setIsMutating(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  // Filtered live catalog
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      // Category filter
      if (selectedCategory !== "All" && item.category !== selectedCategory) {
        return false;
      }

      // Stock status filter
      const stock = item.stockQuantity;
      if (stockFilter === "in_stock" && stock <= 10) return false;
      if (stockFilter === "low_stock" && (stock > 10 || stock === 0)) return false;
      if (stockFilter === "out_of_stock" && stock > 0) return false;

      // Availability filter
      if (availabilityFilter === "available" && !item.isAvailable) return false;
      if (availabilityFilter === "hidden" && item.isAvailable) return false;

      // Search query
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.barcode.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q)
      );
    });
  }, [items, searchQuery, selectedCategory, stockFilter, availabilityFilter]);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4 qless-fade-in text-xs">
        <div className="rounded-2xl border border-blue-200/80 bg-blue-50/70 p-5 text-blue-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <div>
              <p className="font-poppins font-bold text-sm">Loading Live Products &amp; Store Inventory...</p>
              <p className="text-[11px] text-blue-800">Querying store_inventory joined with products for {targetStoreId}.</p>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 rounded-2xl border border-black/5 bg-white/70 animate-pulse p-4" />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (loadError) {
    return (
      <div className="space-y-4 qless-fade-in text-xs">
        <div className="rounded-2xl border border-red-200 bg-red-50/80 p-5 text-red-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <h3 className="font-poppins font-bold text-sm text-red-950">Failed to Load Products</h3>
              <p className="text-xs text-red-800 mt-0.5">{loadError}</p>
              <p className="text-[11px] text-red-700 mt-1">
                Database queries to Supabase failed. Fallback to mock products is disabled to prevent data corruption.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => loadData(false)}
            className="rounded-xl bg-red-600 px-4 py-2 font-poppins text-xs font-bold text-white hover:bg-red-700 transition active:scale-95 shadow-xs shrink-0"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 qless-fade-in text-xs">
      {/* ── FEEDBACK NOTIFICATION ── */}
      {feedback && (
        <div
          role="alert"
          className={`rounded-2xl p-3.5 flex items-center justify-between text-xs font-semibold qless-scale-in ${
            feedback.type === "success"
              ? "bg-[#EEF8F0] border border-[#2E9E44]/40 text-[#2E9E44]"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-[11px] underline ml-2 opacity-80 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── HEADER & SEARCH BAR CONTROLS ── */}
      <div className="rounded-2xl border border-white/70 bg-white/95 p-4 shadow-sm backdrop-blur-md space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-poppins text-sm font-bold text-[#0F2044]">
                Product Catalog &amp; SKU Management
              </h2>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-800 shrink-0">
                🟢 Live Supabase
              </span>
            </div>
            <p className="text-[11px] text-[#7A8493] mt-0.5">
              Authoritative catalog for {targetStoreId} — {items.length} total SKUs loaded from database
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadData(true)}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-3 py-2 font-poppins text-xs font-semibold text-[#0F2044] hover:bg-[#F8F9FA] transition active:scale-95 shadow-2xs disabled:opacity-50"
              title="Refresh live catalog from Supabase"
            >
              <span className={isRefreshing ? "animate-spin inline-block" : ""}>🔄</span>
              <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenAddModal && onOpenAddModal()}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-[#2E9E44] px-4 py-2 font-poppins text-xs font-bold text-white shadow-xs hover:bg-[#288B3B] transition active:scale-95"
            >
              <span>+</span>
              <span>Add New Product</span>
            </button>
          </div>
        </div>

        {/* Search input & Filter row */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-1">
          {/* Search Input */}
          <div className="sm:col-span-1 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, barcode, brand…"
              className="w-full rounded-xl border border-black/10 bg-[#F9FAFB] pl-3 pr-8 py-2 text-xs text-[#0F2044] focus:border-[#2E9E44] focus:bg-white focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2 text-[#7A8493] hover:text-[#0F2044]"
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Dropdown */}
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

          {/* Stock Filter Dropdown */}
          <div>
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value as StockFilter)}
              className="w-full rounded-xl border border-black/10 bg-[#F9FAFB] px-3 py-2 text-xs font-medium text-[#0F2044] focus:border-[#2E9E44] focus:bg-white focus:outline-none"
            >
              <option value="all">Stock Filter: All Items</option>
              <option value="in_stock">In Stock (&gt; 10 units)</option>
              <option value="low_stock">Low Stock (1 to 10 units)</option>
              <option value="out_of_stock">Out of Stock (0 units)</option>
            </select>
          </div>

          {/* Availability Filter Dropdown */}
          <div>
            <select
              value={availabilityFilter}
              onChange={(e) => setAvailabilityFilter(e.target.value as "all" | "available" | "hidden")}
              className="w-full rounded-xl border border-black/10 bg-[#F9FAFB] px-3 py-2 text-xs font-medium text-[#0F2044] focus:border-[#2E9E44] focus:bg-white focus:outline-none"
            >
              <option value="all">Shelf: All Statuses</option>
              <option value="available">Active on Shelves</option>
              <option value="hidden">Deactivated / Hidden</option>
            </select>
          </div>
        </div>

        {/* Results Counter & Timestamp */}
        <div className="flex items-center justify-between text-[11px] text-[#7A8493] pt-1 border-t border-black/5">
          <span>
            Showing <strong>{filteredItems.length}</strong> of <strong>{items.length}</strong> products
            {lastRefreshed && (
              <span className="ml-2 hidden sm:inline">
                · Last updated {lastRefreshed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}
              </span>
            )}
          </span>
          {(searchQuery || selectedCategory !== "All" || stockFilter !== "all" || availabilityFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("All");
                setStockFilter("all");
                setAvailabilityFilter("all");
              }}
              className="text-[#2E9E44] font-semibold hover:underline"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* ── PRODUCTS TABLE ── */}
      <div className="rounded-2xl border border-white/70 bg-white/95 p-4 shadow-sm backdrop-blur-md overflow-x-auto">
        {filteredItems.length === 0 ? (
          <div className="p-8 text-center text-[#7A8493]">
            <span className="text-2xl block mb-2">🔍</span>
            <p className="font-poppins text-sm font-bold text-[#0F2044]">No Matching Products Found</p>
            <p className="text-xs mt-1">Try adjusting your search query, department, or stock filters.</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs min-w-[680px]">
            <thead>
              <tr className="border-b border-black/5 text-[10px] font-bold uppercase tracking-wider text-[#8A94A3]">
                <th className="pb-2.5">Product &amp; SKU</th>
                <th className="pb-2.5">Barcode</th>
                <th className="pb-2.5">Department</th>
                <th className="pb-2.5">Price / MRP</th>
                <th className="pb-2.5">Stock</th>
                <th className="pb-2.5">Shelf Status</th>
                <th className="pb-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {filteredItems.map((item) => {
                const stock = item.stockQuantity;
                const isLow = stock <= 10 && stock > 0;
                const isOut = stock === 0;

                return (
                  <tr key={item.inventoryId} className={`transition ${!item.isAvailable ? "bg-gray-50/60 opacity-75" : "hover:bg-[#F9FAFB]/80"}`}>
                    {/* Name & Unit */}
                    <td className="py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8F9FA] text-xl border border-black/5 shadow-2xs shrink-0 overflow-hidden p-0.5">
                          <ProductImage
                            src={item.imageUrl}
                            alt={item.name}
                            fallbackEmoji={item.emoji || "🛍️"}
                            className="h-full w-full object-contain"
                          />
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-[#0F2044] truncate">{item.name}</p>
                          <p className="text-[10px] text-[#7A8493]">
                            {item.brand} · {item.unitSize || "1 unit"}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Barcode */}
                    <td className="py-3 font-mono font-medium text-[#7A8493] text-[11px]">
                      {item.barcode}
                    </td>

                    {/* Category */}
                    <td className="py-3 text-[#7A8493] text-[11px]">
                      {item.category}
                    </td>

                    {/* Price & MRP */}
                    <td className="py-3">
                      <span className="font-bold text-[#0F2044]">{fmt(item.price)}</span>
                      {item.mrp && item.mrp > item.price && (
                        <span className="block text-[10px] text-[#8A94A3] line-through">
                          {fmt(item.mrp)}
                        </span>
                      )}
                    </td>

                    {/* Stock level */}
                    <td className="py-3">
                      <span
                        className={`inline-block font-semibold ${
                          isOut ? "text-red-600" : isLow ? "text-amber-600 font-bold" : "text-[#0F2044]"
                        }`}
                      >
                        {stock} units
                      </span>
                    </td>

                    {/* Shelf Status */}
                    <td className="py-3">
                      <div className="flex flex-col gap-1 items-start">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                            !item.isAvailable
                              ? "bg-gray-200 text-gray-700"
                              : isOut
                              ? "bg-red-100 text-red-800"
                              : isLow
                              ? "bg-amber-100 text-amber-900"
                              : "bg-[#EEF8F0] text-[#2E9E44]"
                          }`}
                        >
                          {!item.isAvailable ? "DEACTIVATED" : isOut ? "OUT OF STOCK" : isLow ? "LOW STOCK" : "ACTIVE"}
                        </span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          className="rounded-lg border border-black/10 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#0F2044] hover:bg-[#F8F9FA] shadow-2xs"
                        >
                          Edit
                        </button>
                        {item.isAvailable ? (
                          <button
                            type="button"
                            onClick={() => setDeactivatingItem(item)}
                            className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 shadow-2xs"
                            title="Safely hide this product from customer catalog without deleting order history"
                          >
                            Hide
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleToggleAvailability(item, true)}
                            disabled={isMutating}
                            className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100 shadow-2xs disabled:opacity-50"
                            title="Reactivate this product on store shelves"
                          >
                            Activate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── EDIT PRODUCT MODAL (Store Inventory Values Editable, Master Metadata Protected) ── */}
      {editingItem && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2044]/60 p-4 backdrop-blur-xs qless-fade-in"
        >
          <div className="w-full max-w-[500px] rounded-3xl bg-white p-5 sm:p-6 shadow-2xl space-y-4 qless-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-black/5 pb-3">
              <div>
                <h3 className="font-poppins text-base font-bold text-[#0F2044]">
                  Edit Store Product Details
                </h3>
                <p className="text-[11px] text-[#7A8493]">
                  SKU #{editingItem.productId} · Store {targetStoreId}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="h-8 w-8 rounded-full bg-[#F3F4F6] text-sm text-[#7A8493] hover:text-[#0F2044]"
              >
                ✕
              </button>
            </div>

            {/* Enterprise Master Catalog Protection Notice */}
            <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-3 text-[11px] text-blue-900 leading-relaxed flex items-start gap-2">
              <span className="text-base shrink-0">ℹ️</span>
              <div>
                <strong className="block font-semibold">Master Catalog Protection</strong>
                Global product metadata (name, barcode, department) is managed at the enterprise catalog level. Store administrators can configure store-specific selling price, MRP, stock quantity, and shelf visibility.
              </div>
            </div>

            {formErrors.general && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-2.5 text-xs text-red-800">
                {formErrors.general}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-3">
              {/* Master Catalog Read-Only Attributes */}
              <div className="rounded-xl border border-black/5 bg-[#F9FAFB] p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3]">
                    Master Catalog Definition
                  </span>
                  <span className="text-[10px] bg-black/5 text-[#7A8493] px-2 py-0.5 rounded-full font-medium">
                    Read-Only
                  </span>
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-2xl">{editingItem.emoji || "🛍️"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-xs text-[#0F2044] truncate">{editingItem.name}</p>
                    <p className="text-[10px] text-[#7A8493] font-mono">
                      Barcode: {editingItem.barcode} · Brand: {editingItem.brand} · Unit: {editingItem.unitSize}
                    </p>
                    <p className="text-[10px] text-[#7A8493]">
                      Department: {editingItem.category}
                    </p>
                  </div>
                </div>
              </div>

              {/* Editable Store-Specific Values */}
              <div className="space-y-3 pt-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#2E9E44]">
                  Store-Specific Pricing &amp; Inventory (STORE001)
                </span>

                {/* Price & MRP */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#0F2044] mb-1">
                      Store Selling Price (₹) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.5"
                      value={priceInput}
                      onChange={(e) => setPriceInput(e.target.value)}
                      placeholder="e.g. 50.00"
                      className="w-full rounded-xl border border-black/15 bg-white p-2 text-xs font-semibold text-[#0F2044] focus:border-[#2E9E44] focus:outline-none"
                    />
                    {formErrors.price && <p className="text-[10px] text-red-600 mt-0.5">{formErrors.price}</p>}
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#0F2044] mb-1">
                      MRP (₹ optional)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.5"
                      value={mrpInput}
                      onChange={(e) => setMrpInput(e.target.value)}
                      placeholder="e.g. 55.00"
                      className="w-full rounded-xl border border-black/15 bg-white p-2 text-xs font-semibold text-[#0F2044] focus:border-[#2E9E44] focus:outline-none"
                    />
                    {formErrors.mrp && <p className="text-[10px] text-red-600 mt-0.5">{formErrors.mrp}</p>}
                  </div>
                </div>

                {/* Stock Quantity & Availability */}
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#0F2044] mb-1">
                      Store Stock Quantity (units) *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={stockInput}
                      onChange={(e) => setStockInput(e.target.value)}
                      className="w-full rounded-xl border border-black/15 bg-white p-2 text-xs font-semibold text-[#0F2044] focus:border-[#2E9E44] focus:outline-none"
                    />
                    {formErrors.stock && <p className="text-[10px] text-red-600 mt-0.5">{formErrors.stock}</p>}
                  </div>
                  <div className="flex items-center pt-5">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isAvailableInput}
                        onChange={(e) => setIsAvailableInput(e.target.checked)}
                        className="h-4 w-4 rounded text-[#2E9E44] focus:ring-0"
                      />
                      <span className="text-xs font-semibold text-[#0F2044]">
                        Available on Store Shelves
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 flex justify-end gap-2 border-t border-black/5">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  disabled={isMutating}
                  className="rounded-xl border border-black/10 px-4 py-2 text-xs font-semibold text-[#7A8493] hover:bg-[#F8F9FA] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isMutating}
                  className="rounded-xl bg-[#2E9E44] px-5 py-2 font-poppins text-xs font-bold text-white hover:bg-[#288B3B] shadow-xs active:scale-95 disabled:opacity-50"
                >
                  {isMutating ? "Saving to Supabase..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── ADD PRODUCT ARCHITECTURAL MODAL (Master Catalog Notice) ── */}
      {isAddModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2044]/60 p-4 backdrop-blur-xs qless-fade-in"
        >
          <div className="w-full max-w-[480px] rounded-3xl bg-white p-6 shadow-2xl space-y-4 qless-scale-in">
            <div className="flex items-center justify-between border-b border-black/5 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-800 text-sm font-bold">
                  🏷️
                </span>
                <div>
                  <h3 className="font-poppins text-base font-bold text-[#0F2044]">
                    Add New Catalog Product
                  </h3>
                  <p className="text-[11px] text-[#7A8493]">
                    Enterprise Catalog Provisioning
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onCloseAddModal && onCloseAddModal()}
                className="h-8 w-8 rounded-full bg-[#F3F4F6] text-sm text-[#7A8493] hover:text-[#0F2044]"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-[#0F2044] leading-relaxed">
              <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-blue-950 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <span>🔒</span>
                  <span>Master Catalog RLS Protection</span>
                </div>
                <p className="text-[11px] text-blue-900 leading-relaxed">
                  Universal SKU additions are restricted at the database level to maintain chain-wide barcode uniqueness, tax categories, and catalog synchronization.
                </p>
                <div className="font-mono text-[10px] bg-white/80 p-2 rounded-lg border border-blue-200/80 text-blue-950">
                  Postgres RLS Policy: &quot;Verified shoppers and staff read products&quot; allows SELECT only.
                </div>
              </div>

              <div className="rounded-xl border border-black/5 bg-[#F9FAFB] p-3 text-[11px] text-[#7A8493] space-y-1">
                <strong className="block text-[#0F2044]">Required Enterprise Provisioning:</strong>
                <p>
                  To safely register new SKUs into the enterprise database, a privileged migration or an authorized <code className="font-mono text-[#0F2044]">create_catalog_product(...)</code> RPC is required.
                </p>
                <p className="pt-1">
                  As store administrator for <strong>{targetStoreId}</strong>, you have full live authorization to manage prices, stock levels, and shelf availability for all 30 pre-provisioned supermarket products.
                </p>
              </div>
            </div>

            <div className="pt-2 flex justify-end border-t border-black/5">
              <button
                type="button"
                onClick={() => onCloseAddModal && onCloseAddModal()}
                className="rounded-xl bg-[#0F2044] px-5 py-2 font-poppins text-xs font-bold text-white hover:bg-[#1A3366] transition active:scale-95 shadow-xs"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DEACTIVATE / HIDE CONFIRMATION MODAL ── */}
      {deactivatingItem && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2044]/60 p-4 backdrop-blur-xs qless-fade-in"
        >
          <div className="w-full max-w-[420px] rounded-3xl bg-white p-5 shadow-2xl space-y-3 qless-scale-in">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 text-xl mx-auto">
              👁️‍🗨️
            </div>
            <div className="text-center">
              <h4 className="font-poppins text-base font-bold text-[#0F2044]">
                Deactivate &amp; Hide Product?
              </h4>
              <p className="text-xs text-[#7A8493] mt-1.5 leading-relaxed">
                Deactivate <strong className="text-[#0F2044]">{deactivatingItem.name}</strong> ({deactivatingItem.barcode})?
              </p>
              <div className="mt-2.5 rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-left text-[11px] text-amber-900 leading-relaxed">
                <strong>Data Protection:</strong> This safely sets <code className="font-mono font-bold">is_available = false</code> in <code className="font-mono">store_inventory</code>. The item is immediately removed from customer search and self-checkout scanning, while preserving historical receipts, orders, and database referential integrity.
              </div>
            </div>
            <div className="pt-2 flex justify-end gap-2 border-t border-black/5">
              <button
                type="button"
                onClick={() => setDeactivatingItem(null)}
                disabled={isMutating}
                className="flex-1 rounded-xl border border-black/10 px-3 py-2 text-xs font-semibold text-[#0F2044] hover:bg-[#F8F9FA] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleToggleAvailability(deactivatingItem, false)}
                disabled={isMutating}
                className="flex-1 rounded-xl bg-amber-600 px-3 py-2 font-poppins text-xs font-bold text-white hover:bg-amber-700 shadow-xs disabled:opacity-50"
              >
                {isMutating ? "Deactivating..." : "Deactivate & Hide"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
