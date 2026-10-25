-- ============================================================================
-- QLess Smart Shopping - Feature: Smart Stock Import & New Product Registration
-- Store: STORE001 (QLess Mart)
-- Description:
--   1. Audit Log Table: public.stock_receiving_logs
--   2. RPC: public.admin_batch_receive_stock (Atomically receives batch of items with idempotency)
--   3. RPC: public.admin_register_and_receive_product (Atomically registers new product & sets initial stock)
--   4. RPC: public.admin_associate_and_receive_product (Associates existing master product with store)
--
-- SECURITY CONTROLS:
--   - Role validation: Caller must hold authoritative STORE_ADMIN role in public.store_staff.
--   - Store isolation: Caller must be assigned to p_store_id.
--   - Quantity validation: Quantity received must be > 0.
--   - Atomic row-locking: Uses SELECT ... FOR UPDATE to prevent race conditions & lost updates.
--   - Idempotency guard: Prevents accidental double intake on client retries.
--   - Search path fixed to public.
--   - Revoked from anon, granted only to authenticated users.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. AUDIT LOG: STOCK RECEIVING LOGS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_receiving_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES auth.users(id),
    batch_reference TEXT NOT NULL,
    batch_idempotency_key TEXT NOT NULL,
    idempotency_key TEXT UNIQUE NOT NULL,
    product_id INT NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    barcode TEXT NOT NULL,
    product_name TEXT NOT NULL,
    previous_stock INT NOT NULL CHECK (previous_stock >= 0),
    quantity_received INT NOT NULL CHECK (quantity_received > 0),
    new_stock INT NOT NULL CHECK (new_stock >= previous_stock),
    unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
    mrp NUMERIC(10,2) NOT NULL CHECK (mrp >= unit_price),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_receiving_store ON public.stock_receiving_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_stock_receiving_created ON public.stock_receiving_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_receiving_idempotency ON public.stock_receiving_logs(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_stock_receiving_batch_idemp ON public.stock_receiving_logs(batch_idempotency_key);

ALTER TABLE public.stock_receiving_logs ENABLE ROW LEVEL SECURITY;

-- Staff can view receiving logs for their assigned store
DROP POLICY IF EXISTS "Staff read stock receiving logs" ON public.stock_receiving_logs;
CREATE POLICY "Staff read stock receiving logs" ON public.stock_receiving_logs
    FOR SELECT USING (
        public.is_store_staff(store_id, ARRAY['STORE_ADMIN', 'CASHIER', 'SECURITY_GUARD'])
    );

-- Store admin can insert receiving logs
DROP POLICY IF EXISTS "Store admin insert receiving logs" ON public.stock_receiving_logs;
CREATE POLICY "Store admin insert receiving logs" ON public.stock_receiving_logs
    FOR INSERT WITH CHECK (
        public.is_store_staff(store_id, ARRAY['STORE_ADMIN'])
    );

-- ----------------------------------------------------------------------------
-- 2. RPC: ATOMIC BATCH STOCK RECEIVING
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_batch_receive_stock(
    p_store_id TEXT,
    p_items JSONB,
    p_idempotency_key TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_item JSONB;
    v_prod_id INT;
    v_qty INT;
    v_current_stock INT;
    v_new_stock INT;
    v_prod_name TEXT;
    v_barcode TEXT;
    v_price NUMERIC(10,2);
    v_mrp NUMERIC(10,2);
    v_batch_ref TEXT;
    v_updated_items JSONB := '[]'::jsonb;
BEGIN
    -- 1. Authentication & Role Enforcement
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to receive stock.';
    END IF;

    IF NOT public.is_store_staff(p_store_id, ARRAY['STORE_ADMIN']) THEN
        RAISE EXCEPTION 'Unauthorized: Caller is not an authorized STORE_ADMIN for store %', p_store_id;
    END IF;

    -- 2. Validate parameters
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Batch items array cannot be empty.';
    END IF;

    IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
        RAISE EXCEPTION 'Idempotency key is required to prevent double receiving.';
    END IF;

    -- 3. Idempotency Check (Matches on batch_idempotency_key to prevent double intake)
    IF EXISTS (SELECT 1 FROM public.stock_receiving_logs WHERE batch_idempotency_key = p_idempotency_key) THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotent_replay', true,
            'message', 'Batch was already processed successfully under this idempotency key.'
        );
    END IF;

    v_batch_ref := 'BATCH-' || upper(substr(md5(p_idempotency_key || clock_timestamp()::text), 1, 10));

    -- 4. Process each item in atomic transaction
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_prod_id := (v_item->>'productId')::int;
        v_qty := (v_item->>'quantity')::int;

        IF v_prod_id IS NULL THEN
            RAISE EXCEPTION 'Invalid productId in batch item: %', v_item;
        END IF;

        IF v_qty IS NULL OR v_qty <= 0 THEN
            RAISE EXCEPTION 'Received quantity must be a positive integer for product ID %', v_prod_id;
        END IF;

        -- Acquire row-level lock on store_inventory to prevent concurrent lost updates
        SELECT si.stock_quantity, si.price, si.mrp, p.name, p.barcode
        INTO v_current_stock, v_price, v_mrp, v_prod_name, v_barcode
        FROM public.store_inventory si
        JOIN public.products p ON si.product_id = p.id
        WHERE si.store_id = p_store_id
          AND si.product_id = v_prod_id
        FOR UPDATE OF si;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % is not associated with store %', v_prod_id, p_store_id;
        END IF;

        v_new_stock := v_current_stock + v_qty;

        -- Update inventory atomically (adds received quantity without overwriting)
        UPDATE public.store_inventory
        SET stock_quantity = v_new_stock,
            is_available = true,
            updated_at = now()
        WHERE store_id = p_store_id
          AND product_id = v_prod_id;

        -- Record audit log
        INSERT INTO public.stock_receiving_logs (
            store_id,
            staff_id,
            batch_reference,
            batch_idempotency_key,
            idempotency_key,
            product_id,
            barcode,
            product_name,
            previous_stock,
            quantity_received,
            new_stock,
            unit_price,
            mrp,
            notes
        ) VALUES (
            p_store_id,
            v_user_id,
            v_batch_ref,
            p_idempotency_key,
            p_idempotency_key || '-' || v_prod_id::text,
            v_prod_id,
            v_barcode,
            v_prod_name,
            v_current_stock,
            v_qty,
            v_new_stock,
            v_price,
            v_mrp,
            p_notes
        );

        v_updated_items := v_updated_items || jsonb_build_object(
            'productId', v_prod_id,
            'barcode', v_barcode,
            'name', v_prod_name,
            'previousStock', v_current_stock,
            'quantityReceived', v_qty,
            'newStock', v_new_stock
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'batchReference', v_batch_ref,
        'processedCount', jsonb_array_length(p_items),
        'items', v_updated_items
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_batch_receive_stock(TEXT, JSONB, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_batch_receive_stock(TEXT, JSONB, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. RPC: REGISTER NEW PRODUCT & SET INITIAL STOCK
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_register_and_receive_product(
    p_store_id TEXT,
    p_barcode TEXT,
    p_name TEXT,
    p_brand TEXT,
    p_category TEXT,
    p_unit_size TEXT,
    p_price NUMERIC,
    p_mrp NUMERIC,
    p_quantity INT,
    p_emoji TEXT DEFAULT '🛍️',
    p_description TEXT DEFAULT NULL,
    p_aisle_code TEXT DEFAULT NULL,
    p_rack_code TEXT DEFAULT NULL,
    p_shelf_code TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_prod_id INT;
    v_clean_barcode TEXT;
    v_aisle_name TEXT := 'General Gondola';
    v_batch_ref TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT public.is_store_staff(p_store_id, ARRAY['STORE_ADMIN']) THEN
        RAISE EXCEPTION 'Unauthorized: Caller is not a STORE_ADMIN for store %', p_store_id;
    END IF;

    v_clean_barcode := trim(p_barcode);
    IF v_clean_barcode IS NULL OR length(v_clean_barcode) = 0 THEN
        RAISE EXCEPTION 'Barcode cannot be empty.';
    END IF;

    IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
        RAISE EXCEPTION 'Product name is required.';
    END IF;

    IF p_price IS NULL OR p_price <= 0 THEN
        RAISE EXCEPTION 'Price must be greater than zero.';
    END IF;

    IF p_mrp IS NULL OR p_mrp < p_price THEN
        RAISE EXCEPTION 'MRP cannot be lower than selling price.';
    END IF;

    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Initial stock quantity must be a positive integer.';
    END IF;

    -- Barcode uniqueness check in master catalog
    SELECT id INTO v_prod_id FROM public.products WHERE barcode = v_clean_barcode;
    IF v_prod_id IS NOT NULL THEN
        RAISE EXCEPTION 'Barcode % already exists in master catalog with ID %. Use store association instead.', v_clean_barcode, v_prod_id;
    END IF;

    -- Insert into master catalog
    INSERT INTO public.products (
        barcode,
        name,
        brand,
        category,
        unit_size,
        emoji,
        description
    ) VALUES (
        v_clean_barcode,
        trim(p_name),
        coalesce(trim(p_brand), 'Generic'),
        coalesce(trim(p_category), 'Packaged Foods'),
        coalesce(trim(p_unit_size), '1 unit'),
        coalesce(p_emoji, '🛍️'),
        p_description
    ) RETURNING id INTO v_prod_id;

    -- Insert into store_inventory
    INSERT INTO public.store_inventory (
        store_id,
        product_id,
        price,
        mrp,
        stock_quantity,
        is_available
    ) VALUES (
        p_store_id,
        v_prod_id,
        round(p_price, 2),
        round(p_mrp, 2),
        p_quantity,
        true
    );

    -- Optional location assignment
    IF p_aisle_code IS NOT NULL AND length(trim(p_aisle_code)) > 0 THEN
        SELECT name INTO v_aisle_name FROM public.store_aisles WHERE store_id = p_store_id AND code = trim(p_aisle_code);
        IF v_aisle_name IS NULL THEN
            v_aisle_name := 'Aisle ' || trim(p_aisle_code);
        END IF;

        INSERT INTO public.product_locations (
            store_id,
            product_id,
            aisle_code,
            aisle_name,
            rack_code,
            shelf_code,
            verification_status,
            notes
        ) VALUES (
            p_store_id,
            v_prod_id,
            trim(p_aisle_code),
            v_aisle_name,
            coalesce(trim(p_rack_code), 'R01'),
            coalesce(trim(p_shelf_code), 'S01'),
            'UNVERIFIED',
            'Registered via Smart Stock Import'
        ) ON CONFLICT (store_id, product_id) DO NOTHING;
    END IF;

    -- Record intake log
    v_batch_ref := 'NEWPROD-' || upper(substr(md5(v_clean_barcode || clock_timestamp()::text), 1, 8));
    INSERT INTO public.stock_receiving_logs (
        store_id,
        staff_id,
        batch_reference,
        batch_idempotency_key,
        idempotency_key,
        product_id,
        barcode,
        product_name,
        previous_stock,
        quantity_received,
        new_stock,
        unit_price,
        mrp,
        notes
    ) VALUES (
        p_store_id,
        v_user_id,
        v_batch_ref,
        coalesce(p_idempotency_key, v_batch_ref),
        coalesce(p_idempotency_key, 'INIT-' || v_prod_id::text || '-' || extract(epoch from now())::text),
        v_prod_id,
        v_clean_barcode,
        trim(p_name),
        0,
        p_quantity,
        p_quantity,
        round(p_price, 2),
        round(p_mrp, 2),
        'Initial Stock Intake upon Product Registration'
    );

    RETURN jsonb_build_object(
        'success', true,
        'productId', v_prod_id,
        'barcode', v_clean_barcode,
        'name', trim(p_name),
        'stockQuantity', p_quantity,
        'price', round(p_price, 2),
        'mrp', round(p_mrp, 2)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_register_and_receive_product(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_register_and_receive_product(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. RPC: ASSOCIATE EXISTING MASTER PRODUCT WITH STORE & RECEIVE INITIAL STOCK
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_associate_and_receive_product(
    p_store_id TEXT,
    p_product_id INT,
    p_price NUMERIC,
    p_mrp NUMERIC,
    p_quantity INT,
    p_aisle_code TEXT DEFAULT NULL,
    p_rack_code TEXT DEFAULT NULL,
    p_shelf_code TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_prod RECORD;
    v_existing_inv RECORD;
    v_aisle_name TEXT := 'General Gondola';
    v_batch_ref TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT public.is_store_staff(p_store_id, ARRAY['STORE_ADMIN']) THEN
        RAISE EXCEPTION 'Unauthorized: Caller is not a STORE_ADMIN for store %', p_store_id;
    END IF;

    SELECT id, barcode, name INTO v_prod FROM public.products WHERE id = p_product_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product % does not exist in master catalog.', p_product_id;
    END IF;

    IF p_price IS NULL OR p_price <= 0 THEN
        RAISE EXCEPTION 'Price must be greater than zero.';
    END IF;

    IF p_mrp IS NULL OR p_mrp < p_price THEN
        RAISE EXCEPTION 'MRP cannot be lower than price.';
    END IF;

    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Received quantity must be positive.';
    END IF;

    SELECT * INTO v_existing_inv FROM public.store_inventory WHERE store_id = p_store_id AND product_id = p_product_id;

    IF FOUND THEN
        -- Atomically add stock if already associated
        UPDATE public.store_inventory
        SET stock_quantity = stock_quantity + p_quantity,
            price = round(p_price, 2),
            mrp = round(p_mrp, 2),
            is_available = true,
            updated_at = now()
        WHERE store_id = p_store_id AND product_id = p_product_id;
    ELSE
        -- Insert new association
        INSERT INTO public.store_inventory (
            store_id,
            product_id,
            price,
            mrp,
            stock_quantity,
            is_available
        ) VALUES (
            p_store_id,
            p_product_id,
            round(p_price, 2),
            round(p_mrp, 2),
            p_quantity,
            true
        );
    END IF;

    -- Optional location assignment
    IF p_aisle_code IS NOT NULL AND length(trim(p_aisle_code)) > 0 THEN
        SELECT name INTO v_aisle_name FROM public.store_aisles WHERE store_id = p_store_id AND code = trim(p_aisle_code);
        IF v_aisle_name IS NULL THEN
            v_aisle_name := 'Aisle ' || trim(p_aisle_code);
        END IF;

        INSERT INTO public.product_locations (
            store_id,
            product_id,
            aisle_code,
            aisle_name,
            rack_code,
            shelf_code,
            verification_status,
            notes
        ) VALUES (
            p_store_id,
            p_product_id,
            trim(p_aisle_code),
            v_aisle_name,
            coalesce(trim(p_rack_code), 'R01'),
            coalesce(trim(p_shelf_code), 'S01'),
            'UNVERIFIED',
            'Associated via Smart Stock Import'
        ) ON CONFLICT (store_id, product_id) DO NOTHING;
    END IF;

    v_batch_ref := 'ASSOC-' || upper(substr(md5(v_prod.barcode || clock_timestamp()::text), 1, 8));
    INSERT INTO public.stock_receiving_logs (
        store_id,
        staff_id,
        batch_reference,
        batch_idempotency_key,
        idempotency_key,
        product_id,
        barcode,
        product_name,
        previous_stock,
        quantity_received,
        new_stock,
        unit_price,
        mrp,
        notes
    ) VALUES (
        p_store_id,
        v_user_id,
        v_batch_ref,
        coalesce(p_idempotency_key, v_batch_ref),
        coalesce(p_idempotency_key, 'ASSOC-' || p_product_id::text || '-' || extract(epoch from now())::text),
        p_product_id,
        v_prod.barcode,
        v_prod.name,
        coalesce(v_existing_inv.stock_quantity, 0),
        p_quantity,
        coalesce(v_existing_inv.stock_quantity, 0) + p_quantity,
        round(p_price, 2),
        round(p_mrp, 2),
        'Store Association & Initial Intake'
    );

    RETURN jsonb_build_object(
        'success', true,
        'productId', p_product_id,
        'barcode', v_prod.barcode,
        'name', v_prod.name,
        'newStock', coalesce(v_existing_inv.stock_quantity, 0) + p_quantity
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_associate_and_receive_product(TEXT, INT, NUMERIC, NUMERIC, INT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_associate_and_receive_product(TEXT, INT, NUMERIC, NUMERIC, INT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
