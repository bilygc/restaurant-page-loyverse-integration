import { Suspense } from 'react';
import Link from 'next/link';
import { OrderFlow } from '@/components/OrderFlow';
import { fetchMenu } from '@/lib/server-api';
import type { MenuResult } from '@/lib/menu';
import { M } from '@/lib/messages';

// The menu is SERVER-OWNED and fetched per request from the NestJS API. Never
// prerender it as static content (prices/totals must always come from the API).
export const dynamic = 'force-dynamic';

/** Suspense fallback → the "loading" state for the customer screen. */
function MenuLoading() {
  return (
    <section aria-busy="true" aria-label={M.menuHeading} className="flex flex-col gap-3">
      <div className="h-6 w-24 animate-pulse rounded bg-slate-200" />
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4"
        >
          <div className="flex flex-col gap-2">
            <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-16 animate-pulse rounded bg-slate-100" />
          </div>
          <div className="h-11 w-20 animate-pulse rounded-lg bg-slate-200" />
        </div>
      ))}
      <p role="status" className="sr-only">
        {M.menuLoading}
      </p>
    </section>
  );
}

/**
 * Async Server Component: fetch GET /menu server-to-server and reduce it to a
 * discriminated result. Loading is streamed via the Suspense fallback above;
 * an upstream/Zod failure becomes `error`, and an empty menu becomes `closed`.
 * Both are honest states that clearly block checkout inside <OrderFlow/>.
 */
async function MenuSection() {
  let result: MenuResult;
  try {
    const menu = await fetchMenu(); // validated with the shared menuResponseSchema
    result = menu.items.length > 0 ? { status: 'ready', menu } : { status: 'closed' };
  } catch {
    result = { status: 'error' };
  }
  return <OrderFlow menuResult={result} />;
}

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{M.brandTitle}</h1>
        <p className="text-sm text-slate-600">{M.brandSubtitle}</p>
      </header>

      <Suspense fallback={<MenuLoading />}>
        <MenuSection />
      </Suspense>

      <footer className="mt-auto border-t border-slate-200 pt-4">
        <Link
          href="/cocina"
          className="inline-flex min-h-[44px] items-center text-sm font-medium text-slate-500 underline underline-offset-4 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          {M.kitchenLink}
        </Link>
      </footer>
    </main>
  );
}
