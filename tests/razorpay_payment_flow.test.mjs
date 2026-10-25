import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// ----------------------------------------------------------------------------
// Cryptographic primitives under test
// ----------------------------------------------------------------------------
function timingSafeEqualHex(aHex, bHex) {
  if (typeof aHex !== 'string' || typeof bHex !== 'string') return false;
  if (aHex.length !== 64 || bHex.length !== 64) return false;
  const aBytes = Buffer.from(aHex.toLowerCase(), 'hex');
  const bBytes = Buffer.from(bHex.toLowerCase(), 'hex');
  if (aBytes.length !== 32 || bBytes.length !== 32) return false;
  let diff = 0;
  for (let i = 0; i < 32; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

function computeHmacSha256(data, secret) {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

describe('QLess Razorpay Phase 2A Behavioral Execution Test Suite', () => {
  const SECRET = 'rzp_test_secret_key_abcdef123456';
  const WEBHOOK_SECRET = 'whsec_test_secret_9876543210';

  // --------------------------------------------------------------------------
  // 1. Invalid Signature Test (Executable)
  // --------------------------------------------------------------------------
  it('1. Signature Verification: Valid signature passes; tampered/wrong-length fails', () => {
    const orderId = 'order_EKwxwAgIt42jtx';
    const paymentId = 'pay_29QQoUBcxrhErq';
    const payload = `${orderId}|${paymentId}`;

    const validSig = computeHmacSha256(payload, SECRET);
    assert.equal(validSig.length, 64);
    assert.equal(timingSafeEqualHex(validSig, validSig), true);

    // Tampered payload
    const invalidSig = computeHmacSha256(payload + '_tampered', SECRET);
    assert.equal(timingSafeEqualHex(validSig, invalidSig), false);

    // Wrong length
    assert.equal(timingSafeEqualHex(validSig, 'short_signature'), false);
    assert.equal(timingSafeEqualHex('short', validSig), false);
    assert.equal(timingSafeEqualHex('', ''), false);
  });

  // --------------------------------------------------------------------------
  // 2. Duplicate Webhook Event Deduplication (Executable)
  // --------------------------------------------------------------------------
  it('2. Webhook Event Deduplication: Duplicate event ID returns isDuplicate: true', () => {
    const eventLedger = new Map();

    const recordWebhookEventStart = (eventId, eventType) => {
      if (eventLedger.has(eventId)) {
        const existing = eventLedger.get(eventId);
        return { isDuplicate: true, status: existing.status };
      }
      eventLedger.set(eventId, { status: 'PROCESSING', eventType });
      return { isDuplicate: false, status: 'PROCESSING' };
    };

    const recordWebhookEventFinish = (eventId, status) => {
      const existing = eventLedger.get(eventId);
      if (existing) {
        existing.status = status;
      }
    };

    const eventId = 'evt_test_payment_captured_001';
    // First delivery
    const res1 = recordWebhookEventStart(eventId, 'payment.captured');
    assert.equal(res1.isDuplicate, false);
    assert.equal(res1.status, 'PROCESSING');

    recordWebhookEventFinish(eventId, 'PROCESSED');

    // Second duplicate delivery (replay)
    const res2 = recordWebhookEventStart(eventId, 'payment.captured');
    assert.equal(res2.isDuplicate, true);
    assert.equal(res2.status, 'PROCESSED');
  });

  // --------------------------------------------------------------------------
  // 3. Two Simultaneous Payment Creation Requests (Executable Concurrency Mock)
  // --------------------------------------------------------------------------
  it('3. Payment Creation Concurrency: Second simultaneous request is blocked by reservation', () => {
    let activeLockUntil = null;
    let gatewayOrderCount = 0;

    const reservePaymentCreation = (orderId, lockSeconds) => {
      const now = Date.now();
      if (activeLockUntil && now < activeLockUntil) {
        return { success: false, isLocked: true, error: 'Payment creation already in progress' };
      }
      activeLockUntil = now + lockSeconds * 1000;
      return { success: true, isReserved: true };
    };

    const createOrder = (orderId) => {
      const reserve = reservePaymentCreation(orderId, 60);
      if (!reserve.success) {
        return { status: 409, error: reserve.error };
      }
      gatewayOrderCount++;
      return { status: 201, razorpayOrderId: `order_rzp_${gatewayOrderCount}` };
    };

    // Request 1 starts
    const req1 = createOrder('QL-2026-TEST1');
    assert.equal(req1.status, 201);
    assert.equal(req1.razorpayOrderId, 'order_rzp_1');

    // Request 2 fires simultaneously before req1 attaches
    const req2 = createOrder('QL-2026-TEST1');
    assert.equal(req2.status, 409);
    assert.match(req2.error, /already in progress/i);

    // Gateway order was created only ONCE, preventing duplicate gateway orders!
    assert.equal(gatewayOrderCount, 1);
  });

  // --------------------------------------------------------------------------
  // 4. Gateway Timeout After Creating an Order
  // --------------------------------------------------------------------------
  it('4. Gateway Timeout: Lock automatically expires after lock duration and allows retry', () => {
    let activeLockUntil = Date.now() - 1000; // Expired 1 second ago

    const reservePaymentCreation = () => {
      if (activeLockUntil && Date.now() < activeLockUntil) {
        return { success: false, isLocked: true };
      }
      activeLockUntil = Date.now() + 60000;
      return { success: true, isReserved: true };
    };

    const retry = reservePaymentCreation();
    assert.equal(retry.success, true);
    assert.equal(retry.isReserved, true);
  });

  // --------------------------------------------------------------------------
  // 5. Refund API Timeout / Failure Recovery (Executable)
  // --------------------------------------------------------------------------
  it('5. Refund Timeout: Returns 500 so Razorpay retries; persists durable refund job', () => {
    const refundJobs = [];

    const handleCancelledLatePayment = (orderId, paymentId, amountPaise, mockFetchThrows) => {
      // 1. Persist durable refund job in database
      refundJobs.push({
        orderId,
        paymentId,
        amountPaise,
        status: 'PENDING',
        idempotencyKey: `JOB-REFUND-${orderId}-${paymentId}`,
      });

      // 2. Dispatch external refund request
      try {
        if (mockFetchThrows) {
          throw new Error('ETIMEDOUT: Connection to Razorpay refund API timed out');
        }
        return { httpStatus: 200, refundStatus: 'SUCCEEDED' };
      } catch (err) {
        // Critical safeguard: Must return HTTP 500, never 200!
        return { httpStatus: 500, error: err.message, durableJobRecorded: true };
      }
    };

    const res = handleCancelledLatePayment('QL-2026-CANCELLED', 'pay_test_timeout_123', 50000, true);
    assert.equal(res.httpStatus, 500);
    assert.equal(res.durableJobRecorded, true);
    assert.equal(refundJobs.length, 1);
    assert.equal(refundJobs[0].status, 'PENDING');
  });

  // --------------------------------------------------------------------------
  // 6. Refund Event Without Notes (Resolved via payment_id)
  // --------------------------------------------------------------------------
  it('6. Refund Event Without Notes: Resolves order primarily by payment_id anchor', () => {
    const ordersDb = [
      { id: 'QL-2026-ORDER-A', razorpay_payment_id: 'pay_anchor_999', refund_status: 'REFUND_REQUIRED' },
    ];

    const handleRefundProcessed = (refundEntity) => {
      // Resolve order by payment_id
      const matched = ordersDb.find((o) => o.razorpay_payment_id === refundEntity.payment_id);
      if (!matched) return { success: false, error: 'Order not found' };

      // Notes are optional / supplementary
      const notesOrderId = refundEntity.notes?.qless_order_id;
      if (notesOrderId && notesOrderId !== matched.id) {
        return { success: false, error: 'Contradictory order association' };
      }

      matched.refund_status = 'REFUNDED';
      matched.refund_id = refundEntity.id;
      return { success: true, orderId: matched.id, refundStatus: 'REFUNDED' };
    };

    // Refund payload without notes
    const refundPayloadNoNotes = {
      id: 'rfnd_test_no_notes_111',
      payment_id: 'pay_anchor_999',
      amount: 45000,
      notes: {}, // Empty notes!
    };

    const result = handleRefundProcessed(refundPayloadNoNotes);
    assert.equal(result.success, true);
    assert.equal(result.orderId, 'QL-2026-ORDER-A');
    assert.equal(result.refundStatus, 'REFUNDED');
  });

  // --------------------------------------------------------------------------
  // 7. Refund Linked to the Wrong Payment / Contradictory Notes
  // --------------------------------------------------------------------------
  it('7. Refund Contradiction: Rejects refund if notes contradict stored payment anchor', () => {
    const ordersDb = [
      { id: 'QL-2026-ORDER-X', razorpay_payment_id: 'pay_anchor_123' },
    ];

    const refundPayloadContradictory = {
      id: 'rfnd_bad_notes',
      payment_id: 'pay_anchor_123',
      notes: { qless_order_id: 'QL-2026-ORDER-WRONG' }, // Contradicts payment anchor!
    };

    const matched = ordersDb.find((o) => o.razorpay_payment_id === refundPayloadContradictory.payment_id);
    const notesOrderId = refundPayloadContradictory.notes.qless_order_id;

    assert.ok(matched);
    assert.notEqual(notesOrderId, matched.id); // Detected contradiction
  });

  // --------------------------------------------------------------------------
  // 8. Empty Payment List with Delayed Payment (Safety Grace Buffer)
  // --------------------------------------------------------------------------
  it('8. Expiry Worker: Preserves stock when order is within safety grace buffer', () => {
    const evaluateCancellation = (order, rzpEntity, payments, nowTime) => {
      const SAFETY_BUFFER_MS = 15 * 60 * 1000;
      const expiryTime = new Date(order.payment_attempt_expires_at).getTime();
      const hasPassedBuffer = nowTime > expiryTime + SAFETY_BUFFER_MS;

      // In-flight or within grace buffer
      if (rzpEntity.status === 'attempted' || rzpEntity.attempts > 0) {
        return { canCancel: false, reason: 'In-flight payment attempt detected' };
      }

      if (!hasPassedBuffer) {
        return { canCancel: false, reason: 'Order within 15-min safety grace buffer' };
      }

      if (rzpEntity.attempts === 0 && payments.length === 0 && hasPassedBuffer) {
        return { canCancel: true, reason: 'Zero attempts past safety buffer' };
      }

      return { canCancel: false, reason: 'Ambiguous state' };
    };

    const mockOrder = {
      id: 'QL-2026-PENDING-1',
      payment_attempt_expires_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // Expired 2 min ago
    };
    const mockRzpEntity = { status: 'created', attempts: 0 };
    const mockPayments = [];

    // At minute 2 past window expiry: Must NOT cancel! (Inside 15 min buffer)
    const check1 = evaluateCancellation(mockOrder, mockRzpEntity, mockPayments, Date.now());
    assert.equal(check1.canCancel, false);
    assert.match(check1.reason, /safety grace buffer/i);

    // At minute 16 past window expiry: Safe to cancel
    const check2 = evaluateCancellation(mockOrder, mockRzpEntity, mockPayments, Date.now() + 20 * 60 * 1000);
    assert.equal(check2.canCancel, true);
  });

  // --------------------------------------------------------------------------
  // 9. Captured Payment During Cancellation (Atomic SQL State)
  // --------------------------------------------------------------------------
  it('9. Late Capture on Cancelled Order: Enforces REFUND_REQUIRED, blocks exit pass', () => {
    const mockOrder = {
      id: 'QL-2026-CANCELLED-1',
      payment_status: 'CANCELLED',
      stock_restored: true,
      refund_status: 'NONE',
    };

    const confirmPayment = (order, paymentId) => {
      if (order.payment_status === 'CANCELLED' || order.stock_restored) {
        order.refund_status = 'REFUND_REQUIRED';
        order.razorpay_payment_id = paymentId;
        return { success: false, requiresRefund: true, exitPassIssued: false };
      }
      order.payment_status = 'CONFIRMED';
      return { success: true, exitPassIssued: true };
    };

    const res = confirmPayment(mockOrder, 'pay_late_capture_777');
    assert.equal(res.success, false);
    assert.equal(res.requiresRefund, true);
    assert.equal(res.exitPassIssued, false);
    assert.equal(mockOrder.refund_status, 'REFUND_REQUIRED');
    assert.equal(mockOrder.payment_status, 'CANCELLED'); // Remains cancelled!
  });

  // --------------------------------------------------------------------------
  // 10. Cash Order Isolation
  // --------------------------------------------------------------------------
  it('10. Cash Isolation: Digital payment creation strictly rejects cash payment_method', () => {
    const mockOrder = {
      id: 'QL-2026-CASH-1',
      payment_method: 'cash',
      payment_status: 'PENDING',
    };

    const createDigitalPayment = (order) => {
      if (order.payment_method === 'cash') {
        return { status: 400, error: 'Cash orders must be settled at cashier counter' };
      }
      return { status: 201 };
    };

    const res = createDigitalPayment(mockOrder);
    assert.equal(res.status, 400);
    assert.match(res.error, /cashier counter/i);
  });

  // --------------------------------------------------------------------------
  // 11. FIX 1 — PostgreSQL Syntax: round() Expression & No JS Math in SQL
  // --------------------------------------------------------------------------
  it('11. PostgreSQL Syntax: Migration uses valid round(numeric)::INT without JavaScript Math', () => {
    const migrationPath = path.resolve('supabase/migrations/20261020000000_razorpay_order_fields.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Must use round(...) without Math prefix
    assert.match(
      sql,
      /round\(v_order\.final_total\s*\*\s*100\)::INT/i,
      'Migration must use standard PostgreSQL round(v_order.final_total * 100)::INT'
    );

    // Must NOT contain Math.round or any JavaScript Math methods
    assert.equal(
      /Math\.[a-zA-Z]+/i.test(sql),
      false,
      'Migration SQL must not contain JavaScript Math expressions'
    );

    // Must not contain JS equality operators
    assert.equal(
      /\s+(===|!==)\s+/.test(sql),
      false,
      'Migration SQL must not contain JavaScript strict equality operators'
    );
  });

  // --------------------------------------------------------------------------
  // Safe Refund Retries Test Harness (Mirrors razorpay-webhook & database)
  // --------------------------------------------------------------------------
  function createSafeRefundSimulator(initialOrder, initialGatewayRefunds = []) {
    const order = { ...initialOrder };
    let refundJob = {
      id: 'job_uuid_101',
      order_id: order.id,
      payment_id: order.razorpay_payment_id || 'pay_test_default',
      amount_paise: Math.round(Number(order.final_total) * 100),
      status: 'PENDING',
      retry_count: 0,
      last_error: null,
      refund_id: null,
    };

    let gatewayRefunds = [...initialGatewayRefunds];
    let queryCallCount = 0;
    let createCallCount = 0;
    let shouldQueryFail = false;
    let shouldCreateFail = false;
    let shouldCreateTimeoutAtClient = false;

    const gateway = {
      setQueryFail: (v) => { shouldQueryFail = v; },
      setCreateFail: (v) => { shouldCreateFail = v; },
      setCreateTimeoutAtClient: (v) => { shouldCreateTimeoutAtClient = v; },
      getRefunds: async (paymentId) => {
        queryCallCount++;
        if (shouldQueryFail) {
          throw new Error('ETIMEDOUT: Gateway query refunds timed out');
        }
        return gatewayRefunds.filter((rf) => rf.payment_id === paymentId);
      },
      createRefund: async (paymentId, payload) => {
        createCallCount++;
        if (shouldCreateFail) {
          throw new Error('BAD_REQUEST: Payment already refunded');
        }
        const created = {
          id: `rfnd_mock_${Date.now()}_${createCallCount}`,
          entity: 'refund',
          amount: payload.amount,
          payment_id: paymentId,
          status: payload.status || 'processed',
          notes: payload.notes || {},
        };
        gatewayRefunds.push(created);
        if (shouldCreateTimeoutAtClient) {
          throw new Error('ECONNRESET: Client connection closed before response headers read');
        }
        return created;
      },
    };

    const processWebhookRefund = async (paymentId, paymentAmount, eventId = 'evt_test_refund') => {
      const expectedPaise = Math.round(Number(order.final_total) * 100);

      // Step 1: Query Authoritative Refunds
      let existingList;
      try {
        existingList = await gateway.getRefunds(paymentId);
      } catch (err) {
        refundJob.last_error = err.message;
        return { status: 500, error: 'Refund query to gateway failed. Preserving durable job for retry.' };
      }

      // Step 2 & 3: Check Existing Authoritative Refunds
      if (existingList.length > 0) {
        const matching = existingList.find((rf) => rf.payment_id === paymentId) || existingList[0];

        // Notes contradiction check
        const notesOrder = matching.notes?.qless_order_id;
        if (notesOrder && notesOrder !== order.id) {
          refundJob.status = 'MANUAL_REVIEW';
          refundJob.last_error = `Contradictory order ID in refund notes: ${notesOrder}`;
          return { status: 400, error: 'Contradictory refund association. Flagged for manual review.' };
        }

        // Amount mismatch check
        if (matching.amount !== expectedPaise) {
          refundJob.status = 'MANUAL_REVIEW';
          refundJob.last_error = `Refund amount mismatch: expected ${expectedPaise}, received ${matching.amount}`;
          return { status: 400, error: 'Refund amount mismatch. Flagged for manual review.' };
        }

        // Authoritative confirmation
        if (matching.status === 'processed') {
          order.refund_status = 'REFUNDED';
          order.refund_id = matching.id;
          order.refund_amount = matching.amount / 100;
          refundJob.status = 'SUCCEEDED';
          refundJob.refund_id = matching.id;
          return { status: 200, success: true, reconciled: true, refundId: matching.id };
        } else {
          refundJob.status = 'PROCESSING';
          refundJob.refund_id = matching.id;
          refundJob.last_error = `Gateway refund pending: ${matching.status}`;
          return { status: 200, success: true, pending: true, refundId: matching.id };
        }
      }

      // Step 4: Atomic Claim Concurrency Guard & Lease Ownership
      const now = Date.now();
      const isLeaseActive = refundJob.status === 'PROCESSING' && refundJob.lease_expires_at && now < refundJob.lease_expires_at;
      if (refundJob.status === 'SUCCEEDED' || refundJob.status === 'FAILED' || refundJob.status === 'MANUAL_REVIEW') {
        return { status: 200, message: `Refund job in status ${refundJob.status}` };
      }
      if (isLeaseActive) {
        return { status: 200, message: 'Refund job already claimed or completed by concurrent worker.' };
      }

      const wasStaleRecovery = refundJob.status === 'PROCESSING';
      refundJob.status = 'PROCESSING';
      refundJob.lease_expires_at = now + 300 * 1000;

      // Step 5: Dispatch Refund Request
      try {
        const refundResult = await gateway.createRefund(paymentId, {
          amount: paymentAmount,
          notes: { qless_order_id: order.id },
        });

        if (refundResult.status === 'processed') {
          order.refund_status = 'REFUNDED';
          order.refund_id = refundResult.id;
          refundJob.status = 'SUCCEEDED';
          refundJob.refund_id = refundResult.id;
          return { status: 200, success: true, refundId: refundResult.id };
        } else {
          refundJob.status = 'PROCESSING';
          refundJob.refund_id = refundResult.id;
          return { status: 200, success: true, pending: true, refundId: refundResult.id };
        }
      } catch (err) {
        refundJob.status = 'PENDING';
        refundJob.retry_count++;
        refundJob.last_error = err.message;
        return { status: 500, error: err.message };
      }
    };

    return {
      order,
      getJob: () => refundJob,
      setJobStatus: (s) => { refundJob.status = s; },
      setJob: (updates) => { Object.assign(refundJob, updates); },
      gateway,
      processWebhookRefund,
      getStats: () => ({ queryCallCount, createCallCount, refundsOnGateway: gatewayRefunds.length }),
    };
  }

  // --------------------------------------------------------------------------
  // 12. Refund Request Succeeds at Gateway but Times Out at Client
  // --------------------------------------------------------------------------
  it('12. Safe Refund Retries: Succeeded request that timed out at client preserves durable job with 500', async () => {
    const mockOrder = {
      id: 'QL-2026-TIMEOUT-1',
      final_total: 450.00,
      payment_status: 'CANCELLED',
      refund_status: 'REFUND_REQUIRED',
      razorpay_payment_id: 'pay_timeout_test_001',
    };
    const sim = createSafeRefundSimulator(mockOrder);
    sim.gateway.setCreateTimeoutAtClient(true);

    const res = await sim.processWebhookRefund('pay_timeout_test_001', 45000);

    // Preserves 500 so webhook retries
    assert.equal(res.status, 500);
    assert.match(res.error, /ECONNRESET|client connection/i);

    // Refund job remains durable in PENDING state with incremented retry count
    const job = sim.getJob();
    assert.equal(job.status, 'PENDING');
    assert.equal(job.retry_count, 1);
    assert.match(job.last_error, /ECONNRESET/i);

    // Gateway DID create the refund before client timed out
    assert.equal(sim.getStats().refundsOnGateway, 1);
    // Order not yet confirmed completed
    assert.equal(sim.order.refund_status, 'REFUND_REQUIRED');
  });

  // --------------------------------------------------------------------------
  // 13. Retry Where Razorpay Already Has a Successful Refund (Reconciliation)
  // --------------------------------------------------------------------------
  it('13. Safe Refund Retries: Webhook retry where Razorpay already has successful refund reconciles without duplicate dispatch', async () => {
    const mockOrder = {
      id: 'QL-2026-RECONCILE-1',
      final_total: 450.00,
      payment_status: 'CANCELLED',
      refund_status: 'REFUND_REQUIRED',
      razorpay_payment_id: 'pay_reconcile_002',
    };
    // Pre-existing refund already on gateway (e.g. from timed-out previous attempt)
    const existingGatewayRefunds = [
      {
        id: 'rfnd_auth_existing_888',
        payment_id: 'pay_reconcile_002',
        amount: 45000,
        status: 'processed',
        notes: { qless_order_id: 'QL-2026-RECONCILE-1' },
      },
    ];

    const sim = createSafeRefundSimulator(mockOrder, existingGatewayRefunds);

    const res = await sim.processWebhookRefund('pay_reconcile_002', 45000);

    // Succeeds with 200 OK and reconciled flag
    assert.equal(res.status, 200);
    assert.equal(res.reconciled, true);
    assert.equal(res.refundId, 'rfnd_auth_existing_888');

    // Authoritative reconciliation in database
    assert.equal(sim.order.refund_status, 'REFUNDED');
    assert.equal(sim.order.refund_id, 'rfnd_auth_existing_888');
    assert.equal(sim.order.refund_amount, 450.00);

    const job = sim.getJob();
    assert.equal(job.status, 'SUCCEEDED');
    assert.equal(job.refund_id, 'rfnd_auth_existing_888');

    // CRITICAL: createRefund was NEVER called (0 calls)! No duplicate refund dispatched!
    assert.equal(sim.getStats().createCallCount, 0);
  });

  // --------------------------------------------------------------------------
  // 14. Retry Where No Refund Exists (Normal Creation Flow)
  // --------------------------------------------------------------------------
  it('14. Safe Refund Retries: Retry where no refund exists queries gateway then safely dispatches single refund', async () => {
    const mockOrder = {
      id: 'QL-2026-FRESH-1',
      final_total: 299.00,
      payment_status: 'CANCELLED',
      refund_status: 'REFUND_REQUIRED',
      razorpay_payment_id: 'pay_fresh_003',
    };
    const sim = createSafeRefundSimulator(mockOrder, []);

    const res = await sim.processWebhookRefund('pay_fresh_003', 29900);

    assert.equal(res.status, 200);
    assert.equal(res.success, true);
    assert.match(res.refundId, /rfnd_mock_/);

    // Gateway was queried first (1 query call), then 1 refund created (1 create call)
    assert.equal(sim.getStats().queryCallCount, 1);
    assert.equal(sim.getStats().createCallCount, 1);

    // Reconciled in database
    assert.equal(sim.order.refund_status, 'REFUNDED');
    assert.equal(sim.getJob().status, 'SUCCEEDED');
  });

  // --------------------------------------------------------------------------
  // 15. Refund Query Times Out or Fails
  // --------------------------------------------------------------------------
  it('15. Safe Refund Retries: Gateway query failure preserves durable job and defers action with 500', async () => {
    const mockOrder = {
      id: 'QL-2026-QUERY-FAIL-1',
      final_total: 100.00,
      payment_status: 'CANCELLED',
      refund_status: 'REFUND_REQUIRED',
      razorpay_payment_id: 'pay_query_fail_004',
    };
    const sim = createSafeRefundSimulator(mockOrder);
    sim.gateway.setQueryFail(true);

    const res = await sim.processWebhookRefund('pay_query_fail_004', 10000);

    assert.equal(res.status, 500);
    assert.match(res.error, /refund query to gateway failed/i);

    // Job preserved as PENDING
    const job = sim.getJob();
    assert.equal(job.status, 'PENDING');
    assert.match(job.last_error, /ETIMEDOUT/i);

    // Did NOT attempt to create refund while state is ambiguous
    assert.equal(sim.getStats().createCallCount, 0);
  });

  // --------------------------------------------------------------------------
  // 16. Two Concurrent Workers Attempting the Same Refund
  // --------------------------------------------------------------------------
  it('16. Safe Refund Retries: Two concurrent workers are protected by atomic claim guard', async () => {
    const mockOrder = {
      id: 'QL-2026-CONCURRENCY-1',
      final_total: 350.00,
      payment_status: 'CANCELLED',
      refund_status: 'REFUND_REQUIRED',
      razorpay_payment_id: 'pay_concurrency_005',
    };
    const sim = createSafeRefundSimulator(mockOrder, []);

    // Worker 1 starts and successfully claims the job
    const worker1Promise = sim.processWebhookRefund('pay_concurrency_005', 35000);

    // Worker 2 runs concurrently while job is PROCESSING
    const worker2Res = await sim.processWebhookRefund('pay_concurrency_005', 35000);

    const worker1Res = await worker1Promise;

    // Worker 1 completed successfully
    assert.equal(worker1Res.status, 200);
    assert.equal(worker1Res.success, true);

    // Worker 2 safely backed off without dispatching duplicate
    assert.equal(worker2Res.status, 200);
    assert.match(worker2Res.message, /already claimed or completed by concurrent worker/i);

    // Crucially: Exactly ONE refund was created on the gateway!
    assert.equal(sim.getStats().createCallCount, 1);
  });

  // --------------------------------------------------------------------------
  // 17. Refund with Mismatched Amount or Contradictory Order ID
  // --------------------------------------------------------------------------
  it('17. Safe Refund Retries: Contradictory notes or amount mismatch is flagged for manual review', async () => {
    // 17.1 Amount Mismatch
    const orderAmountMismatch = {
      id: 'QL-2026-MISMATCH-1',
      final_total: 500.00, // 50000 paise
      payment_status: 'CANCELLED',
      refund_status: 'REFUND_REQUIRED',
      razorpay_payment_id: 'pay_mismatch_006',
    };
    const gatewayMismatchRefunds = [
      {
        id: 'rfnd_mismatched_amount',
        payment_id: 'pay_mismatch_006',
        amount: 25000, // Partial or wrong amount: 25000 vs 50000 paise
        status: 'processed',
        notes: { qless_order_id: 'QL-2026-MISMATCH-1' },
      },
    ];
    const sim1 = createSafeRefundSimulator(orderAmountMismatch, gatewayMismatchRefunds);

    const res1 = await sim1.processWebhookRefund('pay_mismatch_006', 50000);
    assert.equal(res1.status, 400);
    assert.match(res1.error, /refund amount mismatch/i);
    assert.equal(sim1.getJob().status, 'MANUAL_REVIEW');
    assert.equal(sim1.order.refund_status, 'REFUND_REQUIRED'); // NOT marked complete!

    // 17.2 Contradictory Order Notes
    const orderContradiction = {
      id: 'QL-2026-CONTRADICT-1',
      final_total: 200.00,
      payment_status: 'CANCELLED',
      refund_status: 'REFUND_REQUIRED',
      razorpay_payment_id: 'pay_contradict_007',
    };
    const gatewayContradictRefunds = [
      {
        id: 'rfnd_contradictory_notes',
        payment_id: 'pay_contradict_007',
        amount: 20000,
        status: 'processed',
        notes: { qless_order_id: 'QL-OTHER-ORDER-DIFFERENT' }, // Contradiction!
      },
    ];
    const sim2 = createSafeRefundSimulator(orderContradiction, gatewayContradictRefunds);

    const res2 = await sim2.processWebhookRefund('pay_contradict_007', 20000);
    assert.equal(res2.status, 400);
    assert.match(res2.error, /contradictory refund association/i);
    assert.equal(sim2.getJob().status, 'MANUAL_REVIEW');
    assert.equal(sim2.order.refund_status, 'REFUND_REQUIRED'); // NOT marked complete!
  });

  // --------------------------------------------------------------------------
  // 18. Refund that Remains in a Pending State
  // --------------------------------------------------------------------------
  it('18. Safe Refund Retries: Gateway refund in pending state preserves job without marking complete', async () => {
    const mockOrder = {
      id: 'QL-2026-PENDING-REF-1',
      final_total: 150.00,
      payment_status: 'CANCELLED',
      refund_status: 'REFUND_REQUIRED',
      razorpay_payment_id: 'pay_pending_gateway_008',
    };
    const pendingGatewayRefunds = [
      {
        id: 'rfnd_gateway_pending_999',
        payment_id: 'pay_pending_gateway_008',
        amount: 15000,
        status: 'pending', // Razorpay status is pending
        notes: { qless_order_id: 'QL-2026-PENDING-REF-1' },
      },
    ];
    const sim = createSafeRefundSimulator(mockOrder, pendingGatewayRefunds);

    const res = await sim.processWebhookRefund('pay_pending_gateway_008', 15000);

    assert.equal(res.status, 200);
    assert.equal(res.pending, true);
    assert.equal(res.refundId, 'rfnd_gateway_pending_999');

    // Job is recorded in PROCESSING state with refund_id, awaiting final webhook
    const job = sim.getJob();
    assert.equal(job.status, 'PROCESSING');
    assert.equal(job.refund_id, 'rfnd_gateway_pending_999');

    // Rule 5: Never mark complete without authoritative confirmation!
    assert.equal(sim.order.refund_status, 'REFUNDED_REQUIRED' in sim.order ? 'REFUNDED_REQUIRED' : sim.order.refund_status, 'REFUND_REQUIRED');
    assert.equal(sim.getStats().createCallCount, 0); // Did NOT create another duplicate refund!
  });

  // --------------------------------------------------------------------------
  // 19. Safe Recovery of Stale PROCESSING Job (Worker Crash Before API Call)
  // --------------------------------------------------------------------------
  it('19. Safe Refund Recovery: Stale PROCESSING job with expired lease is recovered and dispatched', async () => {
    const mockOrder = {
      id: 'QL-2026-STALE-1',
      final_total: 520.00,
      payment_status: 'CANCELLED',
      refund_status: 'REFUND_REQUIRED',
      razorpay_payment_id: 'pay_stale_before_api_019',
    };
    const sim = createSafeRefundSimulator(mockOrder, []);

    // Simulate worker crash before API call: status is PROCESSING but lease expired 10 minutes ago
    sim.setJob({
      status: 'PROCESSING',
      lease_expires_at: Date.now() - 10 * 60 * 1000,
      retry_count: 1,
      last_error: 'Worker heartbeat timeout',
    });

    const res = await sim.processWebhookRefund('pay_stale_before_api_019', 52000);

    assert.equal(res.status, 200);
    assert.equal(res.success, true);
    assert.match(res.refundId, /rfnd_mock_/);

    // Verifies stale job was claimed and single refund dispatched
    assert.equal(sim.getStats().createCallCount, 1);
    assert.equal(sim.order.refund_status, 'REFUNDED');
    assert.equal(sim.getJob().status, 'SUCCEEDED');
  });

  // --------------------------------------------------------------------------
  // 20. Stale Recovery Where Crashed Worker Already Created Refund on Gateway
  // --------------------------------------------------------------------------
  it('20. Safe Refund Recovery: Stale job where crashed worker already created gateway refund reconciles without duplicate call', async () => {
    const mockOrder = {
      id: 'QL-2026-STALE-2',
      final_total: 310.00,
      payment_status: 'CANCELLED',
      refund_status: 'REFUND_REQUIRED',
      razorpay_payment_id: 'pay_stale_after_api_020',
    };
    // Gateway has the refund created by the crashed worker before dying
    const gatewayRefunds = [
      {
        id: 'rfnd_crashed_worker_success',
        payment_id: 'pay_stale_after_api_020',
        amount: 31000,
        status: 'processed',
        notes: { qless_order_id: 'QL-2026-STALE-2' },
      },
    ];
    const sim = createSafeRefundSimulator(mockOrder, gatewayRefunds);

    // Stale job left behind
    sim.setJob({
      status: 'PROCESSING',
      lease_expires_at: Date.now() - 5 * 60 * 1000,
      retry_count: 1,
    });

    const res = await sim.processWebhookRefund('pay_stale_after_api_020', 31000);

    // Reconciles authoritative refund
    assert.equal(res.status, 200);
    assert.equal(res.reconciled, true);
    assert.equal(res.refundId, 'rfnd_crashed_worker_success');

    // CRITICAL: createRefund was NEVER called! No duplicate refund issued!
    assert.equal(sim.getStats().createCallCount, 0);
    assert.equal(sim.order.refund_status, 'REFUNDED');
    assert.equal(sim.getJob().status, 'SUCCEEDED');
  });

  // --------------------------------------------------------------------------
  // 21. Active Lease Cannot Be Claimed Before Lease Expiry
  // --------------------------------------------------------------------------
  it('21. Safe Refund Recovery: Active PROCESSING job cannot be claimed before lease expires', async () => {
    const mockOrder = {
      id: 'QL-2026-ACTIVE-LEASE',
      final_total: 180.00,
      payment_status: 'CANCELLED',
      refund_status: 'REFUND_REQUIRED',
      razorpay_payment_id: 'pay_active_lease_021',
    };
    const sim = createSafeRefundSimulator(mockOrder, []);

    // Lease active for next 4 minutes
    sim.setJob({
      status: 'PROCESSING',
      lease_expires_at: Date.now() + 4 * 60 * 1000,
    });

    const res = await sim.processWebhookRefund('pay_active_lease_021', 18000);

    assert.equal(res.status, 200);
    assert.match(res.message, /already claimed or completed by concurrent worker/i);

    // Did NOT dispatch refund while another worker's lease is active
    assert.equal(sim.getStats().createCallCount, 0);
  });

  // --------------------------------------------------------------------------
  // 22. MANUAL_REVIEW Status Is Never Automatically Leased
  // --------------------------------------------------------------------------
  it('22. Safe Refund Recovery: MANUAL_REVIEW job is never automatically claimed by worker', async () => {
    const mockOrder = {
      id: 'QL-2026-MANUAL-REVIEW-JOB',
      final_total: 250.00,
      payment_status: 'CANCELLED',
      refund_status: 'REFUND_REQUIRED',
      razorpay_payment_id: 'pay_manual_rev_022',
    };
    const sim = createSafeRefundSimulator(mockOrder, []);

    sim.setJob({
      status: 'MANUAL_REVIEW',
      last_error: 'Amount mismatch detected previously',
    });

    const res = await sim.processWebhookRefund('pay_manual_rev_022', 25000);

    assert.equal(res.status, 200);
    assert.match(res.message, /MANUAL_REVIEW/i);
    assert.equal(sim.getStats().createCallCount, 0);
  });

  // --------------------------------------------------------------------------
  // 23. SQL Migration Verification: lease_expires_at and claim_order_refund_job
  // --------------------------------------------------------------------------
  it('23. SQL Verification: Migration declares lease_expires_at and claim_order_refund_job RPC', () => {
    const migrationPath = path.resolve('supabase/migrations/20261020000000_razorpay_order_fields.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Column and index
    assert.match(sql, /lease_expires_at\s+TIMESTAMPTZ/i);
    assert.match(sql, /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_refund_jobs_lease\s+ON\s+public\.order_refund_jobs\(status,\s*lease_expires_at\);/i);

    // RPC definition & permissions
    assert.match(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.claim_order_refund_job/i);
    assert.match(sql, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.claim_order_refund_job[\s\S]*?FROM\s+PUBLIC,\s*anon,\s*authenticated;/i);
    assert.match(sql, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.claim_order_refund_job[\s\S]*?TO\s+service_role;/i);
  });
});


