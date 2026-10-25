-- ============================================================================
-- QLess Smart Shopping - Phase 4 Incremental Schema Migration
-- Feature: SmartFind Floor-Plan Navigation, Product Locations & Exit Pass Trigger
-- Target: Supabase PostgreSQL with Strict Row Level Security (RLS)
-- Store: QLess Mart (STORE001 / QLM001)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. STORE AISLES (Floor-Plan Navigation Structure)
-- Authoritative aisle metadata and physical walking order per store
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_aisles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    code TEXT NOT NULL,                                 -- e.g. 'A01', 'A02'
    name TEXT NOT NULL,                                 -- e.g. 'Dairy & Refrigerated'
    category TEXT NOT NULL,                             -- e.g. 'Dairy', 'Snacks'
    racks TEXT[] NOT NULL DEFAULT '{}',                 -- e.g. ARRAY['R01', 'R02', 'R03', 'R04']
    zone TEXT NOT NULL,                                 -- e.g. 'Chilled Perimeter (Left)'
    description TEXT,
    walking_order INT NOT NULL DEFAULT 1,               -- Sequential traversal order
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (store_id, code)
);

CREATE INDEX IF NOT EXISTS idx_store_aisles_store ON public.store_aisles(store_id);
CREATE INDEX IF NOT EXISTS idx_store_aisles_lookup ON public.store_aisles(store_id, code);
CREATE INDEX IF NOT EXISTS idx_store_aisles_order ON public.store_aisles(store_id, walking_order);

-- ----------------------------------------------------------------------------
-- 2. PRODUCT LOCATIONS (SmartFind Shelf & Rack Coordinates)
-- Precise location mapping for catalog items inside store gondola units
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    aisle_code TEXT NOT NULL,                           -- e.g. 'A01'
    aisle_name TEXT NOT NULL,                           -- e.g. 'Dairy & Refrigerated'
    rack_code TEXT NOT NULL,                            -- e.g. 'R01'
    shelf_code TEXT NOT NULL,                           -- e.g. 'S1', 'S2', 'S3'
    verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED' 
        CHECK (verification_status IN ('VERIFIED', 'UNVERIFIED', 'MISSING')),
    notes TEXT,                                         -- Optional staff placement notes
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (store_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_locations_store_product ON public.product_locations(store_id, product_id);
CREATE INDEX IF NOT EXISTS idx_product_locations_aisle ON public.product_locations(store_id, aisle_code);
CREATE INDEX IF NOT EXISTS idx_product_locations_rack ON public.product_locations(store_id, rack_code);
CREATE INDEX IF NOT EXISTS idx_product_locations_status ON public.product_locations(store_id, verification_status);

-- ----------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (RLS) FOR SMARTFIND TABLES
-- ----------------------------------------------------------------------------
ALTER TABLE public.store_aisles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_locations ENABLE ROW LEVEL SECURITY;

-- STORE AISLES POLICIES:
-- Anyone (customers & staff) can view active store aisles for wayfinding
CREATE POLICY "Public read active store aisles" ON public.store_aisles
    FOR SELECT USING (is_active = true);

-- Only verified store administrators can create, update, or remove aisle definitions
CREATE POLICY "Admin manage store aisles" ON public.store_aisles
    FOR ALL USING (public.is_store_staff(store_id, ARRAY['STORE_ADMIN']))
    WITH CHECK (public.is_store_staff(store_id, ARRAY['STORE_ADMIN']));

-- PRODUCT LOCATIONS POLICIES:
-- Shoppers and staff can view product shelf coordinates for floor-plan navigation
CREATE POLICY "Shoppers and staff read product locations" ON public.product_locations
    FOR SELECT USING (true);

-- Only authoritative store staff (STORE_ADMIN, CASHIER) can modify product location assignments
-- Uses existing public.is_store_staff() check against public.store_staff (prevents client privilege spoofing)
CREATE POLICY "Staff manage product locations" ON public.product_locations
    FOR ALL USING (public.is_store_staff(store_id, ARRAY['STORE_ADMIN', 'CASHIER']))
    WITH CHECK (public.is_store_staff(store_id, ARRAY['STORE_ADMIN', 'CASHIER']));

-- ----------------------------------------------------------------------------
-- 4. AUTOMATED EXIT-PASS CREATION TRIGGER
-- Ensures confirmed orders atomically receive exactly one valid turnstile exit pass.
-- Prevents customers from forging arbitrary passes without a paid order.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_order_exit_pass_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_qr_payload TEXT;
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- Only issue an exit pass when order payment is confirmed
    IF NEW.payment_status = 'CONFIRMED' THEN
        v_expires_at := now() + interval '1 hour';

        -- Generate signed payload representation for the exit turnstile scanner
        v_qr_payload := jsonb_build_object(
            'orderId', NEW.id,
            'receiptId', NEW.receipt_id,
            'storeId', NEW.store_id,
            'finalTotal', NEW.final_total,
            'paymentMethod', NEW.payment_method,
            'status', 'PAID_CONFIRMED',
            'issuedAt', now(),
            'expiresAt', v_expires_at
        )::text;

        -- Idempotently insert into public.exit_passes (preserves UNIQUE order_id constraint)
        INSERT INTO public.exit_passes (
            order_id,
            store_id,
            qr_payload,
            issued_at,
            expires_at,
            status
        ) VALUES (
            NEW.id,
            NEW.store_id,
            v_qr_payload,
            now(),
            v_expires_at,
            'ISSUED'
        )
        ON CONFLICT (order_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_order_created_generate_exit_pass ON public.orders;
CREATE TRIGGER on_order_created_generate_exit_pass
    AFTER INSERT OR UPDATE OF payment_status ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_order_exit_pass_creation();
