# মোহরা আইটি কেয়ার এন্ড টেলিকম সেন্টার — POS & Telecom Hub

Ultra-clean Bengali POS, mobile recharge, MFS agent hub, IT service & repair tracker for a Bangladeshi telecom shop. Thumb-first on phone (installable to home screen), sidebar layout on desktop.

## Quick start
```sh
bun install
bun run dev
bunx vitest run   # business-rule tests
```
First launch opens the setup wizard: shop name, owner PIN, cashier PIN, and starting balances for cash, banks, MFS wallets and recharge SIMs.

## Where things live
- `src/lib/rules.ts` — pure rules (commission rates, cipher, Bengali number/Taka formatting, barcode generation)
- `src/lib/store.ts` — all state and money-moving actions (ledger)
- `src/lib/cloud-sync.ts` — online shop connection, serialized actions and remote refresh
- `src/lib/cloud.functions.ts` — authenticated server actions and version conflict protection
- `src/lib/cloud-view.ts` — server-side cashier field permissions
- `src/lib/print.ts` — thermal receipt and barcode sticker printing
- `src/components/` — AppShell (nav + PIN lock), Setup wizard, shared UI kit, B2B form
- `src/routes/` — one file per screen

See **ARCHITECTURE.md** for the full mind map, data model and business rules.
