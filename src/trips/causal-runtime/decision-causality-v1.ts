/**
 * Build v1 causality records and CausalDecisionTuple from planning ticks.
 */

import type { TripWorldState } from '../decision/world-model';
import type { TripPlan } from '../decision/plan-model';
import type { DecisionRunLog } from '../decision/decision-log';
import type {
  DecisionCausalityDraftPayload,
  DecisionCausalityRecordV0,
} from '../reality-kernel/decision-causality.types';
import {
  buildBlockedAtGateCausalityRecord,
  finalizeDecisionCausalityRecord,
} from '../reality-kernel/decision-causality';
import {
  CAUSAL_DECISION_TUPLE_SCHEMA_V1,
  type CausalDecisionTuple,
  type CausalFailureHypothesis,
} from './causal-decision-tuple.types';
import {
  DECISION_CAUSALITY_SCHEMA_V1,
  type DecisionCausalityRecordV1,
} from './decision-causality-v1.types';
import type { TripIntervention } from './trip-intervention.types';

export function buildCausalDecisionTupleFromTick(input: {
  state: TripWorldState;
  draft: DecisionCausalityDraftPayload;
  outcome?: {
    phase: 'completed' | 'constraint_rejected';
    log: DecisionRunLog;
    plan: TripPlan | null;
  };
}): CausalDecisionTuple {
  const { state, draft, outcome } = input;
  const recordedAt = new Date().toISOString();

  const hypothesis = buildHypothesisFromDraft(draft, state);
  const alternatives = extractAlternativesFromSignals(state);
  const chosenIntervention = inferChosenIntervention(outcome?.log, alternatives);

  return {
    schema: CAUSAL_DECISION_TUPLE_SCHEMA_V1,
    context: {
      schema: CAUSAL_DECISION_TUPLE_SCHEMA_V1,
      causality_id: draft.causality_id,
      trip_id: state.context.tripId,
      trace_request_id: draft.trace_request_id,
      snapshot_id: draft.reality.snapshot_id,
      region: draft.reality.region,
      destination: state.context.destination,
      tick_kind: draft.tick_kind,
      recorded_at: recordedAt,
    },
    hypothesis,
    alternatives,
    chosenIntervention,
    expectedOutcome: outcome?.plan
      ? {
          metrics: {
            plan_days: outcome.plan.days?.length ?? 0,
            plan_slots: countPlanSlots(outcome.plan),
            ...(state.signals.icelandSelfDriveCausalAssessment
              ? {
                  iceland_miss_prob: state.signals.icelandSelfDriveCausalAssessment.missProbability,
                  iceland_p90_minutes:
                    state.signals.icelandSelfDriveCausalAssessment.travelTime.p90Minutes,
                }
              : {}),
          },
          narrative: state.signals.icelandSelfDriveCausalAssessment?.userFacingAssessment,
        }
      : state.signals.icelandSelfDriveCausalAssessment
        ? {
            metrics: {
              iceland_miss_prob: state.signals.icelandSelfDriveCausalAssessment.missProbability,
            },
            narrative: state.signals.icelandSelfDriveCausalAssessment.userFacingAssessment,
          }
        : undefined,
    confidenceBefore: hypothesis?.confidence,
  };
}

export function upgradeToDecisionCausalityRecordV1(
  base: DecisionCausalityRecordV0,
  causalDecision?: CausalDecisionTuple,
): DecisionCausalityRecordV1 {
  return {
    ...base,
    schema: DECISION_CAUSALITY_SCHEMA_V1,
    ...(causalDecision ? { causal_decision: causalDecision } : {}),
  };
}

export function finalizeDecisionCausalityRecordV1(
  draft: DecisionCausalityDraftPayload,
  outcome: {
    phase: 'completed' | 'constraint_rejected';
    log: DecisionRunLog;
    plan: TripPlan | null;
  },
  state: TripWorldState,
): DecisionCausalityRecordV1 {
  const base = finalizeDecisionCausalityRecord(draft, outcome);
  const causalDecision = buildCausalDecisionTupleFromTick({ state, draft, outcome });
  return upgradeToDecisionCausalityRecordV1(base, causalDecision);
}

export function buildBlockedAtGateCausalityRecordV1(
  input: Parameters<typeof buildBlockedAtGateCausalityRecord>[0],
  state: TripWorldState,
): DecisionCausalityRecordV1 {
  const base = buildBlockedAtGateCausalityRecord(input);
  const draft: DecisionCausalityDraftPayload = {
    causality_id: input.causality_id,
    started_at: input.started_at,
    tick_kind: input.tick_kind,
    trace_request_id: input.trace_request_id,
    reality: input.reality,
    policy_engine: input.policy_engine,
    execution_gate: input.execution_gate,
  };
  const causalDecision = buildCausalDecisionTupleFromTick({ state, draft });
  return upgradeToDecisionCausalityRecordV1(base, causalDecision);
}

function buildHypothesisFromDraft(
  draft: DecisionCausalityDraftPayload,
  state?: TripWorldState,
): CausalFailureHypothesis | undefined {
  const iceland = state?.signals.icelandSelfDriveCausalAssessment;
  if (iceland) {
    return {
      failureMode: 'iceland_wind_elevated_travel_risk',
      causalChain: iceland.causalChain,
      confidence: 1 - iceland.missProbability,
      evidenceTier: 'verified_mechanism',
    };
  }
  const { policy_engine, execution_gate } = draft;
  if (execution_gate.type === 'ALLOW') {
    if (policy_engine.codes.length === 0) return undefined;
  }

  const chain: string[] = [];
  if (policy_engine.codes.length) {
    chain.push(...policy_engine.codes.map((c) => `policy:${c}`));
  }
  if (execution_gate.type !== 'ALLOW') {
    chain.push(`gate:${execution_gate.type}`);
  }

  if (chain.length === 0) return undefined;

  return {
    failureMode: policy_engine.reasons[0] ?? execution_gate.type,
    causalChain: chain,
    confidence: execution_gate.type === 'BLOCK' ? 0.9 : 0.65,
    evidenceTier: 'expert_rule',
  };
}

function extractAlternativesFromSignals(state: TripWorldState): TripIntervention[] {
  const fromRepairs =
    state.signals.repairEvaluation?.repairs?.map((repair) =>
      mapRepairInstructionToTripIntervention(repair),
    ) ?? [];

  const fromHints =
    state.signals.guardianRepairHints?.items
      ?.filter((item) => item.inferredAction)
      .slice(0, 5)
      .map((item, idx) =>
        mapRepairInstructionToTripIntervention({
          id: `hint:${idx}`,
          action: item.inferredAction!,
          targetSlotIds: [],
          narrative: item.text,
          priority: idx,
          confidence: 0.55,
        }),
      ) ?? [];

  return [...fromRepairs, ...fromHints].slice(0, 8);
}

function mapRepairInstructionToTripIntervention(
  repair: import('../decision/repair/repair-action.types').RepairInstruction,
): TripIntervention {
  return {
    interventionId: repair.id,
    type: mapRepairActionToInterventionType(repair.action),
    targetVariable: repair.targetSlotIds[0]
      ? `itinerary:slot:${repair.targetSlotIds[0]}`
      : 'itinerary:plan',
    proposedValue: {
      action: repair.action,
      deltaMinutes: repair.suggestedDeltaMinutes,
      targetSlotIds: repair.targetSlotIds,
    },
    expectedEffects: [
      {
        metric: 'feasibility_score',
        direction: 'UP',
        confidence: repair.confidence,
      },
    ],
    sideEffects: [],
    source: 'guardian_repair',
    evidenceTier: 'hypothesis_unverified',
    description: repair.narrative,
  };
}

function mapRepairActionToInterventionType(
  action: import('../decision/repair/repair-action.types').RepairAction,
): TripIntervention['type'] {
  switch (action) {
    case 'MOVE_SLOT_EARLIER':
    case 'EARLY_DEPARTURE':
      return 'SHIFT_TIME';
    case 'MOVE_SLOT_LATER':
    case 'DELAY_CHECKIN':
      return 'SHIFT_TIME';
    case 'SKIP_OPTIONAL_POI':
      return 'REMOVE_ITEM';
    case 'SWAP_POI':
      return 'REPLACE_ITEM';
    case 'SPLIT_DRIVE':
      return 'SPLIT_GROUP';
    case 'INSERT_REST':
      return 'ADD_BUFFER';
    default:
      return 'ADD_BUFFER';
  }
}

function inferChosenIntervention(
  log: DecisionRunLog | undefined,
  alternatives: TripIntervention[],
): TripIntervention | undefined {
  if (!log?.chosenActions?.length) return undefined;
  const first = log.chosenActions[0];
  const match = alternatives.find((a) =>
    a.description?.includes(String(first?.actionType ?? '')),
  );
  if (match) return match;
  return {
    interventionId: `log_action:0`,
    type: 'ADD_BUFFER',
    targetVariable: 'decision:chosen_action',
    proposedValue: first,
    expectedEffects: [],
    sideEffects: [],
    source: 'manual',
    evidenceTier: 'individual_assumption',
  };
}

function countPlanSlots(plan: TripPlan | null): number {
  if (!plan?.days?.length) return 0;
  return plan.days.reduce((n, d) => n + (d.timeSlots?.length ?? 0), 0);
}
