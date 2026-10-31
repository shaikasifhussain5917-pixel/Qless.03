import type { CartItem, Coupon, Product } from "../types/index.ts";
import { MOCK_PRODUCTS } from "../data/mockCatalog.ts";
import { getProductCatalog } from "./productStorage.ts";

export const AVAILABLE_COUPONS: Coupon[] = [
  {
    code: "SAVE10",
    description: "10% OFF on all eligible merchandise",
    discountType: "percentage",
    discountValue: 10,
  },
  {
    code: "QLIVE50",
    description: "₹50 flat OFF on minimum order of ₹500",
    discountType: "fixed",
    discountValue: 50,
    minSubtotal: 500,
  },
];

export interface BillSummary {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  totalMrp: number;
  mrpSavings: number;
  couponDiscount: number;
  appliedCoupon: Coupon | null;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  taxTotal: number;
  finalTotal: number;
}

/**
 * Enriches cart items with metadata (unit size, mrp, emoji, latest catalog price) from stored catalog.
 * Catalog price updates made by administrators are reflected in active carts.
 */
export function enrichCartItems(items: CartItem[], catalogOverride?: Product[]): CartItem[] {
  const catalog = catalogOverride && catalogOverride.length > 0 ? catalogOverride : getProductCatalog();
  return items.map((item) => {
    const catalogItem = catalog.find((p) => p.id === item.id) || MOCK_PRODUCTS.find((p) => p.id === item.id);
    const validPrice = catalogItem && catalogItem.price > 0 ? catalogItem.price : item.price;
    const sanitizedQty = Math.max(1, Math.floor(Number(item.quantity) || 1));
    return {
      ...item,
      price: validPrice,
      quantity: sanitizedQty,
      unitSize: item.unitSize || catalogItem?.unitSize,
      mrp: catalogItem?.mrp || item.mrp || validPrice,
      emoji: item.emoji || catalogItem?.emoji || "🛍️",
      category: item.category || catalogItem?.category,
      brand: item.brand || catalogItem?.brand,
    };
  });
}

/**
 * Validates a coupon code against current subtotal
 */
export function validateCoupon(
  rawCode: string,
  subtotal: number,
  currentCoupon: Coupon | null
): { valid: boolean; coupon?: Coupon; error?: string } {
  const code = rawCode.trim().toUpperCase();

  if (!code) {
    return { valid: false, error: "Please enter a coupon code." };
  }

  if (currentCoupon && currentCoupon.code === code) {
    return { valid: false, error: `Coupon ${code} is already applied.` };
  }

  const found = AVAILABLE_COUPONS.find((c) => c.code === code);
  if (!found) {
    return {
      valid: false,
      error: `Invalid coupon code "${rawCode}". Try using SAVE10 or QLIVE50.`,
    };
  }

  if (found.minSubtotal && subtotal < found.minSubtotal) {
    const difference = found.minSubtotal - subtotal;
    return {
      valid: false,
      error: `Coupon ${found.code} requires a minimum subtotal of ₹${found.minSubtotal}. Add ₹${difference} more to unlock.`,
    };
  }

  return { valid: true, coupon: found };
}

/**
 * Calculates accurate bill summary with mock demonstration GST rates (5% = 2.5% CGST + 2.5% SGST)
 * Ensures:
 * 1. Subtotal matches cart line prices
 * 2. Discounts are deducted once
 * 3. Tax is computed on net taxable merchandise
 * 4. Total cannot become negative
 */
export function calculateBill(rawItems: CartItem[], coupon: Coupon | null): BillSummary {
  const items = enrichCartItems(rawItems);
  let subtotal = 0;
  let totalMrp = 0;
  let itemCount = 0;

  for (const item of items) {
    const linePrice = item.price * item.quantity;
    const lineMrp = (item.mrp && item.mrp > item.price ? item.mrp : item.price) * item.quantity;
    subtotal += linePrice;
    totalMrp += lineMrp;
    itemCount += item.quantity;
  }

  const mrpSavings = Math.max(0, totalMrp - subtotal);

  // Validate coupon applicability against current subtotal
  let validCoupon = coupon;
  let couponDiscount = 0;

  if (coupon) {
    if (coupon.minSubtotal && subtotal < coupon.minSubtotal) {
      // Minimum spend requirement is no longer met (e.g. if item quantity was reduced)
      validCoupon = null;
      couponDiscount = 0;
    } else if (coupon.code === "SAVE10") {
      couponDiscount = Math.round(subtotal * 0.1);
    } else if (coupon.code === "QLIVE50") {
      couponDiscount = 50;
    } else if (coupon.discountType === "percentage") {
      couponDiscount = Math.round(subtotal * (coupon.discountValue / 100));
    } else if (coupon.discountType === "fixed") {
      couponDiscount = coupon.discountValue;
    }
  }

  // Cap discount to subtotal
  couponDiscount = Math.min(couponDiscount, subtotal);

  // Net payable merchandise
  const taxableAmount = Math.max(0, subtotal - couponDiscount);

  // Zero GST policy: Prices are all-inclusive; no added GST tax surcharge
  const cgst = 0;
  const sgst = 0;
  const taxTotal = 0;

  // Final payable total equals net merchandise total
  const finalTotal = taxableAmount;

  return {
    items,
    itemCount,
    subtotal,
    totalMrp,
    mrpSavings,
    couponDiscount,
    appliedCoupon: validCoupon,
    taxableAmount,
    cgst,
    sgst,
    taxTotal,
    finalTotal,
  };
}

/**
 * Validates cart contents prior to checkout.
 * Cross-checks with active catalog for stock availability, non-zero pricing, and positive integer quantities.
 * NOTE: This is client-side demonstration validation for frontend integrity.
 */
export function validateCartForCheckout(
  rawItems: CartItem[],
  appliedCoupon: Coupon | null
): { isValid: boolean; bill: BillSummary; errors: string[] } {
  const errors: string[] = [];

  if (!rawItems || rawItems.length === 0) {
    errors.push("Your shopping cart is empty. Please add at least one item to proceed to checkout.");
    return {
      isValid: false,
      bill: calculateBill([], null),
      errors,
    };
  }

  const catalog = getProductCatalog();
  const sanitizedItems: CartItem[] = [];

  for (const item of rawItems) {
    // 1. Verify item existence in catalog
    const catalogItem = catalog.find((p) => p.id === item.id) || MOCK_PRODUCTS.find((p) => p.id === item.id);

    // 2. Validate availability and stock
    if (catalogItem) {
      if (catalogItem.isAvailable === false || (catalogItem.stockQuantity !== undefined && catalogItem.stockQuantity <= 0)) {
        errors.push(`"${item.name}" is currently out of stock or unavailable. Please remove it from your cart.`);
      }
    }

    // 3. Validate price
    const unitPrice = catalogItem && catalogItem.price > 0 ? catalogItem.price : item.price;
    if (isNaN(unitPrice) || unitPrice <= 0) {
      errors.push(`"${item.name}" has an invalid price configuration (₹${unitPrice}).`);
    }

    // 4. Validate quantity is a positive valid integer
    const qty = Number(item.quantity);
    if (isNaN(qty) || !Number.isInteger(qty) || qty <= 0) {
      errors.push(`"${item.name}" has an invalid quantity (${item.quantity}). Quantity must be a positive whole number.`);
    }

    sanitizedItems.push({
      ...item,
      price: unitPrice,
      quantity: Math.max(1, Math.floor(qty || 1)),
    });
  }

  // 5. Recalculate bill with sanitized and validated items
  const bill = calculateBill(sanitizedItems, appliedCoupon);

  // 6. Revalidate coupon requirement
  if (appliedCoupon && appliedCoupon.minSubtotal && bill.subtotal < appliedCoupon.minSubtotal) {
    errors.push(
      `Coupon ${appliedCoupon.code} requires a minimum order of ₹${appliedCoupon.minSubtotal}. Current subtotal is ₹${bill.subtotal}.`
    );
  }

  return {
    isValid: errors.length === 0,
    bill,
    errors,
  };
}

/**
 * Computes a deterministic canonical fingerprint of the checkout payload.
 * Binds customer ID, store ID, payment method, coupon, and sorted normalized cart items.
 *
 * Matching server-side canonical representation:
 * (customerId | storeId | paymentMethod | couponCode | normalizedCartItems)
 */
export function computeCheckoutPayloadFingerprint(
  customerId: string,
  storeId: string,
  paymentMethod: string,
  couponCode: string | null | undefined,
  cartItems: CartItem[]
): string {
  const sorted = [...cartItems]
    .filter((i) => i.id > 0 && i.quantity > 0)
    .sort((a, b) => a.id - b.id);
  const normalizedCart = sorted.map((i) => `${i.id}:${i.quantity}`).join(",");
  const cleanCoupon = couponCode ? couponCode.trim().toUpperCase() : "";
  const cleanMethod = paymentMethod.trim().toLowerCase();
  const cleanStore = storeId.trim();
  const cleanCustomer = customerId.trim();

  return `${cleanCustomer}|${cleanStore}|${cleanMethod}|${cleanCoupon}|${normalizedCart}`;
}

