/**
 * OrchestratorState <-> DecisionState 映射
 *
 * Phase 2.1: 在 ClaudeOrchestrator 中维持 DSO 与 OrchestratorState 的双向投影
 * P2: DSO 为主状态源完全反转 - buildPatchFromDSOPrimary 优先使用 DSO
 *
 * 参考: docs/DECISION_KERNEL_UPGRADE_ROADMAP.md, DECISION_OS_PATENT_GAP_IMPLEMENTATION_PLAN.md
 */

import {
  DecisionState,
  DecisionStatePatch,
  StateHistoryDelta,
  UserIntent,
  ConstraintReport,
  EnvironmentState,
} from './decision-state.types';
import {
  OrchestratorState,
  TripPlanRequest,
  GateResult,
  GateResultStatus,
  GateViolation,
  RequiredAdjustment,
} from '../../agent/interfaces/trip-plan.interface';
import { inferDecisionMeta, DecisionMetaInput } from './decision-meta-inference';
import {
  buildTravelOntologyStateFromOrchestrator,
  mergeTravelOntologyState,
} from './travel-ontology.mapper';

function isPlaceholderDestination(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'object') return false;
  const s = String(value).trim();
  if (!s) return true;
  if (s === '未指定') return true;
  return /未指定|待定|unknown|unspecified|tbd/i.test(s);
}

/**
 * STATE_UPDATE：合并 O→D 的 userIntent，避免 DSO 仅含 gaps 等片段时整份替换丢掉编排器刚解析的 destination。
 */
export function mergeUserIntentForDsoPrimaryPatch(
  fromOrchestrator: UserIntent | undefined,
  fromDso: UserIntent | undefined,
): UserIntent | undefined {
  const o = fromOrchestrator ?? {};
  const d = fromDso ?? {};
  const merged: UserIntent = { ...o, ...d };
  if (isPlaceholderDestination(merged.destination) && !isPlaceholderDestination(o.destination)) {
    merged.destination = o.destination;
  }
  if (
    (merged.origin === undefined ||
      merged.origin === '' ||
      merged.origin === '起点') &&
    o.origin !== undefined &&
    o.origin !== '' &&
    o.origin !== '起点'
  ) {
    merged.origin = o.origin;
  }
  if (!merged.regionId && o.regionId) {
    merged.regionId = o.regionId;
  }
  if (
    (!merged.mustIncludePoiIds || merged.mustIncludePoiIds.length === 0) &&
    o.mustIncludePoiIds?.length
  ) {
    merged.mustIncludePoiIds = o.mustIncludePoiIds;
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

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
    ...(Boolean((os.metadata as any)?.early_warning_acknowledged) ? { earlyWarningAcknowledged: true } : {}),
    ...((os.metadata as any)?.emergency_constraints
      ? { emergency_constraints: (os.metadata as any).emergency_constraints }
      : {}),
  };

  const metaInput: DecisionMetaInput = {
    currentStep: os.current_step,
    planVersion: os.plan_version,
    failureRiskPredictions: os.research_data?.failure_risk_prediction?.predictions,
    complianceRiskWarnings: os.compliance_result?.risk_warnings,
    riskTolerance: os.trip_plan_request?.party_profile?.risk_tolerance,
  };
  patch.decisionMeta = inferDecisionMeta(metaInput);

  const travelOntology = buildTravelOntologyStateFromOrchestrator(os);
  if (travelOntology) patch.travelOntologyState = travelOntology;

  return patch;
}

/**
 * DSO 为主状态源：构建 patch 时优先使用 DSO，O 仅补齐 DSO 缺失的字段
 * 用于 STATE_UPDATE、FEEDBACK 等步骤，避免 O→D 覆盖 DSO 已有数据
 * 专利 P2: 移除「先改 O 再同步 DSO」模式
 */
export function buildPatchFromDSOPrimary(
  dso: DecisionState,
  os: OrchestratorState,
): DecisionStatePatch {
  const fromO = orchestratorStateToDecisionStatePatch(os);
  const patch: DecisionStatePatch = {
    requestId: dso.systemState?.requestId ?? dso.requestId ?? os.request_id,
  };

  // 字段级合并：DSO 片段（如仅 gaps）不得覆盖 O 中已解析的 destination / origin
  patch.userIntent = mergeUserIntentForDsoPrimaryPatch(fromO.userIntent, dso.userIntent);
  if (patch.userIntent && (os.gaps?.length || patch.userIntent.gaps?.length)) {
    patch.userIntent = { ...patch.userIntent, gaps: os.gaps ?? patch.userIntent.gaps };
  }

  patch.constraints = dso.constraints && Object.keys(dso.constraints).length > 0 ? dso.constraints : fromO.constraints;

  patch.tripState =
    dso.tripState?.planDraft || dso.tripState?.planVersion !== undefined
      ? { planVersion: dso.tripState.planVersion, planDraft: dso.tripState.planDraft }
      : fromO.tripState;

  patch.environmentState =
    dso.environmentState && Object.keys(dso.environmentState).length > 0
      ? dso.environmentState
      : fromO.environmentState;

  const earlyAck = Boolean(
    dso.systemState?.earlyWarningAcknowledged || (os.metadata as any)?.early_warning_acknowledged,
  );
  patch.systemState = {
    requestId: patch.requestId ?? os.request_id ?? '',
    currentPhase: os.current_step,
    startedAt: dso.systemState?.startedAt ?? os.metadata?.started_at,
    lastUpdatedAt: new Date().toISOString(),
    ...(earlyAck ? { earlyWarningAcknowledged: true } : {}),
    ...((dso.systemState as any)?.emergency_constraints
      ? { emergency_constraints: (dso.systemState as any).emergency_constraints }
      : (os.metadata as any)?.emergency_constraints
        ? { emergency_constraints: (os.metadata as any).emergency_constraints }
        : {}),
  };

  patch.decisionMeta = dso.decisionMeta ?? fromO.decisionMeta;

  if (fromO.travelOntologyState) {
    patch.travelOntologyState = mergeTravelOntologyState(dso.travelOntologyState, fromO.travelOntologyState);
  }

  return patch;
}

/**
 * 从 patch 构建 history 差分（Token 优化：只记录变化）
 * P3: 供 Kernel.executeStateUpdate 冲突回退时使用
 */
export function buildHistoryDeltasFromPatch(patch: DecisionStatePatch): StateHistoryDelta[] {
  const now = new Date().toISOString();
  const deltas: StateHistoryDelta[] = [];
  if (patch.userIntent) {
    deltas.push({ type: 'userIntent', summary: 'intent synced', at: now });
  }
  if (patch.environmentState) {
    deltas.push({ type: 'weather', summary: 'env synced', at: now });
  }
  if (patch.tripState?.delayMinutes !== undefined) {
    deltas.push({ type: 'delay', summary: `delay=${patch.tripState.delayMinutes}m`, at: now });
  }
  if (patch.constraints) {
    deltas.push({
      type: 'constraints',
      summary: patch.constraints.feasible ? 'allowed' : `violations=${patch.constraints.violations?.length ?? 0}`,
      at: now,
    });
  }
  if (patch.tripState?.planDraft) {
    deltas.push({ type: 'plan', summary: 'plan draft updated', at: now });
  }
  if (patch.travelOntologyState) {
    deltas.push({ type: 'ontology', summary: 'travelOntologyState updated', at: now });
  }
  if (patch.poiPlanning) {
    deltas.push({
      type: 'poi_planning',
      summary: `region=${patch.poiPlanning.routeIntent?.regionId ?? 'n/a'} anchors=${patch.poiPlanning.poiPlan?.requiredAnchorPoiIds?.length ?? 0}`,
      at: now,
    });
  }
  return deltas;
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

  if (req.region_id?.trim()) {
    intent.regionId = req.region_id.trim();
  }
  if (req.must_include_poi_ids?.length) {
    intent.mustIncludePoiIds = [...req.must_include_poi_ids];
  }
  if (req.exclude_poi_ids?.length) {
    intent.excludePoiIds = [...req.exclude_poi_ids];
  }
  if (req.total_budget_minutes !== undefined && Number.isFinite(req.total_budget_minutes)) {
    intent.totalBudgetMinutes = Math.max(0, Math.round(req.total_budget_minutes));
  }
  if (req.pace) {
    intent.pace = req.pace;
  }
  if (req.style_tags?.length) {
    intent.styleTags = [...req.style_tags];
  }
  if (req.constraints?.daily_time_window) {
    intent.availableStartTime = req.constraints.daily_time_window.start;
    intent.availableEndTime = req.constraints.daily_time_window.end;
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
  const rcw = researchData.routeCorridorWorld ?? researchData.route_corridor_world;
  if (rcw && typeof rcw === 'object' && !Array.isArray(rcw)) {
    env.routeCorridorWorld = rcw as EnvironmentState['routeCorridorWorld'];
    const rid = (rcw as { routeDirectionId?: string }).routeDirectionId;
    if (!env.routeDirectionId && typeof rid === 'string' && rid.trim()) {
      env.routeDirectionId = rid.trim();
    }
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
  // 避流：从 research_data 提取拥挤程度 (0-1)
  if (researchData.crowd_level !== undefined || researchData.crowdLevel !== undefined) {
    const c = researchData.crowd_level ?? researchData.crowdLevel;
    env.crowdLevel = typeof c === 'number' ? Math.min(1, Math.max(0, c)) : undefined;
  } else if (researchData.crowd_score !== undefined || researchData.crowdScore !== undefined) {
    env.crowdLevel = Math.min(1, Math.max(0, researchData.crowd_score ?? researchData.crowdScore ?? 0));
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
 * 从 DSO 投影为 OrchestratorState 的增量（DECISION_OS_PATENT_GAP_IMPLEMENTATION_PLAN）
 * 当 DSO 为主状态源时，用于派生 OrchestratorState 供 Skills/Agents 兼容层使用
 */
export function decisionStateToOrchestratorState(
  dso: DecisionState,
  base?: Partial<OrchestratorState>,
): Partial<OrchestratorState> {
  const requestId = dso.systemState?.requestId ?? dso.requestId ?? '';
  const out: Partial<OrchestratorState> = {
    request_id: requestId,
    current_step: (dso.systemState?.currentPhase as OrchestratorState['current_step']) ?? 'INTAKE',
    plan_version: dso.tripState?.planVersion,
    metadata: {
      ...base?.metadata,
      started_at: base?.metadata?.started_at ?? dso.systemState?.startedAt ?? new Date().toISOString(),
      last_updated_at: dso.systemState?.lastUpdatedAt ?? new Date().toISOString(),
      ...(dso.systemState?.earlyWarningAcknowledged ? { early_warning_acknowledged: true } : {}),
    },
  };

  if (dso.userIntent && Object.keys(dso.userIntent).length > 0) {
    out.trip_plan_request = userIntentToTripPlanRequest(dso.userIntent, requestId);
    out.gaps = dso.userIntent.gaps as OrchestratorState['gaps'];
  }

  if (dso.constraints) {
    out.gate_result = constraintReportToGateResult(dso.constraints);
  }

  if (dso.tripState?.planDraft) {
    out.itinerary = dso.tripState.planDraft as OrchestratorState['itinerary'];
  }

  // 仅当 base 无 research_data 时派生；否则保留 Skills 写入的完整数据
  if (dso.environmentState && Object.keys(dso.environmentState).length > 0 && !base?.research_data) {
    out.research_data = environmentStateToResearchData(dso.environmentState);
  }

  // Scheme B: 保留 base 的运行时累积字段（alternatives、compliance_result、narration 等）
  // DSO `tripState.orchestratorAlternatives`（Kernel GATE_EVAL BLOCK 写入）优先于 base
  if (dso.tripState?.orchestratorAlternatives) {
    out.alternatives = dso.tripState.orchestratorAlternatives as OrchestratorState['alternatives'];
  } else if (base?.alternatives) {
    out.alternatives = base.alternatives;
  }
  if (base?.compliance_result) out.compliance_result = base.compliance_result;
  if (base?.narration) out.narration = base.narration;
  if (base?.clarification_questions?.length) out.clarification_questions = base.clarification_questions;
  if (base?.decision_log?.length) out.decision_log = base.decision_log;
  if (base?.evidence_registry) out.evidence_registry = base.evidence_registry;
  if (base?.errors?.length) out.errors = base.errors;

  return out;
}

function userIntentToTripPlanRequest(intent: UserIntent, requestId: string): TripPlanRequest {
  const req: TripPlanRequest = {
    request_id: requestId,
    origin: (intent.origin as TripPlanRequest['origin']) ?? '',
    destination: (intent.destination as TripPlanRequest['destination']) ?? '',
  };
  if (intent.dateRange) {
    req.date_range = {
      start_date: intent.dateRange.startDate,
      end_date: intent.dateRange.endDate,
    };
  }
  if (intent.days) req.days = intent.days;
  if (intent.mode) req.mode = intent.mode;
  if (intent.party) {
    req.party = {
      count: intent.party.count,
      fitness_level: intent.party.fitnessLevel as 'low' | 'medium' | 'high' | undefined,
    };
    req.party_profile = { risk_tolerance: intent.party.riskTolerance as 'LOW' | 'MEDIUM' | 'HIGH' | undefined };
  }
  if (intent.constraints) req.constraints = intent.constraints as TripPlanRequest['constraints'];
  if (intent.preferences) req.preferences = intent.preferences as TripPlanRequest['preferences'];
  if (intent.regionId) req.region_id = intent.regionId;
  if (intent.mustIncludePoiIds?.length) {
    req.must_include_poi_ids = [...intent.mustIncludePoiIds];
  }
  if (intent.excludePoiIds?.length) {
    req.exclude_poi_ids = [...intent.excludePoiIds];
  }
  if (intent.totalBudgetMinutes !== undefined) {
    req.total_budget_minutes = intent.totalBudgetMinutes;
  }
  if (intent.pace) req.pace = intent.pace;
  if (intent.styleTags?.length) {
    req.style_tags = [...intent.styleTags];
  }
  return req;
}

function constraintReportToGateResult(cr: ConstraintReport): GateResult {
  if (cr.gateOutcome === 'NEED_USER_CONFIRM') {
    const violations: GateViolation[] = (cr.violations ?? []).map((v) => ({
      type: v.type as GateViolation['type'],
      severity: v.severity,
      detail: v.detail,
    }));
    const required_adjustments: RequiredAdjustment[] = (cr.feasibleActions ?? []).map((a) => ({
      action: a as RequiredAdjustment['action'],
      why: a,
    }));
    return {
      gate_result: 'NEED_USER_CONFIRM',
      violations,
      required_adjustments,
      confidence: 0.8,
    };
  }
  const gate_result: GateResultStatus = cr.feasible ? 'ALLOW' : cr.violations?.some((v) => v.severity === 'HARD') ? 'BLOCK' : 'ADJUST_REQUIRED';
  const violations: GateViolation[] = (cr.violations ?? []).map((v) => ({
    type: v.type as GateViolation['type'],
    severity: v.severity,
    detail: v.detail,
  }));
  const required_adjustments: RequiredAdjustment[] = (cr.feasibleActions ?? []).map((a) => ({
    action: a as RequiredAdjustment['action'],
    why: a,
  }));
  return {
    gate_result,
    violations,
    required_adjustments,
    confidence: 0.8,
  };
}

function environmentStateToResearchData(env: EnvironmentState): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (env.countryCode) data.countryCode = env.countryCode;
  if (env.routeDirectionId) data.route_direction_id = env.routeDirectionId;
  if (env.routeCorridorWorld) data.routeCorridorWorld = env.routeCorridorWorld;
  if (env.month !== undefined) data.month = env.month;
  if (env.roadConditions) data.road_conditions = env.roadConditions;
  if (env.weatherRisk !== undefined) data.weather_risk = env.weatherRisk;
  if (env.failureRiskLevel) {
    data.failure_risk_prediction = {
      predictions: [{ riskLevel: env.failureRiskLevel }],
    };
  }
  if (env.crowdLevel !== undefined) data.crowd_level = env.crowdLevel;
  return data;
}

/**
 * 从 GateResult 投影为 ConstraintReport
 */
function gateResultToConstraintReport(gate: GateResult): ConstraintReport {
  if (gate.gate_result === 'NEED_USER_CONFIRM') {
    const violations = (gate.violations || []).map((v) => ({
      type: v.type,
      severity: v.severity,
      detail: v.detail,
      degree: v.severity === 'HARD' ? 1 : 0.5,
    }));
    return {
      feasible: false,
      violations,
      feasibleActions: gate.required_adjustments?.map((a) => a.action),
      gateOutcome: 'NEED_USER_CONFIRM',
    };
  }
  const feasible = gate.gate_result === 'ALLOW';
  const violations = (gate.violations || []).map((v) => ({
    type: v.type,
    severity: v.severity,
    detail: v.detail,
    degree: v.severity === 'HARD' ? 1 : 0.5,
  }));
  const gateOutcome: ConstraintReport['gateOutcome'] =
    gate.gate_result === 'ALLOW'
      ? 'ALLOW'
      : gate.gate_result === 'ADJUST_REQUIRED'
        ? 'ADJUST_REQUIRED'
        : 'BLOCK';
  return {
    feasible,
    violations,
    feasibleActions: gate.required_adjustments?.map((a) => a.action),
    gateOutcome,
  };
}
