import React from "react";
import { useNavigate } from "react-router-dom";
import { AdminTab, SupermarketStore } from "../../types";
import { useAuth } from "../../context/AuthContext";
import {
  IcDashboard,
  IcTag,
  IcBox,
  IcUpload,
  IcMapPin,
  IcReceipt,
  IcShield,
  IcDoor,
  IcLogout,
} from "../common/Icons";

interface AdminSidebarProps {
  currentTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  selectedStore: SupermarketStore | null;
  lowStockCount: number;
  totalOrdersCount: number;
  unresolvedDiscrepanciesCount: number;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

interface NavItem {
  id: AdminTab;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  badgeColor?: string;
}

export function AdminSidebar({
  currentTab,
  onSelectTab,
  selectedStore,
  lowStockCount,
  totalOrdersCount,
  unresolvedDiscrepanciesCount,
  isMobileOpen = false,
  onCloseMobile,
}: AdminSidebarProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // Navigation structure organized by operational domain
  const navSections: Array<{ title: string; items: NavItem[] }> = [
    {
      title: "OVERVIEW",
      items: [
        { id: "overview", label: "Dashboard", icon: <IcDashboard className="h-4 w-4" /> },
      ],
    },
    {
      title: "INVENTORY",
      items: [
        { id: "products", label: "Products Catalog", icon: <IcTag className="h-4 w-4" /> },
        {
          id: "inventory",
          label: "Stock & Inventory",
          icon: <IcBox className="h-4 w-4" />,
          badge: lowStockCount > 0 ? lowStockCount : undefined,
          badgeColor: "bg-amber-500 text-white",
        },
        { id: "stock-import", label: "Smart Stock Intake", icon: <IcUpload className="h-4 w-4" /> },
        { id: "locations", label: "Rack & Locations", icon: <IcMapPin className="h-4 w-4" /> },
      ],
    },
    {
      title: "OPERATIONS",
      items: [
        {
          id: "transactions",
          label: "Orders & Sales",
          icon: <IcReceipt className="h-4 w-4" />,
          badge: totalOrdersCount > 0 ? totalOrdersCount : undefined,
          badgeColor: "bg-[#101828] text-white",
        },
        {
          id: "security",
          label: "Security Audit",
          icon: <IcShield />,
          badge: unresolvedDiscrepanciesCount > 0 ? unresolvedDiscrepanciesCount : undefined,
          badgeColor: "bg-red-500 text-white",
        },
        { id: "gate-qr", label: "Gate Turnstile QR", icon: <IcDoor className="h-4 w-4" /> },
      ],
    },
  ];

  const renderContent = (isMobile: boolean) => (
    <>
      <div className="space-y-4 shrink-0">
        {/* Portal Branding & Store Selector */}
        <div className="border-b border-slate-100 pb-3.5">
          <div className="flex items-center justify-between gap-2.5 mb-2.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#101828] text-white font-bold text-sm shadow-xs">
                Q
              </span>
              <div>
                <p className="font-poppins text-sm font-bold text-slate-900 leading-tight tracking-tight">
                  QLess Admin
                </p>
                <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">
                  Supermarket Console
                </p>
              </div>
            </div>

            {isMobile && onCloseMobile && (
              <button
                type="button"
                onClick={onCloseMobile}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                aria-label="Close navigation"
              >
                ✕
              </button>
            )}
          </div>

          {/* Store Selector Pill */}
          <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-200/80 text-[11px]">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[9.5px] font-semibold text-slate-400 uppercase tracking-wider block">
                Active Branch
              </span>
              <span className="text-[9px] font-mono font-bold bg-[#101828] text-white px-1.5 py-0.5 rounded">
                {selectedStore?.code || "STORE001"}
              </span>
            </div>
            <p className="font-semibold text-slate-900 truncate">
              {selectedStore?.name || "QLess Mart"}
            </p>
            <p className="text-[10px] text-slate-500 truncate">
              {selectedStore?.branch || "HSR Layout Flagship"}
            </p>
          </div>
        </div>
      </div>

      {/* Grouped Navigation */}
      <nav className="space-y-4 flex-1 py-3 overflow-y-auto pr-0.5">
        {navSections.map((section) => (
          <div key={section.title} className="space-y-1">
            <p className="px-2.5 text-[9.5px] font-bold uppercase tracking-wider text-slate-400">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectTab(item.id);
                      if (isMobile && onCloseMobile) {
                        onCloseMobile();
                      }
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 font-poppins text-xs transition cursor-pointer min-h-[36px] ${
                      active
                        ? "bg-[#101828] text-white font-semibold shadow-xs"
                        : "text-slate-600 font-medium hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`shrink-0 ${active ? "text-emerald-400" : "text-slate-400"}`}>{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge !== undefined && (
                      <span
                        className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold shrink-0 ${
                          active
                            ? "bg-white text-slate-900"
                            : item.badgeColor || "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Admin Session & Bottom Utilities */}
      <div className="border-t border-slate-100 pt-3 space-y-2 shrink-0">
        <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2 border border-slate-200/80">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#101828] text-[10px] font-bold text-white shadow-2xs">
              {user?.avatarInitials || "AD"}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-slate-900">
                {user?.name || "Store Admin"}
              </p>
              <p className="text-[9.5px] text-slate-400 leading-none">
                {user?.role || "ADMIN"} · Verified
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              logout();
              navigate("/auth/admin");
            }}
            className="flex items-center gap-1 text-[11px] font-semibold text-red-600 hover:text-red-700 px-2 py-1.5 rounded-lg hover:bg-red-50 transition cursor-pointer"
            title="Sign out of Admin Portal"
          >
            <IcLogout className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar: 100% stable, never affected by window or content scroll */}
      <aside className="hidden lg:flex w-64 h-full shrink-0 border-r border-slate-200/80 bg-white p-4 flex-col justify-between overflow-y-auto select-none shadow-xs">
        {renderContent(false)}
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />

          {/* Drawer container */}
          <div className="relative z-50 w-72 max-w-[85vw] h-full bg-white p-4 shadow-2xl flex flex-col justify-between overflow-y-auto">
            {renderContent(true)}
          </div>
        </div>
      )}
    </>
  );
}
