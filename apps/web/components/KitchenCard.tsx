'use client';

import type { KitchenOrderView } from '@restaurant/shared';
import { formatElapsed, elapsedUrgency } from '@/lib/format';
import {
  advanceLabel,
  originBadgeClass,
  originLabel,
  syncBadgeClass,
  syncLabel,
} from '@/lib/kitchen';
import { M } from '@/lib/messages';

/**
 * Short, human-readable order id. There is no dedicated `order_number` field
 * in the contract: the Loyverse receipt number is shown separately (below), so
 * the card always carries BOTH our short id and the receipt when present.
 */
function shortOrderId(order: KitchenOrderView): string {
  return order.id.slice(0, 8).toUpperCase();
}

const urgencyClass: Record<'normal' | 'warn' | 'late', string> = {
  normal: 'text-slate-600',
  warn: 'text-amber-700',
  late: 'text-red-700 font-bold',
};

export function KitchenCard({
  order,
  now,
  pending,
  onAdvance,
}: {
  order: KitchenOrderView;
  now: number;
  pending: boolean;
  onAdvance: (order: KitchenOrderView) => void;
}) {
  const label = advanceLabel(order.kitchen_state);
  const folio = shortOrderId(order);
  const urgency = elapsedUrgency(order.created_at, now);

  return (
    <article className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      {/* Header: short id + origin + dining badge + elapsed */}
      <header className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-bold text-slate-900">#{folio}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${originBadgeClass(order.origin)}`}
          >
            {originLabel(order.origin)}
          </span>
          {order.dining_option ? (
            <span
              title={order.dining_option}
              className="max-w-[12rem] truncate rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-900 ring-1 ring-indigo-300"
            >
              {order.dining_option}
            </span>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <span className="block text-[10px] uppercase tracking-wide text-slate-400">
            {M.elapsedCaption}
          </span>
          <span className={`tabular-nums text-sm ${urgencyClass[urgency]}`}>
            {formatElapsed(order.created_at, now)}
          </span>
        </div>
      </header>

      {/* Items (rendered as text; never as HTML) */}
      <ul className="flex flex-col gap-1.5 border-y border-slate-100 py-2">
        {order.items.map((item) => (
          <li key={item.id} className="text-sm text-slate-800">
            <span className="font-bold tabular-nums">{item.quantity}×</span> {item.item_name}
            {item.line_note ? (
              <span className="ml-1 block pl-5 text-xs italic text-slate-600">
                “{item.line_note}”
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {/* Order note (untrusted text, rendered as text) */}
      {order.note ? (
        <p className="break-words text-sm text-slate-700">
          <span className="font-semibold">{M.noteCaption}:</span> {order.note}
        </p>
      ) : null}

      {/* Sync badge + Loyverse receipt number */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full px-2 py-0.5 font-medium ring-1 ${syncBadgeClass(order.sync_status)}`}>
          {syncLabel(order.sync_status)}
        </span>
        {order.loyverse_receipt_number ? (
          <span className="break-all text-slate-500">
            {M.receiptCaption}: <span className="font-mono">{order.loyverse_receipt_number}</span>
          </span>
        ) : null}
      </div>

      {/* One-tap advance */}
      {label ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => onAdvance(order)}
          aria-label={`${label} — pedido #${folio}`}
          className="mt-1 min-h-[44px] w-full rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? M.processingButton : label}
        </button>
      ) : null}
    </article>
  );
}
