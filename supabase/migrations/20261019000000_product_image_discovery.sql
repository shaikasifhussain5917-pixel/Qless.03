-- ============================================================================
-- QLess Smart Shopping - Feature: Automatic Online Product Image Discovery
-- Store: STORE001 (QLess Mart)
-- Description:
--   1. Add image_url and image_source columns to public.products table
--   2. Update customer_store_catalog view to expose image_url to shoppers
--   3. Update admin_register_and_receive_product RPC to accept p_image_url
--   4. Storage bucket 'product-images' configuration and RLS policies
--
-- SECURITY CONTROLS:
--   - Role validation: Only authenticated STORE_ADMIN can write product images.
--   - Public read access for customer catalog and verification displays.
--   - Additive non-destructive migration preserving existing catalog & inventory.
--   - Search path fixed to public.
--   - DO NOT EXECUTE AGAINST REMOTE SUPABASE (Local Development Preparation Only).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ADD IMAGE COLUMNS TO MASTER PRODUCTS TABLE
-- ----------------------------------------------------------------------------
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS image_source TEXT,
ADD COLUMN IF NOT EXISTS image_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN public.products.image_url IS 'Public URL of the product image (Supabase Storage or verified provider CDN).';
COMMENT ON COLUMN public.products.image_source IS 'Source of the product image (e.g. Open Food Facts, Store Admin Upload).';
COMMENT ON COLUMN public.products.image_verified_at IS 'Timestamp when the Store Admin verified and confirmed the candidate image.';

-- ----------------------------------------------------------------------------
-- 2. UPDATE CUSTOMER STORE CATALOG VIEW (APPENDS IMAGE_URL AT END)
-- ----------------------------------------------------------------------------
-- PostgreSQL 42P16 rule: Existing view columns cannot be renamed or reordered
-- in CREATE OR REPLACE VIEW. New columns must be appended at the end of the view.
CREATE OR REPLACE VIEW public.customer_store_catalog AS
SELECT 
    si.store_id,
    p.id AS product_id,
    p.barcode,
    p.name,
    p.brand,
    p.category,
    p.unit_size,
    p.emoji,
    p.description,
    si.price,
    si.mrp,
    si.is_available,
    (si.stock_quantity > 0 AND si.is_available) AS in_stock,
    p.image_url
FROM public.store_inventory si
JOIN public.products p ON si.product_id = p.id
JOIN public.stores s ON si.store_id = s.id
WHERE si.is_available = true
  AND s.is_active = true;

GRANT SELECT ON public.customer_store_catalog TO authenticated, anon;

-- ----------------------------------------------------------------------------
-- 3. UPDATE RPC: ADMIN REGISTER AND RECEIVE PRODUCT (WITH IMAGE URL)
-- ----------------------------------------------------------------------------
-- Drop legacy 15-parameter overload from migration 20261018000000_smart_stock_import.sql
-- to prevent PostgreSQL ambiguous function resolution (error 42725) in PostgREST.
DROP FUNCTION IF EXISTS public.admin_register_and_receive_product(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
);

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
    p_idempotency_key TEXT DEFAULT NULL,
    p_image_url TEXT DEFAULT NULL,
    p_image_source TEXT DEFAULT NULL
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

    -- Insert into master catalog with image URL
    INSERT INTO public.products (
        barcode,
        name,
        brand,
        category,
        unit_size,
        emoji,
        description,
        image_url,
        image_source,
        image_verified_at
    ) VALUES (
        v_clean_barcode,
        trim(p_name),
        coalesce(trim(p_brand), 'Generic'),
        coalesce(trim(p_category), 'Packaged Foods'),
        coalesce(trim(p_unit_size), '1 unit'),
        coalesce(p_emoji, '🛍️'),
        p_description,
        p_image_url,
        p_image_source,
        CASE WHEN p_image_url IS NOT NULL THEN now() ELSE NULL END
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
            'Registered via Smart Stock Import with Image Discovery'
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
        'Initial Stock Intake upon Product Registration (Image Discovered)'
    );

    RETURN jsonb_build_object(
        'success', true,
        'productId', v_prod_id,
        'barcode', v_clean_barcode,
        'name', trim(p_name),
        'stockQuantity', p_quantity,
        'price', round(p_price, 2),
        'mrp', round(p_mrp, 2),
        'imageUrl', p_image_url
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_register_and_receive_product(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_register_and_receive_product(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. STORAGE BUCKET CONFIGURATION (product-images)
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'product-images',
    'product-images',
    true,
    5242880, -- 5 MB limit
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Public read access to product images
DROP POLICY IF EXISTS "Public product image read" ON storage.objects;
CREATE POLICY "Public product image read" ON storage.objects
    FOR SELECT USING (bucket_id = 'product-images');

-- Store Admin upload policy (restricted strictly to authenticated STORE_ADMIN staff)
DROP POLICY IF EXISTS "Store Admin product image insert" ON storage.objects;
CREATE POLICY "Store Admin product image insert" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'product-images' AND
        EXISTS (
            SELECT 1 FROM public.store_staff
            WHERE store_staff.user_id = auth.uid()
              AND store_staff.role = 'STORE_ADMIN'
        )
    );

-- Store Admin update policy for product images
DROP POLICY IF EXISTS "Store Admin product image update" ON storage.objects;
CREATE POLICY "Store Admin product image update" ON storage.objects
    FOR UPDATE 
    USING (
        bucket_id = 'product-images' AND
        EXISTS (
            SELECT 1 FROM public.store_staff
            WHERE store_staff.user_id = auth.uid()
              AND store_staff.role = 'STORE_ADMIN'
        )
    )
    WITH CHECK (
        bucket_id = 'product-images' AND
        EXISTS (
            SELECT 1 FROM public.store_staff
            WHERE store_staff.user_id = auth.uid()
              AND store_staff.role = 'STORE_ADMIN'
        )
    );

-- Store Admin delete policy for product images
DROP POLICY IF EXISTS "Store Admin product image delete" ON storage.objects;
CREATE POLICY "Store Admin product image delete" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'product-images' AND
        EXISTS (
            SELECT 1 FROM public.store_staff
            WHERE store_staff.user_id = auth.uid()
              AND store_staff.role = 'STORE_ADMIN'
        )
    );
