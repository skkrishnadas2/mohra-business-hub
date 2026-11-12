# 2026-11-12 — Employee controls and transaction completion

Added verified employee and shift audit, one active cash drawer shift, owner-approved cash variance, cashier credit/discount caps and party limits, one-time approval requests, discounted partial sale refunds after due collection, serialized SIM/ICCID inventory and sale/return binding, confirmed-success handling across financial forms, pending duplicate protection and atomic rollback of rejected local actions. Historical records are retained without fabricated employee IDs.

Validation: 173 tests passing; TypeScript, production build and automated tests including authoritative replay, identity forgery, shift overlap, approval replay, cash-count freshness, credit limits, refund rounding, serial intake and returns, and server acknowledgement timeout/rejection.

Device acceptance remains: actual owner/cashier sign-in on two shop devices, physical camera scan, physical A4/thermal printing and recovery-email delivery. No actual provider API is configured for external recharge or bank/MFS transfers; these remain completed-service ledger entries. No production transactions or staff accounts were created for testing.
