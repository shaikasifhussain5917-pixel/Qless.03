import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CustomerLayout } from "../../layouts/CustomerLayout";
import { useAuth } from "../../context/AuthContext";
import { NotificationPreferences } from "../../types";
import { DemoNoticeBanner } from "../../components/auth/DemoNoticeBanner";

export function NotificationPreferencesScreen() {
  const navigate = useNavigate();
  const { user, updatePreferences } = useAuth();

  const currentPrefs: NotificationPreferences = user?.preferences?.notifications || {
    orderUpdates: true,
    digitalReceipts: true,
    shoppingOffers: true,
    securityAlerts: true,
  };

  const [prefs, setPrefs] = useState<NotificationPreferences>(currentPrefs);
  const [toastMessage, setToastMessage] = useState("");

  const handleToggle = (key: keyof NotificationPreferences) => {
    const updated = {
      ...prefs,
      [key]: !prefs[key],
    };
    setPrefs(updated);
    updatePreferences({ notifications: updated });
    setToastMessage("Notification preference saved locally.");
    setTimeout(() => setToastMessage(""), 2200);
  };

  const channels: Array<{
    key: keyof NotificationPreferences;
    title: string;
    description: string;
    icon: string;
  }> = [
    {
      key: "orderUpdates",
      title: "Live Order & Cart Updates",
      description: "Receive audio/visual confirmations on shelf item barcode scans & item removals.",
      icon: "🛒",
    },
    {
      key: "digitalReceipts",
      title: "Digital Receipts & Pass Notifications",
      description: "Automatic generation of itemized digital receipt snapshots upon payment.",
      icon: "🧾",
    },
    {
      key: "shoppingOffers",
      title: "Supermarket Deals & Promo Offers",
      description: "Flash alerts on brand discounts, coupon validity, and loyalty savings.",
      icon: "🏷️",
    },
    {
      key: "securityAlerts",
      title: "Security Gate Clearance Alerts",
      description: "Turnstile gate verification notifications and exit pass validation status.",
      icon: "🛡️",
    },
  ];

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
              Notification Preferences
            </h1>
            <p className="text-xs text-[#7A8493]">
              Configure self-checkout alerts and communication channels
            </p>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white border border-black/5 text-lg shadow-2xs">
            🔔
          </span>
        </div>

        {/* Prototype explanation note */}
        <div className="rounded-2xl border border-blue-500/20 bg-blue-50/80 p-3.5 text-xs text-blue-900 space-y-1 shadow-2xs">
          <p className="font-bold flex items-center gap-1.5">
            <span>ℹ️</span> PREFERENCE NOTE
          </p>
          <p className="text-[11px] text-blue-800 leading-relaxed">
            These switches configure your local client-side alert preferences. In production, real
            multi-channel SMS, WhatsApp, and push notifications are dispatched via backend microservices.
          </p>
        </div>

        {/* Toast */}
        {toastMessage && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center gap-2 shadow-xs">
            <span>✓</span>
            <span className="font-medium">{toastMessage}</span>
          </div>
        )}

        {/* Toggle List */}
        <div className="rounded-3xl border border-white/70 bg-white/95 p-5 shadow-sm backdrop-blur-md divide-y divide-black/5">
          {channels.map((channel) => {
            const isEnabled = prefs[channel.key];
            return (
              <div
                key={channel.key}
                className="py-4 first:pt-1 last:pb-1 flex items-start justify-between gap-4"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl mt-0.5">{channel.icon}</span>
                  <div>
                    <h3 className="font-poppins text-sm font-bold text-[#0F2044]">
                      {channel.title}
                    </h3>
                    <p className="mt-0.5 text-xs text-[#7A8493] leading-relaxed max-w-[280px]">
                      {channel.description}
                    </p>
                  </div>
                </div>

                {/* iOS-style accessible switch */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={isEnabled}
                  onClick={() => handleToggle(channel.key)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                    isEnabled ? "bg-[#2E9E44]" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                      isEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>

        {/* Return Button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="w-full rounded-2xl bg-[#0F2044] py-3.5 px-4 font-poppins font-bold text-xs text-white shadow-xs hover:bg-[#1A3366] transition"
          >
            Done · Return to Account Settings
          </button>
        </div>

        <DemoNoticeBanner compact />
      </div>
    </CustomerLayout>
  );
}
