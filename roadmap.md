## Chip-based setup
- [ ] Replace the long account form with grouped add chips, fixed cash drawer and compact editable rows
- [ ] Record one opening ledger transaction; hide unavailable B2B legs without changing settlement rules
- [ ] Run all tests and verify desktop/mobile setup, duplicate names, balances and downstream account IDs without publishing

## Setup account customization
- [x] Add, rename and delete setup accounts with kind-specific operators and opening balances
- [x] Persist the chosen account list atomically and verify it in B2B, MFS and Accounts
- [x] Add regression tests, run the full suite and verify setup interactions without publishing — 99/99 tests pass; automatic build OK; browser add/delete/rename and downstream account selection verified with no page errors

## Remove synthetic mode
- [x] Remove alternate setup, seed data, badges, reset controls and Cloud restrictions
- [x] Preserve real financial rules and safely upgrade saved shop data
- [x] Run all remaining tests and verify first-run setup in the browser — 94/94 tests pass; automatic build OK; shop name, PINs, opening balances, completion, reload and normal Settings reset verified without page errors

# Live device monitor

## Money-flow hardening and environment cleanup
- [x] Audit monetary actions and add regression tests for validation, commission, ledger integrity and repair limits
- [x] Remove repository .env and verify existing environment-only fallbacks and local-only startup
- [ ] Ignore .env — blocked: platform refuses edits to managed .gitignore; user must add the exclusion in the repository
- [x] Run the full test suite and verify local money flows without design changes or publishing — local money flows and 12 pages pass with no runtime errors or Cloud requests; final test count reported in chat

## B2B SR correction
- [x] Apply the corrected four SR legs, including cash-to-SIM, to both forms and ledger validation without changing other features
- [x] Test all four legs for both account kinds, verify the forms and run the full suite without publishing — 83 tests pass, automatic build OK; eight settlements verified and 700×374 overflow checks pass

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
