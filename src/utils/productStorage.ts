import type { Product } from "../types/index.ts";
import { MOCK_PRODUCTS } from "../data/mockCatalog.ts";

const CATALOG_STORAGE_KEY = "qless_catalog_v1";

/**
 * Default mock catalog enriched with initial demonstration stock levels (evaluated lazily to avoid circular module initialization).
 */
export function getInitialCatalogWithStock(): Product[] {
  return MOCK_PRODUCTS.map((prod) => {
    // Assign realistic stock levels, including intentional low-stock and out-of-stock items for demonstration
    let stock = 35;
    if (prod.id === 1) stock = 8; // Amul Milk: Low Stock (<= 10)
    else if (prod.id === 18) stock = 4; // Spinach: Low Stock (<= 10)
    else if (prod.id === 26) stock = 0; // Garlic Toast: Out of Stock (0)
    else if (prod.id === 12) stock = 50; // Parle-G: High Stock
    else if (prod.id === 8) stock = 42; // Maggi: High Stock
    else stock = 20 + ((prod.id * 7) % 30);

    return {
      ...prod,
      stockQuantity: prod.stockQuantity ?? stock,
      isAvailable: prod.isAvailable ?? (stock > 0),
    };
  });
}

/**
 * Safely loads the product catalog from localStorage with corruption resilience.
 */
export function getProductCatalog(): Product[] {
  const initial = getInitialCatalogWithStock();

  if (typeof window === "undefined" || !window.localStorage) {
    return initial;
  }

  try {
    const raw = window.localStorage.getItem(CATALOG_STORAGE_KEY);
    if (!raw) {
      // First run: save and return defaults
      window.localStorage.setItem(
        CATALOG_STORAGE_KEY,
        JSON.stringify(initial)
      );
      return initial;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      window.localStorage.setItem(
        CATALOG_STORAGE_KEY,
        JSON.stringify(initial)
      );
      return initial;
    }

    // Validate that loaded items have required product fields
    const validProducts = parsed.filter(
      (item): item is Product =>
        item &&
        typeof item === "object" &&
        typeof item.id === "number" &&
        typeof item.name === "string" &&
        item.name.trim().length > 0 &&
        typeof item.price === "number" &&
        item.price > 0 &&
        typeof item.barcode === "string" &&
        item.barcode.trim().length > 0 &&
        typeof item.category === "string"
    );

    if (validProducts.length === 0) {
      return initial;
    }

    // Ensure stockQuantity and isAvailable have sensible defaults
    return validProducts.map((p) => ({
      ...p,
      stockQuantity: typeof p.stockQuantity === "number" ? Math.max(0, p.stockQuantity) : 25,
      isAvailable: typeof p.isAvailable === "boolean" ? p.isAvailable : true,
    }));
  } catch (err) {
    console.warn("QLess: Unable to read catalog from localStorage, falling back to mock catalog:", err);
    return initial;
  }
}

/**
 * Saves the product catalog into localStorage.
 */
export function saveProductCatalog(products: Product[]): Product[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return products;
  }

  try {
    window.localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(products));
    return products;
  } catch (err) {
    console.warn("QLess: Failed to persist product catalog to localStorage:", err);
    return products;
  }
}

/**
 * Adds a new product to the catalog with defensive validation.
 */
export function addProduct(
  data: Omit<Product, "id"> & { id?: number }
): { success: boolean; product?: Product; error?: string } {
  const name = data.name?.trim();
  if (!name || name.length < 2) {
    return { success: false, error: "Product name must be at least 2 characters long." };
  }

  const barcode = data.barcode?.trim().replace(/[\s-]/g, "");
  if (!barcode || barcode.length < 4) {
    return { success: false, error: "A valid barcode with at least 4 digits is required." };
  }

  const price = Number(data.price);
  if (isNaN(price) || price <= 0) {
    return { success: false, error: "Selling price must be a positive number greater than 0." };
  }

  const mrp = data.mrp !== undefined && data.mrp !== null && !isNaN(Number(data.mrp)) ? Number(data.mrp) : undefined;
  if (mrp !== undefined && mrp < price) {
    return { success: false, error: "MRP cannot be lower than the selling price." };
  }

  const stockQuantity =
    data.stockQuantity !== undefined && !isNaN(Number(data.stockQuantity))
      ? Math.max(0, Math.floor(Number(data.stockQuantity)))
      : 25;

  const currentCatalog = getProductCatalog();

  // Validate duplicate barcode
  const isDuplicateBarcode = currentCatalog.some(
    (p) => p.barcode.replace(/[\s-]/g, "").toLowerCase() === barcode.toLowerCase()
  );
  if (isDuplicateBarcode) {
    return {
      success: false,
      error: `Barcode '${barcode}' already exists in the supermarket catalog. Barcodes must be unique.`,
    };
  }

  // Generate unique product ID
  const maxId = currentCatalog.reduce((max, p) => Math.max(max, p.id), 0);
  const newId = maxId + 1;

  const newProduct: Product = {
    id: newId,
    name,
    barcode,
    price,
    mrp: mrp || (mrp === undefined ? undefined : price),
    discountBadge: data.discountBadge?.trim() || (mrp && mrp > price ? `${Math.round(((mrp - price) / mrp) * 100)}% OFF` : undefined),
    unitSize: data.unitSize?.trim() || "1 unit",
    category: data.category?.trim() || "Household",
    emoji: data.emoji?.trim() || "🛍️",
    imageUrl: data.imageUrl?.trim() || undefined,
    imageSource: data.imageSource?.trim() || undefined,
    description: data.description?.trim() || `${name} (${data.unitSize || "Standard pack"})`,
    stockQuantity,
    isAvailable: data.isAvailable ?? (stockQuantity > 0),
  };

  const updatedCatalog = [newProduct, ...currentCatalog];
  saveProductCatalog(updatedCatalog);

  return { success: true, product: newProduct };
}

/**
 * Updates an existing product in the catalog with validation.
 */
export function updateProduct(
  id: number,
  updates: Partial<Product>
): { success: boolean; product?: Product; error?: string } {
  const currentCatalog = getProductCatalog();
  const existingIndex = currentCatalog.findIndex((p) => p.id === id);

  if (existingIndex === -1) {
    return { success: false, error: `Product with ID #${id} not found in catalog.` };
  }

  const current = currentCatalog[existingIndex];

  // If barcode is being updated, verify uniqueness against other products
  if (updates.barcode) {
    const cleanBarcode = updates.barcode.trim().replace(/[\s-]/g, "");
    if (!cleanBarcode || cleanBarcode.length < 4) {
      return { success: false, error: "A valid barcode with at least 4 digits is required." };
    }
    const isDuplicate = currentCatalog.some(
      (p) =>
        p.id !== id &&
        p.barcode.replace(/[\s-]/g, "").toLowerCase() === cleanBarcode.toLowerCase()
    );
    if (isDuplicate) {
      return {
        success: false,
        error: `Barcode '${cleanBarcode}' is already assigned to another product.`,
      };
    }
  }

  // Validate price
  if (updates.price !== undefined) {
    const price = Number(updates.price);
    if (isNaN(price) || price <= 0) {
      return { success: false, error: "Selling price must be a positive number greater than 0." };
    }
  }

  // Validate stock
  if (updates.stockQuantity !== undefined) {
    const stock = Number(updates.stockQuantity);
    if (isNaN(stock) || stock < 0) {
      return { success: false, error: "Stock quantity cannot be negative." };
    }
  }

  // Validate MRP vs Price
  const targetPrice = updates.price !== undefined ? Number(updates.price) : current.price;
  const targetMrp = updates.mrp !== undefined ? (updates.mrp ? Number(updates.mrp) : undefined) : current.mrp;
  if (targetMrp !== undefined && targetMrp < targetPrice) {
    return { success: false, error: "MRP cannot be lower than the selling price." };
  }

  const updatedProduct: Product = {
    ...current,
    ...updates,
    id, // protect ID from alteration
    name: updates.name?.trim() || current.name,
    barcode: updates.barcode?.trim().replace(/[\s-]/g, "") || current.barcode,
    price: targetPrice,
    mrp: targetMrp,
    stockQuantity: updates.stockQuantity !== undefined ? Math.max(0, Math.floor(Number(updates.stockQuantity))) : current.stockQuantity ?? 25,
    isAvailable: updates.isAvailable !== undefined ? updates.isAvailable : current.isAvailable ?? true,
  };

  currentCatalog[existingIndex] = updatedProduct;
  saveProductCatalog(currentCatalog);

  return { success: true, product: updatedProduct };
}

/**
 * Deletes a product from the catalog.
 */
export function deleteProduct(id: number): { success: boolean; error?: string } {
  const currentCatalog = getProductCatalog();
  const exists = currentCatalog.some((p) => p.id === id);

  if (!exists) {
    return { success: false, error: `Product with ID #${id} not found.` };
  }

  const updatedCatalog = currentCatalog.filter((p) => p.id !== id);
  saveProductCatalog(updatedCatalog);

  return { success: true };
}

/**
 * Adjusts inventory stock for a product by a positive or negative delta.
 */
export function adjustProductStock(
  id: number,
  delta: number
): { success: boolean; updatedStock?: number; error?: string } {
  const currentCatalog = getProductCatalog();
  const product = currentCatalog.find((p) => p.id === id);

  if (!product) {
    return { success: false, error: `Product with ID #${id} not found.` };
  }

  const currentStock = product.stockQuantity ?? 25;
  const newStock = Math.max(0, currentStock + delta);

  return updateProduct(id, { stockQuantity: newStock });
}

/**
 * Sets explicit inventory stock quantity for a product.
 */
export function setProductStock(
  id: number,
  quantity: number
): { success: boolean; updatedStock?: number; error?: string } {
  if (isNaN(quantity) || quantity < 0) {
    return { success: false, error: "Stock quantity cannot be negative." };
  }

  return updateProduct(id, { stockQuantity: Math.floor(quantity) });
}

/**
 * Resets the catalog back to initial demonstration defaults.
 */
export function resetCatalogToDefaults(): Product[] {
  return saveProductCatalog(getInitialCatalogWithStock());
}
