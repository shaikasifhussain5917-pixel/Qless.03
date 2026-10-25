-- ============================================================================
-- QLess Smart Shopping - Phase 5 Secure Atomic Checkout Backend
-- Feature: process_self_checkout_order RPC & Direct Insert Revocation
-- Target: Supabase PostgreSQL with Strict Zero-Trust Security
-- Store: QLess Mart (STORE001 / QLM001)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ADD IDEMPOTENCY KEY & PAYLOAD HASH TO ORDERS TABLE
-- Prevents duplicate order creation and duplicate inventory decrements
-- upon mobile network retries or multiple checkout submissions.
-- Binds idempotency key strictly to normalized cart contents to prevent payload drift.
-- ----------------------------------------------------------------------------
ALTER TABLE public.orders 
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS payload_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_idempotency_key 
    ON public.orders(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_orders_payload_hash 
    ON public.orders(payload_hash);

-- ----------------------------------------------------------------------------
-- 2. REVOKE DIRECT CLIENT INSERT PRIVILEGES ON ORDERS & ORDER_ITEMS
-- Closes direct client insertion vulnerabilities.
-- All order creation MUST pass through the trusted process_self_checkout_order RPC.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Customer insert own orders" ON public.orders;
DROP POLICY IF EXISTS "Insert order items for valid order" ON public.order_items;
DROP POLICY IF EXISTS "Customer read own orders" ON public.orders;
DROP POLICY IF EXISTS "Read order items via order access" ON public.order_items;

REVOKE INSERT, UPDATE, DELETE ON public.orders FROM anon, authenticated, PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.order_items FROM anon, authenticated, PUBLIC;

-- Re-grant SELECT to authenticated clients so customers and staff can read orders
GRANT SELECT ON public.orders TO authenticated;
GRANT SELECT ON public.order_items TO authenticated;

-- Ensure read policies are active
CREATE POLICY "Customer read own orders" ON public.orders
    FOR SELECT USING (auth.uid() = customer_id);

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

-- ----------------------------------------------------------------------------
-- 3. ATOMIC SELF-CHECKOUT RPC PROCEDURE
-- Executes complete checkout lifecycle in a single ACID transaction with two distinct passes:
-- PASS 1 (Zero-Mutation Validation & Calculation):
--   - Validates customer authentication & active entrance gate session
--   - Validates payment method and cart payload structure
--   - Normalizes cart contents and validates deterministic payload hash
--   - Validates idempotency key against customer ownership and matching payload
--   - Locks store inventory rows in ascending order (deadlock-free)
--   - Verifies product availability and stock sufficiency
--   - Computes authoritative financials and validates server coupon codes
--   - Any failure returns a safe error without modifying a single row or unit of inventory
-- PASS 2 (Atomic Mutations):
--   - Inserts order in PENDING status and immutable order line items with payload_hash
--   - Atomically decrements store inventory stock
--   - Handles concurrency races on idempotency keys safely
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_self_checkout_order(
    p_store_id TEXT,
    p_items JSONB,
    p_payment_method TEXT,
    p_idempotency_key TEXT,
    p_coupon_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_customer_id UUID;
    v_session_token TEXT;
    v_existing_order RECORD;
    v_order_id TEXT;
    v_receipt_id TEXT;
    
    -- Processing structures and metrics
    v_item RECORD;
    v_prod_ids INT[] := ARRAY[]::INT[];
    v_requested_quantities JSONB := '{}'::JSONB;
    v_unique_count INT := 0;
    v_total_items INT := 0;
    v_validated_items JSONB := '[]'::JSONB;
    v_elem JSONB;
    v_normalized_cart TEXT;
    v_payload_hash TEXT;
    
    -- Authoritative financials (stored as exact NUMERIC(10,2))
    v_subtotal NUMERIC(10,2) := 0.00;
    v_total_mrp NUMERIC(10,2) := 0.00;
    v_mrp_savings NUMERIC(10,2) := 0.00;
    v_coupon_code TEXT := NULL;
    v_coupon_discount NUMERIC(10,2) := 0.00;
    v_taxable_amount NUMERIC(10,2) := 0.00;
    v_cgst NUMERIC(10,2) := 0.00;
    v_sgst NUMERIC(10,2) := 0.00;
    v_tax_total NUMERIC(10,2) := 0.00;
    v_final_total NUMERIC(10,2) := 0.00;
    v_payment_ref TEXT;
BEGIN
    -- ========================================================================
    -- PASS 1: ZERO-MUTATION VALIDATION & FINANCIAL CALCULATION
    -- All checks execute BEFORE any database mutations. If any check fails,
    -- the function returns a safe failure response leaving all tables and
    -- inventory untouched.
    -- ========================================================================

    -- 1. Authentication Check
    v_customer_id := auth.uid();
    IF v_customer_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required: User must be signed in to checkout.';
    END IF;

    -- 2. Store Validation & Active Store Entrance Gate Check
    IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id AND is_active = true) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid or inactive store: ' || COALESCE(p_store_id, 'NULL'));
    END IF;

    IF NOT public.has_active_store_session(p_store_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Active store entrance session required. Please scan entrance gate QR.');
    END IF;

    -- Retrieve active entrance session token
    SELECT session_token INTO v_session_token
    FROM public.store_entry_sessions
    WHERE user_id = v_customer_id
      AND store_id = p_store_id
      AND is_active = true
      AND expires_at > now()
    ORDER BY verified_at DESC
    LIMIT 1;

    -- 3. Idempotency Key Parameter Check
    IF p_idempotency_key IS NULL OR trim(p_idempotency_key) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Missing or empty idempotency key.');
    END IF;

    -- 4. Payment Method Validation
    IF p_payment_method NOT IN ('upi', 'card', 'wallet', 'cash') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid payment method: ' || COALESCE(p_payment_method, 'NULL'));
    END IF;

    -- 5. Validate Cart Payload Structure & Check for Duplicates
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cart is empty. Please add items to checkout.');
    END IF;

    -- Extract product IDs and validate positive integer quantities
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x("productId" INT, "quantity" INT)
    LOOP
        IF v_item."productId" IS NULL OR v_item."productId" <= 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Malformed cart item: invalid productId.');
        END IF;

        IF v_item."quantity" IS NULL OR v_item."quantity" <= 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Invalid quantity for product ' || v_item."productId" || '. Must be at least 1.');
        END IF;

        -- Prevent duplicate product IDs in the cart array
        IF v_requested_quantities ? (v_item."productId"::TEXT) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Duplicate product ID in cart: ' || v_item."productId");
        END IF;

        v_requested_quantities := v_requested_quantities || jsonb_build_object(v_item."productId"::TEXT, v_item."quantity");
        v_prod_ids := array_append(v_prod_ids, v_item."productId");
        v_total_items := v_total_items + v_item."quantity";
        v_unique_count := v_unique_count + 1;
    END LOOP;

    -- 6. Compute Deterministic Normalized Cart Payload Hash
    -- Canonical representation: product IDs strictly ascending, irrespective of input JSON array order.
    -- Discards any client-supplied prices, totals, names, or extra attributes.
    SELECT string_agg(id::TEXT || ':' || (v_requested_quantities->>id::TEXT), ',' ORDER BY id ASC)
    INTO v_normalized_cart
    FROM unnest(v_prod_ids) AS id;

    v_payload_hash := md5(
        p_store_id || '|' ||
        p_payment_method || '|' ||
        COALESCE(upper(trim(p_coupon_code)), '') || '|' ||
        COALESCE(v_normalized_cart, '')
    );

    -- 7. Idempotency Validation (Prevent duplicate submissions, double decrements, and payload drift)
    SELECT id, receipt_id, store_id, customer_id, final_total, payment_status, payment_method, payload_hash, created_at
    INTO v_existing_order
    FROM public.orders
    WHERE idempotency_key = trim(p_idempotency_key);

    IF FOUND THEN
        -- Security: Verify that the existing order belongs to the authenticated customer
        IF v_existing_order.customer_id <> v_customer_id THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Unauthorized: Idempotency key belongs to another customer or session.'
            );
        END IF;

        -- Security: Verify identical checkout payload (store, payment method, coupon, and cart contents)
        IF v_existing_order.payload_hash IS NOT NULL AND v_existing_order.payload_hash <> v_payload_hash THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Idempotency conflict: Existing order was created with different cart contents, store, or payment method.'
            );
        END IF;

        -- Fallback check for older records without payload_hash
        IF v_existing_order.store_id <> p_store_id OR v_existing_order.payment_method <> p_payment_method THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Idempotency conflict: Existing order was created with different store or payment method.'
            );
        END IF;

        -- Authorized retry returns original order safely without decrements or re-creation
        RETURN jsonb_build_object(
            'success', true,
            'orderId', v_existing_order.id,
            'receiptId', v_existing_order.receipt_id,
            'storeId', v_existing_order.store_id,
            'finalTotal', v_existing_order.final_total,
            'paymentStatus', v_existing_order.payment_status,
            'paymentMethod', v_existing_order.payment_method,
            'isDuplicate', true,
            'message', 'Order already created for this checkout request.'
        );
    END IF;

    -- 8. Verify All Products Belong to Store Inventory
    IF (
        SELECT count(*)
        FROM public.store_inventory si
        WHERE si.store_id = p_store_id
          AND si.product_id = ANY(v_prod_ids)
    ) <> v_unique_count THEN
        RETURN jsonb_build_object('success', false, 'error', 'One or more items do not belong to this store inventory.');
    END IF;

    -- 9. Acquire Row Locks in Ascending Product ID Order & Validate Stock (NO DML)
    -- Ascending lock order prevents deadlocks across concurrent checkouts.
    -- Validated items are accumulated in in-memory JSONB (no temporary tables).
    FOR v_item IN 
        SELECT 
            si.product_id,
            si.price,
            si.mrp,
            si.stock_quantity,
            si.is_available,
            p.name AS product_name,
            p.barcode,
            p.category,
            p.unit_size
        FROM public.store_inventory si
        JOIN public.products p ON p.id = si.product_id
        WHERE si.store_id = p_store_id
          AND si.product_id = ANY(v_prod_ids)
        ORDER BY si.product_id ASC
        FOR UPDATE OF si
    LOOP
        DECLARE
            v_qty INT := (v_requested_quantities->>(v_item.product_id::TEXT))::INT;
            v_line_total NUMERIC(10,2);
            v_line_mrp NUMERIC(10,2);
        BEGIN
            -- Availability check
            IF NOT v_item.is_available THEN
                RETURN jsonb_build_object('success', false, 'error', 'Product "' || v_item.product_name || '" is currently unavailable.');
            END IF;

            -- Stock sufficiency check (Prevent overselling)
            IF v_item.stock_quantity < v_qty THEN
                RETURN jsonb_build_object(
                    'success', false, 
                    'error', 'Insufficient stock for "' || v_item.product_name || '". Available: ' || v_item.stock_quantity || ', requested: ' || v_qty
                );
            END IF;

            -- Compute line financials authoritatively
            v_line_total := round(v_item.price * v_qty, 2);
            v_line_mrp := round(v_item.mrp * v_qty, 2);
            v_subtotal := v_subtotal + v_line_total;
            v_total_mrp := v_total_mrp + v_line_mrp;

            -- Record validated line item in in-memory JSONB array (zero DDL / zero temp table)
            v_validated_items := v_validated_items || jsonb_build_array(
                jsonb_build_object(
                    'productId', v_item.product_id,
                    'productName', v_item.product_name,
                    'barcode', v_item.barcode,
                    'category', v_item.category,
                    'unitSize', v_item.unit_size,
                    'unitPrice', v_item.price,
                    'unitMrp', v_item.mrp,
                    'quantity', v_qty,
                    'totalPrice', v_line_total
                )
            );
        END;
    END LOOP;

    -- 10. MRP Savings Calculation
    v_mrp_savings := GREATEST(0.00, v_total_mrp - v_subtotal);

    -- 11. Authoritative Coupon Validation
    -- Evaluated BEFORE any inventory or order writes occur.
    IF p_coupon_code IS NOT NULL AND trim(p_coupon_code) <> '' THEN
        v_coupon_code := upper(trim(p_coupon_code));
        
        IF v_coupon_code = 'SAVE10' THEN
            v_coupon_discount := round(v_subtotal * 0.10, 2);
        ELSIF v_coupon_code = 'QLIVE50' THEN
            IF v_subtotal < 500.00 THEN
                RETURN jsonb_build_object(
                    'success', false, 
                    'error', 'Coupon QLIVE50 requires a minimum subtotal of ₹500.00. Current: ₹' || v_subtotal
                );
            END IF;
            v_coupon_discount := 50.00;
        ELSE
            -- Reject unsupported or client-fabricated coupon codes
            RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired coupon code: ' || v_coupon_code);
        END IF;

        -- Cap discount to subtotal
        v_coupon_discount := LEAST(v_coupon_discount, v_subtotal);
    END IF;

    -- 12. Tax Calculation (5% Grocery GST: 2.5% CGST + 2.5% SGST exclusive)
    v_taxable_amount := GREATEST(0.00, v_subtotal - v_coupon_discount);
    v_cgst := round(v_taxable_amount * 0.025, 2);
    v_sgst := round(v_taxable_amount * 0.025, 2);
    v_tax_total := round(v_cgst + v_sgst, 2);
    v_final_total := round(v_taxable_amount + v_tax_total, 2);

    -- ========================================================================
    -- PASS 2: ATOMIC MUTATIONS (ORDERS, ORDER_ITEMS, INVENTORY DECREMENT)
    -- Reached strictly after ALL validations and calculations have succeeded.
    -- Any unexpected failure raises an exception, guaranteeing complete rollback.
    -- ========================================================================

    -- 13. Generate Trusted Server Identifiers
    v_order_id := 'QL-' || to_char(now(), 'YYYY') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));
    v_receipt_id := 'REC-' || to_char(now(), 'YYMM') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    v_payment_ref := CASE 
        WHEN p_payment_method = 'cash' THEN 'COUNTER-CASH-' || substr(md5(clock_timestamp()::text), 1, 6)
        WHEN p_payment_method = 'upi' THEN 'UPI-PENDING-' || substr(md5(clock_timestamp()::text), 1, 6)
        WHEN p_payment_method = 'card' THEN 'CARD-PENDING-' || substr(md5(clock_timestamp()::text), 1, 6)
        ELSE 'WALLET-PENDING-' || substr(md5(clock_timestamp()::text), 1, 6)
    END;

    -- 14. Insert Authoritative Order Record (Strictly PENDING)
    INSERT INTO public.orders (
        id,
        store_id,
        customer_id,
        session_id,
        receipt_id,
        subtotal,
        mrp_savings,
        coupon_code,
        coupon_discount,
        taxable_amount,
        cgst,
        sgst,
        tax_total,
        final_total,
        payment_method,
        payment_status,
        payment_reference,
        idempotency_key,
        payload_hash,
        paid_at,
        created_at
    ) VALUES (
        v_order_id,
        p_store_id,
        v_customer_id,
        COALESCE(v_session_token, 'SES-OFFICIAL'),
        v_receipt_id,
        v_subtotal,
        v_mrp_savings,
        v_coupon_code,
        v_coupon_discount,
        v_taxable_amount,
        v_cgst,
        v_sgst,
        v_tax_total,
        v_final_total,
        p_payment_method,
        'PENDING',                      -- Strictly PENDING awaiting trusted payment settlement
        v_payment_ref,
        trim(p_idempotency_key),
        v_payload_hash,
        now(),
        now()
    );

    -- 15. Insert Immutable Order Line Items directly from in-memory JSONB array
    INSERT INTO public.order_items (
        order_id,
        product_id,
        product_name,
        barcode,
        unit_price,
        quantity,
        total_price,
        category,
        unit_size
    )
    SELECT 
        v_order_id,
        (elem->>'productId')::INT,
        elem->>'productName',
        elem->>'barcode',
        (elem->>'unitPrice')::NUMERIC(10,2),
        (elem->>'quantity')::INT,
        (elem->>'totalPrice')::NUMERIC(10,2),
        elem->>'category',
        elem->>'unitSize'
    FROM jsonb_array_elements(v_validated_items) AS elem;

    -- 16. Atomically Decrement Inventory
    FOR v_elem IN SELECT * FROM jsonb_array_elements(v_validated_items)
    LOOP
        UPDATE public.store_inventory
        SET stock_quantity = stock_quantity - (v_elem->>'quantity')::INT,
            updated_at = now()
        WHERE store_id = p_store_id
          AND product_id = (v_elem->>'productId')::INT;
    END LOOP;

    -- Return trusted order summary to the client
    RETURN jsonb_build_object(
        'success', true,
        'orderId', v_order_id,
        'receiptId', v_receipt_id,
        'storeId', p_store_id,
        'itemCount', v_total_items,
        'subtotal', v_subtotal,
        'mrpSavings', v_mrp_savings,
        'couponCode', v_coupon_code,
        'couponDiscount', v_coupon_discount,
        'taxableAmount', v_taxable_amount,
        'cgst', v_cgst,
        'sgst', v_sgst,
        'taxTotal', v_tax_total,
        'finalTotal', v_final_total,
        'paymentMethod', p_payment_method,
        'paymentStatus', 'PENDING'
    );

EXCEPTION
    WHEN unique_violation THEN
        -- Handle concurrent duplicate submission with identical idempotency key
        SELECT id, receipt_id, store_id, customer_id, final_total, payment_status, payment_method, payload_hash, created_at
        INTO v_existing_order
        FROM public.orders
        WHERE idempotency_key = trim(p_idempotency_key);

        IF FOUND AND v_existing_order.customer_id = v_customer_id THEN
            IF v_existing_order.payload_hash IS NOT NULL AND v_existing_order.payload_hash <> v_payload_hash THEN
                RAISE EXCEPTION 'Idempotency conflict: Concurrent order creation attempted with conflicting cart payload.';
            END IF;

            RETURN jsonb_build_object(
                'success', true,
                'orderId', v_existing_order.id,
                'receiptId', v_existing_order.receipt_id,
                'storeId', v_existing_order.store_id,
                'finalTotal', v_existing_order.final_total,
                'paymentStatus', v_existing_order.payment_status,
                'paymentMethod', v_existing_order.payment_method,
                'isDuplicate', true,
                'message', 'Order was concurrently created for this checkout request.'
            );
        ELSE
            RAISE EXCEPTION 'Checkout transaction aborted: idempotency collision or unauthorized key access.';
        END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. TRUSTED DIGITAL PAYMENT CONFIRMATION RPC (WEBHOOK / GATEWAY)
-- Invoked strictly by backend payment gateway webhooks (e.g. Razorpay/Stripe Edge Functions)
-- Transitions an order from PENDING to CONFIRMED, safely issuing the turnstile exit pass.
-- 
-- TRUSTED BACKEND SECURITY CONTRACT:
-- The caller (payment webhook handler) MUST perform the following checks before invoking this RPC:
-- 1. Cryptographically verify webhook signature (e.g., HMAC-SHA256 with webhook secret).
-- 2. Verify that event is a payment completion event (e.g., payment.captured).
-- 3. Verify that the payment amount matches the authoritative order final_total (amount_paid == final_total * 100).
-- 4. Verify currency is INR.
-- 5. Prevent replay: this RPC is idempotent; if order is already CONFIRMED it safely returns success.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_digital_order_payment(
    p_order_id TEXT,
    p_gateway_reference TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
BEGIN
    IF p_order_id IS NULL OR trim(p_order_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Missing order ID.');
    END IF;

    IF p_gateway_reference IS NULL OR trim(p_gateway_reference) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Missing payment gateway reference.');
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found: ' || p_order_id);
    END IF;

    IF v_order.payment_method = 'cash' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cash orders must be confirmed via cashier counter settlement.');
    END IF;

    IF v_order.payment_status = 'CONFIRMED' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Order was already confirmed.', 'orderId', p_order_id);
    END IF;

    -- Update order to CONFIRMED with verified gateway reference
    -- This update triggers on_order_created_generate_exit_pass, issuing the turnstile exit pass
    UPDATE public.orders
    SET payment_status = 'CONFIRMED',
        payment_reference = trim(p_gateway_reference),
        paid_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'orderId', p_order_id,
        'status', 'CONFIRMED',
        'confirmedAt', now()
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. FUNCTION PERMISSIONS
-- ----------------------------------------------------------------------------
-- process_self_checkout_order: Authenticated shoppers can checkout
REVOKE EXECUTE ON FUNCTION public.process_self_checkout_order(TEXT, JSONB, TEXT, TEXT, TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_self_checkout_order(TEXT, JSONB, TEXT, TEXT, TEXT) TO authenticated;

-- confirm_digital_order_payment: Strictly server-side/service_role (payment webhooks)
REVOKE EXECUTE ON FUNCTION public.confirm_digital_order_payment(TEXT, TEXT) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_digital_order_payment(TEXT, TEXT) TO service_role;
