import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { Product } from "../types";
import { LAUNCH_STORE_ID } from "../config/storeConfig";
import { getProductCatalog } from "../utils/productStorage";

export type BarcodeLookupStatus = "STORE_ITEM" | "MASTER_ONLY" | "UNKNOWN_BARCODE";

export interface StoreItemLookupResult {
  status: "STORE_ITEM";
  product: {
    id: number;
    barcode: string;
    name: string;
    brand: string;
    category: string;
    unitSize: string;
    emoji: string;
    description: string | null;
    imageUrl?: string | null;
  };
  inventory: {
    price: number;
    mrp: number;
    currentStock: number;
    isAvailable: boolean;
    updatedAt: string;
  };
}

export interface MasterOnlyLookupResult {
  status: "MASTER_ONLY";
  product: {
    id: number;
    barcode: string;
    name: string;
    brand: string;
    category: string;
    unitSize: string;
    emoji: string;
    description: string | null;
    imageUrl?: string | null;
  };
}

export interface UnknownBarcodeLookupResult {
  status: "UNKNOWN_BARCODE";
  barcode: string;
}

export type BarcodeLookupResult =
  | StoreItemLookupResult
  | MasterOnlyLookupResult
  | UnknownBarcodeLookupResult;

export interface BatchReceivingItem {
  id: string; // unique row id in the client batch
  productId: number;
  barcode: string;
  name: string;
  brand: string;
  category: string;
  unitSize: string;
  emoji: string;
  imageUrl?: string | null;
  imageSource?: string;
  currentStock: number;
  quantityReceived: number;
  projectedStock: number;
  price: number;
  mrp: number;
  status: "EXISTING_ITEM" | "NEW_REGISTRATION" | "STORE_ASSOCIATION";
  expectedUpdatedAt?: string;
  location?: {
    aisleCode: string;
    rackCode: string;
    shelfCode: string;
  };
}

export interface BatchSubmitResult {
  success: boolean;
  batchReference?: string;
  processedCount?: number;
  error?: string;
  items?: Array<{
    productId: number;
    barcode: string;
    name: string;
    previousStock: number;
    quantityReceived: number;
    newStock: number;
  }>;
}

export interface NewProductRegistrationData {
  barcode: string;
  name: string;
  brand: string;
  category: string;
  unitSize: string;
  price: number;
  mrp: number;
  quantity: number;
  emoji?: string;
  description?: string;
  imageUrl?: string | null;
  imageSource?: string;
  aisleCode?: string;
  rackCode?: string;
  shelfCode?: string;
}

/**
 * Looks up a product by exact barcode:
 * 1. Checks if it is already stocked at storeId (STORE_ITEM)
 * 2. If not, checks if it exists in the master products catalog (MASTER_ONLY)
 * 3. If not found in either, returns UNKNOWN_BARCODE
 */
export async function lookupProductByBarcode(
  barcode: string,
  storeId: string = LAUNCH_STORE_ID
): Promise<BarcodeLookupResult> {
  const cleanBarcode = barcode.trim();
  if (!cleanBarcode) {
    return { status: "UNKNOWN_BARCODE", barcode: "" };
  }

  // Live Supabase lookup
  if (isSupabaseConfigured && supabase) {
    try {
      // Step 1: Check store_inventory for this store
      let invData: any = null;
      let invErr: any = null;

      // Try selecting with image_url
      const resWithImage = await (supabase.from("store_inventory") as any)
        .select(`
          id,
          store_id,
          product_id,
          price,
          mrp,
          stock_quantity,
          is_available,
          updated_at,
          products!inner (
            id,
            barcode,
            name,
            brand,
            category,
            unit_size,
            emoji,
            description,
            image_url
          )
        `)
        .eq("store_id", storeId)
        .eq("products.barcode", cleanBarcode)
        .maybeSingle();

      if (resWithImage.error && (resWithImage.error.code === "42703" || resWithImage.error.message?.includes("image_url"))) {
        // Fallback without image_url if migration is not yet applied
        const resWithout = await (supabase.from("store_inventory") as any)
          .select(`
            id,
            store_id,
            product_id,
            price,
            mrp,
            stock_quantity,
            is_available,
            updated_at,
            products!inner (
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
          .eq("products.barcode", cleanBarcode)
          .maybeSingle();
        invData = resWithout.data;
        invErr = resWithout.error;
      } else {
        invData = resWithImage.data;
        invErr = resWithImage.error;
      }

      if (!invErr && invData && invData.products) {
        const p = Array.isArray(invData.products) ? invData.products[0] : invData.products;
        return {
          status: "STORE_ITEM",
          product: {
            id: p.id,
            barcode: p.barcode,
            name: p.name,
            brand: p.brand || "Generic",
            category: p.category || "General",
            unitSize: p.unit_size || "1 unit",
            emoji: p.emoji || "🛍️",
            description: p.description || null,
            imageUrl: p.image_url || null,
          },
          inventory: {
            price: Number(invData.price) || 0,
            mrp: Number(invData.mrp) || Number(invData.price) || 0,
            currentStock: Number(invData.stock_quantity) || 0,
            isAvailable: Boolean(invData.is_available),
            updatedAt: invData.updated_at,
          },
        };
      }

      // Step 2: Check master products catalog
      let masterData: any = null;
      let masterErr: any = null;

      const masterWithImage = await (supabase.from("products") as any)
        .select("id, barcode, name, brand, category, unit_size, emoji, description, image_url")
        .eq("barcode", cleanBarcode)
        .maybeSingle();

      if (masterWithImage.error && (masterWithImage.error.code === "42703" || masterWithImage.error.message?.includes("image_url"))) {
        const masterWithout = await (supabase.from("products") as any)
          .select("id, barcode, name, brand, category, unit_size, emoji, description")
          .eq("barcode", cleanBarcode)
          .maybeSingle();
        masterData = masterWithout.data;
        masterErr = masterWithout.error;
      } else {
        masterData = masterWithImage.data;
        masterErr = masterWithImage.error;
      }

      if (!masterErr && masterData) {
        return {
          status: "MASTER_ONLY",
          product: {
            id: masterData.id,
            barcode: masterData.barcode,
            name: masterData.name,
            brand: masterData.brand || "Generic",
            category: masterData.category || "General",
            unitSize: masterData.unit_size || "1 unit",
            emoji: masterData.emoji || "🛍️",
            description: masterData.description || null,
            imageUrl: masterData.image_url || null,
          },
        };
      }

      return { status: "UNKNOWN_BARCODE", barcode: cleanBarcode };
    } catch (err: unknown) {
      console.warn("[QLess StockImport] Live lookup failed, falling back to local catalog:", err);
    }
  }

  // Local / Offline Fallback Lookup
  const localCatalog = getProductCatalog();
  const matched = localCatalog.find((p) => p.barcode === cleanBarcode);

  if (matched) {
    return {
      status: "STORE_ITEM",
      product: {
        id: matched.id,
        barcode: matched.barcode,
        name: matched.name,
        brand: matched.brand || "Generic",
        category: matched.category || "General",
        unitSize: matched.unitSize || "1 unit",
        emoji: matched.emoji || "🛍️",
        description: matched.description || null,
        imageUrl: matched.imageUrl || null,
      },
      inventory: {
        price: matched.price,
        mrp: matched.mrp || matched.price,
        currentStock: matched.stockQuantity ?? 25,
        isAvailable: matched.isAvailable ?? true,
        updatedAt: new Date().toISOString(),
      },
    };
  }

  return { status: "UNKNOWN_BARCODE", barcode: cleanBarcode };
}

/**
/**
 * Submits a batch of products to receive stock atomically via public.admin_batch_receive_stock.
 *
 * Strict Zero-False-Success Policy:
 * - Requires an authenticated STORE_ADMIN session.
 * - Dispatches authoritative public.admin_batch_receive_stock RPC.
 * - NEVER falls back to localStorage or mock datasets.
 * - NEVER falls back to individual non-atomic updates if the batch RPC is missing.
 * - If the RPC is missing or fails, reports the exact error so staff can apply the migration.
 */
export async function submitBatchReceiveStock(
  storeId: string,
  items: BatchReceivingItem[],
  idempotencyKey: string,
  notes?: string
): Promise<BatchSubmitResult> {
  if (!items || items.length === 0) {
    return { success: false, error: "Receiving batch is empty." };
  }

  for (const it of items) {
    if (it.quantityReceived <= 0 || !Number.isInteger(it.quantityReceived)) {
      return {
        success: false,
        error: `Quantity received for "${it.name}" must be a positive whole number.`,
      };
    }
  }

  if (!isSupabaseConfigured || !supabase) {
    return {
      success: false,
      error: "Database connection unconfigured: Live inventory intake requires an active Supabase connection. Local demo writes are disabled.",
    };
  }

  try {
    const rpcPayload = items.map((it) => ({
      productId: it.productId,
      quantity: it.quantityReceived,
    }));

    const { data, error } = await (supabase.rpc as any)("admin_batch_receive_stock", {
      p_store_id: storeId,
      p_items: rpcPayload,
      p_idempotency_key: idempotencyKey,
      p_notes: notes || `Batch stock intake: ${items.length} SKUs received via Smart Stock Import`,
    });

    if (error) {
      if (
        error.code === "PGRST202" ||
        error.code === "404" ||
        (error as any).status === 404 ||
        error.message?.includes("404") ||
        error.message?.includes("function") ||
        error.message?.includes("does not exist") ||
        error.message?.includes("schema cache")
      ) {
        return {
          success: false,
          error: "Database migration required: The atomic batch receiving function 'public.admin_batch_receive_stock' is not installed in Supabase. Please apply migration 'supabase/migrations/20261018000000_smart_stock_import.sql' in the Supabase SQL Editor before receiving stock.",
        };
      }
      return { success: false, error: error.message || "Server error while processing batch stock intake." };
    }

    if (data && data.success) {
      return {
        success: true,
        batchReference: data.batchReference || idempotencyKey,
        processedCount: data.processedCount || items.length,
        items: data.items,
      };
    }

    return {
      success: false,
      error: data?.error || "Unknown server response during batch stock intake.",
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network error: Failed to execute stock intake.";
    return { success: false, error: msg };
  }
}

/**
 * Registers a new product and sets its initial stock atomically via public.admin_register_and_receive_product.
 *
 * Strict Zero-False-Success Policy:
 * - Requires an authenticated STORE_ADMIN session.
 * - Dispatches authoritative public.admin_register_and_receive_product RPC.
 * - NEVER falls back to localStorage.
 * - If the RPC is missing, returns a clear migration requirement error.
 */
export async function registerAndReceiveProduct(
  storeId: string,
  data: NewProductRegistrationData,
  idempotencyKey: string
): Promise<{ success: boolean; product?: Partial<Product>; error?: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      success: false,
      error: "Database connection unconfigured: Product registration requires an active Supabase connection. Local demo writes are disabled.",
    };
  }

  try {
    const basePayload: Record<string, any> = {
      p_store_id: storeId,
      p_barcode: data.barcode,
      p_name: data.name,
      p_brand: data.brand,
      p_category: data.category,
      p_unit_size: data.unitSize,
      p_price: data.price,
      p_mrp: data.mrp,
      p_quantity: data.quantity,
      p_emoji: data.emoji || "🛍️",
      p_description: data.description || null,
      p_aisle_code: data.aisleCode || null,
      p_rack_code: data.rackCode || null,
      p_shelf_code: data.shelfCode || null,
      p_idempotency_key: idempotencyKey,
    };

    let res: any = null;
    let error: any = null;

    if (data.imageUrl) {
      // Try with image parameters first
      const fullPayload = {
        ...basePayload,
        p_image_url: data.imageUrl,
        p_image_source: data.imageSource || "Discovered Online",
      };
      const attempt = await (supabase.rpc as any)("admin_register_and_receive_product", fullPayload);

      // If function signature did not match because migration has not been applied to remote yet
      if (attempt.error && (attempt.error.code === "PGRST202" || attempt.error.message?.includes("parameter") || attempt.error.message?.includes("p_image_url"))) {
        const fallback = await (supabase.rpc as any)("admin_register_and_receive_product", basePayload);
        res = fallback.data;
        error = fallback.error;
      } else {
        res = attempt.data;
        error = attempt.error;
      }
    } else {
      const call = await (supabase.rpc as any)("admin_register_and_receive_product", basePayload);
      res = call.data;
      error = call.error;
    }

    if (error) {
      if (
        error.code === "PGRST202" ||
        error.code === "404" ||
        (error as any).status === 404 ||
        error.message?.includes("404") ||
        error.message?.includes("function") ||
        error.message?.includes("does not exist") ||
        error.message?.includes("schema cache")
      ) {
        return {
          success: false,
          error: "Database migration required: The registration function 'public.admin_register_and_receive_product' is not installed in Supabase. Please apply migration 'supabase/migrations/20261018000000_smart_stock_import.sql' in the Supabase SQL Editor before registering products.",
        };
      }
      return { success: false, error: error.message || "Failed to register product in database." };
    }

    if (res && res.success) {
      return {
        success: true,
        product: {
          id: res.productId,
          barcode: res.barcode,
          name: res.name,
          price: res.price,
          mrp: res.mrp,
          stockQuantity: res.stockQuantity,
          imageUrl: res.imageUrl || data.imageUrl || undefined,
        },
      };
    }

    return {
      success: false,
      error: res?.error || "Unknown server response during product registration.",
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network error: Failed to register product.";
    return { success: false, error: msg };
  }
}

/**
 * Associates an existing master catalog product with STORE001 and receives initial stock
 * atomically via public.admin_associate_and_receive_product.
 *
 * Strict Zero-False-Success Policy:
 * - Requires an authenticated STORE_ADMIN session.
 * - Dispatches authoritative public.admin_associate_and_receive_product RPC.
 * - NEVER falls back to localStorage.
 * - If the RPC is missing, returns a clear migration requirement error.
 */
export async function associateAndReceiveProduct(
  storeId: string,
  data: {
    productId: number;
    price: number;
    mrp: number;
    quantity: number;
    aisleCode?: string;
    rackCode?: string;
    shelfCode?: string;
  },
  idempotencyKey: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      success: false,
      error: "Database connection unconfigured: Store product association requires an active Supabase connection. Local demo writes are disabled.",
    };
  }

  try {
    const { data: res, error } = await (supabase.rpc as any)("admin_associate_and_receive_product", {
      p_store_id: storeId,
      p_product_id: data.productId,
      p_price: data.price,
      p_mrp: data.mrp,
      p_quantity: data.quantity,
      p_aisle_code: data.aisleCode || null,
      p_rack_code: data.rackCode || null,
      p_shelf_code: data.shelfCode || null,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      if (
        error.code === "PGRST202" ||
        error.code === "404" ||
        (error as any).status === 404 ||
        error.message?.includes("404") ||
        error.message?.includes("function") ||
        error.message?.includes("does not exist") ||
        error.message?.includes("schema cache")
      ) {
        return {
          success: false,
          error: "Database migration required: The association function 'public.admin_associate_and_receive_product' is not installed in Supabase. Please apply migration 'supabase/migrations/20261018000000_smart_stock_import.sql' in the Supabase SQL Editor before associating products.",
        };
      }
      return { success: false, error: error.message || "Failed to associate product with store." };
    }

    if (res && res.success) {
      return { success: true };
    }

    return {
      success: false,
      error: res?.error || "Unknown server response during product association.",
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network error: Failed to associate product with store.";
    return { success: false, error: msg };
  }
}

