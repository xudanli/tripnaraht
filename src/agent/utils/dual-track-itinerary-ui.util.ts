/**
 * 双轨行程单 UI 契约（tripnara.dual_track_itinerary@v1）
 *
 * 将 planning_phase_intent.contingency_branches 与 robustness_dashboard
 * 投影为前端可直接渲染的 A 轴默认 / B 轴条件激活结构。
 */

import type { Itinerary, ItineraryDay, ItineraryItem } from '../interfaces/trip-plan.interface';
import type { ContingencyBranch, PlanningIntentPayload } from './planning-intent-processor.util';
import type { PlanningPhaseIntentDto } from '../dto/route-and-run.dto';
import type { RobustnessDashboardPayload } from './robustness-rollout-gateway.util';

export const DUAL_TRACK_ITINERARY_SCHEMA = 'tripnara.dual_track_itinerary@v1' as const;

export type DualTrackTriggerKind =
  | 'WEATHER'
  | 'ROAD_CLOSURE'
  | 'ACTIVITY_CANCEL'
  | 'SOCIAL_STRESS'
  | 'PHYSICAL_BLOCK'
  | 'GENERIC_DISRUPTION';

export interface DualTrackAxisSegmentUi {
  segment_id: string;
  day_date?: string;
  day_index?: number;
  label_zh: string;
  item_ids?: string[];
}

export interface DualTrackBranchUi {
  branch_id: string;
  axis: 'B';
  trigger_kind: DualTrackTriggerKind;
  trigger_label_zh: string;
  trigger_condition: string;
  impacted_segment_ids: string[];
  summary_zh: string;
  expected_utility_ratio?: number;
  extra_days_upper_bound?: number;
  extra_km_upper_bound?: number;
  activation_mode: 'auto_on_trigger' | 'user_confirm';
}

export interface DualTrackItineraryUi {
  schema: typeof DUAL_TRACK_ITINERARY_SCHEMA;
  mode: 'dual_track' | 'single_track';
  axis_a_segments: DualTrackAxisSegmentUi[];
  axis_b_branches: DualTrackBranchUi[];
  regret_upper_bound?: number;
  headline_zh?: string;
  computed_at: string;
}

function inferTriggerKind(condition: string): DualTrackTriggerKind {
  const c = condition.toLowerCase();
  if (/weather|rain|storm|wind|暴雨|大雪|天气/.test(c)) return 'WEATHER';
  if (/road|f.?road|封路|closed|绕行/.test(c)) return 'ROAD_CLOSURE';
  if (/cancel|取消|闭馆/.test(c)) return 'ACTIVITY_CANCEL';
  if (/social_stress|emotional|搭子|社交/.test(c)) return 'SOCIAL_STRESS';
  if (/physical_block|physical|block/.test(c)) return 'PHYSICAL_BLOCK';
  return 'GENERIC_DISRUPTION';
}

function triggerLabelZh(kind: DualTrackTriggerKind, condition: string): string {
  switch (kind) {
    case 'WEATHER':
      return '恶劣天气（暴雨/大风/能见度不足）';
    case 'ROAD_CLOSURE':
      return '路段封路或 F-Road 未开放';
    case 'ACTIVITY_CANCEL':
      return '核心活动取消或景点临时闭馆';
    case 'SOCIAL_STRESS':
      return '团队疲劳/社交摩擦超阈值';
    case 'PHYSICAL_BLOCK':
      return '物理不可行（时间窗/体力/路况）';
    default:
      return condition.length > 48 ? `${condition.slice(0, 45)}…` : condition || '行程节点突变';
  }
}

function itemLabel(item: ItineraryItem): string {
  return item.location_ref?.name?.trim() || String(item.type ?? '活动');
}

function buildDaySegmentLabel(day: ItineraryDay, dayIndex: number): string {
  const names = (day.items ?? [])
    .filter((it) => it.type !== 'REST' && it.type !== 'TRANSIT')
    .slice(0, 3)
    .map(itemLabel)
    .filter(Boolean);
  const prefix = `Day ${dayIndex + 1}`;
  if (!names.length) return `${prefix} · ${day.date}`;
  return `${prefix} · ${names.join(' → ')}`;
}

export function buildAxisASegmentsFromItinerary(itinerary?: Itinerary | null): DualTrackAxisSegmentUi[] {
  if (!itinerary?.days?.length) return [];
  return itinerary.days.map((day, idx) => ({
    segment_id: `seg_day_${idx + 1}`,
    day_date: day.date,
    day_index: idx + 1,
    label_zh: buildDaySegmentLabel(day, idx),
    item_ids: (day.items ?? []).map((it) => it.id).filter(Boolean) as string[],
  }));
}

function branchFromContingency(contingency: ContingencyBranch, index: number): DualTrackBranchUi {
  const kind = inferTriggerKind(contingency.trigger_condition);
  const segIds = contingency.impacted_segment_ids ?? [];
  return {
    branch_id: `plan_b_intent_${index + 1}`,
    axis: 'B',
    trigger_kind: kind,
    trigger_label_zh: triggerLabelZh(kind, contingency.trigger_condition),
    trigger_condition: contingency.trigger_condition,
    impacted_segment_ids: segIds,
    summary_zh:
      segIds.length > 0
        ? `若 ${segIds.join('、')} 触发突变，激活备用路由（${contingency.alternative_route_token}）`
        : `触发突变时激活备用路由（${contingency.alternative_route_token}）`,
    expected_utility_ratio: contingency.expected_utility_ratio,
    activation_mode: 'auto_on_trigger',
  };
}

function branchFromRobustnessPlan(
  plan: RobustnessDashboardPayload['contingency_plans'][number],
  bottleneck: RobustnessDashboardPayload['bottlenecks'][number] | undefined,
  index: number,
): DualTrackBranchUi {
  const kind = inferTriggerKind(plan.condition);
  const nodeId = plan.trigger_node_id;
  return {
    branch_id: `plan_b_rollout_${index + 1}`,
    axis: 'B',
    trigger_kind: kind,
    trigger_label_zh: triggerLabelZh(kind, plan.condition),
    trigger_condition: plan.condition,
    impacted_segment_ids: nodeId ? [nodeId] : [],
    summary_zh: bottleneck?.description
      ? `预演瓶颈：${bottleneck.description}`
      : `节点 ${nodeId} 突变时插入休息/改线步骤（+${plan.mutated_ir_step_delta} IR 步）`,
    activation_mode: kind === 'SOCIAL_STRESS' ? 'user_confirm' : 'auto_on_trigger',
  };
}

function resolvePlanningIntent(
  raw?: PlanningIntentPayload | PlanningPhaseIntentDto | null,
): PlanningIntentPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as PlanningIntentPayload;
}

export function buildDualTrackItineraryUi(input: {
  itinerary?: Itinerary | null;
  planningPhaseIntent?: PlanningIntentPayload | PlanningPhaseIntentDto | null;
  robustnessDashboard?: RobustnessDashboardPayload | null;
  regretUpperBound?: number;
}): DualTrackItineraryUi {
  const axis_a_segments = buildAxisASegmentsFromItinerary(input.itinerary);
  const intent = resolvePlanningIntent(input.planningPhaseIntent);
  const branches: DualTrackBranchUi[] = [];

  for (const [i, cb] of (intent?.contingency_branches ?? []).entries()) {
    branches.push(branchFromContingency(cb, i));
  }

  const dashboard = input.robustnessDashboard;
  if (dashboard?.contingency_plans?.length) {
    for (const [i, plan] of dashboard.contingency_plans.entries()) {
      const bottleneck = dashboard.bottlenecks.find((b) => b.nodeId === plan.trigger_node_id);
      const duplicate = branches.some(
        (b) => b.impacted_segment_ids[0] === plan.trigger_node_id && b.trigger_condition === plan.condition,
      );
      if (!duplicate) {
        branches.push(branchFromRobustnessPlan(plan, bottleneck, i));
      }
    }
  }

  const regret =
    input.regretUpperBound ??
    intent?.party_negotiation?.regret_upper_bound;

  const mode = branches.length > 0 ? 'dual_track' : 'single_track';
  const headline_zh =
    mode === 'dual_track'
      ? `晴/雨双轨行程单：默认 A 轴 ${axis_a_segments.length} 天；${branches.length} 条 B 轴预案待条件激活`
      : axis_a_segments.length > 0
        ? `单轨行程：${axis_a_segments.length} 天动线已优化`
        : undefined;

  return {
    schema: DUAL_TRACK_ITINERARY_SCHEMA,
    mode,
    axis_a_segments,
    axis_b_branches: branches,
    ...(typeof regret === 'number' ? { regret_upper_bound: regret } : {}),
    ...(headline_zh ? { headline_zh } : {}),
    computed_at: new Date().toISOString(),
  };
}
