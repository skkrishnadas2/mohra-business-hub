# Fund display and business position audit — 2026-11-17

## Observed cause

Read-only inspection of the owner's authoritative snapshot (version 87) found five MFS/recharge accounts with zero recorded balances and numeric account names. Provider identities were retained. No bank account was registered. The old add-account form accepted a name/provider but hardcoded the opening balance to zero; it deferred balance entry to a separate adjustment dialog. Therefore the screenshot's zero amounts reflect stored balances, rather than a currency-rendering failure. This flow made entering an amount as an account name too easy.

The owner explicitly requested that existing names and balances remain unchanged. No production financial record was changed during this fix.

## Changes

- New-account form separates the account name from a required, explicitly entered opening balance. Zero is accepted; blank, invalid, negative and unsafe amounts are rejected. Bengali digits are supported. Numeric names show guidance without being prohibited. The existing audited opening voucher records the amount without profit.
- Dashboard distinguishes an absent account category from an existing account with zero balance, offers individual account breakdowns, and displays provider/type alongside ambiguous names. Closed accounts with recorded balances remain in totals.
- Owner-only business-position panel separates recorded liquid/provider balances, stock at current recorded cost, remaining customer/party receivables, earned uncollected commission, active repair WIP and unrecovered legacy SR principal. It subtracts remaining payables and active deferred repair advances. Debt collections and transfers do not create equity or profit.
- Explicit capital contributions and owner drawings are shown separately. They exclude opening balances and trading profit. Net assets are not labelled as today's income or spendable cash.
- Opening guide explains the revised workflow.

## Scope and limitations

These are recorded book amounts; no live bank, MFS or recharge-provider reconciliation is implied. Unrecorded fixtures, equipment, debts and missing opening balances are outside the total. Legacy repairs retain their historical advance-income convention and receive an on-screen note. Cashiers cannot see the owner-only position panel.

Regression tests exercise actual opening-ledger writes, invalid input, missing-vs-zero display, cashier privacy, debt collection, purchase liabilities, repair delivery, deferred commission collection, legacy SR partial receipt and immutable calculation. Production validation uses read-only health/build checks; authenticated visual acceptance remains unverified.
