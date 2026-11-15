/** POST /api/orders -> POST {API}/orders (simulated payment is internal). */
import { proxyToApi } from '@/lib/server-api';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  return proxyToApi(request, '/orders', { method: 'POST', body });
}
