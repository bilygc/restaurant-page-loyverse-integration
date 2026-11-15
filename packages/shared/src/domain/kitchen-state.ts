import { KITCHEN_STATES } from './enums';
import type { KitchenState } from './enums';

/**
 * The kitchen state machine lives in ONE place (project invariant).
 * Only forward, one-step transitions are allowed. `entregado` is terminal.
 * Loyverse is never updated with kitchen state (plan.md §9.2).
 */
export const ALLOWED_KITCHEN_TRANSITIONS: Readonly<Record<KitchenState, readonly KitchenState[]>> =
  {
    nuevo: ['en_preparacion'],
    en_preparacion: ['listo'],
    listo: ['entregado'],
    entregado: [],
  };

/** States reachable from `from` in a single valid step. */
export function nextKitchenStates(from: KitchenState): readonly KitchenState[] {
  return ALLOWED_KITCHEN_TRANSITIONS[from];
}

/** Whether `from -> to` is a valid kitchen transition. */
export function canTransition(from: KitchenState, to: KitchenState): boolean {
  return ALLOWED_KITCHEN_TRANSITIONS[from].includes(to);
}

/** Guard against accidental drift: the transition map covers every state. */
export const KITCHEN_STATE_LIST: readonly KitchenState[] = KITCHEN_STATES;

/**
 * States shown on the kitchen board (plan.md §9.7: columns nuevo / en
 * preparación / listo). `entregado` is terminal and leaves the board. Kept in
 * the shared kernel so the API and the screen agree on exactly one set.
 */
export const KITCHEN_BOARD_STATES: readonly KitchenState[] = ['nuevo', 'en_preparacion', 'listo'];

export function isKitchenBoardState(state: KitchenState): boolean {
  return KITCHEN_BOARD_STATES.includes(state);
}
