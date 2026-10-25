/**
 * QLess Smart Shopping — Scoped Cart Storage & Isolation Manager
 *
 * Provides cryptographically sound session, user, and store scoping
 * for active shopping cart persistence. Guarantees:
 * 1. Zero cart bleed across different authenticated customers.
 * 2. Zero cart reuse across different supermarket stores.
 * 3. Fresh entrance sessions cannot inherit stale items from prior sessions.
 * 4. Safe recovery on malformed, corrupt, or legacy storage entries.
 */

import type { CartItem } from "../types/index.ts";
import { LAUNCH_STORE_ID } from "../config/storeConfig.ts";

export const CART_STORAGE_PREFIX = "qless_active_cart_v2";
export const LEGACY_CART_STORAGE_KEY = "qless_active_cart_v1";

/**
 * Storage envelope schema ensuring cart ownership verification.
 */
export interface PersistedCartEnvelope {
  version: 2;
  userId: string | null;
  storeId: string;
  entranceToken: string | null;
  items: CartItem[];
  savedAt: number;
}

/**
 * Constructs a deterministic, isolated storage key for a user and store.
 */
export function getScopedCartStorageKey(
  userId?: string | null,
  storeId?: string | null
): string {
  const cleanUser = userId && userId.trim() ? userId.trim() : "anon";
  const cleanStore = storeId && storeId.trim() ? storeId.trim() : LAUNCH_STORE_ID;
  return `${CART_STORAGE_PREFIX}_${cleanUser}_${cleanStore}`;
}

/**
 * Sanitizes and validates an array of cart items from untrusted JSON storage.
 */
export function validateCartItems(rawItems: unknown): CartItem[] {
  if (!Array.isArray(rawItems)) return [];

  const validated: CartItem[] = [];

  for (const item of rawItems) {
    if (!item || typeof item !== "object") continue;

    const id = Number(item.id);
    const quantity = Number(item.quantity);
    const price = Number(item.price);

    if (!Number.isInteger(id) || id <= 0) continue;
    if (!Number.isInteger(quantity) || quantity <= 0) continue;
    if (isNaN(price) || price < 0) continue;

    validated.push({
      id,
      name: typeof item.name === "string" && item.name ? item.name : `Product #${id}`,
      price,
      quantity,
      unitSize: typeof item.unitSize === "string" ? item.unitSize : undefined,
      mrp: typeof item.mrp === "number" && item.mrp >= price ? item.mrp : price,
      emoji: typeof item.emoji === "string" ? item.emoji : undefined,
      category: typeof item.category === "string" ? item.category : undefined,
      brand: typeof item.brand === "string" ? item.brand : undefined,
    });
  }

  return validated;
}

/**
 * Purges legacy un-namespaced cart storage keys.
 */
export function purgeLegacyCartStorage(): void {
  try {
    if (typeof window !== "undefined") {
      if (window.sessionStorage) {
        window.sessionStorage.removeItem(LEGACY_CART_STORAGE_KEY);
      }
      if (window.localStorage) {
        window.localStorage.removeItem(LEGACY_CART_STORAGE_KEY);
      }
    }
  } catch (err) {
    console.warn("[QLess Cart] Warning purging legacy storage:", err);
  }
}

/**
 * Safely loads active cart from sessionStorage with strict user, store, and entrance token validation.
 * Rejects stale items from previous entrance sessions or other users.
 */
export function loadScopedCart(
  userId?: string | null,
  storeId?: string | null,
  entranceToken?: string | null
): CartItem[] {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return [];

    // Ensure legacy storage key is cleaned up
    purgeLegacyCartStorage();

    const key = getScopedCartStorageKey(userId, storeId);
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return [];

    const envelope = JSON.parse(raw) as PersistedCartEnvelope;
    if (!envelope || typeof envelope !== "object" || envelope.version !== 2) {
      window.sessionStorage.removeItem(key);
      return [];
    }

    // 1. Strict User Isolation Check
    const expectedUser = userId && userId.trim() ? userId.trim() : null;
    if (envelope.userId !== expectedUser) {
      // Discovered cart belongs to a different user identity
      window.sessionStorage.removeItem(key);
      return [];
    }

    // 2. Strict Store Isolation Check
    const expectedStore = storeId && storeId.trim() ? storeId.trim() : LAUNCH_STORE_ID;
    if (envelope.storeId !== expectedStore) {
      window.sessionStorage.removeItem(key);
      return [];
    }

    // 3. Strict Entrance Session Isolation Check
    // If entranceToken is specified, the envelope MUST belong to that exact active entrance token.
    // If entranceToken has changed, expired, or is empty, stale items from an old trip must not be restored.
    const cleanToken = entranceToken && entranceToken.trim() ? entranceToken.trim() : null;
    if (envelope.entranceToken !== cleanToken) {
      window.sessionStorage.removeItem(key);
      return [];
    }

    // 4. Validate items structure and return clean list
    return validateCartItems(envelope.items);
  } catch (err) {
    console.warn("[QLess Cart] Failed to parse scoped cart, resetting to empty:", err);
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        const key = getScopedCartStorageKey(userId, storeId);
        window.sessionStorage.removeItem(key);
      }
    } catch {
      // Ignore secondary error
    }
    return [];
  }
}

/**
 * Persists active cart to sessionStorage wrapped in a security envelope.
 */
export function saveScopedCart(
  items: CartItem[],
  userId?: string | null,
  storeId?: string | null,
  entranceToken?: string | null
): void {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return;

    const key = getScopedCartStorageKey(userId, storeId);

    if (!items || items.length === 0) {
      window.sessionStorage.removeItem(key);
      return;
    }

    const envelope: PersistedCartEnvelope = {
      version: 2,
      userId: userId && userId.trim() ? userId.trim() : null,
      storeId: storeId && storeId.trim() ? storeId.trim() : LAUNCH_STORE_ID,
      entranceToken: entranceToken && entranceToken.trim() ? entranceToken.trim() : null,
      items: validateCartItems(items),
      savedAt: Date.now(),
    };

    window.sessionStorage.setItem(key, JSON.stringify(envelope));
  } catch (err) {
    console.warn("[QLess Cart] Failed to persist scoped cart to session storage:", err);
  }
}

/**
 * Removes cart data for a specific user and store.
 */
export function clearScopedCart(userId?: string | null, storeId?: string | null): void {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return;
    const key = getScopedCartStorageKey(userId, storeId);
    window.sessionStorage.removeItem(key);
  } catch (err) {
    console.warn("[QLess Cart] Warning clearing scoped cart:", err);
  }
}

/**
 * Purges all active cart keys across all users and stores from sessionStorage.
 * Invoked on logout, account deletion, or explicit session termination.
 */
export function clearAllPersistedCarts(): void {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return;

    const keysToRemove: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i);
      if (key && (key.startsWith(CART_STORAGE_PREFIX) || key === LEGACY_CART_STORAGE_KEY)) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      window.sessionStorage.removeItem(key);
    }

    // Also purge legacy localStorage entry if present
    purgeLegacyCartStorage();
  } catch (err) {
    console.warn("[QLess Cart] Warning clearing all persisted carts:", err);
  }
}
