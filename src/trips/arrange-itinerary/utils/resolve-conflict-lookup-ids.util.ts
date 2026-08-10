/**
 * Map decision-problem / decision-case IDs → trip conflict ids for decision-basis lookup.
 * iOS may pass problemId as conflictId (dc_* / dp_*).
 */

export function expandConflictLookupIds(focusId: string): string[] {
  const id = focusId.trim();
  if (!id) return [];
  const out = new Set<string>([id]);

  if (id.startsWith('dp_id:')) {
    const stripped = id.slice('dp_id:'.length);
    out.add(stripped);
    const issue = stripped.match(/^issue-(.+)$/);
    if (issue?.[1]) out.add(issue[1]);
  }

  const travel = id.match(/^dp_travel:same_day_travel:([^:]+):([^:]+)$/);
  if (travel) {
    out.add(`same-day-travel-${travel[1]}-${travel[2]}`);
  }

  return [...out];
}

/** True when the focus id is a decision-space problem (not a raw conflict id). */
export function isDecisionSpaceFocusId(focusId: string | undefined): boolean {
  if (!focusId?.trim()) return false;
  const id = focusId.trim();
  return id.startsWith('dc_') || id.startsWith('dp_');
}

export function resolveDecisionBasisFocus(opts: {
  conflictId?: string;
  problemId?: string;
}): {
  lookupIds: string[];
  problemId?: string;
  /** Do not 404 when no trip-conflict row matches — decision cases have no conflict id. */
  allowMissingConflict: boolean;
} {
  const conflictId = opts.conflictId?.trim() || undefined;
  const problemId =
    opts.problemId?.trim() ||
    (conflictId && isDecisionSpaceFocusId(conflictId) ? conflictId : undefined);

  const raw = [conflictId, problemId].filter(Boolean) as string[];
  const lookupIds = [...new Set(raw.flatMap((id) => expandConflictLookupIds(id)))];

  return {
    lookupIds,
    problemId,
    allowMissingConflict: Boolean(problemId) || raw.some((id) => isDecisionSpaceFocusId(id)),
  };
}
