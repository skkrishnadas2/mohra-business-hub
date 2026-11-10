# Live device monitor

- [x] Track Cloud-connected owner and cashier devices with Realtime Presence
- [x] Show online device type, role and current-device status in the owner monitor
- [x] Test presence summaries and all existing shop rules
- [x] Document that presence is informational, never an authorization boundary

Verified in-browser: local monitor empty state. Live two-account Realtime verification remains blocked by the sandbox's external unmanaged auth status.

## Hosted preview recovery

- [x] Diagnose hosted runtime failure without changing shop features or design
- [x] Apply single-bundle server packaging correction; compiler checks and 44 tests pass
- [ ] Verify hosted preview at / and /recharge without publishing — blocked until hosting builds the updated saved version; unauthenticated external requests return hosting 401
- [x] Check deployment and publishing status: previous hosted build succeeded but crashed at runtime; project is not published, and tools do not expose the dialog's disabled-button reason

Local browser verification: / and /recharge both return 200 with no page errors. This does not verify the hosted runtime correction.
