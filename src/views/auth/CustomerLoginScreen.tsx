import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { AuthLayout } from "../../components/auth/AuthLayout";

export function CustomerLoginScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginCustomer, isLoggingIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!email.trim()) {
      setErrorMessage("Please enter your email address.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }
    if (!password) {
      setErrorMessage("Please enter your password.");
      return;
    }

    const res = await loginCustomer(email, password, rememberMe);
    if (!res.success) {
      setErrorMessage(res.error || "Login failed. Please check your credentials.");
      return;
    }

    // Success navigation: redirect to intended page or store QR scan check-in
    const destination = (location.state as { from?: string })?.from || "/scan-store";
    navigate(destination, { replace: true });
  };

  return (
    <AuthLayout
      title="Welcome Back"
      subtitle="Sign in to your QLess account to scan barcodes & pay seamlessly"
      roleBadge={{ label: "Shopper Login", colorClass: "bg-emerald-100 text-emerald-800" }}
      onBack={() => navigate("/auth/role")}
    >

      {errorMessage && (
        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2">
          <span>⚠️</span>
          <span className="leading-relaxed">{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Email Field */}
        <div>
          <label
            htmlFor="customer-email"
            className="block text-xs font-bold uppercase tracking-wider text-[#7A8493] mb-1.5"
          >
            Email Address
          </label>
          <input
            id="customer-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoggingIn}
            placeholder="you@example.com"
            className="w-full rounded-2xl border border-black/10 bg-black/5 px-4 py-3 text-base sm:text-sm font-medium text-[#0F2044] placeholder-[#9AA3AF] focus:border-[#2E9E44] focus:bg-white focus:outline-hidden transition"
          />
        </div>

        {/* Password Field */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="customer-password"
              className="block text-xs font-bold uppercase tracking-wider text-[#7A8493]"
            >
              Password
            </label>
            <Link
              to="/auth/forgot-password"
              className="text-xs font-semibold text-[#2E9E44] hover:underline"
            >
              Forgot Password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="customer-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoggingIn}
              placeholder="Enter your password"
              className="w-full rounded-2xl border border-black/10 bg-black/5 px-4 py-3 pr-12 text-base sm:text-sm font-medium text-[#0F2044] placeholder-[#9AA3AF] focus:border-[#2E9E44] focus:bg-white focus:outline-hidden transition"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center text-xs text-[#7A8493] hover:text-[#0F2044] rounded-lg"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "🙈" : "👁️"}
            </button>
          </div>
        </div>

        {/* Remember Me */}
        <div className="flex items-center gap-2 pt-1">
          <input
            id="remember-me"
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-[#2E9E44] focus:ring-[#2E9E44]"
          />
          <label htmlFor="remember-me" className="text-xs text-[#7A8493] cursor-pointer">
            Remember my session on this device
          </label>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoggingIn}
          className="w-full rounded-2xl bg-[#2E9E44] py-3.5 px-4 font-poppins font-bold text-sm text-white shadow-[0_10px_25px_rgba(46,158,68,0.25)] hover:bg-[#288B3B] transition active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {isLoggingIn ? (
            <>
              <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Signing in…</span>
            </>
          ) : (
            <span>Sign In to QLess</span>
          )}
        </button>
      </form>

      {/* Switch to Signup */}
      <div className="mt-5 text-center text-xs text-[#7A8493]">
        New to QLess?{" "}
        <Link to="/auth/signup" className="font-bold text-[#2E9E44] hover:underline">
          Create an account
        </Link>
      </div>
    </AuthLayout>
  );
}
