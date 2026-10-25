/**
 * PD-6 — Map Proactive Synthesis → InterventionCandidate + Gate decision.
 * Reuses freezeInterventionCandidate (no parallel candidate model).
 */

import {
  freezeInterventionCandidate,
  type InterventionCandidateV1,
} from '../../../agent/decision-intelligence/intervention-intelligence/intervention-candidate.util';
import type { TemporalScenarioId } from '../../../agent/decision-intelligence/pilot/scenario-temporal-readiness.util';
import type { ProactiveDecisionCaseId } from '../contracts/proactive-decision-case.types';
import type { ProactiveImpactV1 } from '../contracts/proactive-impact.types';
import type { ProactiveSynthesisV1 } from '../synthesis/proactive-synthesis.types';
import { buildProactiveReminderCard } from '../surface/build-proactive-reminder-card.util';
import type { ProactiveReminderCardV1 } from '../surface/proactive-reminder-card.types';
import {
  computeProactiveInterventionValue,
  type ProactiveInterventionValueV1,
} from './compute-intervention-value.util';
import type { ProactiveSilentLearningV1 } from './proactive-silent-learning.types';

export const PROACTIVE_INTERVENTION_DECISION_SCHEMA =
  'nara.proactive_intervention_decision@v1' as const;

export type ProactiveInterventionGateDecision =
  | 'NOTIFY_CARD'
  | 'SILENT_LEARNING';

export type ProactiveInterventionDecisionV1 = {
  schemaId: typeof PROACTIVE_INTERVENTION_DECISION_SCHEMA;
  version: 1;
  gate: ProactiveInterventionGateDecision;
  value: ProactiveInterventionValueV1;
  candidate: InterventionCandidateV1;
  card: ProactiveReminderCardV1 | null;
  silentLearning: ProactiveSilentLearningV1 | null;
  /** Real push/notify still closed — card is in-app canary surface only */
  notifyUser: false;
  pushForbidden: true;
  autoApplyForbidden: true;
};

function mapCaseToScenario(caseId: ProactiveDecisionCaseId): TemporalScenarioId {
  if (caseId === 'CASE_REROUTE') return 'pace_day_sequence';
  return 'experience_slotting';
}

function severityFromImpact(impact: ProactiveImpactV1): number {
  switch (impact.impactLevel) {
    case 'CRITICAL':
      return 0.95;
    case 'HIGH':
      return 0.8;
    case 'MEDIUM':
      return 0.55;
    case 'LOW':
      return 0.3;
    default:
      return 0.5;
  }
}

function urgencyFromCase(caseId: ProactiveDecisionCaseId): number {
  if (caseId === 'CASE_REROUTE') return 0.75;
  if (caseId === 'CASE_POSTPONE_ACTIVITY') return 0.65;
  return 0.55;
}

/**
 * Default attention cost — lower when lead time is ample / change is cheap.
 */
export function defaultAttentionCost(input: {
  impactLevel: ProactiveImpactV1['impactLevel'];
}): number {
  if (input.impactLevel === 'CRITICAL') return 0.15;
  if (input.impactLevel === 'HIGH') return 0.2;
  if (input.impactLevel === 'MEDIUM') return 0.35;
  return 0.5;
}

export function evaluateProactiveIntervention(input: {
  impact: ProactiveImpactV1;
  synthesis: ProactiveSynthesisV1;
  decisionProblemId?: string;
  attentionCost?: number;
  threshold?: number;
  actionableLeadTimeHours?: number;
  createdAt?: string;
}): ProactiveInterventionDecisionV1 {
  const attentionCost =
    input.attentionCost ??
    defaultAttentionCost({ impactLevel: input.impact.impactLevel });

  const value = computeProactiveInterventionValue({
    improvement: input.synthesis.improvement,
    confidence: input.synthesis.confidence,
    actionability: input.synthesis.actionability,
    attentionCost,
    threshold: input.threshold,
  });

  const scenarioId = mapCaseToScenario(input.synthesis.caseId);
  const lead = input.actionableLeadTimeHours ?? 4;

  const candidate = freezeInterventionCandidate({
    scenarioId,
    tripId: input.impact.tripId,
    riskEventKey: `${input.impact.signalKind}:${input.impact.signalEventId}`,
    severity: severityFromImpact(input.impact),
    urgency: urgencyFromCase(input.synthesis.caseId),
    confidence: input.synthesis.confidence,
    actionability: input.synthesis.actionability,
    actionableLeadTimeHours: lead,
    disruptionCost: attentionCost,
    createdAt: input.createdAt ?? input.impact.createdAt,
    candidateId: `ic_pd_${input.impact.signalEventId}`,
  });

  const base = {
    schemaId: PROACTIVE_INTERVENTION_DECISION_SCHEMA,
    version: 1 as const,
    value,
    candidate,
    notifyUser: false as const,
    pushForbidden: true as const,
    autoApplyForbidden: true as const,
  };

  // Gate: RFC value threshold AND freeze surface not DO_NOT_SURFACE
  const allowCard =
    value.passesThreshold && candidate.surfaceLevel !== 'DO_NOT_SURFACE';

  if (!allowCard) {
    const silentLearning: ProactiveSilentLearningV1 = {
      schemaId: 'nara.proactive_silent_learning@v1',
      version: 1,
      tripId: input.impact.tripId,
      signalEventId: input.impact.signalEventId,
      caseId: input.impact.caseId,
      reason:
        candidate.surfaceLevel === 'DO_NOT_SURFACE'
          ? 'DO_NOT_SURFACE'
          : 'BELOW_THRESHOLD',
      interventionValue: value.interventionValue,
      threshold: value.threshold,
      observedAt: input.createdAt ?? input.impact.createdAt,
      memoryHook: 'TRAVEL_MEMORY_PENDING',
    };
    return {
      ...base,
      gate: 'SILENT_LEARNING',
      card: null,
      silentLearning,
    };
  }

  const card = buildProactiveReminderCard({
    impact: input.impact,
    synthesis: input.synthesis,
    decisionProblemId: input.decisionProblemId,
    interventionCandidateId: candidate.candidateId,
  });

  return {
    ...base,
    gate: 'NOTIFY_CARD',
    card,
    silentLearning: null,
  };
}
