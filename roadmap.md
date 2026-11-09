# Offline-safe Cloud actions

- [ ] Keep unsynced actions in a durable per-shop outbox
- [ ] Make server actions idempotent so retries cannot duplicate money movements
- [ ] Retry automatically on reconnect and show pending/failed sync state
- [ ] Test offline sale recovery, duplicate retry protection and existing business rules
