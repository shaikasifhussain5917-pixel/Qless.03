import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "../../components/auth/AuthLayout";
import { useAuth } from "../../context/AuthContext";

export function ForgotPasswordScreen() {
  const navigate = useNavigate();
  const { resetPassword } = useAuth();

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    const clean = email.trim().toLowerCase();
    if (!clean) {
      setError("Please enter your registered email address.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setError("Please enter a valid email address.");
      return;
    }

    setIsSubmitting(true);
    const res = await resetPassword(clean);
    setIsSubmitting(false);

    if (!res.success) {
      setError(res.error || "Failed to send password recovery email.");
      return;
    }

    setIsSent(true);
  };

  return (
    <AuthLayout
      title="Forgot Password"
      subtitle="Enter your account email to receive password recovery instructions"
      roleBadge={{ label: "Password Help", colorClass: "bg-amber-100 text-amber-800" }}
      onBack={() => navigate("/auth/login")}
    >
      {isSent ? (
        <div className="space-y-4 py-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800 text-2xl shadow-xs">
            📬
          </div>

          <div>
            <h2 className="font-poppins text-lg font-bold text-[#0F2044]">
              Recovery Email Dispatched
            </h2>
            <p className="mt-1 text-xs text-[#7A8493] leading-relaxed">
              A secure password recovery link has been generated and dispatched to{" "}
              <span className="font-semibold text-[#0F2044]">{email}</span>. Please check
              your inbox (and spam folder) and click the link to reset your password.
            </p>
          </div>

          <div className="space-y-2.5 pt-4">
            <button
              type="button"
              onClick={() => navigate("/auth/login")}
              className="w-full rounded-2xl bg-[#0F2044] py-3.5 px-4 font-poppins font-bold text-sm text-white shadow-xs hover:bg-[#1a2d5a] transition active:scale-[0.98]"
            >
              Return to Sign In
            </button>

            <button
              type="button"
              onClick={() => setIsSent(false)}
              className="text-xs text-[#7A8493] hover:text-[#0F2044] font-medium block mx-auto pt-1"
            >
              Re-enter email address
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <div>
            <label
              htmlFor="recovery-email"
              className="block text-xs font-bold uppercase tracking-wider text-[#7A8493] mb-1.5"
            >
              Registered Email
            </label>
            <input
              id="recovery-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
              placeholder="you@example.com"
              className="w-full rounded-2xl border border-black/10 bg-black/5 px-4 py-3 text-sm font-medium text-[#0F2044] placeholder-[#9AA3AF] focus:border-[#2E9E44] focus:bg-white focus:outline-hidden transition"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-2xl bg-[#2E9E44] py-3.5 px-4 font-poppins font-bold text-sm text-white shadow-[0_10px_25px_rgba(46,158,68,0.25)] hover:bg-[#288B3B] transition active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Simulating Dispatch…</span>
              </>
            ) : (
              <span>Simulate Recovery Link</span>
            )}
          </button>

          <div className="text-center text-xs text-[#7A8493]">
            Remembered your credentials?{" "}
            <Link to="/auth/login" className="font-bold text-[#2E9E44] hover:underline">
              Sign In
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
