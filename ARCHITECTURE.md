# Architecture — MOHRA Business Hub

## Surfaces

Six primary destinations: Overview, Counter, Accounts, Party & Khata, Stock & Purchases, Reports. Counter tabs group POS, recharge, MFS and services. Management tools group closing, connection, presence and settings. Mobile uses four frequent destinations plus a More drawer.

## Authoritative actions

The React/TanStack Start frontend keeps a Zustand device cache. User actions have stable UUID identities/timestamps; durable per-shop outboxes submit them to Supabase `business-api`. The function calls `auth.getUser`, checks database membership (never editable metadata), loads the authoritative shop snapshot and replays the allow-listed action through the shared store creator. Version compare-and-swap and transactional receipts prevent stale overwrites and duplicate retries. Filtered cashier snapshots remove owner PIN, journals and restricted cost/profit data.

Supabase owns privileged credentials. Browser and Cloudflare builds use only the project URL and publishable key. No admin key is requested from the user or exported. Gateway JWT verification remains enabled and the function independently verifies the user. The existing SQL tables, grants and migrations are preserved.

## Ledger and entities

All money moves still go through `post()` in `src/lib/store.ts`. Each new voucher receives balanced journal lines from `src/lib/journal.ts` or validated business-specific entries. Cash/bank/wallet balances, inventory, receivables, payables, SR clearing, commission receivables, repair work-in-progress, income, expenses and equity are separate journal accounts. Older vouchers are not silently rewritten/backfilled.

`business` is an optional, backwards-compatible snapshot field containing parties, receivable/payable entries, purchases, pending SR settlements and deferred commissions. `src/lib/business.ts` implements these workflows. Customer invoice debt and party entries share a party identity; collections allocate oldest-first without nested Cloud actions.

Principal debits are validated before earnings/fees. Rejected actions do not partially change related entities. Amounts use two-decimal rounding and safe integer-paisa boundaries. Stock purchase costs use weighted averages. Voided invoices remain in history; a second reversal is rejected. Existing collected-invoice safeguards remain.

## Important accounting conventions

- MFS cash-in increases cash and decreases the selected agent wallet; cash-out reverses the principal flow.
- Account-specific commission settings apply only to future entries. Deferred commission is profit/receivable until actually credited; collection is profit-neutral.
- SR advances debit their actual funding account immediately. Partial confirmation credits only what arrived. MFS rebalancing is profit-neutral. Recharge extra balance is recognized once on receipt, and recharge sale does not count that commission again.
- Party receivable and payable balances are retained separately. Explicit offsets leave the original records and remaining balances auditable. Pending SR value is displayed separately.
- Purchases debit inventory and credit cash/payables. Full returns account for supplier payments already allocated against the remaining debt.
- New repair advances are liabilities. Parts/direct costs accumulate as work-in-progress and are recognized on first delivery or cancellation. Older records retain legacy recognition flags to avoid counting historical advances twice.
- Capital/drawings and internal transfers are not operating profit. Operating expenses reduce net profit, including on the dashboard.

## Scan and print

`CameraScanner` uses ZXing's browser reader, cleans up media streams and keeps callbacks stable across cart changes. A continuously visible barcode does not repeatedly add units; it must leave the frame before the same code rearms. Hardware scanners use the existing keyboard/debounce path. Product creation and stock receipt have camera entry points.

`print.ts` escapes all user text before HTML printing and renders Code 128 labels. A4 sheets and 58mm label rolls support price visibility, per-product counts and batch printing. Internal generated codes are not represented as globally registered retail identifiers. Physical printer calibration and camera focus are device acceptance checks.

## Persistence, recovery and boundaries

A full backup has a format/version marker. Recovery validates typed records, account references, journal balance and account balances against movements. It is restricted to a new empty destination shop and creates a recovery audit entry. No active shop can be overwritten through this workflow.

POS waits for its exact Cloud acknowledgement before showing success or a receipt. Timeouts show pending and retain idempotent retry state. Other financial screens retain existing optimistic interaction with a global pending/error indicator. Financial actions are blocked while an authenticated shop is offline; draft and held carts persist separately per shop/device. There is no service worker for cold offline startup.

Snapshots grow with history. This iteration preserves the existing database contract rather than introducing a risky live schema rewrite. Large-scale SaaS needs a measured migration to normalized/versioned records, retention and pagination, and separate tenant provisioning/billing. Provider API automation and subscription billing are not included in the initial-shop release.
