/**
 * SERVER-ONLY proxy helper. Imported exclusively by Route Handlers under
 * `app/api/**` (which run on the server) and by the customer page's Server
 * Component for the menu. NEVER import this from a Client Component — it reads
 * env and forwards the KITCHEN PIN header upstream.
 *
 * Why a proxy (documented POC choice):
 *  - All browser traffic is same-origin (`/api/*`), so the tablet test has NO
 *    CORS dependency on the API's `WEB_APP_ORIGIN`.
 *  - The operator-entered PIN is forwarded as the CANONICAL `X-Kitchen-Pin`
 *    header here; there is NO `NEXT_PUBLIC_KITCHEN_PIN` and no static secret in
 *    the client bundle.
 *  - `NEXT_PUBLIC_API_URL` is read server-side; Next -> API is server-to-server.
 */
import { KITCHEN_STATES, menuResponseSchema } from '@restaurant/shared';
import type { MenuResponse } from '@restaurant/shared';

/** Canonical header expected by KitchenPinGuard (legacy KITCHEN_PIN alias kept). */
const UPSTREAM_PIN_HEADER = 'X-Kitchen-Pin';
const INCOMING_PIN_HEADER = 'X-Kitchen-Pin';
const IDEMPOTENCY_HEADER = 'Idempotency-Key';

function errorResponse(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function getApiBase(): string | null {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

export function isKitchenState(value: string | null): boolean {
  return value !== null && (KITCHEN_STATES as readonly string[]).includes(value);
}

export interface ProxyOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  /** Raw JSON body to forward (already read from the incoming request). */
  body?: string;
}

/** Forward the incoming request to the NestJS API and pass the response back. */
export async function proxyToApi(
  request: Request,
  path: string,
  options: ProxyOptions = {},
): Promise<Response> {
  const base = getApiBase();
  if (!base) return errorResponse(503, 'api_not_configured', 'Falta NEXT_PUBLIC_API_URL');

  const headers: Record<string, string> = {};
  const contentType = request.headers.get('content-type');
  if (contentType) headers['content-type'] = contentType;

  const pin = request.headers.get(INCOMING_PIN_HEADER);
  if (pin) headers[UPSTREAM_PIN_HEADER] = pin; // absent -> API guard returns 403

  const idempotencyKey = request.headers.get(IDEMPOTENCY_HEADER);
  // NOTE: the API does not consume this header yet (see handoff to `dev`); it is
  // forwarded so server-side idempotency can be added without a client change.
  if (idempotencyKey) headers[IDEMPOTENCY_HEADER] = idempotencyKey;

  let upstream: Response;
  try {
    upstream = await fetch(`${base}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body,
      cache: 'no-store',
    });
  } catch {
    return errorResponse(502, 'api_unreachable', 'La API no responde');
  }

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

/**
 * Fetch the SERVER-OWNED menu for the customer page. Runs only on the server
 * (Server Component), so there is no CORS coupling and no price input ever
 * comes from the browser. Validated with the shared Zod schema (single source
 * of truth). Throws on a missing API URL, upstream failure, timeout or invalid
 * payload so the page can render an honest error/closed state instead.
 */
export async function fetchMenu(): Promise<MenuResponse> {
  const base = getApiBase();
  if (!base) throw new Error('api_not_configured');
  const res = await fetch(`${base}/menu`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error('menu_upstream_error');
  const data: unknown = await res.json();
  return menuResponseSchema.parse(data);
}
