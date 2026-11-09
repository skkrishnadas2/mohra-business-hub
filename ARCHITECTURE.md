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

Every money movement goes through `post()` which writes one `Txn` and applies its `moves` to balances — the ledger is the single source of truth for profit and audit.

## Business rules
- **Agent commission** = amount / 1000 × rate (bKash 3.70, Nagad/Rocket/Upay 4.00). Credited to the agent wallet and to profit (`cat: mfs`).
- **Cash-in**: cash +amount, wallet −amount. **Cash-out**: reverse.
- **Personal send**: cash +(amount+fee), wallet −amount. **Receive**: wallet +amount, cash −amount+fee. Fee = profit.
- **MFS B2B**: source (cash/bank) −amount, agent +amount, commission always 0.
- **Recharge B2B**: source −amount, SIM +(amount+manual commission); commission = profit.
- **Recharge sale**: SIM −amount, cash +amount.
- **Sale**: stock −qty, paid accounts +amount, due → customer ledger; profit = total − cost. Void reverses all.
- **Repairs**: advance and delivery balance are service income.
- **Cipher**: DHAKACITY, digit n → nth letter, 0 → X (150 = DAX).
- **Roles**: owner has all permissions; cashier only what the owner toggles.
- **Day close**: counted − expected cash; a non-zero diff is posted as an adjustment.

## Storage
Currently device-local (localStorage via zustand `persist`, key `mohra-pos-v1`). Owner monitor reflects this device. Moving to Lovable Cloud (Postgres) maps each entity above to a table with the `Txn` ledger as an append-only table, enabling true remote multi-device monitoring.
