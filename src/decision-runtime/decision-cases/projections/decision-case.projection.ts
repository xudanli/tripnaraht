/**
 * Map StoredDecisionCase → InternalUnifiedProblemRow + product projection.
 */

import type { DecisionOption } from '../../../trips/decision-semantics/types/decision-semantics.types';
import type { InternalUnifiedProblemRow } from '../../gateway/utils/unified-decision-problem-projection.util';
import type { DecisionAction } from '../../gateway/contracts/unified-decision-ui.types';
import {
  DECISION_CASE_UI_GROUP_LABEL_ZH,
  type DecisionCaseProductProjection,
  type StoredDecisionCase,
  type StoredDecisionCaseOption,
} from '../contracts/decision-case.types';
import { mapRequirednessToUiGroup } from '../materiality/decision-materiality.util';

export function projectCaseToProductFields(
  decisionCase: StoredDecisionCase,
): DecisionCaseProductProjection {
  const uiGroup = mapRequirednessToUiGroup(
    decisionCase.requiredness,
    decisionCase.materiality.total,
  );
  return {
    sourceKind: decisionCase.sourceKind,
    requiredness: decisionCase.requiredness,
    domain: decisionCase.domain,
    scope: decisionCase.scope,
    actionKind: decisionCase.actionKind,
    materialityScore: decisionCase.materiality.total,
    materialityBreakdown: decisionCase.materiality.breakdown,
    enrichmentStage: decisionCase.enrichmentStage,
    writebackTargets: decisionCase.writebackTargets,
    uiGroup,
    uiGroupLabelZh: DECISION_CASE_UI_GROUP_LABEL_ZH[uiGroup],
    eligibility: decisionCase.eligibility,
  };
}

export function mapStoredCaseToInternalRow(decisionCase: StoredDecisionCase): InternalUnifiedProblemRow {
  return {
    problemId: decisionCase.problemId,
    authority: 'LEGACY',
    flow: 'LEGACY_V15',
    semanticKey: decisionCase.semanticKey,
    instanceKey: `case:${decisionCase.semanticKey}:trip:${decisionCase.tripId}`,
    type: decisionCase.type,
    dimension: decisionCase.dimension,
    enforcement: decisionCase.enforcement,
    phase: 'PLANNING',
    affectsPlan: true,
    workflowStatus: decisionCase.workflowStatus,
    executionStatus: decisionCase.resolvedOptionId ? 'APPLIED' : 'NOT_STARTED',
    title: decisionCase.title,
    summary: decisionCase.summary,
    scope: { tripId: decisionCase.tripId },
    evidenceCount: decisionCase.evidenceRefs.length,
    evidenceFreshness: decisionCase.enrichmentStage === 'ENRICHED' ? 'FRESH' : 'UNKNOWN',
    occurrenceCount: 1,
    occurrences: [],
    hasExecutableOptions: decisionCase.options.some((o) => o.executable !== false),
    sourceIds: decisionCase.evidenceRefs,
    detectors: [
      {
        detectorId: `decision_case:${decisionCase.sourceKind}`,
        label: decisionCase.sourceKind,
        sourceRefIds: decisionCase.evidenceRefs,
      },
    ],
    origin: {
      authority: 'LEGACY',
      primaryDetector: `decision_case:${decisionCase.semanticKey}`,
      engineId: 'DECISION_CASE_PUBLISHER',
    },
    queueTitle: decisionCase.title,
    queueDescription: decisionCase.summary,
  };
}

export function mapStoredCaseOptionsToDecisionOptions(
  problemId: string,
  options: StoredDecisionCaseOption[],
): DecisionOption[] {
  return options.map((o) => ({
    id: o.optionId,
    problemId,
    type: o.type,
    source: 'RULE_ENGINE',
    title: o.title,
    description: o.description,
    resolves: [problemId],
    tradeoffs: o.tradeoffs,
    requiresConfirmation: o.requiresConfirmation,
    executable: o.executable !== false,
  }));
}

export function mapStoredCaseOptionsToActions(
  tripId: string,
  problemId: string,
  options: StoredDecisionCaseOption[],
): DecisionAction[] {
  return options.map((o) => ({
    actionId: o.optionId,
    type: o.type,
    source: 'RULE_ENGINE',
    title: o.title,
    summary: o.description,
    expectedImpact: undefined,
    requiresConfirmation: o.requiresConfirmation,
    allowed: o.executable !== false,
    navigationTarget: {
      command: 'OPEN_DECISION_SPACE',
      params: { tripId, problemId, optionId: o.optionId },
    },
  }));
}

export function isDecisionCaseProblemId(problemId: string): boolean {
  return problemId.startsWith('dc_');
}
