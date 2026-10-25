import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { Product } from "../types";
import { LAUNCH_STORE_ID } from "../config/storeConfig";
import { getProductCatalog, saveProductCatalog } from "../utils/productStorage";
import type { Database } from "../types/database.types";

export type CustomerCatalogRow = Database["public"]["Views"]["customer_store_catalog"]["Row"];

export interface CatalogLoadResult {
  products: Product[];
  isLive: boolean;
  error?: string;
}

// In-memory cache & in-flight promise deduplication
let cachedCatalog: { storeId: string; products: Product[]; timestamp: number } | null = null;
let inflightRequest: { storeId: string; promise: Promise<CatalogLoadResult> } | null = null;

const CACHE_TTL_MS = 60 * 1000; // 1 minute in-memory TTL

/**
 * Maps a row from public.customer_store_catalog to the frontend Product model.
 *
 * Requirements:
 * - Map product_id to id.
 * - Map unit_size to unitSize.
 * - Map brand, name, barcode, category, price, mrp, emoji, description.
 * - in_stock is exposed as a boolean from the view. We intentionally do NOT query
 *   or expose exact store_inventory stock quantities to customers.
 */
export function mapCatalogRowToProduct(row: CustomerCatalogRow): Product {
  const price = Number(row.price);
  const mrp = row.mrp !== null && row.mrp !== undefined ? Number(row.mrp) : undefined;
  const inStock = Boolean(row.is_available && row.in_stock);

  let discountBadge: string | undefined = undefined;
  if (mrp !== undefined && mrp > price) {
    const savingsPercent = Math.round(((mrp - price) / mrp) * 100);
    if (savingsPercent > 0) {
      discountBadge = `${savingsPercent}% OFF`;
    }
  }

  return {
    id: row.product_id,
    name: row.name,
    brand: row.brand,
    category: row.category,
    unitSize: row.unit_size,
    barcode: row.barcode,
    price,
    mrp,
    emoji: row.emoji || "🛍️",
    imageUrl: row.image_url || undefined,
    description: row.description || undefined,
    discountBadge,
    isAvailable: inStock,
    // Do not reveal exact store inventory numbers to customer frontend
    stockQuantity: inStock ? undefined : 0,
  };
}

/**
 * Loads products from public.customer_store_catalog via Supabase.
 *
 * If Supabase is unconfigured, unreachable, or encounters an error,
 * this function gracefully falls back to the local demo catalog without crashing.
 */
export async function fetchStoreCatalog(
  storeId: string = LAUNCH_STORE_ID,
  forceRefresh: boolean = false
): Promise<CatalogLoadResult> {
  // 1. Check in-memory cache if not force refreshing
  const now = Date.now();
  if (
    !forceRefresh &&
    cachedCatalog &&
    cachedCatalog.storeId === storeId &&
    now - cachedCatalog.timestamp < CACHE_TTL_MS
  ) {
    return {
      products: cachedCatalog.products,
      isLive: true,
    };
  }

  // 2. Prevent duplicate concurrent requests for the same store
  if (!forceRefresh && inflightRequest && inflightRequest.storeId === storeId) {
    return inflightRequest.promise;
  }

  // 3. Check Supabase client configuration guard
  if (!isSupabaseConfigured || !supabase) {
    return {
      products: getProductCatalog(),
      isLive: false,
    };
  }

  // 4. Execute the live database query
  const queryPromise = (async (): Promise<CatalogLoadResult> => {
    try {
      let data: any = null;
      let error: any = null;

      // Attempt query including image_url
      const resWithImage = await supabase
        .from("customer_store_catalog")
        .select(
          "store_id, product_id, barcode, name, brand, category, unit_size, emoji, description, price, mrp, is_available, in_stock, image_url"
        )
        .eq("store_id", storeId);

      if (resWithImage.error && (resWithImage.error.code === "42703" || resWithImage.error.message?.includes("image_url"))) {
        // Fallback without image_url if migration is not yet applied
        const resWithout = await supabase
          .from("customer_store_catalog")
          .select(
            "store_id, product_id, barcode, name, brand, category, unit_size, emoji, description, price, mrp, is_available, in_stock"
          )
          .eq("store_id", storeId);
        data = resWithout.data;
        error = resWithout.error;
      } else {
        data = resWithImage.data;
        error = resWithImage.error;
      }

      if (error) {
        console.warn(
          "[QLess Catalog] Supabase customer_store_catalog query failed:",
          error.message
        );
        return {
          products: [],
          isLive: false,
          error: `Live inventory sync failed: ${error.message}`,
        };
      }

      if (!data || data.length === 0) {
        console.warn(
          `[QLess Catalog] No products returned for store '${storeId}'.`
        );
        return {
          products: [],
          isLive: false,
          error: `No products found for store ${storeId}.`,
        };
      }

      // 5. Map rows to frontend Product interface
      const mappedProducts = (data as CustomerCatalogRow[]).map(mapCatalogRowToProduct);

      // 6. Update cache and local storage sync
      cachedCatalog = {
        storeId,
        products: mappedProducts,
        timestamp: Date.now(),
      };
      saveProductCatalog(mappedProducts);

      return {
        products: mappedProducts,
        isLive: true,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error fetching catalog";
      console.warn("[QLess Catalog] Unexpected error while fetching catalog:", message);
      return {
        products: [],
        isLive: false,
        error: `Network error loading store inventory: ${message}`,
      };
    } finally {
      inflightRequest = null;
    }
  })();

  inflightRequest = { storeId, promise: queryPromise };
  return queryPromise;
}

/**
 * Synchronous helper to get currently cached or fallback products.
 */
export function getCurrentCatalogSnapshot(storeId: string = LAUNCH_STORE_ID): Product[] {
  if (cachedCatalog && cachedCatalog.storeId === storeId && cachedCatalog.products.length > 0) {
    return cachedCatalog.products;
  }
  return getProductCatalog();
}

export interface BarcodeLookupResult {
  status: "found_in_stock" | "found_out_of_stock" | "not_found" | "error";
  product?: Product;
  error?: string;
}

/**
 * Phase 3: Authoritative Barcode Lookup
 * Queries the live customer_store_catalog view in Supabase for STORE001.
 * Distinguishes between:
 * - found_in_stock: product exists and has active stock
 * - found_out_of_stock: product exists but has 0 stock or is unavailable
 * - not_found: barcode is not registered in this store
 * - error: network or Supabase database query failure
 */
export async function lookupProductByBarcodeLive(
  barcode: string,
  storeId: string = LAUNCH_STORE_ID
): Promise<BarcodeLookupResult> {
  const clean = barcode.trim().replace(/[\s-]/g, "");
  if (!clean) {
    return { status: "not_found", error: "Barcode cannot be empty" };
  }

  // 1. If Supabase is configured, execute live authoritative query
  if (isSupabaseConfigured && supabase) {
    try {
      let data: any = null;
      let error: any = null;

      const resWithImage = await supabase
        .from("customer_store_catalog")
        .select(
          "store_id, product_id, barcode, name, brand, category, unit_size, emoji, description, price, mrp, is_available, in_stock, image_url"
        )
        .eq("store_id", storeId)
        .eq("barcode", clean)
        .maybeSingle();

      if (resWithImage.error && (resWithImage.error.code === "42703" || resWithImage.error.message?.includes("image_url"))) {
        const resWithout = await supabase
          .from("customer_store_catalog")
          .select(
            "store_id, product_id, barcode, name, brand, category, unit_size, emoji, description, price, mrp, is_available, in_stock"
          )
          .eq("store_id", storeId)
          .eq("barcode", clean)
          .maybeSingle();
        data = resWithout.data;
        error = resWithout.error;
      } else {
        data = resWithImage.data;
        error = resWithImage.error;
      }

      if (error) {
        console.warn("[QLess Catalog] Barcode lookup query error:", error.message);
        return {
          status: "error",
          error: `Failed to query store inventory: ${error.message}`,
        };
      }

      if (!data) {
        return {
          status: "not_found",
          error: `Barcode ${clean} is not registered in this supermarket's catalog.`,
        };
      }

      const product = mapCatalogRowToProduct(data as CustomerCatalogRow);
      if (product.isAvailable) {
        return {
          status: "found_in_stock",
          product,
        };
      } else {
        return {
          status: "found_out_of_stock",
          product,
        };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error looking up barcode";
      return {
        status: "error",
        error: `Network error: ${msg}`,
      };
    }
  }

  // 2. Demo fallback ONLY when Supabase client is genuinely unconfigured
  const match = getProductCatalog().find((p) => p.barcode.replace(/[\s-]/g, "") === clean);
  if (!match) {
    return {
      status: "not_found",
      error: `Barcode ${clean} not found in offline catalog.`,
    };
  }

  return {
    status: match.isAvailable ? "found_in_stock" : "found_out_of_stock",
    product: match,
  };
}
