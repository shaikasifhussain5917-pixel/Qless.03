import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ShoppingProvider } from "./context/ShoppingContext";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { SessionExpiryModal } from "./components/auth/SessionExpiryModal";

// Customer Views
import { WelcomeScreen } from "./views/customer/WelcomeScreen";
import { StoreQRScanScreen } from "./views/customer/StoreQRScanScreen";
import { ShoppingScreen } from "./views/customer/ShoppingScreen";
import { DigitalReceiptScreen } from "./views/customer/DigitalReceiptScreen";
import { CustomerExitPassScreen } from "./views/customer/CustomerExitPassScreen";
import { ShoppingHistoryScreen } from "./views/customer/ShoppingHistoryScreen";

// Cashier, Security, Admin Views
import { CashierScreen } from "./views/cashier/CashierScreen";
import { SecurityScreen } from "./views/security/SecurityScreen";
import { AdminScreen } from "./views/admin/AdminScreen";

// Phase 8 Customer Profile & Settings Views
import { CustomerProfileScreen } from "./views/customer/CustomerProfileScreen";
import { AccountSettingsScreen } from "./views/customer/AccountSettingsScreen";
import { ChangePasswordScreen } from "./views/customer/ChangePasswordScreen";
import { NotificationPreferencesScreen } from "./views/customer/NotificationPreferencesScreen";

// Phase 7 Authentication & Portal Views
import { RoleSelectScreen } from "./views/auth/RoleSelectScreen";
import { CustomerLoginScreen } from "./views/auth/CustomerLoginScreen";
import { CustomerSignupScreen } from "./views/auth/CustomerSignupScreen";
import { AccountCreatedScreen } from "./views/auth/AccountCreatedScreen";
import { ForgotPasswordScreen } from "./views/auth/ForgotPasswordScreen";
import { ResetPasswordScreen } from "./views/auth/ResetPasswordScreen";
import { EmailVerificationScreen } from "./views/auth/EmailVerificationScreen";
import { AdminLoginScreen } from "./views/auth/AdminLoginScreen";
import { GuardLoginScreen } from "./views/auth/GuardLoginScreen";
import { CashierLoginScreen } from "./views/auth/CashierLoginScreen";
import { AccessDeniedScreen } from "./views/auth/AccessDeniedScreen";

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ShoppingProvider>
          <HashRouter>
            <SessionExpiryModal />
            <Routes>
              {/* Public Customer Entry */}
              <Route path="/" element={<WelcomeScreen />} />
              <Route path="/select-store" element={<Navigate to="/scan-store" replace />} />
              <Route
                path="/scan-store"
                element={
                  <ProtectedRoute allowedRoles={["CUSTOMER"]}>
                    <StoreQRScanScreen />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/shop"
                element={
                  <ProtectedRoute allowedRoles={["CUSTOMER"]} requireStoreEntrance={true}>
                    <ShoppingScreen />
                  </ProtectedRoute>
                }
              />
              <Route path="/receipt" element={<DigitalReceiptScreen />} />
              <Route path="/receipt/:orderId" element={<DigitalReceiptScreen />} />
              <Route path="/exit-pass" element={<CustomerExitPassScreen />} />
              <Route path="/exit-pass/:orderId" element={<CustomerExitPassScreen />} />
              <Route
                path="/cashier"
                element={
                  <ProtectedRoute allowedRoles={["CASHIER"]}>
                    <CashierScreen />
                  </ProtectedRoute>
                }
              />

              {/* Protected Customer Account & History Routes */}
              <Route
                path="/profile"
                element={
                  <ProtectedRoute allowedRoles={["CUSTOMER"]}>
                    <CustomerProfileScreen />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute allowedRoles={["CUSTOMER"]}>
                    <AccountSettingsScreen />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings/password"
                element={
                  <ProtectedRoute allowedRoles={["CUSTOMER"]}>
                    <ChangePasswordScreen />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings/notifications"
                element={
                  <ProtectedRoute allowedRoles={["CUSTOMER"]}>
                    <NotificationPreferencesScreen />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/history"
                element={
                  <ProtectedRoute allowedRoles={["CUSTOMER"]}>
                    <ShoppingHistoryScreen />
                  </ProtectedRoute>
                }
              />

              {/* Phase 7 Authentication Routes */}
              <Route path="/auth/role" element={<RoleSelectScreen />} />
              <Route path="/auth/login" element={<CustomerLoginScreen />} />
              <Route path="/auth/signup" element={<CustomerSignupScreen />} />
              <Route path="/auth/account-created" element={<AccountCreatedScreen />} />
              <Route path="/auth/forgot-password" element={<ForgotPasswordScreen />} />
              <Route path="/auth/reset-password" element={<ResetPasswordScreen />} />
              <Route path="/auth/verify-email" element={<EmailVerificationScreen />} />
              <Route path="/auth/admin" element={<AdminLoginScreen />} />
              <Route path="/auth/guard" element={<GuardLoginScreen />} />
              <Route path="/auth/cashier" element={<CashierLoginScreen />} />
              <Route path="/auth/access-denied" element={<AccessDeniedScreen />} />

              {/* Protected Staff & Admin Portals */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute allowedRoles={["ADMIN"]}>
                    <AdminScreen />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/security"
                element={
                  <ProtectedRoute allowedRoles={["SECURITY_GUARD"]}>
                    <SecurityScreen />
                  </ProtectedRoute>
                }
              />

              {/* Catch-all redirect */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </HashRouter>
        </ShoppingProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
