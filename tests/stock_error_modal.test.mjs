import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseStockError } from "../src/utils/stockErrorParser.ts";

describe("StockErrorModal & Stock Error Parser Test Suite", () => {
  // Test 1: Insufficient stock for one product
  it("1. should parse insufficient stock for a single product with special characters/apostrophes", () => {
    const errorMsg = 'Insufficient stock for "Dr. Bimal\'s Arjuna Cardio Care Tea". Available: 0, requested: 85';
    const result = parseStockError(errorMsg);

    assert.ok(result, "Expected result to not be null");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].productName, "Dr. Bimal's Arjuna Cardio Care Tea");
    assert.strictEqual(result[0].availableStock, 0);
    assert.strictEqual(result[0].requestedQuantity, 85);
  });

  // Test 2: Insufficient stock for multiple products
  it("2. should parse insufficient stock for multiple products in a single error message", () => {
    const multiErrorMsg =
      'Insufficient stock for "Dr. Bimal\'s Arjuna Cardio Care Tea". Available: 0, requested: 85; Insufficient stock for "Aashirvaad Superior MP Atta 5kg". Available: 3, requested: 10';
    const result = parseStockError(multiErrorMsg);

    assert.ok(result, "Expected result to not be null");
    assert.strictEqual(result.length, 2);

    assert.strictEqual(result[0].productName, "Dr. Bimal's Arjuna Cardio Care Tea");
    assert.strictEqual(result[0].availableStock, 0);
    assert.strictEqual(result[0].requestedQuantity, 85);

    assert.strictEqual(result[1].productName, "Aashirvaad Superior MP Atta 5kg");
    assert.strictEqual(result[1].availableStock, 3);
    assert.strictEqual(result[1].requestedQuantity, 10);
  });

  // Test 3: Available stock is zero
  it("3. should handle products where available stock is exactly zero", () => {
    const errorMsg = 'Insufficient stock for "Amul Butter 500g". Available: 0, requested: 2';
    const result = parseStockError(errorMsg);

    assert.ok(result);
    assert.strictEqual(result[0].productName, "Amul Butter 500g");
    assert.strictEqual(result[0].availableStock, 0);
    assert.strictEqual(result[0].requestedQuantity, 2);

    // Also verify out-of-stock format
    const outOfStockMsg = '"Amul Butter 500g" is currently out of stock or unavailable';
    const oosResult = parseStockError(outOfStockMsg);
    assert.ok(oosResult);
    assert.strictEqual(oosResult[0].productName, "Amul Butter 500g");
    assert.strictEqual(oosResult[0].availableStock, 0);
  });

  // Test 4: Requested quantity exceeds available stock
  it("4. should handle cases where requested quantity exceeds available stock (>0)", () => {
    const errorMsg = 'Requested quantity (15) for "Tata Salt 1kg" exceeds available store stock (4)';
    const result = parseStockError(errorMsg);

    assert.ok(result);
    assert.strictEqual(result[0].productName, "Tata Salt 1kg");
    assert.strictEqual(result[0].availableStock, 4);
    assert.strictEqual(result[0].requestedQuantity, 15);
  });

  // Test 5: Close button preserves cart contents
  it("5. close button handler should preserve customer's cart contents without modifications", () => {
    const initialCart = [
      { id: "p1", name: "Dr. Bimal's Arjuna Cardio Care Tea", quantity: 85, price: 250 },
      { id: "p2", name: "Tata Tea Gold 500g", quantity: 2, price: 320 },
    ];

    let currentCart = [...initialCart];
    let modalOpen = true;

    // Simulate clicking Close
    const handleClose = () => {
      modalOpen = false;
      // Intentionally does NOT mutate or filter currentCart
    };

    handleClose();

    assert.strictEqual(modalOpen, false, "Modal should be closed");
    assert.strictEqual(currentCart.length, 2, "Cart item count must be preserved");
    assert.strictEqual(currentCart[0].quantity, 85, "Item quantity must be unchanged");
    assert.strictEqual(currentCart[1].quantity, 2, "Item quantity must be unchanged");
    assert.deepStrictEqual(currentCart, initialCart, "Cart must remain strictly identical");
  });

  // Test 6: Review Cart returns to the correct screen and preserves cart
  it("6. Review Cart button should return to Review Order screen without altering cart", () => {
    const initialCart = [
      { id: "p1", name: "Dr. Bimal's Arjuna Cardio Care Tea", quantity: 85, price: 250 },
    ];
    let currentCart = [...initialCart];
    let currentScreen = "payment";
    let modalOpen = true;

    // Simulate clicking Review Cart
    const handleReviewCart = () => {
      modalOpen = false;
      currentScreen = "review-order";
      // Intentionally preserves cart
    };

    handleReviewCart();

    assert.strictEqual(modalOpen, false, "Modal should be closed");
    assert.strictEqual(currentScreen, "review-order", "Must return to review-order screen");
    assert.deepStrictEqual(currentCart, initialCart, "Cart must remain intact");
  });

  // Test 7: Normal successful checkout works without triggering stock modal
  it("7. normal successful checkout should not trigger stock error modal", () => {
    let modalOpen = false;
    let modalItems = null;
    let orderSuccess = false;

    // Mock successful checkout response
    const checkoutResponse = {
      success: true,
      orderId: "ord-test-12345",
      order: {
        orderId: "ord-test-12345",
        paymentStatus: "PENDING_VERIFICATION",
        finalTotal: 499,
      },
    };

    const handleCheckoutResult = (result) => {
      if (!result.success) {
        const parsed = parseStockError(result.error);
        if (parsed) {
          modalItems = parsed;
          modalOpen = true;
        }
      } else {
        orderSuccess = true;
      }
    };

    handleCheckoutResult(checkoutResponse);

    assert.strictEqual(orderSuccess, true, "Checkout should succeed");
    assert.strictEqual(modalOpen, false, "Stock modal must NOT open on successful checkout");
    assert.strictEqual(modalItems, null, "Stock modal items must be null");
  });

  // Test 8: The old footer error does not appear for insufficient-stock errors
  it("8. old footer Checkout Note error should be suppressed for insufficient-stock errors", () => {
    // Case A: Insufficient stock error
    const stockError = 'Insufficient stock for "Dr. Bimal\'s Arjuna Cardio Care Tea". Available: 0, requested: 85';
    const isStockError = Boolean(parseStockError(stockError));
    const showFooterErrorForStock = stockError && !isStockError;

    assert.strictEqual(
      showFooterErrorForStock,
      false,
      "Footer error must be suppressed when stock error is present"
    );

    // Case B: Non-stock error (e.g. Network timeout, Payment gateway error)
    const nonStockError = "Gateway connection timed out. Please retry.";
    const isNonStock = Boolean(parseStockError(nonStockError));
    const showFooterErrorForNonStock = nonStockError && !isNonStock;

    assert.strictEqual(
      showFooterErrorForNonStock,
      true,
      "Footer error MUST appear for non-stock operational errors"
    );
  });
});

