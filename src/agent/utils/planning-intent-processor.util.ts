/**
 * 规划阶段对话意图处理器（D1 双轨路由 / D2 供应链证据层级防御）。
 *
 * 与 route_and_run Layer1 primary 并行：本模块负责 Layer2 planning-phase sub_signals
 * 及 contingency_branches / evidence_level 元数据生成。
 *
 * 工程专题：`.cursor/capabilities/planning-phase-dialog-intent/SKILL.md`
 */

/** D2 供应链证据层级枚举 */
export enum EvidenceLevel {
  L0_USER_REPORT = 'L0_USER_REPORT',
  L1_HISTORICAL_STAT = 'L1_HISTORICAL_STAT',
  L2_RECENT_SNAPSHOT = 'L2_RECENT_SNAPSHOT',
  L3_DETERMINISTIC = 'L3_DETERMINISTIC',
}

export interface IntakeSubSignals {
  scenario_planning_requested: boolean;
  supply_chain_verification_requested: boolean;
  party_negotiation_requested: boolean;
  spatial_intent_capture_requested: boolean;
}

export interface ContingencyBranch {
  /** 触发突变条件，例如 "segment_health:seg_01 === 'CRITICAL_DISRUPTION'" */
  trigger_condition: string;
  impacted_segment_ids: string[];
  alternative_route_token: string;
  /** 相比原晴天方案的期望残存效用比 */
  expected_utility_ratio: number;
}

export interface PlanningIntentPayload {
  sub_signals: IntakeSubSignals;
  contingency_branches?: ContingencyBranch[];
  evidence_level_required?: EvidenceLevel;
  /** D2：当轮推断的可用证据层级 */
  available_evidence_level?: EvidenceLevel;
  /** D2：绝对承诺熔断结果（供 NARRATE 注入） */
  supply_chain_safety?: SupplyChainSafetyResult;
  /** D3：多人偏好仲裁 */
  party_negotiation?: PartyNegotiationPayload;
  /** D4：空间锚点插入可行性 */
  spatial_intent?: SpatialIntentFeasibilityReport;
}

export interface SupplyChainSafetyResult {
  safeToPromise: boolean;
  enforcedLevel: EvidenceLevel;
  processedResponsePrefix: string;
}

/** D3：单成员偏好向量（可来自 DecisionParams / 群聊绑定） */
export interface PartyMemberProfile {
  member_id: string;
  pace: 'intensive' | 'relaxed' | 'moderate';
  risk_tolerance: 'LOW' | 'MEDIUM' | 'HIGH';
  /** 0–1，越高越偏冒险/硬核 */
  adventure_weight: number;
}

export interface PartyBranchPolicy {
  trigger_condition: string;
  hold_route_token: string;
  proceed_route_token: string;
  dissent_member_ids: string[];
}

/** D3：多人仲裁 INTAKE 载荷 */
export interface OrganizationalRobustnessPreview {
  organizational_robustness_score: number;
  physical_robustness_score: number;
  combined_robustness_score: number;
  sample_count: number;
  peak_social_stress_node_id?: string;
  peak_social_stress_index?: number;
  peak_social_stress_day?: string;
  bottlenecks: Array<{
    nodeId: string;
    primaryRisk: 'PHYSICAL_BLOCK' | 'EMOTIONAL_EXPLOSION' | 'TIME_CRUNCH';
    triggerEvent: string;
    description: string;
  }>;
  timeline: Array<{
    timestamp: string;
    nodeId: string;
    physicsRobustness: number;
    socialStressIndex: number;
  }>;
  is_preview: true;
  source: 'intake_stub_itinerary';
}

/** D3：多人仲裁 INTAKE 载荷 */
export interface PartyNegotiationPayload {
  party_size: number;
  member_profiles: PartyMemberProfile[];
  aggregated_pace: 'intensive' | 'relaxed' | 'moderate';
  aggregated_risk_tolerance: 'LOW' | 'MEDIUM' | 'HIGH';
  /** 0–1，群体最大 pairwise 遗憾上界 */
  regret_upper_bound: number;
  branch_policies?: PartyBranchPolicy[];
  nash_reorder_hint?: {
    swap_day_a: number;
    swap_day_b: number;
    rationale_zh: string;
  };
  /** INTAKE 阶段基于现有 Trip 草案的组织鲁棒性预演（对话期可见） */
  organizational_robustness_preview?: OrganizationalRobustnessPreview;
  /** 缺真实 member DecisionParams 时需 HITL */
  requires_hitl_clarification: boolean;
}

export interface SpatialIntentConflict {
  type: 'TIME_WINDOW' | 'DRIVE_BUFFER' | 'SEASON_ROAD' | 'SCHEDULE_TIGHT';
  severity: 'WARN' | 'BLOCK';
  message_zh: string;
}

/** D4：非标锚点插入可行性报告 */
export interface SpatialIntentFeasibilityReport {
  target_day_number?: number;
  anchor_label?: string;
  attachment_type?: 'gpx' | 'image' | 'text';
  feasible: boolean;
  conflicts: SpatialIntentConflict[];
  suggested_day_number?: number;
  extra_drive_minutes_estimate?: number;
}

const DEFAULT_CONTINGENCY_UTILITY_RATIO = 0.85;

const SCENARIO_PLANNING_RE =
  /如果|要是|万一|天气突变|封路|取消|预案|备份|绕(?:过|行)|多花.*天|解耦|plan\s*b/i;

const SUPPLY_CHAIN_RE =
  /充电|油(?:站)?|信号|有网|补给|能活|趴窝|100%|确保|无人区|避难所|离线地图/i;

const PARTY_NEGOTIATION_RE =
  /朋友|队友|搭子|群里|分歧|不合|意见|想法不同|遗憾度|特种兵|躺平/i;

const SPATIAL_INTENT_RE =
  /小红书|轨迹|gpx|截图|插入|塞进|安排在|机位/i;

const ABSOLUTE_PROMISE_RE = /100%|绝对|肯定|保证|确保/i;

export class PlanningIntentProcessorUtil {
  /**
   * D1: 根据用户输入启发式提取 INTAKE Layer2 sub_signals。
   */
  extractSubSignals(text: string): IntakeSubSignals {
    const t = String(text ?? '');
    return {
      scenario_planning_requested: SCENARIO_PLANNING_RE.test(t),
      supply_chain_verification_requested: SUPPLY_CHAIN_RE.test(t),
      party_negotiation_requested: PARTY_NEGOTIATION_RE.test(t),
      spatial_intent_capture_requested: SPATIAL_INTENT_RE.test(t),
    };
  }

  /**
   * D1: scenario_planning_requested 为 true 时，生成双轨拓扑行程单 metadata 模版。
   */
  generateContingencyTemplate(segmentIds: string[]): ContingencyBranch[] {
    return segmentIds.map((id) => ({
      trigger_condition: `segment_health:${id} === 'CRITICAL_DISRUPTION'`,
      impacted_segment_ids: [id],
      alternative_route_token: `alt_token_for_${id}_via_fallback_engine`,
      expected_utility_ratio: DEFAULT_CONTINGENCY_UTILITY_RATIO,
    }));
  }

  /**
   * D2: 供应链证据分级防护 — 非 L3 数据源时拦截绝对承诺措辞。
   */
  enforceSupplyChainSafety(
    requestedText: string,
    availableDataSourceLevel: EvidenceLevel,
  ): SupplyChainSafetyResult {
    const containsAbsolutePromise = ABSOLUTE_PROMISE_RE.test(String(requestedText ?? ''));

    if (containsAbsolutePromise && availableDataSourceLevel !== EvidenceLevel.L3_DETERMINISTIC) {
      return {
        safeToPromise: false,
        enforcedLevel: availableDataSourceLevel,
        processedResponsePrefix: `> **[Decision OS 供应链安全警告]** 检测到非确定性环境。当前数据凭证等级为 **${availableDataSourceLevel}**（非 L3 实时原子数据）。系统已拦截绝对承诺，并切入动态网格 Gate 约束体系。`,
      };
    }

    return {
      safeToPromise: true,
      enforcedLevel: availableDataSourceLevel,
      processedResponsePrefix: `> **[Evidence Level: ${availableDataSourceLevel}]**`,
    };
  }

  /**
   * 聚合 sub_signals + 可选 contingency_branches + evidence_level 为 INTAKE metadata 载荷。
   */
  buildPlanningIntentPayload(params: {
    text: string;
    segmentIds?: string[];
    availableDataSourceLevel?: EvidenceLevel;
  }): PlanningIntentPayload {
    const sub_signals = this.extractSubSignals(params.text);
    const payload: PlanningIntentPayload = { sub_signals };

    if (sub_signals.scenario_planning_requested && params.segmentIds?.length) {
      payload.contingency_branches = this.generateContingencyTemplate(params.segmentIds);
    }

    if (sub_signals.supply_chain_verification_requested) {
      const level = params.availableDataSourceLevel ?? EvidenceLevel.L1_HISTORICAL_STAT;
      payload.available_evidence_level = level;
      payload.evidence_level_required = level;
      payload.supply_chain_safety = this.enforceSupplyChainSafety(params.text, level);
    }

    return payload;
  }
}

export function hasAnyPlanningPhaseSubSignal(signals: IntakeSubSignals): boolean {
  return (
    signals.scenario_planning_requested ||
    signals.supply_chain_verification_requested ||
    signals.party_negotiation_requested ||
    signals.spatial_intent_capture_requested
  );
}

/** 模块级单例，便于 util 风格调用（无需 Nest DI） */
export const planningIntentProcessor = new PlanningIntentProcessorUtil();
