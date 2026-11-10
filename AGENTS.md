<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

- All money movements must go through the store's ledger `post()` (src/lib/store.ts) so balances and profit stay auditable; pure rules live in src/lib/rules.ts.
- Validate principal debits before fees/commission credits, compare retail payments in integer paisa, and validate ledger movements before related entity updates so rejected actions cannot partially mutate shop data.
- Device-local zustand is the offline cache; authenticated Cloud shop snapshots are authoritative for shared actions, with server-side role checks and optimistic versions preventing stale overwrites. Per-shop durable outboxes retry UUID-identified actions, and server-side receipts must make every retry idempotent.
- Keep the Nitro server bundle as one file (inlineDynamicImports set both top-level and in rollupConfig.output, because the cloudflare-module preset overrides the top-level flag) so split dependency chunks cannot cycle on the CommonJS runtime helper and crash Worker startup.
- The browser Supabase client is environment-configurable despite its original generated provenance; preserve preview auth storage, derive public Cloud fallbacks from build-time environment settings (never literal values), and never throw at import when they are missing — fall back to an inert local-only client, because the root route imports it and a throw would 500 every page.
- Keep Wrangler's Worker entry and asset directory aligned with Nitro's cloudflare-module output so self-hosted requests serve both SSR and static files.
- Seed demos through a fresh store's ledger actions, persist the demo flag locally, and block Cloud entry points, outbox dispatch and late remote responses while it is active; reset only app-owned storage so demo verification cannot affect a real shop.
- B2B forms and authoritative replay use the shared pure leg validator with source/target account IDs; reject incompatible legacy directional outbox payloads rather than reversing their intended money movement.
