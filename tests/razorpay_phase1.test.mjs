import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

describe('QLess Razorpay Phase 1 Remediation Security Test Suite', () => {
  const migrationPath = path.resolve('supabase/migrations/20261020000000_razorpay_order_fields.sql');
  const edgeFunctionPath = path.resolve('supabase/functions/reconcile-expired-orders/index.ts');

  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  // --------------------------------------------------------------------------
  // FIX 1: Payment ID Uniqueness & Gateway Order Verification
  // --------------------------------------------------------------------------
  describe('FIX 1: Payment ID Uniqueness & Duplicate Protection', () => {
    it('1.1 razorpay_payment_id must have a partial UNIQUE index', () => {
      assert.match(
        migrationSql,
        /CREATE\s+UNIQUE\s+INDEX\s+idx_orders_razorpay_payment_id\s+ON\s+public\.orders\(razorpay_payment_id\)\s+WHERE\s+razorpay_payment_id\s+IS\s+NOT\s+NULL;/i,
        'idx_orders_razorpay_payment_id must be declared as a UNIQUE partial index'
      );
    });

    it('1.2 razorpay_order_id must have a partial UNIQUE index', () => {
      assert.match(
        migrationSql,
        /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_orders_razorpay_order_id\s+ON\s+public\.orders\(razorpay_order_id\)\s+WHERE\s+razorpay_order_id\s+IS\s+NOT\s+NULL;/i,
        'idx_orders_razorpay_order_id must be declared as a UNIQUE partial index'
      );
    });

    it('1.3 confirm_digital_order_payment rejects duplicate payment ID already recorded on another order', () => {
      assert.match(
        migrationSql,
        /SELECT\s+id\s+INTO\s+v_existing_payment_order_id\s+FROM\s+public\.orders\s+WHERE\s+razorpay_payment_id\s*=\s*v_clean_payment_id\s+AND\s+id\s*<>\s*v_clean_order_id/i,
        'confirm_digital_order_payment must verify that razorpay_payment_id is not already assigned to another order'
      );
    });

    it('1.4 confirm_digital_order_payment verifies razorpay_order_id match', () => {
      assert.match(
        migrationSql,
        /IF\s+v_order\.razorpay_order_id\s+IS\s+NOT\s+NULL\s+AND\s+v_order\.razorpay_order_id\s*<>\s*v_clean_rzp_order_id\s+THEN/i,
        'confirm_digital_order_payment must assert that gateway order ID matches the order record'
      );
    });
  });

  // --------------------------------------------------------------------------
  // FIX 2: Distinct Deterministic Audit Keys per Line Item
  // --------------------------------------------------------------------------
  describe('FIX 2: Restoration Audit Idempotency Keys', () => {
    it('2.1 cancel_and_restore_pending_order builds item-distinct idempotency keys', () => {
      assert.match(
        migrationSql,
        /v_item_idempotency_key\s*:=\s*CASE[\s\S]*?trim\(p_idempotency_key\)\s*\|\|\s*':'\s*\|\|\s*v_item\.product_id::text[\s\S]*?'RESTORE:'\s*\|\|\s*v_order\.id\s*\|\|\s*':'\s*\|\|\s*v_item\.product_id::text/i,
        'Every item in cancel_and_restore_pending_order must incorporate the product_id to prevent collision'
      );
    });

    it('2.2 Missing inventory rows are explicitly detected and throw clear error', () => {
      assert.match(
        migrationSql,
        /IF\s+v_prev_stock\s+IS\s+NULL\s+THEN\s+RAISE\s+EXCEPTION\s+'Inventory row missing for product ID % in store %'/i,
        'Missing inventory row must raise an exception rather than calculating NULL stock'
      );
    });
  });

  // --------------------------------------------------------------------------
  // FIX 3: Null-Safe Customer Ownership & Role Segregation
  // --------------------------------------------------------------------------
  describe('FIX 3: Null-Safe Authorization & Role Segregation', () => {
    it('3.1 Uses IS DISTINCT FROM and rejects null customer_id in cancellation', () => {
      assert.match(
        migrationSql,
        /IF\s+v_order\.customer_id\s+IS\s+NULL\s+OR\s+auth\.uid\(\)\s+IS\s+DISTINCT\s+FROM\s+v_order\.customer_id\s+THEN/i,
        'Customer check must use IS DISTINCT FROM and explicitly check customer_id IS NULL'
      );
    });

    it('3.2 CASHIER and SECURITY_GUARD cannot perform digital cancellation', () => {
      // is_store_staff is passed ARRAY['STORE_ADMIN'] strictly; cashiers/guards are excluded
      assert.match(
        migrationSql,
        /v_is_store_admin\s*:=\s*public\.is_store_staff\(v_order\.store_id,\s*ARRAY\['STORE_ADMIN'\]\);/i,
        'is_store_staff must only permit STORE_ADMIN role'
      );
    });

    it('3.3 attach_razorpay_order_id also enforces IS DISTINCT FROM null-safe ownership', () => {
      assert.match(
        migrationSql,
        /IF\s+NOT\s+v_is_service_role\s+AND\s+NOT\s+v_is_store_admin\s+THEN\s+IF\s+v_order\.customer_id\s+IS\s+NULL\s+OR\s+auth\.uid\(\)\s+IS\s+DISTINCT\s+FROM\s+v_order\.customer_id\s+THEN/i,
        'attach_razorpay_order_id must enforce null-safe caller check'
      );
    });
  });

  // --------------------------------------------------------------------------
  // FIX 4: Late Payments on Cancelled Orders & Refund State Machine
  // --------------------------------------------------------------------------
  describe('FIX 4: Late Payments & Refund State Machine', () => {
    it('4.1 Adds refund state machine columns to public.orders', () => {
      assert.match(migrationSql, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+refund_status\s+TEXT/i);
      assert.match(migrationSql, /CHECK\s*\(refund_status\s+IN\s*\('NONE',\s*'REFUND_REQUIRED',\s*'REFUND_PENDING',\s*'REFUNDED',\s*'REFUND_FAILED'\)\)/i);
      assert.match(migrationSql, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+refund_id\s+TEXT/i);
      assert.match(migrationSql, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+refund_amount\s+NUMERIC\(10,2\)/i);
    });

    it('4.2 confirm_digital_order_payment transitions cancelled orders to REFUND_REQUIRED', () => {
      assert.match(
        migrationSql,
        /IF\s+v_order\.payment_status\s*=\s*'CANCELLED'\s+OR\s+v_order\.stock_restored\s+IS\s+TRUE\s+THEN[\s\S]*?refund_status\s*=\s*CASE[\s\S]*?'REFUND_REQUIRED'[\s\S]*?'requiresRefund',\s*true/i,
        'Late payment confirmation on cancelled order must flag REFUND_REQUIRED and return requiresRefund: true'
      );
    });

    it('4.3 RPC record_order_refund_confirmation transitions state to REFUNDED', () => {
      assert.match(
        migrationSql,
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.record_order_refund_confirmation\(/i,
        'record_order_refund_confirmation RPC must exist'
      );
      assert.match(
        migrationSql,
        /SET\s+refund_status\s*=\s*'REFUNDED',\s*refund_id\s*=\s*v_clean_refund_id/i,
        'Must transition refund_status to REFUNDED and store refund_id'
      );
    });
  });

  // --------------------------------------------------------------------------
  // FIX 5: Scheduled Edge Function Design Verification
  // --------------------------------------------------------------------------
  describe('FIX 5: Safe Reconciliation Edge Function', () => {
    it('5.1 Edge function file exists', () => {
      assert.ok(fs.existsSync(edgeFunctionPath), 'Edge function file must exist locally');
    });

    it('5.2 Edge function queries Razorpay before restoring stock', () => {
      const edgeCode = fs.readFileSync(edgeFunctionPath, 'utf8');
      assert.match(edgeCode, /api\.razorpay\.com\/v1\/orders/i);
      assert.match(edgeCode, /captured/i);
      assert.match(edgeCode, /authorized/i);
    });

    it('5.3 Unknown or error states in Edge Function skip stock restoration', () => {
      const edgeCode = fs.readFileSync(edgeFunctionPath, 'utf8');
      assert.match(
        edgeCode,
        /Never\s+restore\s+stock\s+on\s+network\s+or\s+gateway\s+error/i,
        'Edge function must skip stock restoration on network or gateway errors'
      );
      assert.match(
        edgeCode,
        /results\.skippedInFlight\+\+/i,
        'In-flight or ambiguous states must be skipped'
      );
    });
  });

  // --------------------------------------------------------------------------
  // FIX 6: Atomic Order Confirmation & Zero-Trust
  // --------------------------------------------------------------------------
  describe('FIX 6: Atomic Confirmation & Security Permissions', () => {
    it('6.1 confirm_digital_order_payment is strictly granted to service_role', () => {
      assert.match(
        migrationSql,
        /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.confirm_digital_order_payment\([\s\S]*?FROM\s+PUBLIC,\s*anon,\s*authenticated;/i
      );
      assert.match(
        migrationSql,
        /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.confirm_digital_order_payment\([\s\S]*?TO\s+service_role;/i
      );
    });

    it('6.2 Cash orders are rejected from digital payment confirmation', () => {
      assert.match(
        migrationSql,
        /IF\s+v_order\.payment_method\s*=\s*'cash'\s+THEN\s+RETURN\s+jsonb_build_object\('success',\s*false,\s*'error',\s*'Cash orders must be confirmed via cashier counter settlement\.'\);/i
      );
    });
  });
});
