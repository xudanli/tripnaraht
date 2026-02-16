/**
 * OrchestratorState <-> DecisionState 映射
 *
 * Phase 2.1: 在 ClaudeOrchestrator 中维持 DSO 与 OrchestratorState 的双向投影
 *
 * 参考: docs/DECISION_KERNEL_UPGRADE_ROADMAP.md
 */

import {
  DecisionStatePatch,
  UserIntent,
  ConstraintReport,
  EnvironmentState,
} from './decision-state.types';
import {
  OrchestratorState,
  TripPlanRequest,
  GateResult,
} from '../../agent/interfaces/trip-plan.interface';

/**
 * 从 OrchestratorState 投影为 DecisionStatePatch（增量更新用）
 */
export function orchestratorStateToDecisionStatePatch(
  os: OrchestratorState,
): DecisionStatePatch {
  const patch: DecisionStatePatch = {
    requestId: os.request_id,
  };

  if (os.trip_plan_request) {
    patch.userIntent = tripPlanRequestToUserIntent(os.trip_plan_request);
    patch.userIntent!.gaps = os.gaps;
  }

  if (os.gate_result) {
    patch.constraints = gateResultToConstraintReport(os.gate_result);
  }

  if (os.itinerary?.metadata) {
    patch.tripState = {
      planVersion: os.plan_version,
      planDraft: os.itinerary,
    };
  } else if (os.plan_version !== undefined) {
    patch.tripState = { ...patch.tripState, planVersion: os.plan_version };
  }

  if (os.research_data) {
    patch.environmentState = extractEnvironmentFromResearchData(os.research_data, os.trip_plan_request);
  }

  patch.systemState = {
    requestId: os.request_id,
    currentPhase: os.current_step,
    startedAt: os.metadata?.started_at,
    lastUpdatedAt: os.metadata?.last_updated_at,
  };

  return patch;
}

/**
 * 从 TripPlanRequest 提取 UserIntent
 */
function tripPlanRequestToUserIntent(req: TripPlanRequest): UserIntent {
  const intent: UserIntent = {
    destination: req.destination,
    origin: req.origin,
    mode: req.mode,
    constraints: req.constraints as Record<string, unknown>,
    preferences: req.preferences as Record<string, unknown>,
  };

  if (req.date_range) {
    intent.dateRange = {
      startDate: req.date_range.start_date,
      endDate: req.date_range.end_date,
    };
  }
  if (req.start_date && req.days) {
    intent.dateRange = inferDateRangeFromStartAndDays(req.start_date, req.days);
    intent.days = req.days;
  } else if (req.days) {
    intent.days = req.days;
  }

  if (req.party) {
    intent.party = {
      count: req.party.count,
      fitnessLevel: req.party.fitness_level,
      riskTolerance: req.party_profile?.risk_tolerance,
    };
  }

  return intent;
}

/**
 * 从 research_data 提取 EnvironmentState
 */
function extractEnvironmentFromResearchData(
  researchData: Record<string, any>,
  tripPlanRequest?: TripPlanRequest,
): EnvironmentState {
  const env: EnvironmentState = {};
  if (researchData.countryCode || researchData.country_code) {
    env.countryCode = researchData.countryCode ?? researchData.country_code;
  }
  if (researchData.route_direction_id || researchData.routeDirectionId) {
    env.routeDirectionId = researchData.route_direction_id ?? researchData.routeDirectionId;
  }
  if (researchData.month !== undefined) {
    env.month = typeof researchData.month === 'number' ? researchData.month : parseInt(String(researchData.month), 10);
  } else if (tripPlanRequest?.start_date) {
    env.month = new Date(tripPlanRequest.start_date).getMonth() + 1;
  } else if (tripPlanRequest?.date_range?.start_date) {
    env.month = new Date(tripPlanRequest.date_range.start_date).getMonth() + 1;
  }
  if (researchData.road_conditions || researchData.roadConditions) {
    env.roadConditions = researchData.road_conditions ?? researchData.roadConditions;
  }
  if (researchData.weather_risk !== undefined || researchData.weatherRisk !== undefined) {
    env.weatherRisk = researchData.weather_risk ?? researchData.weatherRisk;
  }
  if (researchData.failure_risk_prediction?.predictions) {
    const preds = researchData.failure_risk_prediction.predictions;
    const hasHigh = preds.some((p: any) => p.riskLevel === 'HIGH');
    const hasModerate = preds.some((p: any) => p.riskLevel === 'MODERATE' || p.riskLevel === 'MEDIUM');
    env.failureRiskLevel = hasHigh ? 'HIGH' : hasModerate ? 'MEDIUM' : 'LOW';
  }
  return env;
}

function inferDateRangeFromStartAndDays(start: string, days: number): { startDate: string; endDate: string } {
  const startDate = new Date(start);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + days - 1);
  return {
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
  };
}

/**
 * 从 GateResult 投影为 ConstraintReport
 */
function gateResultToConstraintReport(gate: GateResult): ConstraintReport {
  const feasible = gate.gate_result === 'ALLOW';
  const violations = (gate.violations || []).map((v) => ({
    type: v.type,
    severity: v.severity,
    detail: v.detail,
  }));
  return {
    feasible,
    violations,
    feasibleActions: gate.required_adjustments?.map((a) => a.action),
  };
}
