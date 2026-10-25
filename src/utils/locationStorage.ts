import { ProductLocation, LocationVerificationStatus } from "../types";
import { INITIAL_PRODUCT_LOCATIONS, STORE_AISLES } from "../data/mockStoreLayout";
import { STORE_ID } from "../config/storeConfig";

const LOCATIONS_STORAGE_KEY = "qless_product_locations_v1";

/**
 * Retrieves all product locations from localStorage or defaults.
 * Guarantees corruption resilience and validates entry structures.
 */
export function getProductLocations(): ProductLocation[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return [...INITIAL_PRODUCT_LOCATIONS];
  }

  try {
    const raw = window.localStorage.getItem(LOCATIONS_STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(LOCATIONS_STORAGE_KEY, JSON.stringify(INITIAL_PRODUCT_LOCATIONS));
      return [...INITIAL_PRODUCT_LOCATIONS];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      window.localStorage.setItem(LOCATIONS_STORAGE_KEY, JSON.stringify(INITIAL_PRODUCT_LOCATIONS));
      return [...INITIAL_PRODUCT_LOCATIONS];
    }

    // Filter valid locations
    const valid = parsed.filter(
      (item): item is ProductLocation =>
        item &&
        typeof item === "object" &&
        typeof item.productId === "number" &&
        typeof item.aisleCode === "string" &&
        item.aisleCode.trim().length > 0 &&
        typeof item.rackCode === "string" &&
        item.rackCode.trim().length > 0 &&
        typeof item.shelfCode === "string" &&
        item.shelfCode.trim().length > 0 &&
        ["VERIFIED", "UNVERIFIED", "MISSING"].includes(item.verificationStatus)
    );

    if (valid.length === 0) {
      return [...INITIAL_PRODUCT_LOCATIONS];
    }

    return valid;
  } catch (err) {
    console.warn("QLess: Unable to read locations from localStorage, falling back to initial data:", err);
    return [...INITIAL_PRODUCT_LOCATIONS];
  }
}

/**
 * Saves full product locations list to localStorage.
 */
export function saveProductLocations(locations: ProductLocation[]): ProductLocation[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return locations;
  }

  try {
    window.localStorage.setItem(LOCATIONS_STORAGE_KEY, JSON.stringify(locations));
    return locations;
  } catch (err) {
    console.error("QLess: Failed to persist product locations to localStorage:", err);
    return locations;
  }
}

/**
 * Retrieves the location for a specific product ID.
 */
export function getProductLocation(productId: number): ProductLocation | undefined {
  const locations = getProductLocations();
  return locations.find((l) => l.productId === productId);
}

/**
 * Validates and updates/creates a product location record.
 */
export function updateProductLocationRecord(
  payload: Omit<ProductLocation, "updatedAt" | "storeId"> & { updatedAt?: string; storeId?: string }
): { success: boolean; error?: string; location?: ProductLocation } {
  if (!payload.productId || typeof payload.productId !== "number") {
    return { success: false, error: "Valid product ID is required." };
  }

  if (!payload.aisleCode || !payload.aisleCode.trim()) {
    return { success: false, error: "Aisle code is required." };
  }

  if (!payload.rackCode || !payload.rackCode.trim()) {
    return { success: false, error: "Rack code is required." };
  }

  if (!payload.shelfCode || !payload.shelfCode.trim()) {
    return { success: false, error: "Shelf code is required." };
  }

  const validStatuses: LocationVerificationStatus[] = ["VERIFIED", "UNVERIFIED", "MISSING"];
  if (!validStatuses.includes(payload.verificationStatus)) {
    return { success: false, error: "Invalid verification status." };
  }

  // Find canonical aisle name if missing or out of sync
  const aisleDef = STORE_AISLES.find((a) => a.code.toUpperCase() === payload.aisleCode.trim().toUpperCase());
  const aisleName = payload.aisleName?.trim() || aisleDef?.name || "General Supermarket Aisle";

  const cleanLocation: ProductLocation = {
    productId: payload.productId,
    storeId: payload.storeId || STORE_ID,
    aisleCode: payload.aisleCode.trim().toUpperCase(),
    aisleName,
    rackCode: payload.rackCode.trim().toUpperCase(),
    shelfCode: payload.shelfCode.trim().toUpperCase(),
    verificationStatus: payload.verificationStatus,
    updatedAt: new Date().toISOString(),
    notes: payload.notes?.trim() || undefined,
  };

  const currentLocations = getProductLocations();
  const existingIndex = currentLocations.findIndex((l) => l.productId === cleanLocation.productId);

  let updatedList: ProductLocation[];
  if (existingIndex >= 0) {
    updatedList = [...currentLocations];
    updatedList[existingIndex] = cleanLocation;
  } else {
    updatedList = [...currentLocations, cleanLocation];
  }

  saveProductLocations(updatedList);
  return { success: true, location: cleanLocation };
}

/**
 * Removes or resets location for a product to MISSING.
 */
export function removeProductLocation(productId: number): boolean {
  const currentLocations = getProductLocations();
  const filtered = currentLocations.filter((l) => l.productId !== productId);
  saveProductLocations(filtered);
  return true;
}

/**
 * Restores product locations to factory demonstration defaults.
 */
export function resetLocationsToDefaults(): ProductLocation[] {
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.removeItem(LOCATIONS_STORAGE_KEY);
  }
  return saveProductLocations([...INITIAL_PRODUCT_LOCATIONS]);
}
