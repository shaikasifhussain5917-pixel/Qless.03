export interface StockErrorItem {
  productName: string;
  availableStock: number;
  requestedQuantity: number;
}

/**
 * Extracts structured stock error items from backend or client error strings.
 * Returns an array of StockErrorItem or null if the error is not stock-related.
 */
export function parseStockError(errorMsg: string | null | undefined): StockErrorItem[] | null {
  if (!errorMsg || typeof errorMsg !== "string") return null;

  const items: StockErrorItem[] = [];

  // Pattern 1: Authoritative backend RPC format with quotes around product name:
  // e.g. Insufficient stock for "Dr. Bimal's Arjuna Cardio Care Tea". Available: 0, requested: 85
  const rpcPattern = /insufficient stock for\s+"([^"]+)"\.?\s*available:\s*(\d+)[,\s]+requested:\s*(\d+)/gi;
  let match: RegExpExecArray | null;

  while ((match = rpcPattern.exec(errorMsg)) !== null) {
    items.push({
      productName: match[1].trim(),
      availableStock: parseInt(match[2], 10),
      requestedQuantity: parseInt(match[3], 10),
    });
  }

  if (items.length > 0) return items;

  // Pattern 1b: Unquoted product name in RPC format:
  // e.g. Insufficient stock for Dr. Bimal's Arjuna Cardio Care Tea. Available: 0, requested: 85
  const unquotedRpcPattern = /insufficient stock for\s+([^.\n]+?)\.?\s*available:\s*(\d+)[,\s]+requested:\s*(\d+)/gi;
  while ((match = unquotedRpcPattern.exec(errorMsg)) !== null) {
    items.push({
      productName: match[1].trim(),
      availableStock: parseInt(match[2], 10),
      requestedQuantity: parseInt(match[3], 10),
    });
  }

  if (items.length > 0) return items;

  // Pattern 2: "Product Name" is currently out of stock or unavailable
  const outOfStockPattern = /["']([^"']+)["']\s+is currently out of stock or unavailable/gi;
  while ((match = outOfStockPattern.exec(errorMsg)) !== null) {
    items.push({
      productName: match[1].trim(),
      availableStock: 0,
      requestedQuantity: 1,
    });
  }

  if (items.length > 0) return items;

  // Pattern 3: Requested quantity (X) for "..." exceeds available store stock (Y)
  const exceedsPattern = /requested quantity\s*\(?(\d+)\)?\s*for\s+["']([^"']+)["']\s*exceeds available store stock\s*\(?(\d+)\)?/gi;
  while ((match = exceedsPattern.exec(errorMsg)) !== null) {
    items.push({
      productName: match[2].trim(),
      availableStock: parseInt(match[3], 10),
      requestedQuantity: parseInt(match[1], 10),
    });
  }

  if (items.length > 0) return items;

  // Pattern 4: Generic fallback if "insufficient stock" or "out of stock" appears
  const lower = errorMsg.toLowerCase();
  if (
    lower.includes("insufficient stock") ||
    lower.includes("out of stock") ||
    lower.includes("stock limit")
  ) {
    const nameMatch = errorMsg.match(/["']([^"']+)["']/);
    const availMatch = errorMsg.match(/available\s*(?:stock)?[:\s]+(\d+)/i);
    const reqMatch = errorMsg.match(/requested\s*(?:quantity)?[:\s]+(\d+)/i);

    items.push({
      productName: nameMatch ? nameMatch[1].trim() : "Selected Item",
      availableStock: availMatch ? parseInt(availMatch[1], 10) : 0,
      requestedQuantity: reqMatch ? parseInt(reqMatch[1], 10) : 1,
    });
    return items;
  }

  return null;
}

