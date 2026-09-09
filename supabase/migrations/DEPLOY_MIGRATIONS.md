# Deploy Supabase Migrations (RPC fixes)

This project contains SQL migration files that fix RPCs writing invalid enum values. Apply them to your Supabase project to fix the root cause (preferred).

Important files:
- `20260721120000_fix_binary_cancel_status_and_stale_release.sql`
- `20260723090000_fix_settle_trade_status_enum.sql`

Recommended steps (local / CI):

1. Install and login to Supabase CLI (if not installed):

```bash
npm install -g supabase
supabase login
```

2. Confirm target project: set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in your environment (CI secret or local .env).

3. Run migrations from the migrations folder:

```bash
# from workspace root
SUPABASE_URL=<your_url> SUPABASE_SERVICE_ROLE_KEY=<service_role_key> supabase db remote apply supabase/migrations
```

Or run individual SQL files in order:

```bash
supabase db remote apply supabase/migrations/20260721120000_fix_binary_cancel_status_and_stale_release.sql
supabase db remote apply supabase/migrations/20260723090000_fix_settle_trade_status_enum.sql
```

4. After applying, clear Postgres schema cache (if required) by restarting services that rely on function cache, or run any supplied `repair_rpc_permissions_and_schema_cache` migration present.

5. (Optional) Regenerate TypeScript types for Supabase if you use generated types:

```bash
# example using supabase-js generator (adjust command to your workflow)
npx supabase gen types typescript --project-id <project-ref> --schema public > src/integrations/supabase/types.generated.ts
```

6. Redeploy your server so server-side `supabaseAdmin` uses the updated functions.

Notes:
- Do NOT run migrations without a backup in production.
- If you need me to apply these for you, provide `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or run the commands locally). I will not request secrets here; run commands locally or in CI.
