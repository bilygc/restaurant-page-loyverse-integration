# 0001. Loyverse KDS and Custom Kitchen Screen POC (Research + Test Plan)

> SUPERSEDED by `0001-loyverse-poc-and-kitchen-screen.md` (build record with H1–H8 status, 2026-11-15). Kept for research history. Record new results in the superseding file.

- Status: Accepted-for-POC / Gate CLOSED
- Date: 2026-11-15
- Deciders: oracle (design adjudication), user (pending human device tests)
- Scope: `plan.md` Sec 9 POC only. This is a RESEARCH + TEST-PLAN record, NOT a final pass/fail verdict.

> Web-order delivery to Loyverse KDS is unvalidated until a real-device test is recorded in docs/adr/.

> Cost figures in plan.md are budget estimates (18 MXN/USD), not quotes.

## Context

`plan.md` Sec 9 defines a POC to answer one gating question before committing scope: can the website register its sales in Loyverse via API, and can the kitchen follow those sales on an **own screen**?

The starting premise (from `plan.md` Sec 9.1) is that receipts created through the Loyverse API do **not** send the order to Loyverse KDS. That premise must be confirmed by human test H2 with evidence before the gate opens.

Gate state at the time of writing:

- `docs/adr/` is empty (only `.gitkeep`). No prior decision recorded.
- `librarian` (2026-11-15) completed official-docs research.
- `oracle` returned GO FOR POC BUILD (harness) pending human device tests.
- Human H1–H8 device tests are still required. No H1–H8 result in this ADR counts as passed until a person runs it against real Loyverse and attaches evidence.

Out of scope for the POC (per `plan.md` Sec 9.1): real Stripe, emails, final UI design, customer accounts, refunds, inventory/menu sync, multi-store.

## Decision

Accepted-for-POC (harness build may proceed; production scope remains gated):

1. **Loyverse as sales registry, own `/cocina` as KDS.** Loyverse holds receipts, reports, and inventory. Our own kitchen screen, backed by our Supabase Postgres DB, shows **all** orders regardless of origin (web + POS). Kitchen state lives only in our DB; Loyverse is never updated with kitchen state.
2. **Web orders do not depend on Loyverse to reach the kitchen.** Flow A writes the order to our DB first (paid via simulated gateway), shows it on `/cocina`, then creates the Loyverse receipt asynchronously with retry. Flow D behavior is mandatory: with Loyverse down, the web order still appears in the kitchen and receipt creation is queued.
3. **POS sales enter our DB when the Loyverse API exposes them.** Via receipts webhook and/or periodic `GET /receipts` polling (undetermined until H3/H4). Converted to kitchen orders with origin `pos`.
4. **Polling/SSE for `/cocina` updates.** Own DB → API → screen via polling or SSE. Supabase Realtime only if polling/SSE proves insufficient.
5. **`PaymentGateway` mock with production guard.** `PAYMENT_MODE=mock` implementation marks orders paid in the POC. The API **must not boot** with the mock active in production. "Simular pago" button only outside production. No Stripe keys in the POC.
6. **`PosGateway` + outbox + dedupe by `receipt_number`.** Single `payment_type` per receipt, `variant_id` item mapping, `dining_option` owned in our DB and mirrored in the receipt note, custom webhook secret via `?token=` with `timingSafeEqual` + canonical fetch via `GET`, dual-key echo suppression (`receipt_number` + order/note correlation).

Oracle adjustments incorporated (pending human validation):

- `dining_option` owned in our DB + mirrored in note (response-only in Loyverse API).
- Mapping by `variant_id`.
- Single payment per receipt.
- Custom webhook secret via `?token=` with `timingSafeEqual` + canonical re-fetch.
- Dual-key echo suppression (`receipt_number` + order/note correlation).
- Pricing correction queued (see Consequences).

## Alternatives considered

| Alternative | Why not chosen for POC |
|-------------|------------------------|
| Rely on Loyverse KDS for web orders | Rejected as premise: API-created receipts are not expected to reach KDS; forum moderator states API cannot reach KDS. Requires device proof (H2). If H2 disproves the premise, this ADR must be revised. |
| Loyverse-only system, no own DB/kitchen state | Rejected: kitchen state (nuevo, en preparación, listo, entregado) has no Loyverse counterpart; offline resilience (H6) requires our DB + outbox. |
| Supabase Realtime as primary kitchen feed | Deferred: evaluate only if polling/SSE fails to meet H7 latency targets. |
| Real Stripe in POC | Out of scope: adds PCI/keys risk with no validation benefit for the KDS question. Mock with prod guard instead. |
| Menu/inventory sync in POC | Out of scope: orthogonal to KDS reachability; deferred to post-POC scoping. |

## Evidence (librarian 2026-11-15, official Loyverse API v1.0 + support + forum + pricing)

Source family consulted: official Loyverse API v1.0 docs, Loyverse support, Loyverse community forum, Loyverse pricing page. Key findings as reported by `librarian`:

- `POST /receipts` creates a receipt with `store_id`, line items by `variant_id`, and a single `payment`.
- No `/orders`, `/kds`, or `/dining-options` write endpoints exist. `dining_option` is response-only.
- `receipts.update` webhook exists but is **unsigned for PAT** (personal access token), payload is undocumented, HTTPS required. Hence the oracle decision: custom secret via `?token=` query param, `timingSafeEqual` comparison, and canonical re-fetch via `GET /receipts` before trusting any webhook body.
- Reads via polling `GET /receipts` with filters. Rate limit observed: 300 requests / 300 seconds.
- KDS displays open tickets from POS over Wi-Fi. Forum moderator position: the API cannot reach KDS — needs device proof (this is exactly H2).
- `receipt_number` is unique and suitable for dedupe, plus a source discriminator (`web` vs `pos`).
- Pricing: Free plan includes POS / KDS / Integrations. Unlimited sales history is **$7/mo** (see pricing-discrepancy note below).

Reference URLs (librarian source family; verify against current published pages before human tests):

- https://developer.loyverse.com/ — Loyverse API v1.0 reference (`POST /receipts`, `GET /receipts`, webhooks)
- https://help.loyverse.com/ — Loyverse support / help center (KDS setup, receipt lifecycle)
- https://community.loyverse.com/ — Loyverse community forum (moderator statement that API cannot reach KDS)
- https://www.loyverse.com/pricing — Loyverse pricing (Free includes POS/KDS/Integrations; paid add-ons)
- https://www.loyverse.com/marketplace — Loyverse integrations/marketplace (context for API integrations)

> If any URL above has moved, update this section when recording H1–H8 results. Do not treat forum statements as specifications — they are leads for H2 device proof.

## Test plan — H1–H8 (all PENDING, human-run on real Loyverse)

Status legend for the results column: `PENDING` (not yet run). Update to `PASS` / `FAIL` with date, tester, and evidence link when each human test completes. The gate opens only when results are recorded here.

| Id | What is tested (`plan.md` Sec 9.4) | Pass criteria | Result + evidence |
|----|-------------------------------------|---------------|-------------------|
| H1 | API creates a receipt from a web order (store, payment type, mapped items) | Receipt appears in Loyverse back office with correct items, quantities, and total | PENDING — no evidence yet |
| H2 | API-created receipt does **not** reach Loyverse KDS | Photo/video of KDS without the order, attached to this ADR | PENDING — no evidence yet. Gate premise. |
| H3 | POS sales reach our API | Via webhook or polling, with measured latency. Confirm whether API-created receipts also trigger the webhook (for echo suppression) | PENDING — no evidence yet |
| H4 | When a POS order becomes visible via API | Document whether it appears at send-to-kitchen or only at payment. If only at payment, document limitation + alternative | PENDING — no evidence yet |
| H5 | Receipt carries what the kitchen needs | Items, quantities, modifiers, notes, service type (dine-in/takeaway), order number, timestamp | PENDING — no evidence yet |
| H6 | Resilience with Loyverse down | Web order still appears in kitchen; receipt retries until created. Nothing lost or duplicated | PENDING — no evidence yet. Mandatory; failure blocks progress. |
| H7 | End-to-end latency | Initial targets: web order visible in kitchen < 5 s; POS order < 15 s. Targets adjustable with results | PENDING — no evidence yet |
| H8 | No duplicates | Web order does not appear twice when its receipt returns via webhook/polling (dedupe by receipt identifier) | PENDING — no evidence yet |

Decision mapping after results (`plan.md` Sec 9.8):

- H1 + H5 + H6 + H8 pass, and H3 works via webhook or polling → **GO**: own screen enters scope and is quoted.
- H4 shows POS orders visible only at payment → **GO WITH ADJUSTMENT**: document limitation, evaluate alternatives (e.g., staff captures dine-in orders on own screen, or screen shows POS orders only at payment).
- H1 fails due to API/plan limits → **RETHINK**: Loyverse as in-store POS only; web orders in own system with manual/deferred Loyverse registration.
- H6 fails (orders lost) → **STOP** until fixed. Mandatory condition.

Human-test environment notes (`plan.md` Sec 9.6): use a **separate Loyverse test account**; test receipts affect reports/inventory. If the real account must be used, use test store + test items and void receipts afterward. Webhook needs a public URL (Render test env or temporary tunnel). Secrets in env vars only. Kitchen screen tested on a real tablet (Android/iPad), screen on, with new-order sound alert.

## Scaffolding notes for dba → dev (harness build order)

Recorded from oracle adjudication so `dba` and `dev` build in the right order. Not a design change — execution sequencing:

1. **Keep `packages/shared/src/domain`.** Existing domain sources (`enums`, `kitchen-state`, `loyverse`, `money`, `order.dto` + specs) are the shared kernel. Do not delete or relocate.
2. **Delete `dist`, rebuild after `dba`.** Remove stale `packages/shared/dist` artifacts; rebuild only after the DB schema lands so generated types stay consistent.
3. **`dba` authors migration `20261115120000_poc_loyverse_kitchen_schema.sql`.** Tables: `orders`, `order_items`, `loyverse_item_mappings`, `loyverse_webhook_events`, `outbox_jobs`, plus kitchen/order/sync enums and RLS policies. Proposal in `plan.md` Sec 9.7; `dba` confirms final shape.
4. **Wire `AppConfig` / `Common` / `Database` modules** in the NestJS API before `dev` implements gateways (config validation including `PAYMENT_MODE` prod guard, shared filters/pipes, Supabase/Postgres connection).
5. **`vitest` runner fix in the dev slice.** Repair the shared-package test runner so domain specs run green before gateway/kitchen/outbox code is added.
6. Build order after that: `dba` → `dev` (mock `PaymentGateway` + `PosGateway` + kitchen module + retries) → `frontend` (`/cocina` + minimal web flow harness) → `code-review` (tokens, webhook, mock prod-guard) → `writer` (record H1–H8 results in this ADR) → human H1–H8 tests.

## Pricing-discrepancy note (queued fix, not applied here)

`plan.md` Sec 5 lists "Historial de ventas ilimitado" at USD $5/mo. Librarian (2026-11-15) reports the current published figure as **$7/mo**. Per task instructions this correction is deferred ("fix later") — `plan.md` Sec 5 still reads $5 at the time of writing. When the fix is applied, update Sec 5 and remove this note. Per-quote caveat above still applies.

## Consequences

- **If the harness builds as decided**, web orders are kitchen-visible without Loyverse, POS sales merge into the same screen, and Loyverse remains the sales registry. Latency targets (H7) and POS-visibility timing (H4) set final UX expectations.
- **If H2 disproves the premise** (API receipts do reach KDS), this ADR must be revised — the own-screen justification changes and scope/cost must be re-quoted.
- **If H6 fails**, nothing proceeds until order loss is fixed. Outbox + dedupe design exists precisely for this.
- **Costs**: no new recurring cost expected for the POC. Loyverse + Supabase Free suffice; public webhook URL via low-cost Render service or temporary tunnel. See budget-estimate caveat at top.

## Next steps

1. `dba`: author and apply `20261115120000_poc_loyverse_kitchen_schema.sql` (tables + enums + RLS above).
2. `dev`: implement mock `PaymentGateway` (with prod guard), `PosGateway`, kitchen module, outbox/retries, webhook `?token=` + canonical fetch + dual-key echo suppression.
3. `frontend`: build `/cocina` harness (nuevo / en preparación / listo columns, origin + order number + items/notes + elapsed time, advance-state button, sound alert, simple PIN) + minimal web order flow with "Simular pago" (non-prod only).
4. `code-review`: review tokens, webhook auth, and mock prod-guard.
5. Human testers: run H1–H8 on real Loyverse + real tablet; attach captures/videos and latency measurements.
6. `writer`: update **this ADR** with per-hypothesis results and the resulting GO / GO-WITH-ADJUSTMENT / RETHINK / STOP decision. The orchestrator risk gate opens only when that results update exists.
