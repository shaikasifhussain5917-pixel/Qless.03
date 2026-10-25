import { createContext, useContext, useMemo, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import {
  CartItem,
  CompletedOrder,
  Coupon,
  PaymentMethod,
  Product,
  ProductCategory,
  ProductLocation,
  StoreAisleDefinition,
  SupermarketStore,
} from "../types";
import { MOCK_PRODUCTS, RECEIPT_ID, SESSION_ID } from "../data/mockCatalog";
import { MOCK_STORES } from "../data/mockStores";
import { STORE_AISLES } from "../data/mockStoreLayout";
import { enrichCartItems, calculateBill, computeCheckoutPayloadFingerprint } from "../utils/billing";
export { computeCheckoutPayloadFingerprint };
import { getOrderHistory, saveOrderToHistory } from "../utils/orderStorage";
import { getProductCatalog } from "../utils/productStorage";
import {
  fetchStoreCatalog,
  getCurrentCatalogSnapshot,
  lookupProductByBarcodeLive,
  type BarcodeLookupResult,
} from "../services/catalogService";
import { LAUNCH_STORE_ID } from "../config/storeConfig";
import { isSupabaseConfigured } from "../lib/supabase";
import { useAuth } from "./AuthContext";
import {
  loadScopedCart,
  saveScopedCart,
  clearScopedCart,
} from "../utils/cartStorage";
import {
  processCheckoutOrder,
  CheckoutOrderResult,
  CheckoutPaymentMethod,
} from "../services/checkoutService";
import {
  getProductLocations,
  updateProductLocationRecord,
  resetLocationsToDefaults,
} from "../utils/locationStorage";
import {
  fetchLiveStoreAisles,
  fetchLiveProductLocations,
  upsertLiveProductLocation,
} from "../services/adminLocationService";

interface ShoppingContextType {
  selectedStore: SupermarketStore | null;
  setSelectedStore: (store: SupermarketStore) => void;
  items: CartItem[];
  total: number;
  itemCount: number;
  sessionId: string;
  receiptId: string;
  paidAt: string;
  addProduct: (product: Product, quantity?: number) => { success: boolean; error?: string };
  changeQty: (id: number, delta: number) => void;
  setProductQty: (id: number, quantity: number) => void;
  refreshCartWithCatalog: () => void;
  clearCart: () => void;
  restoreCartItems: (items: CartItem[]) => void;
  completePayment: (timeStr: string) => void;
  resetSession: () => void;

  // Live Supabase Product Catalog state & helpers
  catalog: Product[];
  isCatalogLoading: boolean;
  isCatalogLive: boolean;
  catalogError: string | null;
  refreshCatalog: () => Promise<void>;
  findProductByBarcode: (barcode: string) => Product | undefined;
  lookupBarcode: (barcode: string) => Promise<BarcodeLookupResult>;
  searchProducts: (query: string, category?: ProductCategory) => Product[];

  // Phase 3 & 4 Checkout & History Extensions
  completedOrder: CompletedOrder | null;
  setCompletedOrder: (order: CompletedOrder | null) => void;
  orderHistory: CompletedOrder[];
  saveCompletedOrder: (order: CompletedOrder) => void;
  selectedHistoryOrder: CompletedOrder | null;
  setSelectedHistoryOrder: (order: CompletedOrder | null) => void;
  walletBalance: number;
  setWalletBalance: React.Dispatch<React.SetStateAction<number>>;
  deductWalletBalance: (amount: number) => boolean;
  addWalletDemoBalance: (amount: number) => void;
  appliedCoupon: Coupon | null;
  setAppliedCoupon: (coupon: Coupon | null) => void;

  // SmartFind Location Extensions
  locations: ProductLocation[];
  getLocation: (productId: number) => ProductLocation | undefined;
  updateLocation: (
    payload: Omit<ProductLocation, "updatedAt" | "storeId"> & { updatedAt?: string; storeId?: string }
  ) => { success: boolean; error?: string; location?: ProductLocation };
  resetLocations: () => void;
  storeAisles: StoreAisleDefinition[];

  // Phase 9 Checkout State & Idempotency Orchestration
  isCheckingOut: boolean;
  checkoutError: string | null;
  activeIdempotencyKey: string | null;
  executeCheckout: (
    paymentMethod: CheckoutPaymentMethod | PaymentMethod | string
  ) => Promise<CheckoutOrderResult>;
  clearActiveIdempotencyKey: () => void;
}

const ShoppingContext = createContext<ShoppingContextType | undefined>(undefined);

/**
 * Generates an RFC4122 v4 UUID with robust browser and fallback support.
 */
function generateSecureUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const ShoppingProvider = ({ children }: { children: ReactNode }) => {
  const { user, entranceSession, hasValidEntrance, isAuthenticated } = useAuth();
  const [selectedStore, setSelectedStore] = useState<SupermarketStore | null>(MOCK_STORES[0]);

  // Compute canonical identity parameters for cart scoping
  const currentUserId = isAuthenticated && user ? user.id : null;
  const currentStoreId = selectedStore?.id || LAUNCH_STORE_ID;
  const currentEntranceToken = hasValidEntrance ? entranceSession?.sessionToken || null : null;
  const cartSessionKey = `${currentUserId || "anon"}::${currentStoreId}::${currentEntranceToken || "no-gate"}`;

  const [paidAt, setPaidAt] = useState<string>("");
  const [completedOrder, setCompletedOrder] = useState<CompletedOrder | null>(null);
  const [walletBalance, setWalletBalance] = useState<number>(650.0); // Initial ₹650 mock wallet
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);

  // Phase 9 Authoritative Checkout & Idempotency State
  const [isCheckingOut, setIsCheckingOut] = useState<boolean>(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [activeIdempotencyKey, setActiveIdempotencyKey] = useState<string | null>(null);

  // Submission ref lock to prevent rapid repeated clicks from bypassing React re-renders
  const isCheckingOutRef = useRef<boolean>(false);

  // Active idempotency record bound to customer, store, payment method, coupon, and cart contents
  const activeIdempotencyRef = useRef<{
    key: string;
    fingerprint: string;
    createdAt: number;
  } | null>(null);

  // Initialize cart from scoped storage for active user, store, and entrance session
  const [items, setItems] = useState<CartItem[]>(() =>
    loadScopedCart(currentUserId, currentStoreId, currentEntranceToken)
  );

  const [prevCartSessionKey, setPrevCartSessionKey] = useState<string>(cartSessionKey);

  // Synchronous render-time cart reconciliation:
  // When user, store, or entrance session changes, immediately reset and load the isolated cart.
  // This eliminates any single-frame stale cart visibility during user switch, store change, or logout.
  if (cartSessionKey !== prevCartSessionKey) {
    setPrevCartSessionKey(cartSessionKey);
    const freshItems = loadScopedCart(currentUserId, currentStoreId, currentEntranceToken);
    setItems(freshItems);
    setAppliedCoupon(null);
    setCheckoutError(null);
    activeIdempotencyRef.current = null;
    setActiveIdempotencyKey(null);
  }

  // Synchronize cart changes with session storage for the active scoped session
  useEffect(() => {
    saveScopedCart(items, currentUserId, currentStoreId, currentEntranceToken);
  }, [items, currentUserId, currentStoreId, currentEntranceToken]);

  // Global cart flush listener (triggered by logout, account deletion, or explicit session reset)
  useEffect(() => {
    const handleFlush = () => {
      setItems([]);
      setAppliedCoupon(null);
      setCheckoutError(null);
      activeIdempotencyRef.current = null;
      setActiveIdempotencyKey(null);
    };
    window.addEventListener("qless:cart-flush", handleFlush);
    return () => window.removeEventListener("qless:cart-flush", handleFlush);
  }, []);

  // Live Catalog State initialized from cached/offline catalog snapshot
  const [catalog, setCatalog] = useState<Product[]>(() => getCurrentCatalogSnapshot());
  const [isCatalogLoading, setIsCatalogLoading] = useState<boolean>(false);
  const [isCatalogLive, setIsCatalogLive] = useState<boolean>(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // SmartFind Product Locations state
  const [locations, setLocations] = useState<ProductLocation[]>(() => getProductLocations());
  const [storeAisles, setStoreAisles] = useState<StoreAisleDefinition[]>(() =>
    isSupabaseConfigured ? [] : STORE_AISLES
  );

  // Phase 4 Order Retention & History state
  const [orderHistory, setOrderHistory] = useState<CompletedOrder[]>(() => getOrderHistory());
  const [selectedHistoryOrder, setSelectedHistoryOrder] = useState<CompletedOrder | null>(null);

  const total = useMemo(() => items.reduce((s, i) => s + i.price * i.quantity, 0), [items]);
  const itemCount = useMemo(() => items.reduce((s, i) => s + i.quantity, 0), [items]);

  /**
   * Loads product catalog from Supabase on mount and when selected store changes.
   * Avoids resetting or modifying active customer cart items.
   */
  useEffect(() => {
    let isMounted = true;
    const storeIdToLoad = selectedStore?.id || LAUNCH_STORE_ID;

    async function loadCatalog() {
      setIsCatalogLoading(true);
      try {
        const result = await fetchStoreCatalog(storeIdToLoad);
        if (!isMounted) return;

        if (result.error) {
          if (isSupabaseConfigured) {
            setCatalog([]);
          }
          setIsCatalogLive(false);
          setCatalogError(result.error);
        } else {
          setCatalog(result.products);
          setIsCatalogLive(result.isLive);
          setCatalogError(null);
        }
      } catch (err) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : "Failed to load store catalog";
        setIsCatalogLive(false);
        setCatalogError(msg);
      } finally {
        if (isMounted) {
          setIsCatalogLoading(false);
        }
      }
    }

    loadCatalog();

    return () => {
      isMounted = false;
    };
  }, [selectedStore?.id]);

  // Phase 5 Stage 3: Load authoritative SmartFind aisles and product locations from Supabase
  useEffect(() => {
    let isMounted = true;
    const storeIdToLoad = selectedStore?.id || LAUNCH_STORE_ID;

    async function loadSmartFindData() {
      try {
        const [aislesResult, locsResult] = await Promise.all([
          fetchLiveStoreAisles(storeIdToLoad),
          fetchLiveProductLocations(storeIdToLoad),
        ]);

        if (!isMounted) return;

        if (aislesResult.aisles.length > 0) {
          setStoreAisles(aislesResult.aisles);
        } else if (isSupabaseConfigured) {
          // Do not invent routes or retain mock aisles when Supabase returns empty
          setStoreAisles([]);
        }
        if (locsResult.locations.length > 0) {
          setLocations(locsResult.locations);
        }
      } catch (err) {
        console.warn("[QLess SmartFind] Background live locations load error:", err);
        if (isSupabaseConfigured) {
          setStoreAisles([]);
        }
      }
    }

    loadSmartFindData();

    return () => {
      isMounted = false;
    };
  }, [selectedStore?.id]);

  /**
   * Refreshes catalog from Supabase on demand (e.g. pull-to-refresh or retry).
   */
  const refreshCatalog = useCallback(async () => {
    const storeIdToLoad = selectedStore?.id || LAUNCH_STORE_ID;
    setIsCatalogLoading(true);
    try {
      const result = await fetchStoreCatalog(storeIdToLoad, true);
      if (result.error) {
        if (isSupabaseConfigured) {
          setCatalog([]);
        }
        setIsCatalogLive(false);
        setCatalogError(result.error);
      } else {
        setCatalog(result.products);
        setIsCatalogLive(result.isLive);
        setCatalogError(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to refresh store catalog";
      setIsCatalogLive(false);
      setCatalogError(msg);
    } finally {
      setIsCatalogLoading(false);
    }
  }, [selectedStore?.id]);

  /**
   * Helper: Find product by exact barcode match across live catalog and fallback sources.
   */
  /**
   * Helper: Find product by exact barcode match across live catalog.
   * When live Supabase is active, strictly checks live store catalog and does not fall back to mock items.
   */
  const findProductByBarcode = useCallback(
    (barcode: string): Product | undefined => {
      const clean = barcode.trim().replace(/[\s-]/g, "");
      const match = catalog.find((p) => p.barcode.replace(/[\s-]/g, "") === clean);
      if (match) return match;

      // Do NOT trust mock items when live Supabase is configured
      if (isCatalogLive || isSupabaseConfigured) {
        return undefined;
      }

      // Offline demonstration mode fallback only
      return (
        getProductCatalog().find((p) => p.barcode.replace(/[\s-]/g, "") === clean) ||
        MOCK_PRODUCTS.find((p) => p.barcode.replace(/[\s-]/g, "") === clean)
      );
    },
    [catalog, isCatalogLive]
  );

  /**
   * Authoritative Live Barcode Lookup
   * Checks Supabase customer_store_catalog and ensures the latest product
   * state, price, and availability are fetched live.
   */
  const lookupBarcode = useCallback(
    async (barcode: string): Promise<BarcodeLookupResult> => {
      const storeIdToLoad = selectedStore?.id || LAUNCH_STORE_ID;
      const result = await lookupProductByBarcodeLive(barcode, storeIdToLoad);
      if (result.product) {
        setCatalog((prev) => {
          const exists = prev.some((p) => p.id === result.product!.id);
          if (exists) {
            return prev.map((p) => (p.id === result.product!.id ? result.product! : p));
          }
          return [...prev, result.product!];
        });
      }
      return result;
    },
    [selectedStore?.id]
  );

  /**
   * Helper: Search products by query, category, brand, or barcode from active catalog.
   */
  const searchProducts = useCallback(
    (query: string, category: ProductCategory = "All"): Product[] => {
      const q = query.trim().toLowerCase();
      const source =
        catalog.length > 0
          ? catalog
          : isSupabaseConfigured
          ? []
          : getProductCatalog();
      return source.filter((product) => {
        const matchesCategory = category === "All" || product.category === category;
        if (!matchesCategory) return false;
        if (!q) return true;
        return (
          product.name.toLowerCase().includes(q) ||
          product.category.toLowerCase().includes(q) ||
          product.barcode.includes(q) ||
          (product.brand && product.brand.toLowerCase().includes(q)) ||
          (product.description && product.description.toLowerCase().includes(q))
        );
      });
    },
    [catalog]
  );

  /**
   * Refreshes active cart items against latest product catalog.
   * Ensures that administrative price modifications or availability changes
   * are immediately and accurately reflected in the customer's active trip.
   */
  const refreshCartWithCatalog = useCallback(() => {
    setItems((cur) => enrichCartItems(cur, catalog));
  }, [catalog]);

  /**
   * Adds a product to the cart with strict validation:
   * 1. Rejects unavailable or out-of-stock items.
   * 2. Rejects products with invalid or negative prices.
   * 3. Requires positive integer quantities.
   */
  const addProduct = (
    product: Product,
    quantity: number = 1
  ): { success: boolean; error?: string } => {
    // 0. Enforce active store entrance session
    if (!hasValidEntrance) {
      return {
        success: false,
        error: "Active store entrance session required. Please scan supermarket entrance QR code.",
      };
    }

    if (!product || !product.id) {
      return { success: false, error: "Invalid product information." };
    }

    // 1. Verify availability and stock against live catalog
    const liveProduct =
      catalog.find((p) => p.id === product.id) ||
      catalog.find((p) => p.barcode === product.barcode) ||
      product;

    if (
      liveProduct.isAvailable === false ||
      (liveProduct.stockQuantity !== undefined && liveProduct.stockQuantity <= 0)
    ) {
      return {
        success: false,
        error: `"${liveProduct.name}" is currently out of stock or unavailable.`,
      };
    }

    // 2. Reject non-positive or invalid pricing
    const unitPrice = Number(liveProduct.price);
    if (isNaN(unitPrice) || unitPrice <= 0) {
      return {
        success: false,
        error: `"${liveProduct.name}" has an invalid price configuration (₹${liveProduct.price}).`,
      };
    }

    // 3. Reject invalid or non-integer quantities
    const qtyToAdd = Math.floor(Number(quantity));
    if (isNaN(qtyToAdd) || qtyToAdd <= 0) {
      return {
        success: false,
        error: "Quantity must be a positive whole number greater than zero.",
      };
    }

    // 4. Validate quantity against current known stock if stock quantity is present
    const existingInCart = items.find((i) => i.id === liveProduct.id);
    const totalResultingQty = (existingInCart?.quantity || 0) + qtyToAdd;
    if (
      liveProduct.stockQuantity !== undefined &&
      totalResultingQty > liveProduct.stockQuantity
    ) {
      return {
        success: false,
        error: `Only ${liveProduct.stockQuantity} unit${liveProduct.stockQuantity === 1 ? "" : "s"} of "${liveProduct.name}" available in stock.`,
      };
    }

    // Invalidate active idempotency key since cart contents changed
    activeIdempotencyRef.current = null;
    setActiveIdempotencyKey(null);

    setItems((cur) => {
      const ex = cur.find((i) => i.id === liveProduct.id);
      return ex
        ? cur.map((i) =>
            i.id === liveProduct.id
              ? {
                  ...i,
                  price: unitPrice,
                  quantity: i.quantity + qtyToAdd,
                  unitSize: liveProduct.unitSize || i.unitSize,
                  mrp: liveProduct.mrp ?? i.mrp,
                  brand: liveProduct.brand || i.brand,
                }
              : i
          )
        : [
            ...cur,
            {
              id: liveProduct.id,
              name: liveProduct.name,
              price: unitPrice,
              quantity: qtyToAdd,
              unitSize: liveProduct.unitSize,
              mrp: liveProduct.mrp ?? unitPrice,
              emoji: liveProduct.emoji,
              category: liveProduct.category,
              brand: liveProduct.brand,
            },
          ];
    });

    return { success: true };
  };

  /**
   * Adjusts quantity by a relative delta (+1, -1).
   * Removes item if quantity reaches 0 or below.
   */
  const changeQty = (id: number, delta: number) => {
    if (!hasValidEntrance) return;
    const cleanDelta = Math.floor(Number(delta) || 0);
    if (cleanDelta === 0) return;

    // Invalidate active idempotency key since cart contents changed
    activeIdempotencyRef.current = null;
    setActiveIdempotencyKey(null);

    setItems((cur) => {
      const existing = cur.find((i) => i.id === id);
      if (!existing) return cur;

      // If increasing, check stock limit
      if (cleanDelta > 0) {
        const liveProduct = catalog.find((p) => p.id === id);
        if (liveProduct && liveProduct.isAvailable === false) {
          return cur;
        }
        if (
          liveProduct &&
          liveProduct.stockQuantity !== undefined &&
          existing.quantity + cleanDelta > liveProduct.stockQuantity
        ) {
          return cur;
        }
      }

      return cur
        .map((i) => (i.id === id ? { ...i, quantity: Math.max(0, i.quantity + cleanDelta) } : i))
        .filter((i) => i.quantity > 0);
    });
  };

  /**
   * Directly sets explicit positive integer quantity for a cart item.
   * If quantity <= 0, item is removed from cart.
   */
  const setProductQty = (id: number, quantity: number) => {
    if (!hasValidEntrance) return;
    const targetQty = Math.floor(Number(quantity));

    // Invalidate active idempotency key since cart contents changed
    activeIdempotencyRef.current = null;
    setActiveIdempotencyKey(null);

    if (isNaN(targetQty) || targetQty <= 0) {
      setItems((cur) => cur.filter((i) => i.id !== id));
      return;
    }

    setItems((cur) =>
      cur.map((i) => (i.id === id ? { ...i, quantity: targetQty } : i))
    );
  };

  const clearCart = () => {
    setItems([]);
    clearScopedCart(currentUserId, currentStoreId);
    activeIdempotencyRef.current = null;
    setActiveIdempotencyKey(null);
  };

  /**
   * Restores items back into the active cart (used when abandoning or resetting
   * an uncompleted digital payment attempt to return to cash checkout).
   */
  const restoreCartItems = useCallback(
    (restoredItems: CartItem[]) => {
      if (!Array.isArray(restoredItems) || restoredItems.length === 0) return;
      const cleanClones: CartItem[] = restoredItems.map((i) => ({ ...i }));
      setItems(cleanClones);
      activeIdempotencyRef.current = null;
      setActiveIdempotencyKey(null);
      saveScopedCart(cleanClones, currentUserId, currentStoreId, currentEntranceToken);
    },
    [currentUserId, currentStoreId, currentEntranceToken]
  );

  const completePayment = (timeStr: string) => {
    setPaidAt(timeStr);
  };

  /**
   * Saves completed order snapshot.
   * Creates an immutable deep copy of item records so future catalog changes
   * or cart additions never alter past receipts.
   */
  const saveCompletedOrder = useCallback((order: CompletedOrder) => {
    const frozenOrder: CompletedOrder = {
      ...order,
      items: order.items.map((i) => ({ ...i })),
    };
    setCompletedOrder(frozenOrder);
    const updated = saveOrderToHistory(frozenOrder);
    setOrderHistory(updated);
  }, []);

  const deductWalletBalance = (amount: number): boolean => {
    if (walletBalance < amount) return false;
    setWalletBalance((prev) => Math.max(0, Math.round((prev - amount) * 100) / 100));
    return true;
  };

  const addWalletDemoBalance = (amount: number) => {
    setWalletBalance((prev) => Math.round((prev + amount) * 100) / 100);
  };

  /**
   * Resets the active trip/cart for a new session WITHOUT deleting historical receipts.
   */
  const resetSession = () => {
    setItems([]);
    clearScopedCart(currentUserId, currentStoreId);
    setPaidAt("");
    setCompletedOrder(null);
    setAppliedCoupon(null);
    setSelectedHistoryOrder(null);
    setCheckoutError(null);
    activeIdempotencyRef.current = null;
    setActiveIdempotencyKey(null);
  };

  const clearActiveIdempotencyKey = useCallback(() => {
    activeIdempotencyRef.current = null;
    setActiveIdempotencyKey(null);
  }, []);

  /**
   * Orchestrates secure checkout with idempotency key management.
   *
   * Guarantees:
   * 1. Reuses same idempotency key and identical payload when retrying after an error.
   * 2. Generates a fresh key if cart contents, customer, store, coupon, or payment method changes.
   * 3. Prevents concurrent duplicate submissions via mutex ref lock.
   * 4. Strictly preserves cart items and quantities on checkout failure.
   * 5. Clears cart ONLY after receiving an authoritative success:true response.
   * 6. Does not mark orders as paid or generate exit passes from customer code.
   * 7. Never silently falls back to simulated checkout on live database failures.
   */
  const executeCheckout = useCallback(
    async (
      paymentMethod: CheckoutPaymentMethod | PaymentMethod | string
    ): Promise<CheckoutOrderResult> => {
      // 1. Prevent concurrent duplicate submissions
      if (isCheckingOutRef.current) {
        return {
          success: false,
          error: "A checkout operation is already in progress. Please wait.",
        };
      }

      // 2. Validate active store entrance session
      if (!hasValidEntrance) {
        const err = "Active store entrance session required. Please scan supermarket entrance QR code before checking out.";
        setCheckoutError(err);
        return { success: false, error: err };
      }

      // 3. Validate cart non-empty
      if (!items || items.length === 0) {
        const err = "Cart is empty. Please add items before checking out.";
        setCheckoutError(err);
        return { success: false, error: err };
      }

      const storeId = selectedStore?.id || LAUNCH_STORE_ID;
      const cleanCustomerId = user?.id || "";
      const cleanMethod = paymentMethod.trim().toLowerCase();
      const cleanCoupon = appliedCoupon?.code || null;

      // Razorpay Test Mode: Allow 'cash', 'upi', and 'card'.
      // 'wallet' remains disabled during test mode.
      if (cleanMethod === "wallet") {
        const err =
          "QLess Wallet is not supported during Razorpay Test Mode. Please choose UPI, Card, or Cash.";
        setCheckoutError(err);
        return {
          success: false,
          error: err,
        };
      }

      // 3. Demo fallback mode ONLY when Supabase is genuinely unconfigured
      if (!isSupabaseConfigured) {
        isCheckingOutRef.current = true;
        setIsCheckingOut(true);
        setCheckoutError(null);

        try {
          const bill = calculateBill(items, appliedCoupon);
          const uniqueOrderId = `QL-${new Date().getFullYear()}-${Math.random()
            .toString(36)
            .substring(2, 7)
            .toUpperCase()}`;
          const uniqueReceiptId = `REC-${new Date().getFullYear().toString().slice(-2)}${(new Date().getMonth() + 1).toString().padStart(2, "0")}-${Math.random()
            .toString(36)
            .substring(2, 8)
            .toUpperCase()}`;

          const demoOrder: CompletedOrder = {
            orderId: uniqueOrderId,
            sessionId: SESSION_ID,
            receiptId: uniqueReceiptId,
            store: selectedStore,
            items: items.map((i) => ({ ...i })),
            itemCount: bill.itemCount,
            subtotal: bill.subtotal,
            mrpSavings: bill.mrpSavings,
            couponCode: bill.appliedCoupon?.code,
            couponDiscount: bill.couponDiscount,
            taxableAmount: bill.taxableAmount,
            cgst: bill.cgst,
            sgst: bill.sgst,
            taxTotal: bill.taxTotal,
            finalTotal: bill.finalTotal,
            paymentMethod: cleanMethod as PaymentMethod,
            paymentReference: `${cleanMethod.toUpperCase()}-DEMO-${Date.now().toString().slice(-6)}`,
            paidAt: new Date().toISOString(),
            paymentStatus: cleanMethod === "cash" ? "PENDING" : "CONFIRMED",
            isLive: false,
          };

          saveCompletedOrder(demoOrder);
          setPaidAt(demoOrder.paidAt);
          setItems([]);
          activeIdempotencyRef.current = null;
          setActiveIdempotencyKey(null);
          setCheckoutError(null);

          return {
            success: true,
            orderId: demoOrder.orderId,
            receiptId: demoOrder.receiptId,
            storeId: selectedStore?.id || LAUNCH_STORE_ID,
            finalTotal: demoOrder.finalTotal,
            paymentMethod: cleanMethod,
            paymentStatus: cleanMethod === "cash" ? "PENDING" : "CONFIRMED",
            order: demoOrder,
          };
        } finally {
          isCheckingOutRef.current = false;
          setIsCheckingOut(false);
        }
      }

      // 4. Live Authoritative Database Checkout Flow (Supabase Configured)
      // Compute deterministic payload fingerprint
      const fingerprint = computeCheckoutPayloadFingerprint(
        cleanCustomerId,
        storeId,
        cleanMethod,
        cleanCoupon,
        items
      );

      // Resolve or generate idempotency key
      let idempotencyKey: string;
      if (
        activeIdempotencyRef.current &&
        activeIdempotencyRef.current.fingerprint === fingerprint
      ) {
        // Reuse key on identical retry
        idempotencyKey = activeIdempotencyRef.current.key;
      } else {
        // Fresh key for new or altered payload
        idempotencyKey = generateSecureUUID();
        activeIdempotencyRef.current = {
          key: idempotencyKey,
          fingerprint,
          createdAt: Date.now(),
        };
        setActiveIdempotencyKey(idempotencyKey);
      }

      // Acquire lock
      isCheckingOutRef.current = true;
      setIsCheckingOut(true);
      setCheckoutError(null);

      try {
        // Invoke secure checkout RPC service
        const result = await processCheckoutOrder({
          storeId,
          items,
          paymentMethod: cleanMethod,
          idempotencyKey,
          couponCode: cleanCoupon,
        });

        // Handle RPC failure (success: false or network/database error)
        if (!result.success) {
          const errMsg = result.error || "Checkout processing failed. Please retry.";
          setCheckoutError(errMsg);
          // Refresh store catalog on stock or availability conflict
          if (
            errMsg.toLowerCase().includes("stock") ||
            errMsg.toLowerCase().includes("unavailable")
          ) {
            refreshCatalog().catch(() => {});
          }
          // NOTE: Cart items & quantities are strictly preserved.
          // activeIdempotencyRef remains intact for identical payload retry.
          return result;
        }

        // Validate required order identifiers returned from server
        if (!result.orderId || !result.receiptId) {
          const errMsg = "Malformed server checkout response: missing orderId or receiptId.";
          setCheckoutError(errMsg);
          return {
            success: false,
            error: errMsg,
          };
        }

        // Build authoritative CompletedOrder snapshot using strictly server-returned financials
        const finalOrder: CompletedOrder = {
          orderId: result.orderId,
          sessionId: SESSION_ID,
          receiptId: result.receiptId,
          store: selectedStore,
          items: items.map((i) => ({ ...i })),
          itemCount: result.itemCount ?? items.reduce((s, i) => s + i.quantity, 0),
          subtotal: result.subtotal ?? 0,
          mrpSavings: result.mrpSavings ?? 0,
          couponCode: result.couponCode || appliedCoupon?.code,
          couponDiscount: result.couponDiscount ?? 0,
          taxableAmount: result.taxableAmount ?? 0,
          cgst: result.cgst ?? 0,
          sgst: result.sgst ?? 0,
          taxTotal: result.taxTotal ?? 0,
          finalTotal: result.finalTotal ?? 0,
          paymentMethod: (result.paymentMethod as PaymentMethod) || (cleanMethod as PaymentMethod),
          paymentReference: result.orderId,
          paidAt: new Date().toISOString(),
          paymentStatus: result.paymentStatus || "PENDING",
          isDuplicate: result.isDuplicate,
          isLive: true,
        };

        // Persist completed order snapshot with authoritative PENDING status
        saveCompletedOrder(finalOrder);
        setPaidAt(finalOrder.paidAt);

        // Clear cart ONLY upon verified database order creation
        setItems([]);

        // Reset idempotency tracking for next purchase
        activeIdempotencyRef.current = null;
        setActiveIdempotencyKey(null);
        setCheckoutError(null);

        return {
          ...result,
          order: finalOrder,
        };
      } catch (err) {
        const errorMsg =
          err instanceof Error
            ? err.message
            : "An unexpected network error occurred during checkout.";
        setCheckoutError(errorMsg);
        // Cart and idempotency ref are preserved for identical retry
        return {
          success: false,
          error: errorMsg,
          isNetworkError: true,
        };
      } finally {
        isCheckingOutRef.current = false;
        setIsCheckingOut(false);
      }
    },
    [
      items,
      selectedStore,
      user?.id,
      appliedCoupon,
      saveCompletedOrder,
    ]
  );

  /**
   * SmartFind Location Resolution and Mutation
   */
  const getLocation = useCallback(
    (productId: number): ProductLocation | undefined => {
      return locations.find((l) => l.productId === productId);
    },
    [locations]
  );

  const updateLocation = useCallback(
    (
      payload: Omit<ProductLocation, "updatedAt" | "storeId"> & { updatedAt?: string; storeId?: string }
    ) => {
      const storeId = payload.storeId || selectedStore?.id || LAUNCH_STORE_ID;
      const res = updateProductLocationRecord({ ...payload, storeId });
      if (res.success && res.location) {
        setLocations(getProductLocations());
      }

      // Persist to Supabase in the background
      upsertLiveProductLocation({
        storeId,
        productId: payload.productId,
        aisleCode: payload.aisleCode,
        aisleName: payload.aisleName,
        rackCode: payload.rackCode,
        shelfCode: payload.shelfCode,
        verificationStatus: payload.verificationStatus,
        notes: payload.notes,
      }).then((dbRes) => {
        if (dbRes.success && dbRes.location) {
          setLocations((prev) => {
            const idx = prev.findIndex((l) => l.productId === payload.productId);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = dbRes.location!;
              return next;
            }
            return [...prev, dbRes.location!];
          });
        }
      }).catch((err) => {
        console.warn("[QLess SmartFind] Live location persistence warning:", err);
      });

      return res;
    },
    [selectedStore?.id]
  );

  const resetLocations = useCallback(() => {
    const res = resetLocationsToDefaults();
    setLocations(res);
  }, []);

  return (
    <ShoppingContext.Provider
      value={{
        selectedStore,
        setSelectedStore,
        items,
        total,
        itemCount,
        sessionId: SESSION_ID,
        receiptId: RECEIPT_ID,
        paidAt,
        addProduct,
        changeQty,
        setProductQty,
        refreshCartWithCatalog,
        clearCart,
        restoreCartItems,
        completePayment,
        resetSession,
        completedOrder,
        setCompletedOrder,
        orderHistory,
        saveCompletedOrder,
        selectedHistoryOrder,
        setSelectedHistoryOrder,
        walletBalance,
        setWalletBalance,
        deductWalletBalance,
        addWalletDemoBalance,
        appliedCoupon,
        setAppliedCoupon,
        locations,
        getLocation,
        updateLocation,
        resetLocations,
        storeAisles,
        catalog,
        isCatalogLoading,
        isCatalogLive,
        catalogError,
        refreshCatalog,
        findProductByBarcode,
        lookupBarcode,
        searchProducts,
        isCheckingOut,
        checkoutError,
        activeIdempotencyKey,
        executeCheckout,
        clearActiveIdempotencyKey,
      }}
    >
      {children}
    </ShoppingContext.Provider>
  );
};

export function useShopping(): ShoppingContextType {
  const ctx = useContext(ShoppingContext);
  if (!ctx) {
    throw new Error("useShopping must be used within a ShoppingProvider");
  }
  return ctx;
}

