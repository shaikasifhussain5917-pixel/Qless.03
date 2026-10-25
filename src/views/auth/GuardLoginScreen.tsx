import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { AuthLayout } from "../../components/auth/AuthLayout";
import { DEMO_CREDENTIALS } from "../../utils/authStorage";
import { isSupabaseConfigured } from "../../lib/supabase";

export function GuardLoginScreen() {
  const navigate = useNavigate();
  const { loginGuard, isLoggingIn } = useAuth();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [terminalId, setTerminalId] = useState("Gate Turnstile #2");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!identifier.trim()) {
      setErrorMessage("Please enter your Guard Badge ID or email.");
      return;
    }
    if (!password) {
      setErrorMessage("Please enter your terminal security password.");
      return;
    }

    const res = await loginGuard(identifier, password, terminalId);
    if (!res.success) {
      setErrorMessage(res.error || "Access denied. Invalid security guard credentials.");
      return;
    }

    // Success -> redirect directly to the protected Security Dashboard
    navigate("/security", { replace: true });
  };

  const handleFillDemo = () => {
    setIdentifier(DEMO_CREDENTIALS.guard.email);
    setPassword("");
    setTerminalId("Gate Turnstile #2");
    setErrorMessage("");
  };

  return (
    <AuthLayout
      title="Security Guard Terminal"
      subtitle="Authenticate checkpoint terminal for exit turnstile QR verification"
      roleBadge={{ label: "Gate Terminal", colorClass: "bg-amber-100 text-amber-900 border border-amber-200" }}
      onBack={() => navigate("/auth/role")}
    >
      {/* Staff Account Banner */}
      <div className="mb-4 rounded-2xl border border-amber-500/20 bg-amber-50/70 p-3 text-xs text-amber-950 flex items-center justify-between">
        <div>
          <p className="font-semibold text-amber-900">
            {isSupabaseConfigured ? "Authorized Security Terminal" : "Demo Guard Station"}
          </p>
          <p className="text-[11px] text-amber-800 font-mono">
            {DEMO_CREDENTIALS.guard.email} · {DEMO_CREDENTIALS.guard.identifier}
          </p>
          <p className="text-[10px] text-amber-700/80 mt-0.5">
            {isSupabaseConfigured
              ? "Live Supabase Auth · Enter your assigned guard password"
              : "Local prototype simulation mode"}
          </p>
        </div>
        <button
          type="button"
          onClick={handleFillDemo}
          className="rounded-xl bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-amber-700 transition active:scale-95 shadow-xs shrink-0 ml-2"
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
        {/* Guard ID */}
        <div>
          <label
            htmlFor="guard-id"
            className="block text-xs font-bold uppercase tracking-wider text-[#7A8493] mb-1.5"
          >
            Security Guard Staff Email or Badge ID
          </label>
          <input
            id="guard-id"
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            disabled={isLoggingIn}
            placeholder="guard.gate1@qless.store or GUARD-07"
            className="w-full rounded-2xl border border-black/10 bg-black/5 px-4 py-3 text-sm font-medium font-mono text-[#0F2044] placeholder-[#9AA3AF] focus:border-[#0F2044] focus:bg-white focus:outline-hidden transition"
          />
        </div>

        {/* Terminal Gate Selection */}
        <div>
          <label
            htmlFor="terminal-gate"
            className="block text-xs font-bold uppercase tracking-wider text-[#7A8493] mb-1.5"
          >
            Assigned Turnstile Gate
          </label>
          <select
            id="terminal-gate"
            value={terminalId}
            onChange={(e) => setTerminalId(e.target.value)}
            disabled={isLoggingIn}
            className="w-full rounded-2xl border border-black/10 bg-black/5 px-4 py-3 text-sm font-medium text-[#0F2044] focus:border-[#0F2044] focus:bg-white focus:outline-hidden transition"
          >
            <option value="Gate Turnstile #1">Gate Turnstile #1 (North Exit)</option>
            <option value="Gate Turnstile #2">Gate Turnstile #2 (Main Central Exit)</option>
            <option value="Gate Turnstile #3">Gate Turnstile #3 (Express Exit)</option>
          </select>
        </div>

        {/* Guard Password */}
        <div>
          <label
            htmlFor="guard-password"
            className="block text-xs font-bold uppercase tracking-wider text-[#7A8493] mb-1.5"
          >
            Terminal Security Passcode
          </label>
          <div className="relative">
            <input
              id="guard-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoggingIn}
              placeholder="Enter guard passcode"
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
              <span>Verifying Terminal Station…</span>
            </>
          ) : (
            <span>Authorize Terminal Access</span>
          )}
        </button>
      </form>
    </AuthLayout>
  );
}
