/**
 * Maps incomplete world-state slices to canonical UNKNOWN / REQUIRES_VERIFICATION assertions.
 */

import { randomUUID } from 'crypto';
import type { TripPlan } from '../../../trips/decision/plan-model';
import type { TripWorldState } from '../../../trips/decision/world-model';
import type { ConstraintAssertion } from '../contracts/constraint-assertion';
import type { WorldStateCompleteness } from '../contracts/world-state-completeness';
import {
  COMPLETENESS_EVALUATOR_META,
  planRequiresFerryData,
  planRequiresRoadData,
} from './completeness-evaluator.util';

export function buildCompletenessAssertions(input: {
  tripId: string;
  candidateId?: string;
  completeness: WorldStateCompleteness;
  plan?: TripPlan;
  worldState?: TripWorldState;
}): ConstraintAssertion[] {
  const assertions: ConstraintAssertion[] = [];
  const candidateScope = input.candidateId;

  if (
    input.completeness.roads === 'MISSING' &&
    input.plan &&
    planRequiresRoadData(input.plan, input.worldState)
  ) {
    assertions.push(
      makeAssertion({
        tripId: input.tripId,
        constraintType: 'ROAD_STATE_DATA',
        status: 'REQUIRES_VERIFICATION',
        severity: 'CRITICAL',
        reasonCode: 'ROAD_DATA_NOT_LOADED',
        message:
          '道路开放状态未加载；无法确认方案在当前道路条件下可执行（空数组不代表无封闭路段）',
        remediationHints: [
          '等待路况数据刷新后重新评估',
          '人工核实 SafeTravel / 官方道路状态',
          '考虑不依赖未验证路段的替代路线',
        ],
        candidateId: candidateScope,
      }),
    );
  } else if (input.completeness.roads === 'PARTIAL') {
    assertions.push(
      makeAssertion({
        tripId: input.tripId,
        constraintType: 'ROAD_STATE_DATA',
        status: 'UNKNOWN',
        severity: 'HIGH',
        reasonCode: 'ROAD_DATA_PARTIAL',
        message: '道路状态数据不完整，部分路段开放状态未知',
        candidateId: candidateScope,
      }),
    );
  }

  if (input.completeness.hazards === 'MISSING') {
    assertions.push(
      makeAssertion({
        tripId: input.tripId,
        constraintType: 'HAZARD_ZONE_DATA',
        status: 'UNKNOWN',
        severity: 'HIGH',
        reasonCode: 'HAZARD_DATA_NOT_LOADED',
        message: '危险区数据未加载，无法确认是否进入禁行或高风险区域',
        candidateId: candidateScope,
      }),
    );
  }

  if (
    input.completeness.ferries === 'MISSING' &&
    input.plan &&
    planRequiresFerryData(input.plan)
  ) {
    assertions.push(
      makeAssertion({
        tripId: input.tripId,
        constraintType: 'FERRY_STATE_DATA',
        status: 'REQUIRES_VERIFICATION',
        severity: 'HIGH',
        reasonCode: 'FERRY_DATA_NOT_LOADED',
        message: '渡轮运营状态未加载，无法确认渡轮段可执行',
        candidateId: candidateScope,
      }),
    );
  }

  if (input.completeness.weather === 'MISSING') {
    assertions.push(
      makeAssertion({
        tripId: input.tripId,
        constraintType: 'WEATHER_DATA',
        status: 'UNKNOWN',
        severity: 'MEDIUM',
        reasonCode: 'WEATHER_DATA_NOT_LOADED',
        message: '天气执行信号未加载，户外活动风险无法确认',
        candidateId: candidateScope,
      }),
    );
  }

  return assertions;
}

function makeAssertion(params: {
  tripId: string;
  constraintType: string;
  status: ConstraintAssertion['status'];
  severity: ConstraintAssertion['severity'];
  reasonCode: string;
  message: string;
  remediationHints?: string[];
  candidateId?: string;
}): ConstraintAssertion {
  return {
    assertionId: `completeness_${randomUUID()}`,
    constraintType: params.constraintType,
    status: params.status,
    severity: params.severity,
    scope: { tripId: params.tripId },
    reasonCode: params.reasonCode,
    evidenceRefs: [],
    message: params.message,
    remediationHints: params.remediationHints,
    evaluator: {
      engine: COMPLETENESS_EVALUATOR_META.engine,
      version: COMPLETENESS_EVALUATOR_META.version,
    },
    overridable: params.status !== 'BLOCK',
    confidence: params.status === 'REQUIRES_VERIFICATION' ? 0.3 : 0.5,
  };
}
