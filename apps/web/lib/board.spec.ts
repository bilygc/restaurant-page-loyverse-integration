import { describe, expect, it } from 'vitest';
import { newOrderIds } from './board';

describe('newOrderIds', () => {
  it('returns [] on the first load (previous === null) so existing orders never chime', () => {
    expect(newOrderIds(null, ['a', 'b'])).toEqual([]);
  });

  it('returns only ids that were not seen before', () => {
    expect(newOrderIds(new Set(['a']), ['a', 'b', 'c'])).toEqual(['b', 'c']);
  });

  it('returns all ids when nothing was seen before', () => {
    expect(newOrderIds(new Set(), ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('returns [] when there are no current ids', () => {
    expect(newOrderIds(new Set(['a']), [])).toEqual([]);
  });

  it('returns [] when every current id was already seen', () => {
    expect(newOrderIds(new Set(['a', 'b']), ['a', 'b'])).toEqual([]);
  });

  it('preserves the order and multiplicity of the current list', () => {
    expect(newOrderIds(new Set(['x']), ['b', 'a', 'b'])).toEqual(['b', 'a', 'b']);
  });

  it('does not mutate the previous set', () => {
    const previous = new Set(['a']);
    newOrderIds(previous, ['a', 'b']);
    expect([...previous]).toEqual(['a']);
  });
});
