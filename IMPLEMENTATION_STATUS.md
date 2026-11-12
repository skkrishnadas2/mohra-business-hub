# 2026-11-12 — Ready-to-use store and device controls

Added automatic owner-only blank store preparation, server-verified owner balance adjustments with mandatory reasons, local sign-out instead of online PIN switching, audited cashier access suspension/reactivation, and protection against clearing online accounting history. Staff access uses the same snapshot version lock as money actions, so stale requests cannot commit across a suspension. Active staff shifts and unresolved approvals must be settled first.

First owner connection preserves existing device history before Cloud adoption. An untouched blank ledger can accept a validated import with a durable action identity; an established Cloud ledger is never replaced. The device backup stays downloadable from Store & Team. Empty caches do not manufacture recovery vouchers.

Store & Team includes isolated A4/58mm label and 58/80mm receipt diagnostics plus camera decoding checks. Manual entry is explicitly distinguished from camera success; opening a print dialog is not claimed as proof of physical printing. These diagnostics create no financial entries.

Validation: 195 automated tests pass, including first sign-in preparation, existing-device migration failures and retries, owner/cashier permissions, disabled-staff rejection, audited balance corrections, reset protection, diagnostics and request protocol handling. TypeScript and the production build pass. Browser clients send protocol revision 2; older clients must refresh before reading or changing the prepared store.

Actual cash, bank balances, product/SIM quantities, cashier identities and provider credentials are never invented. External bank/MFS/recharge execution still requires a provider integration; the business application records completed services and settlements. Physical hardware and recovery-email delivery are not claimed as remotely verified.

# 2026-11-12 — Employee controls and transaction completion

Added verified employee and shift audit, one active cash drawer shift, owner-approved cash variance, cashier credit/discount caps and party limits, one-time approval requests, discounted partial sale refunds after due collection, serialized SIM/ICCID inventory and sale/return binding, confirmed-success handling across financial forms, pending duplicate protection and atomic rollback of rejected local actions. Historical records are retained without fabricated employee IDs.

Validation: 173 tests passing; TypeScript, production build and automated tests including authoritative replay, identity forgery, shift overlap, approval replay, cash-count freshness, credit limits, refund rounding, serial intake and returns, and server acknowledgement timeout/rejection.

Device acceptance remains: actual owner/cashier sign-in on two shop devices, physical camera scan, physical A4/thermal printing and recovery-email delivery. No actual provider API is configured for external recharge or bank/MFS transfers; these remain completed-service ledger entries. No production transactions or staff accounts were created for testing.
