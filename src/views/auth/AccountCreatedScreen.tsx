import { useLocation, useNavigate } from "react-router-dom";
import { AuthLayout } from "../../components/auth/AuthLayout";
import { useAuth } from "../../context/AuthContext";

export function AccountCreatedScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginCustomer } = useAuth();

  const state = (location.state as { name?: string; email?: string }) || {};
  const name = state.name || "Valued Shopper";
  const email = state.email || "your email";

  const handleStartShopping = async () => {
    // If registered customer email exists, automatically log them in
    if (state.email) {
      await loginCustomer(state.email, "demo");
    }
    navigate("/scan-store");
  };

  return (
    <AuthLayout
      title="Account Created!"
      subtitle="Welcome to the future of friction-free supermarket checkout"
      roleBadge={{ label: "Account Ready", colorClass: "bg-emerald-100 text-emerald-800" }}
      showRoleSwitcher={false}
      onBack={() => navigate("/auth/login")}
    >
      <div className="py-2 text-center space-y-4">
        {/* Animated Checkmark Badge */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-100 text-emerald-600 text-3xl shadow-sm">
          ✓
        </div>

        <div>
          <h2 className="font-poppins text-lg font-bold text-[#0F2044]">
            Hello, {name}!
          </h2>
          <p className="mt-1 text-xs text-[#7A8493] leading-relaxed max-w-sm mx-auto">
            Your demonstration shopper account has been registered with{" "}
            <span className="font-semibold text-[#0F2044]">{email}</span>.
          </p>
        </div>

        {/* Feature Highlights */}
        <div className="rounded-2xl border border-black/5 bg-black/5 p-3.5 text-left space-y-2 text-xs">
          <div className="flex items-center gap-2 text-[#0F2044]">
            <span className="text-emerald-600 font-bold">✓</span>
            <span>Scan product shelf barcodes with smartphone camera</span>
          </div>
          <div className="flex items-center gap-2 text-[#0F2044]">
            <span className="text-emerald-600 font-bold">✓</span>
            <span>Pay instantaneously via UPI, Card, or QLess Wallet</span>
          </div>
          <div className="flex items-center gap-2 text-[#0F2044]">
            <span className="text-emerald-600 font-bold">✓</span>
            <span>Fast exit turnstile clearance with verified QR passes</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 space-y-2.5">
          <button
            type="button"
            onClick={handleStartShopping}
            className="w-full rounded-2xl bg-[#2E9E44] py-3.5 px-4 font-poppins font-bold text-sm text-white shadow-[0_10px_25px_rgba(46,158,68,0.25)] hover:bg-[#288B3B] transition active:scale-[0.98]"
          >
            Start Shopping Now →
          </button>

          <button
            type="button"
            onClick={() => navigate(`/auth/verify-email?email=${encodeURIComponent(email)}`)}
            className="w-full rounded-2xl border border-black/10 bg-white py-2.5 px-4 font-poppins font-semibold text-xs text-[#0F2044] hover:bg-black/5 transition"
          >
            Simulate Email Verification UI
          </button>

          <button
            type="button"
            onClick={() => navigate("/auth/login")}
            className="text-xs text-[#7A8493] hover:text-[#0F2044] font-medium"
          >
            Return to Login Screen
          </button>
        </div>
      </div>
    </AuthLayout>
  );
}
