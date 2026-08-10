/**
 * Decision State ↔ Legacy 分歧指标（进程内计数 + 请求级切片）。
 * 用于观察「现链多问 / Shadow 该问未问 / 因 ignored 键阻断」频率。
 */

import type { ActivityDecisionTakeover } from './activity-decision-takeover.util';
import type { DecisionStateShadowV1 } from './decision-state.types';

export type DecisionStateDivergenceV1 = {
  schema: 'tripnara.decision_state_divergence@v1';
  decision_class: string | null;
  takeover_kind: string;
  divergence_codes: string[];
  /** 现链会追问但 MDS 认为可继续 */
  legacy_over_ask: boolean;
  /** MDS 要追问但现链未追问 */
  shadow_over_ask: boolean;
  /** 现链因合同忽略键阻断 */
  legacy_ignored_block: boolean;
  process_counters: Record<string, number>;
};

const processCounters = new Map<string, number>();

/** PrometheusMetricsService 可注册：同步 inc Counter */
let prometheusIncHook: ((code: string) => void) | null = null;

export function registerDecisionStateDivergencePrometheusHook(
  fn: ((code: string) => void) | null,
): void {
  prometheusIncHook = fn;
}

export function bumpDecisionStateDivergence(code: string): void {
  const k = String(code || '').trim();
  if (!k) return;
  processCounters.set(k, (processCounters.get(k) ?? 0) + 1);
  try {
    prometheusIncHook?.(k);
  } catch {
    // best-effort
  }
}

/** Prometheus text exposition（可拼进 /metrics） */
export function formatDecisionStateDivergencePrometheus(): string {
  const lines: string[] = [
    '# HELP tripnara_decision_state_divergence_total Decision State vs legacy divergence / takeover counters',
    '# TYPE tripnara_decision_state_divergence_total counter',
  ];
  const entries = [...processCounters.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (!entries.length) {
    lines.push('tripnara_decision_state_divergence_total{code="none"} 0');
    return `${lines.join('\n')}\n`;
  }
  for (const [code, n] of entries) {
    const safe = code.replace(/\\/g, '\\\\').replace(/"/g, '\\"').slice(0, 96);
    lines.push(`tripnara_decision_state_divergence_total{code="${safe}"} ${n}`);
  }
  return `${lines.join('\n')}\n`;
}

export function buildDecisionStateDivergenceAdminSnapshot(): {
  counters: Record<string, number>;
  prometheus_text: string;
} {
  return {
    counters: snapshotDecisionStateDivergenceCounters(),
    prometheus_text: formatDecisionStateDivergencePrometheus(),
  };
}

export function snapshotDecisionStateDivergenceCounters(): Record<string, number> {
  return Object.fromEntries(processCounters.entries());
}

/** 测试用 */
export function resetDecisionStateDivergenceCountersForTests(): void {
  processCounters.clear();
}

export function buildDecisionStateDivergenceV1(input: {
  shadow: DecisionStateShadowV1;
  takeover: ActivityDecisionTakeover;
}): DecisionStateDivergenceV1 {
  const codes = input.shadow.legacyCompare.divergenceCodes ?? [];
  for (const c of codes) bumpDecisionStateDivergence(c);
  if (input.takeover.kind !== 'INACTIVE') {
    bumpDecisionStateDivergence(`takeover.${input.takeover.kind}`);
  }
  if (input.shadow.classified.decisionClass) {
    bumpDecisionStateDivergence(`class.${input.shadow.classified.decisionClass}`);
  }

  return {
    schema: 'tripnara.decision_state_divergence@v1',
    decision_class: input.shadow.classified.decisionClass,
    takeover_kind: input.takeover.kind,
    divergence_codes: codes,
    legacy_over_ask: codes.includes('LEGACY_ASK_BUT_SHADOW_PROCEED'),
    shadow_over_ask: codes.includes('SHADOW_ASK_BUT_LEGACY_PROCEED'),
    legacy_ignored_block: codes.includes('LEGACY_BLOCKED_ON_IGNORED_KEY'),
    process_counters: snapshotDecisionStateDivergenceCounters(),
  };
}
