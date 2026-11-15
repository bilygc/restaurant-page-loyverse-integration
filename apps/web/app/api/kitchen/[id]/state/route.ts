/** PATCH /api/kitchen/:id/state -> PATCH {API}/orders/:id/kitchen-state */
import { proxyToApi } from '@/lib/server-api';

export const runtime = 'nodejs';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const body = await request.text();
  return proxyToApi(request, `/orders/${encodeURIComponent(id)}/kitchen-state`, {
    method: 'PATCH',
    body,
  });
}
