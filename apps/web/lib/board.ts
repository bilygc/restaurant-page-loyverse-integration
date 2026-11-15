/**
 * Pure helper for the new-order audio chime / announcement.
 *
 * `previous === null` means "first successful load": we must NOT chime for the
 * orders that are already on the board when the screen opens — only for orders
 * that arrive afterwards. The caller seeds `previous` with the current ids on
 * that first load.
 */
export function newOrderIds(
  previous: ReadonlySet<string> | null,
  current: readonly string[],
): string[] {
  if (previous === null) return [];
  return current.filter((id) => !previous.has(id));
}
