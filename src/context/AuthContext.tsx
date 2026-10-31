import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  AuthSession,
  AuthUser,
  CustomerSignupData,
  StoreEntranceSession,
  UserPreferences,
  UserRole,
} from "../types";
import {
  DEMO_CREDENTIALS,
  DEFAULT_PREFERENCES,
  clearStoredSession,
  createDemoSession,
  deleteStoredCustomerAccount,
  getInitials,
  getRegisteredCustomers,
  getStoredSession,
  registerCustomer,
  saveStoredSession,
  updateStoredCustomerProfile,
  updateStoredPreferences,
  normalizeRecoveryHashUrl,
} from "../utils/authStorage";
import { clearAllPersistedCarts } from "../utils/cartStorage";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import {
  LAUNCH_STORE,
  LAUNCH_STORE_CODE,
  LAUNCH_STORE_ID,
  STORE_CODE,
  parseStoreEntranceQR,
} from "../config/storeConfig";
import type { User as SupabaseUser } from "@supabase/supabase-js";

interface AuthContextType {
  user: AuthUser | null;
  session: AuthSession | null;
  isAuthenticated: boolean;
  role: UserRole | null;
  isLoggingIn: boolean;
  isSupabaseLive: boolean;

  // Session Expiry handling
  isExpiringSoon: boolean;
  isSessionExpired: boolean;
  extendSession: () => void;
  dismissExpiryWarning: () => void;

  loginCustomer: (
    email: string,
    password: string,
    rememberMe?: boolean
  ) => Promise<{ success: boolean; error?: string }>;

  loginAdmin: (
    email: string,
    password: string
  ) => Promise<{ success: boolean; error?: string }>;

  loginGuard: (
    identifier: string,
    password: string,
    terminalId?: string
  ) => Promise<{ success: boolean; error?: string }>;

  loginCashier: (
    identifier: string,
    password: string,
    terminalId?: string
  ) => Promise<{ success: boolean; error?: string }>;

  // Store Entrance Verification (Phase 1 Fix 1)
  entranceSession: StoreEntranceSession | null;
  hasValidEntrance: boolean;
  verifyEntrance: (rawQR: string) => Promise<{ success: boolean; error?: string }>;
  clearEntranceSession: () => void;

  signupCustomer: (
    data: CustomerSignupData
  ) => Promise<{ success: boolean; user?: AuthUser; error?: string }>;

  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  updatePassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  isPasswordRecovery: boolean;

  updateProfile: (updates: {
    name?: string;
    phone?: string;
  }) => Promise<{ success: boolean; user?: AuthUser; error?: string }>;

  updatePreferences: (prefs: Partial<UserPreferences>) => void;
  deleteAccount: () => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isEmailRegistered: (email: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => getStoredSession());
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [isExpiringSoon, setIsExpiringSoon] = useState<boolean>(false);
  const [isSessionExpired, setIsSessionExpired] = useState<boolean>(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const res = normalizeRecoveryHashUrl();
    return res.type === "recovery" || Boolean(res.accessToken);
  });

  /**
   * Trusted Role Hydration from Database
   * Queries public.profiles and public.store_staff using the authenticated user UUID.
   *
   * SECURITY RULE:
   * A customer CANNOT claim an admin, cashier, or guard role by modifying frontend state,
   * localStorage, or signup payloads. Role and store assignment are derived EXCLUSIVELY
   * from the authoritative database store_staff table.
   */
  const hydrateUserFromDatabase = useCallback(async (sbUser: SupabaseUser): Promise<AuthUser> => {
    let profileName = "";
    let profilePhone = "";
    let avatarInitials = "";

    if (supabase) {
      try {
        // 1. Fetch user profile from public.profiles
        const { data: rawProfile } = await supabase
          .from("profiles")
          .select("full_name, email, phone, avatar_initials")
          .eq("id", sbUser.id)
          .maybeSingle();

        const profile = rawProfile as {
          full_name?: string | null;
          email?: string | null;
          phone?: string | null;
          avatar_initials?: string | null;
        } | null;

        if (profile) {
          profileName = profile.full_name || "";
          profilePhone = profile.phone || "";
          avatarInitials = profile.avatar_initials || "";
        }

        // 2. Fetch authoritative staff role from public.store_staff
        const { data: rawStaff } = await supabase
          .from("store_staff")
          .select("role, store_id, terminal_id")
          .eq("user_id", sbUser.id)
          .maybeSingle();

        const staff = rawStaff as {
          role?: "STORE_ADMIN" | "CASHIER" | "SECURITY_GUARD" | null;
          store_id?: string | null;
          terminal_id?: string | null;
        } | null;

        let assignedRole: UserRole = "CUSTOMER";
        let storeId = LAUNCH_STORE_ID;
        let terminalId: string | undefined = undefined;

        if (staff && staff.role) {
          // Strictly allow only verified database staff roles
          if (
            staff.role === "STORE_ADMIN" ||
            staff.role === "CASHIER" ||
            staff.role === "SECURITY_GUARD"
          ) {
            assignedRole = staff.role;
            storeId = staff.store_id || LAUNCH_STORE_ID;
            terminalId = staff.terminal_id || undefined;
          }
        }

        const displayName =
          profileName ||
          (sbUser.user_metadata?.full_name as string) ||
          (sbUser.user_metadata?.name as string) ||
          sbUser.email?.split("@")[0] ||
          "Shopper";

        return {
          id: sbUser.id,
          name: displayName,
          email: sbUser.email || profile?.email || "",
          role: assignedRole,
          storeId,
          terminalId,
          phone: profilePhone || (sbUser.user_metadata?.phone as string) || undefined,
          avatarInitials: avatarInitials || getInitials(displayName),
          isVerified: Boolean(sbUser.email_confirmed_at),
          createdAt: sbUser.created_at,
          preferences: DEFAULT_PREFERENCES,
        };
      } catch (err) {
        console.warn("QLess: Database profile hydration error, falling back to safe user defaults:", err);
      }
    }

    // Default safe fallback if database query is unavailable: strictly CUSTOMER
    const fallbackName =
      (sbUser.user_metadata?.full_name as string) ||
      sbUser.email?.split("@")[0] ||
      "Shopper";

    return {
      id: sbUser.id,
      name: fallbackName,
      email: sbUser.email || "",
      role: "CUSTOMER", // Never escalate privileges on error
      storeId: LAUNCH_STORE_ID,
      avatarInitials: getInitials(fallbackName),
      isVerified: Boolean(sbUser.email_confirmed_at),
      createdAt: sbUser.created_at,
      preferences: DEFAULT_PREFERENCES,
    };
  }, []);

  /**
   * Authoritative Active Store Entrance Session Hydration from Database.
   * Checks public.store_entry_sessions for a currently active, unexpired session.
   *
   * SECURITY RULE:
   * Client localStorage is NEVER authoritative proof of an active store session.
   * Only active, unexpired records in public.store_entry_sessions count.
   */
  const fetchActiveEntranceSession = useCallback(
    async (userId: string): Promise<StoreEntranceSession | null> => {
      if (!isSupabaseConfigured || !supabase) return null;

      try {
        const { data: rawEntry, error } = await supabase
          .from("store_entry_sessions")
          .select("store_id, session_token, verified_at, expires_at")
          .eq("user_id", userId)
          .eq("store_id", LAUNCH_STORE_ID)
          .eq("is_active", true)
          .gt("expires_at", new Date().toISOString())
          .order("verified_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const data = rawEntry as {
          store_id: string;
          session_token: string;
          verified_at: string;
          expires_at: string;
        } | null;

        if (error || !data) {
          return null;
        }

        return {
          storeId: data.store_id,
          storeCode: STORE_CODE,
          storeName: LAUNCH_STORE.name,
          sessionToken: data.session_token,
          verifiedAt: data.verified_at,
          expiresAt: data.expires_at,
        };
      } catch (err) {
        console.warn("[QLess Entrance] Failed to fetch active entrance session from database:", err);
        return null;
      }
    },
    []
  );

  // Supabase Auth Lifecycle & Persistent Session Restoration
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    let isMounted = true;

    async function restoreLiveSession() {
      try {
        const { data: { session: sbSession }, error } = await supabase!.auth.getSession();
        if (error) {
          console.warn("Supabase session restore check failed:", error.message);
          return;
        }

        if (sbSession?.user && isMounted) {
          const hydratedUser = await hydrateUserFromDatabase(sbSession.user);
          const activeEntrance = await fetchActiveEntranceSession(sbSession.user.id);
          const expiresAt = new Date(
            (sbSession.expires_at || Date.now() / 1000 + 3600) * 1000
          ).toISOString();

          const activeSession: AuthSession = {
            user: hydratedUser,
            tokenType: "SUPABASE_SESSION",
            loginAt: new Date(sbSession.user.created_at || Date.now()).toISOString(),
            expiresAt,
            entranceSession: activeEntrance,
          };

          setSession(activeSession);
          saveStoredSession(activeSession);
        }
      } catch (err) {
        console.warn("Supabase auth restoration error:", err);
      }
    }

    restoreLiveSession();

    // Listen to real-time auth changes (sign in, sign out, token refresh)
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, sbSession) => {
        if (!isMounted) return;

        if (event === "PASSWORD_RECOVERY") {
          setIsPasswordRecovery(true);
        } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
          if (sbSession?.user) {
            const hydratedUser = await hydrateUserFromDatabase(sbSession.user);
            const activeEntrance = await fetchActiveEntranceSession(sbSession.user.id);
            const expiresAt = new Date(
              (sbSession.expires_at || Date.now() / 1000 + 3600) * 1000
            ).toISOString();

            const activeSession: AuthSession = {
              user: hydratedUser,
              tokenType: "SUPABASE_SESSION",
              loginAt: new Date().toISOString(),
              expiresAt,
              entranceSession: activeEntrance,
            };

            setSession(activeSession);
            saveStoredSession(activeSession);
          }
        } else if (event === "SIGNED_OUT") {
          setIsPasswordRecovery(false);
          clearAllPersistedCarts();
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("qless:cart-flush"));
          }
          setSession(null);
          clearStoredSession();
        }
      }
    );

    return () => {
      isMounted = false;
      authListener?.subscription.unsubscribe();
    };
  }, [hydrateUserFromDatabase, fetchActiveEntranceSession]);

  // Synchronize storage when local session changes
  useEffect(() => {
    if (session) {
      saveStoredSession(session);
    } else {
      clearStoredSession();
    }
  }, [session]);

  // Periodic genuine session expiration monitoring (checked every 15s)
  useEffect(() => {
    if (!session || !session.expiresAt) {
      setIsExpiringSoon(false);
      setIsSessionExpired(false);
      return;
    }

    const checkExpiry = () => {
      const remainingMs = new Date(session.expiresAt).getTime() - Date.now();
      if (remainingMs <= 0) {
        setIsSessionExpired(true);
        setIsExpiringSoon(false);
        clearStoredSession();
        setSession(null);
      } else if (remainingMs <= 5 * 60 * 1000) {
        setIsExpiringSoon(true);
      } else {
        setIsExpiringSoon(false);
      }

      // Proactively clear expired store entrance session
      if (
        session.entranceSession?.expiresAt &&
        new Date(session.entranceSession.expiresAt).getTime() <= Date.now()
      ) {
        clearAllPersistedCarts();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("qless:cart-flush"));
        }
        setSession((prev) => {
          if (!prev || !prev.entranceSession) return prev;
          const updated: AuthSession = {
            ...prev,
            entranceSession: null,
          };
          saveStoredSession(updated);
          return updated;
        });
      }
    };

    checkExpiry();
    const interval = setInterval(checkExpiry, 15000);
    return () => clearInterval(interval);
  }, [session]);

  const user = session?.user ?? null;
  const isAuthenticated = !!user;
  const role = user?.role ?? null;

  // ── Entrance Session Verification ──
  const entranceSession = session?.entranceSession ?? null;
  const isEntranceExpired = Boolean(
    entranceSession?.expiresAt && new Date(entranceSession.expiresAt).getTime() <= Date.now()
  );
  const hasValidEntrance = Boolean(
    entranceSession &&
      !isEntranceExpired &&
      entranceSession.storeId === LAUNCH_STORE_ID &&
      entranceSession.storeCode === LAUNCH_STORE_CODE
  );

  const verifyEntrance = useCallback(
    async (rawQR: string): Promise<{ success: boolean; error?: string }> => {
      // 1. Client-side QR format validation
      const result = parseStoreEntranceQR(rawQR);
      if (!result.isValid || !result.storeCode) {
        return {
          success: false,
          error:
            result.error ||
            "Invalid entrance QR code. Please scan the official QLess Mart gate pass.",
        };
      }

      if (result.storeCode.toUpperCase() !== STORE_CODE) {
        return {
          success: false,
          error: `Store code '${result.storeCode}' does not match the active launch supermarket (${STORE_CODE} · ${LAUNCH_STORE.name}).`,
        };
      }

      // 2. Authoritative Database Entrance Verification via Supabase RPC
      if (isSupabaseConfigured && supabase) {
        if (!isAuthenticated || !user?.id) {
          return {
            success: false,
            error: "Authentication required to verify store entrance. Please sign in to your account.",
          };
        }

        try {
          // Verify that a live Supabase auth session exists before invoking authenticated database RPC
          const { data: authSessionData } = await supabase.auth.getSession();
          const activeSbSession = authSessionData?.session;

          if (!activeSbSession || !activeSbSession.user) {
            return {
              success: false,
              error:
                "Authentication required to verify store entrance. Please sign in to your Supabase account.",
            };
          }

          const { data, error } = await (supabase.rpc as any)("validate_store_entrance_qr", {
            p_store_code: result.storeCode,
          });

          if (error) {
            console.warn(
              `[QLess Entrance] validate_store_entrance_qr RPC error [${error.code || "UNKNOWN"}]:`,
              error.message
            );
            return {
              success: false,
              error: error.message || "Failed to verify store entrance gate. Please try again.",
            };
          }

          if (!data || typeof data !== "object") {
            return {
              success: false,
              error: "Invalid response received from store entrance verification server.",
            };
          }

          const payload = data as {
            success?: boolean;
            error?: string;
            store?: {
              id?: string;
              code?: string;
              name?: string;
              branch?: string;
              address?: string;
            };
            sessionToken?: string;
            expiresAt?: string;
          };

          if (!payload.success) {
            return {
              success: false,
              error: payload.error || "Store entrance verification was declined by the server.",
            };
          }

          const newEntranceSession: StoreEntranceSession = {
            storeId: payload.store?.id || LAUNCH_STORE_ID,
            storeCode: payload.store?.code || STORE_CODE,
            storeName: payload.store?.name || LAUNCH_STORE.name,
            sessionToken: payload.sessionToken || `SES-${Date.now().toString(36).toUpperCase()}`,
            verifiedAt: new Date().toISOString(),
            expiresAt:
              payload.expiresAt || new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
          };

          setSession((prev) => {
            if (!prev) return null;
            const updated: AuthSession = {
              ...prev,
              entranceSession: newEntranceSession,
            };
            saveStoredSession(updated);
            return updated;
          });

          return { success: true };
        } catch (err: unknown) {
          console.warn("[QLess Entrance] Network or unexpected error during entrance verification:", err);
          return {
            success: false,
            error:
              err instanceof Error
                ? err.message
                : "A network error occurred while connecting to the gate.",
          };
        }
      }

      // 3. Fallback to demonstration simulation ONLY when Supabase is genuinely unconfigured
      if (!isAuthenticated || !user?.id) {
        return {
          success: false,
          error: "Authentication required to verify store entrance. Please sign in first.",
        };
      }

      const now = new Date();
      const expires = new Date(now.getTime() + 4 * 60 * 60 * 1000); // 4-hour active in-store shopping session

      const newEntranceSession: StoreEntranceSession = {
        storeId: LAUNCH_STORE_ID,
        storeCode: STORE_CODE,
        storeName: LAUNCH_STORE.name,
        sessionToken: `DEMO-SES-${Date.now().toString(36).toUpperCase()}`,
        verifiedAt: now.toISOString(),
        expiresAt: expires.toISOString(),
      };

      setSession((prev) => {
        if (!prev) return null;
        const updated: AuthSession = {
          ...prev,
          entranceSession: newEntranceSession,
        };
        saveStoredSession(updated);
        return updated;
      });

      return { success: true };
    },
    [isAuthenticated, user?.id]
  );

  const clearEntranceSession = useCallback(() => {
    setSession((prev) => {
      if (!prev) return null;
      const updated: AuthSession = {
        ...prev,
        entranceSession: null,
      };
      saveStoredSession(updated);
      return updated;
    });
  }, []);

  const extendSession = useCallback(() => {
    if (!session) return;
    const durationMs = session.rememberMe ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const updated: AuthSession = {
      ...session,
      expiresAt: new Date(Date.now() + durationMs).toISOString(),
    };
    setSession(updated);
    saveStoredSession(updated);
    setIsExpiringSoon(false);
    setIsSessionExpired(false);
  }, [session]);

  const dismissExpiryWarning = useCallback(() => {
    setIsExpiringSoon(false);
    setIsSessionExpired(false);
  }, []);

  const isEmailRegistered = (email: string): boolean => {
    const clean = email.trim().toLowerCase();
    const registered = getRegisteredCustomers();
    return registered.some((u) => u.email.toLowerCase() === clean);
  };

  /**
   * Customer Email/Password Login
   */
  const loginCustomer = async (
    email: string,
    password: string,
    rememberMe: boolean = true
  ): Promise<{ success: boolean; error?: string }> => {
    setIsLoggingIn(true);
    try {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          return { success: false, error: error.message };
        }

        if (!data.user) {
          return { success: false, error: "Login failed: No user profile returned." };
        }

        // Authoritative role hydration
        const hydratedUser = await hydrateUserFromDatabase(data.user);
        const activeEntrance = await fetchActiveEntranceSession(data.user.id);
        const expiresAt = new Date(
          (data.session?.expires_at || Date.now() / 1000 + (rememberMe ? 7 * 86400 : 86400)) * 1000
        ).toISOString();

        const activeSession: AuthSession = {
          user: hydratedUser,
          tokenType: "SUPABASE_SESSION",
          loginAt: new Date().toISOString(),
          expiresAt,
          rememberMe,
          entranceSession: activeEntrance,
        };

        setSession(activeSession);
        saveStoredSession(activeSession);
        return { success: true };
      }

      // Fallback when Supabase is unconfigured or unreachable
      return {
        success: false,
        error: "Authentication service is currently unavailable. Please verify connection to the store server.",
      };
    } finally {
      setIsLoggingIn(false);
    }
  };

  /**
   * Store Administrator Login
   * Strictly enforces STORE_ADMIN role assignment from the database.
   */
  const loginAdmin = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    setIsLoggingIn(true);
    try {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          return { success: false, error: error.message };
        }

        if (!data.user) {
          return { success: false, error: "Administrator authentication failed." };
        }

        // Hydrate role and verify administrative privilege
        const hydratedUser = await hydrateUserFromDatabase(data.user);
        if (hydratedUser.role !== "STORE_ADMIN" && hydratedUser.role !== "ADMIN") {
          // User is authenticated in Supabase but lacks STORE_ADMIN role in store_staff!
          await supabase.auth.signOut();
          return {
            success: false,
            error: "Access Denied: This account is not an authorized administrator for QLess Mart (STORE001).",
          };
        }

        if (hydratedUser.storeId && hydratedUser.storeId !== LAUNCH_STORE_ID) {
          await supabase.auth.signOut();
          return {
            success: false,
            error: `Access Denied: Administrator account is assigned to store '${hydratedUser.storeId}', not '${LAUNCH_STORE_ID}'.`,
          };
        }

        const expiresAt = new Date(
          (data.session?.expires_at || Date.now() / 1000 + 86400) * 1000
        ).toISOString();

        const activeSession: AuthSession = {
          user: hydratedUser,
          tokenType: "SUPABASE_SESSION",
          loginAt: new Date().toISOString(),
          expiresAt,
        };

        setSession(activeSession);
        saveStoredSession(activeSession);
        return { success: true };
      }

      // Fallback when Supabase is unconfigured or unreachable
      return {
        success: false,
        error: "Staff authentication service is currently unavailable. Please verify connection to the store server.",
      };
    } finally {
      setIsLoggingIn(false);
    }
  };

  /**
   * Security Guard Gate Login
   * Strictly enforces SECURITY_GUARD role assignment from the database.
   */
  const loginGuard = async (
    identifier: string,
    password: string,
    terminalId: string = "Gate Turnstile #02"
  ): Promise<{ success: boolean; error?: string }> => {
    setIsLoggingIn(true);
    try {
      if (isSupabaseConfigured && supabase) {
        let emailToUse = identifier.trim();
        // If an identifier/badge ID without @ was entered, resolve to known staff email
        if (!emailToUse.includes("@")) {
          if (
            emailToUse.toLowerCase() === DEMO_CREDENTIALS.guard.identifier.toLowerCase() ||
            emailToUse.toUpperCase() === "GUARD-07" ||
            emailToUse.toUpperCase() === "GUARD"
          ) {
            emailToUse = DEMO_CREDENTIALS.guard.email;
          }
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email: emailToUse,
          password,
        });

        if (error) {
          return { success: false, error: error.message };
        }

        if (!data.user) {
          return { success: false, error: "Guard terminal authentication failed." };
        }

        // Hydrate role and verify security guard privilege
        const hydratedUser = await hydrateUserFromDatabase(data.user);
        if (
          hydratedUser.role !== "SECURITY_GUARD" &&
          hydratedUser.role !== "STORE_ADMIN" &&
          hydratedUser.role !== "ADMIN"
        ) {
          await supabase.auth.signOut();
          return {
            success: false,
            error: "Access Denied: This account is not authorized as a security officer for STORE001.",
          };
        }

        if (hydratedUser.storeId && hydratedUser.storeId !== LAUNCH_STORE_ID) {
          await supabase.auth.signOut();
          return {
            success: false,
            error: `Access Denied: Security officer is assigned to store '${hydratedUser.storeId}', not '${LAUNCH_STORE_ID}'.`,
          };
        }

        hydratedUser.terminalId = terminalId;

        const expiresAt = new Date(
          (data.session?.expires_at || Date.now() / 1000 + 86400) * 1000
        ).toISOString();

        const activeSession: AuthSession = {
          user: hydratedUser,
          tokenType: "SUPABASE_SESSION",
          loginAt: new Date().toISOString(),
          expiresAt,
        };

        setSession(activeSession);
        saveStoredSession(activeSession);
        return { success: true };
      }

      // Fallback when Supabase is unconfigured or unreachable
      return {
        success: false,
        error: "Security terminal authentication service is currently unavailable. Please verify connection to the store server.",
      };
    } finally {
      setIsLoggingIn(false);
    }
  };

  /**
   * Cashier Terminal Login
   * Strictly enforces CASHIER role assignment from the database (or demo credentials in development fallback).
   */
  const loginCashier = async (
    identifier: string,
    password: string,
    terminalId: string = "Checkout Counter #03"
  ): Promise<{ success: boolean; error?: string }> => {
    setIsLoggingIn(true);
    try {
      if (isSupabaseConfigured && supabase) {
        let emailToUse = identifier.trim();
        // If an identifier/badge ID without @ was entered, resolve to known staff email
        if (!emailToUse.includes("@")) {
          if (
            emailToUse.toLowerCase() === DEMO_CREDENTIALS.cashier.identifier.toLowerCase() ||
            emailToUse.toUpperCase() === "CASHIER-03" ||
            emailToUse.toUpperCase() === "CASHIER"
          ) {
            emailToUse = DEMO_CREDENTIALS.cashier.email;
          }
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email: emailToUse,
          password,
        });

        if (error) {
          return { success: false, error: error.message };
        }

        if (!data.user) {
          return { success: false, error: "Cashier terminal authentication failed." };
        }

        // Hydrate role and verify cashier privilege
        const hydratedUser = await hydrateUserFromDatabase(data.user);
        if (
          hydratedUser.role !== "CASHIER" &&
          hydratedUser.role !== "STORE_ADMIN" &&
          hydratedUser.role !== "ADMIN"
        ) {
          await supabase.auth.signOut();
          return {
            success: false,
            error: "Access Denied: This account is not authorized as a cashier for STORE001.",
          };
        }

        if (hydratedUser.storeId && hydratedUser.storeId !== LAUNCH_STORE_ID) {
          await supabase.auth.signOut();
          return {
            success: false,
            error: `Access Denied: Cashier account is assigned to store '${hydratedUser.storeId}', not '${LAUNCH_STORE_ID}'.`,
          };
        }

        hydratedUser.terminalId = terminalId;

        const expiresAt = new Date(
          (data.session?.expires_at || Date.now() / 1000 + 86400) * 1000
        ).toISOString();

        const activeSession: AuthSession = {
          user: hydratedUser,
          tokenType: "SUPABASE_SESSION",
          loginAt: new Date().toISOString(),
          expiresAt,
        };

        setSession(activeSession);
        saveStoredSession(activeSession);
        return { success: true };
      }

      // Fallback when Supabase is unconfigured or unreachable
      return {
        success: false,
        error: "Cashier terminal authentication service is currently unavailable. Please verify connection to the store server.",
      };
    } finally {
      setIsLoggingIn(false);
    }
  };

  /**
   * Customer Registration
   * Public registration creates an account with role strictly set to CUSTOMER.
   */
  const signupCustomer = async (
    data: CustomerSignupData
  ): Promise<{ success: boolean; user?: AuthUser; error?: string }> => {
    setIsLoggingIn(true);
    try {
      if (isSupabaseConfigured && supabase) {
        const { data: authData, error } = await supabase.auth.signUp({
          email: data.email.trim(),
          password: data.password,
          options: {
            data: {
              full_name: data.fullName.trim(),
              phone: data.phone.trim(),
            },
          },
        });

        if (error) {
          return { success: false, error: error.message };
        }

        if (!authData.user) {
          return { success: false, error: "Registration failed: No user returned." };
        }

        // Hydrate profile (role defaults strictly to CUSTOMER)
        const hydratedUser = await hydrateUserFromDatabase(authData.user);

        if (authData.session) {
          const expiresAt = new Date(
            (authData.session.expires_at || Date.now() / 1000 + 7 * 86400) * 1000
          ).toISOString();

          const newSession: AuthSession = {
            user: hydratedUser,
            tokenType: "SUPABASE_SESSION",
            loginAt: new Date().toISOString(),
            expiresAt,
            rememberMe: true,
          };

          setSession(newSession);
          saveStoredSession(newSession);
        }

        return { success: true, user: hydratedUser };
      }

      // ── Development Fallback Mode ──
      const res = registerCustomer(data);
      if (res.success && res.user) {
        const sessionObj = createDemoSession(res.user, true);
        setSession(sessionObj);
        saveStoredSession(sessionObj);
      }
      return res;
    } finally {
      setIsLoggingIn(false);
    }
  };

  /**
   * Request Password Reset Email via Supabase Auth
   */
  const resetPassword = async (email: string): Promise<{ success: boolean; error?: string }> => {
    if (isSupabaseConfigured && supabase) {
      const redirectUrl = `${window.location.origin}/#/auth/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: redirectUrl,
      });
      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    }

    return {
      success: false,
      error: "Password reset service is currently unavailable. Please verify connection to the store server.",
    };
  };

  /**
   * Update Account Password via Supabase Auth
   */
  const updatePassword = async (newPassword: string): Promise<{ success: boolean; error?: string }> => {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) {
        return { success: false, error: error.message };
      }
      setIsPasswordRecovery(false);
      return { success: true };
    }

    return {
      success: false,
      error: "Password update service is currently unavailable. Please verify connection to the store server.",
    };
  };

  /**
   * Update Customer Profile
   */
  const updateProfile = async (updates: {
    name?: string;
    phone?: string;
  }): Promise<{ success: boolean; user?: AuthUser; error?: string }> => {
    if (!user) {
      return { success: false, error: "No active user session to update." };
    }

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("profiles").upsert({
        id: user.id,
        full_name: updates.name || user.name,
        phone: updates.phone ?? user.phone ?? null,
        email: user.email,
        avatar_initials: updates.name ? getInitials(updates.name) : user.avatarInitials,
        updated_at: new Date().toISOString(),
      } as any);

      if (error) {
        return { success: false, error: error.message };
      }

      const updatedUser: AuthUser = {
        ...user,
        name: updates.name || user.name,
        phone: updates.phone ?? user.phone,
        avatarInitials: updates.name ? getInitials(updates.name) : user.avatarInitials,
      };

      setSession((prev) => (prev ? { ...prev, user: updatedUser } : null));
      return { success: true, user: updatedUser };
    }

    // Demo simulation fallback
    const res = updateStoredCustomerProfile(user.id, updates);
    if (res.success && res.user) {
      setSession((prev) => (prev ? { ...prev, user: res.user! } : null));
    }
    return res;
  };

  /**
   * Update Preferences
   */
  const updatePreferences = (prefs: Partial<UserPreferences>): void => {
    if (!user) return;
    const merged = updateStoredPreferences(user.id, prefs);
    setSession((prev) => (prev ? { ...prev, user: { ...prev.user, preferences: merged } } : null));
  };

  /**
   * Delete Account
   */
  const deleteAccount = async (): Promise<{ success: boolean; error?: string }> => {
    if (!user) {
      return { success: false, error: "No active session." };
    }

    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    }

    deleteStoredCustomerAccount(user.id);
    clearStoredSession();
    clearAllPersistedCarts();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("qless:cart-flush"));
    }
    setSession(null);
    return { success: true };
  };

  /**
   * Logout and clear sensitive session state
   */
  const logout = useCallback(async () => {
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn("QLess: Sign out exception:", err);
      }
    }
    clearStoredSession();
    clearAllPersistedCarts();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("qless:cart-flush"));
    }
    setSession(null);
    setIsExpiringSoon(false);
    setIsSessionExpired(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isAuthenticated,
        role,
        isLoggingIn,
        isSupabaseLive: isSupabaseConfigured,
        isExpiringSoon,
        isSessionExpired,
        extendSession,
        dismissExpiryWarning,
        loginCustomer,
        loginAdmin,
        loginGuard,
        loginCashier,
        entranceSession,
        hasValidEntrance,
        verifyEntrance,
        clearEntranceSession,
        signupCustomer,
        resetPassword,
        updatePassword,
        isPasswordRecovery,
        updateProfile,
        updatePreferences,
        deleteAccount,
        logout,
        isEmailRegistered,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
