# Phase 1 status

## Verified in the Electron track

- React renderer builds with `npm run build`.
- Main-process SQLite access uses `better-sqlite3`, WAL mode, foreign keys and full synchronous writes.
- Sales create invoice numbers, snapshot line items, validate aggregate stock, deduct stock atomically and write audit records.
- Bill cancellation is transactional, restores stock and retains the bill as `CANCELLED`; financial bills are not physically deleted.
- Product CRUD, dashboard queries, bill history/filtering, settings, JSON backup/restore and CSV export are implemented.
- SQLite migrations exist through schema version 10, including sale idempotency keys, product categories, flexible size scales and the product-level size attribute.
- Product variants now support size, colour, SKU, barcode, optional variant price and stock.
- Customer directory now supports SQLite-backed create, edit, search, archive and completed-purchase totals.
- Billing can associate a saved customer with a sale while retaining walk-in/manual customer entry.
- Suppliers and purchase receipts now have SQLite-backed CRUD/receiving, duplicate receipt protection and atomic variant stock updates.
- Stock movement history records purchase receipts, manual adjustments, sales and cancellations with reasons/references.
- Dedicated returns/refunds now reference original bill items, validate remaining quantities, optionally restock variants and mark fully returned bills as `REFUNDED`.
- A persistent `npm run test:smoke` Electron-ABI regression command now covers migration, purchase receipt, sale, return/restock, stock movements and backup payload validation on an isolated database.
- The focused regression command also verifies invoice-number search, close/reopen persistence, backup preservation of bill variant references, and mandatory reasons for variant stock changes.
- Backend sale idempotency keys now make a retried request return the original bill instead of creating a second bill or deducting stock twice.
- An isolated Electron backup/restore regression test now verifies product/variant IDs, invoice and bill-item variant references, unsupported-backup rejection, safety-backup creation and target persistence without using shop data.
- Duplicate non-empty SKU/barcode values are rejected by unique partial indexes.
- Billing requires an exact `variant_id` and deducts/restores only that variant's stock.
- Variant transaction smoke test passed: duplicate identifier rejection, sale deduction and cancellation restoration.
- `better-sqlite3` 12.4.1 native rebuild has passed against the pinned Electron 36.9.5 ABI.

## Scope narrowed by user

The active Phase 1 acceptance scope is now limited to reliable **billing and store/inventory** workflows. Purchases, returns, customers, reports, expenses and other additional modules remain in the codebase where implemented, but are not required for this focused acceptance pass.

## Incomplete or not implemented within the focused scope

- Purchases/supplier receipts and purchase return workflows (outside focused scope).
- Purchase cancellation/return workflows and supplier archive UI.
- Returns currently support one or more selected lines per request at the backend, while the initial UI submits one line at a time; refund accounting is recorded but not yet integrated with cash-closing reports.
- Expense entry, expense categories and expense reports (outside focused scope).
- Daily cash closing and payment-method cash reconciliation (outside focused scope).
- Audit history viewer/report UI (outside focused scope).
- Reports and analytics beyond the existing dashboard and bill CSV export (outside focused scope).
- Dedicated returns/refunds workflow distinct from full bill cancellation.
- Audit-history viewer/report UI; audit rows exist in SQLite.
- Variant barcode scanning workflow and richer inventory reporting.
- Automated repository test suite; current verification is build plus focused SQLite smoke tests.
- Legacy localStorage import has not been implemented because no real export was supplied for validation. The legacy format was inspected: `mc_products`, `mc_bills` and `mc_bill_counter` are the relevant keys.
- Customer purchase-history reporting currently depends on bills created after the customer association migration; legacy bills remain preserved but are not automatically linked to matching customer records.
- Product-level stock adjustment is disabled when variants exist; stock must be changed on the exact size/colour variant to preserve stock isolation.
- Bill history supports invoice-number search in addition to customer/date/status filters.
- Backup export preserves `bill_items.variant_id`, and restore rejects unsupported backup versions.
- Final recovery audit upgraded the backup format to version 2. It captures all 15 persistent application tables in one SQLite read transaction: `schema_migrations`, `products`, `product_variants`, `customers`, `suppliers`, `bills`, `bill_items`, `purchases`, `purchase_items`, `stock_movements`, `returns`, `return_items`, `settings`, `invoice_sequences`, and `audit_logs`.
- Restore validates the version, complete table set, target foreign-key integrity and table columns before deleting target rows. Rows are restored in foreign-key order with original primary keys and relationships.
- Backup/restore now preserves migration records, invoice sequence state, audit history, customer/supplier records, purchase receipts, stock movements, return records and return items. The snapshot is transactionally consistent.
- Backup/restore currently covers the core products, variants, bills, bill items, settings and invoice sequence; optional customer/purchase/return/movement history is not fully included.

## Focused billing and store verification

- `npm run build`: passed after the stock-integrity fix.
- `npm run rebuild`: passed for `better-sqlite3` 12.4.1 against Electron 36.9.5.
- `npm run test:smoke`: passed migration version 8, purchase/sale/return stock flow, stock movement records, duplicate-sale retry protection and backup payload validation on an isolated Electron database.
- `npm run test:backup-restore`: passed on isolated source/target databases; restored product, variant, bill and bill-item references, rejected unsupported version without changing target data, and created a pre-restore safety backup.
- A fresh `npm run dev` attempt encountered port 5173 already in use from an existing development process; Electron still opened, but the combined command was stopped to avoid disturbing the existing process. Earlier clean Electron launches remain verified.

## Blocked or unverified

- Electron runtime launch is verified in this Linux environment with Electron 36.9.5; the window opened and no SQLite initialization error was emitted. The runtime archive had to be restored manually because the package download stalled.
- Windows NSIS installer has not been built or installed on Windows.
- Windows native-module loading, printer APIs, file dialogs and restart persistence remain unverified.
- `npm audit` reports 0 critical, 3 high and 1 moderate vulnerabilities. The former critical `tar` advisory from the direct legacy `@electron/rebuild` dependency is no longer present; remaining advisories require separate compatibility review.

## Commands and outcomes

- `npm install --ignore-scripts`: completed.
- `npm run build`: passed.
- `npm test -- --runInBand`: unavailable; package.json has no test script.
- `npm run rebuild`: passed for `better-sqlite3` 12.4.1 against Electron 36.9.5.
- Focused SQLite migration/sale/variant smoke test: passed after explicitly rebuilding `better-sqlite3` for the active Node ABI.
- `node node_modules/electron/cli.js --version`: passed with `v36.9.5` after restoring the runtime archive from the configured npm mirror.
- `npm run dev`: Electron window launched with Vite and the rebuilt native SQLite module; only non-fatal Chromium/graphics console warnings were emitted.
- Electron-ABI customer integration smoke test: passed migration version 5, customer search, customer-associated sale totals and archive behavior.
- Electron-ABI purchase integration smoke test: passed migration version 6, supplier receipt stock increase, movement creation, duplicate receipt rejection and invalid mixed-receipt rollback.
- Electron-ABI returns integration smoke test: passed migration version 7, original-invoice reference, stock restoration and excess-return rejection.
- `npm audit --json`: 0 critical, 3 high, 1 moderate; the exact remaining advisories still need remediation review.
- `npm run test:smoke`: passed migration version 7, purchase stock increase, sale creation, return/restock, stock movement count and backup payload validation in Electron.
- Expanded `npm run test:smoke`: passed invoice search, variant stock-reason validation, backup variant-reference validation and database close/reopen persistence.
- `npm run test:backup-restore`: passed isolated restore, invalid-input safety and pre-restore backup checks.
- After migration 9: `npm run build`, `npm run test:smoke`, and `npm run test:backup-restore` all passed.
- After migration 10: `npm run build` and `npm run test:smoke` passed. The complete backup/restore test must be rerun before release.
- After the multi-size workflow: `npm run build`, `npm run rebuild`, `npm run test:smoke`, and `npm run test:backup-restore` passed.
- After customer auto-capture and source tracking: `npm run build`, `npm run test:smoke`, and `npm run test:backup-restore` passed; migration version 11 is active.
- Final `npm run test:backup-restore`: passed with representative rows across every implemented module/table. It verified all 15 table row counts and relationships, rejected unsupported input without changing the target, restored a pre-restore safety backup into a separate recovery database, and cleaned up only temporary test databases.
- Final recovery audit coverage: complete for the current SQLite schema. No persistent application table is intentionally omitted from the version 2 backup payload.
- Products now have a persisted optional `size` attribute in addition to exact variant sizes; migration 9 preserves existing records.
- Products now support a category, selectable size scale (`None`, letter, waist, shoe or custom) and custom size options. Variant colour is optional; product + size identifies the stock variant, so size-free items can use a `No size` convention.
- Product creation now supports checkbox-based multi-size selection with per-size stock quantities. One save creates all selected variants atomically and generates internal SKU values automatically.
- The confirmed development catalog replacement archived existing products instead of hard-deleting historical records, then created Baggy Shirt (S/M/L/XL, 10 each), Formal Pant (28/30/32, 5 each), and Sunglasses (No size, 20).
- New customers can now be automatically added to the customer list during billing, with duplicate phone matching and an explicit opt-out checkbox for walk-in/manual sales.
- Customer acquisition source is captured with presets and custom values, including Walk-in, Instagram, Friend / Referral, WhatsApp, Facebook and Website.
- Invoice printing uses the renderer print preview with Electron-safe print CSS, including A4 page sizing and print-only layout cleanup. Physical printer enumeration/output remains platform-dependent and requires Windows testing.
