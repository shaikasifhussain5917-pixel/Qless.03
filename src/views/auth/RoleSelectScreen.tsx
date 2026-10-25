import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { DemoNoticeBanner } from "../../components/auth/DemoNoticeBanner";

export function RoleSelectScreen() {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();

  const roles = [
    {
      id: "CUSTOMER",
      title: "Shopper / Customer",
      badge: "Self-Checkout",
      badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-200",
      icon: "🛒",
      description:
        "Scan barcodes from supermarket shelves, manage your live cart, pay digitally, and generate verified exit QR passes.",
      actionText: "Customer Login",
      signupText: "Create Shopper Account",
      targetPath: "/auth/login",
      signupPath: "/auth/signup",
      accentBorder: "hover:border-emerald-500",
      buttonColor: "bg-[#2E9E44] hover:bg-[#288B3B]",
    },
    {
      id: "ADMIN",
      title: "Store Administrator",
      badge: "Manager Portal",
      badgeColor: "bg-blue-100 text-blue-800 border-blue-200",
      icon: "💼",
      description:
        "Manage live grocery catalog, adjust shelf inventory, review real-time sales transactions, and audit security events.",
      actionText: "Admin Portal Sign In",
      targetPath: "/auth/admin",
      accentBorder: "hover:border-[#0F2044]",
      buttonColor: "bg-[#0F2044] hover:bg-[#1A3366]",
    },
    {
      id: "SECURITY_GUARD",
      title: "Security Guard Inspector",
      badge: "Turnstile Gate",
      badgeColor: "bg-amber-100 text-amber-800 border-amber-200",
      icon: "🛡️",
      description:
        "Scan customer exit QR passes with terminal camera or manual code, inspect bagged items, and record audit logs.",
      actionText: "Guard Terminal Access",
      targetPath: "/auth/guard",
      accentBorder: "hover:border-amber-500",
      buttonColor: "bg-[#0F2044] hover:bg-slate-800",
    },
    {
      id: "CASHIER",
      title: "Cashier Desk Assistant",
      badge: "Checkout Desk",
      badgeColor: "bg-indigo-100 text-indigo-800 border-indigo-200",
      icon: "🧑‍💼",
      description:
        "Assisted checkout support, manual barcode overrides, price inquiries, and physical cash drawer settlements.",
      actionText: "Cashier Station Access",
      targetPath: "/auth/cashier",
      accentBorder: "hover:border-indigo-500",
      buttonColor: "bg-indigo-900 hover:bg-indigo-800",
    },
  ];

  return (
    <main
      className="relative min-h-screen px-4 py-8 sm:px-6 sm:py-10 text-[#0F2044] antialiased qless-app-bg flex flex-col justify-between"
      style={{ backgroundImage: `url('/images/qless-bg.jpg')` }}
    >
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-gradient-to-b from-white/90 via-white/75 to-white/90 backdrop-blur-[2px]"
        aria-hidden="true"
      />

      <div className="relative z-[1] mx-auto w-full max-w-5xl">
        {/* Top Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 mb-6 border-b border-black/5 gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0F2044] text-white font-extrabold text-lg shadow-sm"
            >
              Q
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-poppins text-2xl font-extrabold tracking-tight text-[#0F2044]">
                  QLess Portals
                </h1>
                <span className="rounded-full bg-emerald-100 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                  Demo Auth
                </span>
              </div>
              <p className="text-xs text-[#7A8493]">
                Role-Based Access Control & Demonstration Authentication
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isAuthenticated && user ? (
              <div className="flex items-center gap-2 bg-white/90 border border-black/5 rounded-2xl px-3.5 py-1.5 shadow-xs">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#0F2044] text-white text-xs font-bold">
                  {user.avatarInitials}
                </span>
                <div className="text-left">
                  <p className="text-xs font-bold text-[#0F2044] leading-none">{user.name}</p>
                  <p className="text-[10px] text-[#7A8493]">{user.role}</p>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="ml-2 text-xs text-red-600 hover:text-red-700 font-semibold px-2 py-0.5 rounded-lg hover:bg-red-50 transition"
                >
                  Logout
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => navigate("/")}
                className="rounded-xl border border-black/5 bg-white/90 px-3.5 py-2 text-xs font-semibold text-[#0F2044] hover:bg-white shadow-xs transition"
              >
                ← Back to Welcome
              </button>
            )}
          </div>
        </header>

        {/* Demo Notice Banner */}
        <div className="mb-8">
          <DemoNoticeBanner />
        </div>

        {/* Heading */}
        <div className="text-center mb-8">
          <h2 className="font-poppins text-3xl font-extrabold text-[#0F2044] tracking-tight">
            Choose Your Operating Role
          </h2>
          <p className="mt-2 text-sm text-[#7A8493] max-w-lg mx-auto">
            Select an interface below to authenticate. Customer shopping, inventory management, and
            security gate verification require specific role authorization.
          </p>
        </div>

        {/* 4 Role Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {roles.map((roleItem) => (
            <div
              key={roleItem.id}
              className={`rounded-3xl border border-white/80 bg-white/95 p-6 shadow-sm backdrop-blur-xl transition duration-200 flex flex-col justify-between ${roleItem.accentBorder}`}
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-3xl">{roleItem.icon}</span>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${roleItem.badgeColor}`}
                  >
                    {roleItem.badge}
                  </span>
                </div>

                <h3 className="font-poppins text-lg font-bold text-[#0F2044]">
                  {roleItem.title}
                </h3>
                <p className="mt-2 text-xs text-[#7A8493] leading-relaxed">
                  {roleItem.description}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-black/5 space-y-2.5">
                <button
                  type="button"
                  onClick={() => navigate(roleItem.targetPath)}
                  className={`w-full py-3 px-4 rounded-xl text-white font-poppins font-semibold text-xs tracking-wide shadow-sm transition active:scale-[0.98] ${roleItem.buttonColor}`}
                >
                  {roleItem.actionText} →
                </button>

                {roleItem.signupPath ? (
                  <button
                    type="button"
                    onClick={() => navigate(roleItem.signupPath)}
                    className="w-full py-2 px-3 rounded-xl border border-black/5 bg-black/5 text-[#0F2044] font-medium text-xs hover:bg-black/10 transition"
                  >
                    {roleItem.signupText}
                  </button>
                ) : (
                  <p className="text-[11px] text-center text-[#9AA3AF] italic">
                    Restricted Staff Credentials
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer info */}
        <div className="mt-10 text-center">
          <p className="text-xs text-[#7A8493]">
            QLess Smart Self-Checkout System · Role-Based Demonstration Authentication
          </p>
        </div>
      </div>
    </main>
  );
}
