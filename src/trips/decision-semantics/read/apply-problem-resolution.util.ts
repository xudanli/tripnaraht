/**
 * Overlay persisted problem resolutions onto freshly collected problems.
 */

import type {
  DecisionProblemDetail,
  DecisionProblemResolution,
} from '../types/decision-semantics.types';

export function findResolutionForProblem(
  problem: Pick<DecisionProblemDetail, 'id' | 'semanticKey' | 'detectedAt'>,
  resolutions: DecisionProblemResolution[],
): DecisionProblemResolution | undefined {
  return resolutions.find(
    (r) =>
      r.problemId === problem.id ||
      (problem.semanticKey != null && r.semanticKey === problem.semanticKey),
  );
}

/** Problem re-detected on a newer trip revision after resolution. */
export function isResolutionStale(
  problem: Pick<DecisionProblemDetail, 'detectedAt' | 'tripVersion'>,
  resolution: DecisionProblemResolution,
): boolean {
  if (problem.tripVersion && resolution.resolvedTripVersion) {
    return problem.tripVersion > resolution.resolvedTripVersion;
  }
  return problem.detectedAt > resolution.resolvedAt;
}

export function applyProblemResolutions(
  items: DecisionProblemDetail[],
  resolutions: DecisionProblemResolution[],
): {
  items: DecisionProblemDetail[];
  staleSemanticKeys: string[];
} {
  if (!resolutions.length) {
    return { items, staleSemanticKeys: [] };
  }

  const staleSemanticKeys: string[] = [];
  const nextItems = items.map((item) => {
    const resolution = findResolutionForProblem(item, resolutions);
    if (!resolution) return item;

    if (isResolutionStale(item, resolution)) {
      staleSemanticKeys.push(resolution.semanticKey);
      return item;
    }

    return {
      ...item,
      status: 'RESOLVED' as const,
      resolvedAt: resolution.resolvedAt,
      resolvedByDecisionId: resolution.resolvedByDecisionId,
      resolutionKind: resolution.resolution,
    };
  });

  return { items: nextItems, staleSemanticKeys: [...new Set(staleSemanticKeys)] };
}

export function toProblemResolutionSummary(
  resolution: DecisionProblemResolution,
): import('../types/decision-semantics.types').DecisionProblemResolutionSummary {
  return {
    problemId: resolution.problemId,
    status: 'RESOLVED',
    semanticKey: resolution.semanticKey,
    resolvedAt: resolution.resolvedAt,
    resolvedByDecisionId: resolution.resolvedByDecisionId,
    resolution: resolution.resolution,
  };
}
