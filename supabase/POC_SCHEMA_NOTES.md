# POC schema notes / local runbook (dba, 2026-11-15)

Status of Slice 1: **schema authored, statically verified — NOT yet applied to a
running local Supabase.** In the `dba` subagent session the `shell` tool was
blocked by the orchestrator's permission policy, so no `supabase`/`psql`/`tsc`
command could run. `packages/shared/src/db/database.types.ts` is therefore still
the hand-authored stand-in (it already matches this schema exactly). The commands
below are the human / `dev` steps to apply, validate, and regenerate everything.

> Web-order delivery to the Loyverse KDS remains **unvalidated** until human test
> H2 is recorded in `docs/adr/0001-loyverse-kds-and-custom-kitchen-screen-poc.md`.
> The gate stays **CLOSED** until human H1–H8 device tests are recorded.
> Cost figures in `plan.md` are budget estimates (18 MXN/USD), not quotes.

## Files in this slice

| File | Role |
| ---- | ---- |
| `supabase/migrations/20261115120000_poc_loyverse_kitchen_schema.sql` | 5 tables, 5 enums, `set_updated_at()` + 5 triggers, indexes, RLS on all 5 (no policies) |
| `supabase/seed.sql` | 3 `loyverse_item_mappings` rows with **placeholder** variant UUIDs (REPLACE) |
| `packages/shared/src/db/database.types.ts` | generated-types stand-in; **verified** to match the migration shape exactly |
| `supabase/POC_SCHEMA_NOTES.md` | this runbook |

Not a data-loss migration: purely additive (the `00000000000000_init.sql` baseline
is empty). No `DROP`, no column rewrite, no bulk delete. Migrations are
forward-only; fix a bad applied migration with a NEW file, never by editing this
one. Production application is a CI step from these files — a human should confirm
CI applied it cleanly. Never run `--linked` or `--db-url`.

## Run locally (from repo root)

```bash
supabase start                       # local stack; DB on 127.0.0.1:54322
supabase migration list --local      # confirm baseline + this migration pending/applied
supabase db reset                    # applies ALL migrations + seed.sql from scratch
supabase db lint                     # if supported by your CLI version
```

`supabase db reset` is destructive **to local data only** — it is the correct
validation here. Direct introspection (local default URL from `config.toml`, not a
secret):

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\dt public.*"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\d+ public.orders"
```

### Verification queries

```sql
-- 5 tables, RLS enabled on every one
SELECT relname, relrowsecurity
FROM pg_class
WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
ORDER BY relname;

-- 5 enum types
SELECT t.typname, string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typnamespace = 'public'::regnamespace
GROUP BY t.typname ORDER BY t.typname;

-- RLS defense-in-depth proof: anon/authenticated get zero rows (no policies)
SET ROLE anon;
SELECT count(*) AS visible_orders FROM public.orders;   -- expect 0
RESET ROLE;

-- seed rows (3), with the placeholder UUIDs
SELECT menu_item_id, loyverse_variant_id, reference_variant_id
FROM public.loyverse_item_mappings ORDER BY menu_item_id;
```

Regenerate the types (this REPLACES the hand-authored stand-in) and rebuild the
shared package so `dist/` stops masking anything:

```bash
supabase gen types typescript --local > packages/shared/src/db/database.types.ts
rm -rf packages/shared/dist apps/api/dist
npm run build -w @restaurant/shared      # or: npm run build  (shared + api)
npm run typecheck                        # sanity: shared + api compile
```

`apps/api/dist` and `packages/shared/dist` are stale compiled artifacts in this
checkout. They were verified to be a byte-for-byte compiled copy of the current
`database.types.ts` shape (so no type drift), but they must be removed/rebuilt by
`dev` before wiring modules — see `docs/adr/0001` §Scaffolding notes, step 2.

## Static verification performed by dba (no CLI available)

Cross-checked the migration against `database.types.ts` and `apps/api`:

- Every `Row` column exists with the right nullability; every `Insert`-optional
  column has a DB default (`id`, `kitchen_state='nuevo'`, `sync_status='pending'`,
  `quantity=1`, `attempts=0`, `processed=false`, `type='create_receipt'`,
  `status='pending'`, `next_retry_at=now()`, both timestamps `now()`).
- Enum value sets match `packages/shared/src/domain/enums.ts` exactly.
- FK names match generated `Relationships`: `order_items_order_id_fkey`,
  `outbox_jobs_order_id_fkey`, both `ON DELETE CASCADE`, `isOneToOne: false`.
- `Functions.set_updated_at` present; `Views`/`CompositeTypes` empty.
- CHECKs: `total_centavos >= 0`, `quantity > 0`, `unit_price_centavos >= 0`.
- `UNIQUE`: `loyverse_webhook_events.receipt_number` (H8 dedupe),
  `loyverse_item_mappings.menu_item_id`, partial unique
  `orders.loyverse_receipt_number` (WHERE NOT NULL).
- Required index `outbox_jobs (status, next_retry_at)` present, plus FK indexes.
- RLS enabled on all 5 with no policies (service role bypasses).

## Seed placeholders — human tester

The 3 `loyverse_item_mappings` rows use fake all-zeros UUIDs. **REPLACE** every
`loyverse_variant_id` / `reference_variant_id` with real variant ids from the
Loyverse **TEST account** before H1. Do not use production IDs. Test receipts
affect reports/inventory — after H1–H8, void/refund them in the test account.
No `orders` rows are seeded (that would generate real test receipts via outbox).

## Caveats to preserve

- Own-screen KDS premise (API receipts do NOT reach Loyverse KDS) unvalidated
  until H2 with device evidence in the ADR.
- Cost numbers in `plan.md` are budget estimates (18 MXN/USD), not quotes.
- Gate is CLOSED; this slice implements the harness only, not the GO decision.
