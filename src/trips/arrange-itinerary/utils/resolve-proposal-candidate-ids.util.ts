/**
 * Resolve candidateIds for createProposal(AUTO_ARRANGE).
 * Prefers payload.candidateIds; accepts top-level / snake_case fallbacks.
 */

export function resolveProposalCandidateIds(
  payload: Record<string, unknown> | null | undefined,
  topLevel?: string[] | null,
): string[] | undefined {
  const fromPayload = pickStringArray(
    payload?.candidateIds ?? payload?.candidate_ids,
  );
  if (fromPayload?.length) return fromPayload;

  const fromTop = pickStringArray(topLevel);
  if (fromTop?.length) return fromTop;

  // Explicit empty array in payload means "no filter" callers use undefined;
  // empty means load-all in builder when ?.length is falsy — return undefined.
  return undefined;
}

function pickStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = value.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
  return ids;
}
