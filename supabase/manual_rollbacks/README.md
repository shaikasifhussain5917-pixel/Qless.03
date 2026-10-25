# QLess Supabase Manual Rollback Scripts

This directory contains standalone emergency database recovery scripts that must **never** be automatically executed during forward migration runs or fresh database initializations (`supabase db reset`).

---

### `20261017000001_phase8a_pilot_inventory_rollback.sql`

* **Target Supermarket:** QLess Mart (`STORE001` / `QLM001`)
* **Purpose:** Restores the historical 30 demo products to active inventory and deletes unreferenced pilot products if Phase 8A ever needs to be rolled back manually.
* **Why it is kept outside `supabase/migrations/`:** Supabase CLI treats every `.sql` file in `supabase/migrations/` as a forward migration. Leaving this file in the migrations directory caused automatic execution immediately following `20261017000000_phase8a_pilot_inventory_migration.sql`, which reversed the pilot catalog on every database initialization.
* **Execution Procedure (Manual Only):**
  1. Open the Supabase SQL Editor (or connect via trusted psql).
  2. Verify backup tables exist: `store_inventory_backup_phase8a`, `products_backup_phase8a`, `product_locations_backup_phase8a`.
  3. Execute `20261017000001_phase8a_pilot_inventory_rollback.sql` within an explicit transaction.
  4. Verify catalog status: exactly 30 active demo items restored.
