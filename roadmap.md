# Live device monitor

## Money-flow hardening and environment cleanup
- [ ] Audit monetary actions and add regression tests for validation, commission, ledger integrity and repair limits
- [ ] Remove repository .env, ignore environment files and verify environment-only fallbacks and local-only startup
- [ ] Run the full test suite and verify local money flows without design changes or publishing

## B2B SR correction
- [x] Apply the corrected four SR legs, including cash-to-SIM, to both forms and ledger validation without changing other features
- [x] Test all four legs for both account kinds, verify the forms and run the full suite without publishing — 83 tests pass, automatic build OK; eight demo settlements verified and 700×374 overflow checks pass

## Local demo verification

- [x] Add ledger-seeded local demo with owner/cashier PINs and visible badge
- [x] Block all demo Cloud sync and provide confirmed local reset
- [x] Improve selected-button contrast, mobile active tabs, recharge balances and accessible closing action
- [x] Verify all 12 pages and demo sale/recharge/MFS/service/closing/reset flows; run full tests — 53 tests pass; desktop, 700×374 and 390×844 checks pass with no page errors or Cloud calls. Confirmed cancel/reset and first-run state after reload. This local verification does not establish hosted preview access or live Cloud authentication.

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

2026-11-10 env risk: `.env` is git-ignored, so GitHub-driven Cloudflare builds get no Supabase public settings unless set in the Cloudflare build environment; the client threw at import and would 500 every page. Client now falls back to an inert local-only client (`isCloudConfigured=false`). Verified a settings-free build returns 200 at /, /recharge, /cloud in local workerd with the setup screen and no page errors.
