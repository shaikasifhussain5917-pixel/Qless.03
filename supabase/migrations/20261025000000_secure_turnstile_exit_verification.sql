-- ============================================================================
-- QLess Smart Shopping - Phase 12: Secure Turnstile Exit Pass Verification
-- Function: public.verify_turnstile_exit_pass(p_order_id TEXT, p_terminal_id TEXT)
-- 
-- Hardens server-side gate exit verification:
-- 1. Authenticates caller and verifies SECURITY_GUARD or STORE_ADMIN staff role.
-- 2. Concurrency-safe: Locks order and exit pass rows using FOR UPDATE to prevent race conditions.
-- 3. Verifies authoritative order record: payment_status must be 'CONFIRMED'.
-- 4. Enforces cross-store isolation: guard and order must belong to same store.
-- 5. Detects and prevents duplicate redemption (re-scan of already verified pass).
-- 6. Checks exit pass timestamp expiration.
-- 7. Atomically marks pass as VERIFIED with guard ID and verification timestamp.
-- 8. Records immutable audit record into public.security_logs with receipt_id.
-- ============================================================================

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
    -- 1. Authenticate caller
    v_guard_id := auth.uid();
    IF v_guard_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to verify turnstile exit passes.';
    END IF;

    -- 2. Verify caller holds authorized SECURITY_GUARD or STORE_ADMIN role
    SELECT store_id INTO v_guard_store_id
    FROM public.store_staff
    WHERE user_id = v_guard_id
      AND role IN ('SECURITY_GUARD', 'STORE_ADMIN');

    IF v_guard_store_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Caller is not an authorized security guard or store admin.';
    END IF;

    -- 3. Concurrency-safe retrieval of authoritative order record
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        -- Log failure with unknown order
        INSERT INTO public.security_logs (
            store_id, order_id, guard_id, terminal_id, outcome, failure_reason, scanned_payload
        ) VALUES (
            v_guard_store_id, p_order_id, v_guard_id, p_terminal_id, 'failure', 'UNKNOWN_ORDER', p_order_id
        );

        RETURN jsonb_build_object(
            'success', false,
            'outcome', 'failure',
            'reason', 'UNKNOWN_ORDER',
            'message', 'Order reference not found in supermarket database.'
        );
    END IF;

    -- 4. Cross-store boundary check: Guard cannot clear orders from another store location
    IF v_order.store_id <> v_guard_store_id THEN
        INSERT INTO public.security_logs (
            store_id, order_id, receipt_id, guard_id, terminal_id, outcome, failure_reason, scanned_payload
        ) VALUES (
            v_guard_store_id, p_order_id, v_order.receipt_id, v_guard_id, p_terminal_id, 'failure', 'STORE_MISMATCH', p_order_id
        );

        RETURN jsonb_build_object(
            'success', false,
            'outcome', 'failure',
            'reason', 'STORE_MISMATCH',
            'message', 'Exit pass belongs to another supermarket store branch.'
        );
    END IF;

    -- 5. Authoritative payment confirmation check
    IF v_order.payment_status <> 'CONFIRMED' THEN
        INSERT INTO public.security_logs (
            store_id, order_id, receipt_id, guard_id, terminal_id, outcome, failure_reason, scanned_payload
        ) VALUES (
            v_guard_store_id, p_order_id, v_order.receipt_id, v_guard_id, p_terminal_id, 'failure', 'STATUS_INVALID', p_order_id
        );

        RETURN jsonb_build_object(
            'success', false,
            'outcome', 'failure',
            'reason', 'STATUS_INVALID',
            'message', 'Order payment is ' || v_order.payment_status || '. Customer exit is not authorized. Please direct customer to cashier.'
        );
    END IF;

    -- 6. Concurrency-safe retrieval of exit pass
    SELECT * INTO v_pass
    FROM public.exit_passes
    WHERE order_id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.security_logs (
            store_id, order_id, receipt_id, guard_id, terminal_id, outcome, failure_reason, scanned_payload
        ) VALUES (
            v_guard_store_id, p_order_id, v_order.receipt_id, v_guard_id, p_terminal_id, 'failure', 'UNKNOWN_ORDER', p_order_id
        );

        RETURN jsonb_build_object(
            'success', false,
            'outcome', 'failure',
            'reason', 'UNKNOWN_ORDER',
            'message', 'No exit pass issued for this order.'
        );
    END IF;

    -- 7. Duplicate scan detection (exit pass already consumed)
    IF v_pass.status = 'VERIFIED' THEN
        INSERT INTO public.security_logs (
            store_id, order_id, receipt_id, guard_id, terminal_id, outcome, failure_reason, scanned_payload
        ) VALUES (
            v_guard_store_id, p_order_id, v_order.receipt_id, v_guard_id, p_terminal_id, 'duplicate_warning', 'DUPLICATE_EXIT_SCAN', p_order_id
        );

        RETURN jsonb_build_object(
            'success', false,
            'outcome', 'duplicate_warning',
            'reason', 'DUPLICATE_EXIT_SCAN',
            'message', 'EXIT PASS ALREADY USED. Turnstile pass has already been used for gate exit at ' || to_char(v_pass.verified_at, 'HH12:MI AM'),
            'firstVerifiedAt', v_pass.verified_at
        );
    END IF;

    -- 8. Pass expiration check
    IF v_pass.expires_at < now() OR v_pass.status = 'EXPIRED' THEN
        INSERT INTO public.security_logs (
            store_id, order_id, receipt_id, guard_id, terminal_id, outcome, failure_reason, scanned_payload
        ) VALUES (
            v_guard_store_id, p_order_id, v_order.receipt_id, v_guard_id, p_terminal_id, 'failure', 'EXPIRED_PASS', p_order_id
        );

        RETURN jsonb_build_object(
            'success', false,
            'outcome', 'failure',
            'reason', 'EXPIRED_PASS',
            'message', 'Turnstile gate pass has expired.'
        );
    END IF;

    -- 9. Atomically mark pass as VERIFIED
    UPDATE public.exit_passes
    SET status = 'VERIFIED',
        verified_at = now(),
        verified_by = v_guard_id
    WHERE order_id = p_order_id;

    -- 10. Record immutable successful clearance in audit log
    INSERT INTO public.security_logs (
        store_id, order_id, receipt_id, guard_id, terminal_id, outcome, scanned_payload
    ) VALUES (
        v_guard_store_id, p_order_id, v_order.receipt_id, v_guard_id, p_terminal_id, 'success', p_order_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'outcome', 'success',
        'message', 'Turnstile gate clearance approved. Customer may exit.',
        'verifiedAt', now()
    );
END;
$$;

-- Security permissions: Revoke anonymous execution, grant to authenticated staff
REVOKE EXECUTE ON FUNCTION public.verify_turnstile_exit_pass(TEXT, TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_turnstile_exit_pass(TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. CONFIRM GUARD ITEM INSPECTION RPC
-- Authoritatively records physical cart item inspections performed by a guard.
-- Enforces authentication, SECURITY_GUARD role, store assignment, and segregation
-- of duties (staff cannot inspect their own orders).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_guard_item_inspection(
    p_order_id TEXT,
    p_terminal_id TEXT,
    p_items_checked INT,
    p_has_discrepancy BOOLEAN DEFAULT false,
    p_discrepancy_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_guard_id UUID;
    v_guard_store_id TEXT;
    v_order RECORD;
BEGIN
    -- 1. Authenticate caller
    v_guard_id := auth.uid();
    IF v_guard_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to confirm item inspections.';
    END IF;

    -- 2. Verify caller holds authorized SECURITY_GUARD or STORE_ADMIN role
    SELECT store_id INTO v_guard_store_id
    FROM public.store_staff
    WHERE user_id = v_guard_id
      AND role IN ('SECURITY_GUARD', 'STORE_ADMIN');

    IF v_guard_store_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Caller is not an authorized security guard or store admin.';
    END IF;

    -- 3. Fetch order
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Order reference not found in supermarket database.'
        );
    END IF;

    -- 4. Cross-store boundary check
    IF v_order.store_id <> v_guard_store_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Order belongs to another supermarket store branch.'
        );
    END IF;

    -- 5. Segregation of duties: Guard cannot confirm inspection for their own personal orders
    IF v_order.customer_id = v_guard_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Segregation of duties: Staff members cannot confirm item inspections for their own personal orders.'
        );
    END IF;

    -- 6. Insert inspection audit log
    INSERT INTO public.security_logs (
        store_id,
        order_id,
        receipt_id,
        guard_id,
        terminal_id,
        outcome,
        scanned_payload,
        has_discrepancy,
        discrepancy_note
    ) VALUES (
        v_guard_store_id,
        p_order_id,
        v_order.receipt_id,
        v_guard_id,
        p_terminal_id,
        CASE WHEN p_has_discrepancy THEN 'failure' ELSE 'success' END,
        'PHYSICAL_INSPECTION_CONFIRMED: ' || p_items_checked::TEXT || ' items checked',
        p_has_discrepancy,
        p_discrepancy_note
    );

    RETURN jsonb_build_object(
        'success', true,
        'orderId', p_order_id,
        'receiptId', v_order.receipt_id,
        'itemsChecked', p_items_checked,
        'confirmedAt', now(),
        'guardId', v_guard_id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_guard_item_inspection(TEXT, TEXT, INT, BOOLEAN, TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_guard_item_inspection(TEXT, TEXT, INT, BOOLEAN, TEXT) TO authenticated;

