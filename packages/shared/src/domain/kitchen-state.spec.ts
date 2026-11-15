import { describe, expect, it } from 'vitest';
import { KITCHEN_STATES } from './enums';
import type { KitchenState } from './enums';
import {
  ALLOWED_KITCHEN_TRANSITIONS,
  KITCHEN_BOARD_STATES,
  canTransition,
  isKitchenBoardState,
  nextKitchenStates,
} from './kitchen-state';

const ALL: KitchenState[] = [...KITCHEN_STATES];
const EXPECTED: Record<KitchenState, KitchenState[]> = {
  nuevo: ['en_preparacion'],
  en_preparacion: ['listo'],
  listo: ['entregado'],
  entregado: [],
};

describe('kitchen state machine (one place defines allowed transitions)', () => {
  it('is exhaustive: every state has exactly the expected forward transitions', () => {
    for (const from of ALL) {
      expect(nextKitchenStates(from)).toEqual(EXPECTED[from]);
      expect([...ALLOWED_KITCHEN_TRANSITIONS[from]]).toEqual(EXPECTED[from]);
    }
  });

  it('accepts every allowed transition and rejects every other pair', () => {
    for (const from of ALL) {
      for (const to of ALL) {
        expect(canTransition(from, to)).toBe(EXPECTED[from].includes(to));
      }
    }
  });

  it('rejects skipping steps, going backwards and terminal self-loops', () => {
    expect(canTransition('nuevo', 'listo')).toBe(false);
    expect(canTransition('nuevo', 'entregado')).toBe(false);
    expect(canTransition('en_preparacion', 'nuevo')).toBe(false);
    expect(canTransition('listo', 'en_preparacion')).toBe(false);
    expect(canTransition('entregado', 'entregado')).toBe(false);
    expect(canTransition('entregado', 'nuevo')).toBe(false);
  });

  it('board shows exactly nuevo / en_preparacion / listo (entregado leaves it)', () => {
    expect([...KITCHEN_BOARD_STATES]).toEqual(['nuevo', 'en_preparacion', 'listo']);
    expect(ALL.filter(isKitchenBoardState)).toEqual(['nuevo', 'en_preparacion', 'listo']);
    expect(isKitchenBoardState('entregado')).toBe(false);
  });
});
