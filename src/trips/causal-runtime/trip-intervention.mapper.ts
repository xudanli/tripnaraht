/**
 * Map legacy intervention representations → unified TripIntervention.
 */

import type { CausalIntervention } from '../causal-physics/causal-graph.types';
import type { WhatIfAction } from '../../planning-policy/services/robustness-evaluator.service';
import type { InterventionAction } from '../../decision/actuator/intervention-engine';
import type { TripIntervention, TripInterventionType } from './trip-intervention.types';

const ACTUATOR_ACTION_MAP: Record<InterventionAction, TripInterventionType> = {
  MAINTAIN_GUIDANCE: 'ADD_BUFFER',
  FORCE_RETREAT_MODE: 'RETREAT_MODE',
  EMERGENCY_MELT_CUTOFF: 'EMERGENCY_CUTOFF',
  WAITING_FOR_WINDOW: 'WAIT_FOR_WINDOW',
};

export function mapWhatIfActionToTripIntervention(
  action: WhatIfAction,
  opts?: { interventionId?: string; confidence?: number },
): TripIntervention {
  const confidence = opts?.confidence ?? 0.6;
  const id = opts?.interventionId ?? `what_if:${action.type}:${JSON.stringify(action)}`;

  switch (action.type) {
    case 'SHIFT_EARLIER':
      return {
        interventionId: id,
        type: 'SHIFT_TIME',
        targetVariable: `temporal:poi_start:${action.poiId}`,
        previousValue: null,
        proposedValue: { shiftMinutes: -action.minutes },
        expectedEffects: [
          { metric: 'on_time_probability', direction: 'UP', confidence },
          { metric: 'miss_probability', direction: 'DOWN', confidence },
        ],
        sideEffects: [{ metric: 'sleep_debt', estimatedImpact: action.minutes * 0.02 }],
        source: 'what_if',
        evidenceTier: 'expert_rule',
        title: `提前 ${action.minutes} 分钟`,
        description: `${action.poiId} 前移 ${action.minutes} 分钟`,
      };
    case 'SWAP_NEIGHBOR':
      return {
        interventionId: id,
        type: 'REPLACE_ITEM',
        targetVariable: `itinerary:poi_order:${action.poiId}`,
        proposedValue: { direction: action.direction },
        expectedEffects: [
          { metric: 'wait_time', direction: 'DOWN', confidence: confidence * 0.8 },
        ],
        sideEffects: [],
        source: 'what_if',
        evidenceTier: 'expert_rule',
        title: `与${action.direction === 'PREV' ? '前' : '后'}邻点换序`,
      };
    case 'UPGRADE_TRANSIT':
      return {
        interventionId: id,
        type: 'CHANGE_TRANSPORT',
        targetVariable: `transport:segment:${action.segmentId}`,
        proposedValue: { mode: action.mode },
        expectedEffects: [
          { metric: 'travel_duration', direction: 'DOWN', confidence },
        ],
        sideEffects: [{ metric: 'budget', estimatedImpact: 0.15 }],
        source: 'what_if',
        evidenceTier: 'statistical_correlation',
      };
    case 'AUTO_REPLAN':
      return {
        interventionId: id,
        type: 'CHANGE_ROUTE',
        targetVariable: `itinerary:scope:${action.scope}`,
        proposedValue: { trigger: action.trigger },
        expectedEffects: [
          { metric: 'completion_rate', direction: 'UP', confidence: confidence * 0.7 },
        ],
        sideEffects: [{ metric: 'experience_disruption', estimatedImpact: 0.25 }],
        source: 'what_if',
        evidenceTier: 'hypothesis_unverified',
      };
    case 'REMOVE_ITEM':
      return {
        interventionId: id,
        type: 'REMOVE_ITEM',
        targetVariable: `itinerary:poi:${action.poiId}`,
        proposedValue: { removedPoiId: action.poiId },
        expectedEffects: [
          { metric: 'miss_probability', direction: 'DOWN', confidence },
          { metric: 'schedule_slack', direction: 'UP', confidence: confidence * 0.8 },
        ],
        sideEffects: [{ metric: 'experience_density', estimatedImpact: 0.15 }],
        source: 'what_if',
        evidenceTier: 'expert_rule',
        title: '移除低优先级停留点',
      };
    case 'ADD_BUFFER':
      return {
        interventionId: id,
        type: 'ADD_BUFFER',
        targetVariable: `temporal:buffer_before:${action.poiId}`,
        proposedValue: { bufferMinutes: action.minutes },
        expectedEffects: [
          { metric: 'miss_probability', direction: 'DOWN', confidence },
          { metric: 'on_time_probability', direction: 'UP', confidence: confidence * 0.85 },
        ],
        sideEffects: [{ metric: 'active_minutes', estimatedImpact: action.minutes * 0.01 }],
        source: 'what_if',
        evidenceTier: 'expert_rule',
        title: `增加 ${action.minutes} 分钟缓冲`,
      };
    default: {
      const _exhaustive: never = action;
      throw new Error(`Unhandled WhatIfAction: ${String(_exhaustive)}`);
    }
  }
}

export function mapCausalInterventionToTripIntervention(
  iv: CausalIntervention,
  opts?: { confidence?: number },
): TripIntervention {
  const confidence = opts?.confidence ?? 0.55;
  const targetVariable = iv.targetNodeId.replace(/^domain:/, 'causal:');

  return {
    interventionId: iv.id,
    type: inferTypeFromCausalTarget(iv.targetNodeId),
    targetVariable,
    previousValue: undefined,
    proposedValue: iv.statePatch,
    expectedEffects: [
      {
        metric: 'causal_utility',
        direction: 'UP',
        confidence,
      },
    ],
    sideEffects: [],
    source: 'causal_physics',
    evidenceTier: iv.doOperator ? 'verified_mechanism' : 'hypothesis_unverified',
    description: iv.doOperator ? `do(${iv.targetNodeId})` : `patch(${iv.targetNodeId})`,
  };
}

export function mapActuatorActionToTripIntervention(
  action: InterventionAction,
  opts?: { reasonCodes?: string[]; primaryMessage?: string },
): TripIntervention {
  const type = ACTUATOR_ACTION_MAP[action];
  return {
    interventionId: `actuator:${action}`,
    type,
    targetVariable: `runtime:control_mode:${action}`,
    proposedValue: { action, reasonCodes: opts?.reasonCodes ?? [] },
    expectedEffects: [
      {
        metric: 'safety_envelope_compliance',
        direction: action === 'MAINTAIN_GUIDANCE' ? 'UP' : 'DOWN',
        confidence: 0.85,
      },
    ],
    sideEffects:
      action === 'WAITING_FOR_WINDOW'
        ? [{ metric: 'schedule_delay_minutes', estimatedImpact: 0.2 }]
        : [],
    source: 'actuator',
    evidenceTier: 'expert_rule',
    title: opts?.primaryMessage,
  };
}

function inferTypeFromCausalTarget(nodeId: string): TripInterventionType {
  if (nodeId.includes('weather')) return 'ADD_BUFFER';
  if (nodeId.includes('route')) return 'CHANGE_ROUTE';
  if (nodeId.includes('temporal')) return 'SHIFT_TIME';
  if (nodeId.includes('fuel')) return 'CHANGE_TRANSPORT';
  return 'ADD_BUFFER';
}
