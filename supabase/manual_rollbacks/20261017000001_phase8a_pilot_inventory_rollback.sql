-- ============================================================================
-- QLess Smart Shopping - Phase 8A Rollback: Lossless Demo Catalog Restoration
-- Store: STORE001 (QLess Mart)
-- Description:
--   MANUAL OPERATIONAL RECOVERY SCRIPT - DO NOT EXECUTE AS A MIGRATION
--   This script is kept in supabase/manual_rollbacks/ to prevent Supabase CLI
--   from running it automatically during database migrations or resets.
--
--   1. Locks tables in SHARE ROW EXCLUSIVE mode.
--   2. Validates existence, full column sets, and row counts of all 3 backup tables.
--   3. Pre-check: Explicitly detects missing baseline master products, demo inventory,
--      or demo locations, and hard-aborts if any are missing.
--   4. Pre-check: Detects if demo inventory underwent subsequent stock or price
--      modifications after migration commit, and hard-aborts to prevent silent overwrites.
--   5. Pre-check: Detects if demo locations or master product metadata were modified,
--      or if rogue records exist, and hard-aborts.
--   6. Deletes all 5 pilot product locations for STORE001.
--   7. Restores demo inventory availability and stock quantity to backup values.
--   8. Deletes all 5 pilot store_inventory records for STORE001.
--   9. Cleans up pilot master products: preserves any product referenced by order_items
--      to protect customer receipts; safely deletes unreferenced pilot products.
--  10. Omits sequence alteration to prevent concurrency contention and ID collisions.
--  11. Asserts exact catalog state: exactly 30 items, 0 missing, 0 extra, 0 mismatches.
-- ============================================================================

BEGIN;

-- 1. Table-Level Locks (Ordered consistently to prevent deadlocks)
LOCK TABLE public.products IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.store_inventory IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.product_locations IN SHARE ROW EXCLUSIVE MODE;

-- 2. Backup Validation: Verify Existence, Full Column Sets, and Baseline Row Counts
DO $$
DECLARE
    v_inv_backup_count INT;
    v_loc_backup_count INT;
    v_prod_backup_count INT;
    v_missing_col_count INT;
BEGIN
    -- Verify all 3 backup tables exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'store_inventory_backup_phase8a') THEN
        RAISE EXCEPTION 'Rollback aborted: store_inventory_backup_phase8a does not exist.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'product_locations_backup_phase8a') THEN
        RAISE EXCEPTION 'Rollback aborted: product_locations_backup_phase8a does not exist.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products_backup_phase8a') THEN
        RAISE EXCEPTION 'Rollback aborted: products_backup_phase8a does not exist.';
    END IF;

    -- Verify required columns in store_inventory_backup_phase8a
    SELECT COUNT(*) INTO v_missing_col_count
    FROM (
        VALUES ('id'), ('store_id'), ('product_id'), ('price'), ('mrp'), ('stock_quantity'), ('is_available'), ('updated_at')
    ) AS req(col)
    LEFT JOIN information_schema.columns c 
      ON c.table_schema = 'public' AND c.table_name = 'store_inventory_backup_phase8a' AND c.column_name = req.col
    WHERE c.column_name IS NULL;

    IF v_missing_col_count > 0 THEN
        RAISE EXCEPTION 'Rollback aborted: store_inventory_backup_phase8a is missing required columns.';
    END IF;

    -- Verify required columns in product_locations_backup_phase8a
    SELECT COUNT(*) INTO v_missing_col_count
    FROM (
        VALUES ('id'), ('store_id'), ('product_id'), ('aisle_code'), ('aisle_name'), ('rack_code'), ('shelf_code'), ('verification_status'), ('notes'), ('created_at'), ('updated_at')
    ) AS req(col)
    LEFT JOIN information_schema.columns c 
      ON c.table_schema = 'public' AND c.table_name = 'product_locations_backup_phase8a' AND c.column_name = req.col
    WHERE c.column_name IS NULL;

    IF v_missing_col_count > 0 THEN
        RAISE EXCEPTION 'Rollback aborted: product_locations_backup_phase8a is missing required columns.';
    END IF;

    -- Verify required columns in products_backup_phase8a
    SELECT COUNT(*) INTO v_missing_col_count
    FROM (
        VALUES ('id'), ('barcode'), ('name'), ('brand'), ('category'), ('unit_size'), ('emoji'), ('description'), ('created_at')
    ) AS req(col)
    LEFT JOIN information_schema.columns c 
      ON c.table_schema = 'public' AND c.table_name = 'products_backup_phase8a' AND c.column_name = req.col
    WHERE c.column_name IS NULL;

    IF v_missing_col_count > 0 THEN
        RAISE EXCEPTION 'Rollback aborted: products_backup_phase8a is missing required columns.';
    END IF;

    -- Verify baseline row counts
    SELECT COUNT(*) INTO v_inv_backup_count FROM public.store_inventory_backup_phase8a;
    IF v_inv_backup_count <> 30 THEN
        RAISE EXCEPTION 'Rollback aborted: store_inventory_backup_phase8a contains % rows, expected exactly 30', v_inv_backup_count;
    END IF;

    SELECT COUNT(*) INTO v_loc_backup_count FROM public.product_locations_backup_phase8a;
    IF v_loc_backup_count <> 30 THEN
        RAISE EXCEPTION 'Rollback aborted: product_locations_backup_phase8a contains % rows, expected exactly 30', v_loc_backup_count;
    END IF;

    SELECT COUNT(*) INTO v_prod_backup_count FROM public.products_backup_phase8a;
    IF v_prod_backup_count < 30 THEN
        RAISE EXCEPTION 'Rollback aborted: products_backup_phase8a contains % rows, expected at least 30', v_prod_backup_count;
    END IF;
END $$;

-- 3. Pre-Restoration Precondition Checks: Missing Baseline & Conflict Abort
DO $$
DECLARE
    v_missing_prod_count INT;
    v_missing_inv_count INT;
    v_missing_loc_count INT;
    v_subsequent_stock_mod_count INT;
    v_inv_pricing_conflict_count INT;
    v_metadata_conflict_count INT;
    v_unexpected_prod_count INT;
    v_rogue_inv_count INT;
    v_loc_conflict_count INT;
    v_rogue_loc_count INT;
BEGIN
    -- Check 1: Detect missing original products
    SELECT COUNT(*) INTO v_missing_prod_count
    FROM public.products_backup_phase8a b
    LEFT JOIN public.products p ON b.id = p.id
    WHERE p.id IS NULL;

    IF v_missing_prod_count > 0 THEN
        RAISE EXCEPTION 'Rollback safety abort: % original product(s) missing from public.products. Manual DBA recovery required.', v_missing_prod_count;
    END IF;

    -- Check 2: Detect missing original demo inventory records
    SELECT COUNT(*) INTO v_missing_inv_count
    FROM public.store_inventory_backup_phase8a b
    LEFT JOIN public.store_inventory si ON b.id = si.id
    WHERE si.id IS NULL;

    IF v_missing_inv_count > 0 THEN
        RAISE EXCEPTION 'Rollback safety abort: % original demo inventory record(s) missing from public.store_inventory. Manual DBA recovery required.', v_missing_inv_count;
    END IF;

    -- Check 3: Detect missing original demo location records
    SELECT COUNT(*) INTO v_missing_loc_count
    FROM public.product_locations_backup_phase8a b
    LEFT JOIN public.product_locations pl ON b.id = pl.id
    WHERE pl.id IS NULL;

    IF v_missing_loc_count > 0 THEN
        RAISE EXCEPTION 'Rollback safety abort: % original demo location record(s) missing from public.product_locations. Manual DBA recovery required.', v_missing_loc_count;
    END IF;

    -- Check 4: Distinguish migration state from subsequent stock/availability changes
    -- Phase 8A set demo inventory to stock_quantity = 0 and is_available = false.
    -- If any row has stock_quantity <> 0 OR is_available = true, a subsequent adjustment occurred!
    SELECT COUNT(*) INTO v_subsequent_stock_mod_count
    FROM public.store_inventory si
    JOIN public.store_inventory_backup_phase8a b ON si.id = b.id
    WHERE si.stock_quantity <> 0 
       OR si.is_available <> false;

    IF v_subsequent_stock_mod_count > 0 THEN
        RAISE EXCEPTION 'Rollback safety abort: Detected % demo inventory record(s) with subsequent stock or availability modifications made after migration. Rollback will not silently overwrite them. Manual review required.', v_subsequent_stock_mod_count;
    END IF;

    -- Check 5: Ensure demo inventory price, MRP, and store/product mappings were not modified
    SELECT COUNT(*) INTO v_inv_pricing_conflict_count
    FROM public.store_inventory si
    JOIN public.store_inventory_backup_phase8a b ON si.id = b.id
    WHERE si.price IS DISTINCT FROM b.price
       OR si.mrp IS DISTINCT FROM b.mrp
       OR si.product_id IS DISTINCT FROM b.product_id
       OR si.store_id IS DISTINCT FROM b.store_id;

    IF v_inv_pricing_conflict_count > 0 THEN
        RAISE EXCEPTION 'Rollback safety abort: Detected % demo inventory record(s) with price/MRP/mapping changes made after backup. Rollback will not silently overwrite them. Manual review required.', v_inv_pricing_conflict_count;
    END IF;

    -- Check 6: Ensure no demo product location was modified after backup
    SELECT COUNT(*) INTO v_loc_conflict_count
    FROM public.product_locations pl
    JOIN public.product_locations_backup_phase8a b ON pl.id = b.id
    WHERE pl.aisle_code IS DISTINCT FROM b.aisle_code
       OR pl.aisle_name IS DISTINCT FROM b.aisle_name
       OR pl.rack_code IS DISTINCT FROM b.rack_code
       OR pl.shelf_code IS DISTINCT FROM b.shelf_code
       OR pl.verification_status IS DISTINCT FROM b.verification_status
       OR pl.notes IS DISTINCT FROM b.notes
       OR pl.product_id IS DISTINCT FROM b.product_id
       OR pl.store_id IS DISTINCT FROM b.store_id;

    IF v_loc_conflict_count > 0 THEN
        RAISE EXCEPTION 'Rollback safety abort: Detected % demo product_location record(s) modified after backup. Rollback will not silently overwrite them. Manual review required.', v_loc_conflict_count;
    END IF;

    -- Check 7: Ensure no original product metadata was modified after backup
    SELECT COUNT(*) INTO v_metadata_conflict_count
    FROM public.products_backup_phase8a b
    JOIN public.products p ON b.id = p.id
    WHERE p.barcode IS DISTINCT FROM b.barcode
       OR p.name IS DISTINCT FROM b.name
       OR p.brand IS DISTINCT FROM b.brand
       OR p.category IS DISTINCT FROM b.category
       OR p.unit_size IS DISTINCT FROM b.unit_size
       OR p.emoji IS DISTINCT FROM b.emoji
       OR p.description IS DISTINCT FROM b.description
       OR p.created_at IS DISTINCT FROM b.created_at;

    IF v_metadata_conflict_count > 0 THEN
        RAISE EXCEPTION 'Rollback safety abort: Detected % original product record(s) with altered metadata after backup. Rollback will not silently overwrite them. Manual review required.', v_metadata_conflict_count;
    END IF;

    -- Check 8: Conflict Abort on unexpected master products (neither in backup nor among 5 pilot barcodes)
    SELECT COUNT(*) INTO v_unexpected_prod_count
    FROM public.products p
    LEFT JOIN public.products_backup_phase8a b ON p.id = b.id
    WHERE b.id IS NULL
      AND p.barcode NOT IN ('8904091129461', '8939135890892', '8906131443568', '8908018324588', '8906105470095');

    IF v_unexpected_prod_count > 0 THEN
        RAISE EXCEPTION 'Rollback safety abort: Detected % unexpected master product(s) in public.products not created by Phase 8A. Manual DBA investigation required.', v_unexpected_prod_count;
    END IF;

    -- Check 9: Conflict Abort on rogue inventory in STORE001 (beyond original 30 demo + 5 pilot)
    SELECT COUNT(*) INTO v_rogue_inv_count
    FROM public.store_inventory si
    LEFT JOIN public.store_inventory_backup_phase8a b ON si.id = b.id
    JOIN public.products p ON si.product_id = p.id
    WHERE si.store_id = 'STORE001'
      AND b.id IS NULL
      AND p.barcode NOT IN ('8904091129461', '8939135890892', '8906131443568', '8908018324588', '8906105470095');

    IF v_rogue_inv_count > 0 THEN
        RAISE EXCEPTION 'Rollback safety abort: Detected % unexpected inventory record(s) in STORE001 not created by Phase 8A.', v_rogue_inv_count;
    END IF;

    -- Check 10: Conflict Abort on rogue locations in STORE001 (beyond original 30 demo + 5 pilot)
    SELECT COUNT(*) INTO v_rogue_loc_count
    FROM public.product_locations pl
    LEFT JOIN public.product_locations_backup_phase8a b ON pl.id = b.id
    JOIN public.products p ON pl.product_id = p.id
    WHERE pl.store_id = 'STORE001'
      AND b.id IS NULL
      AND p.barcode NOT IN ('8904091129461', '8939135890892', '8906131443568', '8908018324588', '8906105470095');

    IF v_rogue_loc_count > 0 THEN
        RAISE EXCEPTION 'Rollback safety abort: Detected % unexpected location record(s) in STORE001 not created by Phase 8A.', v_rogue_loc_count;
    END IF;
END $$;

-- 4. Delete All 5 Pilot Product Locations for STORE001
DELETE FROM public.product_locations
WHERE store_id = 'STORE001'
  AND product_id IN (
      SELECT id FROM public.products 
      WHERE barcode IN ('8904091129461', '8939135890892', '8906131443568', '8908018324588', '8906105470095')
  );

-- 5. Restore Demo Inventory Availability and Stock Quantities
UPDATE public.store_inventory si
SET stock_quantity = b.stock_quantity,
    is_available = b.is_available,
    updated_at = b.updated_at
FROM public.store_inventory_backup_phase8a b
WHERE si.id = b.id;

-- 6. Delete All 5 Pilot Store Inventory Rows for STORE001
DELETE FROM public.store_inventory
WHERE store_id = 'STORE001'
  AND product_id IN (
      SELECT id FROM public.products 
      WHERE barcode IN ('8904091129461', '8939135890892', '8906131443568', '8908018324588', '8906105470095')
  );

-- 7. FK-Safe Master Product Clean-up
-- Delete pilot products ONLY if NOT referenced by any order_items (preserves order history)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT id, barcode, name 
        FROM public.products 
        WHERE barcode IN ('8904091129461', '8939135890892', '8906131443568', '8908018324588', '8906105470095')
    ) LOOP
        IF EXISTS (SELECT 1 FROM public.order_items WHERE product_id = r.id) THEN
            RAISE NOTICE 'Preserving master product % (Barcode %) because historical order_items reference it.', r.name, r.barcode;
        ELSE
            DELETE FROM public.products WHERE id = r.id;
            RAISE NOTICE 'Safely removed unreferenced master product % (Barcode %).', r.name, r.barcode;
        END IF;
    END LOOP;
END $$;

-- 8. Comprehensive Rollback Assertions: Missing, Extra, and Value Discrepancies
DO $$
DECLARE
    v_catalog_count INT;
    v_missing_inv_count INT;
    v_extra_inv_count INT;
    v_inv_diff_count INT;
    v_missing_loc_count INT;
    v_extra_loc_count INT;
    v_loc_diff_count INT;
BEGIN
    -- Check 1: Catalog row count is exactly 30 (Valid even if pilot products remain in products table)
    SELECT COUNT(*) INTO v_catalog_count 
    FROM public.customer_store_catalog 
    WHERE store_id = 'STORE001';

    IF v_catalog_count <> 30 THEN
        RAISE EXCEPTION 'Rollback assertion failed: Expected 30 active items in customer catalog, found %', v_catalog_count;
    END IF;

    -- Check 2: Missing inventory rows
    SELECT COUNT(*) INTO v_missing_inv_count
    FROM public.store_inventory_backup_phase8a b
    LEFT JOIN public.store_inventory si ON b.id = si.id
    WHERE si.id IS NULL;

    IF v_missing_inv_count > 0 THEN
        RAISE EXCEPTION 'Rollback assertion failed: % original inventory rows missing', v_missing_inv_count;
    END IF;

    -- Check 3: Unexpected extra inventory rows in STORE001
    SELECT COUNT(*) INTO v_extra_inv_count
    FROM public.store_inventory si
    LEFT JOIN public.store_inventory_backup_phase8a b ON si.id = b.id
    WHERE si.store_id = 'STORE001' AND b.id IS NULL;

    IF v_extra_inv_count > 0 THEN
        RAISE EXCEPTION 'Rollback assertion failed: % unexpected extra inventory rows in STORE001', v_extra_inv_count;
    END IF;

    -- Check 4: Null-safe inventory value equality (All 8 columns)
    SELECT COUNT(*) INTO v_inv_diff_count
    FROM public.store_inventory si
    JOIN public.store_inventory_backup_phase8a b ON si.id = b.id
    WHERE si.store_id IS DISTINCT FROM b.store_id
       OR si.product_id IS DISTINCT FROM b.product_id
       OR si.price IS DISTINCT FROM b.price
       OR si.mrp IS DISTINCT FROM b.mrp
       OR si.stock_quantity IS DISTINCT FROM b.stock_quantity
       OR si.is_available IS DISTINCT FROM b.is_available
       OR si.updated_at IS DISTINCT FROM b.updated_at;

    IF v_inv_diff_count > 0 THEN
        RAISE EXCEPTION 'Rollback assertion failed: % inventory rows do not match backup baseline', v_inv_diff_count;
    END IF;

    -- Check 5: Missing location rows
    SELECT COUNT(*) INTO v_missing_loc_count
    FROM public.product_locations_backup_phase8a b
    LEFT JOIN public.product_locations pl ON b.id = pl.id
    WHERE pl.id IS NULL;

    IF v_missing_loc_count > 0 THEN
        RAISE EXCEPTION 'Rollback assertion failed: % original location rows missing', v_missing_loc_count;
    END IF;

    -- Check 6: Unexpected extra location rows in STORE001
    SELECT COUNT(*) INTO v_extra_loc_count
    FROM public.product_locations pl
    LEFT JOIN public.product_locations_backup_phase8a b ON pl.id = b.id
    WHERE pl.store_id = 'STORE001' AND b.id IS NULL;

    IF v_extra_loc_count > 0 THEN
        RAISE EXCEPTION 'Rollback assertion failed: % unexpected extra location rows in STORE001', v_extra_loc_count;
    END IF;

    -- Check 7: Null-safe location value equality (All 11 columns)
    SELECT COUNT(*) INTO v_loc_diff_count
    FROM public.product_locations pl
    JOIN public.product_locations_backup_phase8a b ON pl.id = b.id
    WHERE pl.store_id IS DISTINCT FROM b.store_id
       OR pl.product_id IS DISTINCT FROM b.product_id
       OR pl.aisle_code IS DISTINCT FROM b.aisle_code
       OR pl.aisle_name IS DISTINCT FROM b.aisle_name
       OR pl.rack_code IS DISTINCT FROM b.rack_code
       OR pl.shelf_code IS DISTINCT FROM b.shelf_code
       OR pl.verification_status IS DISTINCT FROM b.verification_status
       OR pl.notes IS DISTINCT FROM b.notes
       OR pl.created_at IS DISTINCT FROM b.created_at
       OR pl.updated_at IS DISTINCT FROM b.updated_at;

    IF v_loc_diff_count > 0 THEN
        RAISE EXCEPTION 'Rollback assertion failed: % location rows do not match backup baseline', v_loc_diff_count;
    END IF;
END $$;

COMMIT;
