# MOHRA software audit and release roadmap

Audit date: 13 November 2026 (Bangladesh). Scope: one existing shop, its browser application, shared accounting engine, authenticated API, reports and PDF exports.

## Plan and responsibilities

The review covered six areas, using parallel implementation and independent follow-up review:

1. Financial engine: sale, return, stock valuation, purchase, recharge, MFS, repair and journals.
2. Daily reporting: sales, profit, cash movements, new credit, collections, current receivables/payables and Bangladesh dates.
3. Beginner workflows: explicit monetary input, safe defaults, repair/service payment previews and understandable Bengali wording.
4. Synchronization and recovery: exact receipts, retries, concurrent devices, damaged browser storage and failed durable writes.
5. Permissions and infrastructure: cashier payloads, server authorization, database RLS and hosted advisories.
6. Release acceptance: realistic isolated business-day scenarios, midnight reversals, UI regression tests, production build and hosted verification.

No synthetic sales, users or transactions were posted into the real shop. The hosted read-only snapshot check found one shop, version 2, with no recorded sales or vouchers. This is a code/scenario audit, not reconciliation against an established real trading day.

## Fixed issues

| Problem                                                                                    | Result                                                                                                                                 |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Cancelling/returning old stock after buying at a new cost left unit cost unchanged         | Original returned cost is included in the current weighted average; subsequent sales use the corrected cost                            |
| A purchase return could leave zero items with residual inventory value                     | The inconsistent full return is rejected before any mutation                                                                           |
| Voiding a sale later rewrote historical sales totals                                       | Sales and reversals are counted on their event dates                                                                                   |
| Dashboard mixed sales, cash and receivables                                                | Separate product sales, net profit, cash in/out, new credit, collections and current amounts, with explanatory Bengali text            |
| Receipt and direct expense in the same voucher were netted as one cash movement            | Cash in/out counts the positive and negative legs separately                                                                           |
| Current stock/debt figures appeared next to date filters without enough explanation        | Reports identify selected-period activity separately from current balances                                                             |
| Cleared final repair bill became zero                                                      | Empty/invalid values cannot save; explicit zero is still supported                                                                     |
| Service/repair input could reach the engine without a clear payment preview                | Validation, advance limits, remaining bill and cash expense checks appear before saving                                                |
| Malformed pending storage could hide all queued work as an empty queue                     | Valid entries remain discoverable; corruption blocks mutations, replay, remote replacement and final PDF export                        |
| Browser quota failures could occur inside an event listener after local accounting changed | Pending action is saved synchronously before publishing it; failure restores the local pre-action state and reports an immediate error |
| Nested cashier data retained private returns, explicit commission and cost-only amounts    | Private sale/refund records and disallowed explicit fields are removed/redacted server-side                                            |

The previous Bengali PDF fix remains: compatible Hind Siliguri fonts, stable public font paths, versioned font requests and a real PDF regression test.

## Meaning of the numbers

- Product sales: product invoices minus product returns/cancellations in the selected period. Recharge/MFS principal is not product sales.
- Net profit: recorded product/service margin and commissions less recorded business expenses and reversals. Borrowing, capital, transfers and due collections are not new profit.
- Cash in/out: physical cash legs during the period, including transfers, collection, capital, refunds and expenses; excludes initial balances and administrative corrections. This is different from profit.
- New sale/recharge credit: the unpaid portion created in that period. It is different from all outstanding customer debt.
- Collections: money collected against receivables during the period, including old debt. Financial-party collections can include loans/advances; the UI labels them as collections, not sales income.
- Current receivable/payable: all currently outstanding amounts across dates. Opposite sides are kept separate.
- Cashier totals are limited by visible accounts. Values that cannot be derived safely from redacted journals/bank legs are suppressed or explicitly narrowed to product sales.

## Worked acceptance example

An isolated ledger starts with cash 1,000 and a product cost of 60 per item:

| Step                                     |  Cash | Net product sales | Net profit | New credit | Outstanding customer due |
| ---------------------------------------- | ----: | ----------------: | ---------: | ---------: | -----------------------: |
| Sell one for 100 cash                    | 1,100 |               100 |         40 |          0 |                        0 |
| Sell another for 100 on credit           | 1,100 |               200 |         80 |        100 |                      100 |
| Collect 40                               | 1,140 |               200 |         80 |        100 |                       60 |
| Return the first cash sale               | 1,040 |               100 |         40 |        100 |                       60 |
| Service receipt 100, cash direct cost 20 | 1,120 |               100 |        120 |        100 |                       60 |

The final day's cash in is 240 and cash out is 120. Every generated voucher balances in integer paisa. A separate midnight scenario verifies that tomorrow's refund does not erase yesterday's sale/profit.

## Checks and evidence

- Passed: TypeScript typecheck; 337 browser/business tests across 46 files; 16 production API/PWA/PDF tests (353 total); production build checked separately before release.
- New regression files: inventory-valuation-audit, daily-summary, daily-acceptance-audit and cloud-view-nested; expanded outbox/sync, navigation, stock/services and PDF tests.
- Hosted Supabase: six public tables have RLS enabled; raw shop state is owner-readable, action receipts are server-only and membership reads are restricted to the authenticated user.
- Existing API verifies user identity, shop membership, disabled staff, protocol version, receipt idempotency and optimistic write version. Existing verify_jwt=false configuration is retained because the function authenticates bearer tokens explicitly with Auth.
- No database schema change is part of this release.

## Roadmap and limits

### Completed in this release

Accounting corrections, daily metric separation, novice repair/service validation, durable-write failure handling, nested cashier redaction, and automated acceptance scenarios.

### Shop-device acceptance still needed

Live signed-in browser inspection was declined by the browser permission gate, so no visual/device acceptance is claimed. On shop devices, check phone card wrapping, Bengali PDF printout, real barcode camera decoding, printer paper alignment, owner/cashier sign-in and two-device receipt refresh. Use an isolated test ledger for demonstration transactions; do not mix synthetic entries with real books.

### Optional next maintenance

- Supabase flags leaked-password protection disabled. Confirm plan availability and Auth settings before changing it.
- One membership foreign key lacks a covering index; seven RLS policies can use init-plan evaluation for better scaling. These are follow-up database recommendations, not evidence of wrong current balances. Repository policy delegates schema changes to Lovable, so they were not applied directly.
- Snapshot storage and free-tier quotas remain finite; sustained real volume needs measured load testing and a planned relational-data migration when warranted.
- Permissions hide explicit fields; supplier bills, debt amounts and permitted account movements may still let a knowledgeable cashier infer related margin. They are not a guarantee of absolute financial secrecy.
- Browser storage corruption needs recovery assistance; the application preserves it and blocks new work rather than silently deleting uncertain financial actions.
- Existing historical valuation errors are not rewritten automatically. Any adjustment to an established real ledger needs reconciliation with actual stock and an audited owner adjustment.
