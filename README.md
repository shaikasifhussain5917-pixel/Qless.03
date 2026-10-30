# QLess 2.0 — Smart Supermarket Self-Checkout Platform

> **Scan. Pay. Go.** — A modern, full-stack supermarket self-checkout platform built to eliminate checkout queues, automate store entry/exit validation, and streamline retail inventory operations.

---

## 🏬 Overview

**QLess 2.0** transforms everyday smartphones into personal supermarket cashiers. Customers check in at supermarket turnstiles, scan product shelf barcodes as they shop, manage a live cart with real-time tax and discount calculations, settle payments, and clear exit security turnstiles via cryptographically validated digital exit passes.

The system connects four dedicated operational portals powered by a unified cloud backend:
1. **Customer Self-Checkout Portal**: In-store check-in, real camera barcode scanning (EAN-13, EAN-8, UPC-A, Code 128), aisle location finder (SmartFind), live cart, and multi-channel checkout.
2. **Store Admin Operations Dashboard**: SaaS analytics, authoritative stock & inventory control, smart stock intake with online barcode discovery, rack & location coordinates, and security turnstile audit logs.
3. **Assisted Cashier Desk**: Counter queue settlement, cash drawer reconciliation, manual barcode override, and instant exit-pass issuance.
4. **Security Guard Inspector Terminal**: High-speed camera QR scanner, exit pass token validation, bagging audit verification, and anti-theft turnstile control.

---

## 🚀 Key Features & Capabilities

### 📱 Customer Shopping & Checkout
* **Turnstile Gate Check-In**: High-definition camera QR scanner supporting physical store turnstile passes (`STORE001` / `QLM001`).
* **High-Speed Shelf Barcode Scanner**: Hardware-accelerated camera scanner supporting EAN-13, EAN-8, UPC-A, UPC-E, and Code 128 with autofocus and auto-exposure.
* **SmartFind Shelf Locator**: Interactive store directory mapping products to specific Aisles, Racks, and Shelf tiers.
* **Live Budget & Cart Control**: Authoritative subtotal, CGST, SGST, MRP savings, and coupon validations.
* **Multi-Channel Checkout**: Settle at Cashier Counter or test digital gateways (UPI / Card) with atomic inventory reservation and duplicate checkout prevention.
* **Digital Exit Pass**: Timed 60-minute cryptographic exit QR code preventing duplicate reuse and gate clearance bypasses.

### 🛡️ Store Administration & Inventory ERP
* **Executive Metrics**: Live revenue, transactions count, items sold, low-stock warnings, and out-of-stock indicators.
* **Optimistic Concurrency Control (OCC)**: Real-time stock adjustments (+1, -1, +5, +20) preventing conflicting simultaneous restocks.
* **Smart Stock Intake**: Barcode intake with automated product metadata and image discovery via Open Food Facts / Open Beauty Facts API.
* **Rack & Location Coordinate Manager**: Visual store layout coordinate mapping (Aisles A1–A8, Racks, Shelves).
* **Audit Trail**: Real-time immutable security logs tracking all gate verifications and cashier transactions.

### 🧑‍💼 Assisted Cashier Station
* **Live Pending Orders Queue**: Real-time settlement of cash orders placed by self-checkout shoppers.
* **Instant Cash Confirmation**: Atomically transitions orders to `CONFIRMED` and triggers digital exit pass generation.

### 👮 Security Guard Terminal
* **Enlarged High-Def Scanner**: Generous camera scanning frame with green HUD reticles and laser scan animation.
* **Authoritative Turnstile Validation**: Database RPC verification preventing expired passes, unpaid orders, or duplicate passes from exiting.

---

## 🛠️ Tech Stack & Architecture

* **Frontend Framework**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
* **Build System & Tooling**: [Vite 7](https://vite.dev/)
* **Styling & Design System**: [Tailwind CSS v4](https://tailwindcss.com/)
* **Database & Auth**: [Supabase](https://supabase.com/) (PostgreSQL 15+, Row Level Security, Atomic RPCs)
* **Camera & Barcode Processing**: `html5-qrcode` with custom responsive HD viewports and constraints
* **Routing**: [React Router v7](https://reactrouter.com/) (HashRouter for zero-config static hosting)

---

## 📦 Getting Started

### 1. Prerequisites
* Node.js 18+ or 20+
* npm or pnpm

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/shaikasifhussain5917-pixel/qless.02.git
cd qless.02

# Install dependencies
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_STORE_ID=STORE001
VITE_STORE_CODE=QLM001
```

### 4. Development Server
```bash
npm run dev
```

### 5. Production Build
```bash
npm run build
```

---

## 🧪 Testing & Verification

The project includes an automated test suite verifying checkout atomicity, RBAC boundaries, camera lifecycles, and payment state machines:

```bash
# Run strict TypeScript verification
npx tsc --noEmit

# Run full automated test suite (163 tests across 17 suites)
node --test tests/*.test.mjs
```

---

## 📄 License
This project is licensed under the MIT License.
