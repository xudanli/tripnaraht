/**
 * Build Iceland Wind Pilot evidence from archetype + fact snapshot (live projector).
 */

import { createHash } from 'crypto';
import { runIcelandSelfDriveCausalAnalysis } from '../../../trips/causal-runtime/domains/iceland-self-drive-causal.engine';
import { projectIcelandToTravelCausalDecision } from '../../projectors/project-iceland-to-travel-causal-decision';
import { listTravelCausalRules, composeRuleVersionStamp } from '../../registry/travel-causal-rule.registry';
import { STANDARD_CAUSAL_CASE_IDS } from '../../fixtures/case-ids';
import { attachSelectedOption, reconcileTravelCausalDecision } from '../../reconciliation/reconcile-decision-outcome.util';
import type { OutcomeReconciliationStatus } from '../../types/decision-outcome.types';
import {
  ICELAND_WIND_PILOT_EVIDENCE_SCHEMA,
  type IcelandWindPilotEvidence,
  type WindPilotCaseArchetype,
  type WindPilotFactSnapshot,
  type WindPilotObservationEvidence,
} from './wind-pilot.types';

function hashFacts(facts: WindPilotFactSnapshot): string {
  return createHash('sha256').update(JSON.stringify(facts)).digest('hex').slice(0, 24);
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

export interface BuildWindPilotEvidenceInput {
  caseId: string;
  archetype: WindPilotCaseArchetype;
  title: string;
  titleZh: string;
  facts: WindPilotFactSnapshot;
  expectedRootCauseSummaryZh: string;
  /** Wall-clock after which the original plan is irreparable */
  irreparableAfterAt: string;
  observation: WindPilotObservationEvidence;
  /** Prefer drop-stop option when recovering minutes available */
  preferDropStop?: boolean;
  notes?: string;
}

export function buildWindPilotEvidence(
  input: BuildWindPilotEvidenceInput,
): IcelandWindPilotEvidence {
  const assessment = runIcelandSelfDriveCausalAnalysis({
    routeLabel: input.facts.routeLabel,
    distanceKm: input.facts.distanceKm,
    baseDurationMinutes: input.facts.baseDurationMinutes,
    windMps: input.facts.windMps,
    windExposure: input.facts.windExposure ?? 'high',
    appointmentSlackMinutes: input.facts.appointmentSlackMinutes,
    region: input.facts.region ?? 'south_coast',
  });

  const rules = listTravelCausalRules({
    caseTag: STANDARD_CAUSAL_CASE_IDS.STRONG_WIND_APPOINTMENT,
    reviewStatus: 'APPROVED',
    includePackRules: false,
  });
  const ruleVersion = composeRuleVersionStamp(rules);
  const contextHash = hashFacts(input.facts);

  let decision = projectIcelandToTravelCausalDecision({
    tripId: `trip_pilot_${input.caseId}`,
    decisionId: `dec_pilot_${input.caseId}`,
    assessment,
    schedule: {
      detectedAt: addMinutes(input.facts.plannedDepartureAt, -180),
      plannedDepartureAt: input.facts.plannedDepartureAt,
      checkInDeadlineAt: input.facts.checkInDeadlineAt,
      windOnsetAt: input.facts.windOnsetAt,
      decisionLeadMinutes: 15,
    },
    activityLabel: '冰川徒步',
    costImpactDoNothing: input.archetype === 'WIND_NO_IMPACT' ? 0 : 160,
    recoverableStop:
      input.preferDropStop || input.facts.recoverableStopMinutes
        ? {
            activityId: 'act_seljalandsfoss',
            label: 'Seljalandsfoss',
            recoverMinutes: input.facts.recoverableStopMinutes ?? 40,
          }
        : undefined,
    worldStateVersion: `ws_${contextHash}`,
  });

  // Stale-context archetype: mutate contextHash marker on decision for harness checks
  if (input.archetype === 'FORECAST_CHANGE_STALE_CONTEXT') {
    decision = {
      ...decision,
      contextHash: `stale_${contextHash}`,
      observationSummary: `${decision.observationSummary}（预报已更新，需重算）`,
    };
  }

  let selectedOptionId: string | undefined;
  let finalReconciliation: OutcomeReconciliationStatus =
    input.observation.kind === 'NONE' ? 'UNOBSERVABLE' : 'PENDING';

  if (input.archetype !== 'WIND_NO_IMPACT' && decision.recommendation) {
    selectedOptionId = decision.recommendation.optionId;
    decision = attachSelectedOption(decision, selectedOptionId);
  }

  if (input.observation.kind !== 'NONE' && selectedOptionId) {
    const miss =
      input.observation.completed === false
        ? 0.92
        : decision.outcome?.predictedOutcome.metrics?.iceland_miss_prob ?? 0.1;
    decision = reconcileTravelCausalDecision(
      decision,
      {
        completed: input.observation.completed,
        arrivalTime: input.observation.arrivalTime,
        metrics: { iceland_miss_prob: miss },
        sources: [input.observation.kind],
        observedAt: input.observation.observedAt ?? input.facts.checkInDeadlineAt,
      },
      { selectedOptionId },
    );
    finalReconciliation = decision.outcome?.reconciliation ?? 'PENDING';
  } else if (input.observation.kind === 'NONE' && selectedOptionId) {
    // Applied but unobservable
    finalReconciliation = 'UNOBSERVABLE';
    decision = {
      ...decision,
      outcome: decision.outcome
        ? {
            ...decision.outcome,
            reconciliation: 'UNOBSERVABLE',
            explanation: '缺少高信任观测，无法完成对账',
          }
        : decision.outcome,
    };
  }

  return {
    schema: ICELAND_WIND_PILOT_EVIDENCE_SCHEMA,
    caseId: input.caseId,
    archetype: input.archetype,
    title: input.title,
    titleZh: input.titleZh,
    factSnapshot: input.facts,
    ruleVersion,
    contextHash: decision.contextHash,
    decision,
    selectedOptionId,
    observation: input.observation,
    finalReconciliation,
    expectedRootCauseSummaryZh: input.expectedRootCauseSummaryZh,
    irreparableAfterAt: input.irreparableAfterAt,
    meta: {
      createdAt: '2026-07-17T00:00:00.000Z',
      notes: input.notes,
    },
  };
}
