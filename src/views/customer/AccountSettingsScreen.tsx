import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CustomerLayout } from "../../layouts/CustomerLayout";
import { useAuth } from "../../context/AuthContext";
import { useShopping } from "../../context/ShoppingContext";
import { MOCK_STORES } from "../../data/mockStores";
import { DemoNoticeBanner } from "../../components/auth/DemoNoticeBanner";

export function AccountSettingsScreen() {
  const navigate = useNavigate();
  const { user, session, logout, updatePreferences, deleteAccount } = useAuth();
  const { selectedStore, setSelectedStore } = useShopping();

  // Local state for preferences
  const [selectedLanguage, setSelectedLanguage] = useState(
    user?.preferences?.language || "en"
  );
  const [selectedTheme, setSelectedTheme] = useState(
    user?.preferences?.theme || "light"
  );
  const [storePreference, setStorePreference] = useState(
    selectedStore?.id || user?.preferences?.preferredStoreId || MOCK_STORES[0].id
  );

  const [toastMessage, setToastMessage] = useState("");

  // Delete modal state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const languages = [
    { code: "en", label: "English (India)", native: "English" },
    { code: "hi", label: "Hindi", native: "हिन्दी" },
    { code: "kn", label: "Kannada", native: "ಕನ್ನಡ" },
    { code: "ta", label: "Tamil", native: "தமிழ்" },
    { code: "te", label: "Telugu", native: "తెలుగు" },
  ];

  const handleLanguageChange = (code: string) => {
    setSelectedLanguage(code);
    updatePreferences({ language: code });
    setToastMessage("Language preference saved locally.");
    setTimeout(() => setToastMessage(""), 2500);
  };

  const handleThemeChange = (theme: "light" | "dark" | "system") => {
    setSelectedTheme(theme);
    updatePreferences({ theme });
    setToastMessage("Theme preference updated.");
    setTimeout(() => setToastMessage(""), 2500);
  };

  const handleStoreChange = (storeId: string) => {
    setStorePreference(storeId);
    const store = MOCK_STORES.find((s) => s.id === storeId);
    if (store) {
      setSelectedStore(store);
      updatePreferences({ preferredStoreId: storeId });
      setToastMessage(`Default supermarket set to ${store.name}.`);
      setTimeout(() => setToastMessage(""), 2500);
    }
  };

  const handleSignOut = () => {
    logout();
    navigate("/auth/login");
  };

  const handleConfirmDelete = () => {
    if (deleteConfirmationText.trim().toUpperCase() !== "DELETE") {
      setDeleteError("Please type DELETE to confirm account deletion.");
      return;
    }

    deleteAccount();
    navigate("/auth/role", { replace: true });
  };

  // Format session dates
  const loginDateStr = session?.loginAt
    ? new Date(session.loginAt).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "numeric",
        month: "short",
      })
    : "Active Session";

  const expiresDateStr = session?.expiresAt
    ? new Date(session.expiresAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "7 Days Demo";

  return (
    <CustomerLayout
      showHeader={true}
      showFooter={true}
      maxWidthClass="max-w-[480px]"
      showCustomerNav={true}
      activeNav="profile"
      onBack={() => navigate(-1)}
      backLabel="Back"
    >
      <div className="space-y-4 pb-12 qless-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-black/5">
          <div>
            <h1 className="font-poppins text-xl font-extrabold text-[#0F2044]">
              Account Settings
            </h1>
            <p className="text-xs text-[#7A8493]">
              Manage preferences, credentials, and prototype session
            </p>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white border border-black/5 text-lg shadow-2xs">
            ⚙️
          </span>
        </div>

        {/* Toast Notification */}
        {toastMessage && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center gap-2 shadow-xs">
            <span>✓</span>
            <span className="font-medium">{toastMessage}</span>
          </div>
        )}

        {/* Section 1: Profile Summary Card */}
        <div className="rounded-3xl border border-white/70 bg-white/95 p-4 sm:p-5 shadow-sm backdrop-blur-md flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0F2044] text-white font-poppins font-bold text-base shadow-xs">
              {user?.avatarInitials || "QL"}
            </span>
            <div>
              <p className="font-poppins text-sm font-bold text-[#0F2044]">{user?.name}</p>
              <p className="text-xs text-[#7A8493]">{user?.email}</p>
              <span className="inline-block mt-0.5 rounded-full bg-emerald-50 px-2 py-0.2 text-[10px] font-bold text-emerald-700 border border-emerald-100">
                {user?.role || "CUSTOMER"}
              </span>
            </div>
          </div>

          <Link
            to="/profile"
            className="rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2044] hover:bg-black/5 transition shadow-2xs"
          >
            Edit Profile →
          </Link>
        </div>

        {/* Section 2: Security & Password */}
        <div className="rounded-3xl border border-white/70 bg-white/95 p-5 shadow-sm backdrop-blur-md space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">🔐</span>
              <h2 className="font-poppins text-sm font-bold text-[#0F2044]">
                Security &amp; Credentials
              </h2>
            </div>
            <span className="text-[10px] font-semibold text-slate-500">Client-Side Demo</span>
          </div>

          <p className="text-xs text-[#7A8493] leading-relaxed">
            Update your account password or review password strength policies for the prototype.
          </p>

          <div className="pt-1">
            <Link
              to="/settings/password"
              className="flex w-full items-center justify-between rounded-2xl border border-black/10 bg-black/5 px-4 py-3 text-xs font-semibold text-[#0F2044] hover:bg-black/10 transition"
            >
              <span>Change Account Password</span>
              <span>→</span>
            </Link>
          </div>
        </div>

        {/* Section 3: Notification Preferences */}
        <div className="rounded-3xl border border-white/70 bg-white/95 p-5 shadow-sm backdrop-blur-md space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">🔔</span>
              <h2 className="font-poppins text-sm font-bold text-[#0F2044]">
                Notification Channels
              </h2>
            </div>
            <Link
              to="/settings/notifications"
              className="text-xs font-semibold text-[#2E9E44] hover:underline"
            >
              Configure
            </Link>
          </div>

          <p className="text-xs text-[#7A8493] leading-relaxed">
            Set alerts for live item barcode scans, digital receipts, and security turnstile status.
          </p>

          <Link
            to="/settings/notifications"
            className="flex w-full items-center justify-between rounded-2xl border border-black/10 bg-black/5 px-4 py-3 text-xs font-semibold text-[#0F2044] hover:bg-black/10 transition"
          >
            <span>Manage 4 Notification Switches</span>
            <span>→</span>
          </Link>
        </div>

        {/* Section 4: Regional & UI Preferences */}
        <div className="rounded-3xl border border-white/70 bg-white/95 p-5 shadow-sm backdrop-blur-md space-y-4">
          <h2 className="font-poppins text-sm font-bold text-[#0F2044]">
            Regional &amp; UI Preferences
          </h2>

          {/* Language Selector */}
          <div>
            <label
              htmlFor="settings-language"
              className="block text-xs font-bold uppercase tracking-wider text-[#7A8493] mb-1.5"
            >
              Interface Language
            </label>
            <select
              id="settings-language"
              value={selectedLanguage}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="w-full rounded-2xl border border-black/10 bg-black/5 px-4 py-2.5 text-xs font-medium text-[#0F2044] focus:bg-white focus:outline-hidden transition"
            >
              {languages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.native} — {lang.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-[#7A8493]">
              Controls language preference metadata for your shopper account.
            </p>
          </div>

          {/* Theme Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#7A8493] mb-1.5">
              App Appearance
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["light", "dark", "system"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleThemeChange(t)}
                  className={`rounded-xl border py-2 text-xs font-semibold capitalize transition ${
                    selectedTheme === t
                      ? "border-[#0F2044] bg-[#0F2044] text-white shadow-2xs"
                      : "border-black/10 bg-white text-[#7A8493] hover:bg-black/5"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-[#7A8493]">
              QLess utilizes an accessible, high-contrast supermarket glass theme.
            </p>
          </div>

          {/* Default Supermarket Selector */}
          <div>
            <label
              htmlFor="settings-store"
              className="block text-xs font-bold uppercase tracking-wider text-[#7A8493] mb-1.5"
            >
              Preferred Supermarket Branch
            </label>
            <select
              id="settings-store"
              value={storePreference}
              onChange={(e) => handleStoreChange(e.target.value)}
              className="w-full rounded-2xl border border-black/10 bg-black/5 px-4 py-2.5 text-xs font-medium text-[#0F2044] focus:bg-white focus:outline-hidden transition"
            >
              {MOCK_STORES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.branch})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Section 5: Session Information */}
        <div className="rounded-3xl border border-white/70 bg-white/95 p-5 shadow-sm backdrop-blur-md space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-poppins text-sm font-bold text-[#0F2044]">
              Active Session Information
            </h2>
            <span className="rounded-full bg-amber-100 border border-amber-200 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
              DEMO SESSION
            </span>
          </div>

          <div className="rounded-2xl border border-black/5 bg-black/5 p-3.5 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-[#7A8493]">Authenticated Role</span>
              <span className="font-bold text-[#0F2044]">{user?.role}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#7A8493]">Session Established</span>
              <span className="font-medium text-[#0F2044]">{loginDateStr}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#7A8493]">Session Validity</span>
              <span className="font-medium text-emerald-700">Valid until {expiresDateStr}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#7A8493]">Session Token</span>
              <span className="font-mono text-[10px] text-[#7A8493]">DEMO_SESSION_LOCAL</span>
            </div>
          </div>

          <p className="text-[11px] text-[#7A8493] leading-relaxed">
            Session tokens are stored safely in browser localStorage without passwords or payment
            keys. Signing out terminates this demo token.
          </p>
        </div>

        {/* Section 6: Account Actions & Danger Zone */}
        <div className="rounded-3xl border border-red-500/20 bg-red-50/50 p-5 shadow-sm backdrop-blur-md space-y-3">
          <h2 className="font-poppins text-sm font-bold text-red-900">
            Account Management &amp; Sign Out
          </h2>

          <div className="pt-1 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full rounded-2xl border border-black/10 bg-white py-3 text-xs font-bold text-[#0F2044] hover:bg-black/5 transition shadow-2xs"
            >
              Sign Out of Session
            </button>

            <button
              type="button"
              onClick={() => {
                setDeleteConfirmationText("");
                setDeleteError("");
                setIsDeleteModalOpen(true);
              }}
              className="w-full rounded-2xl border border-red-300 bg-red-100 py-3 text-xs font-bold text-red-700 hover:bg-red-200 transition"
            >
              Delete Shopper Account (Demo)
            </button>
          </div>
        </div>

        <DemoNoticeBanner compact />

        {/* Delete Confirmation Modal */}
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-3xl border border-white/70 bg-white p-6 shadow-xl space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-600 text-2xl mx-auto">
                ⚠️
              </div>

              <div className="text-center">
                <h3 className="font-poppins text-base font-bold text-[#0F2044]">
                  Delete Demo Account?
                </h3>
                <p className="mt-1 text-xs text-[#7A8493] leading-relaxed">
                  This action clears your local shopper registration and terminates your demo session.
                </p>
              </div>

              <div className="rounded-2xl border border-amber-500/20 bg-amber-50 p-3 text-[11px] text-amber-900 space-y-1">
                <p className="font-bold">PROTOTYPE NOTE:</p>
                <p>
                  Historical completed receipts and security audit logs are retained for audit
                  integrity. To confirm, please type <span className="font-bold text-red-600 font-mono">DELETE</span> below.
                </p>
              </div>

              {deleteError && (
                <p className="text-xs font-semibold text-red-600 text-center">{deleteError}</p>
              )}

              <div>
                <input
                  type="text"
                  value={deleteConfirmationText}
                  onChange={(e) => {
                    setDeleteConfirmationText(e.target.value);
                    setDeleteError("");
                  }}
                  placeholder="Type DELETE"
                  className="w-full rounded-2xl border border-black/10 bg-black/5 px-4 py-2.5 text-center font-mono font-bold text-sm text-[#0F2044] focus:border-red-500 focus:bg-white focus:outline-hidden"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 rounded-2xl border border-black/10 bg-white py-2.5 text-xs font-bold text-[#0F2044] hover:bg-black/5 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="flex-1 rounded-2xl bg-red-600 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-red-700 transition"
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
