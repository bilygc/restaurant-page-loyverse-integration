import { describe, expect, it } from 'vitest';
import {
  advanceLabel,
  BOARD_COLUMNS,
  columnAccentClass,
  columnTitle,
  nextState,
  originBadgeClass,
  originLabel,
  stateLabel,
  syncBadgeClass,
  syncLabel,
} from './kitchen';

describe('BOARD_COLUMNS', () => {
  it('is exactly the three non-terminal columns, in display order', () => {
    expect([...BOARD_COLUMNS]).toEqual(['nuevo', 'en_preparacion', 'listo']);
  });
});

describe('nextState', () => {
  it('delegates to the shared state machine, one forward step at a time', () => {
    expect(nextState('nuevo')).toBe('en_preparacion');
    expect(nextState('en_preparacion')).toBe('listo');
    expect(nextState('listo')).toBe('entregado');
  });

  it('is null for the terminal (entregado) state', () => {
    expect(nextState('entregado')).toBeNull();
  });
});

describe('Spanish labels (es-MX)', () => {
  it('stateLabel / columnTitle', () => {
    expect(stateLabel('nuevo')).toBe('Nuevo');
    expect(stateLabel('en_preparacion')).toBe('En preparación');
    expect(stateLabel('listo')).toBe('Listo');
    expect(stateLabel('entregado')).toBe('Entregado');
    expect(columnTitle('en_preparacion')).toBe('En preparación');
  });

  it('originLabel / syncLabel', () => {
    expect(originLabel('web')).toBe('Web');
    expect(originLabel('pos')).toBe('POS');
    expect(syncLabel('pending')).toBe('Pendiente');
    expect(syncLabel('synced')).toBe('Sincronizado');
    expect(syncLabel('failed')).toBe('Con reintento');
  });
});

describe('advanceLabel', () => {
  it('labels each forward step', () => {
    expect(advanceLabel('nuevo')).toBe('Iniciar preparación');
    expect(advanceLabel('en_preparacion')).toBe('Marcar listo');
    expect(advanceLabel('listo')).toBe('Marcar entregado');
  });

  it('is null when there is no forward step (terminal state)', () => {
    expect(advanceLabel('entregado')).toBeNull();
  });
});

describe('presentation class maps', () => {
  it('originBadgeClass distinguishes web vs pos', () => {
    expect(originBadgeClass('web')).toContain('blue');
    expect(originBadgeClass('pos')).toContain('amber');
  });

  it('syncBadgeClass covers all three sync statuses', () => {
    expect(syncBadgeClass('synced')).toContain('emerald');
    expect(syncBadgeClass('pending')).toContain('slate');
    expect(syncBadgeClass('failed')).toContain('red');
  });

  it('columnAccentClass covers all four kitchen states', () => {
    expect(columnAccentClass('nuevo')).toContain('blue');
    expect(columnAccentClass('en_preparacion')).toContain('amber');
    expect(columnAccentClass('listo')).toContain('emerald');
    expect(columnAccentClass('entregado')).toContain('slate');
  });
});
