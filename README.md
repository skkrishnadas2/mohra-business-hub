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

## Daily operation

1. Sign in with an owner email, load an existing shop or create a fresh setup. Real UI setup starts with an empty product catalog.
2. Add bank, personal/agent MFS and recharge accounts. Add parties once, using customer/supplier/SR roles as appropriate.
3. Create products or physical SIM stock. Existing barcodes can be scanned; unbranded products receive internal barcodes and A4/thermal labels.
4. Scan into the POS cart, then use one-tap cash checkout. Other payment, split and due options remain in a separate drawer. Every new sale defaults to cash. Draft/held carts stay on the current device.
5. Use Accounts for bank transfers, SR advances/partial receipts, expenses, capital/drawings, account settings and deferred commissions.
6. Use Party & Khata for distinct receivable/payable balances and collections. SR balances awaiting receipt are shown separately; they cannot be accidentally collected twice as ordinary debt.
7. Purchase stock through the supplier flow for weighted-average cost and payable tracking. Full purchase returns reconcile outstanding debt and refunds.
8. Repair advances are liabilities until delivery; consumed parts and direct costs reduce repair profit. Historical repair entries keep their legacy recognition convention.
9. Reconcile cash at closing. Export statements/stock/journals as CSV, print reports or save them as PDF, and download a full JSON backup.

## Recovery and verification limits

Backups can be restored only into a new empty shop, after schema, ledger/balance and journal validation. Active shop history cannot be overwritten through recovery. Restored snapshots keep a recovery audit voucher.

POS success/receipt waits for the exact server acknowledgement. A timeout is visibly pending, not a successful sale. Existing durable outboxes retain action identities for safe retry. Other screens show the global pending/error banner during synchronization. Disconnected authenticated shops reject new financial mutations; existing drafts remain local. Full offline cold-start/navigation caching is not implemented.

Recharge, MFS and bank screens record completed real-world services and settlements; they do not initiate external money transfers or recharge requests without a separately authorized provider API.

Free-tier quotas still apply. The current JSON snapshot approach is suitable for the initial shop, not an assertion of unlimited SaaS capacity. Real owner/cashier multi-device sign-in, camera hardware and physical printer output require acceptance checks on the shop's devices.
