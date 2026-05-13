import type { LedgerHealingObservabilityV1 } from '../memory/decision-ledger/ledger-healing-observability.util';

/**
 * 前端「自愈进度条」语义态（v1）。
 * - 与 `observability.ledger_healing` 对账；不向用户暴露 INVALIDATED / reconcile 等工程词。
 * - 单请求仅见终态：无流式中间帧时不会出现 `RECOMPUTING`；该值预留给未来 SSE / 轮询增量。
 */
export type LedgerHealingUiStageV1 =
  | 'IDLE'
  | 'SCANNING'
  | 'RECOMPUTING'
  | 'HEALED'
  | 'FAILED'
  | 'STABLE'
  | 'DEGRADED';

export type LedgerHealingUiStateV1 = {
  stage: LedgerHealingUiStageV1;
  /** 0–100，供线性进度条；非精确物理进度 */
  progress: number;
  /** 产品文案 / i18n 键（英文句点便于默认回退展示） */
  headline_key: string;
  subline_key?: string;
  /** 与行程卡片联动的 nodeId（合并 affected + trace 提取，去重） */
  card_node_ids: string[];
  metrics: LedgerHealingObservabilityV1['metrics'];
  reconcile_status?: string;
};

function unionCardNodeIds(healing: LedgerHealingObservabilityV1): string[] {
  const fromAffected = healing.affected_node_ids ?? [];
  const fromSteps = healing.steps.flatMap(s => s.target_nodes ?? []);
  return [...new Set([...fromAffected, ...fromSteps].map(s => String(s).trim()).filter(Boolean))];
}

function gateAction(healing: LedgerHealingObservabilityV1): string | undefined {
  const g = healing.steps.find(s => s.phase === 'gate');
  return g?.action;
}

/**
 * 将单次 `route_and_run` 返回的 `ledger_healing` 快照映射为 UI 状态机输入。
 */
export function deriveLedgerHealingUiStateV1(
  healing: LedgerHealingObservabilityV1 | null | undefined,
): LedgerHealingUiStateV1 {
  if (!healing) {
    return {
      stage: 'IDLE',
      progress: 0,
      headline_key: 'healing.ui.smart_trip.idle',
      card_node_ids: [],
      metrics: { initial_invalidated: 0, secondary_invalidated: 0, loops: 0 },
    };
  }

  const cards = unionCardNodeIds(healing);
  const m = healing.metrics;

  if (healing.status === 'NO_OP') {
    const action = gateAction(healing) ?? '';
    if (action.includes('deferred') || action.includes('advisory_phase')) {
      return {
        stage: 'SCANNING',
        progress: 18,
        headline_key: 'healing.ui.smart_trip.evaluating_changes',
        subline_key: 'healing.ui.smart_trip.evaluating_changes.sub',
        card_node_ids: cards,
        metrics: m,
        reconcile_status: healing.reconcile_status,
      };
    }
    if (action.includes('skipped_missing_deps')) {
      return {
        stage: 'DEGRADED',
        progress: 0,
        headline_key: 'healing.ui.smart_trip.unavailable',
        subline_key: 'healing.ui.smart_trip.unavailable.sub',
        card_node_ids: cards,
        metrics: m,
        reconcile_status: healing.reconcile_status,
      };
    }
    return {
      stage: 'STABLE',
      progress: 0,
      headline_key: 'healing.ui.smart_trip.stable',
      card_node_ids: cards,
      metrics: m,
      reconcile_status: healing.reconcile_status,
    };
  }

  if (healing.status === 'CONVERGED') {
    const multi = m.loops > 1 || m.secondary_invalidated > 0;
    return {
      stage: 'HEALED',
      progress: 100,
      headline_key: 'healing.ui.smart_trip.healed',
      subline_key: multi
        ? 'healing.ui.smart_trip.healed.adjusted_dependents'
        : 'healing.ui.smart_trip.healed.sub',
      card_node_ids: cards,
      metrics: m,
      reconcile_status: healing.reconcile_status,
    };
  }

  const hard =
    healing.reconcile_status === 'ESCALATED_HARD_CONSTRAINT' ||
    healing.steps.some(s => s.action.includes('escalate_hard_constraint'));

  return {
    stage: 'FAILED',
    progress: Math.min(12 + m.loops * 28, 88),
    headline_key: hard
      ? 'healing.ui.smart_trip.needs_confirmation'
      : 'healing.ui.smart_trip.could_not_auto_fix',
    subline_key: hard
      ? 'healing.ui.smart_trip.needs_confirmation.sub'
      : 'healing.ui.smart_trip.could_not_auto_fix.sub',
    card_node_ids: cards,
    metrics: m,
    reconcile_status: healing.reconcile_status,
  };
}

/** 默认英文短句（无 i18n 时的安全回退） */
export const LEDGER_HEALING_UI_DEFAULT_EN: Record<string, string> = {
  'healing.ui.smart_trip.idle': 'Smart Trip',
  'healing.ui.smart_trip.evaluating_changes': 'Checking for itinerary impacts…',
  'healing.ui.smart_trip.evaluating_changes.sub': 'Reviewing environment updates against your plan.',
  'healing.ui.smart_trip.healed': 'Itinerary updated',
  'healing.ui.smart_trip.healed.sub': 'Conflicts were resolved automatically.',
  'healing.ui.smart_trip.healed.adjusted_dependents': 'Adjusting dependent logistics…',
  'healing.ui.smart_trip.needs_confirmation': 'Needs your confirmation',
  'healing.ui.smart_trip.needs_confirmation.sub': 'We found a hard constraint that cannot be auto-fixed.',
  'healing.ui.smart_trip.could_not_auto_fix': 'Could not finish auto-fix',
  'healing.ui.smart_trip.could_not_auto_fix.sub': 'Please review the highlighted segments.',
  'healing.ui.smart_trip.unavailable': 'Smart healing unavailable',
  'healing.ui.smart_trip.unavailable.sub': 'Try again shortly or continue with the current plan.',
  'healing.ui.smart_trip.stable': 'Plan is up to date',
};
