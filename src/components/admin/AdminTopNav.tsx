import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AdminTab, SupermarketStore } from "../../types";
import { useAuth } from "../../context/AuthContext";
import { isSupabaseConfigured } from "../../lib/supabase";
import { IcSearch, IcLogout, IcAlert, IcCheck, IcChevronDown } from "../common/Icons";

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
        <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
          {onOpenMobileMenu && (
            <button
              type="button"
              onClick={onOpenMobileMenu}
              className="lg:hidden flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-[#101828] hover:bg-slate-100 transition active:scale-95 shadow-2xs cursor-pointer"
              aria-label="Open Navigation Menu"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#101828] text-white text-xs font-bold shrink-0 shadow-xs">
            Q
          </span>
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex items-center gap-1.5 text-[10px] sm:text-[10.5px] font-medium text-slate-400">
              <span>QLess</span>
              <span>/</span>
              <span>{currentMeta.group}</span>
            </div>
            <h1 className="font-poppins text-xs sm:text-sm font-bold text-slate-900 truncate leading-tight">
              {currentMeta.title}
            </h1>
          </div>
        </div>

        {/* Center: Global Search Bar */}
        <form
          onSubmit={handleSearchSubmit}
          className="hidden md:flex flex-1 max-w-md items-center relative"
        >
          <span className="absolute left-3 text-slate-400 pointer-events-none">
            <IcSearch />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (onSearch) onSearch(e.target.value);
            }}
            placeholder="Search products, barcodes, orders, aisles…"
            className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-9 pr-12 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:border-emerald-600 focus:bg-white focus:outline-hidden transition"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded bg-white px-1.5 py-0.5 text-[9.5px] font-mono text-slate-400 border border-slate-200 shadow-2xs">
            ⌘K
          </kbd>
        </form>

        {/* Right: Actions, Badges & Profile Dropdown */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Store Online Badge */}
          <div className="hidden lg:flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 text-[10.5px] font-semibold text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{isSupabaseConfigured ? "STORE ONLINE (LIVE)" : "STORE ONLINE (DEMO)"}</span>
            <span className="text-slate-300">·</span>
            <span className="font-mono text-slate-600 font-bold">{selectedStore?.code || "QLM001"}</span>
          </div>

          {/* Refresh Action */}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition active:scale-95 shadow-2xs disabled:opacity-50 cursor-pointer"
              title="Refresh live data from Supabase"
            >
              <svg className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}

          {/* Notifications Center */}
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => setIsNotificationOpen(!isNotificationOpen)}
              className="relative flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition active:scale-95 shadow-2xs cursor-pointer"
              title="Store Alerts & Notifications"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
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
                  <span className="font-bold text-slate-900">Supermarket Operational Alerts</span>
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
                      className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200 hover:bg-amber-100/70 transition cursor-pointer"
                    >
                      <p className="font-bold text-amber-950 text-[11px] flex items-center gap-1.5">
                        <IcAlert />
                        <span>{lowStockCount} Products Need Restocking</span>
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
                      className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-200 hover:bg-blue-100/70 transition cursor-pointer"
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
                      <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 mb-1">
                        <IcCheck />
                      </span>
                      <p className="font-semibold text-slate-700">All Systems Clear</p>
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
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-1 hover:bg-slate-50 transition cursor-pointer shadow-2xs"
              title={`Logged in as ${user?.name || "Store Admin"}`}
              aria-label="Admin Profile Menu"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#101828] text-[10px] font-bold text-white shadow-2xs">
                {user?.avatarInitials || "AD"}
              </span>
              <IcChevronDown className="h-3 w-3 text-slate-400 mr-0.5" />
            </button>

            {/* Profile Dropdown */}
            {isProfileOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xl z-[100] qless-scale-in text-xs space-y-2">
                <div className="border-b border-slate-100 pb-2">
                  <p className="font-bold text-slate-900 truncate">{user?.name || "Administrator"}</p>
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
                    <IcLogout className="h-3.5 w-3.5" />
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

