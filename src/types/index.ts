export type AppView = "cart" | "review-order" | "checkout" | "payment" | "payment-success" | "exit";
export type ScanState = "idle" | "verifying" | "success" | "error";
export type PaymentMethod = "upi" | "card" | "wallet" | "cash";
export type PaymentProcessState = "ready" | "validating" | "processing" | "success" | "failure";

export interface CartItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
  unitSize?: string;
  mrp?: number;
  emoji?: string;
  imageUrl?: string;
  category?: string;
  brand?: string;
}

export interface Product extends Omit<CartItem, "quantity"> {
  barcode: string;
  category: string;
  emoji: string;
  imageUrl?: string;
  imageSource?: string;
  brand?: string;
  unitSize?: string;
  mrp?: number;
  discountBadge?: string;
  description?: string;
  stockQuantity?: number;
  isAvailable?: boolean;
}


export type StockFilter = "all" | "in_stock" | "low_stock" | "out_of_stock";

export type AdminTab = "overview" | "products" | "inventory" | "locations" | "transactions" | "security" | "gate-qr" | "stock-import";

// ── SmartFind Product Location Types ──
export type LocationVerificationStatus = "VERIFIED" | "UNVERIFIED" | "MISSING";

export interface ProductLocation {
  productId: number;
  storeId: string;
  aisleCode: string;
  aisleName: string;
  rackCode: string;
  shelfCode: string;
  verificationStatus: LocationVerificationStatus;
  updatedAt: string;
  notes?: string;
}

export interface StoreAisleDefinition {
  code: string;
  name: string;
  category: string;
  racks: string[];
  zone: string;
  description: string;
  order: number;
}

export type ProductCategory =
  | "All"
  | "Dairy"
  | "Fruits and Vegetables"
  | "Snacks"
  | "Beverages"
  | "Bakery"
  | "Personal Care"
  | "Household";

export interface SupermarketStore {
  id: string;
  name: string;
  code?: string;
  chain: "QLess Mart" | "DMart" | "Reliance Fresh" | "SPAR" | "Nature's Basket";
  branch: string;
  address: string;
  distance: string;
  timing: string;
  isOpen: boolean;
  tagline: string;
  brandColor: string;
  brandBg: string;
}

export interface Coupon {
  code: string;
  description: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  minSubtotal?: number;
}

export interface CompletedOrder {
  orderId: string;
  sessionId: string;
  receiptId: string;
  store: SupermarketStore | null;
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  mrpSavings: number;
  couponCode?: string;
  couponDiscount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  taxTotal: number;
  finalTotal: number;
  paymentMethod: PaymentMethod;
  paymentReference: string;
  paidAt: string;
  paymentStatus?: "PENDING" | "CONFIRMED" | "FAILED" | "REFUNDED" | string;
  customerId?: string | null;
  createdAt?: string;
  isDuplicate?: boolean;
  isLive?: boolean;
  issuedAt?: string;
  expiresAt?: string;
  mockExpiry?: string;
}

export interface ExitQRPayload {
  orderId: string;
  receiptId?: string;
  storeId: string;
  storeName?: string;
  itemCount?: number;
  finalTotal: number;
  status: "PAID_CONFIRMED" | "PAID_SIMULATED" | string;
  issuedAt: string;
  expiresAt?: string;
  mockExpiry?: string;
  paymentMethod?: string;
}

export type VerificationFailureReason =
  | "INVALID_JSON"
  | "MISSING_FIELDS"
  | "UNKNOWN_ORDER"
  | "EXPIRED_PASS"
  | "STATUS_INVALID"
  | "STORE_MISMATCH"
  | "AMOUNT_MISMATCH"
  | "ITEM_COUNT_MISMATCH"
  | "DUPLICATE_EXIT_SCAN"
  | "VERIFICATION_FAILED";

export interface VerificationResult {
  outcome: "success" | "duplicate_warning" | "failure";
  order: CompletedOrder | null;
  scannedPayload: Partial<ExitQRPayload> | null;
  rawPayload: string;
  failureReason?: VerificationFailureReason | string;
  failureMessage?: string;
  verifiedAt: string;
  firstVerifiedAt?: string;
  isDatabaseVerified?: boolean;
}

export interface InspectedItemState {
  id: number;
  inspectedQuantity: number;
  targetQuantity: number;
  flagged: boolean;
}

export interface VerificationLogEntry {
  id: string;
  orderId: string;
  receiptId: string;
  storeName: string;
  finalTotal: number;
  itemCount: number;
  outcome: "success" | "duplicate_warning" | "failure";
  failureReason?: string;
  timestamp: string;
  hasDiscrepancy?: boolean;
  discrepancyNote?: string;
  itemsConfirmed?: boolean;
  itemsConfirmedAt?: string;
  itemsConfirmedBy?: string;
  storeId?: string;
  guardId?: string | null;
  terminalId?: string;
  scannedPayload?: string;
  createdAtRaw?: string;
}

// ── Phase 7: Authentication & Role-Based Access Control Types ──

export type UserRole = "CUSTOMER" | "ADMIN" | "STORE_ADMIN" | "SECURITY_GUARD" | "CASHIER";

export interface NotificationPreferences {
  orderUpdates: boolean;
  digitalReceipts: boolean;
  shoppingOffers: boolean;
  securityAlerts: boolean;
}

export interface UserPreferences {
  language: string;
  theme: "light" | "dark" | "system";
  preferredStoreId?: string;
  notifications: NotificationPreferences;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  storeId?: string;
  phone?: string;
  terminalId?: string;
  storeBranch?: string;
  avatarInitials: string;
  isVerified?: boolean;
  createdAt?: string;
  preferences?: UserPreferences;
}

export interface StoreEntranceSession {
  storeId: string;
  storeCode: string;
  storeName: string;
  sessionToken: string;
  verifiedAt: string;
  expiresAt: string;
}

export interface AuthSession {
  user: AuthUser;
  tokenType: "DEMO_SESSION" | "SUPABASE_SESSION";
  loginAt: string;
  expiresAt: string;
  rememberMe?: boolean;
  entranceSession?: StoreEntranceSession | null;
}

export interface CustomerSignupData {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  agreeToTerms: boolean;
}

