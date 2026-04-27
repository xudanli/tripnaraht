export interface ShadowConflictLite {
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  conflict_type: 'REACHABILITY' | 'SCOPE' | 'MIXED';
  suggested_actions: Array<{
    shadow_confidence?: 'high_probability_fixed' | 'needs_more_changes';
    violations_before?: number;
    violations_after?: number;
  }>;
}

export interface DecisionContextLite {
  /** For future distribution lookup; keep stable v0 signature */
  request_id?: string;
}

export type EarlyWarningRiskReason = 'HEURISTIC' | 'REACHABILITY' | 'DISTRIBUTION';

/**
 * 决策预警风险模型（v0：不撒谎）
 *
 * 目标：估计“坚持现状继续”导致后续撞墙（PLAN_GEN 熔断 / 必须回溯修复）的风险强度。
 *
 * 约束：
 * - v0 仅使用 Shadow Gate 的确定性信号（risk_level / shadow dry-run 结果）
 * - 不输出伪历史概率；未来可用 DISTRIBUTION 接入 Gold 样本分布
 * - 复合冲突聚合：MAX（木桶效应，硬约束以最坏项为主导）
 */
export function calculateEarlyWarningRisk(
  conflict: ShadowConflictLite,
  _context: DecisionContextLite,
): { score: number; reason: EarlyWarningRiskReason; confidence: number } {
  const base =
    conflict.risk_level === 'CRITICAL'
      ? 0.95
      : conflict.risk_level === 'HIGH'
        ? 0.85
        : conflict.risk_level === 'MEDIUM'
          ? 0.65
          : 0.35;

  const actions = Array.isArray(conflict.suggested_actions) ? conflict.suggested_actions : [];
  const minAfter = Math.min(
    ...actions
      .map((s) => (typeof s?.violations_after === 'number' ? s.violations_after : Number.POSITIVE_INFINITY))
      .filter((n) => Number.isFinite(n)),
  );
  const hasAnyDryRun = Number.isFinite(minAfter) && minAfter !== Number.POSITIVE_INFINITY;
  const canFixInOne = hasAnyDryRun && minAfter === 0;

  // Subscores (v0):
  // - baseRisk: derived from risk_level
  // - unfixableRisk: if no single-step fix can reach 0 violations, risk approaches certainty
  const baseRisk = base;
  const unfixableRisk = hasAnyDryRun ? (canFixInOne ? 0.8 : 0.97) : 0.75;

  // Composite aggregation: MAX
  const score = clamp01(Math.max(baseRisk, unfixableRisk));

  // Confidence: higher when derived from a concrete dry-run and "cannot fix in one"
  const confidence = clamp01(
    hasAnyDryRun ? (canFixInOne ? 0.75 : 0.9) : 0.55,
  );

  const reason: EarlyWarningRiskReason = hasAnyDryRun ? 'REACHABILITY' : 'HEURISTIC';
  return { score, reason, confidence };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

