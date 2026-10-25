-- ============================================================================
-- QLess Smart Shopping - Phase 4.2 Critical Payment Security Hardening
-- Hardening Target: Prevent client self-issuance of CONFIRMED orders & exit passes
-- Store: QLess Mart (STORE001 / QLM001)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. HARDEN ORDERS DEFAULT PAYMENT STATUS
-- Ensure orders default to PENDING (unpaid) rather than CONFIRMED
-- ----------------------------------------------------------------------------
ALTER TABLE public.orders 
    ALTER COLUMN payment_status SET DEFAULT 'PENDING';

-- ----------------------------------------------------------------------------
-- 2. HARDEN CUSTOMER ORDERS INSERT POLICY
-- Strictly enforce that customer direct inserts can ONLY create PENDING orders.
-- Customers cannot insert pre-confirmed orders to self-issue turnstile exit passes.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Customer insert own orders" ON public.orders;

CREATE POLICY "Customer insert own orders" ON public.orders
    FOR INSERT WITH CHECK (
        auth.uid() = customer_id
        AND public.has_active_store_session(store_id)
        AND payment_status = 'PENDING'
    );

-- ----------------------------------------------------------------------------
-- 3. STAFF ORDERS UPDATE POLICY
-- Only authorized store staff (CASHIER, STORE_ADMIN) can update store orders.
-- Customers have NO UPDATE permissions on public.orders.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff update assigned store orders" ON public.orders;

CREATE POLICY "Staff update assigned store orders" ON public.orders
    FOR UPDATE USING (
        public.is_store_staff(store_id, ARRAY['STORE_ADMIN', 'CASHIER'])
    )
    WITH CHECK (
        public.is_store_staff(store_id, ARRAY['STORE_ADMIN', 'CASHIER'])
    );

-- ----------------------------------------------------------------------------
-- 4. AUTHORIZED CASHIER CASH SETTLEMENT RPC
-- Allows authenticated cashiers to confirm physical cash payments at checkout bays.
-- Atomically transitions order to CONFIRMED, safely activating the exit pass trigger.
-- Untrusted customers cannot invoke this procedure without holding staff roles.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_cash_order_payment(
    p_order_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cashier_id UUID;
    v_cashier_store_id TEXT;
    v_order RECORD;
BEGIN
    v_cashier_id := auth.uid();
    IF v_cashier_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- Verify caller holds authoritative CASHIER or STORE_ADMIN role in store_staff
    SELECT store_id INTO v_cashier_store_id
    FROM public.store_staff
    WHERE user_id = v_cashier_id
      AND role IN ('CASHIER', 'STORE_ADMIN');

    IF v_cashier_store_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Caller is not an authorized cashier or store admin.';
    END IF;

    -- Fetch order
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found: ' || p_order_id);
    END IF;

    -- Cross-store validation
    IF v_order.store_id <> v_cashier_store_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order store mismatch: Cannot settle order for another supermarket.');
    END IF;

    -- Segregation of duties: Cashiers cannot confirm their own personal orders
    IF v_order.customer_id = v_cashier_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Segregation of duties: Cashiers cannot self-confirm their own personal orders.');
    END IF;

    -- Payment method validation
    IF v_order.payment_method <> 'cash' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only cash orders can be reconciled at cashier counter.');
    END IF;

    -- Already confirmed check (Idempotent replay)
    IF v_order.payment_status = 'CONFIRMED' THEN
        RETURN jsonb_build_object(
            'success', true,
            'message', 'Order cash payment was already confirmed.',
            'orderId', p_order_id
        );
    END IF;

    -- Transition order to CONFIRMED and stamp the confirming cashier into payment_reference
    -- This update causes on_order_created_generate_exit_pass to trigger, safely issuing the exit pass
    UPDATE public.orders
    SET payment_status = 'CONFIRMED',
        payment_reference = 'CASHIER:' || v_cashier_id::TEXT || ':' || COALESCE(payment_reference, 'COUNTER-CASH'),
        paid_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Cash settlement confirmed and turnstile exit pass generated.',
        'orderId', p_order_id,
        'confirmedAt', now(),
        'cashierId', v_cashier_id
    );
END;
$$;

-- Revoke anonymous access; permit authenticated staff invocation
REVOKE EXECUTE ON FUNCTION public.confirm_cash_order_payment(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_cash_order_payment(TEXT) TO authenticated;
