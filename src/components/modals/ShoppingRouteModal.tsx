import { useState, useMemo, useEffect } from "react";
import { useShopping } from "../../context/ShoppingContext";
import { StoreFloorPlan } from "../common/StoreFloorPlan";
import { IcCheck, IcClose, IcAlert } from "../common/Icons";

interface ShoppingRouteModalProps {
  open: boolean;
  onClose: () => void;
}

interface GroupedAisleStop {
  aisleCode: string;
  aisleName: string;
  order: number;
  items: Array<{
    cartItemId: number;
    name: string;
    quantity: number;
    unitSize?: string;
    emoji?: string;
    rackCode: string;
    shelfCode: string;
    isVerified: boolean;
    isUnverified: boolean;
  }>;
}

export function ShoppingRouteModal({ open, onClose }: ShoppingRouteModalProps) {
  const { items, getLocation, storeAisles } = useShopping();

  // Local checklist state for picked items
  const [pickedItemIds, setPickedItemIds] = useState<Record<number, boolean>>({});

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

  // Toggle picked item checklist
  const togglePicked = (itemId: number) => {
    setPickedItemIds((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  };

  // Group and sort cart items by authoritative live aisle walking sequence
  const { aisleStops, missingItems, totalMappedCount } = useMemo(() => {
    const stopsMap: Record<string, GroupedAisleStop> = {};
    const unassigned: typeof items = [];

    // If store aisle data cannot be loaded or is empty, do not fabricate walking routes
    if (!storeAisles || storeAisles.length === 0) {
      return {
        aisleStops: [],
        missingItems: items,
        totalMappedCount: 0,
      };
    }

    items.forEach((item) => {
      const loc = getLocation(item.id);
      if (!loc || loc.verificationStatus === "MISSING" || !loc.aisleCode) {
        unassigned.push(item);
        return;
      }

      // Authoritative lookup from live storeAisles (Supabase public.store_aisles)
      const cleanAisleCode = loc.aisleCode.trim().toUpperCase();
      const aisleDef = storeAisles.find(
        (a) => a.code.toUpperCase() === cleanAisleCode
      );

      // Handle missing aisle data without inventing a route or assigning mock order
      if (!aisleDef) {
        unassigned.push(item);
        return;
      }

      const aisleOrder = typeof aisleDef.order === "number" ? aisleDef.order : 999;
      const aisleName = aisleDef.name || loc.aisleName || `Aisle ${aisleDef.code}`;

      if (!stopsMap[aisleDef.code]) {
        stopsMap[aisleDef.code] = {
          aisleCode: aisleDef.code,
          aisleName: aisleName,
          order: aisleOrder,
          items: [],
        };
      }

      stopsMap[aisleDef.code].items.push({
        cartItemId: item.id,
        name: item.name,
        quantity: item.quantity,
        unitSize: item.unitSize,
        emoji: item.emoji,
        rackCode: loc.rackCode || "N/A",
        shelfCode: loc.shelfCode || "N/A",
        isVerified: loc.verificationStatus === "VERIFIED",
        isUnverified: loc.verificationStatus === "UNVERIFIED",
      });
    });

    // Sort stops strictly using authoritative live walking_order from Supabase
    const sortedStops = Object.values(stopsMap).sort((a, b) => a.order - b.order);

    // Within each stop, sort items by rack code, then shelf code
    sortedStops.forEach((stop) => {
      stop.items.sort((a, b) => {
        if (a.rackCode !== b.rackCode) {
          return a.rackCode.localeCompare(b.rackCode);
        }
        return a.shelfCode.localeCompare(b.shelfCode);
      });
    });

    const mappedCount = sortedStops.reduce((sum, s) => sum + s.items.length, 0);

    return {
      aisleStops: sortedStops,
      missingItems: unassigned,
      totalMappedCount: mappedCount,
    };
  }, [items, getLocation, storeAisles]);

  const routeAisleCodes = useMemo(() => {
    return aisleStops.map((s) => s.aisleCode);
  }, [aisleStops]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#0F2044]/50 px-0 sm:px-4 backdrop-blur-sm qless-fade-in"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="route-modal-title"
        className="flex flex-col w-full max-w-[620px] max-h-[92vh] sm:max-h-[88vh] rounded-t-3xl sm:rounded-3xl bg-white shadow-[0_-16px_60px_rgba(15,32,68,0.25)] sm:shadow-[0_24px_70px_rgba(15,32,68,0.2)] qless-scale-in overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Mobile handle */}
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-[#E5E7EB]" />
        </div>

        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-black/5 bg-[#FBFBFB]">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#2E9E44] text-white text-xs font-bold">
              🗺️
            </span>
            <div>
              <h3 id="route-modal-title" className="font-poppins text-sm font-bold text-[#0F2044]">
                Smart Shopping Route
              </h3>
              <p className="text-[10px] text-[#7A8493]">
                Suggested aisle picking order for your {items.length} cart item{items.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close route planner"
            className="flex min-h-[44px] min-w-[44px] h-11 w-11 items-center justify-center rounded-xl bg-black/5 text-[#7A8493] hover:bg-black/10 hover:text-[#0F2044] active:scale-95 transition focus-visible:outline-2 focus-visible:outline-[#0F2044]"
          >
            <IcClose />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {items.length === 0 ? (
            /* Cart Empty State */
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <span className="text-3xl block mb-2">🛒</span>
              <h4 className="font-poppins text-sm font-bold text-[#0F2044]">
                Cart is Empty
              </h4>
              <p className="mt-1 text-xs text-[#7A8493]">
                Scan or add items to your cart to plan a shelf picking route through the store.
              </p>
            </div>
          ) : !storeAisles || storeAisles.length === 0 ? (
            /* Live Aisles Unavailable State */
            <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-6 text-center">
              <span className="text-3xl block mb-2">🗺️</span>
              <h4 className="font-poppins text-sm font-bold text-amber-950">
                Walking Route Unavailable
              </h4>
              <p className="mt-1 text-xs text-amber-800 max-w-[360px] mx-auto">
                Authoritative aisle layout and walking order data could not be loaded from the store database.
                Please refer to in-store aisle signs or ask supermarket staff.
              </p>
            </div>
          ) : totalMappedCount === 0 && missingItems.length > 0 ? (
            /* No Locations Assigned State */
            <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-6 text-center">
              <span className="text-3xl block mb-2">📍</span>
              <h4 className="font-poppins text-sm font-bold text-amber-950">
                Locations Not Yet Assigned
              </h4>
              <p className="mt-1 text-xs text-amber-800 max-w-[360px] mx-auto">
                None of the items in your cart currently have assigned shelf locations in the store database.
                Please ask store staff at the assistance desk or cashier counter.
              </p>
            </div>
          ) : (
            <>
              {/* Route Summary Banner */}
              <div className="flex items-center justify-between rounded-2xl bg-emerald-50 border border-emerald-200 p-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-poppins font-bold text-emerald-900 text-sm">
                    {aisleStops.length} Aisle Stop{aisleStops.length === 1 ? "" : "s"}
                  </span>
                  <span className="text-emerald-700">· {totalMappedCount} mapped items</span>
                </div>
                <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded-full">
                  Entrance ➔ Aisles ➔ Checkout
                </span>
              </div>

              {/* Store Map Schematic with Route Highlights */}
              <StoreFloorPlan routeAisleCodes={routeAisleCodes} showLegend={false} />

              {/* Sequence Notice */}
              <div className="text-[10.5px] text-[#64748B] flex items-center gap-1.5 px-1">
                <span>ℹ️</span>
                <span>
                  Suggested sequence follows the perimeter and central aisles from entrance to checkout. Check off items as you pick them.
                </span>
              </div>

              {/* Grouped Aisle Stops */}
              <div className="space-y-3">
                {aisleStops.map((stop, stopIdx) => (
                  <div
                    key={stop.aisleCode}
                    className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden"
                  >
                    {/* Stop Header */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0F2044] text-[10px] font-bold text-white">
                          {stopIdx + 1}
                        </span>
                        <h4 className="font-poppins text-xs font-bold text-[#0F2044]">
                          Aisle {stop.aisleCode} — {stop.aisleName}
                        </h4>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-500">
                        {stop.items.length} item{stop.items.length === 1 ? "" : "s"}
                      </span>
                    </div>

                    {/* Items inside this stop */}
                    <div className="divide-y divide-slate-100">
                      {stop.items.map((item) => {
                        const isPicked = !!pickedItemIds[item.cartItemId];

                        return (
                          <div
                            key={item.cartItemId}
                            onClick={() => togglePicked(item.cartItemId)}
                            className={`flex items-center justify-between p-3 transition cursor-pointer ${
                              isPicked ? "bg-emerald-50/40 opacity-75" : "hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0 pr-3">
                              {/* Checkbox button */}
                              <div
                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                                  isPicked
                                    ? "bg-[#2E9E44] border-[#2E9E44] text-white"
                                    : "border-slate-300 bg-white"
                                }`}
                              >
                                {isPicked && <IcCheck />}
                              </div>

                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-base">{item.emoji || "🛍️"}</span>
                                  <h5
                                    className={`font-poppins text-xs font-bold truncate ${
                                      isPicked ? "line-through text-slate-500" : "text-[#0F2044]"
                                    }`}
                                  >
                                    {item.name}
                                  </h5>
                                  <span className="text-[10px] font-semibold text-slate-500">
                                    ({item.quantity} {item.unitSize || "unit"})
                                  </span>
                                </div>

                                <div className="flex items-center gap-2 mt-0.5 text-[10px]">
                                  <span className="font-bold text-[#0F2044]">
                                    Rack {item.rackCode} · Shelf {item.shelfCode}
                                  </span>
                                  {item.isVerified ? (
                                    <span className="text-emerald-700 font-semibold">
                                      ✓ Verified
                                    </span>
                                  ) : (
                                    <span className="text-amber-700 font-semibold">
                                      ⚠️ Unverified
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <span className="text-[10px] font-medium text-slate-400 shrink-0">
                              {isPicked ? "Picked" : "Tap to check"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Items with Missing Locations */}
              {missingItems.length > 0 && (
                <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/70 p-3.5 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                    <IcAlert />
                    <span>Items Requiring Staff Assistance ({missingItems.length})</span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    The following cart items do not currently have assigned shelf coordinates. Please request staff assistance at the central customer desk:
                  </p>
                  <div className="divide-y divide-amber-200/60 rounded-xl bg-white border border-amber-200">
                    {missingItems.map((mItem) => (
                      <div key={mItem.id} className="flex items-center justify-between p-2.5 text-xs">
                        <div className="flex items-center gap-2">
                          <span>{mItem.emoji || "📦"}</span>
                          <span className="font-semibold text-slate-800">{mItem.name}</span>
                          <span className="text-[10px] text-slate-500">×{mItem.quantity}</span>
                        </div>
                        <span className="text-[10px] font-semibold text-amber-800 bg-amber-100 rounded px-1.5 py-0.5">
                          Unassigned
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-black/5 bg-[#FBFBFB] px-5 py-3 text-xs">
          <span className="text-[10.5px] text-[#7A8493]">
            {items.length} total items in active cart
          </span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#0F2044] px-5 py-2.5 font-poppins text-xs font-semibold text-white shadow-xs hover:bg-[#1A3163] active:scale-95 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F2044]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
