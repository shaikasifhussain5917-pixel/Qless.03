import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { IcAlert } from "../common/Icons";

/**
 * SessionExpiryModal — Genuine Demo Session Expiry Alert & Extension
 *
 * Displays only when a session is within 5 minutes of genuine expiry or has genuinely expired.
 * Does not show misleading arbitrary countdowns.
 */
export function SessionExpiryModal() {
  const { isExpiringSoon, isSessionExpired, extendSession, dismissExpiryWarning, role, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (!isExpiringSoon && !isSessionExpired) {
    return null;
  }

  const handleSignInAgain = () => {
    dismissExpiryWarning();
    logout();
    if (role === "ADMIN") {
      navigate("/auth/admin", { state: { from: location.pathname } });
    } else if (role === "SECURITY_GUARD") {
      navigate("/auth/guard", { state: { from: location.pathname } });
    } else {
      navigate("/auth/login", { state: { from: location.pathname } });
    }
  };

  const handleSignOut = () => {
    dismissExpiryWarning();
    logout();
    navigate("/auth/role");
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2044]/60 px-4 backdrop-blur-xs qless-fade-in"
    >
      <div className="w-full max-w-[420px] rounded-3xl bg-white p-6 shadow-2xl qless-scale-in space-y-4">
        <div className="flex items-start gap-3.5">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
              isSessionExpired
                ? "bg-red-50 text-red-600 border border-red-200"
                : "bg-amber-50 text-amber-600 border border-amber-200"
            }`}
          >
            <IcAlert />
          </div>

          <div className="flex-1">
            <h3
              id="session-modal-title"
              className="font-poppins text-base font-bold text-[#0F2044]"
            >
              {isSessionExpired ? "Session Expired" : "Session Expiring Soon"}
            </h3>
            <p className="mt-1 text-xs text-[#7A8493] leading-relaxed">
              {isSessionExpired
                ? "Your demonstration login session has reached its expiration timestamp. Please sign in again to access protected administrative and customer areas."
                : "Your active demonstration session is scheduled to expire in less than 5 minutes. Would you like to extend your session?"}
            </p>
          </div>
        </div>

        <div className="pt-2 flex justify-end gap-2.5">
          {isSessionExpired ? (
            <button
              type="button"
              onClick={handleSignInAgain}
              className="rounded-xl bg-[#0F2044] px-4 py-2.5 font-poppins text-xs font-semibold text-white hover:bg-[#1A3163] transition active:scale-95 shadow-xs"
            >
              Sign In Again
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-xl border border-black/10 bg-white px-3.5 py-2 text-xs font-semibold text-[#7A8493] hover:text-[#0F2044] hover:bg-[#F8F9FA] transition"
              >
                Sign Out
              </button>
              <button
                type="button"
                onClick={extendSession}
                className="rounded-xl bg-[#2E9E44] px-4 py-2 font-poppins text-xs font-semibold text-white hover:bg-[#288B3B] transition active:scale-95 shadow-xs"
              >
                Extend Demo Session
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
