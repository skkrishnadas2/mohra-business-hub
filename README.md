# MOHRA IT CARE & TELECOM CENTER

বাংলা POS, non-branded barcode labels, recharge, multi-account MFS, banks, two-sided party ledgers, purchases, repairs and financial reports.

## Run and verify

```sh
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run build
bun run dev
```

The existing 24-hour dependency release-age safeguard is retained. Wrangler is pinned to 4.160.0. Use the tracked Bun lockfile.

Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the ignored `.env` file or build environment. Only publishable values belong in the client. Never add secret/admin keys to the frontend or Git.

## Hosted architecture

- Existing GitHub repository and existing Cloudflare Worker `mohara-it-care` are retained.
- Supabase project: `qbegwsgmximqxnelyqkc`.
- Authenticated `business-api` Edge Function validates the user, membership and every allowed action. Privileged keys stay in Supabase's default server environment; Cloudflare needs no service-role secret.
- Existing versioned `shop_states` snapshots and transactional `shop_action_receipts` remain authoritative. No database schema or migration files were changed.
- `bun run build` regenerates `supabase/functions/business-api/engine.js` from the same business engine used by the browser, then builds the Worker and static assets.
- Deploy **both** the Edge Function and frontend when changing business rules. The function entrypoint and generated engine are in `supabase/functions/business-api/`.
- Worker deployment uses the generated `.output/server/wrangler.json`; its one-file Nitro bundle must remain unsplit.

## Single-store identity

This deployment is exclusively MOHRA IT CARE & TELECOM CENTER, proprietor Sankar Das. The verified existing proprietor account alone can initialize the store. Bootstrap is guarded by an owner-profile compare-and-swap lock, and later requests reuse the existing store. Login has no public registration, shop selector, joining-code form or standalone-device entry. Owner and cashier roles are resolved from server membership. Owners provision cashier accounts from Store & Team; credentials are never saved in business snapshots. Existing device business data is uploaded only after the proprietor authenticates. Password recovery is available through Supabase Auth and depends on its configured mail delivery/redirect settings.

## Daily operation

1. Sign in with the proprietor’s existing email; the one assigned store opens automatically, and a blank store is prepared automatically when necessary. Existing device history is preserved and imported only into an untouched empty Cloud ledger.
2. Add bank, personal/agent MFS and recharge accounts. Add parties once, using customer/supplier/SR roles as appropriate. Cashiers sign in with accounts provisioned by the proprietor.
3. Create products or physical SIM stock. Existing barcodes can be scanned; unbranded products receive internal barcodes and A4/thermal labels.
4. Scan into the POS cart, then use one-tap cash checkout. Other payment, split and due options remain in a separate drawer. Every new sale defaults to cash. Draft/held carts stay on the current device.
5. Use Accounts for bank transfers, SR advances/partial receipts, expenses, capital/drawings, account settings and deferred commissions.
6. Use Party & Khata for distinct receivable/payable balances and collections. SR balances awaiting receipt are shown separately; they cannot be accidentally collected twice as ordinary debt.
7. Purchase stock through the supplier flow for weighted-average cost and payable tracking. Full purchase returns reconcile outstanding debt and refunds.
8. Repair advances are liabilities until delivery; consumed parts and direct costs reduce repair profit. Historical repair entries keep their legacy recognition convention.
9. Open a counted cash shift before posting transactions; only one drawer shift can be active. Cashiers work in their own shift; owners can reconcile or close it. Cash variances need a reason and owner approval. Export statements/stock/journals as CSV, print reports or save them as PDF, and download a full JSON backup.

## Ready-to-use controls

The proprietor signs in with the existing authenticated account; there is no additional online setup/PIN wizard. The empty ledger starts without fabricated balances or stock. Enter actual opening values through owner-only Accounts adjustments with a mandatory audit reason, then add products/SIM stock and start a counted shift. Online history cannot be erased with Reset All. Legacy PINs remain only for old local snapshots; online sign-out requires account authentication on return.

Store & Team supports audited cashier access suspension/reactivation. Pending approvals and the employee's open shift must be resolved before suspension. A blocked employee is rejected by the API and signed out locally when access is checked. Protocol revision 3 protects the new preparation flow from older browser clients; refresh the page if asked.

Device diagnostics in Store & Team print test labels/receipts and check camera decoding without creating sales or stock movements. Manual barcode entry is not counted as camera verification.

## Recovery and verification limits

Backups can be restored only into a new empty shop, after schema, ledger/balance and journal validation. Active shop history cannot be overwritten through recovery. Restored snapshots keep a recovery audit voucher.

POS success/receipt waits for the exact server acknowledgement. A timeout is visibly pending, not a successful sale. Existing durable outboxes retain action identities for safe retry. All financial forms now await the exact receipt before success, block duplicate submissions while pending, and retain the global synchronization status. Disconnected authenticated shops reject new financial mutations; existing drafts remain local. Full offline cold-start/navigation caching is not implemented.

Recharge, MFS and bank screens record completed real-world services and settlements; they do not initiate external money transfers or recharge requests without a separately authorized provider API.

Free-tier quotas still apply. The current JSON snapshot approach is suitable for the initial shop, not an assertion of unlimited SaaS capacity. Real owner/cashier multi-device sign-in, camera hardware and physical printer output require acceptance checks on the shop's devices.

## Employee controls and returns

Verified Auth user ID and profile name are attached by the Edge Function to new vouchers. The current actor is transient, excluded from snapshots and cannot be supplied in a Cloud action. Reports and CSV include actor, shift, requesting employee and approval ID. Legacy vouchers are not retroactively assigned an employee.

Owner settings define default per-party cashier credit and discount limits, with party-specific credit overrides. Beyond-limit POS sales and recharge credit, product refunds and cash-short shifts can be requested from the cashier and executed once by the owner under Shift & Approvals. Requests expire when their shift closes; a changed cash balance also invalidates a closing count.

Partial sales returns allocate the original discounted line value in integer paisa, reduce outstanding invoice debt first, then refund actual paid/collected amounts. Collected dues do not block a return. Return journals restore stock/cost and reverse revenue, receivables and refunds. Serialized inventory requires one unique ICCID/serial per stocked piece; intake, sale, cancellation and exact-item return maintain its availability.

## HTTP permission and retry verification

Run `npm run test:all` for the browser/business tests and the production Edge handler contract tests. The latter run the actual bundled engine and HTTP handler against simulated Auth/database I/O, checking role forgery, cost redaction, owner-only setup, unrelated-shop access, stale writes, duplicate checkouts and suspended employees. They create no real users, transactions or provider requests.

The assigned store and proprietor membership have been administratively prepared as a blank ledger. Sign in with the existing proprietor account; no Auth password was changed. Opening balances, stock and cashier identities must reflect actual business data.
