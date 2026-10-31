import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { calculateBill } from "../src/utils/billing.ts";

const WORKSPACE_DIR = process.cwd();
const PAYMENT_PAGE_PATH = path.join(WORKSPACE_DIR, "src", "components", "checkout", "PaymentPage.tsx");
const RECEIPT_SCREEN_PATH = path.join(WORKSPACE_DIR, "src", "views", "customer", "DigitalReceiptScreen.tsx");

test("Clean and Simple Customer Payment Experience Suite", async (t) => {
  const paymentPageCode = fs.readFileSync(PAYMENT_PAGE_PATH, "utf8");
  const receiptScreenCode = fs.readFileSync(RECEIPT_SCREEN_PATH, "utf8");

  await t.test("1. GST breakdown is no longer separately displayed on the Payment Page", () => {
    // Must NOT contain separate GST lines in the rendered UI
    assert.doesNotMatch(
      paymentPageCode,
      /Taxes\s*\(CGST/i,
      "PaymentPage must NOT render 'Taxes (CGST...' in the UI"
    );
    assert.doesNotMatch(
      paymentPageCode,
      /<span>\s*CGST/i,
      "PaymentPage must NOT display separate CGST lines"
    );
    assert.doesNotMatch(
      paymentPageCode,
      /<span>\s*SGST/i,
      "PaymentPage must NOT display separate SGST lines"
    );
    assert.doesNotMatch(
      paymentPageCode,
      /<span>\s*IGST/i,
      "PaymentPage must NOT display separate IGST lines"
    );
    assert.doesNotMatch(
      paymentPageCode,
      /Demo GST|Mock GST/i,
      "PaymentPage must NOT display Demo GST or Mock GST labels"
    );
  });

  await t.test("2. Subtotal remains correct and accurately reflects cart items", () => {
    const mockItems = [
      { id: "item-1", name: "Premium Basmati Rice 5kg", price: 349, quantity: 2, mrp: 399 },
      { id: "item-2", name: "Organic Coconut Oil 500ml", price: 185, quantity: 1, mrp: 210 },
    ];
    // Expected Subtotal: (349 * 2) + (185 * 1) = 698 + 185 = 883
    const bill = calculateBill(mockItems, null);
    assert.equal(bill.subtotal, 883);
    assert.equal(bill.itemCount, 3);

    // PaymentPage displays Items Subtotal
    assert.match(
      paymentPageCode,
      /Items Subtotal \(\{bill\.itemCount\}/,
      "PaymentPage must display item count and subtotal"
    );
    assert.match(
      paymentPageCode,
      /\{fmt\(bill\.subtotal\)\}/,
      "PaymentPage must display formatted bill.subtotal"
    );
  });

  await t.test("3. Discounts remain correct and display only when applicable", () => {
    const mockItems = [
      { id: "item-1", name: "Grocery Basket", price: 500, quantity: 2, mrp: 550 },
    ];
    // Subtotal: 1000
    const coupon = { code: "SAVE10", discountType: "percentage", discountValue: 10 };
    const bill = calculateBill(mockItems, coupon);

    assert.equal(bill.subtotal, 1000);
    assert.equal(bill.couponDiscount, 100);

    // PaymentPage conditionally displays Discount
    assert.match(
      paymentPageCode,
      /bill\.couponDiscount > 0/,
      "PaymentPage must check if couponDiscount > 0 before displaying"
    );
    assert.match(
      paymentPageCode,
      /−\{fmt\(bill\.couponDiscount\)\}/,
      "PaymentPage must render formatted discount deduction"
    );
  });

  await t.test("4. Total Payable remains exactly equal to authoritative checkout calculation", () => {
    const mockItems = [
      { id: "item-1", name: "Tata Tea Gold 500g", price: 320, quantity: 2, mrp: 350 },
    ];
    // Subtotal = 640
    // Taxable = 640. GST = 5% of 640 = 32 (CGST 16, SGST 16)
    // Authoritative Final Total = 640 + 32 = 672
    const bill = calculateBill(mockItems, null);
    assert.equal(bill.finalTotal, 672);

    // Verify Total Payable label and authoritative binding
    assert.match(
      paymentPageCode,
      /Total Payable/,
      "PaymentPage must have 'Total Payable' label"
    );
    assert.match(
      paymentPageCode,
      /\{fmt\(bill\.finalTotal\)\}/,
      "PaymentPage must bind to authoritative bill.finalTotal"
    );
  });

  await t.test("5. Cash order creation still works and remains pilot method", () => {
    // Verify cash selection and execution path
    assert.match(
      paymentPageCode,
      /if \(methodToSubmit === "cash"\)/,
      "PaymentPage must contain cash checkout handler"
    );
    assert.match(
      paymentPageCode,
      /const result = await executeCheckout\("cash"\)/,
      "Cash checkout must call executeCheckout('cash')"
    );
    assert.match(
      paymentPageCode,
      /Counter #03/,
      "PaymentPage must instruct customer to pay at Counter #03"
    );
    assert.match(
      paymentPageCode,
      /Place Cash Order — \{fmt\(bill\.finalTotal\)\}/,
      "Primary button must show 'Place Cash Order — ₹[Total]'"
    );
  });

  await t.test("6. Payment method switching still works without state leakage", () => {
    assert.match(
      paymentPageCode,
      /const handleSelectPaymentMethod = useCallback\(/,
      "PaymentPage must implement handleSelectPaymentMethod callback"
    );
    assert.match(
      paymentPageCode,
      /selectedMethodRef\.current = newMethod/,
      "PaymentPage must synchronously update method ref"
    );
    assert.match(
      paymentPageCode,
      /setSelectedMethod\(newMethod\)/,
      "PaymentPage must update React state for UI rendering"
    );
  });

  await t.test("7. Test-mode payment restrictions remain intact", () => {
    // UPI badge
    assert.match(
      paymentPageCode,
      /id:\s*"upi"[\s\S]*?badge:\s*"TEST MODE — Not a real payment"/,
      "UPI must have TEST MODE badge"
    );
    // Card badge
    assert.match(
      paymentPageCode,
      /id:\s*"card"[\s\S]*?badge:\s*"TEST MODE — Not a real payment"/,
      "Card must have TEST MODE badge"
    );
    // Wallet disabled
    assert.match(
      paymentPageCode,
      /id:\s*"wallet"[\s\S]*?disabled:\s*true/,
      "Wallet option must remain disabled"
    );
  });

  await t.test("8. GST breakdown is removed from DigitalReceiptScreen", () => {
    // Verified that GST lines are not rendered in customer-facing DigitalReceiptScreen
    assert.doesNotMatch(
      receiptScreenCode,
      /Central GST/i,
      "DigitalReceiptScreen must NOT display Central GST breakdown"
    );
    assert.doesNotMatch(
      receiptScreenCode,
      /State GST/i,
      "DigitalReceiptScreen must NOT display State GST breakdown"
    );
    assert.doesNotMatch(
      receiptScreenCode,
      /Total Tax \(5% Grocery GST\)/i,
      "DigitalReceiptScreen must NOT display Total Tax breakdown"
    );
  });

  await t.test("9. No duplicate or stale payment amounts appear", () => {
    // Summary, sticky bottom bar, and active options all derive from bill.finalTotal
    const finalTotalBindings = paymentPageCode.match(/fmt\(bill\.finalTotal\)/g);
    assert.ok(
      finalTotalBindings && finalTotalBindings.length >= 3,
      "Order summary, sticky bar, and button must all reference the single authoritative bill.finalTotal"
    );
  });
});

