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
├── /monitor    Owner-only live activity log, void invoices
└── /settings   Owner-only permission switchboard, PINs, cipher preview
```

## Data model (`src/lib/store.ts`)
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
- **MFS B2B**: source (cash/bank) −amount, agent +amount, commission always 0.
- **Recharge B2B**: source −amount, SIM +(amount+manual commission); commission = profit.
- **Recharge sale**: SIM −amount, cash +amount.
- **Sale**: stock −qty, paid accounts +amount, due → customer ledger; profit = total − cost. Void reverses all.
- **Repairs**: advance and first delivery balance are service income. `deliveryCollected` prevents charging the balance again if a delivered repair is moved back to ready and delivered again. Advance cannot exceed the estimate.
- **B2B audit**: a check/slip/TrxID reference is required before a B2B transaction can post.
- **Cipher**: DHAKACITY, digit n → nth letter, 0 → X (150 = DAX).
- **Roles**: owner has all permissions; cashier only what the owner toggles.
- **Day close**: counted − expected cash; a non-zero diff is posted as an adjustment.

## Storage
Currently device-local (localStorage via zustand `persist`, key `mohra-pos-v1`). Owner monitor reflects this device. Moving to Lovable Cloud (Postgres) maps each entity above to a table with the `Txn` ledger as an append-only table, enabling true remote multi-device monitoring.
