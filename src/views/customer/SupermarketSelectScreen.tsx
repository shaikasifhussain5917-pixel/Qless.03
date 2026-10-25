import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CustomerLayout } from "../../layouts/CustomerLayout";
import { useShopping } from "../../context/ShoppingContext";
import { useAuth } from "../../context/AuthContext";
import { MOCK_STORES } from "../../data/mockStores";
import { SupermarketStore } from "../../types";
import { IcArrowRight, IcClock, IcLocation, IcStore } from "../../components/common/Icons";

export function SupermarketSelectScreen() {
  const navigate = useNavigate();
  const { selectedStore, setSelectedStore } = useShopping();
  const { hasValidEntrance } = useAuth();
  const [selectedId, setSelectedId] = useState<string>(selectedStore?.id || MOCK_STORES[0].id);

  const handleSelectStore = (store: SupermarketStore) => {
    setSelectedId(store.id);
    setSelectedStore(store);
    // Smooth transition: proceed to store QR scanner if unverified, or shop if already verified
    setTimeout(() => {
      if (hasValidEntrance) {
        navigate("/shop");
      } else {
        navigate("/scan-store");
      }
    }, 200);
  };

  return (
    <CustomerLayout
      showHeader={false}
      showFooter={true}
      maxWidthClass="max-w-[560px]"
    >
      <div className="flex flex-1 flex-col py-2 sm:py-3 qless-fade-in">
        {/* Top bar with back to welcome */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 rounded-xl border border-black/5 bg-white/80 px-3 py-1.5 text-xs font-semibold text-[#7A8493] shadow-sm backdrop-blur-sm transition hover:bg-white hover:text-[#0F2044] active:scale-95"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M5 12l6-6M5 12l6 6" />
            </svg>
            <span>Back to Home</span>
          </button>

          <span className="text-xs font-semibold text-[#0F2044] font-alegreya bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-full">
            Flagship Store · STORE001
          </span>
        </div>

        {/* Header */}
        <div className="mb-5">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#0F2044]/15 bg-[#0F2044]/5 px-3 py-0.5 text-xs font-semibold text-[#0F2044] mb-2">
            <IcStore />
            <span>Launch Supermarket</span>
          </div>
          <h1 className="font-poppins text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0F2044]">
            QLess Flagship Store
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#758092]">
            Self-checkout is active for our launch flagship supermarket. Verify your store entrance to access real-time inventory and pricing.
          </p>
        </div>

        {/* Supermarket Store Cards List */}
        <div className="space-y-3.5 mb-6">
          {MOCK_STORES.map((store) => {
            const isCurrent = selectedId === store.id;

            return (
              <div
                key={store.id}
                onClick={() => handleSelectStore(store)}
                className={`relative cursor-pointer rounded-2xl border-2 p-4 sm:p-5 backdrop-blur-md transition-all duration-200 ${
                  isCurrent
                    ? "border-[#2E9E44] bg-white/95 shadow-[0_12px_32px_rgba(46,158,68,0.16)] scale-[1.01]"
                    : "border-white/60 bg-white/80 hover:border-[#D8DDE3] hover:bg-white/90 shadow-[0_6px_20px_rgba(15,32,68,0.06)] hover:scale-[1.005]"
                }`}
              >
                {/* Active Store Indicator Ribbon */}
                {isCurrent && (
                  <div className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-[#EEF8F0] px-2.5 py-0.5 text-[10px] font-bold text-[#2E9E44] border border-[#2E9E44]/30 shadow-xs">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#2E9E44]" />
                    <span>Active Selection</span>
                  </div>
                )}

                <div className="flex items-start justify-between gap-3 pr-24">
                  <div>
                    {/* Brand Pill */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-extrabold tracking-wide border ${store.brandBg}`}>
                        {store.chain}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-[#2E9E44]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#2E9E44] animate-pulse" />
                        Open Now
                      </span>
                    </div>

                    <h2 className="font-poppins text-base sm:text-lg font-bold text-[#0F2044] leading-snug">
                      {store.name}
                    </h2>
                    <p className="text-xs font-semibold text-[#0F2044]/80 mt-0.5">
                      {store.branch}
                    </p>
                  </div>
                </div>

                {/* Address & Distance */}
                <div className="mt-2.5 flex items-start gap-1.5 text-xs text-[#7A8493]">
                  <span className="mt-0.5 text-[#0F2044]/60 shrink-0">
                    <IcLocation />
                  </span>
                  <span className="line-clamp-1">{store.address}</span>
                </div>

                {/* Timing and Distance metadata */}
                <div className="mt-3 flex items-center justify-between border-t border-black/5 pt-3">
                  <div className="flex items-center gap-3 text-xs text-[#7A8493]">
                    <span className="flex items-center gap-1">
                      <IcClock />
                      <span>{store.timing}</span>
                    </span>
                    <span className="inline-block h-3 w-px bg-black/10" />
                    <span className="font-semibold text-[#0F2044]">
                      {store.distance} away
                    </span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectStore(store);
                    }}
                    className={`flex h-9 items-center gap-1.5 rounded-xl px-3.5 font-poppins text-xs font-semibold shadow-sm transition active:scale-95 ${
                      isCurrent
                        ? "bg-[#2E9E44] text-white shadow-[0_4px_12px_rgba(46,158,68,0.25)]"
                        : "bg-[#0F2044] text-white hover:bg-[#1A3163]"
                    }`}
                  >
                    <span>
                      {isCurrent
                        ? hasValidEntrance
                          ? "Continue Shopping"
                          : "Scan Store QR"
                        : "Select Store"}
                    </span>
                    <IcArrowRight />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </CustomerLayout>
  );
}
