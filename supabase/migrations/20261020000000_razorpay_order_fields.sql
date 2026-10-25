-- ============================================================================
-- QLess Smart Shopping - Phase 1 & 2A: Razorpay Order Fields & Payment Safeguards
-- Store: STORE001 (QLess Mart)
-- Description:
--   1. Add nullable Razorpay tracking and refund columns to public.orders:
--      - razorpay_order_id (with partial unique index to prevent duplicate gateway orders)
--      - razorpay_payment_id (with partial unique index to prevent duplicate payment usage)
--      - razorpay_signature
--      - payment_attempt_expires_at (in-flight transaction window)
--      - payment_creation_locked_until (concurrency reservation window)
--      - stock_restored, stock_restored_at, cancellation_reason
--      - refund_status, refund_id, refund_amount, refund_reason, refunded_at
--   2. Update orders_payment_status_check to permit 'CANCELLED'
--   3. Audit ledgers:
--      - public.order_stock_restoration_logs
--      - public.razorpay_webhook_events (FIX 5: durable webhook deduplication)
--      - public.order_refund_jobs (FIX 1: durable refund recovery ledger)
--   4. RPCs:
--      - public.reserve_order_payment_creation (FIX 3: concurrency reservation)
--      - public.attach_razorpay_order_id (attaches gateway ID & 15-min grace window)
--      - public.cancel_and_restore_pending_order (exact-once stock restoration, distinct item audit keys)
--      - public.confirm_digital_order_payment (service_role only, order ID match, duplicate payment check, handles late capture with REFUND_REQUIRED)
--      - public.record_order_refund_confirmation (service_role only, transitions to REFUNDED)
--      - public.record_refund_job_requirement (FIX 1: stores durable refund job)
--      - public.record_webhook_event_start / finish (FIX 5: event deduplication)
--
-- SECURITY CONTROLS:
--   - FIX 1: Durable refund jobs survive webhook timeouts and transient failures.
--   - FIX 2: refund.processed binds primarily to payment_id, rejecting ambiguous or conflicting notes.
--   - FIX 3: reserve_order_payment_creation prevents concurrent order creation at Razorpay gateway.
--   - FIX 4: Conservative expiry policy protects in-flight and delayed payments.
--   - FIX 5: Unique event_id constraint prevents webhook event replay and out-of-order corruption.
--   - FIX 6: Timing-safe 64-byte comparison for cryptographic signatures.
--   - Zero-trust execution: confirm_digital_order_payment, record_order_refund_confirmation,
--     and webhook event functions granted strictly to service_role.
--   - LOCAL DEVELOPMENT PREPARATION ONLY — DO NOT EXECUTE ON REMOTE SUPABASE.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ADD RAZORPAY TRACKING, CANCELLATION & REFUND COLUMNS TO ORDERS TABLE
-- ----------------------------------------------------------------------------
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT,
ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT,
ADD COLUMN IF NOT EXISTS razorpay_signature TEXT,
ADD COLUMN IF NOT EXISTS payment_attempt_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS payment_creation_locked_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS stock_restored BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS stock_restored_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS refund_status TEXT CHECK (refund_status IN ('NONE', 'REFUND_REQUIRED', 'REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED')) DEFAULT 'NONE',
ADD COLUMN IF NOT EXISTS refund_id TEXT,
ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS refund_reason TEXT,
ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.razorpay_order_id IS 'Authoritative Razorpay order ID (e.g. order_EKwxwAgIt42jtx). Globally unique when present.';
COMMENT ON COLUMN public.orders.razorpay_payment_id IS 'Captured Razorpay payment ID (e.g. pay_29QQoUBcxrhErq). Globally unique when present.';
COMMENT ON COLUMN public.orders.razorpay_signature IS 'Cryptographic HMAC-SHA256 signature verified by server-side Edge Function.';
COMMENT ON COLUMN public.orders.payment_attempt_expires_at IS 'Expiration timestamp for the digital payment window. Protects active in-flight payments from premature cancellation.';
COMMENT ON COLUMN public.orders.payment_creation_locked_until IS 'Short-lived lock timestamp preventing concurrent Razorpay order creation on the gateway.';
COMMENT ON COLUMN public.orders.stock_restored IS 'Boolean flag ensuring inventory stock is restored exactly once upon order cancellation or expiry.';
COMMENT ON COLUMN public.orders.stock_restored_at IS 'Timestamp when inventory stock was restored to store inventory.';
COMMENT ON COLUMN public.orders.cancellation_reason IS 'Authoritative reason recorded upon order cancellation or timeout expiry.';
COMMENT ON COLUMN public.orders.refund_status IS 'Authoritative refund state machine: NONE -> REFUND_REQUIRED -> REFUND_PENDING -> REFUNDED | REFUND_FAILED.';
COMMENT ON COLUMN public.orders.refund_id IS 'Authoritative Razorpay refund ID (e.g. rfnd_xxx) confirmed via gateway webhook.';
COMMENT ON COLUMN public.orders.refund_amount IS 'Total refund amount processed for the cancelled order.';
COMMENT ON COLUMN public.orders.refund_reason IS 'Audited justification for refund (e.g. late payment capture on cancelled order).';
COMMENT ON COLUMN public.orders.refunded_at IS 'Timestamp when gateway confirmed completion of refund.';

-- Partial unique indexes: ensures no two orders share the same gateway IDs,
-- while allowing historical orders to have NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_razorpay_order_id 
ON public.orders(razorpay_order_id) 
WHERE razorpay_order_id IS NOT NULL;

DROP INDEX IF EXISTS public.idx_orders_razorpay_payment_id;
CREATE UNIQUE INDEX idx_orders_razorpay_payment_id 
ON public.orders(razorpay_payment_id) 
WHERE razorpay_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_payment_expiry 
ON public.orders(payment_attempt_expires_at) 
WHERE payment_status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_orders_refund_status 
ON public.orders(refund_status) 
WHERE refund_status <> 'NONE';

-- ----------------------------------------------------------------------------
-- 2. UPDATE PAYMENT STATUS CONSTRAINT TO ALLOW 'CANCELLED'
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'orders_payment_status_check' 
          AND conrelid = 'public.orders'::regclass
    ) THEN
        ALTER TABLE public.orders DROP CONSTRAINT orders_payment_status_check;
    END IF;

    ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check 
        CHECK (payment_status IN ('PENDING', 'CONFIRMED', 'FAILED', 'REFUNDED', 'CANCELLED'));
END $$;

-- ----------------------------------------------------------------------------
-- 3. AUDIT LEDGERS
-- ----------------------------------------------------------------------------

-- A. Order Stock Restoration Logs (Existing)
CREATE TABLE IF NOT EXISTS public.order_stock_restoration_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    barcode TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity_restored INT NOT NULL CHECK (quantity_restored > 0),
    previous_stock INT NOT NULL CHECK (previous_stock >= 0),
    new_stock INT NOT NULL CHECK (new_stock >= previous_stock),
    reason TEXT NOT NULL,
    restored_by UUID REFERENCES auth.users(id),
    idempotency_key TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_restore_order ON public.order_stock_restoration_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_stock_restore_store ON public.order_stock_restoration_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_stock_restore_created ON public.order_stock_restoration_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_restore_idemp ON public.order_stock_restoration_logs(idempotency_key);

ALTER TABLE public.order_stock_restoration_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read stock restoration logs" ON public.order_stock_restoration_logs;
CREATE POLICY "Staff read stock restoration logs" ON public.order_stock_restoration_logs
    FOR SELECT USING (
        public.is_store_staff(store_id, ARRAY['STORE_ADMIN', 'CASHIER', 'SECURITY_GUARD'])
    );

DROP POLICY IF EXISTS "Service role manage stock restoration logs" ON public.order_stock_restoration_logs;
CREATE POLICY "Service role manage stock restoration logs" ON public.order_stock_restoration_logs
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- B. Webhook Events Ledger (FIX 5: Durable Webhook Deduplication)
CREATE TABLE IF NOT EXISTS public.razorpay_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT UNIQUE NOT NULL,
    event_type TEXT NOT NULL,
    order_id TEXT REFERENCES public.orders(id) ON DELETE SET NULL,
    payment_id TEXT,
    refund_id TEXT,
    status TEXT NOT NULL DEFAULT 'PROCESSING' CHECK (status IN ('PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_id ON public.razorpay_webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_order ON public.razorpay_webhook_events(order_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON public.razorpay_webhook_events(status);

ALTER TABLE public.razorpay_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manage webhook events" ON public.razorpay_webhook_events;
CREATE POLICY "Service role manage webhook events" ON public.razorpay_webhook_events
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- C. Order Refund Jobs Ledger (FIX 1: Durable Refund Recovery Ledger)
CREATE TABLE IF NOT EXISTS public.order_refund_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    payment_id TEXT NOT NULL,
    amount_paise INT NOT NULL CHECK (amount_paise > 0),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'MANUAL_REVIEW')),
    retry_count INT NOT NULL DEFAULT 0,
    last_error TEXT,
    idempotency_key TEXT UNIQUE NOT NULL,
    refund_id TEXT,
    lease_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.order_refund_jobs ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_refund_jobs_order ON public.order_refund_jobs(order_id);
CREATE INDEX IF NOT EXISTS idx_refund_jobs_status ON public.order_refund_jobs(status);
CREATE INDEX IF NOT EXISTS idx_refund_jobs_payment ON public.order_refund_jobs(payment_id);
CREATE INDEX IF NOT EXISTS idx_refund_jobs_lease ON public.order_refund_jobs(status, lease_expires_at);

ALTER TABLE public.order_refund_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manage refund jobs" ON public.order_refund_jobs;
CREATE POLICY "Service role manage refund jobs" ON public.order_refund_jobs
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- 4. RPC: RESERVE ORDER PAYMENT CREATION (FIX 3: CONCURRENCY RESERVATION)
-- Row-locks order to prevent simultaneous requests from creating duplicate
-- orders on Razorpay's gateway.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_order_payment_creation(
    p_order_id TEXT,
    p_lock_duration_seconds INT DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_clean_order_id TEXT;
    v_is_service_role BOOLEAN;
    v_is_store_admin BOOLEAN;
BEGIN
    v_clean_order_id := trim(p_order_id);

    IF v_clean_order_id IS NULL OR length(v_clean_order_id) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order ID is required.');
    END IF;

    -- Lock order row for update
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = v_clean_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found: ' || v_clean_order_id);
    END IF;

    v_is_service_role := (auth.role() = 'service_role');
    v_is_store_admin := public.is_store_staff(v_order.store_id, ARRAY['STORE_ADMIN']);

    -- Null-safe ownership verification
    IF NOT v_is_service_role AND NOT v_is_store_admin THEN
        IF v_order.customer_id IS NULL OR auth.uid() IS DISTINCT FROM v_order.customer_id THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Caller does not own this order.');
        END IF;
    END IF;

    -- Cash orders must not use digital creation
    IF v_order.payment_method = 'cash' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cash orders cannot be processed digitally.');
    END IF;

    -- Status check: Can only create for PENDING orders
    IF v_order.payment_status <> 'PENDING' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot create payment: Order status is ' || v_order.payment_status);
    END IF;

    -- Stock restoration check
    IF v_order.stock_restored IS TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot create payment: Order inventory has already been restored.');
    END IF;

    -- If already has an active Razorpay order, return it idempotently
    IF v_order.razorpay_order_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'orderId', v_order.id,
            'razorpayOrderId', v_order.razorpay_order_id,
            'isExisting', true,
            'expiresAt', v_order.payment_attempt_expires_at
        );
    END IF;

    -- Check if another request has an active lock reservation
    IF v_order.payment_creation_locked_until IS NOT NULL AND v_order.payment_creation_locked_until > now() THEN
        RETURN jsonb_build_object(
            'success', false,
            'isLocked', true,
            'error', 'Payment creation is already in progress for this order. Please retry in a moment.'
        );
    END IF;

    -- Establish short-lived creation reservation
    UPDATE public.orders
    SET payment_creation_locked_until = now() + (COALESCE(p_lock_duration_seconds, 60) || ' seconds')::interval
    WHERE id = v_order.id;

    RETURN jsonb_build_object(
        'success', true,
        'orderId', v_order.id,
        'isReserved', true,
        'lockedUntil', now() + (COALESCE(p_lock_duration_seconds, 60) || ' seconds')::interval
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_order_payment_creation(TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_order_payment_creation(TEXT, INT) TO service_role, authenticated;

-- ----------------------------------------------------------------------------
-- 5. RPC: ATTACH RAZORPAY ORDER ID & SET PAYMENT WINDOW
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attach_razorpay_order_id(
    p_order_id TEXT,
    p_razorpay_order_id TEXT,
    p_validity_minutes INT DEFAULT 15
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_clean_order_id TEXT;
    v_clean_rzp_id TEXT;
    v_expires_at TIMESTAMPTZ;
    v_is_service_role BOOLEAN;
    v_is_store_admin BOOLEAN;
BEGIN
    v_clean_order_id := trim(p_order_id);
    v_clean_rzp_id := trim(p_razorpay_order_id);

    IF v_clean_order_id IS NULL OR length(v_clean_order_id) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order ID is required.');
    END IF;

    IF v_clean_rzp_id IS NULL OR length(v_clean_rzp_id) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Razorpay order ID is required.');
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = v_clean_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found: ' || v_clean_order_id);
    END IF;

    v_is_service_role := (auth.role() = 'service_role');
    v_is_store_admin := public.is_store_staff(v_order.store_id, ARRAY['STORE_ADMIN']);

    IF NOT v_is_service_role AND NOT v_is_store_admin THEN
        IF v_order.customer_id IS NULL OR auth.uid() IS DISTINCT FROM v_order.customer_id THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Caller does not own this order.');
        END IF;
    END IF;

    IF v_order.payment_status <> 'PENDING' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot attach Razorpay order: order status is ' || v_order.payment_status);
    END IF;

    IF v_order.payment_method = 'cash' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot attach Razorpay order to a cash-at-counter order.');
    END IF;

    IF v_order.razorpay_order_id = v_clean_rzp_id THEN
        RETURN jsonb_build_object(
            'success', true,
            'orderId', v_order.id,
            'razorpayOrderId', v_order.razorpay_order_id,
            'expiresAt', v_order.payment_attempt_expires_at,
            'isDuplicate', true
        );
    END IF;

    IF v_order.razorpay_order_id IS NOT NULL AND v_order.razorpay_order_id <> v_clean_rzp_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order is already associated with Razorpay order ' || v_order.razorpay_order_id);
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.orders 
        WHERE razorpay_order_id = v_clean_rzp_id 
          AND id <> v_order.id
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Razorpay order ID ' || v_clean_rzp_id || ' is already assigned to another order.');
    END IF;

    v_expires_at := now() + (COALESCE(p_validity_minutes, 15) || ' minutes')::interval;

    UPDATE public.orders
    SET razorpay_order_id = v_clean_rzp_id,
        payment_attempt_expires_at = v_expires_at,
        payment_creation_locked_until = NULL  -- Clear concurrency reservation
    WHERE id = v_order.id;

    RETURN jsonb_build_object(
        'success', true,
        'orderId', v_order.id,
        'razorpayOrderId', v_clean_rzp_id,
        'expiresAt', v_expires_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.attach_razorpay_order_id(TEXT, TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_razorpay_order_id(TEXT, TEXT, INT) TO service_role, authenticated;

-- ----------------------------------------------------------------------------
-- 6. RPC: CANCEL & RESTORE PENDING DIGITAL ORDER (EXACT-ONCE RESTORATION)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_and_restore_pending_order(
    p_order_id TEXT,
    p_reason TEXT DEFAULT 'Payment window expired without confirmation',
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_clean_order_id TEXT;
    v_clean_reason TEXT;
    v_prod_ids INT[];
    v_item RECORD;
    v_prev_stock INT;
    v_new_stock INT;
    v_restored_count INT := 0;
    v_is_service_role BOOLEAN;
    v_is_store_admin BOOLEAN;
    v_item_idempotency_key TEXT;
BEGIN
    v_clean_order_id := trim(p_order_id);
    v_clean_reason := COALESCE(trim(p_reason), 'Payment window expired without confirmation');

    IF v_clean_order_id IS NULL OR length(v_clean_order_id) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order ID is required.');
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = v_clean_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found: ' || v_clean_order_id);
    END IF;

    v_is_service_role := (auth.role() = 'service_role');
    v_is_store_admin := public.is_store_staff(v_order.store_id, ARRAY['STORE_ADMIN']);

    IF NOT v_is_service_role AND NOT v_is_store_admin THEN
        IF v_order.customer_id IS NULL OR auth.uid() IS DISTINCT FROM v_order.customer_id THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Caller cannot cancel this order.');
        END IF;
    END IF;

    IF v_order.payment_method = 'cash' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cash orders cannot be cancelled via digital cancellation RPC. Please resolve at Cashier Counter.');
    END IF;

    IF v_order.payment_status = 'CANCELLED' AND v_order.stock_restored IS TRUE THEN
        RETURN jsonb_build_object(
            'success', true,
            'orderId', v_order.id,
            'status', 'CANCELLED',
            'stockRestored', true,
            'isDuplicate', true,
            'message', 'Order was already cancelled and inventory restored.'
        );
    END IF;

    IF NOT v_is_service_role AND NOT v_is_store_admin THEN
        IF v_order.payment_attempt_expires_at IS NOT NULL AND now() < v_order.payment_attempt_expires_at THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Payment attempt is currently processing. Order cannot be cancelled until the payment window expires at ' || to_char(v_order.payment_attempt_expires_at, 'HH24:MI:SS') || ' UTC.'
            );
        END IF;
    END IF;

    IF v_order.payment_status = 'CONFIRMED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot cancel order: payment has already been CONFIRMED.');
    END IF;

    IF v_order.payment_status NOT IN ('PENDING', 'FAILED') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order in status ' || v_order.payment_status || ' is not eligible for cancellation.');
    END IF;

    IF v_order.stock_restored IS TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Inventory stock has already been restored for this order.');
    END IF;

    SELECT array_agg(DISTINCT product_id ORDER BY product_id ASC)
    INTO v_prod_ids
    FROM public.order_items
    WHERE order_id = v_order.id;

    IF v_prod_ids IS NOT NULL AND array_length(v_prod_ids, 1) > 0 THEN
        PERFORM 1
        FROM public.store_inventory
        WHERE store_id = v_order.store_id
          AND product_id = ANY(v_prod_ids)
        ORDER BY product_id ASC
        FOR UPDATE;

        FOR v_item IN 
            SELECT product_id, quantity, product_name, barcode, unit_price, total_price
            FROM public.order_items
            WHERE order_id = v_order.id
            ORDER BY product_id ASC
        LOOP
            SELECT stock_quantity INTO v_prev_stock
            FROM public.store_inventory
            WHERE store_id = v_order.store_id
              AND product_id = v_item.product_id;

            IF v_prev_stock IS NULL THEN
                RAISE EXCEPTION 'Inventory row missing for product ID % in store %', v_item.product_id, v_order.store_id;
            END IF;

            v_new_stock := v_prev_stock + v_item.quantity;

            UPDATE public.store_inventory
            SET stock_quantity = v_new_stock,
                updated_at = now()
            WHERE store_id = v_order.store_id
              AND product_id = v_item.product_id;

            v_item_idempotency_key := CASE 
                WHEN p_idempotency_key IS NOT NULL AND length(trim(p_idempotency_key)) > 0 
                THEN trim(p_idempotency_key) || ':' || v_item.product_id::text
                ELSE 'RESTORE:' || v_order.id || ':' || v_item.product_id::text
            END;

            INSERT INTO public.order_stock_restoration_logs (
                store_id,
                order_id,
                product_id,
                barcode,
                product_name,
                quantity_restored,
                previous_stock,
                new_stock,
                reason,
                restored_by,
                idempotency_key
            ) VALUES (
                v_order.store_id,
                v_order.id,
                v_item.product_id,
                v_item.barcode,
                v_item.product_name,
                v_item.quantity,
                v_prev_stock,
                v_new_stock,
                v_clean_reason,
                auth.uid(),
                v_item_idempotency_key
            ) ON CONFLICT (idempotency_key) DO NOTHING;

            v_restored_count := v_restored_count + 1;
        END LOOP;
    END IF;

    UPDATE public.orders
    SET payment_status = 'CANCELLED',
        stock_restored = true,
        stock_restored_at = now(),
        cancellation_reason = v_clean_reason,
        payment_creation_locked_until = NULL
    WHERE id = v_order.id;

    RETURN jsonb_build_object(
        'success', true,
        'orderId', v_order.id,
        'status', 'CANCELLED',
        'stockRestored', true,
        'restoredItemsCount', v_restored_count,
        'reason', v_clean_reason,
        'cancelledAt', now()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_and_restore_pending_order(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_and_restore_pending_order(TEXT, TEXT, TEXT) TO service_role, authenticated;

-- ----------------------------------------------------------------------------
-- 7. UPDATE RPC: CONFIRM DIGITAL ORDER PAYMENT (SERVICE_ROLE ONLY)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.confirm_digital_order_payment(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.confirm_digital_order_payment(TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.confirm_digital_order_payment(TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.confirm_digital_order_payment(
    p_order_id TEXT,
    p_gateway_reference TEXT,
    p_razorpay_payment_id TEXT DEFAULT NULL,
    p_razorpay_signature TEXT DEFAULT NULL,
    p_razorpay_order_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_clean_order_id TEXT;
    v_clean_gateway_ref TEXT;
    v_clean_payment_id TEXT;
    v_clean_rzp_order_id TEXT;
    v_existing_payment_order_id TEXT;
BEGIN
    v_clean_order_id := trim(p_order_id);
    v_clean_gateway_ref := trim(p_gateway_reference);
    v_clean_payment_id := COALESCE(trim(p_razorpay_payment_id), v_clean_gateway_ref);
    v_clean_rzp_order_id := trim(p_razorpay_order_id);

    IF v_clean_order_id IS NULL OR length(v_clean_order_id) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Missing order ID.');
    END IF;

    IF v_clean_gateway_ref IS NULL OR length(v_clean_gateway_ref) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Missing payment gateway reference.');
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = v_clean_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found: ' || v_clean_order_id);
    END IF;

    IF v_order.payment_method = 'cash' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cash orders must be confirmed via cashier counter settlement.');
    END IF;

    IF v_clean_rzp_order_id IS NOT NULL AND length(v_clean_rzp_order_id) > 0 THEN
        IF v_order.razorpay_order_id IS NOT NULL AND v_order.razorpay_order_id <> v_clean_rzp_order_id THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Razorpay order ID mismatch: expected ' || v_order.razorpay_order_id || ' but received ' || v_clean_rzp_order_id
            );
        END IF;
    END IF;

    IF v_clean_payment_id IS NOT NULL AND length(v_clean_payment_id) > 0 THEN
        SELECT id INTO v_existing_payment_order_id
        FROM public.orders
        WHERE razorpay_payment_id = v_clean_payment_id
          AND id <> v_clean_order_id
        LIMIT 1;

        IF v_existing_payment_order_id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Razorpay payment ID ' || v_clean_payment_id || ' is already assigned to order ' || v_existing_payment_order_id
            );
        END IF;
    END IF;

    -- Late capture on cancelled order: stages REFUND_REQUIRED and records durable refund job
    IF v_order.payment_status = 'CANCELLED' OR v_order.stock_restored IS TRUE THEN
        UPDATE public.orders
        SET refund_status = CASE 
                WHEN refund_status = 'NONE' THEN 'REFUND_REQUIRED' 
                ELSE refund_status 
            END,
            refund_amount = v_order.final_total,
            refund_reason = COALESCE(refund_reason, 'Payment captured after order cancellation and inventory restoration'),
            razorpay_payment_id = COALESCE(razorpay_payment_id, v_clean_payment_id),
            razorpay_signature = COALESCE(razorpay_signature, trim(p_razorpay_signature))
        WHERE id = v_clean_order_id;

        -- FIX 1: Insert durable refund job
        INSERT INTO public.order_refund_jobs (
            order_id,
            payment_id,
            amount_paise,
            status,
            idempotency_key
        ) VALUES (
            v_clean_order_id,
            v_clean_payment_id,
            round(v_order.final_total * 100)::INT,
            'PENDING',
            'JOB-REFUND-' || v_clean_order_id || '-' || v_clean_payment_id
        ) ON CONFLICT (idempotency_key) DO NOTHING;

        RETURN jsonb_build_object(
            'success', false,
            'requiresRefund', true,
            'orderId', v_clean_order_id,
            'refundStatus', 'REFUND_REQUIRED',
            'refundAmount', v_order.final_total,
            'razorpayPaymentId', v_clean_payment_id,
            'error', 'Cannot confirm payment: Order was cancelled and inventory has already been restored. Order marked REFUND_REQUIRED and durable refund job recorded.'
        );
    END IF;

    IF v_order.payment_status = 'CONFIRMED' THEN
        RETURN jsonb_build_object(
            'success', true,
            'message', 'Order was already confirmed.',
            'orderId', v_clean_order_id,
            'isDuplicate', true
        );
    END IF;

    IF v_order.payment_status NOT IN ('PENDING', 'FAILED') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot confirm payment: Order is in status ' || v_order.payment_status
        );
    END IF;

    UPDATE public.orders
    SET payment_status = 'CONFIRMED',
        payment_reference = v_clean_gateway_ref,
        razorpay_payment_id = v_clean_payment_id,
        razorpay_signature = COALESCE(trim(p_razorpay_signature), razorpay_signature),
        razorpay_order_id = COALESCE(razorpay_order_id, v_clean_rzp_order_id),
        paid_at = now()
    WHERE id = v_clean_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'orderId', v_clean_order_id,
        'status', 'CONFIRMED',
        'gatewayReference', v_clean_gateway_ref,
        'razorpayPaymentId', v_clean_payment_id,
        'confirmedAt', now()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_digital_order_payment(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_digital_order_payment(TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ----------------------------------------------------------------------------
-- 8. RPC: RECORD ORDER REFUND CONFIRMATION (SERVICE_ROLE ONLY)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_order_refund_confirmation(
    p_order_id TEXT,
    p_refund_id TEXT,
    p_refund_amount NUMERIC,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_clean_order_id TEXT;
    v_clean_refund_id TEXT;
BEGIN
    v_clean_order_id := trim(p_order_id);
    v_clean_refund_id := trim(p_refund_id);

    IF v_clean_order_id IS NULL OR length(v_clean_order_id) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Missing order ID.');
    END IF;

    IF v_clean_refund_id IS NULL OR length(v_clean_refund_id) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Missing Razorpay refund ID.');
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = v_clean_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found: ' || v_clean_order_id);
    END IF;

    IF v_order.refund_status = 'REFUNDED' AND v_order.refund_id = v_clean_refund_id THEN
        RETURN jsonb_build_object(
            'success', true,
            'message', 'Refund was already recorded.',
            'orderId', v_clean_order_id,
            'refundId', v_clean_refund_id,
            'isDuplicate', true
        );
    END IF;

    UPDATE public.orders
    SET refund_status = 'REFUNDED',
        refund_id = v_clean_refund_id,
        refund_amount = COALESCE(p_refund_amount, v_order.final_total),
        refund_reason = COALESCE(trim(p_reason), refund_reason, 'Refund confirmed via payment gateway webhook'),
        refunded_at = now()
    WHERE id = v_clean_order_id;

    -- Update refund job if exists
    UPDATE public.order_refund_jobs
    SET status = 'SUCCEEDED',
        refund_id = v_clean_refund_id,
        lease_expires_at = NULL,
        updated_at = now()
    WHERE order_id = v_clean_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'orderId', v_clean_order_id,
        'refundStatus', 'REFUNDED',
        'refundId', v_clean_refund_id,
        'refundAmount', COALESCE(p_refund_amount, v_order.final_total),
        'refundedAt', now()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_order_refund_confirmation(TEXT, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_order_refund_confirmation(TEXT, TEXT, NUMERIC, TEXT) TO service_role;

-- ----------------------------------------------------------------------------
-- 8B. RPC: CLAIM ORDER REFUND JOB (SAFE RECOVERY & LEASE OWNERSHIP)
-- Allows atomic claiming of PENDING refund jobs, or recovery of PROCESSING
-- jobs whose lease has expired following a worker crash.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_order_refund_job(
    p_order_id TEXT,
    p_payment_id TEXT,
    p_lease_seconds INT DEFAULT 300
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_order_id TEXT;
    v_clean_payment_id TEXT;
    v_lease_duration INT;
    v_job RECORD;
    v_lease_expires_at TIMESTAMPTZ;
BEGIN
    v_clean_order_id := trim(p_order_id);
    v_clean_payment_id := trim(p_payment_id);
    v_lease_duration := COALESCE(p_lease_seconds, 300);

    IF v_clean_order_id IS NULL OR length(v_clean_order_id) = 0 THEN
        RETURN jsonb_build_object('success', false, 'isClaimed', false, 'error', 'Missing order ID.');
    END IF;

    IF v_clean_payment_id IS NULL OR length(v_clean_payment_id) = 0 THEN
        RETURN jsonb_build_object('success', false, 'isClaimed', false, 'error', 'Missing payment ID.');
    END IF;

    -- Row-lock refund job for update
    SELECT * INTO v_job
    FROM public.order_refund_jobs
    WHERE order_id = v_clean_order_id
      AND payment_id = v_clean_payment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'isClaimed', false,
            'error', 'Refund job not found for order ' || v_clean_order_id
        );
    END IF;

    -- Terminal states or manual review must not be claimed
    IF v_job.status IN ('SUCCEEDED', 'FAILED', 'MANUAL_REVIEW') THEN
        RETURN jsonb_build_object(
            'success', false,
            'isClaimed', false,
            'status', v_job.status,
            'refundId', v_job.refund_id,
            'message', 'Job is in terminal or manual review status: ' || v_job.status
        );
    END IF;

    -- If currently in PROCESSING, only allow claiming if lease has expired
    IF v_job.status = 'PROCESSING' THEN
        IF v_job.lease_expires_at IS NOT NULL AND v_job.lease_expires_at > now() THEN
            RETURN jsonb_build_object(
                'success', false,
                'isClaimed', false,
                'isLocked', true,
                'status', 'PROCESSING',
                'leaseExpiresAt', v_job.lease_expires_at,
                'message', 'Refund job is currently locked by an active worker lease.'
            );
        END IF;
    END IF;

    v_lease_expires_at := now() + (v_lease_duration || ' seconds')::interval;

    -- Atomically grant lease ownership
    UPDATE public.order_refund_jobs
    SET status = 'PROCESSING',
        lease_expires_at = v_lease_expires_at,
        updated_at = now()
    WHERE id = v_job.id;

    RETURN jsonb_build_object(
        'success', true,
        'isClaimed', true,
        'jobId', v_job.id,
        'status', 'PROCESSING',
        'retryCount', v_job.retry_count,
        'leaseExpiresAt', v_lease_expires_at,
        'wasStaleRecovery', (v_job.status = 'PROCESSING')
    );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_order_refund_job(TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_order_refund_job(TEXT, TEXT, INT) TO service_role;

-- ----------------------------------------------------------------------------
-- 9. RPC: WEBHOOK EVENT DEDUPLICATION (FIX 5: SERVICE_ROLE ONLY)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_webhook_event_start(
    p_event_id TEXT,
    p_event_type TEXT,
    p_payment_id TEXT DEFAULT NULL,
    p_order_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_event_id TEXT;
    v_clean_event_type TEXT;
    v_existing RECORD;
BEGIN
    v_clean_event_id := trim(p_event_id);
    v_clean_event_type := trim(p_event_type);

    IF v_clean_event_id IS NULL OR length(v_clean_event_id) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Missing event ID.');
    END IF;

    SELECT * INTO v_existing
    FROM public.razorpay_webhook_events
    WHERE event_id = v_clean_event_id;

    IF FOUND THEN
        -- If already processed, return idempotent signal
        IF v_existing.status = 'PROCESSED' THEN
            RETURN jsonb_build_object(
                'success', true,
                'isDuplicate', true,
                'status', 'PROCESSED',
                'message', 'Webhook event already processed successfully.'
            );
        END IF;

        -- If currently processing or failed previously, allow retry but return existing record
        RETURN jsonb_build_object(
            'success', true,
            'isDuplicate', true,
            'status', v_existing.status,
            'message', 'Webhook event already recorded in status ' || v_existing.status
        );
    END IF;

    INSERT INTO public.razorpay_webhook_events (
        event_id,
        event_type,
        payment_id,
        order_id,
        status
    ) VALUES (
        v_clean_event_id,
        v_clean_event_type,
        trim(p_payment_id),
        trim(p_order_id),
        'PROCESSING'
    );

    RETURN jsonb_build_object(
        'success', true,
        'isDuplicate', false,
        'status', 'PROCESSING'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_webhook_event_start(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_webhook_event_start(TEXT, TEXT, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.record_webhook_event_finish(
    p_event_id TEXT,
    p_status TEXT,
    p_order_id TEXT DEFAULT NULL,
    p_error TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_event_id TEXT;
    v_clean_status TEXT;
BEGIN
    v_clean_event_id := trim(p_event_id);
    v_clean_status := trim(p_status);

    UPDATE public.razorpay_webhook_events
    SET status = v_clean_status,
        order_id = COALESCE(trim(p_order_id), order_id),
        error_message = trim(p_error),
        processed_at = now()
    WHERE event_id = v_clean_event_id;

    RETURN jsonb_build_object('success', true, 'eventId', v_clean_event_id, 'status', v_clean_status);
END;
$$;

REVOKE ALL ON FUNCTION public.record_webhook_event_finish(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_webhook_event_finish(TEXT, TEXT, TEXT, TEXT) TO service_role;
