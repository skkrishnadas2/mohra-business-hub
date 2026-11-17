# Owner factory reset

Settings now offers an online, owner-only factory reset. It is a feature to be invoked deliberately by the owner; implementation and deployment do not reset the live shop.

## User flow

The 18 November extension adds individual product, customer/party and account checkboxes, search, select-all-eligible and clear-selection controls. The final warning lists the chosen names. Used financial records, nonzero balances/stock and outstanding debt cannot be selectively removed; the reason is visible next to each protected row. Referenced products and contacts remain available to history. Unused zero rows may be removed together after the same password/two-warning flow, with a zero-money cleanup audit entry. Other records and all balances remain unchanged. Both modes freeze the version reviewed at the first warning; any subsequent change requires starting review again.

1. Read the first warning, including which records disappear and the option to download a full backup.
2. Read the final warning, type `RESET`, enter the owner's current login password and press the explicitly destructive button.

Cancel does nothing. Cashiers cannot see or invoke the operation. A local PIN does not authorize online deletion. Pending or corrupt outgoing work blocks reset. A changed server version stops the reset and requires reviewing the current shop again.

## Server behavior

The authenticated Edge handler verifies fixed-shop ownership and membership, independently verifies the current password with Supabase Auth, checks the authenticated user ID against that password's identity, and uses the existing transactional `commit_cloud_action` RPC with an expected version and unique request receipt. No database schema changes are required.

The shop snapshot is replaced with a blank ledger: zero cash, no other accounts, no products/stock, transactions, sales, customers, parties, debts, repairs, purchases, settlements, commissions, closings, shifts or approval history. Operating permissions and limits return to defaults. Login identities, shop membership and suspended staff access remain. No external bank/provider funds are moved.

A unique reset generation is preserved in snapshots and queued actions. The server rejects actions created before that generation, including stale device retries that would otherwise recreate deleted money. Backup restore preserves the current generation. Reset requests and passwords never enter the durable outbox, URLs, store persistence or receipts. Receipts contain IDs/version only and remain for retry safety. Verification uses an isolated Auth client and signs out that temporary verification session.

UI success waits for the authoritative server result. A lost response is shown as an error requiring refresh, rather than automatically retrying deletion. Local financial cart/recovery copies are cleared on adopting a changed reset generation; disconnected devices update when they reconnect. Downloaded backups, service-provider retention/backups and external logs are outside this operational reset and are disclosed before confirmation.

## Validation

HTTP tests execute the production handler against simulated Auth/database I/O: wrong password, wrong identity, forged cashier role, missing confirmation, optimistic conflict, atomic blank-state replacement, suspended staff preservation, idempotent retry after subsequent trading, old queue rejection and valid new-generation trading. UI tests verify the two warnings, cancellation, password clearing, server-confirmed success, duplicate-click prevention, no password persistence and pending-work blocking. No destructive production request is issued for acceptance testing.
