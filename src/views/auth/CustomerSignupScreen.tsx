import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { AuthLayout } from "../../components/auth/AuthLayout";
import { PasswordStrengthMeter } from "../../components/auth/PasswordStrengthMeter";

export function CustomerSignupScreen() {
  const navigate = useNavigate();
  const { signupCustomer, isLoggingIn } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreeToTerms, setAgreeToTerms] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Field-level error validation map
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState("");

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!fullName.trim()) {
      errors.fullName = "Please enter your full name.";
    } else if (fullName.trim().length < 2) {
      errors.fullName = "Full name must be at least 2 characters.";
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      errors.email = "Please enter your email address.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      errors.email = "Please enter a valid email (e.g. name@example.com).";
    }

    const cleanPhone = phone.trim().replace(/\D/g, "");
    if (!cleanPhone) {
      errors.phone = "Mobile number is required.";
    } else if (cleanPhone.length < 10) {
      errors.phone = "Please enter a 10-digit mobile number.";
    }

    if (!password) {
      errors.password = "Password is required.";
    } else if (password.length < 6) {
      errors.password = "Password must be at least 6 characters long.";
    }

    if (!confirmPassword) {
      errors.confirmPassword = "Please confirm your password.";
    } else if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match.";
    }

    if (!agreeToTerms) {
      errors.agreeToTerms = "You must accept the Terms of Service to create an account.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setGeneralError("");

    if (!validate()) return;

    const res = await signupCustomer({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      password,
      confirmPassword,
      agreeToTerms,
    });

    if (!res.success) {
      setGeneralError(res.error || "Failed to create account. Please try again.");
      return;
    }

    // Success -> redirect to Account Created confirmation screen
    navigate("/auth/account-created", {
      state: { name: fullName.trim(), email: email.trim().toLowerCase() },
      replace: true,
    });
  };

  const handleFillDemo = () => {
    setFullName("Aarav Patel");
    setEmail(`aarav.${Date.now().toString().slice(-4)}@example.com`);
    setPhone("9876543210");
    setPassword("Password123!");
    setConfirmPassword("Password123!");
    setAgreeToTerms(true);
    setFieldErrors({});
    setGeneralError("");
  };

  return (
    <AuthLayout
      title="Create Account"
      subtitle="Join QLess for fast self-checkout at top supermarkets"
      roleBadge={{ label: "New Shopper", colorClass: "bg-emerald-100 text-emerald-800" }}
      onBack={() => navigate("/auth/login")}
      maxWidthClass="max-w-[480px]"
    >
      {/* Quick Demo Fill helper */}
      <div className="mb-4 rounded-2xl border border-emerald-500/20 bg-emerald-50/70 p-3 text-xs text-emerald-950 flex items-center justify-between">
        <div>
          <p className="font-semibold text-emerald-900">Demo Shopper Signup</p>
          <p className="text-[11px] text-emerald-700">Fill test profile with matching passwords</p>
        </div>
        <button
          type="button"
          onClick={handleFillDemo}
          className="rounded-xl bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 transition active:scale-95 shadow-xs"
        >
          Auto Fill
        </button>
      </div>

      {generalError && (
        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2">
          <span>⚠️</span>
          <span className="leading-relaxed">{generalError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
        {/* Full Name */}
        <div>
          <label
            htmlFor="signup-name"
            className="block text-xs font-bold uppercase tracking-wider text-[#7A8493] mb-1"
          >
            Full Name
          </label>
          <input
            id="signup-name"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              if (fieldErrors.fullName) setFieldErrors((prev) => ({ ...prev, fullName: "" }));
            }}
            disabled={isLoggingIn}
            placeholder="e.g. Rahul Sharma"
            className={`w-full rounded-2xl border px-4 py-2.5 text-base sm:text-sm font-medium text-[#0F2044] placeholder-[#9AA3AF] focus:bg-white focus:outline-hidden transition ${
              fieldErrors.fullName
                ? "border-red-500 bg-red-50/40 focus:border-red-500"
                : "border-black/10 bg-black/5 focus:border-[#2E9E44]"
            }`}
          />
          {fieldErrors.fullName && (
            <p className="mt-1 text-[11px] font-semibold text-red-600">{fieldErrors.fullName}</p>
          )}
        </div>

        {/* Email */}
        <div>
          <label
            htmlFor="signup-email"
            className="block text-xs font-bold uppercase tracking-wider text-[#7A8493] mb-1"
          >
            Email Address
          </label>
          <input
            id="signup-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: "" }));
            }}
            disabled={isLoggingIn}
            placeholder="rahul@example.com"
            className={`w-full rounded-2xl border px-4 py-2.5 text-base sm:text-sm font-medium text-[#0F2044] placeholder-[#9AA3AF] focus:bg-white focus:outline-hidden transition ${
              fieldErrors.email
                ? "border-red-500 bg-red-50/40 focus:border-red-500"
                : "border-black/10 bg-black/5 focus:border-[#2E9E44]"
            }`}
          />
          {fieldErrors.email && (
            <p className="mt-1 text-[11px] font-semibold text-red-600">{fieldErrors.email}</p>
          )}
        </div>

        {/* Mobile Number */}
        <div>
          <label
            htmlFor="signup-phone"
            className="block text-xs font-bold uppercase tracking-wider text-[#7A8493] mb-1"
          >
            Mobile Number (India)
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#7A8493]">
              +91
            </span>
            <input
              id="signup-phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (fieldErrors.phone) setFieldErrors((prev) => ({ ...prev, phone: "" }));
              }}
              disabled={isLoggingIn}
              placeholder="98765 43210"
              className={`w-full rounded-2xl border pl-12 pr-4 py-2.5 text-base sm:text-sm font-medium text-[#0F2044] placeholder-[#9AA3AF] focus:bg-white focus:outline-hidden transition ${
                fieldErrors.phone
                  ? "border-red-500 bg-red-50/40 focus:border-red-500"
                  : "border-black/10 bg-black/5 focus:border-[#2E9E44]"
              }`}
            />
          </div>
          {fieldErrors.phone && (
            <p className="mt-1 text-[11px] font-semibold text-red-600">{fieldErrors.phone}</p>
          )}
        </div>

        {/* Password */}
        <div>
          <label
            htmlFor="signup-password"
            className="block text-xs font-bold uppercase tracking-wider text-[#7A8493] mb-1"
          >
            Password
          </label>
          <div className="relative">
            <input
              id="signup-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: "" }));
              }}
              disabled={isLoggingIn}
              placeholder="At least 6 characters"
              className={`w-full rounded-2xl border px-4 py-2.5 pr-12 text-base sm:text-sm font-medium text-[#0F2044] placeholder-[#9AA3AF] focus:bg-white focus:outline-hidden transition ${
                fieldErrors.password
                  ? "border-red-500 bg-red-50/40 focus:border-red-500"
                  : "border-black/10 bg-black/5 focus:border-[#2E9E44]"
              }`}
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
          <PasswordStrengthMeter password={password} />
          {fieldErrors.password && (
            <p className="mt-1 text-[11px] font-semibold text-red-600">{fieldErrors.password}</p>
          )}
        </div>

        {/* Confirm Password */}
        <div>
          <label
            htmlFor="signup-confirm-password"
            className="block text-xs font-bold uppercase tracking-wider text-[#7A8493] mb-1"
          >
            Confirm Password
          </label>
          <div className="relative">
            <input
              id="signup-confirm-password"
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (fieldErrors.confirmPassword)
                  setFieldErrors((prev) => ({ ...prev, confirmPassword: "" }));
              }}
              disabled={isLoggingIn}
              placeholder="Re-enter password"
              className={`w-full rounded-2xl border px-4 py-2.5 pr-12 text-base sm:text-sm font-medium text-[#0F2044] placeholder-[#9AA3AF] focus:bg-white focus:outline-hidden transition ${
                fieldErrors.confirmPassword
                  ? "border-red-500 bg-red-50/40 focus:border-red-500"
                  : "border-black/10 bg-black/5 focus:border-[#2E9E44]"
              }`}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center text-xs text-[#7A8493] hover:text-[#0F2044] rounded-lg"
              aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
            >
              {showConfirmPassword ? "🙈" : "👁️"}
            </button>
          </div>
          {fieldErrors.confirmPassword && (
            <p className="mt-1 text-[11px] font-semibold text-red-600">
              {fieldErrors.confirmPassword}
            </p>
          )}
        </div>

        {/* Terms and Conditions Checkbox */}
        <div className="pt-1">
          <div className="flex items-start gap-2.5">
            <input
              id="signup-terms"
              type="checkbox"
              checked={agreeToTerms}
              onChange={(e) => {
                setAgreeToTerms(e.target.checked);
                if (fieldErrors.agreeToTerms)
                  setFieldErrors((prev) => ({ ...prev, agreeToTerms: "" }));
              }}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#2E9E44] focus:ring-[#2E9E44] cursor-pointer"
            />
            <label htmlFor="signup-terms" className="text-xs text-[#7A8493] leading-snug cursor-pointer select-none">
              I agree to the{" "}
              <span className="font-semibold text-[#0F2044] underline">Terms of Service</span> and{" "}
              <span className="font-semibold text-[#0F2044] underline">Privacy Policy</span>.
            </label>
          </div>
          {fieldErrors.agreeToTerms && (
            <p className="mt-1 text-[11px] font-semibold text-red-600">
              {fieldErrors.agreeToTerms}
            </p>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoggingIn}
          className="w-full rounded-2xl bg-[#2E9E44] py-3.5 px-4 font-poppins font-bold text-sm text-white shadow-[0_10px_25px_rgba(46,158,68,0.25)] hover:bg-[#288B3B] transition active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
        >
          {isLoggingIn ? (
            <>
              <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Creating your account…</span>
            </>
          ) : (
            <span>Agree & Create Account</span>
          )}
        </button>
      </form>

      {/* Switch to Login */}
      <div className="mt-5 text-center text-xs text-[#7A8493]">
        Already have a QLess account?{" "}
        <Link to="/auth/login" className="font-bold text-[#2E9E44] hover:underline">
          Sign In
        </Link>
      </div>
    </AuthLayout>
  );
}
