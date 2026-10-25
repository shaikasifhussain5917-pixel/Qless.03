import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { LAUNCH_STORE_ID } from "../config/storeConfig";
import { ProductLocation, StoreAisleDefinition, LocationVerificationStatus } from "../types";

export interface RawDbStoreAisle {
  id: string;
  store_id: string;
  code: string;
  name: string;
  category: string;
  racks: string[] | null;
  zone: string;
  description: string | null;
  walking_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RawDbProductLocation {
  id: string;
  store_id: string;
  product_id: number;
  aisle_code: string;
  aisle_name: string;
  rack_code: string;
  shelf_code: string;
  verification_status: string;
  notes: string | null;
  updated_at: string;
  created_at: string;
}

export interface FetchAislesResult {
  aisles: StoreAisleDefinition[];
  error: string | null;
}

export interface FetchLocationsResult {
  locations: ProductLocation[];
  error: string | null;
}

export interface UpsertLocationResult {
  success: boolean;
  location?: ProductLocation;
  error?: string;
}

/**
 * Helper to get the store_aisles query builder cleanly.
 */
function getAislesTable() {
  if (!supabase) return null;
  return (supabase.from("store_aisles") as any);
}

/**
 * Helper to get the product_locations query builder cleanly.
 */
function getLocationsTable() {
  if (!supabase) return null;
  return (supabase.from("product_locations") as any);
}

/**
 * Fetches active floor-plan aisles for the specified store from public.store_aisles.
 * Publicly readable under RLS "Public read active store aisles".
 */
export async function fetchLiveStoreAisles(
  storeId: string = LAUNCH_STORE_ID
): Promise<FetchAislesResult> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      aisles: [],
      error: "Supabase connection is not configured.",
    };
  }

  const table = getAislesTable();
  if (!table) {
    return { aisles: [], error: "Supabase client unavailable." };
  }

  try {
    const { data, error } = await table
      .select("id, store_id, code, name, category, racks, zone, description, walking_order, is_active, created_at, updated_at")
      .eq("store_id", storeId)
      .eq("is_active", true)
      .order("walking_order", { ascending: true });

    if (error) {
      console.error("[QLess SmartFind] Failed to query store_aisles:", error.message);
      return { aisles: [], error: error.message };
    }

    const mapped: StoreAisleDefinition[] = (data || []).map((row: RawDbStoreAisle) => ({
      code: row.code,
      name: row.name,
      category: row.category,
      racks: Array.isArray(row.racks) ? row.racks : [],
      zone: row.zone,
      description: row.description || "",
      order: row.walking_order,
    }));

    return { aisles: mapped, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unexpected error fetching store aisles.";
    console.error("[QLess SmartFind] Unexpected exception:", msg);
    return { aisles: [], error: msg };
  }
}

/**
 * Fetches authoritative product shelf/rack locations from public.product_locations.
 * Publicly readable under RLS "Shoppers and staff read product locations".
 */
export async function fetchLiveProductLocations(
  storeId: string = LAUNCH_STORE_ID
): Promise<FetchLocationsResult> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      locations: [],
      error: "Supabase connection is not configured.",
    };
  }

  const table = getLocationsTable();
  if (!table) {
    return { locations: [], error: "Supabase client unavailable." };
  }

  try {
    const { data, error } = await table
      .select("id, store_id, product_id, aisle_code, aisle_name, rack_code, shelf_code, verification_status, notes, updated_at, created_at")
      .eq("store_id", storeId);

    if (error) {
      console.error("[QLess SmartFind] Failed to query product_locations:", error.message);
      return { locations: [], error: error.message };
    }

    const mapped: ProductLocation[] = (data || []).map((row: RawDbProductLocation) => ({
      productId: row.product_id,
      storeId: row.store_id,
      aisleCode: row.aisle_code,
      aisleName: row.aisle_name,
      rackCode: row.rack_code,
      shelfCode: row.shelf_code,
      verificationStatus: (row.verification_status === "VERIFIED" || row.verification_status === "UNVERIFIED" || row.verification_status === "MISSING")
        ? row.verification_status
        : "UNVERIFIED",
      updatedAt: row.updated_at,
      notes: row.notes || undefined,
    }));

    return { locations: mapped, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unexpected error fetching product locations.";
    console.error("[QLess SmartFind] Unexpected exception:", msg);
    return { locations: [], error: msg };
  }
}

/**
 * Upserts a product location record in public.product_locations.
 * - Restricts to store_id.
 * - Atomically inserts or updates based on UNIQUE (store_id, product_id).
 * - Enforces RLS "Staff manage product locations" for STORE_ADMIN and CASHIER.
 * - Rejects unauthorized writes via database policies.
 */
export async function upsertLiveProductLocation(payload: {
  storeId: string;
  productId: number;
  aisleCode: string;
  aisleName: string;
  rackCode: string;
  shelfCode: string;
  verificationStatus: LocationVerificationStatus;
  notes?: string;
}): Promise<UpsertLocationResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: "Database not connected." };
  }

  const table = getLocationsTable();
  if (!table) {
    return { success: false, error: "Database client unavailable." };
  }

  // Defensive validation
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

  try {
    const nowIso = new Date().toISOString();
    const dbPayload = {
      store_id: payload.storeId,
      product_id: payload.productId,
      aisle_code: payload.aisleCode.trim().toUpperCase(),
      aisle_name: payload.aisleName.trim(),
      rack_code: payload.rackCode.trim().toUpperCase(),
      shelf_code: payload.shelfCode.trim().toUpperCase(),
      verification_status: payload.verificationStatus,
      notes: payload.notes?.trim() || null,
      updated_at: nowIso,
    };

    const { data, error } = await table
      .upsert(dbPayload, {
        onConflict: "store_id,product_id",
      })
      .select("id, store_id, product_id, aisle_code, aisle_name, rack_code, shelf_code, verification_status, notes, updated_at, created_at")
      .single();

    if (error) {
      console.error("[QLess SmartFind] Upsert location error:", error.message);
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: false, error: "Failed to persist location record to database." };
    }

    const row = data as RawDbProductLocation;
    const location: ProductLocation = {
      productId: row.product_id,
      storeId: row.store_id,
      aisleCode: row.aisle_code,
      aisleName: row.aisle_name,
      rackCode: row.rack_code,
      shelfCode: row.shelf_code,
      verificationStatus: (row.verification_status === "VERIFIED" || row.verification_status === "UNVERIFIED" || row.verification_status === "MISSING")
        ? row.verification_status
        : "UNVERIFIED",
      updatedAt: row.updated_at,
      notes: row.notes || undefined,
    };

    return { success: true, location };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unexpected error saving product location.";
    return { success: false, error: msg };
  }
}
