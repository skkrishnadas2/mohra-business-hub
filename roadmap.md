# Safe multi-device selling

- [x] Reproduce simultaneous-sale conflict with two authoritative action replays
- [x] Reject invalid replayed actions without blocking the remaining outbox
- [x] Restore the authoritative shop state after a rejected optimistic action
- [x] Verify stock protection, same-ID retries, network failures and business-rule tests

Live two-account browser verification remains environment-dependent: this sandbox reports an external unmanaged Supabase session.
