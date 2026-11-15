# POC environment & configuration (plan.md §9)

Owner: `dev`. **Names and safe defaults only — no secrets in this repo.**
The API reads every value through the config module (`apps/api/src/config/env.ts`)
and validates at boot. A missing/invalid variable fails fast with the variable
**name** only (never its value). Copy from `.env.example` / `apps/api/.env.example`.

## Naming decision (item 7)

| Brief name           | Repo / migration name   | Resolution                                                                                                                                                                                                                    |
| -------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LOYVERSE_API_TOKEN` | `LOYVERSE_ACCESS_TOKEN` | **Canonical: `LOYVERSE_ACCESS_TOKEN`.** It is already in both `.env.example` files and in the migration header; Loyverse calls it a Personal Access Token. `LOYVERSE_API_TOKEN` is a **deprecated alias**, not read anywhere. |

## Simulated payment boot guard (§9.5)

- The `PaymentGateway` interface has one POC implementation, `MockPaymentGateway`
  (marks the order paid, no money, no Stripe keys).
- `PAYMENT_MODE=mock` is required outside production. **The API refuses to boot
  when `NODE_ENV=production` and `PAYMENT_MODE=mock`** — enforced in
  `parseAppConfig` (boot) and again in `PaymentsModule` (provider wiring).
- There is **no live gateway** in the POC; `PAYMENT_MODE=live` fails boot with a
  clear message. Integrating Stripe later only replaces the gateway.

## Webhook authentication

Loyverse `receipts.update` webhooks are **unsigned** in the POC. The canonical
endpoint is protected by an **unguessable token**, not an HMAC secret. The token
may be supplied in three ways (all compared in constant time, `timingSafeEqual`):

```
POST <API_BASE>/loyverse/webhooks/receipts?token=<LOYVERSE_WEBHOOK_TOKEN>
POST <API_BASE>/loyverse/webhooks/receipts  -H 'X-Webhook-Token: <TOKEN>'
POST <API_BASE>/loyverse/webhooks/receipts/<TOKEN>        # path-token alias
```

Legacy aliases `POST /loyverse/webhook[?token=|<token>]` are still accepted for
existing clients. The body is untrusted and used only to find a receipt number;
the canonical receipt is always re-fetched via `GET /receipts/{number}` before
anything is trusted. `LOYVERSE_WEBHOOK_SECRET` is intentionally **not** used. A
mismatched token returns 404 (no reveal).

**H3 evidence:** the undocumented raw webhook payload is logged with a
`POC_EVIDENCE` tag **only** in `NODE_ENV=development` (against the separate
Loyverse **test account**, never with real customer PII), capped at 4096 chars.
It is never logged in `test`/`production`. Remove this instrumentation before
go-live. Per §9.6 the webhook needs a public URL (Render test service or a
temporary tunnel) to register with Loyverse.

## Variables

| Name                             | Purpose                                                                  | Required        | Default                         |
| -------------------------------- | ------------------------------------------------------------------------ | --------------- | ------------------------------- |
| `NODE_ENV`                       | `development \| test \| production`                                      | no              | `development`                   |
| `PORT`                           | Listen port (bound to `0.0.0.0`)                                         | no              | `3000`                          |
| `PAYMENT_MODE`                   | `mock \| live`; mock forbidden in prod                                   | no              | `mock`                          |
| `WEB_APP_ORIGIN`                 | CORS allow-list origin                                                   | no              | `http://localhost:3001`         |
| `SUPABASE_URL`                   | API's only DB client                                                     | **yes**         | —                               |
| `SUPABASE_SERVICE_ROLE_KEY`      | API's only DB client (bypasses RLS)                                      | **yes**         | —                               |
| `SUPABASE_ANON_KEY`              | Local POC testing only (not read by API)                                 | no              | —                               |
| `LOYVERSE_ACCESS_TOKEN`          | Loyverse PAT (Authorization: Bearer)                                     | **yes**         | —                               |
| `LOYVERSE_API_BASE_URL`          | Loyverse API base                                                        | no              | `https://api.loyverse.com/v1.0` |
| `LOYVERSE_STORE_ID`              | `store_id` on POST /receipts (H1)                                        | **yes**         | —                               |
| `LOYVERSE_PAYMENT_TYPE_ID`       | single payment `payment_type_id`                                         | **yes**         | —                               |
| `LOYVERSE_WEBHOOK_TOKEN`         | unguessable webhook token (`?token=` / `X-Webhook-Token`)                | **yes**         | —                               |
| `KITCHEN_PIN`                    | PIN sent in `X-Kitchen-Pin` header (legacy `KITCHEN_PIN` alias accepted) | **yes** (min 4) | —                               |
| `OUTBOX_MAX_ATTEMPTS`            | terminal failure after N attempts                                        | no              | `8`                             |
| `OUTBOX_BASE_BACKOFF_MS`         | backoff base                                                             | no              | `1000`                          |
| `OUTBOX_MAX_BACKOFF_MS`          | backoff cap                                                              | no              | `60000`                         |
| `OUTBOX_POLL_INTERVAL_MS`        | outbox worker tick                                                       | no              | `5000`                          |
| `OUTBOX_BATCH_SIZE`              | jobs per tick                                                            | no              | `20`                            |
| `LOYVERSE_POLL_INTERVAL_MS`      | receipt poller tick                                                      | no              | `15000`                         |
| `LOYVERSE_POLL_LOOKBACK_MINUTES` | `updated_at_min` lookback                                                | no              | `60`                            |
| `LOYVERSE_RATE_LIMIT`            | sliding-window call cap                                                  | no              | `300`                           |
| `LOYVERSE_RATE_WINDOW_MS`        | sliding-window size                                                      | no              | `300000`                        |

**Not used in the POC:** `STRIPE_*`, `RESEND_*` (plan.md §9.1 / §9.5). No Stripe
keys, no emails. `LOYVERSE_API_TOKEN` (deprecated alias), `LOYVERSE_WEBHOOK_SECRET`
(unsigned webhook) are also not read.

### Web (`apps/web` — public `NEXT_PUBLIC_*`, inlined at build time)

| Name | Purpose | Required | Default |
| ---- | ------- | -------- | ------- |
| `NEXT_PUBLIC_API_URL` | API base URL, read server-side by Next routes (server-to-server) | yes (for ordering) | see `apps/web/.env.example` |
| `NEXT_PUBLIC_PAYMENT_MODE` | **Public, UI-only** mirror of `PAYMENT_MODE`; `shouldShowSimulatePay` shows "Simular pago" only when `mock` AND not production (fail-closed; unset hides the button) | no | unset → hidden |

There is **no `NEXT_PUBLIC_KITCHEN_PIN`** — the PIN never enters the client bundle; the browser calls same-origin Next routes that forward server-to-server with the in-memory PIN. `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` appear in `apps/web/.env.example` but are not read by current web code (scaffold placeholders).

## Rate limit awareness

Loyverse allows ~300 requests / 300 s. `SlidingWindowRateLimiter` refuses the
301st outbound call (typed `rate_limit` error → outbox backoff) instead of
blindly triggering a 429.

## Scheduler note (single instance)

The outbox worker and receipt poller are in-process `setInterval` loops, disabled
under `NODE_ENV=test`. `claimOutboxJobs` uses a conditional status claim; the POC
assumes **one API instance** (Render starter). Multi-instance row locking
(`FOR UPDATE SKIP LOCKED` / claim column) is a follow-up for `oracle`.
