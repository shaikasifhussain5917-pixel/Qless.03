import type { AuthSession, AuthUser, CustomerSignupData, UserPreferences, UserRole } from "../types/index.ts";

const SESSION_STORAGE_KEY = "qless_auth_session_v1";
const REGISTERED_CUSTOMERS_KEY = "qless_registered_customers_v1";

export const DEFAULT_PREFERENCES: UserPreferences = {
  language: "en",
  theme: "light",
  preferredStoreId: "store_fm_01",
  notifications: {
    orderUpdates: true,
    digitalReceipts: true,
    shoppingOffers: true,
    securityAlerts: true,
  },
};

/**
 * Pre-configured demonstration accounts for fast, seamless prototype evaluation.
 * Note: Staff profiles contain identifiers only. Passwords are never stored client-side.
 */
export const DEMO_CREDENTIALS = {
  customer: {
    email: "rahul.sharma@example.com",
    name: "Rahul Sharma",
    phone: "+91 98765 43210",
    role: "CUSTOMER" as UserRole,
    storeId: "STORE001",
  },
  admin: {
    email: "admin@qless.store",
    name: "Priya Sundaram",
    role: "STORE_ADMIN" as UserRole,
    storeId: "STORE001",
    storeBranch: "QLess Mart Flagship (STORE001 · HSR Layout)",
  },
  guard: {
    identifier: "GUARD-07",
    email: "guard.gate1@qless.store",
    name: "Vikram Singh",
    role: "SECURITY_GUARD" as UserRole,
    storeId: "STORE001",
    terminalId: "Gate Turnstile #02",
  },
  cashier: {
    identifier: "CASHIER-03",
    email: "cashier.counter3@qless.store",
    name: "Ananya Roy",
    role: "CASHIER" as UserRole,
    storeId: "STORE001",
    terminalId: "Checkout Counter #03",
  },
};

/**
 * Generates initial 2-letter uppercase avatar initials.
 */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "QL";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Default mock registered customers list for first-run simulation.
 */
const DEFAULT_REGISTERED_CUSTOMERS: AuthUser[] = [
  {
    id: "usr_cust_001",
    name: DEMO_CREDENTIALS.customer.name,
    email: DEMO_CREDENTIALS.customer.email,
    phone: DEMO_CREDENTIALS.customer.phone,
    role: "CUSTOMER",
    avatarInitials: "RS",
    isVerified: true,
    createdAt: "2026-03-01T10:00:00Z",
    preferences: DEFAULT_PREFERENCES,
  },
];

/**
 * Loads registered customers list from localStorage.
 */
export function getRegisteredCustomers(): AuthUser[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return DEFAULT_REGISTERED_CUSTOMERS;
  }
  try {
    const raw = window.localStorage.getItem(REGISTERED_CUSTOMERS_KEY);
    if (!raw) {
      window.localStorage.setItem(
        REGISTERED_CUSTOMERS_KEY,
        JSON.stringify(DEFAULT_REGISTERED_CUSTOMERS)
      );
      return DEFAULT_REGISTERED_CUSTOMERS;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_REGISTERED_CUSTOMERS;
    }
    return parsed;
  } catch (err) {
    console.warn("QLess: Unable to read registered customers from storage:", err);
    return DEFAULT_REGISTERED_CUSTOMERS;
  }
}

/**
 * Saves registered customer list to localStorage.
 */
export function saveRegisteredCustomers(users: AuthUser[]): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(REGISTERED_CUSTOMERS_KEY, JSON.stringify(users));
  } catch (err) {
    console.error("QLess: Failed to save registered customers:", err);
  }
}

/**
 * Registers a new customer into demonstration storage.
 * Strictly validates unique email. Does NOT store password in localStorage.
 */
export function registerCustomer(
  data: CustomerSignupData
): { success: boolean; user?: AuthUser; error?: string } {
  const cleanEmail = data.email.trim().toLowerCase();

  // Validate required fields
  if (!data.fullName.trim()) {
    return { success: false, error: "Full name is required." };
  }
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { success: false, error: "Please enter a valid email address." };
  }
  if (!data.phone.trim() || data.phone.trim().replace(/\D/g, "").length < 10) {
    return { success: false, error: "Please enter a valid 10-digit mobile number." };
  }
  if (!data.password || data.password.length < 6) {
    return { success: false, error: "Password must be at least 6 characters long." };
  }
  if (data.password !== data.confirmPassword) {
    return { success: false, error: "Passwords do not match." };
  }
  if (!data.agreeToTerms) {
    return { success: false, error: "You must agree to the Terms & Conditions." };
  }

  const existing = getRegisteredCustomers();
  const duplicate = existing.find((u) => u.email.toLowerCase() === cleanEmail);
  if (duplicate) {
    return {
      success: false,
      error: `An account with email '${cleanEmail}' already exists. Please log in instead.`,
    };
  }

  const newUser: AuthUser = {
    id: `usr_cust_${Date.now()}`,
    name: data.fullName.trim(),
    email: cleanEmail,
    phone: data.phone.trim(),
    role: "CUSTOMER",
    avatarInitials: getInitials(data.fullName),
    isVerified: true, // Auto-verified in prototype simulation
    createdAt: new Date().toISOString(),
    preferences: DEFAULT_PREFERENCES,
  };

  const updated = [...existing, newUser];
  saveRegisteredCustomers(updated);

  return { success: true, user: newUser };
}

/**
 * Safely retrieves active session from localStorage.
 */
export function getStoredSession(): AuthSession | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed: AuthSession = JSON.parse(raw);
    if (!parsed || !parsed.user || !parsed.user.role) {
      clearStoredSession();
      return null;
    }

    // Expiration check (e.g. 7 days for demo session)
    if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() < Date.now()) {
      clearStoredSession();
      return null;
    }

    return parsed;
  } catch (err) {
    console.warn("QLess: Unable to read auth session from storage, resetting:", err);
    clearStoredSession();
    return null;
  }
}

/**
 * Saves active session to localStorage (without any sensitive tokens or passwords).
 */
export function saveStoredSession(session: AuthSession): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (err) {
    console.error("QLess: Failed to persist auth session:", err);
  }
}

/**
 * Completely clears active session from storage.
 */
export function clearStoredSession(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (err) {
    console.error("QLess: Failed to clear auth session:", err);
  }
}

/**
 * Helper to construct a standard demo session.
 */
export function createDemoSession(user: AuthUser, rememberMe: boolean = true): AuthSession {
  const now = new Date();
  const expires = new Date(now.getTime() + (rememberMe ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000));

  return {
    user: {
      ...user,
      preferences: user.preferences || DEFAULT_PREFERENCES,
    },
    tokenType: "DEMO_SESSION",
    loginAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    rememberMe,
  };
}

/**
 * Updates customer profile in registered list and updates current session if matched.
 */
export function updateStoredCustomerProfile(
  userId: string,
  updates: { name?: string; phone?: string }
): { success: boolean; user?: AuthUser; error?: string } {
  if (updates.name !== undefined && !updates.name.trim()) {
    return { success: false, error: "Full name cannot be blank." };
  }
  if (updates.phone !== undefined) {
    const digits = updates.phone.replace(/\D/g, "");
    if (digits.length < 10) {
      return { success: false, error: "Please enter a valid 10-digit mobile number." };
    }
  }

  const registered = getRegisteredCustomers();
  const idx = registered.findIndex((u) => u.id === userId);

  let updatedUser: AuthUser;

  if (idx !== -1) {
    const curr = registered[idx];
    const newName = updates.name !== undefined ? updates.name.trim() : curr.name;
    const newPhone = updates.phone !== undefined ? updates.phone.trim() : curr.phone;

    updatedUser = {
      ...curr,
      name: newName,
      phone: newPhone,
      avatarInitials: getInitials(newName),
    };

    registered[idx] = updatedUser;
    saveRegisteredCustomers(registered);
  } else {
    // If updating a session user not in registered array (e.g. initial demo customer)
    const session = getStoredSession();
    if (session && session.user.id === userId) {
      const newName = updates.name !== undefined ? updates.name.trim() : session.user.name;
      const newPhone = updates.phone !== undefined ? updates.phone.trim() : session.user.phone;
      updatedUser = {
        ...session.user,
        name: newName,
        phone: newPhone,
        avatarInitials: getInitials(newName),
      };
    } else {
      return { success: false, error: "User account not found." };
    }
  }

  // Update session if it matches the current user
  const currentSession = getStoredSession();
  if (currentSession && currentSession.user.id === userId) {
    currentSession.user = {
      ...currentSession.user,
      name: updatedUser.name,
      phone: updatedUser.phone,
      avatarInitials: updatedUser.avatarInitials,
    };
    saveStoredSession(currentSession);
  }

  return { success: true, user: updatedUser };
}

/**
 * Updates preferences for a customer user.
 */
export function updateStoredPreferences(
  userId: string,
  prefs: Partial<UserPreferences>
): UserPreferences {
  const session = getStoredSession();
  const currentPrefs = session?.user?.preferences || DEFAULT_PREFERENCES;

  const merged: UserPreferences = {
    ...currentPrefs,
    ...prefs,
    notifications: {
      ...currentPrefs.notifications,
      ...(prefs.notifications || {}),
    },
  };

  if (session && session.user.id === userId) {
    session.user.preferences = merged;
    saveStoredSession(session);
  }

  const registered = getRegisteredCustomers();
  const idx = registered.findIndex((u) => u.id === userId);
  if (idx !== -1) {
    registered[idx].preferences = merged;
    saveRegisteredCustomers(registered);
  }

  return merged;
}

/**
 * Removes a customer profile from demonstration storage and clears the active session.
 */
export function deleteStoredCustomerAccount(userId: string): boolean {
  const registered = getRegisteredCustomers();
  const filtered = registered.filter((u) => u.id !== userId);
  saveRegisteredCustomers(filtered);

  const session = getStoredSession();
  if (session && session.user.id === userId) {
    clearStoredSession();
  }

  return true;
}

/**
 * Normalizes URL fragments for React HashRouter + Supabase Auth.
 * When Supabase delivers password recovery or email verification tokens,
 * it appends them as a hash fragment (e.g. #access_token=... or #error=...).
 * If the application is hosted with HashRouter, the URL may contain two hashes:
 * e.g. /#/auth/reset-password#access_token=...&type=recovery
 * or a single hash without route: #access_token=...&type=recovery
 *
 * This function extracts tokens and errors, and normalizes the browser URL to:
 * /#/auth/reset-password?<tokens>
 * so HashRouter matches the route and query parameters are preserved.
 */
export function normalizeRecoveryHashUrl(): {
  accessToken?: string;
  refreshToken?: string;
  type?: string;
  errorCode?: string;
  errorDescription?: string;
} {
  if (typeof window === "undefined") return {};

  const fullHash = window.location.hash || "";
  const fullSearch = window.location.search || "";

  let tokenPart = "";

  // Check if hash has multiple fragments like #/auth/reset-password#access_token=...
  const hashParts = fullHash.split("#").filter(Boolean);
  for (const part of hashParts) {
    if (
      part.includes("access_token=") ||
      part.includes("error=") ||
      part.includes("error_code=") ||
      part.includes("type=recovery")
    ) {
      if (part.includes("?")) {
        tokenPart = part.substring(part.indexOf("?") + 1);
      } else {
        tokenPart = part;
      }
    }
  }

  // Also check query string in case search params were used
  if (!tokenPart && fullSearch && (fullSearch.includes("access_token=") || fullSearch.includes("error="))) {
    tokenPart = fullSearch.replace(/^\?/, "");
  }

  if (!tokenPart && fullHash.includes("access_token=")) {
    tokenPart = fullHash.substring(fullHash.indexOf("access_token="));
  } else if (!tokenPart && fullHash.includes("error=")) {
    tokenPart = fullHash.substring(fullHash.indexOf("error="));
  }

  const params = new URLSearchParams(tokenPart);
  const accessToken = params.get("access_token") || undefined;
  const refreshToken = params.get("refresh_token") || undefined;
  const type = params.get("type") || undefined;
  const errorCode = params.get("error_code") || params.get("error") || undefined;
  const errorDescription = params.get("error_description") || undefined;

  // If recovery tokens or errors exist, ensure HashRouter has a clean path to /auth/reset-password
  if (accessToken || errorCode || type === "recovery") {
    const cleanQuery = tokenPart ? `?${tokenPart}` : "";
    const targetHash = `#/auth/reset-password${cleanQuery}`;
    if (window.location.hash !== targetHash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${targetHash}`);
    }
  }

  return { accessToken, refreshToken, type, errorCode, errorDescription };
}

