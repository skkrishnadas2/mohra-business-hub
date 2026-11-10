# Mohra IT Care & Telecom Center — Architecture

## Mind map
```text
App (TanStack Start + React 19, Tailwind v4, Hind Siliguri)
├── AppShell  — hydration gate → Setup (first run) → PIN lock → nav (sidebar desktop / bottom bar mobile)
├── /           Bento dashboard: total fund, today's net profit split, quick actions, low stock
├── /pos        Barcode POS: debounced auto-add, +1 on rescan, camera scan (BarcodeDetector),
│               1-tap cash, MFS/Bank/Split/Due sheet, long-press cipher preview, 58/80mm receipt
├── /recharge   Operator quick pad (GP/Robi/Airtel/BL/Teletalk) + Recharge B2B with manual commission
├── /mfs        Agent cash-in/out (auto commission), Personal send/receive (manual fee), MFS B2B (0%)
├── /products   Catalog, multi-barcode, auto EAN-13, sticker print with/without cipher
├── /services   Quick service slips + repair intake tracker (received → repairing → ready → delivered)
├── /accounts   All balances, Cash⇄Bank, add accounts, PIN-protected balance adjust
├── /khata      Customer due ledger, one-tap collection
├── /closing    Note counting, expected vs counted, shift close
├── /monitor    Owner-only live device presence, activity log and invoice voids
├── /cloud      Email auth, online shop creation/joining, profile and private avatar
└── /settings   Owner-only permission switchboard, PINs, cipher preview
```

## Data model (`src/lib/store.ts`)
`State.demoMode` is a device-local flag. `src/lib/demo.ts` seeds a fresh non-persisted store through normal ledger actions and then installs its serializable data locally. Demo snapshots cannot cross `shopSnapshot`; Cloud upload/join/open, sync queues, retries and realtime refresh are blocked. The Cloud page does not mount account/auth requests in demo mode. A connection epoch also discards remote responses arriving after disconnect/reset. Demo reset clears only app-owned storage, not unrelated origin data or remote shops.

| Entity | Key fields |
|---|---|
| Account | id, name, kind (`cash`/`bank`/`mfs_agent`/`mfs_personal`/`recharge`), provider, balance |
| Product | id, name, barcodes[], cost, price, stock, lowStock |
| Sale | items[], total, cost, payments[{accountId \| "due", amount}], customerId, by |
| Txn (ledger) | type, title, amount, profit, cat (`product`/`mfs`/`recharge`/`service`/`none`), by, ref, moves[{accountId, delta}] |
| Customer | name, phone, due |
| Repair | customer, phone, device, problem, estimate, advance, status |
| Closing | expected, counted, diff, profit |
| Perms | viewCost, viewProfit, viewBank, editSales, manageProducts, b2b |

Every money movement goes through `post()` which writes one `Txn` and applies its `moves` to balances — the ledger is the single source of truth for profit and audit. `post()` validates every target account and rejects any movement that would make an account negative. Store actions validate before changing related entities, so a rejected sale cannot partially reduce stock or create a customer due.

## Business rules
- **Sale safeguards**: cart quantities must be positive integers and cannot exceed stock. Payments must equal the bill to within ৳0.01, payment accounts must exist, and recharge SIMs cannot receive retail payments.
- **Due safeguards**: a due sale requires a customer name. Collection cannot exceed outstanding due. A due invoice cannot be voided after its due has been collected.
- **Permissions**: every privileged store action re-checks the current role; hiding a button is not the permission boundary. Product changes/deletions require `manageProducts`, invoice voids require `editSales`, and B2B requires `b2b`. Account creation, permission changes and PIN changes are owner-only.
- **Product history**: a product referenced by an invoice cannot be deleted; set its stock to zero instead. Barcodes must be unique across products.
- **Agent commission** = amount / 1000 × rate (bKash 3.70, Nagad/Rocket/Upay 4.00). Credited to the agent wallet and to profit (`cat: mfs`).
- **Cash-in**: cash +amount, wallet −amount. **Cash-out**: reverse.
- **Personal send**: cash +(amount+fee), wallet −amount. **Receive**: wallet +amount, cash −amount+fee. Fee = profit.
- **SR B2B (separate from customers)**: exactly four legs in both forms: SIM −amount / cash +amount; bank −amount / SIM +amount; bank −amount / cash +amount; cash −amount / SIM +amount. SIM means MFS agent for MFS, recharge SIM for recharge. SIM-to-bank, cash-to-cash, personal wallets and cross-kind SIMs are rejected before posting.
- **B2B commission**: MFS always 0. Recharge bank-to-SIM and cash-to-SIM add manual commission/extra balance to the SIM and profit; cash-receipt legs have no extra balance or profit. Reference and `b2b` permission remain required. One `post()` records each SR settlement without creating customer records.
- **Legacy queued B2B**: old bank-to-SIM and cash-to-SIM `load` payloads remain compatible; legacy `return` payloads are rejected, never silently reinterpreted in the durable outbox.
- **Recharge sale**: SIM −amount, cash +amount.
- **Sale**: stock −qty, paid accounts +amount, due → customer ledger; profit = total − cost. Void reverses all.
- **Repairs**: advance and first delivery balance are service income. `deliveryCollected` prevents charging the balance again if a delivered repair is moved back to ready and delivered again. Advance cannot exceed the estimate.
- **B2B audit**: a check/slip/TrxID reference is required before a B2B transaction can post.
- **Cipher**: DHAKACITY, digit n → nth letter, 0 → X (150 = DAX).
- **Roles**: owner has all permissions; cashier only what the owner toggles.
- **Day close**: counted − expected cash; a non-zero diff is posted as an adjustment.

## Storage and Cloud synchronization
The app uses a hybrid model: zustand `persist` (`mohra-pos-v1`) is the immediate device cache, while an authenticated Cloud shop is authoritative once connected.

### Supabase tables
| Table | Purpose |
|---|---|
| `profiles` | Display name, private avatar path and preferences for each auth user |
| `shops` | Shop name and owner |
| `shop_members` | Owner/cashier membership; roles never live in editable profile metadata |
| `shop_invites` | UUID joining code, visible only to the owner |
| `shop_states` | Versioned JSON snapshot of the complete business store |
| `shop_action_receipts` | Committed action UUIDs and resulting versions for idempotent retries |

The `avatars` storage bucket is private; signed URLs expire and storage policies restrict each user to their own folder. Raw `shop_states` rows are owner-readable only. Cashiers receive a field-filtered snapshot through a server function, never direct table access.

### Action flow
1. The browser executes the normal store action immediately and emits `mohra:cloud-action` for an allow-listed business action.
2. `src/lib/cloud-sync.ts` serializes actions and sends the shop ID, last known version and action arguments to `applyCloudAction`.
3. `src/lib/cloud.functions.ts` re-validates the bearer user and membership, loads the authoritative snapshot, and executes the same `shopStoreCreator` action through `src/lib/cloud-action.ts` with the server-side role. Product price/cost therefore come from the authoritative catalog, not the browser payload.
4. A conditional `version = baseVersion` write increments the version. A stale write returns the latest version instead of overwriting another device's work; the client automatically retries the same action UUID against that version.
5. If the replay violates a business rule (for example, another device sold the last item), the server returns a final rejection without committing. The client removes only that action, restores the authoritative snapshot, notifies the user, and continues with later queued actions. Network failures remain queued for retry.
6. Owners receive Realtime version updates; cashiers poll every 15 seconds. The saved shop ID and version let a sale made immediately after a page reload wait for Cloud instead of being dropped.
7. `src/lib/cloud-presence.ts` and the `shop-presence-{shopId}` Realtime channel track owner/cashier devices per browser tab. The monitor shows role, mobile/desktop type, a short device ID and whether it is the current device. Presence carries no PIN, balance or customer data and is never used for authorization.

`stateForRole` (`src/lib/cloud-view.ts`) removes the owner PIN and applies cost, profit and bank visibility before cashier data leaves the server. Permission changes use the same versioned action path, so owner switches propagate to other devices. Internal SECURITY DEFINER helpers are not callable by PUBLIC, anon or authenticated roles; only service_role retains access. The automatic-RLS event trigger remains enabled.

### Durable offline outbox and idempotency
Every browser action receives a UUID and is stored in a per-shop localStorage outbox before network submission. A failed or offline write leaves the action in order; the `online` event, periodic refresh and Cloud page retry button resume it. Remote refreshes never replace local state while that shop has unacknowledged actions.

`shop_action_receipts` records each committed `(shop_id, action_id)` with its resulting version. The private `commit_cloud_action` SQL function updates the shop snapshot and writes the receipt in one transaction. Repeating an action ID therefore returns the original acknowledgement without posting another ledger transaction. Receipts are service-role-only and inaccessible to browser roles. After the outbox drains, the app fetches the authoritative snapshot once to reconcile the complete batch.
