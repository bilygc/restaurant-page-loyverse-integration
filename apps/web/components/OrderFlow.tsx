'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  MAX_ITEMS_PER_ORDER,
  MAX_NOTE_LENGTH,
  MAX_QUANTITY,
  type CreateOrderInput,
  type OrderView,
} from '@restaurant/shared';
import { ApiError, createOrder } from '@/lib/client-api';
import { formatCentavos } from '@/lib/format';
import { stateLabel, syncBadgeClass, syncLabel } from '@/lib/kitchen';
import {
  estimateTotalCentavos,
  menuItemName,
  type CartLine,
  type MenuResult,
} from '@/lib/menu';
import { shouldShowSimulatePay } from '@/lib/payment';
import { M } from '@/lib/messages';

/**
 * plan.md §9.5 + task guard: "Simular pago" is a POC-only control shown ONLY
 * when the PUBLIC payment mode is mock AND this is not a production build.
 * Both values are inlined at build time by Next.js (NEXT_PUBLIC_* / NODE_ENV).
 * Fail-closed: an unset mode hides the button. The mock charge happens inside
 * POST /orders; a 201 is the API's confirmation that the order is paid.
 */
const SHOW_SIMULATE = shouldShowSimulatePay(
  process.env.NEXT_PUBLIC_PAYMENT_MODE,
  process.env.NODE_ENV,
);

type Phase = 'idle' | 'submitting' | 'success' | 'error';

/** Idempotency token; works even over plain http (no secure context needed). */
function makeIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function orderFolio(order: OrderView): string {
  return order.loyverse_receipt_number ?? order.id.slice(0, 8).toUpperCase();
}

/**
 * Honest blocking states: the server menu could not load (error) or is empty
 * (restaurant not accepting orders / closed). Both clearly block checkout —
 * no menu, no cart, no pay button. Loading is the page's Suspense fallback.
 */
function MenuProblem({
  status,
  onRetry,
}: {
  status: 'error' | 'closed';
  onRetry: () => void;
}) {
  const isError = status === 'error';
  return (
    <section
      role={isError ? 'alert' : 'status'}
      className={`rounded-2xl border p-6 ${
        isError ? 'border-amber-300 bg-amber-50' : 'border-slate-300 bg-slate-50'
      }`}
    >
      <h2 className="text-lg font-bold text-slate-900">
        {isError ? M.menuErrorHeading : M.closedHeading}
      </h2>
      <p className="mt-1 text-sm text-slate-700">
        {isError ? M.menuErrorBody : M.closedBody}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 min-h-[44px] rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        {M.retry}
      </button>
    </section>
  );
}

export function OrderFlow({ menuResult }: { menuResult: MenuResult }) {
  const router = useRouter();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [diningOption, setDiningOption] = useState('');
  const [orderNote, setOrderNote] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [created, setCreated] = useState<OrderView | null>(null);

  // Synchronous guard against double submits, plus a key that stays stable for
  // one cart (so retries of the same order reuse it). Cleared on "new order".
  const submittingRef = useRef(false);
  const idempotencyKeyRef = useRef('');

  function addItem(menuItemId: string) {
    setCart((prev) => {
      const existing = prev.find((line) => line.menuItemId === menuItemId);
      if (existing) {
        return prev.map((line) =>
          line.menuItemId === menuItemId
            ? { ...line, quantity: Math.min(MAX_QUANTITY, line.quantity + 1) }
            : line,
        );
      }
      if (prev.length >= MAX_ITEMS_PER_ORDER) return prev;
      return [...prev, { menuItemId, quantity: 1, lineNote: '' }];
    });
  }

  function changeQty(menuItemId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((line) =>
          line.menuItemId === menuItemId
            ? { ...line, quantity: Math.min(MAX_QUANTITY, Math.max(0, line.quantity + delta)) }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }

  function removeItem(menuItemId: string) {
    setCart((prev) => prev.filter((line) => line.menuItemId !== menuItemId));
  }

  function setLineNote(menuItemId: string, value: string) {
    setCart((prev) =>
      prev.map((line) =>
        line.menuItemId === menuItemId ? { ...line, lineNote: value } : line,
      ),
    );
  }

  function buildInput(): CreateOrderInput {
    return {
      // NO prices here. The server recomputes integer centavos from its own
      // pricelist. Only ids, quantities and (bounded, untrusted) notes.
      items: cart.map((line) => ({
        menu_item_id: line.menuItemId,
        quantity: line.quantity,
        ...(line.lineNote.trim() ? { line_note: line.lineNote.trim() } : {}),
      })),
      ...(diningOption ? { dining_option: diningOption } : {}),
      ...(orderNote.trim() ? { note: orderNote.trim() } : {}),
    };
  }

  async function handleSubmit() {
    if (!SHOW_SIMULATE || cart.length === 0 || submittingRef.current) return;
    submittingRef.current = true;
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = makeIdempotencyKey();
    const key = idempotencyKeyRef.current;
    setPhase('submitting');
    try {
      const result = await createOrder(buildInput(), key);
      setCreated(result); // status comes ONLY from the API response (201 = paid in mock)
      setPhase('success');
    } catch (err) {
      // Do not surface raw upstream detail to customers; keep it honest/generic.
      void (err instanceof ApiError ? err.detail : '');
      setPhase('error');
    } finally {
      submittingRef.current = false;
    }
  }

  function handleReset() {
    setCart([]);
    setDiningOption('');
    setOrderNote('');
    setCreated(null);
    setPhase('idle');
    idempotencyKeyRef.current = '';
  }

  // ---- Non-ready menu states block checkout clearly (loading is Suspense) ----
  // router.refresh() re-runs the Server Component (re-fetches GET /menu); the
  // cart is empty in these states, so a refresh cannot lose customer input.
  if (menuResult.status !== 'ready') {
    return <MenuProblem status={menuResult.status} onRetry={() => router.refresh()} />;
  }

  const menu = menuResult.menu;
  const subtotal = cart.length > 0 ? estimateTotalCentavos(cart, menu) : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* ---- Result of a successful "Simular pago" ---- */}
      {phase === 'success' && created ? (
        <section
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5"
        >
          <h2 className="text-lg font-bold text-emerald-900">{M.orderCreatedHeading}</h2>
          <p className="mt-1 text-sm text-emerald-800">{M.orderCreatedNote}</p>
          <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-2 rounded-lg bg-white/70 px-3 py-2">
              <dt className="text-slate-600">{M.folioLabel}</dt>
              <dd className="font-semibold text-slate-900">#{orderFolio(created)}</dd>
            </div>
            <div className="flex justify-between gap-2 rounded-lg bg-white/70 px-3 py-2">
              <dt className="text-slate-600">{M.totalConfirmed}</dt>
              <dd className="font-semibold tabular-nums text-slate-900">
                {formatCentavos(created.total_centavos)}
              </dd>
            </div>
            <div className="flex justify-between gap-2 rounded-lg bg-white/70 px-3 py-2">
              <dt className="text-slate-600">{M.kitchenStateLabel}</dt>
              <dd className="font-semibold text-slate-900">{stateLabel(created.kitchen_state)}</dd>
            </div>
            <div className="flex justify-between gap-2 rounded-lg bg-white/70 px-3 py-2">
              <dt className="text-slate-600">{M.syncStatusLabel}</dt>
              <dd>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${syncBadgeClass(created.sync_status)}`}
                >
                  {syncLabel(created.sync_status)}
                </span>
              </dd>
            </div>
            {created.loyverse_receipt_number ? (
              <div className="col-span-full flex justify-between gap-2 rounded-lg bg-white/70 px-3 py-2">
                <dt className="text-slate-600">{M.receiptNumberLabel}</dt>
                <dd className="break-all font-mono text-slate-900">
                  {created.loyverse_receipt_number}
                </dd>
              </div>
            ) : null}
          </dl>
          <button
            type="button"
            onClick={handleReset}
            className="mt-4 min-h-[44px] w-full rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            {M.newOrderButton}
          </button>
        </section>
      ) : null}

      {/* ---- Menu (server-owned, from GET /menu) ---- */}
      <section aria-labelledby="menu-heading">
        <h2 id="menu-heading" className="text-lg font-semibold text-slate-900">
          {M.menuHeading}
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">{M.estimateDisclaimer}</p>
        <ul className="mt-3 flex flex-col gap-3">
          {menu.items.map((item) => (
            <li
              key={item.menu_item_id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div>
                <p className="font-medium text-slate-900">{item.item_name}</p>
                <p className="text-sm tabular-nums text-slate-600">
                  {formatCentavos(item.unit_price_centavos)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => addItem(item.menu_item_id)}
                aria-label={`${M.addButton} ${item.item_name}`}
                className="min-h-[44px] shrink-0 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                {M.addButton}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* ---- Cart + checkout (hidden while showing the result) ---- */}
      {phase === 'success' ? null : (
        <section aria-labelledby="cart-heading" className="flex flex-col gap-4">
          <h2 id="cart-heading" className="text-lg font-semibold text-slate-900">
            {M.cartHeading}
          </h2>

          {cart.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              {M.cartEmpty}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {cart.map((line) => {
                const name = menuItemName(menu, line.menuItemId);
                return (
                  <li key={line.menuItemId} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-900">{name}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => changeQty(line.menuItemId, -1)}
                          aria-label={`${M.decreaseAria} ${name}`}
                          className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 text-lg font-bold text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                        >
                          −
                        </button>
                        <span className="min-w-[2rem] text-center tabular-nums font-semibold" aria-label={M.quantityLabel}>
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => changeQty(line.menuItemId, 1)}
                          aria-label={`${M.increaseAria} ${name}`}
                          className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 text-lg font-bold text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => removeItem(line.menuItemId)}
                          aria-label={`${M.removeAria} ${name}`}
                          className="ml-1 min-h-[44px] rounded-lg px-2 text-sm text-red-700 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-col gap-1">
                      <label
                        htmlFor={`note-${line.menuItemId}`}
                        className="text-xs font-medium text-slate-600"
                      >
                        {M.lineNoteLabel}
                      </label>
                      <input
                        id={`note-${line.menuItemId}`}
                        type="text"
                        maxLength={MAX_NOTE_LENGTH}
                        value={line.lineNote}
                        onChange={(e) => setLineNote(line.menuItemId, e.target.value)}
                        placeholder={M.lineNotePlaceholder}
                        className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Optional order fields (real CreateOrderInput fields, not prices). */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="dining-option" className="text-sm font-medium text-slate-700">
                {M.diningOptionLabel}
              </label>
              <select
                id="dining-option"
                value={diningOption}
                onChange={(e) => setDiningOption(e.target.value)}
                className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                <option value="">{M.diningOptionPlaceholder}</option>
                {M.diningOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="order-note" className="text-sm font-medium text-slate-700">
                {M.orderNoteLabel}
              </label>
              <textarea
                id="order-note"
                maxLength={MAX_NOTE_LENGTH}
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
                placeholder={M.orderNotePlaceholder}
                rows={2}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              />
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-base">
            <span className="text-slate-600">{M.subtotalEstimate}</span>
            <span className="font-bold tabular-nums text-slate-900">{formatCentavos(subtotal)}</span>
          </div>

          {phase === 'error' ? (
            <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-semibold">{M.checkoutErrorTitle}</p>
              <p>{M.genericError}</p>
              <button
                type="button"
                onClick={handleSubmit}
                className="mt-2 min-h-[44px] rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                {M.retry}
              </button>
            </div>
          ) : null}

          {SHOW_SIMULATE ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={cart.length === 0 || phase === 'submitting'}
              className="min-h-[52px] w-full rounded-xl bg-emerald-700 px-4 text-base font-bold text-white hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {phase === 'submitting' ? M.processingButton : M.simulatePayButton}
            </button>
          ) : (
            <p className="rounded-lg bg-slate-100 p-4 text-center text-sm text-slate-600">
              {M.paymentsSoon}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
