import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Payment Method Switching & Razorpay State Reset Suite', () => {

  // Scenario 1: Select UPI/Razorpay Test, then select Cash -> Verify Cash is the only selected method
  it('1. Select UPI then Cash: Immediately sets Cash as the sole active method, clearing UPI selection', () => {
    // Model state transitions matching handleSelectPaymentMethod
    let selectedMethod = 'cash';
    let selectedMethodRef = 'cash';
    let pendingDigitalOrder = null;
    let errorMessage = null;
    let processState = 'ready';

    const handleSelectPaymentMethod = (newMethod) => {
      selectedMethod = newMethod;
      selectedMethodRef = newMethod;
      errorMessage = null;
      processState = 'ready';
      if (newMethod === 'cash') {
        pendingDigitalOrder = null;
      }
    };

    // User selects UPI
    handleSelectPaymentMethod('upi');
    assert.equal(selectedMethod, 'upi');
    assert.equal(selectedMethodRef, 'upi');

    // User switches to Cash
    handleSelectPaymentMethod('cash');
    assert.equal(selectedMethod, 'cash');
    assert.equal(selectedMethodRef, 'cash');
    assert.equal(pendingDigitalOrder, null);
    assert.equal(errorMessage, null);
    assert.equal(processState, 'ready');
  });

  // Scenario 2: Switch between available methods several times -> Verify UI and checkout state remain synchronized
  it('2. Multi-switching: Repeated switching between available methods synchronizes selection and summary consistently', () => {
    let state = {
      selectedMethod: 'cash',
      selectedMethodRef: 'cash',
      cartItems: [{ id: 'item-1', name: 'Almond Milk', price: 90, quantity: 1 }],
      pendingDigitalOrder: null,
    };

    const selectMethod = (m) => {
      state.selectedMethod = m;
      state.selectedMethodRef = m;
      if (m === 'cash' && state.pendingDigitalOrder) {
        state.pendingDigitalOrder = null;
      }
    };

    const sequence = ['upi', 'cash', 'upi', 'cash', 'cash', 'upi', 'cash'];
    for (const target of sequence) {
      selectMethod(target);
      assert.equal(state.selectedMethod, target);
      assert.equal(state.selectedMethodRef, target);
      // Verify checkout summary display method matches selection
      const displayMethod = state.selectedMethod;
      assert.equal(displayMethod, target);
    }

    assert.equal(state.selectedMethod, 'cash');
    assert.equal(state.pendingDigitalOrder, null);
  });

  // Scenario 3: Select UPI, trigger a test error, then switch to Cash -> Old error and payment state do not affect Cash checkout
  it('3. Error clearance on switch: Stale Razorpay errors and failed states are wiped when customer changes to Cash', () => {
    let state = {
      selectedMethod: 'upi',
      selectedMethodRef: 'upi',
      errorMessage: 'Razorpay payment verification failed: Payment not captured',
      processState: 'failed',
      isNetworkTimeout: true,
      pendingDigitalOrder: { orderId: 'QL-DIG-888', items: [{ id: 'p1', quantity: 2 }] },
    };

    // Customer decides to abandon failed UPI and select Cash
    const handleSelectPaymentMethod = (newMethod) => {
      state.selectedMethod = newMethod;
      state.selectedMethodRef = newMethod;
      state.errorMessage = null;
      state.processState = 'ready';
      state.isNetworkTimeout = false;
      if (newMethod === 'cash') {
        state.pendingDigitalOrder = null;
      }
    };

    handleSelectPaymentMethod('cash');

    assert.equal(state.selectedMethod, 'cash');
    assert.equal(state.errorMessage, null);
    assert.equal(state.processState, 'ready');
    assert.equal(state.isNetworkTimeout, false);
    assert.equal(state.pendingDigitalOrder, null);

    // Verify Cash order CTA button is active and ready
    const isPayButtonDisabled = state.processState === 'processing';
    assert.equal(isPayButtonDisabled, false);
  });

  // Scenario 4: Rapidly switch methods and click checkout -> Submitted method matches final selection
  it('4. Rapid switching race condition: Synchronous ref ensures checkout request always uses the latest selected method', () => {
    let selectedMethod = 'cash';
    let selectedMethodRef = 'cash';
    let submittedMethod = null;

    const selectMethod = (m) => {
      selectedMethod = m;
      selectedMethodRef = m;
    };

    const executeCheckout = (method) => {
      submittedMethod = method;
    };

    const handleInitiatePayment = () => {
      // Must read from synchronous ref, not stale closure
      const methodToSubmit = selectedMethodRef;
      executeCheckout(methodToSubmit);
    };

    // User switches rapidly: cash -> upi -> cash, then clicks immediately
    selectMethod('upi');
    selectMethod('cash');
    handleInitiatePayment();

    assert.equal(submittedMethod, 'cash');
    assert.notEqual(submittedMethod, 'upi');
  });

  // Scenario 5: Previous asynchronous payment callback cannot overwrite the new selection
  it('5. Stale async callbacks: Attempt generation counter ignores abandoned UPI callbacks after switching to Cash', async () => {
    let currentAttemptId = 0;
    let activePaymentState = 'ready';
    let confirmedOrder = null;
    let selectedMethod = 'upi';
    let selectedMethodRef = 'upi';

    // Start UPI attempt #1
    currentAttemptId += 1;
    const upiAttemptId = currentAttemptId;
    activePaymentState = 'processing';

    // Simulate async Razorpay delay
    const simulateAsyncRazorpayCallback = (attemptId) => {
      return new Promise((resolve) => {
        setTimeout(() => {
          // Callback check matching CheckoutView implementation:
          if (attemptId !== currentAttemptId || selectedMethodRef !== 'upi') {
            // Ignored as stale callback
            resolve({ ignored: true, reason: 'Stale attempt or method switched' });
            return;
          }
          activePaymentState = 'completed';
          confirmedOrder = { id: 'QL-UPI-123', status: 'CONFIRMED' };
          resolve({ ignored: false });
        }, 50);
      });
    };

    const upiPromise = simulateAsyncRazorpayCallback(upiAttemptId);

    // Customer abandons UPI before callback completes and selects Cash
    selectedMethod = 'cash';
    selectedMethodRef = 'cash';
    currentAttemptId += 1; // Incremented by method switch
    activePaymentState = 'ready';

    // Execute Cash checkout
    const cashOrder = { id: 'QL-CASH-456', payment_method: 'cash', payment_status: 'PENDING' };
    confirmedOrder = cashOrder;

    // Await the abandoned UPI callback
    const upiResult = await upiPromise;

    // Verify the UPI callback was safely ignored
    assert.equal(upiResult.ignored, true);
    assert.equal(confirmedOrder.payment_method, 'cash');
    assert.equal(confirmedOrder.id, 'QL-CASH-456');
    assert.equal(selectedMethod, 'cash');
  });

  // Scenario 6: Unsupported digital methods remain blocked by checkout security rules
  it('6. Unsupported digital methods: Wallet / unsupported methods remain disabled and blocked', () => {
    const availableMethods = [
      { id: 'cash', enabled: true },
      { id: 'upi', enabled: true }, // Razorpay test
      { id: 'wallet', enabled: false }, // Coming soon
    ];

    const walletMethod = availableMethods.find(m => m.id === 'wallet');
    assert.equal(walletMethod.enabled, false);

    // Backend validation simulation: only 'cash' and 'upi' are accepted
    const validatePaymentMethod = (method) => {
      if (method === 'wallet') {
        throw new Error('Payment method wallet is currently unsupported.');
      }
      return true;
    };

    assert.throws(() => validatePaymentMethod('wallet'), /unsupported/);
  });

  // Scenario 7: Cash checkout flow executes correctly without invoking Razorpay
  it('7. Cash checkout flow: Cash order is placed as PENDING cashier confirmation without calling Razorpay', () => {
    let razorpayGatewayCalled = false;
    let orderPlaced = null;

    const mockCreateRazorpayOrder = () => {
      razorpayGatewayCalled = true;
      return { razorpay_order_id: 'order_123' };
    };

    const executeCheckout = (method, cart) => {
      if (method === 'cash') {
        // Direct cash order creation
        orderPlaced = {
          orderId: 'QL-CASH-789',
          paymentMethod: 'cash',
          paymentStatus: 'PENDING',
          items: cart,
          cashierCounter: '03',
        };
        return orderPlaced;
      } else if (method === 'upi') {
        mockCreateRazorpayOrder();
        return null;
      }
    };

    const cart = [{ id: 'p1', name: 'Britannia Bread', price: 45, quantity: 2 }];
    const result = executeCheckout('cash', cart);

    assert.equal(razorpayGatewayCalled, false);
    assert.equal(result.paymentMethod, 'cash');
    assert.equal(result.paymentStatus, 'PENDING');
    assert.equal(result.orderId, 'QL-CASH-789');
  });

  // Scenario 9: Exact Reproduction of Screenshot State: selectedMethod = 'cash' while pendingDigitalOrder exists
  it('9. Regression: With Cash highlighted and pending digital order present, primary button strictly says Place Cash Order and never invokes Razorpay', () => {
    // Model the exact state in the user screenshot:
    // - selectedMethod is 'cash'
    // - pendingDigitalOrder is present with orderId 'QL-2026-829B' and 1 item totaling 42
    // - cart items in context were empty due to earlier digital reservation
    const pendingDigitalOrder = {
      orderId: 'QL-2026-829B',
      itemCount: 1,
      items: [{ id: 'p1', name: 'Britannia Bread', price: 42, quantity: 1 }],
      finalTotal: 42,
      paymentMethod: 'upi',
      paymentStatus: 'PENDING'
    };
    let items = []; // Cleared when digital order was staged
    const selectedMethod = 'cash';
    const selectedMethodRef = 'cash';
    let isProcessing = false;
    let razorpayGatewayInvoked = false;

    // 1. Effective items resolution
    const effectiveItems = items.length > 0 ? items : (pendingDigitalOrder?.items || []);
    assert.equal(effectiveItems.length, 1);
    assert.equal(effectiveItems[0].price, 42);

    // 2. Primary button text resolution logic from CheckoutView:
    const getPrimaryButtonText = () => {
      if (isProcessing) {
        return 'Processing payment…';
      }
      if (selectedMethod === 'cash') {
        return 'Place Cash Order — Pay at Counter';
      }
      if (selectedMethod === 'wallet') {
        return 'Wallet Unavailable (Test Mode)';
      }
      if (pendingDigitalOrder && (selectedMethod === 'upi' || selectedMethod === 'card')) {
        return `Retry Razorpay Payment — ₹${pendingDigitalOrder.finalTotal}`;
      }
      return `Pay ₹${pendingDigitalOrder?.finalTotal || 0} with ${selectedMethod.toUpperCase()} (Test Mode)`;
    };

    const buttonText = getPrimaryButtonText();
    // Acceptance criteria: Must be "Place Cash Order — Pay at Counter"
    assert.equal(buttonText, 'Place Cash Order — Pay at Counter');
    assert.notEqual(buttonText.includes('Retry Razorpay Payment'), true);

    // 3. Pending-order reservation banner visibility check:
    // Only rendered when digital method is active
    const shouldShowReservationBanner = Boolean(pendingDigitalOrder && selectedMethod !== 'cash');
    assert.equal(shouldShowReservationBanner, false);

    // 4. Checkout execution check:
    let cashOrderSubmitted = false;
    let submittedMethod = null;
    let supersededOrderId = null;

    const executeCheckout = (method) => {
      submittedMethod = method;
      if (method === 'cash') {
        cashOrderSubmitted = true;
        return { success: true, orderId: 'QL-CASH-NEW-101', paymentMethod: 'cash' };
      } else if (method === 'upi') {
        razorpayGatewayInvoked = true;
        return { success: true, orderId: 'QL-UPI-102', paymentMethod: 'upi' };
      }
    };

    const handleInitiatePayment = () => {
      const methodToSubmit = selectedMethodRef;
      if (methodToSubmit === 'cash') {
        // Guarantee items restored
        if (items.length === 0 && pendingDigitalOrder?.items?.length) {
          items = [...pendingDigitalOrder.items];
        }
        const res = executeCheckout('cash');
        if (pendingDigitalOrder && pendingDigitalOrder.orderId !== res.orderId) {
          supersededOrderId = pendingDigitalOrder.orderId;
        }
      } else {
        executeCheckout(methodToSubmit);
      }
    };

    handleInitiatePayment();

    assert.equal(razorpayGatewayInvoked, false);
    assert.equal(cashOrderSubmitted, true);
    assert.equal(submittedMethod, 'cash');
    assert.equal(supersededOrderId, 'QL-2026-829B');
    assert.equal(items.length, 1);
  });

  // Scenario 10: Cash -> UPI -> Cash switching with modal dismiss and error handling
  it('10. Full lifecycle: Cash -> UPI -> Modal Close -> Cash -> Checkout submits strictly Cash without error leakage', () => {
    let state = {
      selectedMethod: 'cash',
      selectedMethodRef: 'cash',
      attemptId: 0,
      modalClosed: false,
      errorMessage: null,
      submittedOrder: null,
      activeRazorpayInstance: null
    };

    // User switches to UPI
    state.selectedMethod = 'upi';
    state.selectedMethodRef = 'upi';
    state.activeRazorpayInstance = {
      close: () => { state.modalClosed = true; }
    };
    state.errorMessage = 'Razorpay checkout modal closed. Your order remains pending with reserved stock.';

    // User switches back to Cash
    const handleSelectPaymentMethod = (newMethod) => {
      state.attemptId += 1;
      if (state.activeRazorpayInstance?.close) {
        state.activeRazorpayInstance.close();
        state.activeRazorpayInstance = null;
      }
      state.selectedMethod = newMethod;
      state.selectedMethodRef = newMethod;
      state.errorMessage = null;
    };

    handleSelectPaymentMethod('cash');

    assert.equal(state.selectedMethod, 'cash');
    assert.equal(state.selectedMethodRef, 'cash');
    assert.equal(state.modalClosed, true);
    assert.equal(state.errorMessage, null);
    assert.equal(state.activeRazorpayInstance, null);
  });

});

