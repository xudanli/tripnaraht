import { sha256Hex, stableStringify } from '../../../eval/fingerprint/eval-fingerprint.util';
import type { BlockerCaseResult } from '../../blockers/blocker-case.schema';

/** Stable hash of assertion outcomes — excludes timestamps and error strings. */
export function computeBlockerResultFingerprint(result: BlockerCaseResult): string {
  const payload = {
    caseId: result.caseId,
    pass: result.pass,
    assertions: result.assertions
      .map((a) => ({
        layer: a.layer,
        name: a.name,
        pass: a.pass,
        expected: a.expected ?? null,
        actual: a.actual ?? null,
      }))
      .sort((a, b) => `${a.layer}:${a.name}`.localeCompare(`${b.layer}:${b.name}`)),
  };
  return sha256Hex(stableStringify(payload));
}

/** Final-state layers only — for FinalStatePass@N gate. */
export const FINAL_STATE_LAYERS = new Set([
  'itinerary_state',
  'decision_semantics',
  'event_store',
  'memory_canonical',
  'memory_cache',
  'memory_snapshot',
  'assembled_context',
]);

export function computeFinalStateFingerprint(result: BlockerCaseResult): string {
  const filtered = {
    caseId: result.caseId,
    pass: result.pass,
    assertions: result.assertions
      .filter((a) => FINAL_STATE_LAYERS.has(a.layer))
      .map((a) => ({
        layer: a.layer,
        name: a.name,
        pass: a.pass,
        expected: a.expected ?? null,
        actual: a.actual ?? null,
      }))
      .sort((a, b) => `${a.layer}:${a.name}`.localeCompare(`${b.layer}:${b.name}`)),
  };
  return sha256Hex(stableStringify(filtered));
}
