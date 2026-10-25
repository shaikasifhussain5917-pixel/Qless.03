-- ============================================================================
-- QLess Smart Shopping - Baseline Demo Inventory Provisioning
-- Store: STORE001 (QLess Mart)
-- Target: Supabase PostgreSQL
-- Purpose:
--   Provisions the baseline 30-item demo catalog, inventory, aisles, and shelf
--   coordinates required by Phase 8A migration (20261017000000).
--   Enables clean local initialization (supabase db reset) while strictly
--   preserving existing remote database records via ON CONFLICT DO NOTHING.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ENSURE LAUNCH STORE (STORE001)
-- ----------------------------------------------------------------------------
INSERT INTO public.stores (
    id,
    code,
    name,
    chain,
    branch,
    address,
    timing,
    is_active,
    entrance_qr_secret
) VALUES (
    'STORE001',
    'QLM001',
    'QLess Mart',
    'QLess Mart',
    'HSR Layout Flagship',
    '14th Main Road, Sector 4, HSR Layout, Bengaluru, Karnataka 560102',
    '07:00 AM – 11:00 PM',
    true,
    'QLM_SECRET_SIGN_2026'
) ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. INSERT 30 BASELINE MASTER CATALOG PRODUCTS
-- ----------------------------------------------------------------------------
INSERT INTO public.products (id, barcode, name, brand, category, unit_size, emoji, description)
VALUES
    (1, '8901262010053', 'Amul Taaza Toned Milk', 'Amul', 'Dairy', '500 ml', '🥛', 'Pasteurised toned milk with 3.0% fat, fortified with vitamins A & D.'),
    (2, '8901719101014', 'Whole Wheat Bread', 'Britannia', 'Bakery', '400 g', '🍞', 'Freshly baked 100% whole wheat brown bread, high in dietary fiber.'),
    (3, '8901030874322', 'Eggs (12 pcs)', 'Farm Choice', 'Dairy', '12 pcs', '🥚', 'Farm-fresh graded white table eggs, packed with high protein.'),
    (4, '8901072001422', 'Apples (Shimla)', 'Fresh Pick', 'Fruits and Vegetables', '1 kg', '🍎', 'Crisp and juicy Indian Shimla apples, naturally hand-picked.'),
    (5, '8904109600127', 'Basmati Rice (5kg)', 'India Gate', 'Household', '5 kg', '🍚', 'Aged long-grain royal basmati rice for fragrant biryanis and pulao.'),
    (6, '8901063103765', 'Amul Butter', 'Amul', 'Dairy', '100 g', '🧈', 'Classic salted table butter made from wholesome pure milk.'),
    (7, '8901058003345', 'Tata Salt (1kg)', 'Tata', 'Household', '1 kg', '🧂', 'Vacuum evaporated iodised salt for balanced daily nutrition.'),
    (8, '8901058009989', 'Maggi 2-Min Noodles', 'Nestle', 'Snacks', '70 g', '🍜', 'Instant masala noodles crafted with 10 roasted spices.'),
    (9, '8906009510019', 'Sunflower Oil (1L)', 'Fortune', 'Household', '1 L', '🫙', 'Refined light sunflower cooking oil enriched with vitamins A, D & E.'),
    (10, '8718951233256', 'Colgate Toothpaste', 'Colgate', 'Personal Care', '150 g', '🪥', 'Cavity protection toothpaste with calcium and active fluoride.'),
    (11, '8901491503951', 'Lays Classic Salted', 'Lays', 'Snacks', '50 g', '🥔', 'Golden crispy potato chips with a pinch of salt.'),
    (12, '8901063001101', 'Parle-G Gold Biscuits', 'Parle', 'Snacks', '100 g', '🍪', 'India''s beloved glucose biscuits made with milk and wheat.'),
    (13, '8901648002108', 'Mother Dairy Paneer', 'Mother Dairy', 'Dairy', '200 g', '🧀', 'Soft and creamy fresh cottage cheese for rich curries.'),
    (14, '8906070430018', 'Epigamia Greek Yogurt', 'Epigamia', 'Dairy', '120 g', '🥣', 'Real fruit strawberry Greek yogurt with zero preservatives.'),
    (15, '8902041001245', 'Robusta Bananas', 'Fresh Pick', 'Fruits and Vegetables', '1 kg', '🍌', 'Naturally ripened sweet bananas, rich in potassium and energy.'),
    (16, '8903052002356', 'Red Tomatoes', 'Farm Direct', 'Fruits and Vegetables', '1 kg', '🍅', 'Firm, vine-ripened red hybrid tomatoes for daily cooking.'),
    (17, '8904063003467', 'Farm Potatoes', 'Farm Direct', 'Fruits and Vegetables', '1 kg', '🥔', 'Grade-A washed farm potatoes ideal for boiling and frying.'),
    (18, '8905074004578', 'Fresh Palak (Spinach)', 'Fresh Pick', 'Fruits and Vegetables', '250 g', '🥬', 'Tender green farm spinach leaves, freshly harvested.'),
    (19, '8901491101560', 'Kurkure Masala Munch', 'Kurkure', 'Snacks', '85 g', '🥨', 'Crispy crunch sticks seasoned with authentic Indian spices.'),
    (20, '8904004401201', 'Haldiram Bhujia Sev', 'Haldiram', 'Snacks', '400 g', '🍲', 'Spicy crispy moth bean flour noodle snack from Bikaner.'),
    (21, '8901764012204', 'Coca-Cola Original', 'Coca-Cola', 'Beverages', '750 ml', '🥤', 'Refreshing sparkling carbonated beverage.'),
    (22, '8902080005129', 'Tropicana Orange Juice', 'Tropicana', 'Beverages', '1 L', '🧃', '100% pure real orange juice with natural pulp and vitamin C.'),
    (23, '8901030383121', 'Red Label Tea', 'Brooke Bond', 'Beverages', '500 g', '☕', 'Carefully blended Assam tea leaves for unmatched taste and aroma.'),
    (24, '8901058852307', 'Nescafe Classic Coffee', 'Nescafe', 'Beverages', '100 g', '☕', '100% pure instant coffee made from selected Robusta beans.'),
    (25, '8901063014019', 'Britannia Little Hearts', 'Britannia', 'Bakery', '75 g', '❤️', 'Sweet sugar-glazed heart-shaped biscuits with crispy layers.'),
    (26, '8906023401018', 'Garlic Butter Toast', 'BakeHouse', 'Bakery', '200 g', '🥖', 'Crunchy double-baked rusk infused with garlic herb butter.'),
    (27, '8901396001205', 'Dettol Bathing Soap', 'Dettol', 'Personal Care', '3 x 125 g', '🧼', 'Antibacterial protection soap with pine fragrance for daily hygiene.'),
    (28, '8901314010410', 'Head & Shoulders Shampoo', 'P&G', 'Personal Care', '340 ml', '🧴', 'Clinically proven anti-dandruff shampoo with cooling menthol.'),
    (29, '8901030612016', 'Surf Excel Detergent', 'Surf Excel', 'Household', '1 kg', '🧺', 'Easy wash laundry detergent powder for quick tough-stain removal.'),
    (30, '8901030704209', 'Vim Dishwash Gel', 'Vim', 'Household', '500 ml', '🍋', 'Concentrated lemon gel with 100 lemon power to cut grease easily.')
ON CONFLICT (barcode) DO NOTHING;

-- Synchronize sequence
SELECT setval(
    pg_get_serial_sequence('public.products', 'id'),
    COALESCE((SELECT MAX(id) FROM public.products), 1),
    true
);

-- ----------------------------------------------------------------------------
-- 3. INSERT 8 STORE AISLES FOR STORE001
-- ----------------------------------------------------------------------------
INSERT INTO public.store_aisles (store_id, code, name, category, racks, zone, description, walking_order, is_active)
VALUES
    ('STORE001', 'A01', 'Dairy & Refrigerated', 'Dairy', ARRAY['R01', 'R02', 'R03', 'R04'], 'Chilled Perimeter (Left)', 'Refrigerated display cases along the left wall. Temperature controlled at 4°C.', 1, true),
    ('STORE001', 'A02', 'Fresh Produce & Greens', 'Fruits and Vegetables', ARRAY['R05', 'R06', 'R07', 'R08'], 'Entrance Greenery (Front Left)', 'Open misted island racks for fresh fruits and organic greens.', 2, true),
    ('STORE001', 'A03', 'Biscuits & Savory Snacks', 'Snacks', ARRAY['R09', 'R10', 'R11', 'R12'], 'Center Aisle 1', 'Double-sided gondola shelving featuring potato crisps, chips, and tea biscuits.', 3, true),
    ('STORE001', 'A04', 'Beverages & Hot Drinks', 'Beverages', ARRAY['R13', 'R14', 'R15', 'R16'], 'Center Aisle 2', 'Sparkling drinks, tetra juices, loose tea leaves, and premium coffee blends.', 4, true),
    ('STORE001', 'A05', 'Bakery & Breads', 'Bakery', ARRAY['R17', 'R18', 'R19', 'R20'], 'Back Center', 'Daily fresh baked loaves, artisan sourdoughs, cookies, and dry rusks.', 5, true),
    ('STORE001', 'A06', 'Personal Care & Hygiene', 'Personal Care', ARRAY['R21', 'R22', 'R23', 'R24'], 'Center Aisle 3', 'Oral hygiene, soaps, body washes, sanitizers, and haircare products.', 6, true),
    ('STORE001', 'A07', 'Household & Cleaning', 'Household', ARRAY['R25', 'R26', 'R27', 'R28'], 'Right Wall Perimeter', 'Laundry detergents, fabric conditioners, dishwashing gels, and floor cleaners.', 7, true),
    ('STORE001', 'A08', 'Staples, Rice & Grains', 'Household', ARRAY['R29', 'R30', 'R31', 'R32'], 'Back Right Depot', 'Heavy bulk basmati bags, cooking oils, iodised table salts, and pulses.', 8, true)
ON CONFLICT (store_id, code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. INSERT 30 STORE INVENTORY ROWS FOR STORE001
-- ----------------------------------------------------------------------------
INSERT INTO public.store_inventory (store_id, product_id, price, mrp, stock_quantity, is_available)
SELECT 'STORE001', p.id, inv.price, inv.mrp, inv.stock_quantity, true
FROM (
    VALUES
        ('8901262010053', 50.00, 54.00, 45),
        ('8901719101014', 40.00, 45.00, 32),
        ('8901030874322', 72.00, 85.00, 30),
        ('8901072001422', 120.00, 150.00, 35),
        ('8904109600127', 380.00, 440.00, 20),
        ('8901063103765', 55.00, 60.00, 25),
        ('8901058003345', 24.00, 28.00, 85),
        ('8901058009989', 14.00, 14.00, 90),
        ('8906009510019', 148.00, 170.00, 25),
        ('8718951233256', 99.00, 115.00, 30),
        ('8901491503951', 20.00, 20.00, 80),
        ('8901063001101', 10.00, 10.00, 100),
        ('8901648002108', 92.00, 100.00, 18),
        ('8906070430018', 60.00, 65.00, 20),
        ('8902041001245', 48.00, 55.00, 40),
        ('8903052002356', 35.00, 40.00, 50),
        ('8904063003467', 32.00, 38.00, 60),
        ('8905074004578', 25.00, 30.00, 24),
        ('8901491101560', 20.00, 20.00, 75),
        ('8904004401201', 115.00, 130.00, 22),
        ('8901764012204', 40.00, 45.00, 36),
        ('8902080005129', 125.00, 145.00, 15),
        ('8901030383121', 240.00, 265.00, 28),
        ('8901058852307', 320.00, 360.00, 12),
        ('8901063014019', 25.00, 25.00, 45),
        ('8906023401018', 65.00, 75.00, 16),
        ('8901396001205', 165.00, 190.00, 25),
        ('8901314010410', 340.00, 399.00, 14),
        ('8901030612016', 140.00, 155.00, 22),
        ('8901030704209', 110.00, 125.00, 28)
) AS inv(barcode, price, mrp, stock_quantity)
JOIN public.products p ON p.barcode = inv.barcode
ON CONFLICT (store_id, product_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. INSERT 30 PRODUCT LOCATIONS FOR STORE001
-- ----------------------------------------------------------------------------
INSERT INTO public.product_locations (store_id, product_id, aisle_code, aisle_name, rack_code, shelf_code, verification_status, notes)
SELECT 'STORE001', p.id, loc.aisle_code, loc.aisle_name, loc.rack_code, loc.shelf_code, loc.verification_status, loc.notes
FROM (
    VALUES
        ('8901262010053', 'A01', 'Dairy & Refrigerated', 'R02', 'S01', 'VERIFIED', 'Chilled display tier 1, milk crate row'),
        ('8901030874322', 'A01', 'Dairy & Refrigerated', 'R01', 'S02', 'VERIFIED', 'Eye level shelf, protective cartons'),
        ('8901063103765', 'A01', 'Dairy & Refrigerated', 'R03', 'S02', 'VERIFIED', NULL::text),
        ('8901648002108', 'A01', 'Dairy & Refrigerated', 'R03', 'S03', 'MISSING', 'Recently restocked pending shelf allocation'),
        ('8906070430018', 'A01', 'Dairy & Refrigerated', 'R04', 'S02', 'UNVERIFIED', 'Shifted during morning shelf reorganisation'),
        ('8901072001422', 'A02', 'Fresh Produce & Greens', 'R05', 'S01', 'VERIFIED', 'Front wooden crate tray'),
        ('8902041001245', 'A02', 'Fresh Produce & Greens', 'R05', 'S02', 'VERIFIED', NULL::text),
        ('8903052002356', 'A02', 'Fresh Produce & Greens', 'R06', 'S01', 'VERIFIED', NULL::text),
        ('8904063003467', 'A02', 'Fresh Produce & Greens', 'R07', 'S01', 'VERIFIED', NULL::text),
        ('8905074004578', 'A02', 'Fresh Produce & Greens', 'R08', 'S01', 'UNVERIFIED', NULL::text),
        ('8901491503951', 'A03', 'Biscuits & Savory Snacks', 'R09', 'S03', 'VERIFIED', NULL::text),
        ('8901063001101', 'A03', 'Biscuits & Savory Snacks', 'R10', 'S02', 'VERIFIED', NULL::text),
        ('8901058009989', 'A03', 'Biscuits & Savory Snacks', 'R11', 'S02', 'VERIFIED', NULL::text),
        ('8901491101560', 'A03', 'Biscuits & Savory Snacks', 'R09', 'S02', 'VERIFIED', NULL::text),
        ('8904004401201', 'A03', 'Biscuits & Savory Snacks', 'R12', 'S01', 'MISSING', NULL::text),
        ('8901764012204', 'A04', 'Beverages & Hot Drinks', 'R13', 'S01', 'VERIFIED', NULL::text),
        ('8902080005129', 'A04', 'Beverages & Hot Drinks', 'R14', 'S02', 'VERIFIED', NULL::text),
        ('8901030383121', 'A04', 'Beverages & Hot Drinks', 'R15', 'S03', 'VERIFIED', NULL::text),
        ('8901058852307', 'A04', 'Beverages & Hot Drinks', 'R16', 'S02', 'VERIFIED', NULL::text),
        ('8901719101014', 'A05', 'Bakery & Breads', 'R17', 'S02', 'VERIFIED', NULL::text),
        ('8901063014019', 'A05', 'Bakery & Breads', 'R18', 'S03', 'VERIFIED', NULL::text),
        ('8906023401018', 'A05', 'Bakery & Breads', 'R19', 'S02', 'UNVERIFIED', NULL::text),
        ('8718951233256', 'A06', 'Personal Care & Hygiene', 'R21', 'S02', 'VERIFIED', NULL::text),
        ('8901396001205', 'A06', 'Personal Care & Hygiene', 'R22', 'S01', 'VERIFIED', NULL::text),
        ('8901314010410', 'A06', 'Personal Care & Hygiene', 'R23', 'S03', 'UNVERIFIED', NULL::text),
        ('8904109600127', 'A08', 'Staples, Rice & Grains', 'R29', 'S01', 'VERIFIED', NULL::text),
        ('8901058003345', 'A08', 'Staples, Rice & Grains', 'R30', 'S02', 'VERIFIED', NULL::text),
        ('8906009510019', 'A08', 'Staples, Rice & Grains', 'R31', 'S01', 'VERIFIED', NULL::text),
        ('8901030612016', 'A07', 'Household & Cleaning', 'R25', 'S01', 'VERIFIED', NULL::text),
        ('8901030704209', 'A07', 'Household & Cleaning', 'R26', 'S02', 'MISSING', NULL::text)
) AS loc(barcode, aisle_code, aisle_name, rack_code, shelf_code, verification_status, notes)
JOIN public.products p ON p.barcode = loc.barcode
ON CONFLICT (store_id, product_id) DO NOTHING;
