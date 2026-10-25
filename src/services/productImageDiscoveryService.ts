/**
 * QLess Smart Shopping - Product Image Discovery Service
 *
 * Automatically searches authorized online product catalogs by exact barcode.
 * Primary Provider: Open Food Facts (world.openfoodfacts.org)
 * Secondary Providers: Open Beauty Facts, Open Products Facts
 *
 * Rules:
 * - Search using exact scanned barcode first.
 * - Retrieve product name, brand, product size, description, image URL, and data source.
 * - Do NOT invent product details.
 * - Do NOT scrape Google search result pages or bypass website restrictions.
 * - Respect Open Food Facts API Terms of Service (compliant User-Agent header).
 * - Handle missing results, network errors, timeouts, and rate limits gracefully.
 * - Reject or flag mismatched barcodes as unverified suggestions.
 */

import { ProductCategory } from "../types";

export interface DiscoveredProduct {
  barcode: string;
  name: string;
  brand: string;
  unitSize: string;
  description: string | null;
  imageUrl: string | null;
  source: string;
  matchType: "EXACT_BARCODE" | "SUGGESTION" | "UNVERIFIED";
  confidence: "high" | "medium" | "low";
  suggestedCategory: ProductCategory;
  rawDetails?: {
    categories?: string;
    genericName?: string;
    ingredientsText?: string;
    providerCode?: string;
  };
}

export type DiscoveryStatus =
  | "SUCCESS"
  | "NOT_FOUND"
  | "MISMATCH"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "INVALID_BARCODE";

export interface ProductDiscoveryResult {
  success: boolean;
  status: DiscoveryStatus;
  barcode: string;
  product?: DiscoveredProduct;
  error?: string;
}

export interface DiscoveryOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  preferCategory?: ProductCategory;
}

const DEFAULT_TIMEOUT_MS = 8000;
const USER_AGENT = "QLessSmartShopping/1.0 (Store: STORE001; SmartStockImport; contact@qless.local)";

/**
 * Validates that an image URL is secure, syntactically sound, and comes from an allowed domain or protocol.
 */
export function validateImageUrl(url: string | null | undefined): { isValid: boolean; reason?: string } {
  if (!url || typeof url !== "string") {
    return { isValid: false, reason: "Image URL is empty." };
  }

  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return { isValid: false, reason: "Image URL is empty." };
  }

  // Reject dangerous protocols
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("file:") ||
    lower.startsWith("data:text/html")
  ) {
    return { isValid: false, reason: "Disallowed protocol in image URL." };
  }

  // Allow data URLs for uploaded base64 images (image/jpeg, image/png, image/webp)
  if (lower.startsWith("data:image/")) {
    const isAllowedData =
      lower.startsWith("data:image/jpeg") ||
      lower.startsWith("data:image/png") ||
      lower.startsWith("data:image/webp");
    return isAllowedData
      ? { isValid: true }
      : { isValid: false, reason: "Disallowed image MIME format in data URL." };
  }

  // Allow blob URLs created by URL.createObjectURL during admin upload
  if (lower.startsWith("blob:")) {
    return { isValid: true };
  }

  // Parse HTTP/HTTPS URL
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { isValid: false, reason: "Image URL must use HTTPS or HTTP." };
    }

    // SSRF Guard: block loopback and private IP ranges
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("169.254.") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".local")
    ) {
      return { isValid: false, reason: "Disallowed private or local host in image URL." };
    }

    return { isValid: true };
  } catch {
    return { isValid: false, reason: "Invalid URL format." };
  }
}

/**
 * Maps raw Open Food Facts categories into one of the supported QLess supermarket categories.
 */
export function inferCategoryFromTags(tags?: string[], name?: string): ProductCategory {
  const combined = `${(tags || []).join(" ")} ${name || ""}`.toLowerCase();

  if (
    combined.includes("dairy") ||
    combined.includes("milk") ||
    combined.includes("lait") ||
    combined.includes("cheese") ||
    combined.includes("yogurt") ||
    combined.includes("butter") ||
    combined.includes("fromage") ||
    combined.includes("paneer") ||
    combined.includes("ghee")
  ) {
    return "Dairy";
  }

  if (
    combined.includes("beverage") ||
    combined.includes("drink") ||
    combined.includes("boisson") ||
    combined.includes("juice") ||
    combined.includes("tea") ||
    combined.includes("coffee") ||
    combined.includes("soda") ||
    combined.includes("water") ||
    combined.includes("eau")
  ) {
    return "Beverages";
  }

  if (
    combined.includes("fruit") ||
    combined.includes("vegetable") ||
    combined.includes("pomme") ||
    combined.includes("salad") ||
    combined.includes("fresh produce") ||
    combined.includes("dates")
  ) {
    return "Fruits and Vegetables";
  }

  if (
    combined.includes("bread") ||
    combined.includes("bakery") ||
    combined.includes("boulangerie") ||
    combined.includes("toast") ||
    combined.includes("cake") ||
    combined.includes("pastry")
  ) {
    return "Bakery";
  }

  if (
    combined.includes("beauty") ||
    combined.includes("cosmetic") ||
    combined.includes("soap") ||
    combined.includes("shampoo") ||
    combined.includes("lotion") ||
    combined.includes("powder") ||
    combined.includes("hygiene") ||
    combined.includes("cream") ||
    combined.includes("toothpaste") ||
    combined.includes("oral care")
  ) {
    return "Personal Care";
  }

  if (
    combined.includes("cleaning") ||
    combined.includes("detergent") ||
    combined.includes("household") ||
    combined.includes("tissue") ||
    combined.includes("napkin") ||
    combined.includes("battery")
  ) {
    return "Household";
  }

  // Default grocery category
  return "Snacks";
}

/**
 * Searches Open Food Facts by exact barcode.
 */
async function queryOpenFoodFacts(
  barcode: string,
  signal: AbortSignal
): Promise<{ status: number; data?: any; errorStatus?: DiscoveryStatus; error?: string }> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      signal,
    });

    if (res.status === 429) {
      return {
        status: 429,
        errorStatus: "RATE_LIMITED",
        error: "Open Food Facts rate limit reached. Please wait a moment before trying again.",
      };
    }

    if (res.status === 404) {
      return { status: 404 };
    }

    if (!res.ok) {
      return {
        status: res.status,
        errorStatus: "NETWORK_ERROR",
        error: `Open Food Facts server responded with status ${res.status}.`,
      };
    }

    const data = await res.json();
    return { status: 200, data };
  } catch (err: unknown) {
    if (err && typeof err === "object" && (err as any).name === "AbortError") {
      return {
        status: 408,
        errorStatus: "TIMEOUT",
        error: "Product discovery timed out. Please verify internet connectivity or search again.",
      };
    }

    return {
      status: 500,
      errorStatus: "NETWORK_ERROR",
      error: err instanceof Error ? err.message : "Network error contacting Open Food Facts.",
    };
  }
}

/**
 * Searches Open Beauty Facts as a secondary provider for cosmetics / personal care barcodes.
 */
async function queryOpenBeautyFacts(
  barcode: string,
  signal: AbortSignal
): Promise<{ status: number; data?: any }> {
  const url = `https://world.openbeautyfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      signal,
    });

    if (!res.ok) return { status: res.status };
    const data = await res.json();
    return { status: 200, data };
  } catch {
    return { status: 500 };
  }
}

/**
 * Searches Open Products Facts as a tertiary provider for household / general retail goods.
 */
async function queryOpenProductsFacts(
  barcode: string,
  signal: AbortSignal
): Promise<{ status: number; data?: any }> {
  const url = `https://world.openproductsfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      signal,
    });

    if (!res.ok) return { status: res.status };
    const data = await res.json();
    return { status: 200, data };
  } catch {
    return { status: 500 };
  }
}

/**
 * Primary Product Image Discovery function:
 * 1. Cleans and validates barcode.
 * 2. Queries Open Food Facts, Open Beauty Facts, and Open Products Facts.
 * 3. Enforces exact barcode matching rules.
 * 4. Extracts product name, brand, size, description, verified image URL, and source.
 * 5. Handles timeouts, errors, and rate limits gracefully.
 */
export async function discoverProductByBarcode(
  barcode: string,
  options: DiscoveryOptions = {}
): Promise<ProductDiscoveryResult> {
  const cleanBarcode = barcode?.trim();
  if (!cleanBarcode || cleanBarcode.length < 4) {
    return {
      success: false,
      status: "INVALID_BARCODE",
      barcode: barcode || "",
      error: "Please enter or scan a valid physical product barcode (at least 4 characters).",
    };
  }

  // Configure timeout controller
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Link caller signal if provided
  if (options.signal) {
    options.signal.addEventListener("abort", () => controller.abort());
  }

  try {
    // 1. Primary Lookup: Open Food Facts
    let result = await queryOpenFoodFacts(cleanBarcode, controller.signal);

    let providerSource = "Open Food Facts (world.openfoodfacts.org)";
    let productData = result.data?.product;

    if (result.errorStatus && result.errorStatus !== "NOT_FOUND") {
      // Hard network error, timeout, or rate limit
      return {
        success: false,
        status: result.errorStatus,
        barcode: cleanBarcode,
        error: result.error,
      };
    }

    // 2. Secondary Lookup: Open Beauty Facts (if not found in food facts)
    if (!productData || result.data?.status === 0) {
      const obfResult = await queryOpenBeautyFacts(cleanBarcode, controller.signal);
      if (obfResult.status === 200 && obfResult.data?.status === 1 && obfResult.data.product) {
        productData = obfResult.data.product;
        providerSource = "Open Beauty Facts (world.openbeautyfacts.org)";
      }
    }

    // 3. Tertiary Lookup: Open Products Facts (if still not found)
    if (!productData) {
      const opfResult = await queryOpenProductsFacts(cleanBarcode, controller.signal);
      if (opfResult.status === 200 && opfResult.data?.status === 1 && opfResult.data.product) {
        productData = opfResult.data.product;
        providerSource = "Open Products Facts (world.openproductsfacts.org)";
      }
    }

    // 4. Missing result check
    if (!productData) {
      return {
        success: false,
        status: "NOT_FOUND",
        barcode: cleanBarcode,
        error: `No online product catalog record found for barcode '${cleanBarcode}'. You can search again, enter details manually, or upload a photo.`,
      };
    }

    // 5. Barcode match verification (Security Rule: Prefer exact barcode matches)
    const returnedCode = String(productData.code || productData._id || "").trim();
    const isExactMatch = returnedCode === cleanBarcode;

    // 6. Extract product properties without hallucination
    const rawName =
      productData.product_name ||
      productData.product_name_en ||
      productData.generic_name ||
      "";
    const name = String(rawName).trim();

    if (!name) {
      return {
        success: false,
        status: "NOT_FOUND",
        barcode: cleanBarcode,
        error: `An entry for barcode '${cleanBarcode}' was found, but it lacks an authoritative product name.`,
      };
    }

    const brand = String(
      productData.brands ||
      productData.brand_owner ||
      productData.brands_tags?.[0] ||
      "Generic"
    ).trim();

    const unitSize = String(
      productData.quantity ||
      productData.serving_size ||
      (productData.net_weight_value ? `${productData.net_weight_value} ${productData.net_weight_unit || "g"}` : "") ||
      "1 unit"
    ).trim();

    const description =
      productData.generic_name?.trim() ||
      productData.ingredients_text?.slice(0, 300)?.trim() ||
      null;

    // Extract image candidates
    const candidateImageUrl =
      productData.image_front_url ||
      productData.image_url ||
      productData.image_front_small_url ||
      productData.selected_images?.front?.display?.en ||
      productData.selected_images?.front?.display?.all ||
      null;

    const validatedImage = candidateImageUrl && validateImageUrl(candidateImageUrl).isValid
      ? candidateImageUrl
      : null;

    // Category suggestion
    const categoryTags = Array.isArray(productData.categories_tags)
      ? productData.categories_tags
      : typeof productData.categories === "string"
      ? productData.categories.split(",")
      : [];
    const suggestedCategory = inferCategoryFromTags(categoryTags, name);

    const discoveredProduct: DiscoveredProduct = {
      barcode: cleanBarcode,
      name,
      brand,
      unitSize,
      description,
      imageUrl: validatedImage,
      source: providerSource,
      matchType: isExactMatch ? "EXACT_BARCODE" : "UNVERIFIED",
      confidence: isExactMatch ? "high" : "low",
      suggestedCategory,
      rawDetails: {
        categories: productData.categories,
        genericName: productData.generic_name,
        ingredientsText: productData.ingredients_text,
        providerCode: returnedCode,
      },
    };

    return {
      success: true,
      status: "SUCCESS",
      barcode: cleanBarcode,
      product: discoveredProduct,
    };
  } catch (err: unknown) {
    const isTimeout = err && typeof err === "object" && (err as any).name === "AbortError";
    return {
      success: false,
      status: isTimeout ? "TIMEOUT" : "NETWORK_ERROR",
      barcode: cleanBarcode,
      error: isTimeout
        ? "Online discovery request timed out after 8 seconds. Please check network connection."
        : err instanceof Error
        ? err.message
        : "Failed to connect to online product discovery services.",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
