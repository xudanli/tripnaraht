/**
 * Items that should not participate in consecutive TIME / TRANSPORT pairing.
 * REST (lodging) and SUPPLY (fuel / groceries) are support, not visit slots.
 */

export function participatesInScheduleConflict(item: {
  type?: string | null;
  Place?: { category?: string | null } | null;
}): boolean {
  if (item.type === 'REST') return false;
  if (item.Place?.category === 'SUPPLY') return false;
  return true;
}
