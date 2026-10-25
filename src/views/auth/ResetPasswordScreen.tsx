import { useState, useEffect, type FormEvent } from "react";
import { Link, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { AuthLayout } from "../../components/auth/AuthLayout";
import { PasswordStrengthMeter } from "../../components/auth/PasswordStrengthMeter";
import { useAuth } from "../../context/AuthContext";
import { normalizeRecoveryHashUrl } from "../../utils/authStorage";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";

export function ResetPasswordScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, updatePassword } = useAuth();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [tokenError, setTokenError] = useState<string | null>(null);
  const [isCheckingToken, setIsCheckingToken] = useState(true);
  const [hasValidToken, setHasValidToken] = useState(false);

  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetSuccess, setIsResetSuccess] = useState(false);

  // Check URL fragments and initialize recovery session
  useEffect(() => {
    let isMounted = true;

    async function evaluateRecoveryToken() {
      setIsCheckingToken(true);
      setTokenError(null);
      setHasValidToken(false);

      const { accessToken, refreshToken, errorCode, errorDescription } = normalizeRecoveryHashUrl();

      // Check for error parameters returned by Supabase Auth (e.g. otp_expired)
      if (errorCode || errorDescription) {
        if (!isMounted) return;
        const msg = errorDescription
          ? decodeURIComponent(errorDescription.replace(/\+/g, " "))
          : "This password recovery link is invalid or has expired.";
        setTokenError(msg);
        setIsCheckingToken(false);
        return;
      }

      // If tokens are present in URL, establish the recovery session
      if (accessToken) {
        if (isSupabaseConfigured && supabase) {
          try {
            const { data, error: sessionErr } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken || "",
            });

            if (!isMounted) return;

            if (sessionErr) {
              setTokenError(sessionErr.message);
              setHasValidToken(false);
            } else if (data.session) {
              setHasValidToken(true);
            }
          } catch (err) {
            if (!isMounted) return;
            console.warn("Failed to set recovery session:", err);
            setTokenError("Could not validate recovery token from link.");
            setHasValidToken(false);
          } finally {
            if (isMounted) setIsCheckingToken(false);
          }
        } else {
          // Development simulation mode with mock token
          if (!isMounted) return;
          setHasValidToken(true);
          setIsCheckingToken(false);
        }
        return;
      }

      // No token and no error -> direct navigation without link
      if (!isMounted) return;
      setHasValidToken(false);
      setIsCheckingToken(false);
    }

    evaluateRecoveryToken();
    window.addEventListener("hashchange", evaluateRecoveryToken);

    return () => {
      isMounted = false;
      window.removeEventListener("hashchange", evaluateRecoveryToken);
    };
  }, [location]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!password) {
      setError("Please enter a new password.");
      return;
    }
    if (password.length < 6) {
      setError("New password must be at least 6 characters long.");
      return;
    }
    if (!confirmPassword) {
      setError("Please confirm your new password.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    const res = await updatePassword(password);
    setIsSubmitting(false);

    if (!res.success) {
      setError(res.error || "Failed to update password. Your recovery session may have expired.");
      return;
    }

    setIsResetSuccess(true);
  };

  const emailParam = searchParams.get("email") || user?.email || "your account";

  return (
    <AuthLayout
      title="Set New Password"
      subtitle={`Choose a new secure password for ${emailParam}`}
      roleBadge={{ label: "Reset Password", colorClass: "bg-amber-100 text-amber-800" }}
      onBack={() => navigate("/auth/forgot-password")}
    >
      {/* ── STATE 1: Token Error (Expired or Invalid) ── */}
      {tokenError ? (
        <div className="space-y-4 py-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600 text-2xl shadow-xs">
            ⚠️
          </div>

          <div>
            <h2 className="font-poppins text-lg font-bold text-[#0F2044]">
              Recovery Link Expired
            </h2>
            <p className="mt-1 text-xs text-[#7A8493] leading-relaxed">
              {tokenError} For your security, password reset links expire after a short period or once used.
            </p>
          </div>

          <div className="pt-2 space-y-2">
            <button
              type="button"
              onClick={() => navigate("/auth/forgot-password")}
              className="w-full rounded-2xl bg-[#0F2044] py-3.5 px-4 font-poppins font-bold text-sm text-white shadow-xs hover:bg-[#1a2d5a] transition active:scale-[0.98]"
            >
              Request New Recovery Email
            </button>
            <button
              type="button"
              onClick={() => navigate("/auth/login")}
              className="text-xs text-[#7A8493] hover:text-[#0F2044] font-medium"
            >
              Return to Sign In
            </button>
          </div>
        </div>
      ) : isCheckingToken ? (
        /* ── STATE 2: Checking Token ── */
        <div className="py-8 text-center space-y-3">
          <div className="mx-auto h-8 w-8 border-3 border-[#2E9E44]/30 border-t-[#2E9E44] rounded-full animate-spin" />
          <p className="text-xs font-medium text-[#7A8493]">
            Validating password recovery credentials…
          </p>
        </div>
      ) : !hasValidToken ? (
        /* ── STATE 3: Missing Token ── */
        <div className="space-y-4 py-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 text-2xl shadow-xs">
            🔒
          </div>

          <div>
            <h2 className="font-poppins text-lg font-bold text-[#0F2044]">
              Recovery Link Required
            </h2>
            <p className="mt-1 text-xs text-[#7A8493] leading-relaxed">
              To set a new password, please use the secure recovery link sent to your registered email address.
            </p>
          </div>

          <div className="pt-2 space-y-2">
            <button
              type="button"
              onClick={() => navigate("/auth/forgot-password")}
              className="w-full rounded-2xl bg-[#2E9E44] py-3.5 px-4 font-poppins font-bold text-sm text-white shadow-[0_10px_25px_rgba(46,158,68,0.25)] hover:bg-[#288B3B] transition active:scale-[0.98]"
            >
              Request Recovery Link →
            </button>
            <button
              type="button"
              onClick={() => navigate("/auth/login")}
              className="text-xs text-[#7A8493] hover:text-[#0F2044] font-medium"
            >
              Back to Sign In
            </button>
          </div>
        </div>
      ) : isResetSuccess ? (
        /* ── STATE 4: Success ── */
        <div className="space-y-4 py-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 text-2xl shadow-xs">
            ✓
          </div>

          <div>
            <h2 className="font-poppins text-lg font-bold text-[#0F2044]">
              Password Updated!
            </h2>
            <p className="mt-1 text-xs text-[#7A8493] leading-relaxed">
              Your account password has been successfully updated in Supabase Auth. You may now
              sign in with your new credentials.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate("/auth/login")}
            className="w-full rounded-2xl bg-[#2E9E44] py-3.5 px-4 font-poppins font-bold text-sm text-white shadow-[0_10px_25px_rgba(46,158,68,0.25)] hover:bg-[#288B3B] transition active:scale-[0.98]"
          >
            Sign In with New Password →
          </button>
        </div>
      ) : (
        /* ── STATE 5: Active Reset Password Form ── */
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <div>
            <label
              htmlFor="reset-password"
              className="block text-xs font-bold uppercase tracking-wider text-[#7A8493] mb-1.5"
            >
              New Password
            </label>
            <div className="relative">
              <input
                id="reset-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                placeholder="At least 6 characters"
                className="w-full rounded-2xl border border-black/10 bg-black/5 px-4 py-3 pr-11 text-sm font-medium text-[#0F2044] placeholder-[#9AA3AF] focus:border-[#2E9E44] focus:bg-white focus:outline-hidden transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#7A8493] hover:text-[#0F2044] p-1 rounded-lg"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "🙈" : "👁️"}
              </button>
            </div>
            <PasswordStrengthMeter password={password} />
          </div>

          <div>
            <label
              htmlFor="reset-confirm-password"
              className="block text-xs font-bold uppercase tracking-wider text-[#7A8493] mb-1.5"
            >
              Confirm New Password
            </label>
            <div className="relative">
              <input
                id="reset-confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isSubmitting}
                placeholder="Re-enter new password"
                className="w-full rounded-2xl border border-black/10 bg-black/5 px-4 py-3 pr-11 text-sm font-medium text-[#0F2044] placeholder-[#9AA3AF] focus:border-[#2E9E44] focus:bg-white focus:outline-hidden transition"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#7A8493] hover:text-[#0F2044] p-1 rounded-lg"
                aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
              >
                {showConfirmPassword ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-2xl bg-[#2E9E44] py-3.5 px-4 font-poppins font-bold text-sm text-white shadow-[0_10px_25px_rgba(46,158,68,0.25)] hover:bg-[#288B3B] transition active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Updating Password…</span>
              </>
            ) : (
              <span>Confirm Password Reset</span>
            )}
          </button>

          <div className="text-center text-xs text-[#7A8493]">
            Return to{" "}
            <Link to="/auth/login" className="font-bold text-[#2E9E44] hover:underline">
              Customer Sign In
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
