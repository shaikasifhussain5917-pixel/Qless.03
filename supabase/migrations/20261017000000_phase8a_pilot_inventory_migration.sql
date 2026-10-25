-- ============================================================================
-- QLess Smart Shopping - Phase 8A Migration: Activate 5 Pilot Products (Strict)
-- Store: STORE001 (QLess Mart)
--
-- EXECUTION ARCHITECTURE:
--   STAGE 1: Records original store status in a dedicated state table,
--            COMMITS is_active = false to make the pause globally visible,
--            and drains in-flight checkout transactions.
--   STAGE 2: Executes atomic inventory replacement inside BEGIN ... COMMIT;
--            Protected by table-level locks, pre-checks, backups, and assertions.
--   STAGE 3: Restores STORE001 to its exact original active status from the state
--            table and cleans up maintenance metadata.
--
-- EMERGENCY RECOVERY:
--   If Stage 2 aborts or fails, Stage 2 transaction automatically rolls back.
--   To resume the store, run the Emergency Recovery block provided at the end.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PRE-MIGRATION SAFETY CHECK: PREVENT UNSAFE RERUNS & PROTECT ACTIVE STORE
-- ----------------------------------------------------------------------------
-- Aborts immediately before modifying stores.is_active if Phase 8A backup tables
-- or pilot barcodes are already present in the database.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name IN ('store_inventory_backup_phase8a', 'products_backup_phase8a', 'product_locations_backup_phase8a')
    ) OR EXISTS (
        SELECT 1 FROM public.products 
        WHERE barcode IN ('8904091129461', '8939135890892', '8906131443568', '8908018324588', '8906105470095')
    ) THEN
        RAISE EXCEPTION 'PRE-MIGRATION ABORT: Phase 8A migration has already been applied or backup tables already exist. Store status was NOT changed. Do not rerun this script. If you need to revert to demo inventory, execute the rollback script (20261017000001_phase8a_pilot_inventory_rollback.sql).';
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- STAGE 1: RECORD ORIGINAL STATUS AND COMMIT STORE PAUSE
-- Executes and COMMITS the store pause before Stage 2 begins.
-- This ensures stores.is_active = false is globally visible to all concurrent sessions,
-- immediately preventing new entrance gate sessions and new checkout attempts.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public._phase8a_maintenance_state (
    store_id TEXT PRIMARY KEY,
    original_is_active BOOLEAN NOT NULL,
    stage TEXT NOT NULL DEFAULT 'STAGE1_PAUSED',
    stage2_committed_at TIMESTAMPTZ,
    paused_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public._phase8a_maintenance_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._phase8a_maintenance_state FROM PUBLIC, anon, authenticated;

-- Record original active status. On retry after Stage 2 abort, original_is_active is preserved.
INSERT INTO public._phase8a_maintenance_state (store_id, original_is_active, stage)
SELECT id, is_active, 'STAGE1_PAUSED' 
FROM public.stores 
WHERE id = 'STORE001'
ON CONFLICT (store_id) DO UPDATE 
SET stage = 'STAGE1_PAUSED', paused_at = now();

-- Assert that STORE001 exists and original status was successfully captured
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public._phase8a_maintenance_state WHERE store_id = 'STORE001') THEN
        RAISE EXCEPTION 'Stage 1 abort: Store STORE001 does not exist or maintenance state could not be recorded.';
    END IF;
END $$;

-- Commit store deactivation: this update commits immediately in autocommit mode,
-- making is_active = false globally visible to all concurrent sessions before Stage 2 begins.
UPDATE public.stores 
SET is_active = false 
WHERE id = 'STORE001';

-- ----------------------------------------------------------------------------
-- STAGE 2: ATOMIC INVENTORY REPLACEMENT (TRANSACTIONAL)
-- ----------------------------------------------------------------------------
BEGIN;

-- Set a strict lock timeout so the migration never hangs indefinitely if an in-flight
-- transaction takes too long to release locks.
SET LOCAL lock_timeout = '10s';

-- 1. Table-Level Locks (Ordered consistently to prevent deadlocks)
-- Acquiring SHARE ROW EXCLUSIVE lock on store_inventory:
--   a) Conflicts with ROW EXCLUSIVE mode (acquired by SELECT FOR UPDATE in process_self_checkout_order).
--   b) Waits safely for any in-flight checkout transaction to complete (commit or abort).
--   c) Blocks any concurrent checkout or inventory modification while Stage 2 runs.
--   d) If an in-flight transaction exceeds the 10s lock_timeout, Stage 2 aborts cleanly.
LOCK TABLE public.products IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.store_inventory IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.product_locations IN SHARE ROW EXCLUSIVE MODE;

-- 2. Pre-Checks: Validate All 3 Backup Names & Baseline Inventory State
DO $$
DECLARE
    v_demo_match_count INT;
    v_total_store_inv INT;
BEGIN
    -- Check ALL THREE backup table names for collisions
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name IN ('store_inventory_backup_phase8a', 'products_backup_phase8a', 'product_locations_backup_phase8a')
    ) THEN
        RAISE EXCEPTION 'Stage 2 safety abort: One or more backup tables already exist. Migration already applied or backup pending review.';
    END IF;

    -- Check pilot barcodes are absent from master products
    IF EXISTS (
        SELECT 1 FROM public.products 
        WHERE barcode IN ('8904091129461', '8939135890892', '8906131443568', '8908018324588', '8906105470095')
    ) THEN
        RAISE EXCEPTION 'Stage 2 safety abort: One or more target pilot barcodes already exist in public.products.';
    END IF;

    -- Assert total inventory in STORE001 is exactly 30
    SELECT COUNT(*) INTO v_total_store_inv
    FROM public.store_inventory
    WHERE store_id = 'STORE001';

    IF v_total_store_inv <> 30 THEN
        RAISE EXCEPTION 'Stage 2 pre-check failed: STORE001 contains % inventory records, expected exactly 30', v_total_store_inv;
    END IF;

    -- Assert exact match on the 30 verified demo barcodes
    SELECT COUNT(*) INTO v_demo_match_count
    FROM public.store_inventory si
    JOIN public.products p ON si.product_id = p.id
    WHERE si.store_id = 'STORE001'
      AND p.barcode IN (
        '8901262010053', '8901719101014', '8901030874322', '8901072001422', '8904109600127',
        '8901063103765', '8901058003345', '8901058009989', '8906009510019', '8718951233256',
        '8901491503951', '8901063001101', '8901648002108', '8906070430018', '8902041001245',
        '8903052002356', '8904063003467', '8905074004578', '8901491101560', '8904004401201',
        '8901764012204', '8902080005129', '8901030383121', '8901058852307', '8901063014019',
        '8906023401018', '8901396001205', '8901314010410', '8901030612016', '8901030704209'
      );

    IF v_demo_match_count <> 30 THEN
        RAISE EXCEPTION 'Stage 2 pre-check failed: Expected 30 matching demo barcodes in STORE001, found %', v_demo_match_count;
    END IF;
END $$;

-- 3. Create Immutable Backup Tables
CREATE TABLE public.products_backup_phase8a AS 
SELECT * FROM public.products;

CREATE TABLE public.store_inventory_backup_phase8a AS 
SELECT * FROM public.store_inventory WHERE store_id = 'STORE001';

CREATE TABLE public.product_locations_backup_phase8a AS 
SELECT * FROM public.product_locations WHERE store_id = 'STORE001';

-- Lock down backup tables with RLS
ALTER TABLE public.products_backup_phase8a ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_inventory_backup_phase8a ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_locations_backup_phase8a ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.products_backup_phase8a FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.store_inventory_backup_phase8a FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.product_locations_backup_phase8a FROM PUBLIC, anon, authenticated;

-- 4. Deactivate 30 Demo Inventory Rows for STORE001 (Scoped by Barcode List)
UPDATE public.store_inventory si
SET is_available = false,
    stock_quantity = 0,
    updated_at = now()
FROM public.products p
WHERE si.product_id = p.id
  AND si.store_id = 'STORE001'
  AND p.barcode IN (
    '8901262010053', '8901719101014', '8901030874322', '8901072001422', '8904109600127',
    '8901063103765', '8901058003345', '8901058009989', '8906009510019', '8718951233256',
    '8901491503951', '8901063001101', '8901648002108', '8906070430018', '8902041001245',
    '8903052002356', '8904063003467', '8905074004578', '8901491101560', '8904004401201',
    '8901764012204', '8902080005129', '8901030383121', '8901058852307', '8901063014019',
    '8906023401018', '8901396001205', '8901314010410', '8901030612016', '8901030704209'
  );

-- 5. Strict INSERT into public.products (5 Master Products)
INSERT INTO public.products (barcode, name, brand, category, unit_size, emoji, description)
VALUES 
    ('8904091129461', 'Candid Dusting Powder', 'Glenmark', 'Personal Care', '60 g', '🧴', 'Antifungal dusting powder for skin protection'),
    ('8939135890892', 'Dr. Bimal''s Arjuna Cardio Care Tea', 'Dr. Bimal', 'Beverages', '100 g', '🍵', 'Premium natural herbal tea'),
    ('8906131443568', 'ADOR by Heal Facial Tissues', 'ADOR', 'Household Essentials', '100 pulls x 2 ply', '🧻', 'Ultra soft 2-ply absorbent facial tissues'),
    ('8908018324588', 'NOT OUT Adult Pants Extra Large', 'NOT OUT', 'Personal Care', '10 count (XXL)', '🩲', 'Comfortable leak-lock absorbent adult pull-up pants'),
    ('8906105470095', 'Original Kimia Dates', 'Royal Palm', 'Packaged Foods', '400 g', '🌴', 'Naturally sweet premium soft dates');

-- 6. Strict INSERT into public.store_inventory (All 5 Confirmed Active Items)
INSERT INTO public.store_inventory (store_id, product_id, price, mrp, stock_quantity, is_available)
SELECT 'STORE001', p.id, 106.50, 106.50, 2, true 
FROM public.products p WHERE p.barcode = '8904091129461'
UNION ALL
SELECT 'STORE001', p.id, 50.00, 70.00, 5, true 
FROM public.products p WHERE p.barcode = '8939135890892'
UNION ALL
SELECT 'STORE001', p.id, 99.00, 120.00, 6, true 
FROM public.products p WHERE p.barcode = '8906131443568'
UNION ALL
SELECT 'STORE001', p.id, 200.00, 200.00, 2, true 
FROM public.products p WHERE p.barcode = '8908018324588'
UNION ALL
SELECT 'STORE001', p.id, 350.00, 400.00, 4, true 
FROM public.products p WHERE p.barcode = '8906105470095';

-- 7. Strict INSERT into public.product_locations (Preserve Exact Coordinates, Marked UNVERIFIED)
INSERT INTO public.product_locations (store_id, product_id, aisle_code, aisle_name, rack_code, shelf_code, verification_status, notes)
SELECT 'STORE001', p.id, 'A1', 'Aisle A1', 'R4', 'S2', 'UNVERIFIED', 'Pilot Shelf Location' FROM public.products p WHERE p.barcode = '8904091129461'
UNION ALL
SELECT 'STORE001', p.id, 'A5', 'Aisle A5', 'R6', 'S1', 'UNVERIFIED', 'Pilot Shelf Location' FROM public.products p WHERE p.barcode = '8939135890892'
UNION ALL
SELECT 'STORE001', p.id, 'A6', 'Aisle A6', 'R2', 'S3', 'UNVERIFIED', 'Pilot Shelf Location' FROM public.products p WHERE p.barcode = '8906131443568'
UNION ALL
SELECT 'STORE001', p.id, 'A5', 'Aisle A5', 'R3', 'S4', 'UNVERIFIED', 'Pilot Shelf Location' FROM public.products p WHERE p.barcode = '8908018324588'
UNION ALL
SELECT 'STORE001', p.id, 'A5', 'Aisle A5', 'R3', 'S5', 'UNVERIFIED', 'Pilot Shelf Location' FROM public.products p WHERE p.barcode = '8906105470095';

-- 8. Rigorous Migration Validation Assertions
DO $$
DECLARE
    v_prod_insert_count INT;
    v_inv_insert_count INT;
    v_loc_insert_count INT;
    v_mapping_match_count INT;
    v_total_inventory INT;
    v_total_locations INT;
    v_catalog_count INT;
BEGIN
    -- Assert all 5 products inserted
    SELECT COUNT(*) INTO v_prod_insert_count 
    FROM public.products 
    WHERE barcode IN ('8904091129461', '8939135890892', '8906131443568', '8908018324588', '8906105470095');

    IF v_prod_insert_count <> 5 THEN
        RAISE EXCEPTION 'Assertion failed: Expected 5 inserted products, found %', v_prod_insert_count;
    END IF;

    -- Assert all 5 inventory rows inserted
    SELECT COUNT(*) INTO v_inv_insert_count
    FROM public.store_inventory si
    JOIN public.products p ON si.product_id = p.id
    WHERE si.store_id = 'STORE001'
      AND p.barcode IN ('8904091129461', '8939135890892', '8906131443568', '8908018324588', '8906105470095');

    IF v_inv_insert_count <> 5 THEN
        RAISE EXCEPTION 'Assertion failed: Expected 5 inserted inventory rows, found %', v_inv_insert_count;
    END IF;

    -- Assert all 5 locations inserted
    SELECT COUNT(*) INTO v_loc_insert_count
    FROM public.product_locations pl
    JOIN public.products p ON pl.product_id = p.id
    WHERE pl.store_id = 'STORE001'
      AND p.barcode IN ('8904091129461', '8939135890892', '8906131443568', '8908018324588', '8906105470095');

    IF v_loc_insert_count <> 5 THEN
        RAISE EXCEPTION 'Assertion failed: Expected 5 inserted location rows, found %', v_loc_insert_count;
    END IF;

    -- Verify exact barcode-to-price/MRP/stock mapping
    SELECT COUNT(*) INTO v_mapping_match_count
    FROM public.store_inventory si
    JOIN public.products p ON si.product_id = p.id
    WHERE si.store_id = 'STORE001'
      AND (
        (p.barcode = '8904091129461' AND si.price = 106.50 AND si.mrp = 106.50 AND si.stock_quantity = 2 AND si.is_available = true) OR
        (p.barcode = '8939135890892' AND si.price = 50.00 AND si.mrp = 70.00 AND si.stock_quantity = 5 AND si.is_available = true) OR
        (p.barcode = '8906131443568' AND si.price = 99.00 AND si.mrp = 120.00 AND si.stock_quantity = 6 AND si.is_available = true) OR
        (p.barcode = '8908018324588' AND si.price = 200.00 AND si.mrp = 200.00 AND si.stock_quantity = 2 AND si.is_available = true) OR
        (p.barcode = '8906105470095' AND si.price = 350.00 AND si.mrp = 400.00 AND si.stock_quantity = 4 AND si.is_available = true)
      );

    IF v_mapping_match_count <> 5 THEN
        RAISE EXCEPTION 'Assertion failed: Pilot inventory mapping mismatch. Expected 5 exact matches, found %', v_mapping_match_count;
    END IF;

    -- Assert total STORE001 inventory rows = 35 (30 demo + 5 pilot)
    SELECT COUNT(*) INTO v_total_inventory FROM public.store_inventory WHERE store_id = 'STORE001';
    IF v_total_inventory <> 35 THEN
        RAISE EXCEPTION 'Assertion failed: Expected 35 total inventory rows in STORE001, found %', v_total_inventory;
    END IF;

    -- Assert total STORE001 location rows = 35 (30 demo + 5 pilot)
    SELECT COUNT(*) INTO v_total_locations FROM public.product_locations WHERE store_id = 'STORE001';
    IF v_total_locations <> 35 THEN
        RAISE EXCEPTION 'Assertion failed: Expected 35 total location rows in STORE001, found %', v_total_locations;
    END IF;

    -- Assert exactly 5 active items exist in STORE001 store_inventory
    SELECT COUNT(*) INTO v_catalog_count 
    FROM public.store_inventory 
    WHERE store_id = 'STORE001' 
      AND is_available = true;

    IF v_catalog_count <> 5 THEN
        RAISE EXCEPTION 'Assertion failed: Expected exactly 5 active inventory items in STORE001, found %', v_catalog_count;
    END IF;

    -- Record successful Stage 2 transaction completion before committing
    UPDATE public._phase8a_maintenance_state 
    SET stage = 'STAGE2_COMMITTED', stage2_committed_at = now() 
    WHERE store_id = 'STORE001';
END $$;

COMMIT;

-- ----------------------------------------------------------------------------
-- STAGE 3: RESTORE ORIGINAL STORE ACTIVE STATUS & VERIFY
-- ----------------------------------------------------------------------------
-- Step 3.1: Dedicated autocommit update ensures STORE001 is restored to its exact
-- original is_active status immediately, regardless of subsequent assertion outcomes.
UPDATE public.stores s
SET is_active = ms.original_is_active
FROM public._phase8a_maintenance_state ms
WHERE s.id = ms.store_id
  AND ms.store_id = 'STORE001';

-- Step 3.2: Verify customer_store_catalog and cleanup maintenance metadata
DO $$
DECLARE
    v_original_active BOOLEAN;
    v_current_active BOOLEAN;
    v_catalog_count INT;
BEGIN
    SELECT original_is_active INTO v_original_active 
    FROM public._phase8a_maintenance_state 
    WHERE store_id = 'STORE001';

    SELECT is_active INTO v_current_active
    FROM public.stores
    WHERE id = 'STORE001';

    IF v_current_active IS DISTINCT FROM v_original_active THEN
        RAISE EXCEPTION 'Stage 3 restoration check failed: STORE001 is_active is %, expected original %', v_current_active, v_original_active;
    END IF;

    -- If store was originally active, verify customer_store_catalog view displays 5 items
    IF v_original_active = true THEN
        SELECT COUNT(*) INTO v_catalog_count 
        FROM public.customer_store_catalog 
        WHERE store_id = 'STORE001';

        IF v_catalog_count <> 5 THEN
            -- STORE001 was already committed active in Step 3.1; maintenance state is preserved for investigation.
            RAISE EXCEPTION 'Post-restoration catalog discrepancy: customer_store_catalog returned % items, expected exactly 5. Note: STORE001 is_active was successfully restored to %. State table preserved for diagnosis.', v_catalog_count, v_current_active;
        END IF;

        RAISE NOTICE 'Post-restoration verification passed: customer_store_catalog displays exactly 5 active pilot items.';
    ELSE
        RAISE NOTICE 'Post-restoration notice: Store was originally inactive (is_active = false); skipping customer_store_catalog visibility assertion.';
    END IF;

    -- Clean up maintenance state only after all checks succeed
    DROP TABLE IF EXISTS public._phase8a_maintenance_state;
    RAISE NOTICE 'Stage 3 complete: STORE001 successfully restored to original active status (%). Maintenance concluded.', v_original_active;
END $$;

-- ============================================================================
-- EMERGENCY RECOVERY & STATUS INSPECTION PROCEDURE
-- ============================================================================
-- If any part of the migration fails, run this procedure in the Supabase SQL Editor.
-- It intelligently determines whether Stage 2 committed or rolled back, and applies
-- the exact safe recovery path without guessing or overwriting pilot data.
--
-- DO $$
-- DECLARE
--     v_state_exists BOOLEAN;
--     v_original_active BOOLEAN;
--     v_stage TEXT;
--     v_backup_exists BOOLEAN;
--     v_pilot_prods_exist BOOLEAN;
--     v_catalog_count INT;
-- BEGIN
--     SELECT EXISTS (
--         SELECT 1 FROM information_schema.tables 
--         WHERE table_schema = 'public' AND table_name = '_phase8a_maintenance_state'
--     ) INTO v_state_exists;
-- 
--     SELECT EXISTS (
--         SELECT 1 FROM information_schema.tables 
--         WHERE table_schema = 'public' AND table_name = 'store_inventory_backup_phase8a'
--     ) INTO v_backup_exists;
-- 
--     SELECT EXISTS (
--         SELECT 1 FROM public.products 
--         WHERE barcode IN ('8904091129461', '8939135890892', '8906131443568', '8908018324588', '8906105470095')
--     ) INTO v_pilot_prods_exist;
-- 
--     IF v_state_exists THEN
--         SELECT original_is_active, stage INTO v_original_active, v_stage
--         FROM public._phase8a_maintenance_state
--         WHERE store_id = 'STORE001';
--     END IF;
-- 
--     RAISE NOTICE '--- Phase 8A Diagnostic Status ---';
--     RAISE NOTICE 'Maintenance state exists: % (original_is_active: %, stage: %)', v_state_exists, v_original_active, v_stage;
--     RAISE NOTICE 'Backup tables exist: %', v_backup_exists;
--     RAISE NOTICE 'Pilot products exist in master: %', v_pilot_prods_exist;
-- 
--     -- CASE 1: Stage 2 ABORTED / ROLLED BACK
--     -- PostgreSQL rolled back all Stage 2 changes. Master catalog and demo inventory are unchanged.
--     -- Safe action: Restore STORE001 to original is_active and clean up state table.
--     IF NOT v_backup_exists AND NOT v_pilot_prods_exist THEN
--         IF v_original_active IS NOT NULL THEN
--             UPDATE public.stores SET is_active = v_original_active WHERE id = 'STORE001';
--             DROP TABLE IF EXISTS public._phase8a_maintenance_state;
--             RAISE NOTICE 'Case 1 Recovery: Stage 2 rolled back. STORE001 restored to original status (is_active = %). Demo inventory remains intact.', v_original_active;
--         ELSE
--             RAISE WARNING 'Case 1: No maintenance state record found for STORE001.';
--         END IF;
-- 
--     -- CASE 2: Stage 2 COMMITTED (Pilot data active), but Stage 3 needs finalization
--     -- Pilot products and backup tables exist. Do NOT overwrite or re-run Stage 2.
--     -- Safe action: Restore STORE001 is_active, verify catalog count, and drop state table.
--     ELSIF v_backup_exists AND v_pilot_prods_exist THEN
--         IF v_original_active IS NOT NULL THEN
--             UPDATE public.stores SET is_active = v_original_active WHERE id = 'STORE001';
--             IF v_original_active = true THEN
--                 SELECT COUNT(*) INTO v_catalog_count FROM public.customer_store_catalog WHERE store_id = 'STORE001';
--                 RAISE NOTICE 'Case 2: STORE001 unpaused. Active pilot catalog count: % of 5.', v_catalog_count;
--             END IF;
--             DROP TABLE IF EXISTS public._phase8a_maintenance_state;
--             RAISE NOTICE 'Case 2 Recovery: STORE001 restored to original active status (%). Pilot inventory preserved.', v_original_active;
--         ELSE
--             UPDATE public.stores SET is_active = true WHERE id = 'STORE001';
--             RAISE NOTICE 'Case 2 Recovery: STORE001 unpaused (is_active = true). Pilot inventory preserved.';
--         END IF;
-- 
--     -- CASE 3: Inconsistent state (Requires manual DBA attention)
--     ELSE
--         RAISE EXCEPTION 'Case 3 Recovery Error: Inconsistent state detected (backup_exists=%, pilot_prods_exist=%). Manual DBA inspection required.', v_backup_exists, v_pilot_prods_exist;
--     END IF;
-- END $$;
-- ============================================================================

