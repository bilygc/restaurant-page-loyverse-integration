# 0001. Loyverse POC and kitchen screen — build record (H1–H8 status)

- Status: accepted (harness) / **Gate CLOSED**
- Date: 2026-11-15
- Deciders: oracle (design adjudication), user (pending human device tests)
- Scope: `plan.md` §9 POC only. This records the **built harness + test status**, not a final pass/fail verdict.
- Supersedes: `0001-loyverse-kds-and-custom-kitchen-screen-poc.md` (research + test plan), whose content is consolidated here with build results.

> Web-order delivery to Loyverse KDS is **unvalidated** until human test H2 is recorded with real-device evidence below. Gate stays **CLOSED** until human H1–H8 results exist.

> Cost figures in `plan.md` are budget estimates (18 MXN/USD), not quotes.

## Context

`plan.md` §9 defines a POC to answer one gating question before committing scope: can the website register its sales in Loyverse via API, and can the kitchen follow those sales on an **own screen**?

The starting premise (§9.1) is that receipts created through the Loyverse API do **not** send the order to Loyverse KDS. That premise must be confirmed by human test H2 with evidence before the gate opens.

State at the time of writing:

- `librarian` (2026-11-15) completed official-docs research (Loyverse API **v1.0**).
- `oracle` returned GO FOR POC BUILD; the harness described below is built.
- Security review (`code-review`) is **CLEAR, 0 High** findings.
- Human H1–H5/H7 device tests are still required. No result below counts as passed until a person runs it against real Loyverse and attaches evidence.

Out of scope for the POC (`plan.md` §9.1): real Stripe, emails, final UI design, customer accounts, refunds, inventory/menu sync, multi-store.

## Decision

**GO for POC build (done); gate CLOSED until human tests.**

1. **Loyverse as sales registry, own `/cocina` as KDS.** Loyverse holds receipts, reports, and inventory. Our kitchen screen, backed by Supabase Postgres, shows **all** orders regardless of origin (web + POS). Kitchen state lives only in our DB; Loyverse is never updated with kitchen state.
2. **Web orders do not depend on Loyverse to reach the kitchen.** Flow A writes the order to our DB first (paid via simulated gateway), shows it on `/cocina`, then creates the Loyverse receipt asynchronously with retry. Flow D is mandatory: with Loyverse down, the web order still appears and receipt creation is queued.
3. **POS sales enter our DB when the Loyverse API exposes them** — via `receipts.update` webhook and/or periodic `GET /receipts` polling (which path wins is H3's finding).
4. **Polling for `/cocina` updates** (5 s client poll; SSE available as an option). Supabase Realtime only if polling/SSE proves insufficient.
5. **`PaymentGateway` mock with production guard.** `PAYMENT_MODE=mock` marks orders paid with no money movement. The API **refuses to boot** with the mock in production. "Simular pago" button only outside production. No Stripe keys in the POC.
6. **`LoyversePosGateway` + outbox + dedupe by `receipt_number`.** Single `payment_type_id` per receipt, `variant_id` item mapping, `dining_option` owned in our DB and mirrored in the receipt note (read-only in Loyverse API), unsigned-webhook auth via unguessable `?token=` / header with constant-time compare + canonical re-fetch, dual-key echo suppression.

## Alternatives considered

| Alternative | Why not chosen for POC |
|-------------|------------------------|
| Rely on Loyverse KDS for web orders | Rejected as premise: API-created receipts are not expected to reach KDS. Requires device proof (H2). If H2 disproves the premise, this ADR must be revised. |
| Loyverse-only system, no own DB/kitchen state | Rejected: kitchen state (`nuevo`, `en_preparacion`, `listo`, `entregado`) has no Loyverse counterpart; offline resilience (H6) requires our DB + outbox. |
| Supabase Realtime as primary kitchen feed | Deferred: evaluate only if polling/SSE fails H7 targets. |
| Real Stripe in POC | Out of scope: PCI/keys risk with no validation benefit for the KDS question. Mock with prod guard instead. |
| Menu/inventory sync in POC | Out of scope: orthogonal to KDS reachability; deferred to post-POC scoping. |
| OAuth for Loyverse auth | Not used: POC uses a Personal Access Token (`LOYVERSE_ACCESS_TOKEN`, `Authorization: Bearer`). OAuth deferred to production hardening if needed. |

## Evidence (librarian 2026-11-15, official Loyverse API v1.0 + support + forum + pricing)

Source family: official Loyverse API v1.0 docs, Loyverse support, community forum, pricing page. Key findings as reported by `librarian`:

- **API v1.0.** `POST /receipts` creates a receipt with `store_id`, line items by `variant_id`, and a single `payment`. No `/orders`, `/kds`, or `/dining-options` write endpoints exist.
- **No sandbox.** Loyverse provides no test sandbox; human tests run against a **separate Loyverse test account**, never the restaurant's real account (§9.6).
- **PAT vs OAuth.** POC authenticates with a Personal Access Token (`Authorization: Bearer`). OAuth is the production-grade alternative and remains unevaluated.
- **No idempotency-key support.** The API offers no idempotency key on receipt creation; the POC works around it with **dedupe by `receipt_number`** (UNIQUE in `loyverse_webhook_events`, partial-unique on `orders`) plus echo suppression (`source=restaurant-web` / `order` correlation).
- **`dining_option` is read-only.** Owned in our DB (`orders.dining_option`) and mirrored into the receipt `note` as `[dining_option: ...]`; never written back to Loyverse.
- **Unsigned webhook.** `receipts.update` is unsigned for PAT; payload undocumented; HTTPS required. Hence: unguessable token via `?token=` / `X-Webhook-Token` (constant-time compare) + canonical `GET /receipts/{number}` re-fetch before trusting anything.
- **Rate limit:** ~300 requests / 300 s (client-side sliding-window limiter refuses the 301st call into outbox backoff instead of tripping a 429).
- **KDS reachability:** KDS displays open tickets from POS over Wi-Fi; forum moderator position is that the API cannot reach KDS — device proof required (exactly H2).
- **Pricing:** Free plan includes POS / KDS / Integrations. Unlimited sales history is a **paid add-on** (plan.md §5 figure under review — see pricing note in the superseded research ADR; confirm current pricing page before quoting).

Reference URLs (verify against current published pages before human tests):

- https://developer.loyverse.com/ — API v1.0 reference (`POST /receipts`, `GET /receipts`, webhooks)
- https://help.loyverse.com/ — support / help center (KDS setup, receipt lifecycle)
- https://community.loyverse.com/ — community forum (moderator statement that API cannot reach KDS)
- https://www.loyverse.com/pricing — pricing (Free includes POS/KDS/Integrations; paid add-ons)
- https://www.loyverse.com/marketplace — integrations/marketplace context

> Forum statements are leads for H2 device proof, not specifications.

## What was built (change set, 2026-11-15)

### dba — schema

- `supabase/migrations/20261115120000_poc_loyverse_kitchen_schema.sql`: **5 tables** (`orders`, `order_items`, `loyverse_item_mappings`, `loyverse_webhook_events`, `outbox_jobs`), 5 Postgres enums, shared `set_updated_at()` trigger + 5 triggers, FK/worker/board indexes, **RLS enabled on all five tables with no policies (default-deny)** — the API is the only DB client via service role.
- `supabase/seed.sql`: 3 `loyverse_item_mappings` rows with **placeholder variant UUIDs — REPLACE with real TEST-account variant ids before H1**.
- `packages/shared/src/db/database.types.ts`: hand-authored stand-in in exact parity with the migration; **regenerate** with `supabase gen types typescript --local` on a Docker machine (could not run here — no Docker in build shell).
- Runbook: `supabase/POC_SCHEMA_NOTES.md`.

### dev — API

- `PaymentGateway` interface + `MockPaymentGateway` (marks paid, no money, no Stripe keys) with **prod boot guard** (`NODE_ENV=production` + `PAYMENT_MODE=mock` refuses to boot; `live` fails boot — no live gateway exists yet).
- `LoyversePosGateway` (`store_id`, `variant_id` line items, single `payment_type_id`), `receipt.mapper` (builder/normalizer), sliding-window rate limiter.
- Outbox worker (`create_receipt`, exponential backoff, `OUTBOX_MAX_ATTEMPTS` terminal failure + alert) — Flow D / H6.
- Ingestion: unsigned-webhook endpoint (`?token=` / `X-Webhook-Token` / path-token alias, constant-time compare, canonical re-fetch, dev-only `POC_EVIDENCE` raw-body log) + receipt poller (`store_id`, `updated_at_min` lookback, bounded cursor pagination) with echo suppression — Flow B / H3 / H8.
- Kitchen API: board (`nuevo`/`en_preparacion`/`listo`, `created_at` ascending), explicit `?state=` filter, forward-only `PATCH …/state`, PIN guard (`X-Kitchen-Pin`, legacy alias), SSE feed, server-recomputed totals, shared Zod contract in `packages/shared`.
- **133 tests pass** (dev handoff count; writer did not re-run — docs-only permissions; `npm test`: domain invariants, boot guard, gateways incl. 401/429/5xx/timeout/network/400 + rate limit, outbox idempotent retry/backoff/no-lost-order, ingestion dedup + echo suppression, kitchen guard/filter/state machine/SSE, webhook token paths, full `AppModule` DI wiring — all boundaries faked; plus web `lib` unit specs).
- Docs: `docs/POC_ENV.md`, `docs/POC_TEST_HOOKS.md`.

### frontend — web

- `/cocina`: `nuevo` / `en_preparacion` / `listo` columns, **origin badge** (web/POS), order number, items + notes, **elapsed time**, advance-state button, **new-order chime** (WebAudio, unlocked by PIN-submit gesture), **in-memory PIN gate** (never persisted), **5 s polling**, wake-lock sentinel; `force-dynamic` (never statically prerendered).
- Mock checkout flow with "Simular pago" (non-production only); server owns prices (integer centavos; client prices ignored).
- `typecheck` + `next build` pass. **No `NEXT_PUBLIC_KITCHEN_PIN`** — the PIN never enters the client bundle; the browser calls same-origin Next routes that forward server-to-server with the PIN from memory.

### Code review

Security review **PASS / CLEAR, 0 High** (tokens, webhook auth, mock prod-guard covered).
Six **Low** hygiene follow-ups, recorded as **non-blocking for H-tests**:

1. **Canonical + legacy route aliases** — dual canonical/legacy paths (`/kitchen` ↔ `/kitchen/orders`, `PATCH /orders/:id/kitchen-state` ↔ `/kitchen/orders/:id/state`, `/loyverse/webhook` ↔ `/loyverse/webhooks/receipts`, `KITCHEN_PIN` ↔ `X-Kitchen-Pin`) are intentional compat shims (verified in `kitchen.controller.ts`, `loyverse.controller.ts`, `kitchen-pin.guard.ts`); retire the legacy forms post-POC.
2. **`NEXT_PUBLIC_PAYMENT_MODE` doc** — addressed in docs: public UI-only flag documented in `docs/POC_ENV.md`. `apps/web/.env.example` still lacks the entry (non-docs file, left for `frontend`).
3. **Web CI wiring** — verified: `.github/workflows/ci.yml` runs build/lint/typecheck/format-check with **no `npm test` step**; wire the full suite (incl. web) into CI before merge.
4. **Zod-parse client** — per code-review report (writer did not re-verify in code): validate client-constructed payloads with the shared Zod schemas.
5. **Unused deps** — per code-review report (writer did not re-verify): prune dependencies nothing imports.
6. **`payment.spec`** — verified gap: web specs cover `format`/`board`/`menu`/`kitchen` only; no `apps/web/lib/payment.spec.ts` for `shouldShowSimulatePay` yet.

None of the six blocks human H1–H8 device tests. **Gate stays CLOSED** until H1–H8 video/JSON/latency evidence is recorded in this ADR.

## Test status — H1–H8

Legend: `PENDING` = human must run on real Loyverse + real tablet. `COVERED (auto)` = logic covered by automated tests with boundaries faked; human confirmation still recorded here before the gate opens.

| Id | What is tested (plan.md §9.4) | Pass criteria | Status |
|----|-------------------------------|---------------|--------|
| H1 | API creates a receipt from a web order (store, payment type, mapped items) | Receipt appears in Loyverse back office with correct items, quantities, total | **PENDING** — human, test account, §9.6 |
| H2 | API-created receipt does **not** reach Loyverse KDS | Photo/video of KDS without the order, attached below | **PENDING** — human, real KDS device. **Gate premise.** |
| H3 | POS sales reach our API | Via webhook or polling, with measured latency. Confirm whether API-created receipts also trigger the webhook (echo check) | **PENDING** — human |
| H4 | When a POS order becomes visible via API | Document whether visible at send-to-kitchen or **only at charge** (expected limitation per oracle) | **PENDING** — human; if only-at-charge, record limitation + alternative |
| H5 | Receipt carries what the kitchen needs | Items, quantities, modifiers, notes, service type, order number, timestamp | **PENDING** — human |
| H6 | Resilience with Loyverse down | Web order still in kitchen; receipt retried until created; nothing lost/duplicated | **COVERED (auto)** — outbox idempotent retry + backoff + no-lost-order specs green; human confirmation pending |
| H7 | End-to-end latency | Web < 5 s, POS < 15 s (adjustable with results) | **PENDING** — human-measured |
| H8 | No duplicates | Web order appears once when its receipt returns via webhook/polling | **COVERED (auto)** — ingestion dedup + echo-suppression specs green; human confirmation pending |

Decision mapping after results (plan.md §9.8):

- H1 + H5 + H6 + H8 pass, H3 works via webhook or polling → **GO**: own screen enters scope and is quoted.
- H4 shows POS orders visible only at payment → **GO WITH ADJUSTMENT**: document limitation, evaluate alternatives (staff captures dine-in orders on own screen, or screen shows POS orders only at payment).
- H1 fails due to API/plan limits → **RETHINK**: Loyverse as in-store POS only; web orders in own system with manual/deferred registration.
- H6 fails (orders lost) → **STOP** until fixed. Mandatory.

## Evidence placeholders (attach here when human tests run)

- [ ] **H2 KDS capture** (required to open the gate): `docs/adr/assets/h2-kds-YYYYMMDD.{png,mp4}` — KDS device screen open, API-created receipt number `<R>` visible in back office but **absent** from KDS. Tester: ___ Date: ___
- [ ] **H1 receipt capture**: back-office screenshot showing items/quantities/total for order `<id>` / receipt `<R>`. Tester: ___ Date: ___
- [ ] **H3 payload + latency**: `POC_EVIDENCE` dev log excerpt of raw webhook body + measured webhook/poller latency. Path that delivered it: webhook / poller. Echo observed? Y/N. Tester: ___ Date: ___
- [ ] **H4 timing note**: visible at send-to-kitchen / only at charge. Tester: ___ Date: ___
- [ ] **H5 kitchen card**: screenshot of POS-origin card with items/notes/dining_option/timestamp; list anything Loyverse does NOT expose: ___. Tester: ___ Date: ___
- [ ] **H6/H8 confirmation**: token-invalidated run — order stayed in kitchen, receipt created exactly once after restore. Tester: ___ Date: ___

## Limitations & risks (known at build time)

1. **KDS premise unvalidated (H2).** The entire own-screen justification rests on API receipts not reaching KDS. If disproved, re-quote scope.
2. **POS visibility timing (H4).** Expected: POS orders visible via API **only at charge**, not at send-to-kitchen. If confirmed, the kitchen screen lags dine-in flow — needs the documented adjustment.
3. **Sales-history cap.** The free Loyverse plan limits sales-history retention (paid add-on for unlimited); the POC poller's `updated_at_min` lookback (default 60 min) is unaffected, but backfills older than retention cannot be recovered — note for production reconciliation design.
4. **Single-instance scheduler.** Outbox worker + receipt poller are in-process `setInterval` loops with a conditional status claim; safe for one API instance (Render starter) only. Multi-instance row locking (`FOR UPDATE SKIP LOCKED` / claim column) is deferred to `oracle`.
5. **Static menu.** The POC API prices from a static pricelist (`menu-pricelist.ts`); `loyverse_item_mappings` is seeded but not yet read. Price drift between static list and Loyverse variants must be recorded in H1.
6. **No order idempotency on `POST /orders`.** Retried checkouts can create duplicate orders; client retry/backoff and a real idempotency key are production work.
7. **No sandbox.** All human tests touch a live (test-account) Loyverse; test receipts affect reports/inventory and must be voided after the run.
8. **Unsigned webhook.** Security rests on the unguessable URL/header token + canonical re-fetch; token rotation is manual (see runbook).
9. **PIN is not auth.** `KITCHEN_PIN` is a shared screen lock, not per-user authentication; acceptable for a kitchen tablet, not for anything customer-facing.
10. **Seed placeholders.** `seed.sql` variant UUIDs are fake; H1 fails until replaced with TEST-account ids. Never paste production ids.

## Environment variables (names only — never values)

`NODE_ENV`, `PORT`, `PAYMENT_MODE`, `WEB_APP_ORIGIN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` (local testing only, not read by API), `LOYVERSE_ACCESS_TOKEN` (canonical; `LOYVERSE_API_TOKEN` is a deprecated alias, not read), `LOYVERSE_API_BASE_URL`, `LOYVERSE_STORE_ID`, `LOYVERSE_PAYMENT_TYPE_ID`, `LOYVERSE_WEBHOOK_TOKEN`, `KITCHEN_PIN`, `OUTBOX_MAX_ATTEMPTS`, `OUTBOX_BASE_BACKOFF_MS`, `OUTBOX_MAX_BACKOFF_MS`, `OUTBOX_POLL_INTERVAL_MS`, `OUTBOX_BATCH_SIZE`, `LOYVERSE_POLL_INTERVAL_MS`, `LOYVERSE_POLL_LOOKBACK_MINUTES`, `LOYVERSE_RATE_LIMIT`, `LOYVERSE_RATE_WINDOW_MS`. Web: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_PAYMENT_MODE` (public UI-only mock flag; fail-closed). No `NEXT_PUBLIC_KITCHEN_PIN` — the PIN never enters the client bundle. **Not used in POC:** `STRIPE_*`, `RESEND_*`, `LOYVERSE_WEBHOOK_SECRET`. Full semantics: `docs/POC_ENV.md`.

## Consequences

- **If the harness runs as decided**, web orders are kitchen-visible without Loyverse, POS sales merge into the same screen, and Loyverse remains the sales registry. H7/H4 set final UX expectations.
- **If H2 disproves the premise**, this ADR is revised — own-screen justification changes, scope/cost re-quoted.
- **If H6 fails in the human run**, nothing proceeds until order loss is fixed.
- **Costs**: no new recurring cost for the POC. Loyverse + Supabase Free suffice; public webhook URL via low-cost Render service or temporary tunnel. Budget-estimate caveat applies.

## Next steps

1. Human: local run per `docs/POC_RUNBOOK.md` (DB reset → types → build → tests).
2. Human: replace seed UUIDs with TEST-account variant ids; run H1–H5/H7 on real Loyverse + real tablet; attach evidence above.
3. Human: confirm H6/H8 against live Loyverse (token-invalidated run).
4. `writer`: update **this ADR** per-hypothesis with PASS/FAIL + evidence; record GO / GO-WITH-ADJUSTMENT / RETHINK / STOP. The orchestrator risk gate opens only then.
5. `dba`: apply the corrected RLS-lockdown note (stale WHY paragraph in `docs/POC_PROD_RLS_LOCKDOWN.draft.sql` describes permissive policies that were never created — migration is default-deny with no policies; corrected text proposed in the runbook appendix).
