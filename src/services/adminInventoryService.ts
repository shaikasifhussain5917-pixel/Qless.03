import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { LAUNCH_STORE_ID } from "../config/storeConfig";

export interface RawDbProductMeta {
  id: number;
  barcode: string;
  name: string;
  brand: string;
  category: string;
  unit_size: string;
  emoji: string | null;
  image_url?: string | null;
  description: string | null;
}

export interface RawDbStoreInventoryRow {
  id: string;
  store_id: string;
  product_id: number;
  price: number | string;
  mrp: number | string;
  stock_quantity: number;
  is_available: boolean;
  updated_at: string;
  products?: RawDbProductMeta | RawDbProductMeta[] | null;
}

export interface AdminInventoryItem {
  inventoryId: string;
  storeId: string;
  productId: number;
  barcode: string;
  name: string;
  brand: string;
  category: string;
  unitSize: string;
  emoji: string;
  imageUrl?: string | null;
  description: string | null;
  price: number;
  mrp: number;
  stockQuantity: number;
  isAvailable: boolean;
  updatedAt: string;
}

export interface FetchAdminInventoryResult {
  items: AdminInventoryItem[];
  error: string | null;
}

export interface InventoryMutationResult {
  success: boolean;
  item?: AdminInventoryItem;
  error?: string;
  conflict?: boolean;
}

/**
 * Maps raw joined store_inventory + products row to domain AdminInventoryItem.
 */
function mapRawToInventoryItem(raw: RawDbStoreInventoryRow): AdminInventoryItem {
  const meta: RawDbProductMeta | null = Array.isArray(raw.products)
    ? raw.products[0] || null
    : raw.products || null;

  return {
    inventoryId: raw.id,
    storeId: raw.store_id,
    productId: raw.product_id,
    barcode: meta?.barcode || "N/A",
    name: meta?.name || `Product #${raw.product_id}`,
    brand: meta?.brand || "Generic",
    category: meta?.category || "Uncategorized",
    unitSize: meta?.unit_size || "1 unit",
    emoji: meta?.emoji || "🛍️",
    imageUrl: meta?.image_url || null,
    description: meta?.description || null,
    price: Number(raw.price) || 0,
    mrp: Number(raw.mrp) || Number(raw.price) || 0,
    stockQuantity: Number(raw.stock_quantity) || 0,
    isAvailable: Boolean(raw.is_available),
    updatedAt: raw.updated_at,
  };
}

/**
 * Helper to get the store_inventory query builder.
 */
function getInventoryTable() {
  if (!supabase) return null;
  return (supabase.from("store_inventory") as any);
}

/**
 * Fetches authoritative store inventory joined with product metadata from Supabase.
 * Enforces store isolation and adheres to RLS "Staff read store inventory".
 */
export async function fetchAdminInventory(
  storeId: string = LAUNCH_STORE_ID
): Promise<FetchAdminInventoryResult> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      items: [],
      error: "Supabase connection is unconfigured. Live inventory requires an active database connection.",
    };
  }

  const table = getInventoryTable();
  if (!table) {
    return { items: [], error: "Supabase client unavailable." };
  }

  try {
    const { data, error } = await table
      .select(`
        id,
        store_id,
        product_id,
        price,
        mrp,
        stock_quantity,
        is_available,
        updated_at,
        products (
          id,
          barcode,
          name,
          brand,
          category,
          unit_size,
          emoji,
          description
        )
      `)
      .eq("store_id", storeId)
      .order("product_id", { ascending: true });

    if (error) {
      console.error("[QLess AdminInventory] Failed to query store_inventory:", error.message);
      return {
        items: [],
        error: error.message || "Failed to load store inventory from database.",
      };
    }

    if (!data) {
      return { items: [], error: null };
    }

    const mapped = (data as unknown as RawDbStoreInventoryRow[]).map(mapRawToInventoryItem);
    return { items: mapped, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unexpected error fetching store inventory.";
    console.error("[QLess AdminInventory] Unexpected exception:", msg);
    return { items: [], error: msg };
  }
}

/**
 * Adjusts stock by a delta (+/- quantity) using Optimistic Concurrency Control (OCC).
 * Validates that resulting stock will not be negative.
 * Checks updated_at to ensure no lost updates from concurrent customer checkouts.
 */
export async function adjustAdminStock(
  storeId: string,
  productId: number,
  delta: number,
  expectedUpdatedAt?: string
): Promise<InventoryMutationResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: "Database not connected." };
  }

  const table = getInventoryTable();
  if (!table) {
    return { success: false, error: "Database client unavailable." };
  }

  try {
    // 1. Fetch current authoritative row for this product to verify latest stock & version
    const { data: currentData, error: fetchErr } = await table
      .select("id, store_id, product_id, stock_quantity, updated_at")
      .eq("store_id", storeId)
      .eq("product_id", productId)
      .single();

    if (fetchErr || !currentData) {
      return {
        success: false,
        error: fetchErr?.message || `Inventory item for product #${productId} not found.`,
      };
    }

    const currentRecord = currentData as { stock_quantity: number; updated_at: string };

    // 2. Concurrency check: If expectedUpdatedAt was provided and differs, flag conflict
    if (expectedUpdatedAt && currentRecord.updated_at !== expectedUpdatedAt) {
      return {
        success: false,
        conflict: true,
        error: "Concurrent update detected: This item's stock was modified by another checkout or staff action. Please review latest stock.",
      };
    }

    const currentQty = Number(currentRecord.stock_quantity) || 0;
    const targetQty = currentQty + delta;

    if (targetQty < 0) {
      return {
        success: false,
        error: `Cannot reduce stock below 0. Current stock: ${currentQty}, attempted reduction: ${Math.abs(delta)}.`,
      };
    }

    // 3. Perform OCC update matching current version
    const newTimestamp = new Date().toISOString();
    const { data: updatedData, error: updateErr } = await table
      .update({
        stock_quantity: targetQty,
        updated_at: newTimestamp,
      })
      .eq("store_id", storeId)
      .eq("product_id", productId)
      .eq("updated_at", currentRecord.updated_at)
      .select(`
        id,
        store_id,
        product_id,
        price,
        mrp,
        stock_quantity,
        is_available,
        updated_at,
        products (
          id,
          barcode,
          name,
          brand,
          category,
          unit_size,
          emoji,
          description
        )
      `)
      .single();

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    if (!updatedData) {
      return {
        success: false,
        conflict: true,
        error: "Concurrent transaction conflict: Stock was modified simultaneously. Reloading current stock.",
      };
    }

    const item = mapRawToInventoryItem(updatedData as unknown as RawDbStoreInventoryRow);
    return { success: true, item };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to adjust stock.";
    return { success: false, error: msg };
  }
}

/**
 * Sets explicit manual stock quantity.
 * Validates non-negative integer.
 */
export async function setAdminStock(
  storeId: string,
  productId: number,
  newQuantity: number
): Promise<InventoryMutationResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: "Database not connected." };
  }

  if (isNaN(newQuantity) || newQuantity < 0) {
    return { success: false, error: "Stock quantity must be a non-negative number." };
  }

  const cleanQuantity = Math.floor(newQuantity);
  const table = getInventoryTable();
  if (!table) {
    return { success: false, error: "Database client unavailable." };
  }

  try {
    const newTimestamp = new Date().toISOString();
    const { data, error } = await table
      .update({
        stock_quantity: cleanQuantity,
        updated_at: newTimestamp,
      })
      .eq("store_id", storeId)
      .eq("product_id", productId)
      .select(`
        id,
        store_id,
        product_id,
        price,
        mrp,
        stock_quantity,
        is_available,
        updated_at,
        products (
          id,
          barcode,
          name,
          brand,
          category,
          unit_size,
          emoji,
          description
        )
      `)
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: false, error: "Record not found or update unauthorized." };
    }

    const item = mapRawToInventoryItem(data as unknown as RawDbStoreInventoryRow);
    return { success: true, item };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to set stock quantity.";
    return { success: false, error: msg };
  }
}

/**
 * Updates store-specific selling price and optional MRP in public.store_inventory.
 * NEVER modifies master public.products table.
 * Enforces price > 0 and mrp >= price.
 */
export async function updateAdminPrice(
  storeId: string,
  productId: number,
  newPrice: number,
  newMrp?: number
): Promise<InventoryMutationResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: "Database not connected." };
  }

  if (isNaN(newPrice) || newPrice <= 0) {
    return { success: false, error: "Price must be greater than zero." };
  }

  if (newMrp !== undefined && (isNaN(newMrp) || newMrp < newPrice)) {
    return { success: false, error: "MRP cannot be lower than the selling price." };
  }

  const table = getInventoryTable();
  if (!table) {
    return { success: false, error: "Database client unavailable." };
  }

  try {
    const updatePayload: { price: number; mrp?: number; updated_at: string } = {
      price: Number(newPrice.toFixed(2)),
      updated_at: new Date().toISOString(),
    };
    if (newMrp !== undefined) {
      updatePayload.mrp = Number(newMrp.toFixed(2));
    }

    const { data, error } = await table
      .update(updatePayload)
      .eq("store_id", storeId)
      .eq("product_id", productId)
      .select(`
        id,
        store_id,
        product_id,
        price,
        mrp,
        stock_quantity,
        is_available,
        updated_at,
        products (
          id,
          barcode,
          name,
          brand,
          category,
          unit_size,
          emoji,
          description
        )
      `)
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: false, error: "Record not found or update unauthorized." };
    }

    const item = mapRawToInventoryItem(data as unknown as RawDbStoreInventoryRow);
    return { success: true, item };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update price.";
    return { success: false, error: msg };
  }
}

/**
 * Toggles product availability in public.store_inventory.
 */
export async function setAdminAvailability(
  storeId: string,
  productId: number,
  isAvailable: boolean
): Promise<InventoryMutationResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: "Database not connected." };
  }

  const table = getInventoryTable();
  if (!table) {
    return { success: false, error: "Database client unavailable." };
  }

  try {
    const { data, error } = await table
      .update({
        is_available: isAvailable,
        updated_at: new Date().toISOString(),
      })
      .eq("store_id", storeId)
      .eq("product_id", productId)
      .select(`
        id,
        store_id,
        product_id,
        price,
        mrp,
        stock_quantity,
        is_available,
        updated_at,
        products (
          id,
          barcode,
          name,
          brand,
          category,
          unit_size,
          emoji,
          description
        )
      `)
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: false, error: "Record not found or update unauthorized." };
    }

    const item = mapRawToInventoryItem(data as unknown as RawDbStoreInventoryRow);
    return { success: true, item };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update availability.";
    return { success: false, error: msg };
  }
}
