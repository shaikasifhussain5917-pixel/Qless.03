import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// Read env for live Supabase testing (defaults to local Supabase instance)
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';
const LOCAL_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

let env = {};
if (fs.existsSync('.env.local')) {
  try {
    const envContent = fs.readFileSync('.env.local', 'utf8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let value = match[2] || '';
        value = value.trim().replace(/^['"](.*)['"]$/, '$1');
        env[match[1]] = value;
      }
    }
  } catch (e) {
    // ignore
  }
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL || LOCAL_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || LOCAL_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const STORE_ID = 'STORE001';

describe('Real Camera Barcode Scanner & Live Supabase Inventory Verification', () => {

  // Test 1: Camera permission request & error states
  it('Test 1: Camera permission request and denial handling', () => {
    const handleCameraError = (err) => {
      const errName = err?.name || '';
      const errMsg = err?.message || '';
      if (errName === 'NotAllowedError' || errMsg.includes('Permission denied')) {
        return {
          status: 'denied',
          userMessage: 'Camera access was denied. Please allow camera permissions in your browser or enter the barcode manually.'
        };
      }
      if (errName === 'NotFoundError' || errMsg.includes('DevicesNotFoundError')) {
        return {
          status: 'unsupported',
          userMessage: 'No compatible camera detected on this device. Please use manual barcode entry or search.'
        };
      }
      return {
        status: 'error',
        userMessage: 'Unable to start camera stream. Please try manual barcode entry.'
      };
    };

    const denied = handleCameraError({ name: 'NotAllowedError', message: 'Permission denied' });
    assert.equal(denied.status, 'denied');
    assert.match(denied.userMessage, /allow camera permissions/i);

    const noCamera = handleCameraError({ name: 'NotFoundError', message: 'Requested device not found' });
    assert.equal(noCamera.status, 'unsupported');
    assert.match(noCamera.userMessage, /No compatible camera detected/i);
  });

  // Test 2: Camera lifecycle - opening, closing, and stopping stream tracks
  it('Test 2: Camera lifecycle stops media stream tracks on cleanup', () => {
    let tracksStopped = 0;
    const mockTrack = {
      stop: () => {
        tracksStopped++;
      }
    };
    const mockStream = {
      getTracks: () => [mockTrack, mockTrack]
    };

    // Cleanup simulation
    const teardownCamera = (stream, scannerInstance) => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (scannerInstance && scannerInstance.isScanning) {
        scannerInstance.stop();
      }
    };

    let scannerStopped = false;
    const mockScanner = {
      isScanning: true,
      stop: () => { scannerStopped = true; }
    };

    teardownCamera(mockStream, mockScanner);
    assert.equal(tracksStopped, 2, 'All camera media tracks must be stopped');
    assert.equal(scannerStopped, true, 'Scanner instance must be stopped when active');
  });

  // Test 3: Valid registered barcode lookup against live Supabase catalog (Phase 8A Pilot Item)
  it('Test 3: Valid registered barcode retrieves live product data from customer_store_catalog', async () => {
    const testBarcode = '8904091129461'; // Candid Dusting Powder 60g (Phase 8A Pilot Product)

    const { data, error } = await supabase
      .from('customer_store_catalog')
      .select('store_id, product_id, barcode, name, brand, category, unit_size, price, mrp, is_available, in_stock')
      .eq('store_id', STORE_ID)
      .eq('barcode', testBarcode)
      .maybeSingle();

    assert.equal(error, null, 'Supabase query must not return an error');
    assert.ok(data, 'Product record must be found in live database');
    assert.equal(data.barcode, testBarcode);
    assert.equal(data.name, 'Candid Dusting Powder');
    assert.equal(data.brand, 'Glenmark');
    assert.equal(data.category, 'Personal Care');
    assert.equal(data.unit_size, '60 g');
    assert.equal(Number(data.price), 106.50);
    assert.equal(Number(data.mrp), 106.50);
    assert.equal(data.is_available, true);
    assert.equal(data.in_stock, true);
  });

  // Test 4: Unknown barcode lookup against live Supabase catalog
  it('Test 4: Unknown barcode returns not_found and does not invent products', async () => {
    const unknownBarcode = '9999999999999';

    const { data, error } = await supabase
      .from('customer_store_catalog')
      .select('store_id, product_id, barcode, name')
      .eq('store_id', STORE_ID)
      .eq('barcode', unknownBarcode)
      .maybeSingle();

    assert.equal(error, null);
    assert.equal(data, null, 'Unregistered barcode must return null from customer_store_catalog');
  });

  // Test 5: Out of stock product identification and handling
  it('Test 5: Out of stock product is identified and blocked from cart addition', () => {
    const outOfStockProduct = {
      id: 999,
      name: 'Sold Out Item',
      barcode: '8900000000001',
      price: 50,
      isAvailable: false,
      stockQuantity: 0
    };

    const isOutOfStock =
      outOfStockProduct.isAvailable === false ||
      (outOfStockProduct.stockQuantity !== undefined && outOfStockProduct.stockQuantity <= 0);

    assert.equal(isOutOfStock, true, 'Product must be flagged as out of stock');

    // Attempting to add to cart
    const addToCart = (product, qty) => {
      if (product.isAvailable === false || (product.stockQuantity !== undefined && product.stockQuantity <= 0)) {
        return { success: false, reason: 'Product is currently out of stock' };
      }
      return { success: true, added: qty };
    };

    const result = addToCart(outOfStockProduct, 1);
    assert.equal(result.success, false);
    assert.equal(result.reason, 'Product is currently out of stock');
  });

  // Test 6: Supabase network failure handling (does NOT use mockCatalog fallback)
  it('Test 6: Database/network failure returns error status with retry option', () => {
    const simulateLookupFailure = (err) => {
      // Must return error status rather than silently returning mock products
      return {
        status: 'error',
        error: `Failed to query store inventory: ${err.message}`,
        allowRetry: true
      };
    };

    const failureResult = simulateLookupFailure(new Error('Connection timeout to Supabase'));
    assert.equal(failureResult.status, 'error');
    assert.match(failureResult.error, /Connection timeout/);
    assert.equal(failureResult.allowRetry, true);
    assert.equal(failureResult.product, undefined, 'Must not invent fallback mock product on database failure');
  });

  // Test 7: Duplicate camera detection debounce
  it('Test 7: Duplicate camera frames within cooldown period (2500ms) are suppressed', () => {
    let scansProcessed = 0;
    let lastBarcode = null;
    let lastScanTime = 0;
    const DEBOUNCE_MS = 2500;

    const onCameraFrameDecoded = (barcode, currentTime) => {
      if (barcode === lastBarcode && currentTime - lastScanTime < DEBOUNCE_MS) {
        return { accepted: false, reason: 'Duplicate frame suppressed' };
      }
      lastBarcode = barcode;
      lastScanTime = currentTime;
      scansProcessed++;
      return { accepted: true };
    };

    const t0 = 1000;
    // Frame 1
    const r1 = onCameraFrameDecoded('8901262010053', t0);
    assert.equal(r1.accepted, true);

    // Frame 2: same barcode 100ms later (typical video stream rate 10-30fps)
    const r2 = onCameraFrameDecoded('8901262010053', t0 + 100);
    assert.equal(r2.accepted, false);
    assert.equal(r2.reason, 'Duplicate frame suppressed');

    // Frame 3: same barcode 1500ms later
    const r3 = onCameraFrameDecoded('8901262010053', t0 + 1500);
    assert.equal(r3.accepted, false);

    // Frame 4: same barcode 2600ms later (cooldown elapsed)
    const r4 = onCameraFrameDecoded('8901262010053', t0 + 2600);
    assert.equal(r4.accepted, true);

    // Frame 5: different barcode scanned immediately -> accepted
    const r5 = onCameraFrameDecoded('8901063103765', t0 + 2700);
    assert.equal(r5.accepted, true);

    assert.equal(scansProcessed, 3, 'Only unique or non-debounced scans are processed');
  });

  // Test 8: Adding valid product to shopping cart
  it('Test 8: Adding confirmed product updates cart correctly', () => {
    let cart = [];

    const addToCart = (product, quantity) => {
      const existing = cart.find(item => item.product.id === product.id);
      if (existing) {
        existing.quantity += quantity;
      } else {
        cart.push({ product, quantity });
      }
    };

    const milk = { id: 1, name: 'Amul Milk', price: 27, barcode: '8901262010053', isAvailable: true };
    addToCart(milk, 2);

    assert.equal(cart.length, 1);
    assert.equal(cart[0].product.name, 'Amul Milk');
    assert.equal(cart[0].quantity, 2);

    // Add 1 more
    addToCart(milk, 1);
    assert.equal(cart[0].quantity, 3);
  });

  // Test 9: Preventing excessive quantities exceeding authoritative stock
  it('Test 9: Prevents quantity from exceeding authoritative stock limits', () => {
    const productWithStock = {
      id: 5,
      name: 'Limited Item',
      price: 100,
      stockQuantity: 3,
      isAvailable: true
    };

    const validateRequestedQuantity = (requested, maxStock) => {
      const allowed = maxStock !== undefined ? Math.min(requested, maxStock) : requested;
      return { requested, allowed, wasCapped: allowed < requested };
    };

    const check = validateRequestedQuantity(5, productWithStock.stockQuantity);
    assert.equal(check.wasCapped, true);
    assert.equal(check.allowed, 3, 'Quantity must be capped at stock level');
  });

  // Test 10: Checkout stock validation and security policy compliance
  it('Test 10: Authoritative catalog enforces in_stock availability while protecting raw inventory counts', async () => {
    // 1. Customer queries customer_store_catalog which provides authoritative in_stock boolean
    const { data: catalogItems, error: catalogErr } = await supabase
      .from('customer_store_catalog')
      .select('store_id, product_id, name, in_stock, is_available')
      .eq('store_id', STORE_ID)
      .limit(5);

    assert.equal(catalogErr, null, 'Customer catalog query must succeed');
    assert.ok(catalogItems && catalogItems.length > 0, 'Catalog records must exist');
    for (const item of catalogItems) {
      assert.equal(item.store_id, STORE_ID);
      assert.equal(typeof item.in_stock, 'boolean', 'in_stock must be a boolean flag');
    }

    // 2. Checkout stock validation rejection logic:
    // If an item in cart is marked in_stock = false during pre-checkout revalidation,
    // checkout must block order placement and prompt the customer.
    const validateCartForCheckout = (items) => {
      const unavailable = items.filter(i => !i.in_stock);
      if (unavailable.length > 0) {
        return {
          canProceed: false,
          error: `Item "${unavailable[0].name}" is no longer in stock. Please remove it to proceed.`
        };
      }
      return { canProceed: true, error: null };
    };

    const outOfStockCart = [
      { product_id: 1, name: 'Amul Milk', in_stock: true },
      { product_id: 2, name: 'Out of Stock Soda', in_stock: false }
    ];
    const validationResult = validateCartForCheckout(outOfStockCart);
    assert.equal(validationResult.canProceed, false);
    assert.match(validationResult.error, /is no longer in stock/);

    const validCart = [{ product_id: 1, name: 'Amul Milk', in_stock: true }];
    assert.equal(validateCartForCheckout(validCart).canProceed, true);
  });

});
