-- ============================================================================
-- QLess Smart Shopping - Production Security Hardening & Advisory Remediation
-- Purpose:
--   1. Protect stores.entrance_qr_secret from client-side SELECT exposure
--      and rotate hardcoded default secret.
--   2. Move Phase 8A backup tables out of public schema to dedicated backup schema
--      (resolves Supabase linter advisory: RLS enabled without policies).
--   3. Apply Principle of Least Privilege to all SECURITY DEFINER RPC functions
--      with immutable search_path (public, pg_temp) and strict EXECUTE grants.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ROTATE & SECURE STORES ENTRANCE_QR_SECRET
-- ----------------------------------------------------------------------------
-- Drop predictable hardcoded default
ALTER TABLE public.stores ALTER COLUMN entrance_qr_secret DROP DEFAULT;

-- Rotate STORE001 secret to cryptographically generated 256-bit random hex
UPDATE public.stores
SET entrance_qr_secret = encode(gen_random_bytes(32), 'hex'),
    updated_at = now()
WHERE id = 'STORE001';

-- Column-level privilege restriction:
-- Strictly revoke direct client selection of entrance_qr_secret from anon and authenticated.
-- Clients only need store metadata (name, code, timing, location).
REVOKE SELECT ON public.stores FROM PUBLIC, anon, authenticated;
GRANT SELECT (
    id,
    code,
    name,
    chain,
    branch,
    address,
    timing,
    is_active,
    created_at,
    updated_at
) ON public.stores TO anon, authenticated;

-- Ensure service_role retains full access
GRANT ALL ON public.stores TO service_role;

-- ----------------------------------------------------------------------------
-- 2. ISOLATE BACKUP TABLES TO PRIVATE SCHEMA
-- ----------------------------------------------------------------------------
-- Resolves Supabase linter advisory: "Table has RLS enabled but no policies in public schema".
-- Moving them to an isolated 'backup' schema prevents PostgREST API exposure while
-- preserving database recovery integrity.
CREATE SCHEMA IF NOT EXISTS backup;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products_backup_phase8a') THEN
        ALTER TABLE public.products_backup_phase8a SET SCHEMA backup;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'store_inventory_backup_phase8a') THEN
        ALTER TABLE public.store_inventory_backup_phase8a SET SCHEMA backup;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'product_locations_backup_phase8a') THEN
        ALTER TABLE public.product_locations_backup_phase8a SET SCHEMA backup;
    END IF;
END $$;

REVOKE ALL ON SCHEMA backup FROM PUBLIC, anon, authenticated;
GRANT ALL ON SCHEMA backup TO postgres, service_role;

-- ----------------------------------------------------------------------------
-- 3. HARDEN RPC FUNCTION EXECUTION PRIVILEGES & SEARCH PATH
-- ----------------------------------------------------------------------------
-- Ensure all SECURITY DEFINER functions have locked search_path = public, pg_temp
ALTER FUNCTION public.validate_store_entrance_qr(TEXT) SET search_path = public, pg_temp;
ALTER FUNCTION public.process_self_checkout_order(TEXT, JSONB, TEXT, TEXT, TEXT) SET search_path = public, pg_temp;
ALTER FUNCTION public.confirm_cash_order_payment(TEXT) SET search_path = public, pg_temp;
ALTER FUNCTION public.confirm_digital_order_payment(TEXT, TEXT) SET search_path = public, pg_temp;
ALTER FUNCTION public.verify_turnstile_exit_pass(TEXT, TEXT) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_store_staff(TEXT, TEXT[]) SET search_path = public, pg_temp;
ALTER FUNCTION public.has_active_store_session(TEXT) SET search_path = public, pg_temp;

-- Revoke default public execution
REVOKE EXECUTE ON FUNCTION public.validate_store_entrance_qr(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_store_entrance_qr(TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.process_self_checkout_order(TEXT, JSONB, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_self_checkout_order(TEXT, JSONB, TEXT, TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.confirm_cash_order_payment(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_cash_order_payment(TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.confirm_digital_order_payment(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_digital_order_payment(TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.verify_turnstile_exit_pass(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_turnstile_exit_pass(TEXT, TEXT) TO authenticated;
