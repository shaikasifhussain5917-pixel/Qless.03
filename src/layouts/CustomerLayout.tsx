import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useShopping } from "../context/ShoppingContext";
import { useAuth } from "../context/AuthContext";

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
  maxWidthClass = "max-w-[420px]",
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

  return (
    <main
      className="relative min-h-screen px-3 py-4 sm:px-6 sm:py-6 text-[#0F2044] antialiased qless-app-bg"
      style={{ backgroundImage: `url('/images/qless-bg.jpg')` }}
    >
      {/* Soft glassmorphism overlay to preserve contrast over background photo */}
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-gradient-to-b from-white/80 via-white/65 to-white/80 backdrop-blur-[2px]"
        aria-hidden="true"
      />

      <div className={`relative z-[1] mx-auto flex min-h-[calc(100vh-2rem)] sm:min-h-[calc(100vh-2.5rem)] w-full ${maxWidthClass} flex-col ${showCustomerNav ? "pb-20 sm:pb-0" : ""}`}>
        {/* Navigation & Brand Header */}
        {showHeader && (
          <header className="no-print relative z-30 flex items-center justify-between pb-3 pt-1 border-b border-black/5 mb-3 gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="flex min-h-[40px] min-w-[40px] h-10 w-10 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-white/80 border border-black/5 text-[#7A8493] hover:text-[#0F2044] hover:bg-white shadow-sm transition active:scale-95 shrink-0"
                  aria-label={backLabel || "Back"}
                >
                  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5M5 12l6-6M5 12l6 6" />
                  </svg>
                </button>
              )}
              <div className="min-w-0">
                <p className="font-poppins text-lg sm:text-[20px] font-bold tracking-[-0.03em] text-[#0F2044] leading-tight">
                  QLESS
                </p>
                <p className="text-[11px] sm:text-xs font-medium text-[#7A8493] truncate">
                  Session #{sessionId} · {selectedStore ? selectedStore.chain : "Store"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={() => navigate("/history")}
                className="flex min-h-[36px] items-center gap-1 rounded-full border border-white/60 bg-white/90 px-2 sm:px-2.5 py-1 text-xs font-semibold text-[#0F2044] shadow-xs backdrop-blur-sm hover:bg-white transition active:scale-95"
                title="View shopping history"
                aria-label="View shopping history"
              >
                <span>🕒</span>
                <span className="hidden sm:inline">History</span>
                {orderHistory.length > 0 && (
                  <span className="rounded-full bg-[#0F2044] text-white text-[9px] px-1 py-0.2">
                    {orderHistory.length}
                  </span>
                )}
              </button>

              <span className="min-h-[36px] flex items-center rounded-full border border-white/60 bg-white/90 px-2 sm:px-3 py-1 text-xs font-semibold text-[#2E9E44] shadow-xs backdrop-blur-sm">
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </span>

              {/* Authentication Status / Profile Pill with Dropdown */}
              {isAuthenticated && user ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                    className="flex min-h-[36px] items-center gap-1.5 rounded-full border border-white/60 bg-white/95 px-2 sm:px-2.5 py-1 text-xs font-semibold text-[#0F2044] shadow-xs hover:bg-white transition active:scale-95"
                    title={`Logged in as ${user.name} (${user.role})`}
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0F2044] text-[10px] text-white font-bold">
                      {user.avatarInitials}
                    </span>
                    <span className="hidden sm:inline max-w-[80px] truncate">{user.name.split(" ")[0]}</span>
                    <span className="text-[9px] text-[#7A8493]">▾</span>
                  </button>

                  {/* Dropdown Menu */}
                  {isUserMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsUserMenuOpen(false)}
                      />
                      <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-black/10 bg-white p-2.5 shadow-2xl z-[100] animate-in fade-in zoom-in-95 duration-100 text-xs">
                        <div className="px-3 py-2 border-b border-black/5 mb-1.5">
                          <p className="font-bold text-[#0F2044] truncate">{user.name}</p>
                          <p className="text-[10px] text-[#7A8493] truncate">{user.email}</p>
                          <span className="mt-1 inline-block rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-bold px-2 py-0.5 border border-emerald-200/60">
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
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-medium text-[#0F2044] hover:bg-black/5 transition cursor-pointer"
                          >
                            <span>👤</span>
                            <span>My Profile</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setIsUserMenuOpen(false);
                              navigate("/settings");
                            }}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-medium text-[#0F2044] hover:bg-black/5 transition cursor-pointer"
                          >
                            <span>⚙️</span>
                            <span>Account Settings</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setIsUserMenuOpen(false);
                              navigate("/history");
                            }}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-medium text-[#0F2044] hover:bg-black/5 transition cursor-pointer"
                          >
                            <span>🕒</span>
                            <span>Order History</span>
                          </button>

                          {/* Authorized staff portal access (strictly matching role, never non-authenticated roles) */}
                          {(user.role === "ADMIN" || user.role === "STORE_ADMIN") && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsUserMenuOpen(false);
                                navigate("/admin");
                              }}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-bold text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100 transition cursor-pointer"
                            >
                              <span>🛡️</span>
                              <span>Admin Dashboard</span>
                            </button>
                          )}

                          {user.role === "SECURITY_GUARD" && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsUserMenuOpen(false);
                                navigate("/security");
                              }}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-bold text-amber-800 bg-amber-50/70 hover:bg-amber-100 transition cursor-pointer"
                            >
                              <span>👮</span>
                              <span>Security Terminal</span>
                            </button>
                          )}

                          {user.role === "CASHIER" && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsUserMenuOpen(false);
                                navigate("/cashier");
                              }}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-bold text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100 transition cursor-pointer"
                            >
                              <span>🧑‍💼</span>
                              <span>Cashier Desk</span>
                            </button>
                          )}
                        </div>

                        <div className="border-t border-black/5 mt-1.5 pt-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setIsUserMenuOpen(false);
                              logout();
                              navigate("/auth/login");
                            }}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-bold text-red-600 hover:bg-red-50 transition cursor-pointer"
                          >
                            <span>🚪</span>
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
                  className="rounded-full border border-black/10 bg-[#0F2044] px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 transition active:scale-95 cursor-pointer"
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
            <p className="font-alegreya text-xs text-[#7A8493] tracking-wide">
              Scan. Pay. Go. — No queues, no waiting.
            </p>
          </footer>
        )}

        {/* Mobile Customer Bottom Navigation Bar */}
        {showCustomerNav && (
          <nav
            aria-label="Customer Mobile Navigation"
            className="no-print sm:hidden fixed inset-x-0 bottom-0 z-30 border-t border-black/10 bg-white/95 backdrop-blur-xl shadow-[0_-8px_24px_rgba(15,32,68,0.12)] px-2 pt-1 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]"
          >
            <div className="grid grid-cols-5 gap-1 max-w-[440px] mx-auto">
              {/* 1. Shop / Cart */}
              <button
                type="button"
                onClick={() => navigate("/shop")}
                className={`flex flex-col items-center justify-center min-h-[48px] py-1 px-1 rounded-xl transition active:scale-95 ${
                  activeNav === "shop"
                    ? "text-[#2E9E44] font-bold"
                    : "text-[#7A8493] hover:text-[#0F2044]"
                }`}
              >
                <div className="relative">
                  <span className="text-lg">🛒</span>
                  {itemCount > 0 && (
                    <span className="absolute -top-1 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#2E9E44] text-[9px] font-bold text-white px-1">
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
                className={`flex flex-col items-center justify-center min-h-[48px] py-1 px-1 rounded-xl transition active:scale-95 ${
                  activeNav === "scan"
                    ? "text-[#2E9E44] font-bold"
                    : "text-[#7A8493] hover:text-[#0F2044]"
                }`}
              >
                <span className="text-lg">📷</span>
                <span className="text-[10px] tracking-tight leading-none mt-1">Scan</span>
              </button>

              {/* 3. Search Catalog */}
              <button
                type="button"
                onClick={() => {
                  if (onSearchClick) onSearchClick();
                  else navigate("/shop");
                }}
                className={`flex flex-col items-center justify-center min-h-[48px] py-1 px-1 rounded-xl transition active:scale-95 ${
                  activeNav === "search"
                    ? "text-[#2E9E44] font-bold"
                    : "text-[#7A8493] hover:text-[#0F2044]"
                }`}
              >
                <span className="text-lg">🔍</span>
                <span className="text-[10px] tracking-tight leading-none mt-1">Search</span>
              </button>

              {/* 4. Order History */}
              <button
                type="button"
                onClick={() => navigate("/history")}
                className={`flex flex-col items-center justify-center min-h-[48px] py-1 px-1 rounded-xl transition active:scale-95 ${
                  activeNav === "history"
                    ? "text-[#2E9E44] font-bold"
                    : "text-[#7A8493] hover:text-[#0F2044]"
                }`}
              >
                <div className="relative">
                  <span className="text-lg">🕒</span>
                  {orderHistory.length > 0 && (
                    <span className="absolute -top-1 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#0F2044] text-[9px] font-bold text-white px-1">
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
                className={`flex flex-col items-center justify-center min-h-[48px] py-1 px-1 rounded-xl transition active:scale-95 ${
                  activeNav === "profile"
                    ? "text-[#2E9E44] font-bold"
                    : "text-[#7A8493] hover:text-[#0F2044]"
                }`}
              >
                <span className="text-lg">👤</span>
                <span className="text-[10px] tracking-tight leading-none mt-1">Profile</span>
              </button>
            </div>
          </nav>
        )}
      </div>
    </main>
  );
}
