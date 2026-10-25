import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { calculateBill } from "../src/utils/billing.ts";

const WORKSPACE_DIR = process.cwd();
const PAYMENT_PAGE_PATH = path.join(WORKSPACE_DIR, "src", "components", "checkout", "PaymentPage.tsx");
const SHOPPING_SCREEN_PATH = path.join(WORKSPACE_DIR, "src", "views", "customer", "ShoppingScreen.tsx");
const REVIEW_ORDER_PATH = path.join(WORKSPACE_DIR, "src", "components", "checkout", "ReviewOrderView.tsx");

test("Dedicated Payment Page & Customer Flow Architecture Suite", async (t) => {
  const paymentPageCode = fs.readFileSync(PAYMENT_PAGE_PATH, "utf8");
  const shoppingScreenCode = fs.readFileSync(SHOPPING_SCREEN_PATH, "utf8");
  const reviewOrderCode = fs.readFileSync(REVIEW_ORDER_PATH, "utf8");

  await t.test("1. Customer Flow Navigation: Shopping Screen -> Review Order -> Payment Page", () => {
    // Cart view action bar navigates to Review Order, not direct Checkout
    const cartActionBarSlice = shoppingScreenCode.slice(
      shoppingScreenCode.indexOf('{/* Sticky Bottom Action Bar */}'),
      shoppingScreenCode.indexOf('{/* ────────────────── VIEW 2A: REVIEW ORDER')
    );
    assert.match(
      cartActionBarSlice,
      /setView\("review-order"\)/,
      "Cart action bar must navigate to review-order"
    );
    assert.doesNotMatch(
      cartActionBarSlice,
      /Checkout<\/button>/,
      "Cart action bar must NOT have a direct Checkout button"
    );

    // ReviewOrderView provides Proceed to Payment navigation
    assert.match(
      reviewOrderCode,
      /onProceedToPayment/,
      "ReviewOrderView must have an onProceedToPayment handler"
    );
    assert.match(
      reviewOrderCode,
      /Proceed to Payment/,
      "ReviewOrderView must display a Proceed to Payment button"
    );

    // ShoppingScreen connects ReviewOrderView to setView('payment')
    assert.match(
      shoppingScreenCode,
      /onProceedToPayment=\{\(\) => setView\("payment"\)\}/,
      "ShoppingScreen must route ReviewOrderView completion to Payment Page"
    );
  });

  await t.test("2. Back Navigation: Payment Page -> Review Order -> Cart", () => {
    // PaymentPage back navigation routes to review-order
    assert.match(
      shoppingScreenCode,
      /onBack=\{\(\) => setView\("review-order"\)\}/,
      "PaymentPage onBack must navigate back to review-order"
    );

    // CustomerLayout back button handles payment view
    assert.match(
      shoppingScreenCode,
      /if \(view === "payment"\) \{\s*setView\("review-order"\);/,
      "CustomerLayout onBack must return to review-order when in payment view"
    );

    // CustomerLayout back button handles review-order view
    assert.match(
      shoppingScreenCode,
      /else if \(view === "review-order" \|\| view === "checkout"\) \{\s*setView\("cart"\);/,
      "CustomerLayout onBack must return to cart when in review-order view"
    );
  });

  await t.test("3. Payment Page opens at top immediately on mount", () => {
    assert.match(
      paymentPageCode,
      /window\.scrollTo\(\{\s*top:\s*0,\s*behavior:\s*"instant"\s*\}\)/,
      "PaymentPage must scroll to top instantly on mount to eliminate scrolling confusion"
    );
  });

  await t.test("4. Authoritative Order Summary and Total Calculation", () => {
    const mockItems = [
      { id: 901, name: "Sample Item A", price: 42, quantity: 2, mrp: 50 },
      { id: 902, name: "Sample Item B", price: 58, quantity: 1, mrp: 60 },
    ];
    // Subtotal: (42*2) + (58*1) = 84 + 58 = 142
    // MRP: (50*2) + (60*1) = 100 + 60 = 160. mrpSavings = 18
    // GST: 5% of 142 = 7.10 (CGST 3.55, SGST 3.55)
    // Total = 142 + 7.10 = 149.10
    const bill = calculateBill(mockItems, null);
    assert.equal(bill.subtotal, 142);
    assert.equal(bill.mrpSavings, 18);
    assert.equal(bill.finalTotal, 149.1);

    // PaymentPage must use calculateBill
    assert.match(
      paymentPageCode,
      /calculateBill\(effectiveItems,\s*appliedCoupon\)/,
      "PaymentPage must calculate bill using authoritative calculateBill utility"
    );
  });

  await t.test("5. Payment Method Selection Cards & Pilot Status", () => {
    // Must feature Cash at Counter as Active Pilot Method
    assert.match(
      paymentPageCode,
      /Cash — Pay at Cashier Counter/,
      "PaymentPage must label cash option clearly"
    );
    assert.match(
      paymentPageCode,
      /Active Pilot Method/,
      "PaymentPage must badge Cash as Active Pilot Method"
    );
    assert.match(
      paymentPageCode,
      /Pay with physical cash at Counter #03 before exit verification/,
      "PaymentPage must instruct customer to pay at Counter #03"
    );

    // UPI must be labeled TEST MODE
    assert.match(
      paymentPageCode,
      /TEST MODE — Not a real payment/,
      "PaymentPage must clearly badge test digital methods as TEST MODE"
    );

    // Wallet must be disabled
    assert.match(
      paymentPageCode,
      /id:\s*"wallet"[\s\S]*?disabled:\s*true/,
      "PaymentPage must keep wallet disabled"
    );
  });

  await t.test("6. Primary Action Button strictly reflects selected method", () => {
    // When Cash is selected: "Place Cash Order — ₹[Total]"
    assert.match(
      paymentPageCode,
      /Place Cash Order — \{fmt\(bill\.finalTotal\)\}/,
      "Primary button must display 'Place Cash Order — ₹[Total]' when Cash is selected"
    );

    // When UPI is selected: "Pay ₹[Total] with UPI (Test Mode)"
    assert.match(
      paymentPageCode,
      /Pay \{fmt\(bill\.finalTotal\)\} with \{selectedMethod === "upi" \? "UPI" : "Card"\} \(Test Mode\)/,
      "Primary button must clearly indicate test mode for UPI/Card"
    );
  });

  await t.test("7. Payment Method Switching Bug Prevention: Pending digital order never forces Razorpay on Cash", () => {
    // Verify synchronous ref prevents stale callback overrides
    assert.match(
      paymentPageCode,
      /selectedMethodRef\.current = newMethod/,
      "PaymentPage must synchronously update ref on method switch"
    );

    // Verify handleInitiatePayment reads selectedMethodRef.current
    assert.match(
      paymentPageCode,
      /const methodToSubmit = selectedMethodRef\.current/,
      "handleInitiatePayment must check synchronous ref, not stale closure"
    );

    // Verify Cash order execution calls executeCheckout("cash") directly without Razorpay
    assert.match(
      paymentPageCode,
      /if \(methodToSubmit === "cash"\) \{[\s\S]*?executeCheckout\("cash"\)/,
      "Cash selection must directly execute cash checkout without Razorpay"
    );

    // Verify in-flight digital modals are closed when switching to Cash
    assert.match(
      paymentPageCode,
      /activeRazorpayInstanceRef\.current\.close\(\)/,
      "Switching to cash must programmatically close any active Razorpay modal"
    );
  });

  await t.test("8. Mobile-Friendly Layout: Fixed bottom bar and no nested scroll traps", () => {
    // Fixed bottom action bar ensures button is visible without scrolling
    assert.match(
      paymentPageCode,
      /className="fixed inset-x-0 bottom-0 z-30 px-3 pb-3 sm:pb-4"/,
      "PaymentPage must render primary action button in fixed bottom bar"
    );

    // Container has bottom padding so content does not get hidden behind fixed bar
    assert.match(
      paymentPageCode,
      /pb-28/,
      "PaymentPage content container must have sufficient bottom padding for fixed bar"
    );
  });
});
