import type { RiskMetricBag } from '../knowledge/risk-metric-extraction.util';
import { RiskGenerationMode } from '../../../generated/execution-risk-contracts';
import type { ActiveRiskCode, ActiveRiskType, RiskSourceProjection } from '../types/execution-risk.types';
import { buildRiskKey } from '../utils/risk-key.util';

export function buildHarnessProjection(input: {
  tripId: string;
  scenarioId: string;
  subject: string;
  type: ActiveRiskType;
  code: ActiveRiskCode;
  knowledgeCode: string;
  title: string;
  summary: string;
  detectedAt: string;
  metrics: RiskMetricBag;
  isRootCause: boolean;
  generationMode: RiskGenerationMode;
  rootEventId: string;
  sourceId: string;
  sourceSystem: RiskSourceProjection['sourceRefs'][number]['sourceSystem'];
  affectedMembers?: RiskSourceProjection['affectedMembers'];
}): RiskSourceProjection {
  const riskKey = buildRiskKey({
    tripId: input.tripId,
    type: input.type,
    code: input.code,
    normalizedSubject: input.subject,
    affectedScope: input.scenarioId,
  });

  return {
    riskKey,
    tripId: input.tripId,
    type: input.type,
    code: input.code,
    title: input.title,
    summary: input.summary,
    level: 'HIGH',
    executionGate: 'REPLAN_REQUIRED',
    lifecycleStatus: 'ACTIVE',
    detectedAt: input.detectedAt,
    updatedAt: input.detectedAt,
    validUntil: new Date(Date.now() + 6 * 3600_000).toISOString(),
    affectedMembers: input.affectedMembers ?? [],
    affectedActivities: [],
    affectedLocations: [],
    affectedRouteSegments: [],
    sourceRefs: [{ sourceSystem: input.sourceSystem, sourceId: input.sourceId }],
    evidenceRefs: [{ id: input.sourceId, observedAt: input.detectedAt }],
    recommendationIds: [],
    interventionIds: [],
    decisionProblemIds: [],
    sourcePriority: 40,
    knowledgeCode: input.knowledgeCode,
    isRootCause: input.isRootCause,
    generationMode: input.generationMode,
    observedMetrics: input.metrics,
    rootEventId: input.rootEventId,
  };
}
