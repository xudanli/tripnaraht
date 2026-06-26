import type { DecisionState, VerificationIssue } from '../../decision/kernel/decision-state.types';
import type {
  NarrationLike,
  NarrationResearchUiHint,
  PhaseExecutorContext,
} from '../../decision/kernel/interfaces/phase-executor.interface';

export type TripInteractionStage = 'PRE_TRIP' | 'IN_TRIP' | 'POST_TRIP' | 'UNKNOWN';

export interface ProactiveUxHint {
  id: string;
  stage: TripInteractionStage;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  surface: 'GLANCEABLE' | 'DETAIL';
  messageZh: string;
  reason: 'DATA_RELIABILITY' | 'SAFETY' | 'TIME_PRESSURE' | 'PERSONALIZATION';
}

interface DataReliabilitySnapshot {
  evidence_count?: number;
  finding_count?: number;
  disclosure?: string;
}

function parseDateMs(value: unknown): number | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const n = Date.parse(value);
  return Number.isFinite(n) ? n : undefined;
}

export function inferTripInteractionStage(
  ctx: Pick<PhaseExecutorContext, 'tripPlanRequest'>,
  nowMs = Date.now(),
): TripInteractionStage {
  const start =
    parseDateMs(ctx.tripPlanRequest?.date_range?.start_date) ??
    parseDateMs(ctx.tripPlanRequest?.start_date);
  const end = parseDateMs(ctx.tripPlanRequest?.date_range?.end_date);
  if (!start && !end) return 'UNKNOWN';
  if (start && nowMs < start) return 'PRE_TRIP';
  if ((!start || nowMs >= start) && end && nowMs <= end) return 'IN_TRIP';
  if (end && nowMs > end) return 'POST_TRIP';
  return 'UNKNOWN';
}

function getDataReliabilitySnapshot(ctx: PhaseExecutorContext): DataReliabilitySnapshot | undefined {
  const meta = ctx.itinerary?.metadata as Record<string, unknown> | undefined;
  const snap = meta?.__data_reliability;
  if (!snap || typeof snap !== 'object' || Array.isArray(snap)) return undefined;
  return snap as DataReliabilitySnapshot;
}

function getRiskTolerance(ctx: PhaseExecutorContext): 'LOW' | 'MEDIUM' | 'HIGH' {
  const raw =
    ctx.tripPlanRequest?.party_profile?.risk_tolerance ??
    ctx.user_profile?.preferences?.risk_tolerance;
  const s = String(raw ?? '').trim().toUpperCase();
  if (s === 'LOW' || s === 'HIGH') return s;
  return 'MEDIUM';
}

function hasIssue(issues: VerificationIssue[], codes: VerificationIssue['code'][]): boolean {
  return issues.some((i) => codes.includes(i.code));
}

function hasRiskEventIssue(issues: VerificationIssue[]): boolean {
  return issues.some((i) => String(i.message ?? '').startsWith('[风险事件|'));
}

export function buildProactiveUxHintsFromCascadeImpact(params: {
  dependencyImpact?: {
    impact?: {
      affected?: Array<{
        riskLevel?: string;
        message?: string;
        recommendation?: string;
        cascadeConfidence?: number;
        netImpactMinutes?: number;
      }>;
    };
  } | null;
  stage?: TripInteractionStage;
}): ProactiveUxHint[] {
  const affected = params.dependencyImpact?.impact?.affected ?? [];
  if (!affected.length) return [];

  const stage = params.stage ?? 'UNKNOWN';
  const rank = (risk: string | undefined): ProactiveUxHint['priority'] => {
    if (risk === 'CRITICAL' || risk === 'HIGH') return 'HIGH';
    if (risk === 'MEDIUM') return 'MEDIUM';
    return 'LOW';
  };

  return affected.slice(0, 4).map((node, index) => {
    const confidenceNote =
      typeof node.cascadeConfidence === 'number'
        ? `（级联置信度 ${Math.round(node.cascadeConfidence * 100)}%）`
        : '';
    const impactNote =
      typeof node.netImpactMinutes === 'number' && node.netImpactMinutes > 0
        ? `净影响约 ${node.netImpactMinutes} 分钟`
        : '';
    const suffix = [impactNote, confidenceNote].filter(Boolean).join('，');

    return {
      id: `cascade_impact_${index}`,
      stage,
      priority: rank(node.riskLevel),
      surface: 'GLANCEABLE' as const,
      messageZh: `级联影响：${String(node.message ?? '下游行程节点可能受影响')}${suffix ? `，${suffix}` : ''}（建议：${node.recommendation ?? 'ADJUST'}，需您自行确认）`,
      reason: 'SAFETY' as const,
    };
  });
}

export function buildProactiveUxHints(params: {
  dso: DecisionState;
  ctx: PhaseExecutorContext;
  nowMs?: number;
}): ProactiveUxHint[] {
  const { dso, ctx } = params;
  const stage = inferTripInteractionStage(ctx, params.nowMs);
  const issues = dso.verification?.issues ?? [];
  const reliability = getDataReliabilitySnapshot(ctx);
  const riskTolerance = getRiskTolerance(ctx);
  const hints: ProactiveUxHint[] = [];

  const cascadeHints = buildProactiveUxHintsFromCascadeImpact({
    dependencyImpact: (params.ctx as { dependency_impact?: unknown })?.dependency_impact as any,
    stage,
  });
  hints.push(...cascadeHints);

  if ((reliability?.finding_count ?? 0) > 0) {
    hints.push({
      id: 'data_reliability_recheck',
      stage,
      priority: stage === 'IN_TRIP' ? 'HIGH' : 'MEDIUM',
      surface: 'GLANCEABLE',
      messageZh:
        stage === 'IN_TRIP'
          ? '当前行程有数据新鲜度或置信度问题，行动前先复核关键事实。'
          : '这份方案含有需要复核的数据点，出发前请重新检查天气、路况或开放时间。',
      reason: 'DATA_RELIABILITY',
    });
  }

  if (hasIssue(issues, ['WEATHER_RISK', 'SUNSET_BREACH', 'DESTINATION_CLOSED_DISASTER'])) {
    hints.push({
      id: 'safety_first_adjustment',
      stage,
      priority: 'HIGH',
      surface: 'GLANCEABLE',
      messageZh:
        riskTolerance === 'LOW'
          ? '你偏保守，系统建议优先采用低风险替代安排，而不是压线执行原计划。'
          : '当前存在环境或可视窗口风险，建议保留替代路线并避免把关键体验压到最后。',
      reason: 'SAFETY',
    });
  }

  if (hasRiskEventIssue(issues)) {
    hints.push({
      id: 'risk_event_action_bound',
      stage,
      priority: 'HIGH',
      surface: 'GLANCEABLE',
      messageZh: '系统检测到与当前行程相关的风险事件，建议先看影响范围和替代动作，再继续推进原计划。',
      reason: 'SAFETY',
    });
  }

  if (hasIssue(issues, ['TIME_WINDOW_BREACH', 'TIME_WINDOW_OVERLAP'])) {
    hints.push({
      id: 'time_pressure_buffer',
      stage,
      priority: 'MEDIUM',
      surface: 'DETAIL',
      messageZh: '时间窗口偏紧，建议把交通缓冲和排队时间作为当天第一优先级。',
      reason: 'TIME_PRESSURE',
    });
  }

  const transportPref = String(ctx.user_profile?.preferences?.transport_preferences ?? '').trim();
  if (transportPref && /不自驾|公共交通|公交|地铁|火车|rail|transit/i.test(transportPref)) {
    hints.push({
      id: 'transport_preference_alignment',
      stage,
      priority: 'LOW',
      surface: 'DETAIL',
      messageZh: '系统会优先按你的交通偏好解释路线取舍；若当天临时换交通方式，需要重新评估可达性。',
      reason: 'PERSONALIZATION',
    });
  }

  const unique = new Map<string, ProactiveUxHint>();
  for (const h of hints) unique.set(h.id, h);
  return Array.from(unique.values()).sort((a, b) => {
    const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return rank[a.priority] - rank[b.priority];
  });
}

export function mergeProactiveUxHintsIntoNarration(
  narration: NarrationLike,
  hints: ProactiveUxHint[],
): NarrationLike {
  if (hints.length === 0) return narration;
  const tips = [...(narration.tips ?? [])];
  const uiHints: NarrationResearchUiHint[] = [...(narration.research_ui_hints ?? [])];

  for (const h of hints) {
    const tip = `[主动提示] ${h.messageZh}`;
    if (!tips.some((x) => x.includes(h.messageZh.slice(0, 24)))) tips.unshift(tip);
    if (h.surface === 'GLANCEABLE') {
      const scope = `proactive:${h.reason.toLowerCase()}`;
      if (!uiHints.some((x) => x.scope === scope && x.message_zh === h.messageZh)) {
        uiHints.push({
          scope,
          freshness: h.priority,
          message_zh: h.messageZh,
          attribution: `stage:${h.stage}`,
        });
      }
    }
  }

  return {
    ...narration,
    tips,
    ...(uiHints.length ? { research_ui_hints: uiHints } : {}),
  };
}
