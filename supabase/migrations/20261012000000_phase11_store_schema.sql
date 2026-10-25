-- ============================================================================
-- QLess Smart Shopping - Phase 11 Store-Scoped Multi-Tenant Database Schema
-- Target: Supabase PostgreSQL with Strict Row Level Security (RLS)
-- Initial Launch Supermarket: QLess Mart (STORE001 / QLM001)
-- ============================================================================

-- Enable pgcrypto for UUID generation if needed
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. STORES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stores (
    id TEXT PRIMARY KEY,                       -- e.g. 'STORE001'
    code TEXT UNIQUE NOT NULL,                 -- e.g. 'QLM001'
    name TEXT NOT NULL,                        -- e.g. 'QLess Mart'
    chain TEXT NOT NULL DEFAULT 'QLess Mart',
    branch TEXT NOT NULL,                      -- e.g. 'HSR Layout Flagship'
    address TEXT NOT NULL,
    timing TEXT NOT NULL DEFAULT '07:00 AM – 11:00 PM',
    is_active BOOLEAN NOT NULL DEFAULT true,
    entrance_qr_secret TEXT NOT NULL DEFAULT 'QLM_SECRET_SIGN_2026',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for lookup by store code
CREATE INDEX IF NOT EXISTS idx_stores_code ON public.stores(code);

-- ----------------------------------------------------------------------------
-- 1B. INITIAL LAUNCH STORE (STORE001 / QLM001)
-- Provision flagship launch supermarket for local development and migration continuity.
-- Idempotent: ON CONFLICT (id) DO NOTHING preserves existing records and prevents duplicate key errors.
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
-- 2. USER PROFILES
-- Extends Supabase auth.users without storing roles to prevent privilege escalation
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    avatar_initials TEXT NOT NULL DEFAULT 'QL',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3. STORE STAFF ASSIGNMENTS (Authoritative Staff Roles)
-- Store roles: STORE_ADMIN, CASHIER, SECURITY_GUARD
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    store_id TEXT NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('STORE_ADMIN', 'CASHIER', 'SECURITY_GUARD')),
    terminal_id TEXT,
    assigned_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_store_staff_user ON public.store_staff(user_id);
CREATE INDEX IF NOT EXISTS idx_store_staff_store ON public.store_staff(store_id);

-- ----------------------------------------------------------------------------
-- 4. MASTER PRODUCT DEFINITIONS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
    id SERIAL PRIMARY KEY,
    barcode TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    brand TEXT NOT NULL,
    category TEXT NOT NULL,
    unit_size TEXT NOT NULL,
    emoji TEXT DEFAULT '🛍️',
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);

-- ----------------------------------------------------------------------------
-- 5. STORE INVENTORY & STORE-SPECIFIC PRICING
-- Authoritative stock quantities and selling prices per store
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    mrp NUMERIC(10,2) NOT NULL CHECK (mrp >= price),
    stock_quantity INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    is_available BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (store_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_store_inventory_lookup ON public.store_inventory(store_id, product_id);

-- ----------------------------------------------------------------------------
-- 6. CUSTOMER STORE CATALOG VIEW
-- Requirement 6: Hides exact stock quantity from customers!
-- ----------------------------------------------------------------------------
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
    (si.stock_quantity > 0 AND si.is_available) AS in_stock
FROM public.store_inventory si
JOIN public.products p ON si.product_id = p.id
JOIN public.stores s ON si.store_id = s.id
WHERE si.is_available = true
  AND s.is_active = true;

-- Ensure catalog view is readable by authenticated shoppers and guests
GRANT SELECT ON public.customer_store_catalog TO authenticated, anon;

-- ----------------------------------------------------------------------------
-- 7. CUSTOMER STORE ENTRANCE SESSIONS
-- Tracks validated customer presence inside the store
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_entry_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    store_id TEXT NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    session_token TEXT UNIQUE NOT NULL,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entry_sessions_user_store ON public.store_entry_sessions(user_id, store_id, is_active);

-- ----------------------------------------------------------------------------
-- 8. ORDERS
-- Store-scoped completed purchases
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orders (
    id TEXT PRIMARY KEY,                                -- e.g. 'QL-2026-M3EUA'
    store_id TEXT NOT NULL REFERENCES public.stores(id),
    customer_id UUID REFERENCES auth.users(id),
    session_id TEXT NOT NULL,
    receipt_id TEXT NOT NULL,
    subtotal NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0),
    mrp_savings NUMERIC(10,2) NOT NULL DEFAULT 0,
    coupon_code TEXT,
    coupon_discount NUMERIC(10,2) NOT NULL DEFAULT 0,
    taxable_amount NUMERIC(10,2) NOT NULL,
    cgst NUMERIC(10,2) NOT NULL DEFAULT 0,
    sgst NUMERIC(10,2) NOT NULL DEFAULT 0,
    tax_total NUMERIC(10,2) NOT NULL DEFAULT 0,
    final_total NUMERIC(10,2) NOT NULL CHECK (final_total >= 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('upi', 'card', 'wallet', 'cash')),
    payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'CONFIRMED', 'FAILED', 'REFUNDED')),
    payment_reference TEXT NOT NULL,
    paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_store ON public.orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON public.orders(created_at DESC);

-- ----------------------------------------------------------------------------
-- 9. ORDER ITEMS
-- Immutable line items with historical snapshot pricing
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id INT REFERENCES public.products(id),
    product_name TEXT NOT NULL,
    barcode TEXT NOT NULL,
    unit_price NUMERIC(10,2) NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    total_price NUMERIC(10,2) NOT NULL,
    category TEXT,
    unit_size TEXT
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);

-- ----------------------------------------------------------------------------
-- 10. EXIT PASSES
-- Turnstile gate credentials issued upon payment confirmation
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exit_passes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT UNIQUE NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    store_id TEXT NOT NULL REFERENCES public.stores(id),
    qr_payload TEXT NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ISSUED', 'VERIFIED', 'EXPIRED', 'REVOKED')) DEFAULT 'ISSUED',
    verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exit_passes_order ON public.exit_passes(order_id);
CREATE INDEX IF NOT EXISTS idx_exit_passes_store_status ON public.exit_passes(store_id, status);

-- ----------------------------------------------------------------------------
-- 11. SECURITY VERIFICATION LOGS
-- Audit log of guard turnstile inspections
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.security_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL REFERENCES public.stores(id),
    order_id TEXT,
    receipt_id TEXT,
    guard_id UUID REFERENCES auth.users(id),
    terminal_id TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('success', 'duplicate_warning', 'failure')),
    failure_reason TEXT,
    scanned_payload TEXT NOT NULL,
    has_discrepancy BOOLEAN NOT NULL DEFAULT false,
    discrepancy_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_logs_store ON public.security_logs(store_id, created_at DESC);

-- ============================================================================
-- HELPER SECURITY DEFINER FUNCTIONS (Row-Level Security Enforcement)
-- ============================================================================

-- Check if current authenticated user has a specific staff role in a given store
CREATE OR REPLACE FUNCTION public.is_store_staff(p_store_id TEXT, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.store_staff
        WHERE user_id = auth.uid()
          AND store_id = p_store_id
          AND role = ANY(p_roles)
    );
$$;

-- Get the store ID for the current authenticated staff member
CREATE OR REPLACE FUNCTION public.get_user_store_id()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT store_id FROM public.store_staff
    WHERE user_id = auth.uid()
    LIMIT 1;
$$;

-- Get the staff role for the current authenticated user
CREATE OR REPLACE FUNCTION public.get_user_store_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT role FROM public.store_staff
    WHERE user_id = auth.uid()
    LIMIT 1;
$$;

-- Check if a customer has a valid active entrance session for the target store
CREATE OR REPLACE FUNCTION public.has_active_store_session(p_store_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.store_entry_sessions
        WHERE user_id = auth.uid()
          AND store_id = p_store_id
          AND is_active = true
          AND expires_at > now()
    );
$$;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_entry_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exit_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- STORES POLICIES
-- Anyone can see active stores; only store admin can edit their own store
-- ----------------------------------------------------------------------------
CREATE POLICY "Public read active stores" ON public.stores
    FOR SELECT USING (is_active = true);

CREATE POLICY "Admin update assigned store" ON public.stores
    FOR UPDATE USING (public.is_store_staff(id, ARRAY['STORE_ADMIN']));

-- ----------------------------------------------------------------------------
-- PROFILES POLICIES
-- Users read/update their own profile
-- ----------------------------------------------------------------------------
CREATE POLICY "Users read own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users insert own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- STORE STAFF POLICIES
-- Read-only for assigned staff & store admin; inserts protected by admin/service
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view their own staff assignment" ON public.store_staff
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Staff can view staff of their own store" ON public.store_staff
    FOR SELECT USING (public.is_store_staff(store_id, ARRAY['STORE_ADMIN', 'CASHIER', 'SECURITY_GUARD']));

CREATE POLICY "Admin can manage staff for their store" ON public.store_staff
    FOR ALL USING (public.is_store_staff(store_id, ARRAY['STORE_ADMIN']))
    WITH CHECK (public.is_store_staff(store_id, ARRAY['STORE_ADMIN']));

-- ----------------------------------------------------------------------------
-- PRODUCTS POLICIES
-- Read access for verified shoppers or staff
-- ----------------------------------------------------------------------------
CREATE POLICY "Verified shoppers and staff read products" ON public.products
    FOR SELECT USING (true); -- Master catalog definitions are public or referenced by store inventory

-- ----------------------------------------------------------------------------
-- STORE INVENTORY POLICIES
-- Staff can view exact stock; updates only by store admin.
-- DIRECT CUSTOMER ACCESS TO STORE_INVENTORY IS DENIED.
-- Customers query availability via public.customer_store_catalog (which hides stock_quantity).
-- ----------------------------------------------------------------------------
CREATE POLICY "Staff read store inventory" ON public.store_inventory
    FOR SELECT USING (
        public.is_store_staff(store_id, ARRAY['STORE_ADMIN', 'CASHIER', 'SECURITY_GUARD'])
    );

CREATE POLICY "Admin manage store inventory" ON public.store_inventory
    FOR ALL USING (public.is_store_staff(store_id, ARRAY['STORE_ADMIN']));

-- ----------------------------------------------------------------------------
-- STORE ENTRY SESSIONS POLICIES
-- Customer manages their own entrance session
-- ----------------------------------------------------------------------------
CREATE POLICY "User read own entry sessions" ON public.store_entry_sessions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "User insert own entry session" ON public.store_entry_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Staff read store entry sessions" ON public.store_entry_sessions
    FOR SELECT USING (public.is_store_staff(store_id, ARRAY['STORE_ADMIN', 'SECURITY_GUARD']));

-- ----------------------------------------------------------------------------
-- ORDERS POLICIES
-- Customers see only their own orders; staff see orders for their assigned store
-- ----------------------------------------------------------------------------
CREATE POLICY "Customer read own orders" ON public.orders
    FOR SELECT USING (auth.uid() = customer_id);

CREATE POLICY "Staff read assigned store orders" ON public.orders
    FOR SELECT USING (public.is_store_staff(store_id, ARRAY['STORE_ADMIN', 'CASHIER', 'SECURITY_GUARD']));

CREATE POLICY "Customer insert own orders" ON public.orders
    FOR INSERT WITH CHECK (
        auth.uid() = customer_id
        AND public.has_active_store_session(store_id)
        AND payment_status = 'PENDING'
    );

CREATE POLICY "Staff update assigned store orders" ON public.orders
    FOR UPDATE USING (
        public.is_store_staff(store_id, ARRAY['STORE_ADMIN', 'CASHIER'])
    )
    WITH CHECK (
        public.is_store_staff(store_id, ARRAY['STORE_ADMIN', 'CASHIER'])
    );

-- ----------------------------------------------------------------------------
-- ORDER ITEMS POLICIES
-- Linked to orders access
-- ----------------------------------------------------------------------------
CREATE POLICY "Read order items via order access" ON public.order_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_items.order_id
              AND (
                  o.customer_id = auth.uid()
                  OR public.is_store_staff(o.store_id, ARRAY['STORE_ADMIN', 'CASHIER', 'SECURITY_GUARD'])
              )
        )
    );

CREATE POLICY "Insert order items for valid order" ON public.order_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_items.order_id
              AND o.customer_id = auth.uid()
        )
    );

-- ----------------------------------------------------------------------------
-- EXIT PASSES POLICIES
-- Customer views their pass; Security guard verifies passes for their store
-- ----------------------------------------------------------------------------
CREATE POLICY "Customer read own exit pass" ON public.exit_passes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = exit_passes.order_id
              AND o.customer_id = auth.uid()
        )
    );

CREATE POLICY "Guard read and verify exit pass for assigned store" ON public.exit_passes
    FOR SELECT USING (public.is_store_staff(store_id, ARRAY['SECURITY_GUARD', 'STORE_ADMIN']));

CREATE POLICY "Guard update exit pass status" ON public.exit_passes
    FOR UPDATE USING (public.is_store_staff(store_id, ARRAY['SECURITY_GUARD', 'STORE_ADMIN']));

-- ----------------------------------------------------------------------------
-- SECURITY LOGS POLICIES
-- Guards and admins can insert and review audit logs for their store
-- ----------------------------------------------------------------------------
CREATE POLICY "Staff read store security logs" ON public.security_logs
    FOR SELECT USING (public.is_store_staff(store_id, ARRAY['SECURITY_GUARD', 'STORE_ADMIN']));

CREATE POLICY "Staff insert store security logs" ON public.security_logs
    FOR INSERT WITH CHECK (
        public.is_store_staff(store_id, ARRAY['SECURITY_GUARD', 'STORE_ADMIN'])
        AND auth.uid() = guard_id
    );

-- ============================================================================
-- TRUSTED SERVER-SIDE RPC FUNCTIONS
-- ============================================================================

-- 1. Validate Entrance QR Code and issue/refresh store entrance session
CREATE OR REPLACE FUNCTION public.validate_store_entrance_qr(p_store_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_store RECORD;
    v_session_token TEXT;
    v_expires_at TIMESTAMPTZ;
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to verify store entrance.';
    END IF;

    -- Look up active store
    SELECT id, code, name, branch, address, is_active
    INTO v_store
    FROM public.stores
    WHERE code = p_store_code;

    IF NOT FOUND OR v_store.is_active = false THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid or inactive supermarket entrance QR.'
        );
    END IF;

    -- Generate session token and 4-hour expiration window
    v_session_token := 'SES-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 16));
    v_expires_at := now() + interval '4 hours';

    -- Invalidate any prior active sessions for this user in other stores
    UPDATE public.store_entry_sessions
    SET is_active = false
    WHERE user_id = v_user_id;

    -- Insert new active session
    INSERT INTO public.store_entry_sessions (
        user_id,
        store_id,
        session_token,
        verified_at,
        expires_at,
        is_active
    ) VALUES (
        v_user_id,
        v_store.id,
        v_session_token,
        now(),
        v_expires_at,
        true
    );

    RETURN jsonb_build_object(
        'success', true,
        'store', jsonb_build_object(
            'id', v_store.id,
            'code', v_store.code,
            'name', v_store.name,
            'branch', v_store.branch,
            'address', v_store.address
        ),
        'sessionToken', v_session_token,
        'expiresAt', v_expires_at
    );
END;
$$;

-- 2. Verify Turnstile Exit Pass (Guard Gate Verification)
CREATE OR REPLACE FUNCTION public.verify_turnstile_exit_pass(
    p_order_id TEXT,
    p_terminal_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_guard_id UUID;
    v_guard_store_id TEXT;
    v_pass RECORD;
    v_order RECORD;
BEGIN
    v_guard_id := auth.uid();
    IF v_guard_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- Verify caller is a security guard
    SELECT store_id INTO v_guard_store_id
    FROM public.store_staff
    WHERE user_id = v_guard_id
      AND role IN ('SECURITY_GUARD', 'STORE_ADMIN');

    IF v_guard_store_id IS NULL THEN
        RAISE EXCEPTION 'Caller is not an authorized security guard or store admin.';
    END IF;

    -- Fetch exit pass
    SELECT * INTO v_pass
    FROM public.exit_passes
    WHERE order_id = p_order_id;

    IF NOT FOUND THEN
        -- Log failure
        INSERT INTO public.security_logs (
            store_id, order_id, guard_id, terminal_id, outcome, failure_reason, scanned_payload
        ) VALUES (
            v_guard_store_id, p_order_id, v_guard_id, p_terminal_id, 'failure', 'UNKNOWN_ORDER', p_order_id
        );

        RETURN jsonb_build_object(
            'success', false,
            'outcome', 'failure',
            'reason', 'UNKNOWN_ORDER',
            'message', 'Exit pass not found in database.'
        );
    END IF;

    -- Cross-store guard check: Guard cannot redeem passes from another store!
    IF v_pass.store_id <> v_guard_store_id THEN
        INSERT INTO public.security_logs (
            store_id, order_id, guard_id, terminal_id, outcome, failure_reason, scanned_payload
        ) VALUES (
            v_guard_store_id, p_order_id, v_guard_id, p_terminal_id, 'failure', 'STORE_MISMATCH', p_order_id
        );

        RETURN jsonb_build_object(
            'success', false,
            'outcome', 'failure',
            'reason', 'STORE_MISMATCH',
            'message', 'This exit pass was issued for a different store.'
        );
    END IF;

    -- Check duplicate redemption
    IF v_pass.status = 'VERIFIED' THEN
        INSERT INTO public.security_logs (
            store_id, order_id, guard_id, terminal_id, outcome, failure_reason, scanned_payload
        ) VALUES (
            v_guard_store_id, p_order_id, v_guard_id, p_terminal_id, 'duplicate_warning', 'DUPLICATE_EXIT_SCAN', p_order_id
        );

        RETURN jsonb_build_object(
            'success', false,
            'outcome', 'duplicate_warning',
            'reason', 'DUPLICATE_EXIT_SCAN',
            'message', 'Turnstile pass has already been used for gate exit at ' || to_char(v_pass.verified_at, 'HH12:MI AM'),
            'firstVerifiedAt', v_pass.verified_at
        );
    END IF;

    -- Check pass expiration (>15 mins from issue)
    IF v_pass.expires_at < now() OR v_pass.status = 'EXPIRED' THEN
        INSERT INTO public.security_logs (
            store_id, order_id, guard_id, terminal_id, outcome, failure_reason, scanned_payload
        ) VALUES (
            v_guard_store_id, p_order_id, v_guard_id, p_terminal_id, 'failure', 'EXPIRED_PASS', p_order_id
        );

        RETURN jsonb_build_object(
            'success', false,
            'outcome', 'failure',
            'reason', 'EXPIRED_PASS',
            'message', 'Turnstile gate pass has expired.'
        );
    END IF;

    -- Mark pass as verified atomically
    UPDATE public.exit_passes
    SET status = 'VERIFIED',
        verified_at = now(),
        verified_by = v_guard_id
    WHERE order_id = p_order_id;

    -- Log successful clearance
    INSERT INTO public.security_logs (
        store_id, order_id, guard_id, terminal_id, outcome, scanned_payload
    ) VALUES (
        v_guard_store_id, p_order_id, v_guard_id, p_terminal_id, 'success', p_order_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'outcome', 'success',
        'message', 'Turnstile gate clearance approved.',
        'verifiedAt', now()
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- RPC FUNCTION PERMISSIONS (Prevent anonymous access to security RPCs)
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.validate_store_entrance_qr(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.validate_store_entrance_qr(TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.verify_turnstile_exit_pass(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_turnstile_exit_pass(TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- AUTOMATIC PROFILE HYDRATION TRIGGER (On auth.users Signup)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email, avatar_initials)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        NEW.email,
        upper(substr(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'QL'), 1, 2))
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

