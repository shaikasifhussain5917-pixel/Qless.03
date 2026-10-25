import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { AuthLayout } from "../../components/auth/AuthLayout";
import { DEMO_CREDENTIALS } from "../../utils/authStorage";
import { isSupabaseConfigured } from "../../lib/supabase";

export function AdminLoginScreen() {
  const navigate = useNavigate();
  const { loginAdmin, isLoggingIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!email.trim()) {
      setErrorMessage("Administrator email is required.");
      return;
    }
    if (!password) {
      setErrorMessage("Administrator password is required.");
      return;
    }

    const res = await loginAdmin(email, password);
    if (!res.success) {
      setErrorMessage(res.error || "Access denied. Invalid administrator credentials.");
      return;
    }

    // Success -> redirect directly to the protected Admin Dashboard
    navigate("/admin", { replace: true });
  };

  const handleFillDemo = () => {
    setEmail(DEMO_CREDENTIALS.admin.email);
    setPassword("");
    setErrorMessage("");
  };

  return (
    <AuthLayout
      title="Admin Portal Sign In"
      subtitle="Authorized access for supermarket inventory & transaction managers"
      roleBadge={{ label: "Staff Only", colorClass: "bg-blue-100 text-blue-900 border border-blue-200" }}
      onBack={() => navigate("/auth/role")}
    >
      {/* Staff Account Banner */}
      <div className="mb-4 rounded-2xl border border-blue-500/20 bg-blue-50/70 p-3 text-xs text-blue-950 flex items-center justify-between">
        <div>
          <p className="font-semibold text-blue-900">
            {isSupabaseConfigured ? "Authorized Store Admin" : "Demo Admin Account"}
          </p>
          <p className="text-[11px] text-blue-700 font-mono">
            {DEMO_CREDENTIALS.admin.email}
          </p>
          <p className="text-[10px] text-blue-600/80 mt-0.5">
            {isSupabaseConfigured
              ? "Live Supabase Auth · Enter your assigned staff password"
              : "Local prototype simulation mode"}
          </p>
        </div>
        <button
          type="button"
          onClick={handleFillDemo}
          className="rounded-xl bg-[#0F2044] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-slate-800 transition active:scale-95 shadow-xs shrink-0 ml-2"
        >
          {isSupabaseConfigured ? "Auto Fill Email" : "Auto Fill"}
        </button>
      </div>

      {errorMessage && (
        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2">
          <span>⛔</span>
          <span className="leading-relaxed">{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Admin Email */}
        <div>
          <label
            htmlFor="admin-email"
            className="block text-xs font-bold uppercase tracking-wider text-[#7A8493] mb-1.5"
          >
            Administrator Email
          </label>
          <input
            id="admin-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoggingIn}
            placeholder="admin@qless.store"
            className="w-full rounded-2xl border border-black/10 bg-black/5 px-4 py-3 text-sm font-medium text-[#0F2044] placeholder-[#9AA3AF] focus:border-[#0F2044] focus:bg-white focus:outline-hidden transition"
          />
        </div>

        {/* Admin Password */}
        <div>
          <label
            htmlFor="admin-password"
            className="block text-xs font-bold uppercase tracking-wider text-[#7A8493] mb-1.5"
          >
            Security Key / Password
          </label>
          <div className="relative">
            <input
              id="admin-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoggingIn}
              placeholder="Enter admin password"
              className="w-full rounded-2xl border border-black/10 bg-black/5 px-4 py-3 pr-11 text-sm font-medium text-[#0F2044] placeholder-[#9AA3AF] focus:border-[#0F2044] focus:bg-white focus:outline-hidden transition"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#7A8493] hover:text-[#0F2044] p-1 rounded-lg"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "🙈 Hide" : "👁️ Show"}
            </button>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoggingIn}
          className="w-full rounded-2xl bg-[#0F2044] py-3.5 px-4 font-poppins font-bold text-sm text-white shadow-[0_10px_25px_rgba(15,32,68,0.25)] hover:bg-[#1A3366] transition active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {isLoggingIn ? (
            <>
              <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Verifying Admin Authorization…</span>
            </>
          ) : (
            <span>Sign In to Admin Dashboard</span>
          )}
        </button>
      </form>

      <div className="mt-5 text-center">
        <p className="text-xs text-[#7A8493]">
          Staff authentication requires verified employee email. Regular customers cannot create
          administrator accounts.
        </p>
      </div>
    </AuthLayout>
  );
}
