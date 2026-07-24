/**
 * ITINERARY_ADJUST AUTO / SEMI_AUTO 写回门禁（P0-1）。
 * FLAWED_DRAFT（metadata.flawed_draft_narrate）禁止自动落库。
 */

export function shouldBlockAutoApplyForFlawedDraft(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return metadata?.flawed_draft_narrate === true;
}

export const FLAWED_DRAFT_AUTO_APPLY_BLOCK_REASON = 'flawed_draft_forbidden' as const;
