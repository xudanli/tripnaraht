import type { RiskMetricBag } from '../knowledge/risk-metric-extraction.util';
import { RiskGenerationMode } from '../../../generated/execution-risk-contracts';
import type { ActiveRiskType, RiskSourceProjection } from '../types/execution-risk.types';
import {
  resolveRiskTypeForKnowledge,
  resolveRuntimeCodeForKnowledge,
} from '../knowledge/knowledge-runtime-code.util';
import type { PackageHarnessScenario } from './package-harness.types';
import { buildHarnessProjection } from './package-harness-projection.util';

export function projectHarnessPlanSimulationRisks(
  scenario: PackageHarnessScenario,
): RiskSourceProjection[] {
  if (!scenario.category.includes('SCHEDULE')) return [];

  const tripId = `harness_trip_${scenario.scenarioId}`;
  const detectedAt = scenario.context?.currentTime
    ? String(scenario.context.currentTime)
    : new Date().toISOString();
  const metrics: RiskMetricBag = scenario.observedMetrics ?? {};

  switch (scenario.scenarioId) {
    case 'SH-SCHED-001':
      return [
        planSimRisk({
          tripId,
          scenarioId: scenario.scenarioId,
          knowledgeCode: 'SCHEDULE-TIGHT-01',
          subject: 'schedule:tight-buffer',
          title: 'Tight schedule with absorbed delay',
          summary: 'Harness schedule buffer absorbed minor delay',
          detectedAt,
          metrics,
          level: 'LOW',
          executionGate: 'ALLOW',
        }),
      ];
    case 'SH-SCHED-002':
      return [
        planSimRisk({
          tripId,
          scenarioId: scenario.scenarioId,
          knowledgeCode: 'BOOK-ACTIVITY-01',
          subject: 'booking:activity-window',
          title: 'Activity booking window at risk',
          summary: 'Harness glacier tour booking at risk from cascade delay',
          detectedAt,
          metrics,
          isRootCause: true,
        }),
      ];
    case 'SH-SCHED-003':
      return [
        planSimRisk({
          tripId,
          scenarioId: scenario.scenarioId,
          knowledgeCode: 'BOOK-HOTEL-01',
          subject: 'booking:hotel-checkin',
          title: 'Hotel check-in deadline at risk',
          summary: 'Harness late hotel arrival risks room cancellation',
          detectedAt,
          metrics,
          isRootCause: true,
        }),
      ];
    case 'SH-SCHED-004':
      return [
        planSimRisk({
          tripId,
          scenarioId: scenario.scenarioId,
          knowledgeCode: 'BOOK-CANCEL-01',
          subject: 'booking:operator-cancel',
          title: 'Operator cancelled activity',
          summary: 'Harness whale watching operator cancellation',
          detectedAt,
          metrics,
          isRootCause: true,
        }),
      ];
    default:
      return [];
  }
}

function planSimRisk(input: {
  tripId: string;
  scenarioId: string;
  knowledgeCode: string;
  subject: string;
  title: string;
  summary: string;
  detectedAt: string;
  metrics: RiskMetricBag;
  isRootCause?: boolean;
  level?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  executionGate?: 'ALLOW' | 'AT_RISK' | 'REPLAN_REQUIRED' | 'STOP';
}): RiskSourceProjection {
  const type = resolveRiskTypeForKnowledge(input.knowledgeCode);
  const projection = buildHarnessProjection({
    tripId: input.tripId,
    scenarioId: input.scenarioId,
    subject: input.subject,
    type,
    code: resolveRuntimeCodeForKnowledge(input.knowledgeCode),
    knowledgeCode: input.knowledgeCode,
    title: input.title,
    summary: input.summary,
    detectedAt: input.detectedAt,
    metrics: input.metrics,
    isRootCause: input.isRootCause ?? true,
    generationMode: RiskGenerationMode.PLAN_SIMULATION,
    rootEventId: `plan-${input.scenarioId}-${input.knowledgeCode}`,
    sourceId: `harness-plan-${input.scenarioId}-${input.knowledgeCode}`,
    sourceSystem: 'MEMBER_RUNTIME',
  });
  return {
    ...projection,
    level: input.level ?? projection.level,
    executionGate: input.executionGate ?? projection.executionGate,
  };
}
