# POC human runbook — H1 to H8 (plan.md §9.4)

Owner: `dev` prepares the code and scripts; a **human** runs H1–H5 / H7 on real
Loyverse (§9.10) and records results in the ADR (`docs/adr/`, `writer`). Agents
never use live keys, deploy, or touch production.

> **Gate CLOSED.** KDS delivery from API receipts is unvalidated until H2 has
> real-device evidence in the ADR. Cost figures in `plan.md` are budget
> estimates (18 MXN/USD), not quotes. All tests below use a **separate Loyverse
> test account** and a **local Supabase** (§9.6).

## 1. Setup (human, local)

1. **Database** (`dba` runbook `supabase/POC_SCHEMA_NOTES.md`): start the local
   Supabase stack, `supabase db reset` (applies
   `20261115120000_poc_loyverse_kitchen_schema.sql` + `seed.sql`), and
   `supabase gen types typescript --local > packages/shared/src/db/database.types.ts`.
   **REPLACE** the 3 placeholder variant UUIDs in `seed.sql` with real ones from
   the Loyverse **test account** before H1. RLS is enabled with no policies —
   the API is the only client, via `SUPABASE_SERVICE_ROLE_KEY`.
   > In the CI/dev shell used for this slice, **Docker is not installed**, so the
   > local `supabase` CLI commands could not be run here. The hand-authored
   > `database.types.ts` was verified to be in exact parity with the migration;
   > run the commands above on a machine with Docker before the device tests.
2. **Env**: copy `.env.example` (see `docs/POC_ENV.md`). Set
   `NODE_ENV=development`, `PAYMENT_MODE=mock`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `LOYVERSE_ACCESS_TOKEN`, `LOYVERSE_STORE_ID`,
   `LOYVERSE_PAYMENT_TYPE_ID`, a strong `LOYVERSE_WEBHOOK_TOKEN`, and
   `KITCHEN_PIN` (min 4). **Never** use production keys.
3. **Build/run**: `npm ci && npm run build && npm run start:prod -w @restaurant/api`.
   Sanity: `curl http://localhost:3000/health` → `{ "status": "ok" }`.
4. **Webhook** needs a **public URL** (Render test service or temporary tunnel).
   Register `POST <public>/loyverse/webhooks/receipts?token=<LOYVERSE_WEBHOOK_TOKEN>`.
   (Alternatively send the `X-Webhook-Token` header.)
5. **Verify the harness** (no real services): `npm run typecheck && npm test`.

## 2. Endpoints (canonical contract)

| Method  | Path                          | Auth                          | Purpose                                                                                                                  |
| ------- | ----------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `GET`   | `/health`                     | —                             | Liveness                                                                                                                 |
| `GET`   | `/menu`                       | —                             | Server-owned pricelist (`unit_price_centavos` integers); **no client prices**                                            |
| `POST`  | `/orders`                     | —                             | Flow A: Zod-validated cart → server-recomputed total → mock charge → order + `order_items` + `create_receipt` outbox job |
| `GET`   | `/kitchen/orders`             | `X-Kitchen-Pin`               | Board: only `nuevo`/`en_preparacion`/`listo`, `created_at` ascending                                                     |
| `GET`   | `/kitchen/orders?state=`      | `X-Kitchen-Pin`               | Explicit single-state filter (incl. `entregado`)                                                                         |
| `GET`   | `/kitchen/stream`             | `X-Kitchen-Pin`               | Optional SSE board feed                                                                                                  |
| `PATCH` | `/kitchen/orders/:id/state`   | `X-Kitchen-Pin`               | Flow C: forward-only transition (`{ "state": ... }`)                                                                     |
| `POST`  | `/loyverse/webhooks/receipts` | `?token=` / `X-Webhook-Token` | Flow B: `receipts.update` trigger → canonical `GET /receipts/{n}` → POS order                                            |

Legacy aliases (kept so existing clients keep working): `GET /kitchen`,
`PATCH /orders/:id/kitchen-state`, `KITCHEN_PIN` header,
`POST /loyverse/webhook[?token=|<token>]`.

Replace `<API>`, `<PIN>`, `<TOKEN>`, `<ID>` below.

## 3. Helper calls

```bash
# Flow A — web order (simulated payment). Server owns prices (centavos).
curl -X POST <API>/orders -H 'Content-Type: application/json' \
  -d '{"items":[{"menu_item_id":"taco-pastor","quantity":2},{"menu_item_id":"refresco","quantity":1}],"dining_option":"mesa 4","note":"sin cebolla"}'
# -> 201 { id, origin:"web", kitchen_state:"nuevo", sync_status:"pending", total_centavos:9500, items:[...] }

# Server-owned menu (integer centavos; a client price in the body is ignored).
curl <API>/menu

# Kitchen board (X-Kitchen-Pin required). entregado is not shown.
curl <API>/kitchen/orders -H "X-Kitchen-Pin: <PIN>"
curl "<API>/kitchen/orders?state=nuevo" -H "X-Kitchen-Pin: <PIN>"
curl -N <API>/kitchen/stream -H "X-Kitchen-Pin: <PIN>"     # optional SSE

# Flow C — advance state (nuevo -> en_preparacion -> listo -> entregado).
curl -X PATCH <API>/kitchen/orders/<ID>/state -H "X-Kitchen-Pin: <PIN>" \
  -H 'Content-Type: application/json' -d '{"state":"en_preparacion"}'

# Flow B — simulate the Loyverse receipts.update webhook (token required).
curl -X POST "<API>/loyverse/webhooks/receipts?token=<TOKEN>" \
  -H 'Content-Type: application/json' -d '{"receipt_number":"<R>"}'
```

## 4. Hook per hypothesis

| Id     | Human hook                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Success criterion                                                                                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H1** | `POST /orders`; open the Loyverse **back office** and find the receipt. `LoyversePosGateway.createReceipt` sends `store_id`, `line_items` (`variant_id`+quantity), a single `payments` (`payment_type_id`, 2-dec MXN `amount`), writable `order=<our-id>`, `source=restaurant-web`, and `[dining_option: ...]` in `note`. The outbox worker stores `receipt_number`.                                                                                                                                                     | Receipt appears with correct items/quantities/total. If Loyverse variant prices differ from `StaticMenuPricelist`, record the discrepancy.                                                           |
| **H2** | With a Loyverse **KDS device** open, create a web order via API. **Capture a screenshot/video of the KDS NOT showing the order** (core premise §9.1).                                                                                                                                                                                                                                                                                                                                                                    | Evidence saved to the ADR; KDS has no order. **Gate premise.**                                                                                                                                       |
| **H3** | Make a sale in the **POS**. It should reach our API via `POST /loyverse/webhooks/receipts?token=...` and/or the poller (`GET /receipts?store_id&updated_at_min[&cursor]`). Watch `GET /kitchen/orders` for an `origin:"pos"` card. In development the raw webhook body is logged with `POC_EVIDENCE` — attach it as evidence of the payload shape. Also create a web order and check whether its API-created receipt ALSO fires the webhook (it must be deduped, see H8). Measure latency; note which path delivered it. | POS sale visible in kitchen; delivery path + measured latency recorded.                                                                                                                              |
| **H4** | Send a POS order **to kitchen before charging**, observe whether visible via API; then charge and observe again.                                                                                                                                                                                                                                                                                                                                                                                                         | Document whether visibility is at send-to-kitchen or only at payment; if only at payment, record limitation/alternative.                                                                             |
| **H5** | Inspect a POS-origin card from `GET /kitchen/orders`: items, quantities, `line_note` (modifiers), `note`, `[dining_option: ...]` (from receipt note), `loyverse_receipt_number`, `created_at`.                                                                                                                                                                                                                                                                                                                           | Card carries everything the kitchen needs; list anything Loyverse does NOT expose.                                                                                                                   |
| **H6** | **Disconnect / invalidate `LOYVERSE_ACCESS_TOKEN`** (or dead-port the base URL). Create a web order. `OrdersService` still records the paid order; `enqueueCreateReceiptJob` + `OutboxWorker` retry with exponential backoff, `sync_status` stays `pending`. Restore the token; watch the worker create the receipt and set `sync_status=synced`.                                                                                                                                                                        | Web order stays in kitchen throughout; receipt created exactly once; **no order lost, none duplicated**. After `OUTBOX_MAX_ATTEMPTS` the job is `failed` and an `outbox.job.failed` alert is logged. |
| **H7** | Time from `POST /orders` response to card in `GET /kitchen/orders` (target < 5 s). Time from POS sale to POS card (target < 15 s; `LOYVERSE_POLL_INTERVAL_MS` dominates).                                                                                                                                                                                                                                                                                                                                                | Latencies measured; targets adjusted with results.                                                                                                                                                   |
| **H8** | Let an API-created receipt return via webhook **and** poller; fire the same webhook twice; replay a `receipt_number`. `IngestionService` dedups by `receipt_number` (UNIQUE) and ignores echoes (`source=restaurant-web` or `order` matches a web order). Assert the web order appears **once** in `GET /kitchen/orders`.                                                                                                                                                                                                | No duplicate cards; `loyverse_webhook_events` holds one row per receipt.                                                                                                                             |

## 5. Timings / knobs (names + safe defaults)

| Variable                                           | Default               | Effect                                                                     |
| -------------------------------------------------- | --------------------- | -------------------------------------------------------------------------- |
| `OUTBOX_POLL_INTERVAL_MS`                          | `5000`                | outbox worker tick (H6 retry cadence)                                      |
| `OUTBOX_MAX_ATTEMPTS`                              | `8`                   | terminal `failed` + alert after N attempts                                 |
| `OUTBOX_BASE_BACKOFF_MS` / `OUTBOX_MAX_BACKOFF_MS` | `1000` / `60000`      | exponential backoff, capped                                                |
| `LOYVERSE_POLL_INTERVAL_MS`                        | `15000`               | receipt poller tick (dominates POS latency H7)                             |
| `LOYVERSE_POLL_LOOKBACK_MINUTES`                   | `60`                  | `updated_at_min` lookback window                                           |
| `LOYVERSE_RATE_LIMIT` / `LOYVERSE_RATE_WINDOW_MS`  | `300` / `300000`      | sliding-window cap (300/300 s); bounded cursor pagination (≤10 pages/poll) |
| H7 targets                                         | web < 5 s, POS < 15 s | adjustable with results                                                    |

## 6. Automated coverage (already in the repo)

`npm test` runs the 133-test suite (dev handoff count; writer did not re-run —
docs-only permissions) — pure + service + e2e tests with **all external boundaries faked**
(no real Loyverse/Stripe/DB/money). It covers: enum/state-machine/money/DTO/menu
contract invariants, boot guard (mock forbidden in prod), payment gateway,
Loyverse gateway error translation (401/429/5xx/timeout/network/400) + rate
limit + `store_id`/`updated_at_min`/cursor polling, receipt builder/normalizer,
outbox idempotent retry + backoff + no-lost-order (H6/H8 logic), ingestion dedup

- echo suppression + webhook poll fallback (H8), kitchen PIN guard (both header
  names) + board filter/ordering + state machine + recomputed totals + SSE, webhook
  token (`?token=` / header / path) + canonical fetch + dev-only raw H3 logging,
  and full `AppModule` DI wiring (with `NotificationsModule` out of the runtime),
  plus web `lib` unit specs (format/board/menu/kitchen).
  Human H1–H5/H7 still require the real device/account.
