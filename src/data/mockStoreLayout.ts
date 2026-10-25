import { ProductLocation, StoreAisleDefinition } from "../types";
import { STORE_ID } from "../config/storeConfig";

/**
 * Canonical Aisle Definitions for QLess Mart (STORE001) Flagship Store.
 * Reused consistently across customer search, store floor plan, admin filters,
 * and smart shopping route calculations.
 */
export const STORE_AISLES: StoreAisleDefinition[] = [
  {
    code: "A01",
    name: "Dairy & Refrigerated",
    category: "Dairy",
    racks: ["R01", "R02", "R03", "R04"],
    zone: "Chilled Perimeter (Left)",
    description: "Refrigerated display cases along the left wall. Temperature controlled at 4°C.",
    order: 1,
  },
  {
    code: "A02",
    name: "Fresh Produce & Greens",
    category: "Fruits and Vegetables",
    racks: ["R05", "R06", "R07", "R08"],
    zone: "Entrance Greenery (Front Left)",
    description: "Open misted island racks for fresh fruits and organic greens.",
    order: 2,
  },
  {
    code: "A03",
    name: "Biscuits & Savory Snacks",
    category: "Snacks",
    racks: ["R09", "R10", "R11", "R12"],
    zone: "Center Aisle 1",
    description: "Double-sided gondola shelving featuring potato crisps, chips, and tea biscuits.",
    order: 3,
  },
  {
    code: "A04",
    name: "Beverages & Hot Drinks",
    category: "Beverages",
    racks: ["R13", "R14", "R15", "R16"],
    zone: "Center Aisle 2",
    description: "Sparkling drinks, tetra juices, loose tea leaves, and premium coffee blends.",
    order: 4,
  },
  {
    code: "A05",
    name: "Bakery & Breads",
    category: "Bakery",
    racks: ["R17", "R18", "R19", "R20"],
    zone: "Back Center",
    description: "Daily fresh baked loaves, artisan sourdoughs, cookies, and dry rusks.",
    order: 5,
  },
  {
    code: "A06",
    name: "Personal Care & Hygiene",
    category: "Personal Care",
    racks: ["R21", "R22", "R23", "R24"],
    zone: "Center Aisle 3",
    description: "Oral hygiene, soaps, body washes, sanitizers, and haircare products.",
    order: 6,
  },
  {
    code: "A07",
    name: "Household & Cleaning",
    category: "Household",
    racks: ["R25", "R26", "R27", "R28"],
    zone: "Right Wall Perimeter",
    description: "Laundry detergents, fabric conditioners, dishwashing gels, and floor cleaners.",
    order: 7,
  },
  {
    code: "A08",
    name: "Staples, Rice & Grains",
    category: "Household",
    racks: ["R29", "R30", "R31", "R32"],
    zone: "Back Right Depot",
    description: "Heavy bulk basmati bags, cooking oils, iodised table salts, and pulses.",
    order: 8,
  },
];

/**
 * Realistic, deterministic initial mock product locations for STORE001.
 * Tied directly to product IDs 1–30 from mockCatalog.ts.
 */
export const INITIAL_PRODUCT_LOCATIONS: ProductLocation[] = [
  // ── Dairy (A01) ──
  {
    productId: 1, // Amul Taaza Toned Milk
    storeId: STORE_ID,
    aisleCode: "A01",
    aisleName: "Dairy & Refrigerated",
    rackCode: "R02",
    shelfCode: "S01",
    verificationStatus: "VERIFIED",
    updatedAt: "2026-10-10T08:30:00Z",
    notes: "Chilled display tier 1, milk crate row",
  },
  {
    productId: 3, // Eggs (12 pcs)
    storeId: STORE_ID,
    aisleCode: "A01",
    aisleName: "Dairy & Refrigerated",
    rackCode: "R01",
    shelfCode: "S02",
    verificationStatus: "VERIFIED",
    updatedAt: "2026-10-10T09:15:00Z",
    notes: "Eye level shelf, protective cartons",
  },
  {
    productId: 6, // Amul Butter
    storeId: STORE_ID,
    aisleCode: "A01",
    aisleName: "Dairy & Refrigerated",
    rackCode: "R03",
    shelfCode: "S02",
    verificationStatus: "VERIFIED",
    updatedAt: "2026-10-09T14:20:00Z",
  },
  {
    productId: 13, // Mother Dairy Paneer
    storeId: STORE_ID,
    aisleCode: "A01",
    aisleName: "Dairy & Refrigerated",
    rackCode: "R03",
    shelfCode: "S03",
    verificationStatus: "MISSING", // Demo test: missing location
    updatedAt: "2026-10-05T11:00:00Z",
    notes: "Recently restocked pending shelf allocation",
  },
  {
    productId: 14, // Epigamia Greek Yogurt
    storeId: STORE_ID,
    aisleCode: "A01",
    aisleName: "Dairy & Refrigerated",
    rackCode: "R04",
    shelfCode: "S02",
    verificationStatus: "UNVERIFIED", // Demo test: unverified location
    updatedAt: "2026-10-11T16:45:00Z",
    notes: "Shifted during morning shelf reorganisation",
  },

  // ── Fruits & Vegetables (A02) ──
  {
    productId: 4, // Apples (Shimla)
    storeId: STORE_ID,
    aisleCode: "A02",
    aisleName: "Fresh Produce & Greens",
    rackCode: "R05",
    shelfCode: "S01",
    verificationStatus: "VERIFIED",
    updatedAt: "2026-10-12T06:00:00Z",
    notes: "Front wooden crate tray",
  },
  {
    productId: 15, // Robusta Bananas
    storeId: STORE_ID,
    aisleCode: "A02",
    aisleName: "Fresh Produce & Greens",
    rackCode: "R05",
    shelfCode: "S02",
    verificationStatus: "VERIFIED",
    updatedAt: "2026-10-12T06:15:00Z",
  },
  {
    productId: 16, // Red Tomatoes
    storeId: STORE_ID,
    aisleCode: "A02",
    aisleName: "Fresh Produce & Greens",
    rackCode: "R06",
    shelfCode: "S01",
    verificationStatus: "VERIFIED",
    updatedAt: "2026-10-12T06:30:00Z",
  },
  {
    productId: 17, // Farm Potatoes
    storeId: STORE_ID,
    aisleCode: "A02",
    aisleName: "Fresh Produce & Greens",
    rackCode: "R07",
    shelfCode: "S01",
    verificationStatus: "VERIFIED",
    updatedAt: "2026-10-11T12:00:00Z",
  },
  {
    productId: 18, // Fresh Palak (Spinach)
    storeId: STORE_ID,
    aisleCode: "A02",
    aisleName: "Fresh Produce & Greens",
    rackCode: "R08",
    shelfCode: "S01",
    verificationStatus: "UNVERIFIED", // Demo test: unverified
    updatedAt: "2026-10-12T05:45:00Z",
  },

  // ── Snacks (A03) ──
  {
    productId: 11, // Lays Classic Salted
    storeId: STORE_ID,
    aisleCode: "A03",
    aisleName: "Biscuits & Savory Snacks",
    rackCode: "R09",
    shelfCode: "S03",
    verificationStatus: "VERIFIED",
    updatedAt: "2026-10-10T10:00:00Z",
  },
  {
    productId: 12, // Parle-G Gold Biscuits
    storeId: STORE_ID,
    aisleCode: "A03",
    aisleName: "Biscuits & Savory Snacks",
    rackCode: "R10",
    shelfCode: "S02",
    verificationStatus: "VERIFIED",
    updatedAt: "2026-10-10T10:15:00Z",
  },
  {
    productId: 8, // Maggi 2-Min Noodles
    storeId: STORE_ID,
    aisleCode: "A03",
    aisleName: "Biscuits & Savory Snacks",
    rackCode: "R11",
    shelfCode: "S02",
    verificationStatus: "VERIFIED",
    updatedAt: "2026-10-11T14:00:00Z",
  },
  {
    productId: 19, // Kurkure Masala Munch
    storeId: STORE_ID,
    aisleCode: "A03",
    aisleName: "Biscuits & Savory Snacks",
    rackCode: "R09",
    shelfCode: "S02",
    verificationStatus: "VERIFIED",
    updatedAt: "2026-10-10T10:30:00Z",
  },
  {
    productId: 20, // Haldiram Bhujia Sev
    storeId: STORE_ID,
    aisleCode: "A03",
    aisleName: "Biscuits & Savory Snacks",
    rackCode: "R12",
    shelfCode: "S01",
    verificationStatus: "MISSING", // Demo test: missing
    updatedAt: "2026-10-08T09:00:00Z",
  },

  // ── Beverages (A04) ──
  {
    productId: 21, // Coca-Cola Original
    storeId: STORE_ID,
    aisleCode: "A04",
    aisleName: "Beverages & Hot Drinks",
    rackCode: "R13",
    shelfCode: "S01",
    verificationStatus: "VERIFIED",
    updatedAt: "2026-10-11T11:00:00Z",
  },
  {
    productId: 22, // Tropicana Orange Juice
    storeId: STORE_ID,
    aisleCode: "A04",
    aisleName: "Beverages & Hot Drinks",
    rackCode: "R14",
    shelfCode: "S02",
    verificationStatus: "VERIFIED",
    updatedAt: "2026-10-11T11:30:00Z",
  },
  {
    productId: 23, // Red Label Tea
    storeId: STORE_ID,
    aisleCode: "A04",
    aisleName: "Beverages & Hot Drinks",
    rackCode: "R15",
    shelfCode: "S03",
    verificationStatus: "VERIFIED",
    updatedAt: "2026-10-09T15:00:00Z",
  },
  {
    productId: 24, // Nescafe Classic Coffee
    storeId: STORE_ID,
    aisleCode: "A04",
    aisleName: "Beverages & Hot Drinks",
    rackCode: "R16",
    shelfCode: "S02",
    verificationStatus: "VERIFIED",
    updatedAt: "2026-10-09T15:30:00Z",
  },

  // ── Bakery (A05) ──
  {
    productId: 2, // Whole Wheat Bread
    storeId: STORE_ID,
    aisleCode: "A05",
    aisleName: "Bakery & Breads",
    rackCode: "R17",
    shelfCode: "S02",
    verificationStatus: "VERIFIED",
    updatedAt: "2026-10-12T07:00:00Z",
  },
  {
    productId: 25, // Britannia Little Hearts
    storeId: STORE_ID,
    aisleCode: "A05",
    aisleName: "Bakery & Breads",
    rackCode: "R18",
    shelfCode: "S03",
    verificationStatus: "VERIFIED",
    updatedAt: "2026-10-10T16:00:00Z",
  },
  {
    productId: 26, // Garlic Butter Toast
    storeId: STORE_ID,
    aisleCode: "A05",
    aisleName: "Bakery & Breads",
    rackCode: "R19",
    shelfCode: "S02",
    verificationStatus: "UNVERIFIED",
    updatedAt: "2026-10-10T16:30:00Z",
  },

  // ── Personal Care (A06) ──
  {
    productId: 10, // Colgate Toothpaste
    storeId: STORE_ID,
    aisleCode: "A06",
    aisleName: "Personal Care & Hygiene",
    rackCode: "R21",
    shelfCode: "S02",
    verificationStatus: "VERIFIED",
    updatedAt: "2026-10-11T13:00:00Z",
  },
  {
    productId: 27, // Dettol Bathing Soap
    storeId: STORE_ID,
    aisleCode: "A06",
    aisleName: "Personal Care & Hygiene",
    rackCode: "R22",
    shelfCode: "S01",
    verificationStatus: "VERIFIED",
    updatedAt: "2026-10-11T13:30:00Z",
  },
  {
    productId: 28, // Head & Shoulders Shampoo
    storeId: STORE_ID,
    aisleCode: "A06",
    aisleName: "Personal Care & Hygiene",
    rackCode: "R23",
    shelfCode: "S03",
    verificationStatus: "UNVERIFIED",
    updatedAt: "2026-10-11T14:00:00Z",
  },

  // ── Household & Cleaning (A07) ──
  {
    productId: 29, // Surf Excel Detergent
    storeId: STORE_ID,
    aisleCode: "A07",
    aisleName: "Household & Cleaning",
    rackCode: "R25",
    shelfCode: "S01",
    verificationStatus: "VERIFIED",
    updatedAt: "2026-10-08T11:00:00Z",
  },
  {
    productId: 30, // Vim Dishwash Gel
    storeId: STORE_ID,
    aisleCode: "A07",
    aisleName: "Household & Cleaning",
    rackCode: "R26",
    shelfCode: "S02",
    verificationStatus: "MISSING", // Demo test: missing
    updatedAt: "2026-10-07T10:00:00Z",
  },

  // ── Staples & Cooking (A08) ──
  {
    productId: 5, // Basmati Rice (5kg)
    storeId: STORE_ID,
    aisleCode: "A08",
    aisleName: "Staples, Rice & Grains",
    rackCode: "R29",
    shelfCode: "S01",
    verificationStatus: "VERIFIED",
    updatedAt: "2026-10-09T08:00:00Z",
  },
  {
    productId: 7, // Tata Salt (1kg)
    storeId: STORE_ID,
    aisleCode: "A08",
    aisleName: "Staples, Rice & Grains",
    rackCode: "R30",
    shelfCode: "S02",
    verificationStatus: "VERIFIED",
    updatedAt: "2026-10-09T08:30:00Z",
  },
  {
    productId: 9, // Sunflower Oil (1L)
    storeId: STORE_ID,
    aisleCode: "A08",
    aisleName: "Staples, Rice & Grains",
    rackCode: "R31",
    shelfCode: "S01",
    verificationStatus: "VERIFIED",
    updatedAt: "2026-10-09T09:00:00Z",
  },
];

/**
 * Helper: Find aisle definition by code
 */
export function getAisleByCode(code: string): StoreAisleDefinition | undefined {
  return STORE_AISLES.find((a) => a.code.toUpperCase() === code.toUpperCase());
}
