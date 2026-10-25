import { useNavigate } from "react-router-dom";
import { AdminTab, SupermarketStore } from "../../types";
import { useAuth } from "../../context/AuthContext";

interface AdminSidebarProps {
  currentTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  selectedStore: SupermarketStore | null;
  lowStockCount: number;
  totalOrdersCount: number;
  unresolvedDiscrepanciesCount: number;
}

export function AdminSidebar({
  currentTab,
  onSelectTab,
  selectedStore,
  lowStockCount,
  totalOrdersCount,
  unresolvedDiscrepanciesCount,
}: AdminSidebarProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const navItems: Array<{ id: AdminTab; label: string; icon: string; badge?: number; badgeColor?: string }> = [
    { id: "overview", label: "Overview", icon: "📊" },
    { id: "products", label: "Products Catalog", icon: "🏷️" },
    {
      id: "inventory",
      label: "Stock & Inventory",
      icon: "📦",
      badge: lowStockCount > 0 ? lowStockCount : undefined,
      badgeColor: "bg-amber-500 text-white",
    },
    {
      id: "stock-import",
      label: "Smart Stock Import",
      icon: "📥",
    },
    {
      id: "locations",
      label: "Product Locations",
      icon: "📍",
    },
    {
      id: "transactions",
      label: "Sales & Orders",
      icon: "💳",
      badge: totalOrdersCount > 0 ? totalOrdersCount : undefined,
      badgeColor: "bg-[#0F2044] text-white",
    },
    {
      id: "security",
      label: "Security Audit",
      icon: "🛡️",
      badge: unresolvedDiscrepanciesCount > 0 ? unresolvedDiscrepanciesCount : undefined,
      badgeColor: "bg-red-500 text-white",
    },
    {
      id: "gate-qr",
      label: "Gate QR Pass",
      icon: "🚪",
    },
  ];

  return (
    <aside className="w-full lg:w-64 shrink-0 rounded-3xl border border-white/70 bg-white/95 p-4 sm:p-5 shadow-sm backdrop-blur-md flex flex-col justify-between space-y-5">
      <div className="space-y-5">
        {/* Portal Branding */}
        <div className="border-b border-black/5 pb-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0F2044] text-white font-bold text-sm shadow-xs">
              Q
            </span>
            <div>
              <p className="font-poppins text-base font-extrabold text-[#0F2044] leading-tight tracking-tight">
                QLESS ADMIN
              </p>
              <p className="text-[10px] font-semibold text-[#2E9E44] uppercase tracking-wider">
                Store Operations Portal
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-xl bg-[#F9FAFB] p-2.5 border border-black/5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#8A94A3] uppercase block">
                Store Node
              </span>
              <span className="text-[9px] font-mono font-bold bg-[#0F2044] text-white px-1.5 py-0.2 rounded">
                STORE001
              </span>
            </div>
            <p className="font-semibold text-[#0F2044] truncate mt-1">
              {selectedStore?.name || "QLess Mart"}
            </p>
            <p className="text-[10px] text-[#7A8493]">{selectedStore?.branch || "HSR Layout Flagship"}</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="space-y-1">
          <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-[#8A94A3] mb-1.5">
            Management Modules
          </p>
          {navItems.map((item) => {
            const active = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 font-poppins text-xs font-semibold transition ${
                  active
                    ? "bg-[#0F2044] text-white shadow-xs"
                    : "text-[#7A8493] hover:bg-[#F8F9FA] hover:text-[#0F2044]"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold ${
                      active ? "bg-white text-[#0F2044]" : item.badgeColor || "bg-[#F0F2F5] text-[#0F2044]"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Active Admin Session & Logout */}
      <div className="border-t border-black/5 pt-4 space-y-2.5">
        <div className="flex items-center justify-between rounded-2xl bg-black/5 p-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[#0F2044] text-[10px] font-bold text-white">
              {user?.avatarInitials || "AD"}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-[#0F2044]">
                {user?.name || "Store Admin"}
              </p>
              <p className="text-[10px] text-[#7A8493] leading-none">
                {user?.role || "ADMIN"} · Verified Demo
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              logout();
              navigate("/auth/admin");
            }}
            className="text-[11px] font-bold text-red-600 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 transition"
            title="Sign out of Admin Portal"
          >
            Sign Out
          </button>
        </div>

        <button
          type="button"
          onClick={() => navigate("/auth/role")}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-black/10 bg-white py-1.5 text-[11px] font-semibold text-[#0F2044] hover:bg-[#F8F9FA] transition"
        >
          <span>🔄</span>
          <span>Switch Operating Portal</span>
        </button>
      </div>
    </aside>
  );
}
