import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AdminTab, SupermarketStore } from "../../types";
import { useAuth } from "../../context/AuthContext";
import { isSupabaseConfigured } from "../../lib/supabase";

interface AdminTopNavProps {
  currentTab: AdminTab;
  selectedStore: SupermarketStore | null;
  lowStockCount: number;
  pendingOrdersCount: number;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  onSearch?: (query: string) => void;
  onNavigateTab?: (tab: AdminTab) => void;
  onOpenMobileMenu?: () => void;
}

export function AdminTopNav({
  currentTab,
  selectedStore,
  lowStockCount,
  pendingOrdersCount,
  isRefreshing = false,
  onRefresh,
  onSearch,
  onNavigateTab,
  onOpenMobileMenu,
}: AdminTopNavProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotificationOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const totalAlerts = lowStockCount + pendingOrdersCount;

  // Breadcrumb mappings
  const tabTitles: Record<AdminTab, { group: string; title: string }> = {
    overview: { group: "Overview", title: "Executive Dashboard" },
    products: { group: "Inventory", title: "Products Catalog" },
    inventory: { group: "Inventory", title: "Stock & Inventory Control" },
    "stock-import": { group: "Inventory", title: "Smart Stock Intake" },
    locations: { group: "Inventory", title: "Rack & Location Coordinates" },
    transactions: { group: "Operations", title: "Orders & Sales Ledger" },
    security: { group: "Operations", title: "Turnstile Security Audit" },
    "gate-qr": { group: "Operations", title: "Gate Turnstile QR Pass" },
  };

  const currentMeta = tabTitles[currentTab] || { group: "Admin", title: "Dashboard" };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearch) {
      onSearch(searchQuery);
    }
  };

  return (
    <header className="relative z-30 w-full rounded-2xl border border-slate-200/80 bg-white/95 backdrop-blur-md px-3.5 sm:px-5 py-2.5 shadow-xs transition-all">
      <div className="flex items-center justify-between gap-3 sm:gap-6">
        {/* Left: Mobile Drawer Trigger + Breadcrumbs & Page Title */}
        <div className="flex items-center gap-2.5 min-w-0">
          {onOpenMobileMenu && (
            <button
              type="button"
              onClick={onOpenMobileMenu}
              className="lg:hidden flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-[#0F2044] hover:bg-slate-100 transition active:scale-95 shadow-2xs cursor-pointer"
              aria-label="Open Navigation Menu"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0F2044] text-white text-xs font-bold shrink-0 shadow-2xs">
            Q
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] sm:text-[10.5px] font-medium text-slate-400">
              <span>QLess</span>
              <span>/</span>
              <span>{currentMeta.group}</span>
            </div>
            <h1 className="font-poppins text-xs sm:text-sm font-bold text-[#0F2044] truncate leading-tight">
              {currentMeta.title}
            </h1>
          </div>
        </div>

        {/* Center: Global Search Bar */}
        <form
          onSubmit={handleSearchSubmit}
          className="hidden md:flex flex-1 max-w-md items-center relative"
        >
          <span className="absolute left-3 text-slate-400 text-xs pointer-events-none">
            🔍
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (onSearch) onSearch(e.target.value);
            }}
            placeholder="Search products, barcodes, orders, aisles…"
            className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-8 pr-12 py-1.5 text-xs text-[#0F2044] placeholder-slate-400 focus:border-[#2E9E44] focus:bg-white focus:outline-hidden transition"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded bg-white px-1.5 py-0.5 text-[9.5px] font-mono text-slate-400 border border-slate-200 shadow-2xs">
            ⌘K
          </kbd>
        </form>

        {/* Right: Actions, Badges & Profile Dropdown */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Store Online Badge */}
          <div className="hidden lg:flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 text-[10.5px] font-bold text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{isSupabaseConfigured ? "STORE ONLINE (LIVE)" : "STORE ONLINE (DEMO)"}</span>
            <span className="text-slate-400">·</span>
            <span className="font-mono text-slate-600 font-bold">{selectedStore?.code || "QLM001"}</span>
          </div>

          {/* Refresh Action */}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-[#0F2044] hover:bg-slate-50 transition active:scale-95 shadow-2xs disabled:opacity-50 cursor-pointer"
              title="Refresh live data from Supabase"
            >
              <span className={`text-xs ${isRefreshing ? "animate-spin inline-block" : ""}`}>
                🔄
              </span>
            </button>
          )}

          {/* Notifications Center */}
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => setIsNotificationOpen(!isNotificationOpen)}
              className="relative flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-[#0F2044] hover:bg-slate-50 transition active:scale-95 shadow-2xs cursor-pointer"
              title="Store Alerts & Notifications"
            >
              <span className="text-sm">🔔</span>
              {totalAlerts > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white shadow-xs">
                  {totalAlerts}
                </span>
              )}
            </button>

            {/* Notification Dropdown Panel */}
            {isNotificationOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xl z-[100] qless-scale-in text-xs space-y-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-bold text-[#0F2044]">Supermarket Operational Alerts</span>
                  <span className="text-[10px] font-semibold text-slate-400">
                    {totalAlerts} active
                  </span>
                </div>

                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {lowStockCount > 0 && (
                    <div
                      onClick={() => {
                        setIsNotificationOpen(false);
                        if (onNavigateTab) onNavigateTab("inventory");
                      }}
                      className="p-2 rounded-xl bg-amber-50/70 border border-amber-200 hover:bg-amber-100/70 transition cursor-pointer"
                    >
                      <p className="font-bold text-amber-950 text-[11px]">
                        ⚠️ {lowStockCount} Products Need Restocking
                      </p>
                      <p className="text-[10px] text-amber-800 mt-0.5">
                        Stock is at or below the 10-unit supermarket safety buffer.
                      </p>
                    </div>
                  )}

                  {pendingOrdersCount > 0 && (
                    <div
                      onClick={() => {
                        setIsNotificationOpen(false);
                        if (onNavigateTab) onNavigateTab("transactions");
                      }}
                      className="p-2 rounded-xl bg-blue-50/70 border border-blue-200 hover:bg-blue-100/70 transition cursor-pointer"
                    >
                      <p className="font-bold text-blue-950 text-[11px]">
                        ⏳ {pendingOrdersCount} Pending Customer Orders
                      </p>
                      <p className="text-[10px] text-blue-800 mt-0.5">
                        Orders awaiting cash settlement at counter.
                      </p>
                    </div>
                  )}

                  {totalAlerts === 0 && (
                    <div className="py-4 text-center text-slate-400">
                      <span className="text-xl block mb-1">✅</span>
                      <p className="font-semibold text-slate-600">All Systems Clear</p>
                      <p className="text-[10px]">No critical inventory or checkout warnings.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Admin Profile Dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1 pr-2 hover:bg-slate-50 transition cursor-pointer shadow-2xs"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#0F2044] text-[10px] font-bold text-white shadow-2xs">
                {user?.avatarInitials || "AD"}
              </span>
              <span className="hidden sm:inline text-xs font-semibold text-[#0F2044] truncate max-w-[100px]">
                {user?.name || "Store Admin"}
              </span>
              <span className="text-[9px] text-slate-400">▼</span>
            </button>

            {/* Profile Dropdown */}
            {isProfileOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xl z-[100] qless-scale-in text-xs space-y-2">
                <div className="border-b border-slate-100 pb-2">
                  <p className="font-bold text-[#0F2044] truncate">{user?.name || "Administrator"}</p>
                  <p className="text-[10px] text-slate-400 truncate">{user?.email || "admin@qlessmart.com"}</p>
                  <span className="inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700 mt-1">
                    Role: {user?.role || "ADMIN"} · Verified
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="rounded-lg bg-slate-50 p-2 text-[10px] text-slate-500">
                    <p className="font-semibold text-slate-700">{selectedStore?.name || "QLess Mart"}</p>
                    <p>{selectedStore?.branch || "HSR Layout Flagship"}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      navigate("/auth/admin");
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-50 transition cursor-pointer"
                  >
                    <span>🚪</span>
                    <span>Sign Out of Portal</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

