# Offline-safe Cloud actions

- [x] Keep unsynced actions in a durable per-shop outbox
- [x] Make server actions idempotent so retries cannot duplicate money movements
- [x] Retry automatically on reconnect and show pending/failed sync state
- [x] Test offline sale recovery, duplicate retry protection and existing business rules
