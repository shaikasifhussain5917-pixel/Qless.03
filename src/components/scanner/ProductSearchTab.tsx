import { useState, useMemo } from "react";
import { Product, ProductLocation } from "../../types";
import { fmt } from "../../utils/formatters";
import { useShopping } from "../../context/ShoppingContext";
import { IcClose, IcScan, IcSearch } from "../common/Icons";
import { ProductImage } from "../common/ProductImage";

interface ProductSearchTabProps {
  onSelectProduct: (product: Product) => void;
  onOpenCatalog: () => void;
  onViewLocation?: (product: Product, location: ProductLocation | null) => void;
}

export function ProductSearchTab({
  onSelectProduct,
  onOpenCatalog,
  onViewLocation,
}: ProductSearchTabProps) {
  const [query, setQuery] = useState("");
  const { getLocation, searchProducts } = useShopping();

  const results = useMemo(() => {
    return searchProducts(query);
  }, [query, searchProducts]);

  return (
    <div className="flex flex-col py-2 qless-fade-in">
      {/* Search Bar Input */}
      <div className="relative mb-3">
        <label htmlFor="product-search-input" className="sr-only">
          Search Products
        </label>
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#7A8493]">
          <IcSearch />
        </div>

        <input
          id="product-search-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by product name, e.g. Milk, Apples, Lays…"
          autoFocus
          className="w-full rounded-xl border-2 border-[#D8DDE3] bg-white py-3 pl-11 pr-11 text-base sm:text-sm font-semibold text-[#0F2044] placeholder-[#A0A8B4] transition focus:border-[#2E9E44] focus:outline-none focus:ring-2 focus:ring-[#2E9E44]/20"
        />

        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search query"
            className="absolute inset-y-0 right-0 min-h-[44px] min-w-[44px] flex items-center justify-center text-[#A0A8B4] hover:text-[#0F2044]"
          >
            <IcClose />
          </button>
        )}
      </div>

      {/* Results Header */}
      <div className="mb-2 flex items-center justify-between text-xs text-[#7A8493]">
        <span>
          {query ? `Found ${results.length} item${results.length === 1 ? "" : "s"}` : "Popular in Store"}
        </span>
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="text-[11px] font-semibold text-[#0F2044] hover:underline"
          >
            Clear Search
          </button>
        )}
      </div>

      {/* Results List */}
      <div className="max-h-[380px] overflow-y-auto space-y-2.5 pr-1">
        {results.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#D8DDE3] bg-[#F9FAFB] p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-2xl shadow-xs">
              🔍
            </div>
            <p className="mt-3 font-poppins text-sm font-bold text-[#0F2044]">
              No Products Found
            </p>
            <p className="mt-1 text-xs text-[#7A8493]">
              No items match "<span className="font-semibold">{query}</span>".
            </p>
            <button
              type="button"
              onClick={onOpenCatalog}
              className="mt-4 rounded-xl bg-[#0F2044] px-4 py-2 font-poppins text-xs font-semibold text-white shadow-xs transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F2044]"
            >
              Browse Full Catalog
            </button>
          </div>
        ) : (
          results.map((product) => {
            const isOutOfStock =
              product.isAvailable === false ||
              (product.stockQuantity !== undefined && product.stockQuantity <= 0);

            const location = getLocation(product.id);
            const isVerified = location?.verificationStatus === "VERIFIED";
            const isUnverified = location?.verificationStatus === "UNVERIFIED";
            const isMissing = !location || location.verificationStatus === "MISSING";

            return (
              <div
                key={product.id}
                className={`group flex flex-col rounded-2xl border p-3 shadow-xs transition ${
                  isOutOfStock
                    ? "border-black/5 bg-[#FBFBFB] opacity-85"
                    : "border-black/5 bg-white hover:border-[#2E9E44]/40 hover:shadow-sm"
                }`}
              >
                {/* Product Header & Pricing */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#F8F9FA] text-2xl border border-black/5 overflow-hidden p-1">
                      <ProductImage
                        src={product.imageUrl}
                        alt={product.name}
                        fallbackEmoji={product.emoji}
                        className="h-full w-full object-contain"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h5 className="truncate font-poppins text-sm font-bold text-[#0F2044]">
                          {product.name}
                        </h5>
                        {isOutOfStock ? (
                          <span className="rounded bg-red-50 border border-red-200 px-1.5 py-0.2 text-[9px] font-bold text-red-700">
                            Out of Stock
                          </span>
                        ) : product.discountBadge ? (
                          <span className="rounded bg-amber-50 border border-amber-200 px-1.5 py-0.2 text-[9px] font-extrabold text-amber-800">
                            {product.discountBadge}
                          </span>
                        ) : (
                          <span className="rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 text-[9px] font-semibold text-emerald-800">
                            In Stock
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#7A8493]">
                        {product.category} {product.unitSize && `· ${product.unitSize}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-right">
                      <p className="font-poppins text-sm font-bold text-[#0F2044]">
                        {fmt(product.price)}
                      </p>
                      {product.mrp && product.mrp > product.price && (
                        <p className="text-[10px] text-[#9AA3AF] line-through font-medium">
                          {fmt(product.mrp)}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectProduct(product)}
                      disabled={isOutOfStock}
                      className={`flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition shadow-xs cursor-pointer ${
                        isOutOfStock
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                          : "bg-[#EEF8F0] text-[#16A36A] hover:bg-[#16A36A] hover:text-white active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#16A36A]"
                      }`}
                      aria-label={`Scan barcode to add ${product.name}`}
                      title="Scan Barcode to Add"
                    >
                      <IcScan />
                      <span className="hidden sm:inline">Scan to Add</span>
                    </button>
                  </div>
                </div>

                {/* ── SmartFind Product Location Card ── */}
                <div className="mt-2.5 pt-2 border-t border-black/5">
                  {!isMissing && location ? (
                    <div
                      className={`rounded-xl p-2.5 text-xs transition ${
                        isVerified
                          ? "bg-slate-50 border border-slate-200/80"
                          : "bg-amber-50/70 border border-amber-200/80"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 flex-wrap mb-1">
                        <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">
                          Physical Store Location
                        </span>
                        {isVerified ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/70 px-2 py-0.2 text-[9.5px] font-bold text-emerald-800">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                            Verified Location
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.2 text-[9.5px] font-bold text-amber-800">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                            Unverified
                          </span>
                        )}
                      </div>

                      <div className="font-semibold text-[#0F2044] text-[11.5px]">
                        Aisle {location.aisleCode} — {location.aisleName}
                      </div>

                      <div className="flex items-center justify-between mt-1 text-[11px] text-slate-600">
                        <span className="font-medium">
                          Rack <strong className="text-[#0F2044]">{location.rackCode}</strong> · Shelf{" "}
                          <strong className="text-[#0F2044]">{location.shelfCode}</strong>
                        </span>

                        <button
                          type="button"
                          onClick={() => onViewLocation?.(product, location)}
                          className="min-h-[36px] rounded-xl bg-[#0F2044] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#1c3569] active:scale-95 transition shadow-2xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#0F2044]"
                        >
                          View Location
                        </button>
                      </div>

                      {isUnverified && (
                        <p className="mt-1.5 text-[10px] text-amber-800 font-medium bg-amber-100/60 rounded px-1.5 py-0.5">
                          Location not verified. Please confirm with store staff.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-2 text-center">
                      <p className="text-[11px] font-medium text-slate-600">
                        Location not yet assigned. Please ask a staff member for assistance.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
