import { useEffect } from "react";
import { Product, ProductLocation } from "../../types";
import { fmt } from "../../utils/formatters";
import { StoreFloorPlan } from "../common/StoreFloorPlan";
import { IcAdd, IcAlert, IcCheck, IcClose } from "../common/Icons";

interface ProductLocationModalProps {
  product: Product | null;
  location: ProductLocation | null;
  open: boolean;
  onClose: () => void;
  onAddToCart?: (product: Product) => void;
}

export function ProductLocationModal({
  product,
  location,
  open,
  onClose,
  onAddToCart,
}: ProductLocationModalProps) {
  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Lock scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open || !product) return null;

  const isVerified = location?.verificationStatus === "VERIFIED";
  const isUnverified = location?.verificationStatus === "UNVERIFIED";
  const isMissing = !location || location.verificationStatus === "MISSING";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#0F2044]/50 px-0 sm:px-4 backdrop-blur-sm qless-fade-in"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-modal-title"
        className="flex flex-col w-full max-w-[560px] max-h-[92vh] sm:max-h-[88vh] rounded-t-3xl sm:rounded-3xl bg-white shadow-[0_-16px_60px_rgba(15,32,68,0.25)] sm:shadow-[0_24px_70px_rgba(15,32,68,0.2)] qless-scale-in overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-[#E5E7EB]" />
        </div>

        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-black/5 bg-[#FBFBFB]">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0F2044] text-white text-xs font-bold">
              📍
            </span>
            <div>
              <h3 id="location-modal-title" className="font-poppins text-sm font-bold text-[#0F2044]">
                Product Location & Floor Plan
              </h3>
              <p className="text-[10px] text-[#7A8493]">
                QLess Mart (STORE001) · HSR Layout Flagship
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close location details"
            className="flex min-h-[44px] min-w-[44px] h-11 w-11 items-center justify-center rounded-xl bg-black/5 text-[#7A8493] hover:bg-black/10 hover:text-[#0F2044] active:scale-95 transition focus-visible:outline-2 focus-visible:outline-[#0F2044]"
          >
            <IcClose />
          </button>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Product Summary Card */}
          <div className="flex items-center justify-between rounded-2xl border border-black/5 bg-[#F9FAFB] p-3.5">
            <div className="flex items-center gap-3 min-w-0 pr-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-2xl shadow-xs border border-black/5">
                {product.emoji}
              </div>
              <div className="min-w-0">
                <h4 className="font-poppins text-sm font-bold text-[#0F2044] truncate">
                  {product.name}
                </h4>
                <p className="text-xs text-[#7A8493]">
                  {product.category} {product.unitSize && `· ${product.unitSize}`}
                </p>
                <p className="font-poppins text-xs font-bold text-[#2E9E44] mt-0.5">
                  {fmt(product.price)}
                </p>
              </div>
            </div>

            {/* Verification Status Pill */}
            <div className="shrink-0 text-right">
              {isVerified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] font-bold text-[#2E9E44]">
                  <IcCheck />
                  <span>Verified Location</span>
                </span>
              )}
              {isUnverified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-[11px] font-bold text-amber-800">
                  <IcAlert />
                  <span>Unverified Location</span>
                </span>
              )}
              {isMissing && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                  ⚠️ Unassigned Location
                </span>
              )}
            </div>
          </div>

          {/* Location Coordinates Cards (Aisle / Rack / Shelf) */}
          {!isMissing && location ? (
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                  Aisle
                </span>
                <p className="font-poppins text-base font-extrabold text-[#0F2044] mt-0.5">
                  {location.aisleCode}
                </p>
                <p className="text-[10px] text-emerald-700 truncate font-medium">
                  {location.aisleName}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Rack
                </span>
                <p className="font-poppins text-base font-extrabold text-[#0F2044] mt-0.5">
                  {location.rackCode}
                </p>
                <p className="text-[10px] text-slate-500">Gondola Unit</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Shelf
                </span>
                <p className="font-poppins text-base font-extrabold text-[#0F2044] mt-0.5">
                  {location.shelfCode}
                </p>
                <p className="text-[10px] text-slate-500">Eye / Hand Level</p>
              </div>
            </div>
          ) : (
            /* Missing Location Alert */
            <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/70 p-4 text-center">
              <p className="text-sm font-bold text-amber-900">
                Location not yet assigned. Please ask a staff member for assistance.
              </p>
              <p className="mt-1 text-xs text-amber-700">
                Staff at the central customer assistance desk or nearest cashier terminal will guide you to this item.
              </p>
            </div>
          )}

          {/* Unverified Notice Alert */}
          {isUnverified && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <IcAlert />
              <span>Location not verified. Please confirm with store staff.</span>
            </div>
          )}

          {/* Text Description of Location */}
          {!isMissing && location && (
            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 text-xs text-[#0F2044] space-y-1">
              <p className="font-bold text-[#0F2044] flex items-center gap-1.5">
                <span>🚶 Navigation Directions</span>
              </p>
              <p className="text-slate-600 leading-relaxed">
                From the entrance turnstiles, head into{" "}
                <strong className="text-[#0F2044]">Aisle {location.aisleCode} ({location.aisleName})</strong>. Walk to{" "}
                <strong className="text-[#0F2044]">Rack {location.rackCode}</strong>. Item is positioned on{" "}
                <strong className="text-[#0F2044]">Shelf {location.shelfCode}</strong>.
              </p>
              {location.notes && (
                <p className="text-[11px] text-emerald-800 bg-emerald-50/70 rounded-lg p-2 mt-1 border border-emerald-100 font-medium">
                  Staff Note: {location.notes}
                </p>
              )}
            </div>
          )}

          {/* Visual Map Floor Plan Schematic */}
          <StoreFloorPlan
            highlightedAisleCode={location?.aisleCode}
            highlightedRackCode={location?.rackCode}
            highlightedShelfCode={location?.shelfCode}
          />
        </div>

        {/* Modal Footer Actions */}
        <div className="flex items-center justify-between gap-3 border-t border-black/5 bg-[#FBFBFB] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 transition focus-visible:outline-2 focus-visible:outline-[#0F2044]"
          >
            Close
          </button>

          {onAddToCart && (
            <button
              type="button"
              onClick={() => {
                onAddToCart(product);
                onClose();
              }}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#2E9E44] px-5 py-2.5 font-poppins text-xs font-semibold text-white shadow-sm hover:scale-[1.02] active:scale-95 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2E9E44]"
            >
              <IcAdd />
              <span>Add to Cart ({fmt(product.price)})</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
