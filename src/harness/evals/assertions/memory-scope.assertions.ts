import {
  assertBlockerLayer,
  type BlockerAssertionResult,
} from '../blockers/blocker-case.schema';

const DEFAULT_FORBIDDEN_SNIPPETS = ['8点前', '20:00', '八点前', 'must return by 8pm'];

/**
 * Assembled-context layer — the hard gate for cross-trip memory leakage.
 * DB row isolation alone is insufficient; downstream assemble must not inject foreign facts.
 */
export function assertAssembledContextExcludes(input: {
  assembledText: string;
  forbiddenSnippets?: string[];
  label: string;
}): BlockerAssertionResult[] {
  const snippets = input.forbiddenSnippets ?? DEFAULT_FORBIDDEN_SNIPPETS;
  const hits = snippets.filter((s) => input.assembledText.includes(s));
  return [
    assertBlockerLayer(
      'assembled_context',
      input.label,
      hits.length === 0,
      'none of ' + snippets.join(', '),
      hits.length ? hits : 'clean',
      hits.length ? `Foreign constraint leaked into assemble: ${hits.join(', ')}` : undefined,
    ),
  ];
}

export function assertAssembledContextIncludes(input: {
  assembledText: string;
  requiredSnippets: string[];
  label: string;
}): BlockerAssertionResult[] {
  const missing = input.requiredSnippets.filter((s) => !input.assembledText.includes(s));
  return [
    assertBlockerLayer(
      'assembled_context',
      input.label,
      missing.length === 0,
      input.requiredSnippets,
      missing.length ? missing : 'present',
    ),
  ];
}

export function assertConstraintSinkPatchScope(input: {
  tripId: string;
  ownerTripId: string;
  patchCount: number;
  label: string;
}): BlockerAssertionResult[] {
  return [
    assertBlockerLayer(
      'memory_canonical',
      input.label,
      input.tripId === input.ownerTripId ? input.patchCount >= 0 : input.patchCount === 0,
      input.tripId === input.ownerTripId ? '>=0 patches on owner trip' : 0,
      input.patchCount,
    ),
  ];
}
