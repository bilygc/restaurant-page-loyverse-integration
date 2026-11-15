/**
 * Browser API client. Talks ONLY to same-origin Next.js Route Handlers
 * (`/api/*`), which proxy to the NestJS API. No direct cross-origin calls, so
 * there is no CORS coupling and no secret in the client bundle.
 *
 * All functions throw `ApiError` on non-2xx so components can render honest
 * error states (403 = wrong PIN, 502/503 = API unreachable/config, etc.).
 */
import type { CreateOrderInput, KitchenOrderView, KitchenState, OrderView } from '@restaurant/shared';

/** Header the browser uses to pass the operator-entered PIN to the proxy. */
export const PIN_HEADER = 'X-Kitchen-Pin';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(`API error ${status}: ${detail}`);
    this.name = 'ApiError';
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  let detail = '';
  try {
    const body = (await res.json()) as { message?: string; error?: string };
    detail = body.message ?? body.error ?? '';
  } catch {
    /* non-JSON error body: keep detail empty */
  }
  return new ApiError(res.status, detail);
}

export async function fetchKitchenColumn(
  state: KitchenState,
  pin: string,
  signal?: AbortSignal,
): Promise<KitchenOrderView[]> {
  const res = await fetch(`/api/kitchen?state=${encodeURIComponent(state)}`, {
    method: 'GET',
    headers: { [PIN_HEADER]: pin },
    cache: 'no-store',
    signal,
  });
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as KitchenOrderView[];
}

export async function advanceKitchenState(
  id: string,
  state: KitchenState,
  pin: string,
): Promise<KitchenOrderView> {
  const res = await fetch(`/api/kitchen/${encodeURIComponent(id)}/state`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', [PIN_HEADER]: pin },
    body: JSON.stringify({ state }),
    cache: 'no-store',
  });
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as KitchenOrderView;
}

export async function createOrder(
  input: CreateOrderInput,
  idempotencyKey: string,
): Promise<OrderView> {
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as OrderView;
}
