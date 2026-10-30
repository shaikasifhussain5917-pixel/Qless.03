import { useState, useMemo } from "react";
import { Product, ProductCategory, ProductLocation } from "../../types";
import { PRODUCT_CATEGORIES } from "../../data/mockCatalog";
import { fmt } from "../../utils/formatters";
import { useShopping } from "../../context/ShoppingContext";
import { IcAdd } from "../common/Icons";
import { ProductImage } from "../common/ProductImage";

interface ProductCatalogTabProps {
  onSelectProduct: (product: Product) => void;
  onViewLocation?: (product: Product, location: ProductLocation | null) => void;
}

export function ProductCatalogTab({ onSelectProduct, onViewLocation }: ProductCatalogTabProps) {
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory>("All");
  const { getLocation, searchProducts } = useShopping();

  const filteredProducts = useMemo(() => {
    return searchProducts("", selectedCategory);
  }, [selectedCategory, searchProducts]);

  return (
    <div className="flex flex-col py-2 qless-fade-in">
      {/* Category Pills Slider */}
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1.5 pt-0.5 no-scrollbar select-none">
        {PRODUCT_CATEGORIES.map((cat) => {
          const active = selectedCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F2044] ${
                active
                  ? "bg-[#0F2044] text-white shadow-sm scale-[1.02]"
                  : "bg-[#F3F4F6] text-[#7A8493] hover:bg-white hover:text-[#0F2044] border border-black/5"
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Category Counter */}
      <div className="mb-2.5 flex items-center justify-between text-xs text-[#7A8493]">
        <span className="font-semibold text-[#0F2044]">
          {selectedCategory === "All" ? "All Department Products" : selectedCategory}
        </span>
        <span>{filteredProducts.length} items available</span>
      </div>

      {/* Product Cards Grid */}
      <div className="max-h-[360px] overflow-y-auto pr-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {filteredProducts.map((product) => {
            const isOutOfStock =
              product.isAvailable === false ||
              (product.stockQuantity !== undefined && product.stockQuantity <= 0);

            const location = getLocation(product.id);
            const isVerified = location?.verificationStatus === "VERIFIED";
            const isMissing = !location || location.verificationStatus === "MISSING";

            return (
              <div
                key={product.id}
                className={`group flex flex-col justify-between rounded-2xl border p-3.5 shadow-xs transition ${
                  isOutOfStock
                    ? "border-black/5 bg-[#FBFBFB] opacity-85"
                    : "border-black/5 bg-white hover:border-[#2E9E44]/50 hover:shadow-sm"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#F8F9FA] text-2xl border border-black/5 shadow-inner overflow-hidden p-1">
                      <ProductImage
                        src={product.imageUrl}
                        alt={product.name}
                        fallbackEmoji={product.emoji}
                        className="h-full w-full object-contain"
                      />
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {isOutOfStock ? (
                        <span className="rounded bg-red-50 border border-red-200 px-1.5 py-0.5 text-[9px] font-bold text-red-700">
                          Out of Stock
                        </span>
                      ) : product.discountBadge ? (
                        <span className="rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[9px] font-extrabold text-amber-800">
                          {product.discountBadge}
                        </span>
                      ) : (
                        <span className="rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-800">
                          In Stock
                        </span>
                      )}

                      {!isMissing && location ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewLocation?.(product, location);
                          }}
                          className={`rounded px-1.5 py-0.5 text-[9px] font-bold tracking-tight transition hover:underline ${
                            isVerified
                              ? "bg-slate-100 text-[#0F2044] border border-slate-200"
                              : "bg-amber-100 text-amber-900 border border-amber-200"
                          }`}
                          title={`Aisle ${location.aisleCode} · Rack ${location.rackCode}`}
                        >
                          📍 Rack {location.rackCode} ({location.aisleCode})
                        </button>
                      ) : (
                        <span className="rounded bg-slate-50 border border-slate-200 px-1.5 py-0.5 text-[9px] font-medium text-slate-500">
                          📍 Main Shelf
                        </span>
                      )}
                    </div>
                  </div>

                  <h5 className="font-poppins text-xs sm:text-sm font-bold line-clamp-1 text-[#0F2044]">
                    {product.name}
                  </h5>
                  <p className="mt-0.5 text-[11px] text-[#7A8493]">
                    {product.unitSize || product.category}
                  </p>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-black/5 pt-2.5">
                  <div>
                    <span className="font-poppins text-sm font-bold text-[#0F2044]">
                      {fmt(product.price)}
                    </span>
                    {product.mrp && product.mrp > product.price && (
                      <span className="ml-1.5 text-[10px] text-[#9AA3AF] line-through font-medium">
                        {fmt(product.mrp)}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectProduct(product)}
                    disabled={isOutOfStock}
                    className={`flex h-11 items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold transition shadow-xs ${
                      isOutOfStock
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : "bg-[#EEF8F0] text-[#2E9E44] hover:bg-[#2E9E44] hover:text-white active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2E9E44]"
                    }`}
                  >
                    <IcAdd />
                    <span>Add to Cart</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
