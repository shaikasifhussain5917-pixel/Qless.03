import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CustomerLayout } from "../../layouts/CustomerLayout";
import { useAuth } from "../../context/AuthContext";
import { DemoNoticeBanner } from "../../components/auth/DemoNoticeBanner";

export function CustomerProfileScreen() {
  const navigate = useNavigate();
  const { user, updateProfile } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [nameInput, setNameInput] = useState(user?.name || "");
  const [phoneInput, setPhoneInput] = useState(user?.phone || "");

  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const handleStartEditing = () => {
    setNameInput(user?.name || "");
    setPhoneInput(user?.phone || "");
    setErrors({});
    setSuccessMessage("");
    setErrorMessage("");
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    setNameInput(user?.name || "");
    setPhoneInput(user?.phone || "");
    setErrors({});
    setErrorMessage("");
    setIsEditing(false);
  };

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSuccessMessage("");
    setErrorMessage("");

    const newErrors: { name?: string; phone?: string } = {};

    if (!nameInput.trim()) {
      newErrors.name = "Full name cannot be empty.";
    } else if (nameInput.trim().length < 2) {
      newErrors.name = "Full name must be at least 2 characters.";
    }

    const cleanPhone = phoneInput.replace(/\D/g, "");
    if (!cleanPhone) {
      newErrors.phone = "Mobile number is required.";
    } else if (cleanPhone.length < 10) {
      newErrors.phone = "Mobile number must be at least 10 digits.";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const res = await updateProfile({
      name: nameInput.trim(),
      phone: phoneInput.trim(),
    });

    if (res.success) {
      setSuccessMessage("Your shopper profile has been updated successfully!");
      setIsEditing(false);
      setErrors({});
    } else {
      setErrorMessage(res.error || "Failed to update profile.");
    }
  };

  const createdDate = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-IN", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "March 2026";

  return (
    <CustomerLayout
      showHeader={true}
      showFooter={true}
      maxWidthClass="max-w-[480px]"
      showCustomerNav={true}
      activeNav="profile"
      onBack={() => navigate("/shop")}
      backLabel="Return to Shopping Cart"
    >
      <div className="space-y-4 pb-10 qless-fade-in">
        {/* Profile Card Header */}
        <div className="rounded-3xl border border-white/70 bg-white/95 p-6 shadow-sm backdrop-blur-md text-center relative overflow-hidden">
          {/* Background accent curve */}
          <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-r from-[#0F2044] to-[#1E3A8A] opacity-90" />

          {/* Avatar Circle */}
          <div className="relative mt-4 mx-auto flex h-24 w-24 items-center justify-center rounded-3xl bg-white shadow-md border-4 border-white text-3xl font-poppins font-black text-[#0F2044]">
            {user?.avatarInitials || "QL"}
          </div>

          <div className="mt-3">
            <h1 className="font-poppins text-xl font-extrabold text-[#0F2044]">
              {user?.name || "Shopper Name"}
            </h1>
            <p className="text-xs text-[#7A8493]">{user?.email || "shopper@example.com"}</p>
          </div>

          {/* Role and Status Badges */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <span className="rounded-full bg-emerald-100 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-800 flex items-center gap-1.5 shadow-2xs">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Verified Demo Shopper
            </span>

            <span className="rounded-full bg-slate-100 border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
              Role: {user?.role || "CUSTOMER"}
            </span>
          </div>

          <p className="mt-2 text-[11px] text-[#7A8493]">
            Member since {createdDate} · Self-Checkout ID: {user?.id || "usr_cust_001"}
          </p>

          {!isEditing && (
            <div className="mt-4 pt-4 border-t border-black/5 flex justify-center">
              <button
                type="button"
                onClick={handleStartEditing}
                className="rounded-2xl bg-[#0F2044] px-5 py-2.5 font-poppins text-xs font-bold text-white shadow-xs hover:bg-[#1A3366] transition active:scale-95 flex items-center gap-2"
              >
                <span>✏️</span>
                <span>Edit Profile Information</span>
              </button>
            </div>
          )}
        </div>

        {/* Success or Error Feedback */}
        {successMessage && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50/90 p-3.5 text-xs text-emerald-900 flex items-center gap-2 shadow-xs">
            <span className="text-base">✓</span>
            <span className="font-medium leading-relaxed">{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="rounded-2xl border border-red-500/20 bg-red-50/90 p-3.5 text-xs text-red-900 flex items-center gap-2 shadow-xs">
            <span className="text-base">⚠️</span>
            <span className="font-medium leading-relaxed">{errorMessage}</span>
          </div>
        )}

        {/* Edit Form or Detail Cards */}
        {isEditing ? (
          <div className="rounded-3xl border border-white/70 bg-white/95 p-5 sm:p-6 shadow-sm backdrop-blur-md">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-black/5">
              <h2 className="font-poppins text-base font-bold text-[#0F2044]">
                Edit Shopper Details
              </h2>
              <span className="text-xs text-[#7A8493]">Editing Local Profile</span>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4" noValidate>
              {/* Name Field */}
              <div>
                <label
                  htmlFor="profile-name"
                  className="block text-xs font-bold uppercase tracking-wider text-[#7A8493] mb-1.5"
                >
                  Full Name
                </label>
                <input
                  id="profile-name"
                  type="text"
                  value={nameInput}
                  onChange={(e) => {
                    setNameInput(e.target.value);
                    if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  className={`w-full rounded-2xl border px-4 py-3 text-sm font-medium text-[#0F2044] focus:outline-hidden transition ${
                    errors.name
                      ? "border-red-500 bg-red-50/40 focus:border-red-500"
                      : "border-black/10 bg-black/5 focus:border-[#2E9E44] focus:bg-white"
                  }`}
                  placeholder="Your full name"
                />
                {errors.name && (
                  <p className="mt-1 text-[11px] font-semibold text-red-600">{errors.name}</p>
                )}
              </div>

              {/* Mobile Number Field */}
              <div>
                <label
                  htmlFor="profile-phone"
                  className="block text-xs font-bold uppercase tracking-wider text-[#7A8493] mb-1.5"
                >
                  Mobile Number (India +91)
                </label>
                <input
                  id="profile-phone"
                  type="tel"
                  value={phoneInput}
                  onChange={(e) => {
                    setPhoneInput(e.target.value);
                    if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined }));
                  }}
                  className={`w-full rounded-2xl border px-4 py-3 text-sm font-medium text-[#0F2044] focus:outline-hidden transition ${
                    errors.phone
                      ? "border-red-500 bg-red-50/40 focus:border-red-500"
                      : "border-black/10 bg-black/5 focus:border-[#2E9E44] focus:bg-white"
                  }`}
                  placeholder="98765 43210"
                />
                {errors.phone && (
                  <p className="mt-1 text-[11px] font-semibold text-red-600">{errors.phone}</p>
                )}
              </div>

              {/* Email (Read-only with explanation) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="profile-email"
                    className="block text-xs font-bold uppercase tracking-wider text-[#7A8493]"
                  >
                    Email Address (Registered)
                  </label>
                  <span className="text-[11px] text-[#7A8493] italic">Non-editable</span>
                </div>
                <input
                  id="profile-email"
                  type="email"
                  disabled
                  value={user?.email || ""}
                  className="w-full rounded-2xl border border-black/10 bg-black/5 px-4 py-3 text-sm font-medium text-[#7A8493] cursor-not-allowed"
                />
                <p className="mt-1 text-[11px] text-[#7A8493]">
                  Email address is linked to your digital checkout receipts and cannot be changed directly without OTP verification.
                </p>
              </div>

              {/* Role (Protected - Cannot elevate role) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="profile-role"
                    className="block text-xs font-bold uppercase tracking-wider text-[#7A8493]"
                  >
                    Account Role Privileges
                  </label>
                  <span className="text-[11px] text-amber-700 font-semibold">🔒 Protected</span>
                </div>
                <input
                  id="profile-role"
                  type="text"
                  disabled
                  value="CUSTOMER (Shopper Self-Checkout)"
                  className="w-full rounded-2xl border border-black/10 bg-black/5 px-4 py-3 text-sm font-medium text-[#7A8493] cursor-not-allowed font-mono"
                />
                <p className="mt-1 text-[11px] text-amber-800">
                  Customers cannot self-elevate permissions to ADMIN or SECURITY_GUARD. Staff credentials must be authenticated via staff terminals.
                </p>
              </div>

              {/* Form Action Buttons */}
              <div className="pt-2 flex items-center gap-3">
                <button
                  type="submit"
                  className="flex-1 rounded-2xl bg-[#2E9E44] py-3.5 px-4 font-poppins font-bold text-sm text-white shadow-sm hover:bg-[#288B3B] transition active:scale-[0.98]"
                >
                  Save Profile Changes
                </button>
                <button
                  type="button"
                  onClick={handleCancelEditing}
                  className="rounded-2xl border border-black/10 bg-white py-3.5 px-5 font-poppins font-semibold text-xs text-[#0F2044] hover:bg-black/5 transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* Profile Details Overview */
          <div className="rounded-3xl border border-white/70 bg-white/95 p-5 sm:p-6 shadow-sm backdrop-blur-md space-y-4">
            <h2 className="font-poppins text-sm font-bold uppercase tracking-wider text-[#8A94A3]">
              Account Overview
            </h2>

            <div className="divide-y divide-black/5 text-xs">
              <div className="flex items-center justify-between py-2.5">
                <span className="text-[#7A8493]">Display Name</span>
                <span className="font-bold text-[#0F2044]">{user?.name}</span>
              </div>

              <div className="flex items-center justify-between py-2.5">
                <span className="text-[#7A8493]">Email Address</span>
                <span className="font-medium text-[#0F2044]">{user?.email}</span>
              </div>

              <div className="flex items-center justify-between py-2.5">
                <span className="text-[#7A8493]">Contact Phone</span>
                <span className="font-medium text-[#0F2044]">{user?.phone || "Not set"}</span>
              </div>

              <div className="flex items-center justify-between py-2.5">
                <span className="text-[#7A8493]">Operating Role</span>
                <span className="font-bold text-[#2E9E44] bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">
                  {user?.role}
                </span>
              </div>

              <div className="flex items-center justify-between py-2.5">
                <span className="text-[#7A8493]">Email Verification</span>
                <span className="font-bold text-emerald-700">
                  {user?.isVerified ? "✓ Verified" : "Pending"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Quick Account Navigation Links */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/settings"
            className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-xs hover:bg-white transition flex flex-col items-start gap-1"
          >
            <span className="text-xl">⚙️</span>
            <span className="font-poppins text-xs font-bold text-[#0F2044]">Account Settings</span>
            <span className="text-[10px] text-[#7A8493]">Preferences &amp; Security</span>
          </Link>

          <Link
            to="/history"
            className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-xs hover:bg-white transition flex flex-col items-start gap-1"
          >
            <span className="text-xl">🕒</span>
            <span className="font-poppins text-xs font-bold text-[#0F2044]">Order History</span>
            <span className="text-[10px] text-[#7A8493]">Past digital receipts</span>
          </Link>

          <Link
            to="/settings/password"
            className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-xs hover:bg-white transition flex flex-col items-start gap-1"
          >
            <span className="text-xl">🔐</span>
            <span className="font-poppins text-xs font-bold text-[#0F2044]">Change Password</span>
            <span className="text-[10px] text-[#7A8493]">Update security passcode</span>
          </Link>

          <Link
            to="/settings/notifications"
            className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-xs hover:bg-white transition flex flex-col items-start gap-1"
          >
            <span className="text-xl">🔔</span>
            <span className="font-poppins text-xs font-bold text-[#0F2044]">Notifications</span>
            <span className="text-[10px] text-[#7A8493]">Alerts &amp; offers</span>
          </Link>
        </div>

        {/* Demo Notice */}
        <div className="pt-2">
          <DemoNoticeBanner compact />
        </div>
      </div>
    </CustomerLayout>
  );
}
