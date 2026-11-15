/** GET /api/kitchen?state=<kitchen_state> -> GET {API}/kitchen?state=... */
import { isKitchenState, proxyToApi } from '@/lib/server-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const state = new URL(request.url).searchParams.get('state');
  // Whitelist: never forward arbitrary query params to the API.
  if (!isKitchenState(state)) {
    return new Response(JSON.stringify({ error: 'invalid_state' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  return proxyToApi(request, `/kitchen?state=${encodeURIComponent(state)}`, { method: 'GET' });
}
