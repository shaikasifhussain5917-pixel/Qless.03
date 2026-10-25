import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CustomerLayout } from "../../layouts/CustomerLayout";
import { PasswordStrengthMeter } from "../../components/auth/PasswordStrengthMeter";
import { DemoNoticeBanner } from "../../components/auth/DemoNoticeBanner";
import { useAuth } from "../../context/AuthContext";

export function ChangePasswordScreen() {
  const navigate = useNavigate();
  const { updatePassword, isSupabaseLive } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!currentPassword) {
      setError("Please enter your current password.");
      return;
    }
    if (!newPassword) {
      setError("Please enter a new password.");
      return;
    }
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters long.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("New password cannot be the same as your current password.");
      return;
    }
    if (!confirmPassword) {
      setError("Please confirm your new password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    const res = await updatePassword(newPassword);
    setIsSubmitting(false);

    if (!res.success) {
      setError(res.error || "Failed to update password.");
      return;
    }

    setSuccess(true);
  };

  return (
    <CustomerLayout
      showHeader={true}
      showFooter={true}
      maxWidthClass="max-w-[480px]"
      onBack={() => navigate("/settings")}
      backLabel="Settings"
    >
      <div className="space-y-4 pb-12 qless-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-black/5">
          <div>
            <h1 className="font-poppins text-xl font-extrabold text-[#0F2044]">
              Change Password
            </h1>
            <p className="text-xs text-[#7A8493]">
              Update your account password and security credentials
            </p>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white border border-black/5 text-lg shadow-2xs">
            🔐
          </span>
        </div>

        {/* Auth Mode Notice */}
        {isSupabaseLive ? (
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-50/90 p-3.5 text-xs text-emerald-900 space-y-1 shadow-2xs">
            <p className="font-bold flex items-center gap-1.5">
              <span>🛡️</span> SUPABASE AUTH ACTIVE
            </p>
            <p className="text-[11px] text-emerald-800 leading-relaxed">
              Your password will be securely updated via Supabase Auth cryptographic hashing.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-500/25 bg-amber-50/90 p-3.5 text-xs text-amber-900 space-y-1 shadow-2xs">
            <p className="font-bold flex items-center gap-1.5">
              <span>ℹ️</span> DEMO SIMULATION NOTICE
            </p>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              Supabase credentials not configured in .env. Password verification runs locally without saving sensitive passwords to storage.
            </p>
          </div>
        )}

        {success ? (
          <div className="rounded-3xl border border-white/70 bg-white/95 p-6 shadow-sm backdrop-blur-md text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 text-2xl shadow-xs">
              ✓
            </div>

            <div>
              <h2 className="font-poppins text-base font-bold text-[#0F2044]">
                Password Updated Successfully
              </h2>
              <p className="mt-1 text-xs text-[#7A8493] leading-relaxed">
                Your simulated credentials have been updated for this active prototype session.
              </p>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => navigate("/settings")}
                className="w-full rounded-2xl bg-[#2E9E44] py-3 text-xs font-bold text-white shadow-xs hover:bg-[#288B3B] transition"
              >
                Return to Account Settings →
              </button>
              <button
                type="button"
                onClick={() => {
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmPassword("");
                  setSuccess(false);
                }}
                className="text-xs text-[#7A8493] hover:text-[#0F2044] font-medium"
              >
                Change again
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-white/70 bg-white/95 p-5 sm:p-6 shadow-sm backdrop-blur-md">
            {error && (
              <div className="mb-4 rounded-xl border border-red-500/20 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* Current Password */}
              <div>
                <label
                  htmlFor="current-password"
                  className="block text-xs font-bold uppercase tracking-wider text-[#7A8493] mb-1.5"
                >
                  Current Password
                </label>
                <div className="relative">
                  <input
                    id="current-password"
                    type={showCurrent ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    disabled={isSubmitting}
                    placeholder="Enter current password"
                    className="w-full rounded-2xl border border-black/10 bg-black/5 px-4 py-2.5 pr-11 text-sm font-medium text-[#0F2044] focus:border-[#2E9E44] focus:bg-white focus:outline-hidden transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(!showCurrent)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#7A8493] hover:text-[#0F2044] p-1"
                    aria-label="Toggle password visibility"
                  >
                    {showCurrent ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label
                  htmlFor="new-password"
                  className="block text-xs font-bold uppercase tracking-wider text-[#7A8493] mb-1.5"
                >
                  New Password
                </label>
                <div className="relative">
                  <input
                    id="new-password"
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={isSubmitting}
                    placeholder="At least 6 characters"
                    className="w-full rounded-2xl border border-black/10 bg-black/5 px-4 py-2.5 pr-11 text-sm font-medium text-[#0F2044] focus:border-[#2E9E44] focus:bg-white focus:outline-hidden transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#7A8493] hover:text-[#0F2044] p-1"
                    aria-label="Toggle password visibility"
                  >
                    {showNew ? "🙈" : "👁️"}
                  </button>
                </div>
                <PasswordStrengthMeter password={newPassword} />
              </div>

              {/* Confirm New Password */}
              <div>
                <label
                  htmlFor="confirm-new-password"
                  className="block text-xs font-bold uppercase tracking-wider text-[#7A8493] mb-1.5"
                >
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    id="confirm-new-password"
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={isSubmitting}
                    placeholder="Re-enter new password"
                    className="w-full rounded-2xl border border-black/10 bg-black/5 px-4 py-2.5 pr-11 text-sm font-medium text-[#0F2044] focus:border-[#2E9E44] focus:bg-white focus:outline-hidden transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#7A8493] hover:text-[#0F2044] p-1"
                    aria-label="Toggle password visibility"
                  >
                    {showConfirm ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 rounded-2xl bg-[#0F2044] py-3.5 px-4 font-poppins font-bold text-sm text-white shadow-xs hover:bg-[#1A3366] transition active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Validating…</span>
                    </>
                  ) : (
                    <span>Update Password</span>
                  )}
                </button>

                <Link
                  to="/settings"
                  className="rounded-2xl border border-black/10 bg-white py-3.5 px-5 font-poppins font-semibold text-xs text-[#0F2044] hover:bg-black/5 transition text-center"
                >
                  Cancel
                </Link>
              </div>
            </form>
          </div>
        )}

        <DemoNoticeBanner compact />
      </div>
    </CustomerLayout>
  );
}
