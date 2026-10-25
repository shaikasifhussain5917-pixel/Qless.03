import { useState, useMemo, useEffect, useCallback } from "react";
import { Product, ProductLocation, LocationVerificationStatus, StoreAisleDefinition } from "../../types";
import { useShopping } from "../../context/ShoppingContext";
import { STORE_AISLES } from "../../data/mockStoreLayout";
import { LAUNCH_STORE_ID } from "../../config/storeConfig";
import { IcAlert, IcCheck, IcClose, IcSearch } from "../common/Icons";
import {
  fetchLiveStoreAisles,
  fetchLiveProductLocations,
  upsertLiveProductLocation,
} from "../../services/adminLocationService";

interface AdminLocationsTabProps {
  catalog: Product[];
  storeId?: string;
}

export function AdminLocationsTab({
  catalog,
  storeId = LAUNCH_STORE_ID,
}: AdminLocationsTabProps) {
  const { updateLocation: updateShoppingContextLocation } = useShopping();

  // Live Database State
  const [locations, setLocations] = useState<ProductLocation[]>([]);
  const [aisles, setAisles] = useState<StoreAisleDefinition[]>(STORE_AISLES);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [aisleFilter, setAisleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | LocationVerificationStatus>("all");

  // Edit / Assign Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form Fields
  const [formData, setFormData] = useState({
    productId: 0,
    aisleCode: "A01",
    aisleName: "Dairy & Refrigerated",
    rackCode: "R01",
    shelfCode: "S01",
    verificationStatus: "VERIFIED" as LocationVerificationStatus,
    notes: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Success / Error Feedback
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Load authoritative aisles & product locations from Supabase
  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setLoadError(null);

    try {
      const [aislesResult, locsResult] = await Promise.all([
        fetchLiveStoreAisles(storeId),
        fetchLiveProductLocations(storeId),
      ]);

      if (aislesResult.error || locsResult.error) {
        const err = locsResult.error || aislesResult.error;
        setLoadError(err);
      } else {
        if (aislesResult.aisles.length > 0) {
          setAisles(aislesResult.aisles);
        }
        setLocations(locsResult.locations);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load location data from Supabase.");
    } finally {
      if (isRefresh) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  }, [storeId]);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // Helper to get aisle by code from live database aisles
  const getAisleByCodeLive = useCallback(
    (code: string): StoreAisleDefinition | undefined => {
      return aisles.find((a) => a.code.toUpperCase() === code.toUpperCase());
    },
    [aisles]
  );

  // Map product with its authoritative location record
  const enrichedProducts = useMemo(() => {
    return catalog.map((product) => {
      const loc = locations.find((l) => l.productId === product.id);
      return {
        product,
        location: loc || null,
        status: (loc?.verificationStatus || "MISSING") as LocationVerificationStatus,
      };
    });
  }, [catalog, locations]);

  // Statistics counters
  const stats = useMemo(() => {
    const verified = enrichedProducts.filter((p) => p.status === "VERIFIED").length;
    const unverified = enrichedProducts.filter((p) => p.status === "UNVERIFIED").length;
    const missing = enrichedProducts.filter((p) => p.status === "MISSING").length;
    return { verified, unverified, missing, total: enrichedProducts.length };
  }, [enrichedProducts]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedProducts.filter(({ product, location, status }) => {
      // Search matching
      if (q) {
        const matchesName = product.name.toLowerCase().includes(q);
        const matchesBarcode = product.barcode.includes(q);
        const matchesAisle = location
          ? location.aisleName.toLowerCase().includes(q) || location.aisleCode.toLowerCase().includes(q)
          : false;
        const matchesRack = location ? location.rackCode.toLowerCase().includes(q) : false;
        if (!matchesName && !matchesBarcode && !matchesAisle && !matchesRack) {
          return false;
        }
      }

      // Aisle filter
      if (aisleFilter !== "all") {
        if (!location || location.aisleCode.toUpperCase() !== aisleFilter.toUpperCase()) {
          return false;
        }
      }

      // Status filter
      if (statusFilter !== "all") {
        if (status !== statusFilter) {
          return false;
        }
      }

      return true;
    });
  }, [enrichedProducts, searchQuery, aisleFilter, statusFilter]);

  // Open Edit Modal for a product
  const handleOpenEdit = (product: Product, existingLoc: ProductLocation | null) => {
    setSelectedProduct(product);

    if (existingLoc) {
      setFormData({
        productId: product.id,
        aisleCode: existingLoc.aisleCode,
        aisleName: existingLoc.aisleName,
        rackCode: existingLoc.rackCode,
        shelfCode: existingLoc.shelfCode,
        verificationStatus: existingLoc.verificationStatus,
        notes: existingLoc.notes || "",
      });
    } else {
      // Suggest default aisle matching product category if possible
      const matchingAisle =
        aisles.find((a) => a.category.toLowerCase() === product.category.toLowerCase()) ||
        aisles[0] || {
          code: "A01",
          name: "General Aisles",
          racks: ["R01"],
        };

      setFormData({
        productId: product.id,
        aisleCode: matchingAisle.code,
        aisleName: matchingAisle.name,
        rackCode: matchingAisle.racks[0] || "R01",
        shelfCode: "S01",
        verificationStatus: "VERIFIED",
        notes: "",
      });
    }

    setFormErrors({});
    setIsModalOpen(true);
  };

  // Handle Aisle Change in Form (auto-updates aisle name and default rack)
  const handleAisleChange = (code: string) => {
    const aisleDef = getAisleByCodeLive(code);
    setFormData((prev) => ({
      ...prev,
      aisleCode: code,
      aisleName: aisleDef ? aisleDef.name : prev.aisleName,
      rackCode: aisleDef?.racks[0] || prev.rackCode,
    }));
  };

  // Validate form
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.aisleCode.trim()) {
      errors.aisleCode = "Aisle code is required.";
    }

    if (!formData.rackCode.trim()) {
      errors.rackCode = "Rack code is required (e.g. R04, R12).";
    }

    if (!formData.shelfCode.trim()) {
      errors.shelfCode = "Shelf code is required (e.g. S01, S02).";
    }

    if (!["VERIFIED", "UNVERIFIED", "MISSING"].includes(formData.verificationStatus)) {
      errors.verificationStatus = "Please select a valid status.";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Save location assignment to Supabase
  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm() || isSaving) return;

    setIsSaving(true);
    setFeedback(null);

    const res = await upsertLiveProductLocation({
      storeId,
      productId: formData.productId,
      aisleCode: formData.aisleCode.trim().toUpperCase(),
      aisleName: formData.aisleName.trim(),
      rackCode: formData.rackCode.trim().toUpperCase(),
      shelfCode: formData.shelfCode.trim().toUpperCase(),
      verificationStatus: formData.verificationStatus,
      notes: formData.notes.trim() || undefined,
    });

    if (res.success && res.location) {
      const savedLoc = res.location;
      // Update local state immediately
      setLocations((prev) => {
        const idx = prev.findIndex((l) => l.productId === savedLoc.productId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = savedLoc;
          return next;
        }
        return [...prev, savedLoc];
      });

      // Synchronize with ShoppingContext so Customer SmartFind reflects the new coordinates
      if (updateShoppingContextLocation) {
        updateShoppingContextLocation(savedLoc);
      }

      setFeedback({
        type: "success",
        message: `✓ Saved location for "${selectedProduct?.name}" to Aisle ${savedLoc.aisleCode}, Rack ${savedLoc.rackCode}, Shelf ${savedLoc.shelfCode} (${savedLoc.verificationStatus}) in Supabase.`,
      });
      setIsModalOpen(false);
      setTimeout(() => setFeedback(null), 5000);
    } else {
      setFeedback({
        type: "error",
        message: res.error || "Failed to persist location in Supabase.",
      });
    }

    setIsSaving(false);
  };

  const currentAisleDef = getAisleByCodeLive(formData.aisleCode);

  return (
    <div className="space-y-4 qless-fade-in text-xs">
      {/* Feedback Banner */}
      {feedback && (
        <div
          role="alert"
          className={`flex items-center justify-between rounded-2xl p-3.5 text-xs font-semibold qless-fade-in ${
            feedback.type === "success"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? <IcCheck /> : <IcAlert />}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-[10px] uppercase font-bold opacity-75 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top Header & Overview Counters */}
      <div className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-sm backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-black/5 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-poppins text-lg font-bold text-[#0F2044] flex items-center gap-2">
                <span>📍</span>
                <span>Product Locations</span>
              </h2>
              <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[9.5px] font-bold text-emerald-700">
                ● Live Database (public.product_locations)
              </span>
            </div>
            <p className="text-xs text-[#7A8493] mt-0.5">
              Authoritative aisle, rack, and shelf coordinates for QLess Mart ({storeId}) synchronized with customer SmartFind
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadData(true)}
              disabled={isRefreshing || isLoading || isSaving}
              className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2044] hover:bg-[#F8F9FA] transition shadow-2xs disabled:opacity-60"
              title="Refresh locations directly from Supabase"
            >
              <svg
                className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-[#2E9E44]" : "text-[#7A8493]"}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {isRefreshing ? "Refreshing..." : "Refresh Locations"}
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div className="rounded-2xl border border-slate-100 bg-[#F9FAFB] p-3 text-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A94A3]">
              Catalog Items
            </span>
            <p className="font-poppins text-xl font-extrabold text-[#0F2044] mt-0.5">
              {stats.total}
            </p>
            <span className="text-[10px] text-slate-500">Tracked SKU count</span>
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3 text-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
              Verified
            </span>
            <p className="font-poppins text-xl font-extrabold text-[#2E9E44] mt-0.5">
              {stats.verified}
            </p>
            <span className="text-[10px] text-emerald-700">Confirmed on shelf</span>
          </div>

          <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-3 text-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
              Unverified
            </span>
            <p className="font-poppins text-xl font-extrabold text-amber-700 mt-0.5">
              {stats.unverified}
            </p>
            <span className="text-[10px] text-amber-800">Requires audit</span>
          </div>

          <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-3 text-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800">
              Unassigned
            </span>
            <p className="font-poppins text-xl font-extrabold text-rose-700 mt-0.5">
              {stats.missing}
            </p>
            <span className="text-[10px] text-rose-800">Missing rack coords</span>
          </div>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="rounded-3xl border border-white/70 bg-white/90 p-4 shadow-sm backdrop-blur-md space-y-3">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[#7A8493]">
              <IcSearch />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by product name, barcode, aisle, or rack…"
              className="w-full rounded-xl border border-[#D8DDE3] bg-white py-2 pl-9 pr-8 text-xs font-semibold text-[#0F2044] placeholder-[#A0A8B4] focus:border-[#2E9E44] focus:outline-none focus:ring-2 focus:ring-[#2E9E44]/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-[#A0A8B4] hover:text-[#0F2044]"
              >
                <IcClose />
              </button>
            )}
          </div>

          {/* Aisle Filter Dropdown */}
          <div className="w-full md:w-56">
            <select
              value={aisleFilter}
              onChange={(e) => setAisleFilter(e.target.value)}
              className="w-full rounded-xl border border-[#D8DDE3] bg-white px-3 py-2 text-xs font-semibold text-[#0F2044] focus:border-[#2E9E44] focus:outline-none"
            >
              <option value="all">All Aisles ({aisles.length})</option>
              {aisles.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
          </div>

          {/* Verification Status Filter */}
          <div className="w-full md:w-44">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full rounded-xl border border-[#D8DDE3] bg-white px-3 py-2 text-xs font-semibold text-[#0F2044] focus:border-[#2E9E44] focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="VERIFIED">Verified Only</option>
              <option value="UNVERIFIED">Unverified Only</option>
              <option value="MISSING">Missing / Unassigned</option>
            </select>
          </div>

          {/* Quick Toggle: Show Missing Only */}
          <button
            type="button"
            onClick={() => {
              if (statusFilter === "MISSING") {
                setStatusFilter("all");
              } else {
                setStatusFilter("MISSING");
              }
            }}
            className={`w-full md:w-auto shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition ${
              statusFilter === "MISSING"
                ? "bg-rose-600 text-white shadow-xs"
                : "border border-black/10 bg-white text-[#7A8493] hover:text-[#0F2044]"
            }`}
          >
            {statusFilter === "MISSING" ? "✓ Showing Missing" : "Show Missing Only"}
          </button>
        </div>

        {/* Results Counter */}
        <div className="flex items-center justify-between text-xs text-[#7A8493] pt-1">
          <span>
            Showing <strong className="text-[#0F2044]">{filteredRows.length}</strong> of{" "}
            {enrichedProducts.length} items
          </span>
          {(searchQuery || aisleFilter !== "all" || statusFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setAisleFilter("all");
                setStatusFilter("all");
              }}
              className="text-[11px] font-semibold text-[#0F2044] hover:underline"
            >
              Clear All Filters
            </button>
          )}
        </div>
      </div>

      {/* Locations Table / Responsive List */}
      <div className="rounded-3xl border border-white/70 bg-white/95 shadow-sm backdrop-blur-md overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-[#7A8493]">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-[#0F2044]">
              <svg className="h-6 w-6 animate-spin text-[#2E9E44]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <p className="font-poppins text-sm font-bold text-[#0F2044]">Querying Database Locations…</p>
            <p className="text-xs text-[#7A8493] mt-1">
              Loading authoritative aisle and shelf coordinates for store {storeId} via Supabase RLS
            </p>
          </div>
        ) : loadError ? (
          <div className="py-12 px-4 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-2xl text-red-600 border border-red-200">
              ⚠️
            </div>
            <p className="font-poppins text-sm font-bold text-red-900">
              Failed to Load Locations from Supabase
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
        ) : filteredRows.length === 0 ? (
          /* Empty State */
          <div className="p-12 text-center">
            <span className="text-3xl block mb-2">🔍</span>
            <h4 className="font-poppins text-base font-bold text-[#0F2044]">
              No Product Locations Found
            </h4>
            <p className="mt-1 text-xs text-[#7A8493] max-w-sm mx-auto">
              No products match your current search and filter settings. Try adjusting the aisle, status, or search query.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setAisleFilter("all");
                setStatusFilter("all");
              }}
              className="mt-4 rounded-xl bg-[#0F2044] px-4 py-2 font-poppins text-xs font-semibold text-white shadow-xs hover:bg-[#1A3163]"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-black/5 bg-[#F9FAFB] text-[10.5px] font-bold uppercase tracking-wider text-[#7A8493]">
                  <th className="py-3 px-4">Product</th>
                  <th className="py-3 px-3">Barcode</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3">Aisle</th>
                  <th className="py-3 px-3">Rack &amp; Shelf</th>
                  <th className="py-3 px-3">Verification</th>
                  <th className="py-3 px-3">Last Updated</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 text-[#0F2044]">
                {filteredRows.map(({ product, location, status }) => {
                  const isVerified = status === "VERIFIED";
                  const isUnverified = status === "UNVERIFIED";

                  const formattedDate = location?.updatedAt
                    ? new Date(location.updatedAt).toLocaleDateString("en-IN", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—";

                  return (
                    <tr
                      key={product.id}
                      className="hover:bg-[#F8F9FA]/80 transition group"
                    >
                      {/* Product Name & Emoji */}
                      <td className="py-3 px-4 font-semibold">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-base">
                            {product.emoji || "🛍️"}
                          </span>
                          <div>
                            <p className="text-[#0F2044] font-bold">{product.name}</p>
                            <span className="text-[10px] text-[#7A8493]">
                              {product.unitSize || "1 unit"}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Barcode */}
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-600">
                        {product.barcode}
                      </td>

                      {/* Category */}
                      <td className="py-3 px-3 text-slate-600">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                          {product.category}
                        </span>
                      </td>

                      {/* Aisle */}
                      <td className="py-3 px-3">
                        {location ? (
                          <div>
                            <span className="font-poppins font-bold text-[#0F2044]">
                              {location.aisleCode}
                            </span>
                            <span className="block text-[10px] text-[#7A8493] truncate max-w-[140px]">
                              {location.aisleName}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Not Assigned</span>
                        )}
                      </td>

                      {/* Rack & Shelf */}
                      <td className="py-3 px-3">
                        {location ? (
                          <div className="flex items-center gap-1.5">
                            <span className="rounded-md bg-blue-50 border border-blue-200 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-800">
                              Rack {location.rackCode}
                            </span>
                            <span className="rounded-md bg-purple-50 border border-purple-200 px-1.5 py-0.5 font-mono text-[10px] font-bold text-purple-800">
                              Shelf {location.shelfCode}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">—</span>
                        )}
                      </td>

                      {/* Verification Status Pill */}
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                            isVerified
                              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                              : isUnverified
                              ? "bg-amber-50 border-amber-200 text-amber-800"
                              : "bg-rose-50 border-rose-200 text-rose-800"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              isVerified
                                ? "bg-emerald-500"
                                : isUnverified
                                ? "bg-amber-500"
                                : "bg-rose-500"
                            }`}
                          />
                          {status}
                        </span>
                      </td>

                      {/* Last Updated */}
                      <td className="py-3 px-3 text-[10px] text-[#7A8493]">
                        {formattedDate}
                      </td>

                      {/* Action Button */}
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(product, location)}
                          className="rounded-xl border border-black/10 bg-white px-3 py-1.5 font-poppins text-xs font-semibold text-[#0F2044] hover:bg-[#2E9E44] hover:text-white hover:border-[#2E9E44] shadow-2xs transition active:scale-95"
                        >
                          {location ? "Edit Location" : "Assign Coordinates"}
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

      {/* ── EDIT / ASSIGN LOCATION MODAL ── */}
      {isModalOpen && selectedProduct && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2044]/60 p-4 backdrop-blur-xs qless-fade-in"
        >
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4 qless-scale-in max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-black/5 pb-3">
              <div>
                <h3 className="font-poppins text-base font-bold text-[#0F2044]">
                  Assign Physical Coordinates
                </h3>
                <p className="text-xs text-[#7A8493]">
                  Configure supermarket floor-plan placement in Supabase
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="h-8 w-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 hover:bg-slate-200 flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            {/* Product Card Header */}
            <div className="flex items-center gap-3 rounded-2xl bg-[#F8F9FA] p-3 border border-black/5">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-2xl shadow-2xs">
                {selectedProduct.emoji || "🛍️"}
              </span>
              <div className="min-w-0">
                <p className="font-poppins text-sm font-bold text-[#0F2044] truncate">
                  {selectedProduct.name}
                </p>
                <p className="text-xs text-[#7A8493]">
                  Barcode: <span className="font-mono">{selectedProduct.barcode}</span> · {selectedProduct.category}
                </p>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveLocation} className="mt-4 space-y-3.5">
              {/* Aisle Selection */}
              <div>
                <label className="block text-xs font-bold text-[#0F2044] mb-1">
                  Store Aisle <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.aisleCode}
                  onChange={(e) => handleAisleChange(e.target.value)}
                  className="w-full rounded-xl border border-[#D8DDE3] bg-white px-3 py-2 text-xs font-semibold text-[#0F2044] focus:border-[#2E9E44] focus:outline-none"
                >
                  {aisles.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} — {a.name} ({a.zone})
                    </option>
                  ))}
                </select>
                {formErrors.aisleCode && (
                  <p className="mt-1 text-[11px] text-red-600">{formErrors.aisleCode}</p>
                )}
              </div>

              {/* Rack Code & Shelf Code */}
              <div className="grid grid-cols-2 gap-3">
                {/* Rack */}
                <div>
                  <label className="block text-xs font-bold text-[#0F2044] mb-1">
                    Rack Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.rackCode}
                    onChange={(e) => setFormData((prev) => ({ ...prev, rackCode: e.target.value }))}
                    placeholder="e.g. R02"
                    className="w-full rounded-xl border border-[#D8DDE3] bg-white px-3 py-2 text-xs font-semibold text-[#0F2044] focus:border-[#2E9E44] focus:outline-none uppercase"
                  />
                  {/* Quick pills from current aisle */}
                  {currentAisleDef && currentAisleDef.racks && currentAisleDef.racks.length > 0 && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {currentAisleDef.racks.map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, rackCode: r }))}
                          className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                            formData.rackCode === r
                              ? "bg-[#0F2044] text-white"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  )}
                  {formErrors.rackCode && (
                    <p className="mt-1 text-[11px] text-red-600">{formErrors.rackCode}</p>
                  )}
                </div>

                {/* Shelf */}
                <div>
                  <label className="block text-xs font-bold text-[#0F2044] mb-1">
                    Shelf Tier <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.shelfCode}
                    onChange={(e) => setFormData((prev) => ({ ...prev, shelfCode: e.target.value }))}
                    placeholder="e.g. S01"
                    className="w-full rounded-xl border border-[#D8DDE3] bg-white px-3 py-2 text-xs font-semibold text-[#0F2044] focus:border-[#2E9E44] focus:outline-none uppercase"
                  />
                  {/* Quick shelf pills */}
                  <div className="flex gap-1 mt-1.5">
                    {["S01", "S02", "S03", "S04"].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, shelfCode: s }))}
                        className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                          formData.shelfCode === s
                            ? "bg-[#0F2044] text-white"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  {formErrors.shelfCode && (
                    <p className="mt-1 text-[11px] text-red-600">{formErrors.shelfCode}</p>
                  )}
                </div>
              </div>

              {/* Verification Status */}
              <div>
                <label className="block text-xs font-bold text-[#0F2044] mb-1">
                  Location Verification Status <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["VERIFIED", "UNVERIFIED", "MISSING"] as LocationVerificationStatus[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, verificationStatus: st }))}
                      className={`rounded-xl py-2 px-2 text-[11px] font-bold border transition ${
                        formData.verificationStatus === st
                          ? st === "VERIFIED"
                            ? "bg-emerald-600 border-emerald-600 text-white shadow-xs"
                            : st === "UNVERIFIED"
                            ? "bg-amber-600 border-amber-600 text-white shadow-xs"
                            : "bg-rose-600 border-rose-600 text-white shadow-xs"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Staff Notes */}
              <div>
                <label className="block text-xs font-bold text-[#0F2044] mb-1">
                  Internal Placement Note (Optional)
                </label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="e.g. Eye level display, left-hand divider"
                  className="w-full rounded-xl border border-[#D8DDE3] bg-white px-3 py-2 text-xs text-[#0F2044] focus:border-[#2E9E44] focus:outline-none"
                />
              </div>

              {/* SmartFind Sync Notice */}
              <div className="rounded-xl bg-emerald-50/70 border border-emerald-200 p-2.5 text-[10.5px] text-emerald-950 leading-relaxed">
                <strong>Authoritative SmartFind Sync:</strong> Saving this record persists directly to <code className="font-mono font-bold bg-emerald-100 px-1 py-0.5 rounded">public.product_locations</code> for store {storeId}. Customer SmartFind navigation maps and in-store search results will immediately reflect these coordinates.
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-black/5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSaving}
                  className="rounded-xl border border-black/10 px-4 py-2 font-poppins text-xs font-semibold text-[#7A8493] hover:text-[#0F2044] hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-xl bg-[#2E9E44] px-5 py-2 font-poppins text-xs font-bold text-white shadow-sm hover:bg-[#288B3B] transition disabled:opacity-50 active:scale-95"
                >
                  {isSaving ? "Saving to Supabase..." : "Save Coordinates"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
