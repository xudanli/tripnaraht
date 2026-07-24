/**
 * Multi-source detector / origin projection for Unified Decision Problem SSOT.
 */

import type { Rfc001DecisionCenterProblemView } from '../../../trips/guardian-decision-core/adapters/decision-center-bridge.adapter';
import type {
  DecisionProblemDetail,
  DecisionProblemSummary,
} from '../../../trips/decision-semantics/types/decision-semantics.types';
import type {
  DecisionProblemDetector,
  DecisionProblemOrigin,
} from '../contracts/unified-decision-ui.types';

const DETECTOR_LABELS: Record<string, string> = {
  FEASIBILITY: '可行性分析',
  GATE: 'Plan Gate',
  GUARDIAN: 'Guardian',
  TRIP_CONSTRAINT: '行程约束',
  VERIFY: '验证',
  EXECUTION_MONITOR: '行中监控',
  USER: '用户',
  CANONICAL_RUNTIME: 'Canonical Runtime',
  SCHEDULE: '日程冲突',
};

function labelForDetector(detectorId: string): string {
  return DETECTOR_LABELS[detectorId] ?? detectorId;
}

function detectorEntry(
  detectorId: string,
  sourceRefIds?: string[],
): DecisionProblemDetector {
  return {
    detectorId,
    label: labelForDetector(detectorId),
    ...(sourceRefIds?.length ? { sourceRefIds: [...new Set(sourceRefIds)] } : {}),
  };
}

export function buildDetectorsFromLegacyDetail(detail: DecisionProblemDetail): DecisionProblemDetector[] {
  const byId = new Map<string, DecisionProblemDetector>();

  const add = (detectorId: string, refIds?: string[]) => {
    const existing = byId.get(detectorId);
    const mergedRefs = [...new Set([...(existing?.sourceRefIds ?? []), ...(refIds ?? [])])];
    byId.set(detectorId, detectorEntry(detectorId, mergedRefs.length ? mergedRefs : undefined));
  };

  add(detail.detectedBy, detail.sourceRefs.map((r) => r.refId));

  for (const ref of detail.sourceRefs) {
    add(ref.system, [ref.refId]);
  }

  for (const assertion of detail.assertions) {
    add(assertion.sourceSystem, [
      assertion.sourceRefId,
      ...assertion.proofs.map((p) => p.id).filter((id): id is string => Boolean(id)),
    ]);
  }

  return [...byId.values()];
}

export function buildDetectorsFromLegacySummary(summary: DecisionProblemSummary): DecisionProblemDetector[] {
  return [detectorEntry(summary.detectedBy)];
}

export function buildDetectorsFromCanonicalProblem(
  problem: Rfc001DecisionCenterProblemView,
): DecisionProblemDetector[] {
  const cap = problem.rfc001Problem.semanticCapability;
  const detectors: DecisionProblemDetector[] = [
    detectorEntry('GUARDIAN', [problem.rfc001Problem.triggerEventId]),
    detectorEntry('CANONICAL_RUNTIME', [problem.problemId]),
  ];
  if (cap) {
    detectors.push(detectorEntry(cap, [problem.rfc001Problem.triggerEventId]));
  }
  return detectors;
}

export function buildOriginFromLegacy(input: {
  authority: 'LEGACY';
  detail?: DecisionProblemDetail;
  summary?: DecisionProblemSummary;
}): DecisionProblemOrigin {
  const primaryDetector = input.detail?.detectedBy ?? input.summary?.detectedBy ?? 'FEASIBILITY';
  return {
    authority: 'LEGACY',
    primaryDetector,
    engineId: 'LEGACY_V15_ADAPTER',
  };
}

export function buildOriginFromCanonical(problem: Rfc001DecisionCenterProblemView): DecisionProblemOrigin {
  return {
    authority: 'CANONICAL',
    primaryDetector: 'GUARDIAN',
    engineId: 'CANONICAL_DECISION_RUNTIME',
    triggerEventId: problem.rfc001Problem.triggerEventId,
  };
}

export function mergeDetectors(
  left: DecisionProblemDetector[],
  right: DecisionProblemDetector[],
): DecisionProblemDetector[] {
  const byId = new Map<string, DecisionProblemDetector>();
  for (const d of [...left, ...right]) {
    const existing = byId.get(d.detectorId);
    const sourceRefIds = [...new Set([...(existing?.sourceRefIds ?? []), ...(d.sourceRefIds ?? [])])];
    byId.set(d.detectorId, detectorEntry(d.detectorId, sourceRefIds.length ? sourceRefIds : undefined));
  }
  return [...byId.values()];
}

export function mergeOrigins(
  left: DecisionProblemOrigin,
  right: DecisionProblemOrigin,
): DecisionProblemOrigin {
  if (left.authority === 'CANONICAL') return left;
  if (right.authority === 'CANONICAL') return right;
  return left;
}
