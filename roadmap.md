# Live device monitor

## External hosting preparation

- [x] Make browser Supabase configuration environment-based with environment-only Cloud fallbacks
- [x] Add Wrangler configuration matching Nitro Worker output
- [x] Run the complete test suite and check automatic build results without publishing — 46 tests pass; automatic build reports build OK

- [x] Track Cloud-connected owner and cashier devices with Realtime Presence
- [x] Show online device type, role and current-device status in the owner monitor
- [x] Test presence summaries and all existing shop rules
- [x] Document that presence is informational, never an authorization boundary

Verified in-browser: local monitor empty state. Live two-account Realtime verification remains blocked by the sandbox's external unmanaged auth status.

## Hosted preview recovery

- [x] Diagnose hosted runtime failure without changing shop features or design
- [x] Apply single-bundle server packaging correction; compiler checks and 44 tests pass
- [ ] Verify authenticated hosted preview at / and /recharge without publishing — direct browser checks of both requested hosts reach the Lovable access/login screen, so successful shop rendering remains unverified
- [x] Check deployment and publishing status: previous hosted build succeeded but crashed at runtime; project is not published, and tools do not expose the dialog's disabled-button reason

Local browser verification: / and /recharge both return 200 with no page errors. This does not verify the hosted runtime correction.

2026-11-10 hosted recheck: build status reports latest saved commit and hosted preview both at `942cfb11eb02386e8254f359c12edab4f06b7f8a`, in sync; build `br_5d6357a8-808e-4e32-9571-d8cbcba84635` succeeded at 05:29:52 UTC with no compiler diagnostics. The earlier assumption that hosting was waiting for a rebuild was incorrect. Preview runtime logs at 05:34 UTC show this same commit returning 500 on the slug host at both / and /recharge with `TypeError: __commonJSMin is not a function` in the split react-compose-refs dependency. The existing inlineDynamicImports setting has not resolved the hosted runtime failure. Fresh unauthenticated browser checks at both hosts and both paths redirect to Lovable's access/login screen, not the shop; these are not successful route checks. No application code, features, design, or publication changed during this diagnostic recheck.

2026-11-10 root cause: the cloudflare-module preset's `rollupConfig.output.inlineDynamicImports: false` overrode the top-level flag, so dependencies stayed split into `_libs/*` chunks that import `__commonJSMin` from an `_ssr` chunk in a circular order. Fixed by also setting it in `rollupConfig.output`; server now builds as a single `index.mjs` and returns 200 at / and /recharge in local workerd. Hosted check pending the next preview build.
