/**
 * CGUS Decision Trace → Decision Episode。
 * Action ≠ Preference；Episode 默认 mayPromoteToPreference=false。
 */

import { randomUUID } from 'crypto';
import type {
  CgusDecisionTraceV1,
  CgusDecisionRegret,
} from '../../trips/decision/optimization/cgus-decision-trace.types';
import {
  DECISION_EPISODE_SCHEMA,
  type DecisionEpisodeV1,
  type DecisionEpisodeUserAction,
} from './decision-episode.types';

function mapRegret(regret?: CgusDecisionRegret): number | string | null {
  if (!regret || regret === 'UNKNOWN') return regret ?? null;
  if (regret === 'NONE') return 0;
  if (regret === 'LOW') return 0.25;
  if (regret === 'MEDIUM') return 0.55;
  if (regret === 'HIGH') return 0.85;
  return regret;
}

function mapUserAction(
  action?: CgusDecisionTraceV1['user_action'],
): DecisionEpisodeUserAction {
  if (
    action === 'ACCEPT' ||
    action === 'OVERRIDE' ||
    action === 'REJECT_ALL' ||
    action === 'NO_ACTION'
  ) {
    return action;
  }
  return 'NO_ACTION';
}

export type CgusEpisodeBridgeInput = {
  trace: CgusDecisionTraceV1;
  day?: number | null;
  weatherRisk?: string | null;
  scheduleSlackMinutes?: number | null;
  episodeId?: string;
};

/**
 * 将完整/部分 CGUS Trace 组装为 Decision Episode（CONTEXT，非 Truth）。
 */
export function decisionEpisodeFromCgusTrace(
  input: CgusEpisodeBridgeInput,
): DecisionEpisodeV1 {
  const { trace } = input;
  const recommended = trace.recommended_candidate ?? null;
  const selected = trace.chosen_candidate ?? null;
  const outcome = trace.actual_outcome;

  return {
    schemaId: DECISION_EPISODE_SCHEMA,
    version: 1,
    episodeId: input.episodeId ?? `EP-${trace.decision_id || randomUUID()}`,
    context: {
      tripId: trace.trip_id,
      day: input.day ?? null,
      weatherRisk: input.weatherRisk ?? null,
      scheduleSlackMinutes: input.scheduleSlackMinutes ?? null,
      decisionType: trace.decision_type,
    },
    decision: {
      type: trace.decision_type,
      alternatives: [...(trace.candidate_ids ?? [])],
      recommended,
    },
    userAction: {
      type: mapUserAction(trace.user_action),
      selected,
      reason: trace.override_reason ?? null,
    },
    outcome: outcome
      ? {
          status: outcome.completed ? 'COMPLETED' : 'INCOMPLETE',
          completed: outcome.completed,
          scheduleDelayMinutes: outcome.majorDelayMinutes ?? null,
          safetyIncident: outcome.safetyIncident,
          fatigue: null,
        }
      : null,
    reflection: {
      decisionRegret: mapRegret(trace.decision_regret),
      recommendationProblematic: trace.recommendation_problematic ?? null,
      rootCause: trace.root_cause ?? null,
    },
    sourceRefs: {
      cgusDecisionId: trace.decision_id,
      travelEventIds: [],
    },
    mayPromoteToPreference: false,
  };
}
