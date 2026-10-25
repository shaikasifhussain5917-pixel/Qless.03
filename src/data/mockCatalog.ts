import type { CartItem, Product, ProductCategory } from "../types/index.ts";

export const SESSION_ID = "A123";
export const RECEIPT_ID = "#QL12345";

export const INITIAL_ITEMS: CartItem[] = [
  { id: 1, name: "Milk", price: 50, quantity: 1 },
  { id: 2, name: "Bread", price: 40, quantity: 1 },
];

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  "All",
  "Dairy",
  "Fruits and Vegetables",
  "Snacks",
  "Beverages",
  "Bakery",
  "Personal Care",
  "Household",
];

export const MOCK_PRODUCTS: Product[] = [
  // ── Dairy ──
  {
    id: 1,
    name: "Amul Taaza Toned Milk",
    price: 50,
    mrp: 54,
    discountBadge: "7% OFF",
    unitSize: "500 ml",
    barcode: "8901262010053",
    category: "Dairy",
    emoji: "🥛",
    description: "Pasteurised toned milk with 3.0% fat, fortified with vitamins A & D.",
  },
  {
    id: 3,
    name: "Eggs (12 pcs)",
    price: 72,
    mrp: 85,
    discountBadge: "15% OFF",
    unitSize: "12 pcs",
    barcode: "8901030874322",
    category: "Dairy",
    emoji: "🥚",
    description: "Farm-fresh graded white table eggs, packed with high protein.",
  },
  {
    id: 6,
    name: "Amul Butter",
    price: 55,
    mrp: 60,
    discountBadge: "₹5 OFF",
    unitSize: "100 g",
    barcode: "8901063103765",
    category: "Dairy",
    emoji: "🧈",
    description: "Classic salted table butter made from wholesome pure milk.",
  },
  {
    id: 13,
    name: "Mother Dairy Paneer",
    price: 92,
    mrp: 100,
    discountBadge: "8% OFF",
    unitSize: "200 g",
    barcode: "8901648002108",
    category: "Dairy",
    emoji: "🧀",
    description: "Soft and creamy fresh cottage cheese for rich curries.",
  },
  {
    id: 14,
    name: "Epigamia Greek Yogurt",
    price: 60,
    mrp: 65,
    discountBadge: "₹5 OFF",
    unitSize: "120 g",
    barcode: "8906070430018",
    category: "Dairy",
    emoji: "🥣",
    description: "Real fruit strawberry Greek yogurt with zero preservatives.",
  },

  // ── Fruits and Vegetables ──
  {
    id: 4,
    name: "Apples (Shimla)",
    price: 120,
    mrp: 150,
    discountBadge: "20% OFF",
    unitSize: "1 kg",
    barcode: "8901072001422",
    category: "Fruits and Vegetables",
    emoji: "🍎",
    description: "Crisp and juicy Indian Shimla apples, naturally hand-picked.",
  },
  {
    id: 15,
    name: "Robusta Bananas",
    price: 48,
    mrp: 55,
    discountBadge: "12% OFF",
    unitSize: "1 kg",
    barcode: "8902041001245",
    category: "Fruits and Vegetables",
    emoji: "🍌",
    description: "Naturally ripened sweet bananas, rich in potassium and energy.",
  },
  {
    id: 16,
    name: "Red Tomatoes",
    price: 35,
    mrp: 40,
    discountBadge: "₹5 OFF",
    unitSize: "1 kg",
    barcode: "8903052002356",
    category: "Fruits and Vegetables",
    emoji: "🍅",
    description: "Firm, vine-ripened red hybrid tomatoes for daily cooking.",
  },
  {
    id: 17,
    name: "Farm Potatoes",
    price: 32,
    mrp: 38,
    discountBadge: "15% OFF",
    unitSize: "1 kg",
    barcode: "8904063003467",
    category: "Fruits and Vegetables",
    emoji: "🥔",
    description: "Grade-A washed farm potatoes ideal for boiling and frying.",
  },
  {
    id: 18,
    name: "Fresh Palak (Spinach)",
    price: 25,
    mrp: 30,
    discountBadge: "16% OFF",
    unitSize: "250 g",
    barcode: "8905074004578",
    category: "Fruits and Vegetables",
    emoji: "🥬",
    description: "Tender green farm spinach leaves, freshly harvested.",
  },

  // ── Snacks ──
  {
    id: 11,
    name: "Lays Classic Salted",
    price: 20,
    mrp: 20,
    unitSize: "50 g",
    barcode: "8901491503951",
    category: "Snacks",
    emoji: "🥔",
    description: "Golden crispy potato chips with a pinch of salt.",
  },
  {
    id: 12,
    name: "Parle-G Gold Biscuits",
    price: 10,
    mrp: 10,
    unitSize: "100 g",
    barcode: "8901063001101",
    category: "Snacks",
    emoji: "🍪",
    description: "India's beloved glucose biscuits made with milk and wheat.",
  },
  {
    id: 8,
    name: "Maggi 2-Min Noodles",
    price: 14,
    mrp: 14,
    unitSize: "70 g",
    barcode: "8901058009989",
    category: "Snacks",
    emoji: "🍜",
    description: "Instant masala noodles crafted with 10 roasted spices.",
  },
  {
    id: 19,
    name: "Kurkure Masala Munch",
    price: 20,
    mrp: 20,
    unitSize: "85 g",
    barcode: "8901491101560",
    category: "Snacks",
    emoji: "🥨",
    description: "Crispy crunch sticks seasoned with authentic Indian spices.",
  },
  {
    id: 20,
    name: "Haldiram Bhujia Sev",
    price: 115,
    mrp: 130,
    discountBadge: "11% OFF",
    unitSize: "400 g",
    barcode: "8904004401201",
    category: "Snacks",
    emoji: "🍲",
    description: "Spicy crispy moth bean flour noodle snack from Bikaner.",
  },

  // ── Beverages ──
  {
    id: 21,
    name: "Coca-Cola Original",
    price: 40,
    mrp: 45,
    discountBadge: "₹5 OFF",
    unitSize: "750 ml",
    barcode: "8901764012204",
    category: "Beverages",
    emoji: "🥤",
    description: "Refreshing sparkling carbonated beverage.",
  },
  {
    id: 22,
    name: "Tropicana Orange Juice",
    price: 125,
    mrp: 145,
    discountBadge: "14% OFF",
    unitSize: "1 L",
    barcode: "8902080005129",
    category: "Beverages",
    emoji: "🧃",
    description: "100% pure real orange juice with natural pulp and vitamin C.",
  },
  {
    id: 23,
    name: "Red Label Tea",
    price: 240,
    mrp: 265,
    discountBadge: "₹25 OFF",
    unitSize: "500 g",
    barcode: "8901030383121",
    category: "Beverages",
    emoji: "☕",
    description: "Carefully blended Assam tea leaves for unmatched taste and aroma.",
  },
  {
    id: 24,
    name: "Nescafe Classic Coffee",
    price: 320,
    mrp: 360,
    discountBadge: "11% OFF",
    unitSize: "100 g",
    barcode: "8901058852307",
    category: "Beverages",
    emoji: "☕",
    description: "100% pure instant coffee made from selected Robusta beans.",
  },

  // ── Bakery ──
  {
    id: 2,
    name: "Whole Wheat Bread",
    price: 40,
    mrp: 45,
    discountBadge: "₹5 OFF",
    unitSize: "400 g",
    barcode: "8901719101014",
    category: "Bakery",
    emoji: "🍞",
    description: "Freshly baked 100% whole wheat brown bread, high in dietary fiber.",
  },
  {
    id: 25,
    name: "Britannia Little Hearts",
    price: 25,
    mrp: 25,
    unitSize: "75 g",
    barcode: "8901063014019",
    category: "Bakery",
    emoji: "❤️",
    description: "Sweet sugar-glazed heart-shaped biscuits with crispy layers.",
  },
  {
    id: 26,
    name: "Garlic Butter Toast",
    price: 65,
    mrp: 75,
    discountBadge: "13% OFF",
    unitSize: "200 g",
    barcode: "8906023401018",
    category: "Bakery",
    emoji: "🥖",
    description: "Crunchy double-baked rusk infused with garlic herb butter.",
  },

  // ── Personal Care ──
  {
    id: 10,
    name: "Colgate Toothpaste",
    price: 99,
    mrp: 115,
    discountBadge: "14% OFF",
    unitSize: "150 g",
    barcode: "8718951233256",
    category: "Personal Care",
    emoji: "🪥",
    description: "Cavity protection toothpaste with calcium and active fluoride.",
  },
  {
    id: 27,
    name: "Dettol Bathing Soap",
    price: 165,
    mrp: 190,
    discountBadge: "13% OFF",
    unitSize: "3 x 125 g",
    barcode: "8901396001205",
    category: "Personal Care",
    emoji: "🧼",
    description: "Antibacterial protection soap with pine fragrance for daily hygiene.",
  },
  {
    id: 28,
    name: "Head & Shoulders Shampoo",
    price: 340,
    mrp: 399,
    discountBadge: "15% OFF",
    unitSize: "340 ml",
    barcode: "8901314010410",
    category: "Personal Care",
    emoji: "🧴",
    description: "Clinically proven anti-dandruff shampoo with cooling menthol.",
  },

  // ── Household ──
  {
    id: 5,
    name: "Basmati Rice (5kg)",
    price: 380,
    mrp: 440,
    discountBadge: "13% OFF",
    unitSize: "5 kg",
    barcode: "8904109600127",
    category: "Household",
    emoji: "🍚",
    description: "Aged long-grain royal basmati rice for fragrant biryanis and pulao.",
  },
  {
    id: 7,
    name: "Tata Salt (1kg)",
    price: 24,
    mrp: 28,
    discountBadge: "₹4 OFF",
    unitSize: "1 kg",
    barcode: "8901058003345",
    category: "Household",
    emoji: "🧂",
    description: "Vacuum evaporated iodised salt for balanced daily nutrition.",
  },
  {
    id: 9,
    name: "Sunflower Oil (1L)",
    price: 148,
    mrp: 170,
    discountBadge: "13% OFF",
    unitSize: "1 L",
    barcode: "8906009510019",
    category: "Household",
    emoji: "🫙",
    description: "Refined light sunflower cooking oil enriched with vitamins A, D & E.",
  },
  {
    id: 29,
    name: "Surf Excel Detergent",
    price: 140,
    mrp: 155,
    discountBadge: "10% OFF",
    unitSize: "1 kg",
    barcode: "8901030612016",
    category: "Household",
    emoji: "🧺",
    description: "Easy wash laundry detergent powder for quick tough-stain removal.",
  },
  {
    id: 30,
    name: "Vim Dishwash Gel",
    price: 110,
    mrp: 125,
    discountBadge: "12% OFF",
    unitSize: "500 ml",
    barcode: "8901030704209",
    category: "Household",
    emoji: "🍋",
    description: "Concentrated lemon gel with 100 lemon power to cut grease easily.",
  },
];

export const PAYMENT_LABELS = {
  upi: "UPI (GPay / PhonePe)",
  card: "Credit / Debit Card",
  wallet: "QLESS Wallet",
} as const;

import { getProductCatalog } from "../utils/productStorage.ts";

/**
 * Helper: Find product by exact barcode match (searches persistent stored catalog)
 */
export function findProductByBarcode(barcode: string): Product | undefined {
  const clean = barcode.trim().replace(/[\s-]/g, "");
  const catalog = getProductCatalog();
  return catalog.find((p) => p.barcode.replace(/[\s-]/g, "") === clean) ||
    MOCK_PRODUCTS.find((p) => p.barcode.replace(/[\s-]/g, "") === clean);
}

/**
 * Helper: Search products by name, category, or barcode from stored catalog
 */
export function searchMockProducts(query: string, category: ProductCategory = "All"): Product[] {
  const q = query.trim().toLowerCase();
  const catalog = getProductCatalog();
  return catalog.filter((product) => {
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
}
