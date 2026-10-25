import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { UserRole } from "../../types";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: UserRole[];
  requireStoreEntrance?: boolean;
}

/**
 * Route protection wrapper for React Router.
 * - Redirects unauthenticated visitors to the appropriate login portal.
 * - Directs authenticated users with insufficient privileges to Access Denied.
 * - Directs customers without active verified store entrance sessions to Store QR Scanner.
 */
export function ProtectedRoute({
  children,
  allowedRoles,
  requireStoreEntrance,
}: ProtectedRouteProps) {
  const { isAuthenticated, user, hasValidEntrance } = useAuth();
  const location = useLocation();

  // If unauthenticated: redirect to the specific role's login portal
  if (!isAuthenticated || !user) {
    if (allowedRoles && allowedRoles.length === 1) {
      if (allowedRoles[0] === "ADMIN" || allowedRoles[0] === "STORE_ADMIN") {
        return <Navigate to="/auth/admin" state={{ from: location.pathname }} replace />;
      }
      if (allowedRoles[0] === "SECURITY_GUARD") {
        return <Navigate to="/auth/guard" state={{ from: location.pathname }} replace />;
      }
      if (allowedRoles[0] === "CASHIER") {
        return <Navigate to="/auth/cashier" state={{ from: location.pathname }} replace />;
      }
    }
    return <Navigate to="/auth/login" state={{ from: location.pathname }} replace />;
  }

  // Check if role is authorized
  const isAuthorized = () => {
    if (!allowedRoles || allowedRoles.length === 0) return true;
    if (allowedRoles.includes(user.role)) return true;
    if (
      (user.role === "STORE_ADMIN" && allowedRoles.includes("ADMIN")) ||
      (user.role === "ADMIN" && allowedRoles.includes("STORE_ADMIN"))
    ) {
      return true;
    }
    return false;
  };

  // If authenticated but role is not authorized:
  if (!isAuthorized()) {
    return (
      <Navigate
        to="/auth/access-denied"
        state={{
          requiredRoles: allowedRoles,
          currentRole: user.role,
          attemptedPath: location.pathname,
        }}
        replace
      />
    );
  }

  // If route requires a verified in-store entrance session:
  if (requireStoreEntrance && !hasValidEntrance) {
    return <Navigate to="/scan-store" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
