# POC runbook — local run + tablet test (plan.md §9)

Status: harness built, security-cleared (code-review CLEAR, 0 High). **Gate CLOSED** — web-order delivery to Loyverse KDS is **unvalidated** until human test H2 is recorded with real-device evidence in `docs/adr/0001-loyverse-poc-and-kitchen-screen.md`.

> Test account only. Never production keys, never production ids. Test receipts affect reports/inventory — void them after the run.

## 1. Prerequisites (names only — never values)

Node >= 20 (`nvm use`), Docker (for the local Supabase stack), a Loyverse **test account** (no sandbox exists), and env vars per `docs/POC_ENV.md`: `NODE_ENV`, `PAYMENT_MODE=mock`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LOYVERSE_ACCESS_TOKEN`, `LOYVERSE_STORE_ID`, `LOYVERSE_PAYMENT_TYPE_ID`, `LOYVERSE_WEBHOOK_TOKEN`, `KITCHEN_PIN`. Web: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_PAYMENT_MODE` (public UI-only flag; never `NEXT_PUBLIC_KITCHEN_PIN`). Not used in POC: `STRIPE_*`, `RESEND_*`, `LOYVERSE_WEBHOOK_SECRET`.

## 2. Local run (from repo root)

```bash
supabase start                       # local stack; DB on 127.0.0.1:54322
supabase migration list --local      # baseline + 20261115120000 pending/applied
supabase db reset                    # applies migrations + seed.sql (LOCAL DATA ONLY)
supabase db lint                     # if your CLI version supports it
supabase gen types typescript --local > packages/shared/src/db/database.types.ts
npm ci && npm run build && npm run typecheck && npm test   # expect 133 pass (dev handoff)
npm run start:prod -w @restaurant/api
curl http://localhost:3000/health    # -> { "status": "ok" }
```

Before H1: **REPLACE** the 3 placeholder variant UUIDs in `supabase/seed.sql` with real variant ids from the Loyverse **test account** (dev uses a static pricelist; the DB mapping is for the tester + future use). `supabase db reset` is destructive to **local data only**.

## 3. Webhook (needs a public URL)

Loyverse webhooks require HTTPS: use a Render test service or a temporary tunnel, then register `POST <public>/loyverse/webhooks/receipts?token=<LOYVERSE_WEBHOOK_TOKEN>` (or `X-Webhook-Token` header). Raw bodies log with `POC_EVIDENCE` **only** in `NODE_ENV=development` — attach the H3 excerpt as evidence; remove before go-live.

## 4. Flows to exercise

- **A (web):** `POST /orders` with cart → mock charge → card appears on `/cocina` with origin `web`; receipt created in back office (H1).
- **B (POS):** ring a sale in the POS → card with origin `pos` via webhook and/or poller; note path + latency (H3).
- **C (kitchen):** advance `nuevo → en_preparacion → listo → entregado` from the tablet (H4/H5 check: modifiers, notes, dining option, timestamps all visible?).
- **D (Loyverse down):** invalidate the token → web order still lands in kitchen → restore → receipt created exactly once (H6/H8).

Full hooks per hypothesis: `docs/POC_TEST_HOOKS.md`. Record PASS/FAIL + evidence in the ADR.

## 5. Tablet test steps (`/cocina`)

1. Open `/cocina` on a real tablet (Android/iPad), keep the screen on (wake-lock sentinel assists; do not rely on it alone).
2. Enter the `KITCHEN_PIN` when prompted (in-memory only; reload asks again — expected).
3. Place a web order from another device; confirm the card appears in < 5 s **with sound** (audio unlocks on the PIN-submit tap — if no chime, tap once more and re-test).
4. Confirm columns `nuevo / en_preparacion / listo`, origin badge, elapsed timer, and advance-state buttons.
5. H2: with the Loyverse **KDS device** open beside the tablet, create a web order and **capture photo/video proving the KDS does NOT show it** — the gate-opening evidence.

## 6. When things go wrong

| Symptom | Check | Who |
|---------|-------|-----|
| Web order missing from kitchen | API up? `sync_status` in DB; order row exists? (H6: order must persist even if Loyverse fails) | dev |
| Receipt not in back office | Outbox job status; `OUTBOX_MAX_ATTEMPTS` backoff; token valid? `store_id`/`payment_type_id` correct? | dev |
| POS sale never arrives | Webhook registered with right token? Poller tick (`LOYVERSE_POLL_INTERVAL_MS`)? Note H4 limitation (only-at-charge) | dev + human |
| Duplicates on board | `loyverse_webhook_events.receipt_number` UNIQUE violated? Echo suppression (`source=restaurant-web`) working? | dev |
| No chime on tablet | Audio requires the PIN-submit gesture; iOS silent switch; retry tap | staff/dev |
| Token suspected leaked | Rotate `LOYVERSE_WEBHOOK_TOKEN` + `KITCHEN_PIN` in env, restart API, re-register webhook URL | dev |
| Supabase backup restore | Pro project: dashboard → Backups → point-in-time restore (daily backups, 7-day retention); local: `supabase db reset` re-seeds | dev |

## Appendix — corrected RLS-lockdown note for `dba`

`docs/POC_PROD_RLS_LOCKDOWN.draft.sql` §WHY is **stale**: it claims migration `20261115120000` "adds FIVE PERMISSIVE policies (USING true / WITH CHECK true FOR anon, authenticated)". **That is incorrect — the migration creates NO policies** (RLS enabled, default-deny; verified in `supabase/POC_SCHEMA_NOTES.md`). Writer cannot edit `*.sql` (docs-only permissions). Proposed replacement paragraph for `dba` to apply:

> WHY: migration 20261115120000 enables RLS on all five tables with NO policies (default-deny for anon/authenticated; API uses service role). This draft exists to make that posture explicit and to revoke any grants if permissive POC policies are ever added during device testing. Verify `pg_policies` is empty before applying; if any permissive policy exists, drop it here.
