import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useShopping } from "../context/ShoppingContext";
import { useAuth } from "../context/AuthContext";
import {
  IcBack,
  IcCart,
  IcScan,
  IcSearch,
  IcHistory,
  IcUser,
  IcSettings,
  IcLogout,
  IcShield,
} from "../components/common/Icons";

interface CustomerLayoutProps {
  children: ReactNode;
  showHeader?: boolean;
  showFooter?: boolean;
  maxWidthClass?: string;
  onBack?: () => void;
  backLabel?: string;
  showCustomerNav?: boolean;
  activeNav?: "shop" | "scan" | "search" | "history" | "profile";
  onScanClick?: () => void;
  onSearchClick?: () => void;
}

export function CustomerLayout({
  children,
  showHeader = true,
  showFooter = true,
  maxWidthClass = "max-w-[440px]",
  onBack,
  backLabel,
  showCustomerNav = false,
  activeNav,
  onScanClick,
  onSearchClick,
}: CustomerLayoutProps) {
  const navigate = useNavigate();
  const { selectedStore, sessionId, itemCount, orderHistory } = useShopping();
  const { user, isAuthenticated, logout } = useAuth();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const isStaff = Boolean(
    user &&
    (user.role === "CASHIER" ||
      user.role === "STORE_ADMIN" ||
      user.role === "ADMIN" ||
      user.role === "SECURITY_GUARD" ||
      (user.role as string)?.toUpperCase() === "CASHIER" ||
      (user.role as string)?.toUpperCase() === "STORE_ADMIN" ||
      (user.role as string)?.toUpperCase() === "ADMIN" ||
      (user.role as string)?.toUpperCase() === "SECURITY_GUARD" ||
      user.email?.toLowerCase().includes("cashier") ||
      user.email?.toLowerCase().includes("guard") ||
      user.email?.toLowerCase().includes("admin"))
  );
  const isCustomer = !isStaff;

  return (
    <main className="relative min-h-screen bg-[#F8FAFC] text-[#111827] antialiased selection:bg-emerald-100 selection:text-emerald-900">
      <div
        className={`mx-auto flex min-h-screen w-full ${maxWidthClass} flex-col px-4 sm:px-6 py-3 sm:py-5 ${
          showCustomerNav ? "pb-28 sm:pb-10" : "pb-10"
        }`}
      >
        {/* Navigation & Brand Header */}
        {showHeader && (
          <header className="no-print relative z-30 mb-4 flex items-center justify-between gap-2 sm:gap-3 rounded-2xl border border-slate-200/80 bg-white/95 px-3 sm:px-4 py-2 sm:py-2.5 shadow-xs backdrop-blur-xl">
            {/* ── LEFT SECTION: Navigation & Logo/Title ── */}
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1 mr-1 sm:mr-2">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-50 text-slate-600 transition hover:bg-slate-100 hover:text-[#101828] active:scale-95 shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16A36A]"
                  aria-label={backLabel || "Back"}
                >
                  <IcBack />
                </button>
              )}
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="flex items-center gap-1.5 flex-nowrap">
                  <span className="font-poppins text-lg sm:text-xl font-black tracking-[-0.04em] text-[#101828] leading-none shrink-0">
                    QLESS
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 sm:px-2 py-0.5 text-[8.5px] sm:text-[9px] font-bold text-[#16A36A] border border-emerald-200/60 leading-none shrink-0">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#16A36A] animate-pulse" />
                    LIVE
                  </span>
                </div>
                <p className="text-[10px] sm:text-[11px] font-medium text-[#667085] truncate leading-tight mt-0.5 max-w-full">
                  {selectedStore ? selectedStore.name || selectedStore.chain : "QLess Mart"}
                  {sessionId ? ` · #${String(sessionId).slice(-6)}` : ""}
                </p>
              </div>
            </div>

            {/* ── RIGHT SECTION: Actions & Profile ── */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Customer Shopping Quick Actions */}
              {isCustomer ? (
                <>
                  {/* Orders button (Icon-only with notification count badge) */}
                  <button
                    type="button"
                    onClick={() => navigate("/history")}
                    className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-600 shadow-2xs hover:bg-slate-50 transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16A36A] cursor-pointer"
                    title="View order history"
                    aria-label={`View order history, ${orderHistory.length} orders`}
                  >
                    <IcHistory className="h-4 w-4 text-slate-600" />
                    {orderHistory.length > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#101828] text-white text-[9px] font-bold px-1 ring-2 ring-white shadow-xs">
                        {orderHistory.length > 99 ? "99+" : orderHistory.length}
                      </span>
                    )}
                  </button>

                  {/* Cart button (Icon + count only) */}
                  <button
                    type="button"
                    onClick={() => navigate("/shop")}
                    className="flex h-9 min-w-[36px] items-center justify-center gap-1 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-2 text-xs font-bold text-[#16A36A] shadow-2xs hover:bg-emerald-100 transition active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16A36A]"
                    title="View Cart"
                    aria-label={`View Cart, ${itemCount} items`}
                  >
                    <IcCart className="h-3.5 w-3.5 shrink-0" />
                    <span className="tabular-nums text-xs font-bold">{itemCount}</span>
                  </button>
                </>
              ) : (
                /* Role-specific Operations Desk Quick-Link (Icon-only) */
                <>
                  {(user?.role === "CASHIER" || user?.email?.toLowerCase().includes("cashier")) && (
                    <button
                      type="button"
                      onClick={() => navigate("/cashier")}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-blue-200 bg-blue-50/90 text-blue-700 shadow-2xs hover:bg-blue-100 transition active:scale-95 cursor-pointer"
                      title="Return to Cashier Desk"
                      aria-label="Return to Cashier Desk"
                    >
                      <IcUser className="h-4 w-4" />
                    </button>
                  )}
                  {(user?.role === "ADMIN" || user?.role === "STORE_ADMIN" || user?.email?.toLowerCase().includes("admin")) && (
                    <button
                      type="button"
                      onClick={() => navigate("/admin")}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-purple-200 bg-purple-50/90 text-purple-700 shadow-2xs hover:bg-purple-100 transition active:scale-95 cursor-pointer"
                      title="Return to Admin Console"
                      aria-label="Return to Admin Console"
                    >
                      <IcShield className="h-4 w-4" />
                    </button>
                  )}
                  {(user?.role === "SECURITY_GUARD" || user?.email?.toLowerCase().includes("guard")) && (
                    <button
                      type="button"
                      onClick={() => navigate("/security")}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-200 bg-amber-50/90 text-amber-800 shadow-2xs hover:bg-amber-100 transition active:scale-95 cursor-pointer"
                      title="Return to Security Terminal"
                      aria-label="Return to Security Terminal"
                    >
                      <IcScan className="h-4 w-4" />
                    </button>
                  )}
                </>
              )}

              {/* Authentication Status / Profile Pill with Dropdown (Icon-only avatar + chevron) */}
              {isAuthenticated && user ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                    className="flex h-9 items-center justify-center gap-1 rounded-xl border border-slate-200/80 bg-white px-2 text-xs font-semibold text-[#111827] shadow-2xs hover:bg-slate-50 active:scale-95 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16A36A] cursor-pointer"
                    title={`Logged in as ${user.name} (${user.role})`}
                    aria-label={`User menu for ${user.name}`}
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#101828] text-[9.5px] text-white font-bold leading-none">
                      {user.avatarInitials || user.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="text-[10px] text-slate-400 select-none">▾</span>
                  </button>

                  {/* Dropdown Menu */}
                  {isUserMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsUserMenuOpen(false)}
                      />
                      <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-slate-200/90 bg-white p-2 shadow-xl z-[100] qless-scale-in text-xs">
                        <div className="px-3 py-2 border-b border-slate-100 mb-1">
                          <p className="font-bold text-[#101828] truncate">{user.name}</p>
                          <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
                          <span className="mt-1 inline-block rounded-full bg-emerald-50 text-[#16A36A] text-[9px] font-bold px-2 py-0.5 border border-emerald-200/60">
                            {user.role} · Verified
                          </span>
                        </div>

                        <div className="space-y-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setIsUserMenuOpen(false);
                              navigate("/profile");
                            }}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-medium text-[#111827] hover:bg-slate-50 transition cursor-pointer"
                          >
                            <IcUser className="h-4 w-4 text-slate-500" />
                            <span>My Profile</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setIsUserMenuOpen(false);
                              navigate("/settings");
                            }}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-medium text-[#111827] hover:bg-slate-50 transition cursor-pointer"
                          >
                            <IcSettings className="h-4 w-4 text-slate-500" />
                            <span>Account Settings</span>
                          </button>

                          {/* Only regular shoppers have customer order history */}
                          {isCustomer && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsUserMenuOpen(false);
                                navigate("/history");
                              }}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-medium text-[#111827] hover:bg-slate-50 transition cursor-pointer"
                            >
                              <IcHistory className="h-4 w-4 text-slate-500" />
                              <span>Order History</span>
                            </button>
                          )}

                          {/* Authorized staff portal access */}
                          {(user?.role === "ADMIN" || user?.role === "STORE_ADMIN" || user?.email?.toLowerCase().includes("admin")) && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsUserMenuOpen(false);
                                navigate("/admin");
                              }}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-bold text-blue-700 bg-blue-50/70 hover:bg-blue-100 transition cursor-pointer"
                            >
                              <IcShield />
                              <span>Admin Dashboard</span>
                            </button>
                          )}

                          {(user?.role === "SECURITY_GUARD" || user?.email?.toLowerCase().includes("guard")) && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsUserMenuOpen(false);
                                navigate("/security");
                              }}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-bold text-amber-800 bg-amber-50/70 hover:bg-amber-100 transition cursor-pointer"
                            >
                              <IcScan />
                              <span>Security Terminal</span>
                            </button>
                          )}

                          {(user?.role === "CASHIER" || user?.email?.toLowerCase().includes("cashier")) && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsUserMenuOpen(false);
                                navigate("/cashier");
                              }}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-bold text-blue-700 bg-blue-50/70 hover:bg-blue-100 transition cursor-pointer"
                            >
                              <IcUser className="h-4 w-4" />
                              <span>Cashier Desk</span>
                            </button>
                          )}
                        </div>

                        <div className="border-t border-slate-100 mt-1 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setIsUserMenuOpen(false);
                              logout();
                              navigate("/auth/login");
                            }}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-semibold text-red-600 hover:bg-red-50 transition cursor-pointer"
                          >
                            <IcLogout className="h-4 w-4 text-red-500" />
                            <span>Sign Out</span>
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate("/auth/login")}
                  className="rounded-xl bg-[#101828] px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-slate-800 transition active:scale-95 cursor-pointer"
                >
                  Sign In
                </button>
              )}
            </div>
          </header>
        )}

        {/* Screen Content */}
        <div className="flex-1 flex flex-col">{children}</div>

        {/* Consistent Footer */}
        {showFooter && (
          <footer className="pb-2 pt-6 text-center">
            <p className="text-xs text-[#667085]">
              Shop freely. Scan instantly. Pay digitally.
            </p>
          </footer>
        )}

        {/* Mobile Navigation Bar */}
        {showCustomerNav && (
          isCustomer ? (
            <nav
              aria-label="Customer Mobile Navigation"
              className="no-print sm:hidden fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/95 backdrop-blur-xl shadow-[0_-4px_24px_rgba(0,0,0,0.05)] px-3 pt-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]"
            >
              <div className="grid grid-cols-5 gap-1 max-w-[440px] mx-auto">
                {/* 1. Shop / Cart */}
                <button
                  type="button"
                  onClick={() => navigate("/shop")}
                  className={`flex flex-col items-center justify-center min-h-[46px] py-1 px-1 rounded-xl transition active:scale-95 ${
                    activeNav === "shop"
                      ? "text-[#16A36A] font-bold"
                      : "text-[#667085] hover:text-[#101828]"
                  }`}
                >
                  <div className="relative">
                    <IcCart className={`h-5 w-5 ${activeNav === "shop" ? "text-[#16A36A]" : "text-[#667085]"}`} />
                    {itemCount > 0 && (
                      <span className="absolute -top-1 -right-2.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#16A36A] text-[9px] font-bold text-white px-1">
                        {itemCount}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] tracking-tight leading-none mt-1">Cart</span>
                </button>

                {/* 2. Scan Barcode */}
                <button
                  type="button"
                  onClick={() => {
                    if (onScanClick) onScanClick();
                    else navigate("/shop");
                  }}
                  className={`flex flex-col items-center justify-center min-h-[46px] py-1 px-1 rounded-xl transition active:scale-95 ${
                    activeNav === "scan"
                      ? "text-[#16A36A] font-bold"
                      : "text-[#667085] hover:text-[#101828]"
                  }`}
                >
                  <IcScan />
                  <span className="text-[10px] tracking-tight leading-none mt-1">Scan</span>
                </button>

                {/* 3. Search Catalog */}
                <button
                  type="button"
                  onClick={() => {
                    if (onSearchClick) onSearchClick();
                    else navigate("/shop");
                  }}
                  className={`flex flex-col items-center justify-center min-h-[46px] py-1 px-1 rounded-xl transition active:scale-95 ${
                    activeNav === "search"
                      ? "text-[#16A36A] font-bold"
                      : "text-[#667085] hover:text-[#101828]"
                  }`}
                >
                  <IcSearch />
                  <span className="text-[10px] tracking-tight leading-none mt-1">Search</span>
                </button>

                {/* 4. Order History */}
                <button
                  type="button"
                  onClick={() => navigate("/history")}
                  className={`flex flex-col items-center justify-center min-h-[46px] py-1 px-1 rounded-xl transition active:scale-95 ${
                    activeNav === "history"
                      ? "text-[#16A36A] font-bold"
                      : "text-[#667085] hover:text-[#101828]"
                  }`}
                >
                  <div className="relative">
                    <IcHistory className={`h-5 w-5 ${activeNav === "history" ? "text-[#16A36A]" : "text-[#667085]"}`} />
                    {orderHistory.length > 0 && (
                      <span className="absolute -top-1 -right-2.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#101828] text-[9px] font-bold text-white px-1">
                        {orderHistory.length}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] tracking-tight leading-none mt-1">Orders</span>
                </button>

                {/* 5. Account / Profile */}
                <button
                  type="button"
                  onClick={() => navigate("/profile")}
                  className={`flex flex-col items-center justify-center min-h-[46px] py-1 px-1 rounded-xl transition active:scale-95 ${
                    activeNav === "profile"
                      ? "text-[#16A36A] font-bold"
                      : "text-[#667085] hover:text-[#101828]"
                  }`}
                >
                  <IcUser className={`h-5 w-5 ${activeNav === "profile" ? "text-[#16A36A]" : "text-[#667085]"}`} />
                  <span className="text-[10px] tracking-tight leading-none mt-1">Profile</span>
                </button>
              </div>
            </nav>
          ) : (
            <nav
              aria-label="Staff Mobile Navigation"
              className="no-print sm:hidden fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/95 backdrop-blur-xl shadow-[0_-4px_24px_rgba(0,0,0,0.05)] px-4 pt-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]"
            >
              <div className="grid grid-cols-3 gap-2 max-w-[360px] mx-auto">
                {/* 1. Return to Staff Operational Desk */}
                <button
                  type="button"
                  onClick={() => {
                    if (user.role === "CASHIER") navigate("/cashier");
                    else if (user.role === "SECURITY_GUARD") navigate("/security");
                    else navigate("/admin");
                  }}
                  className="flex flex-col items-center justify-center min-h-[46px] py-1 px-1 rounded-xl transition active:scale-95 text-[#101828] font-bold"
                >
                  {user.role === "CASHIER" ? (
                    <IcUser className="h-5 w-5 text-blue-600" />
                  ) : user.role === "SECURITY_GUARD" ? (
                    <IcScan className="h-5 w-5 text-amber-600" />
                  ) : (
                    <IcShield className="h-5 w-5 text-purple-600" />
                  )}
                  <span className="text-[10px] tracking-tight leading-none mt-1">
                    {user.role === "CASHIER" ? "Cashier Desk" : user.role === "SECURITY_GUARD" ? "Security Desk" : "Admin Desk"}
                  </span>
                </button>

                {/* 2. Staff Profile */}
                <button
                  type="button"
                  onClick={() => navigate("/profile")}
                  className={`flex flex-col items-center justify-center min-h-[46px] py-1 px-1 rounded-xl transition active:scale-95 ${
                    activeNav === "profile"
                      ? "text-[#16A36A] font-bold"
                      : "text-[#667085] hover:text-[#101828]"
                  }`}
                >
                  <IcUser className="h-5 w-5" />
                  <span className="text-[10px] tracking-tight leading-none mt-1">My Profile</span>
                </button>

                {/* 3. Account Settings */}
                <button
                  type="button"
                  onClick={() => navigate("/settings")}
                  className="flex flex-col items-center justify-center min-h-[46px] py-1 px-1 rounded-xl transition active:scale-95 text-[#667085] hover:text-[#101828]"
                >
                  <IcSettings className="h-5 w-5" />
                  <span className="text-[10px] tracking-tight leading-none mt-1">Settings</span>
                </button>
              </div>
            </nav>
          )
        )}
      </div>
    </main>
  );
}
