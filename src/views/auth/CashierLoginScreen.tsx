import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { AuthLayout } from "../../components/auth/AuthLayout";
import { DEMO_CREDENTIALS } from "../../utils/authStorage";
import { isSupabaseConfigured } from "../../lib/supabase";

export function CashierLoginScreen() {
  const navigate = useNavigate();
  const { loginCashier, isLoggingIn } = useAuth();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [terminalId, setTerminalId] = useState("Checkout Counter #03");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!identifier.trim()) {
      setErrorMessage("Please enter your Cashier Staff ID or email.");
      return;
    }
    if (!password) {
      setErrorMessage("Please enter your terminal security passcode.");
      return;
    }

    const res = await loginCashier(identifier, password, terminalId);
    if (!res.success) {
      setErrorMessage(res.error || "Access denied. Invalid cashier staff credentials.");
      return;
    }

    // Success -> redirect directly to the protected Cashier Station
    navigate("/cashier", { replace: true });
  };

  const handleFillDemo = () => {
    setIdentifier(DEMO_CREDENTIALS.cashier.email);
    setPassword("");
    setTerminalId("Checkout Counter #03");
    setErrorMessage("");
  };

  return (
    <AuthLayout
      title="Cashier Terminal Sign In"
      subtitle="Assisted checkout desk, manual barcode overrides, and cash settlement processing"
      roleBadge={{ label: "Cashier Desk · Staff Only", colorClass: "bg-indigo-100 text-indigo-900 border border-indigo-200" }}
      onBack={() => navigate("/auth/role")}
    >
      {/* Staff Account Banner */}
      <div className="mb-4 rounded-2xl border border-indigo-500/20 bg-indigo-50/70 p-3 text-xs text-indigo-950 flex items-center justify-between">
        <div>
          <p className="font-semibold text-indigo-900">
            {isSupabaseConfigured ? "Authorized Cashier Desk" : "Demo Cashier Station"}
          </p>
          <p className="text-[11px] text-indigo-800 font-mono">
            {DEMO_CREDENTIALS.cashier.email} · {DEMO_CREDENTIALS.cashier.identifier}
          </p>
          <p className="text-[10px] text-indigo-700/80 mt-0.5">
            {isSupabaseConfigured
              ? "Live Supabase Auth · Enter your assigned cashier password"
              : "Local prototype simulation mode"}
          </p>
        </div>
        <button
          type="button"
          onClick={handleFillDemo}
          className="rounded-xl bg-indigo-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-800 transition active:scale-95 shadow-xs shrink-0 ml-2"
        >
          {isSupabaseConfigured ? "Auto Fill Email" : "Auto Fill"}
        </button>
      </div>

      {!isSupabaseConfigured && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/80 p-2.5 text-[11px] text-amber-900 flex items-start gap-2">
          <span className="shrink-0 text-xs">⚠️</span>
          <p className="leading-relaxed">
            <strong>Demo Notice:</strong> Staff credentials are validated locally for evaluation. In production, cashier terminals are bound to encrypted physical till hardware.
          </p>
        </div>
      )}

      {errorMessage && (
        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2">
          <span>⛔</span>
          <span className="leading-relaxed">{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Cashier ID */}
        <div>
          <label
            htmlFor="cashier-id"
            className="block text-xs font-bold uppercase tracking-wider text-[#7A8493] mb-1.5"
          >
            Cashier Staff Email or Badge ID
          </label>
          <input
            id="cashier-id"
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            disabled={isLoggingIn}
            placeholder="cashier.counter3@qless.store or CASHIER-03"
            className="w-full rounded-2xl border border-black/10 bg-black/5 px-4 py-3 text-sm font-medium font-mono text-[#0F2044] placeholder-[#9AA3AF] focus:border-[#0F2044] focus:bg-white focus:outline-hidden transition"
          />
        </div>

        {/* Terminal Counter Selection */}
        <div>
          <label
            htmlFor="terminal-counter"
            className="block text-xs font-bold uppercase tracking-wider text-[#7A8493] mb-1.5"
          >
            Assigned Checkout Counter
          </label>
          <select
            id="terminal-counter"
            value={terminalId}
            onChange={(e) => setTerminalId(e.target.value)}
            disabled={isLoggingIn}
            className="w-full rounded-2xl border border-black/10 bg-black/5 px-4 py-3 text-sm font-medium text-[#0F2044] focus:border-[#0F2044] focus:bg-white focus:outline-hidden transition"
          >
            <option value="Checkout Counter #01">Checkout Counter #01 (Front East)</option>
            <option value="Checkout Counter #02">Checkout Counter #02 (Express Bay)</option>
            <option value="Checkout Counter #03">Checkout Counter #03 (Flagship Counter)</option>
          </select>
        </div>

        {/* Cashier Password */}
        <div>
          <label
            htmlFor="cashier-password"
            className="block text-xs font-bold uppercase tracking-wider text-[#7A8493] mb-1.5"
          >
            Terminal Security Passcode / Password
          </label>
          <div className="relative">
            <input
              id="cashier-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoggingIn}
              placeholder="Enter cashier passcode"
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
          className="w-full rounded-2xl bg-indigo-900 py-3.5 px-4 font-poppins font-bold text-sm text-white shadow-[0_10px_25px_rgba(49,46,129,0.25)] hover:bg-indigo-800 transition active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {isLoggingIn ? (
            <>
              <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Verifying Cashier Terminal…</span>
            </>
          ) : (
            <span>Authorize Cashier Station</span>
          )}
        </button>
      </form>
    </AuthLayout>
  );
}
