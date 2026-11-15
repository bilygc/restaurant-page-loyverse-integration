/**
 * Pure kitchen-board helpers. The state machine itself is NOT redefined here:
 * `nextKitchenStates` comes from @restaurant/shared (single source of truth).
 * These helpers only map shared enums to Spanish labels and presentation.
 */
import { nextKitchenStates } from '@restaurant/shared';
import type { KitchenState, OrderOrigin, SyncStatus } from '@restaurant/shared';
import { M } from './messages';

/** The three KDS columns (plan.md §9.7). `entregado` is terminal, not a column. */
export const BOARD_COLUMNS: readonly KitchenState[] = ['nuevo', 'en_preparacion', 'listo'];

/** Next valid state, or `null` when the order is terminal (`entregado`). */
export function nextState(from: KitchenState): KitchenState | null {
  return nextKitchenStates(from)[0] ?? null;
}

export function stateLabel(state: KitchenState): string {
  return M.stateLabels[state];
}

export function columnTitle(state: KitchenState): string {
  return M.columnTitles[state];
}

export function originLabel(origin: OrderOrigin): string {
  return M.originLabels[origin];
}

export function syncLabel(status: SyncStatus): string {
  return M.syncLabels[status];
}

/** Label for the "advance" button, or `null` when there is no forward step. */
export function advanceLabel(from: KitchenState): string | null {
  const next = nextState(from);
  if (next === null) return null;
  return M.advanceLabels[from] || null;
}

// ---- Presentation class maps (Tailwind strings; no logic) ----

export function originBadgeClass(origin: OrderOrigin): string {
  return origin === 'web'
    ? 'bg-blue-100 text-blue-900 ring-blue-300'
    : 'bg-amber-100 text-amber-900 ring-amber-300';
}

export function syncBadgeClass(status: SyncStatus): string {
  switch (status) {
    case 'synced':
      return 'bg-emerald-100 text-emerald-900 ring-emerald-300';
    case 'pending':
      return 'bg-slate-100 text-slate-700 ring-slate-300';
    case 'failed':
      return 'bg-red-100 text-red-900 ring-red-300';
  }
}

export function columnAccentClass(state: KitchenState): string {
  switch (state) {
    case 'nuevo':
      return 'border-t-blue-500';
    case 'en_preparacion':
      return 'border-t-amber-500';
    case 'listo':
      return 'border-t-emerald-500';
    case 'entregado':
      return 'border-t-slate-400';
  }
}
