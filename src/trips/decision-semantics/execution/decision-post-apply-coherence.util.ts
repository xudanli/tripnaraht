/**
 * Post-apply coherence — itinerary mutation succeeded but downstream route/feasibility
 * recalculation may still fail. Release gate STATE-BLOCKER-PARTIAL-001.
 */

export type PostApplyCoherenceOutcome = 'COMPLETE' | 'ROLLED_BACK' | 'PARTIALLY_APPLIED';

export type PostApplyCoherenceResult = {
  outcome: PostApplyCoherenceOutcome;
  failureCode?: string;
  failureMessage?: string;
  phase: 'route_recalc';
  needsRepair?: boolean;
};

export async function runPostApplyCoherenceCheck(input: {
  tripId: string;
  validate: (tripId: string) => Promise<unknown>;
  rollback?: (tripId: string) => Promise<{ ok: boolean }>;
}): Promise<PostApplyCoherenceResult> {
  try {
    await input.validate(input.tripId);
    return { outcome: 'COMPLETE', phase: 'route_recalc' };
  } catch (e: unknown) {
    const failureMessage = e instanceof Error ? e.message : String(e);
    const failureCode = extractFailureCode(failureMessage);

    if (input.rollback) {
      const rb = await input.rollback(input.tripId);
      if (rb.ok) {
        return {
          outcome: 'ROLLED_BACK',
          phase: 'route_recalc',
          failureCode,
          failureMessage,
        };
      }
    }

    return {
      outcome: 'PARTIALLY_APPLIED',
      phase: 'route_recalc',
      failureCode,
      failureMessage,
      needsRepair: true,
    };
  }
}

function extractFailureCode(message: string): string {
  const m = message.match(/^([A-Z0-9_]+)(?::|\s|$)/);
  return m?.[1] ?? 'ROUTE_RECALC_FAILED';
}

/** Illegal: user-visible APPLIED/EXECUTED while post-apply coherence did not complete. */
export function isIllegalAppliedWithIncompleteCoherence(input: {
  recordStatus: string;
  executionStatus?: string;
  postApplyOutcome?: PostApplyCoherenceOutcome;
}): boolean {
  if (input.postApplyOutcome === 'COMPLETE' || input.postApplyOutcome === undefined) {
    return false;
  }
  if (input.recordStatus === 'EXECUTED' && input.executionStatus === 'APPLIED') {
    return true;
  }
  return (
    input.recordStatus === 'EXECUTED' &&
    (input.postApplyOutcome === 'ROLLED_BACK' || input.postApplyOutcome === 'PARTIALLY_APPLIED')
  );
}
