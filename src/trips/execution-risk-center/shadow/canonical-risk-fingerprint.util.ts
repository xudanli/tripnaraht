/**
 * Canonical execution-alerts fingerprint — ActiveRisk[] after ERC merge/enrichment.
 */

import type { ActiveRisk } from '../types/execution-risk.types';
import { aggregateExecutionAlertRisks } from '../utils/execution-alerts-aggregation.util';
import {
  alertLevelSortWeight,
  executionGateToAlertLevel,
  isExecutionAlertEligibleRisk,
} from '../utils/execution-alerts-projection.util';
import type { ExecutionRiskShadowFingerprint } from './execution-risk-shadow-compare.types';

function sourceKeyOf(risk: ActiveRisk): string {
  const ref = risk.sourceRefs[0];
  return `${ref?.sourceSystem ?? 'UNKNOWN'}:${ref?.sourceId ?? risk.riskKey}`;
}

export function buildCanonicalRiskFingerprints(
  risks: ActiveRisk[],
): ExecutionRiskShadowFingerprint[] {
  const eligible = risks.filter(isExecutionAlertEligibleRisk);
  return eligible
    .map((risk) => ({
      id: risk.id,
      sourceKey: sourceKeyOf(risk),
      level: executionGateToAlertLevel(risk.executionGate, risk.level),
      title: risk.title,
    }))
    .sort((a, b) => alertLevelSortWeight(a.level) - alertLevelSortWeight(b.level));
}

export function resolveCanonicalPrimaryRiskId(risks: ActiveRisk[]): string | undefined {
  return aggregateExecutionAlertRisks(risks).primary?.risk.id;
}

export function countUnknownKnowledgeCodes(risks: ActiveRisk[]): number {
  return risks.filter((r) => !r.knowledgeCode || r.knowledgeCode === 'UNKNOWN').length;
}
