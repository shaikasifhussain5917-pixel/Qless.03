import { useLocation, useNavigate } from "react-router-dom";
import { AuthLayout } from "../../components/auth/AuthLayout";
import { useAuth } from "../../context/AuthContext";
import { UserRole } from "../../types";

export function AccessDeniedScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuth();

  const state = (location.state as {
    requiredRoles?: UserRole[];
    currentRole?: UserRole;
    attemptedPath?: string;
  }) || {};

  const requiredRoleLabel = state.requiredRoles?.join(" or ") || "Restricted Role";
  const currentRoleLabel = user?.role || state.currentRole || "Unauthenticated Guest";

  return (
    <AuthLayout
      title="Access Restricted"
      subtitle="You do not have the required permissions to view this screen"
      roleBadge={{ label: "Access Denied", colorClass: "bg-red-100 text-red-800 border border-red-200" }}
      onBack={() => navigate("/auth/role")}
    >
      <div className="py-2 text-center space-y-4">
        {/* Shield Warning Icon */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-red-100 text-red-600 text-3xl shadow-sm">
          ⛔
        </div>

        <div>
          <h2 className="font-poppins text-lg font-bold text-[#0F2044]">
            Insufficient Privileges
          </h2>
          <p className="mt-1 text-xs text-[#7A8493] leading-relaxed max-w-sm mx-auto">
            This screen requires authorization for:{" "}
            <span className="font-bold text-red-600">{requiredRoleLabel}</span>.
          </p>
        </div>

        {/* Comparison card */}
        <div className="rounded-2xl border border-black/5 bg-black/5 p-4 text-left space-y-2 text-xs">
          <div className="flex justify-between items-center pb-2 border-b border-black/5">
            <span className="text-[#7A8493]">Your Current Active Role:</span>
            <span className="font-bold text-[#0F2044] bg-white px-2 py-0.5 rounded-lg border border-black/5 shadow-2xs">
              {currentRoleLabel}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-[#7A8493]">Target Protected Route:</span>
            <span className="font-mono text-[#0F2044]">
              {state.attemptedPath || "Protected Resource"}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 space-y-2.5">
          <button
            type="button"
            onClick={() => navigate("/auth/role")}
            className="w-full rounded-2xl bg-[#0F2044] py-3.5 px-4 font-poppins font-bold text-sm text-white shadow-[0_10px_25px_rgba(15,32,68,0.25)] hover:bg-[#1A3366] transition active:scale-[0.98]"
          >
            Switch Operating Role / Portal →
          </button>

          {isAuthenticated && (
            <button
              type="button"
              onClick={() => {
                logout();
                navigate("/auth/role");
              }}
              className="w-full rounded-2xl border border-red-200 bg-red-50/50 py-2.5 px-4 font-poppins font-semibold text-xs text-red-600 hover:bg-red-50 transition"
            >
              Sign Out of Current Session
            </button>
          )}

          <button
            type="button"
            onClick={() => navigate("/")}
            className="text-xs text-[#7A8493] hover:text-[#0F2044] font-medium"
          >
            Return to Welcome Screen
          </button>
        </div>
      </div>
    </AuthLayout>
  );
}
