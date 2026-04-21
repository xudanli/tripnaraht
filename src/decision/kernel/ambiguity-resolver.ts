import type { CalibrationSignal } from './flywheel-risk-feedback';
import type { ScenarioEvalResult } from './parallel-decision-kernel';

export type AmbiguityReport = {
  /** 0..1 模糊度间隙（值越高表示模型可信度越低）。 */
  gap01: number;
  isRobustMode: boolean;
  /** 是否为紧急共识触发（突发性环境恶化）。 */
  isEmergency?: boolean;
  reason: string;
};

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export class DecisionAmbiguityResolver {
/**
   * Wasserstein 风格模糊度的工程简化：
   * 越强/越一致的校准信号 → 模糊度间隙越大。
   */
  calculateAmbiguity(
    signals: (CalibrationSignal & { at?: string; userId?: string; contextKey?: string })[] | undefined,
    options?: { contextKey?: string; consensusWindowHours?: number; consensusMinUsers?: number },
  ): AmbiguityReport {
    if (!signals || signals.length === 0) {
      return { gap01: 0, isRobustMode: false, reason: '模型表现稳定' };
    }

    const strengths = signals.map((s) => clamp01(s.strength01 ?? 0));
    const totalIntensity = strengths.reduce((a, b) => a + b, 0); // 0..N
    const avgIntensity = totalIntensity / Math.max(1, signals.length); // 0..1

    // 偏差频率：方向高度一致 → 系统性偏差
    const directionSum = signals.reduce((acc, s) => acc + (s.direction === 'INCREASE' ? 1 : -1), 0);
    const biasFactor = Math.abs(directionSum) / Math.max(1, signals.length); // 0..1

    const individualGap01 = clamp01(avgIntensity * (0.7 + 0.6 * biasFactor));

    // 共识分数（默认最近 6 小时，同一 contextKey 内 INCREASE 的独立用户数达到阈值）
    const windowHours = Math.max(1, Math.min(48, options?.consensusWindowHours ?? 6));
    const minUsers = Math.max(2, Math.min(20, options?.consensusMinUsers ?? 3));
    const key = options?.contextKey?.trim();
    const now = Date.now();
    const cutoff = now - windowHours * 3600_000;

    const recent = signals.filter((s) => {
      if (key && String((s as any).contextKey ?? '').trim() !== key) return false;
      const at = (s as any).at;
      if (!at) return false;
      const t = Date.parse(String(at));
      return Number.isFinite(t) && t >= cutoff;
    });
    const inc = recent.filter((s) => s.direction === 'INCREASE');
    const uniqUsers = new Set(inc.map((s) => String((s as any).userId ?? ''))).size;
    const consensusGap01 = uniqUsers >= minUsers ? 1 : 0;

    const gap01 = Math.max(individualGap01, consensusGap01);
    const isRobustMode = gap01 > 0.4;
    const isEmergency = consensusGap01 === 1;
    const reason = isEmergency
      ? `[紧急] 该区域 ${uniqUsers} 位同类上下文用户在近 ${windowHours} 小时内报告风险上升，已强制切换至极端安全模式。`
      : isRobustMode
        ? `近期观测到 ${signals.length} 处显著预测偏差，已进入分布鲁棒模式。`
        : '模型预测在误差范围内。';

    return { gap01, isRobustMode, isEmergency, reason };
  }

  /**
   * 最坏情况重加权：根据模糊度间隙比例增加高风险场景的概率质量。
   * 返回与输入顺序对齐的新权重向量。
   */
  reweightScenarios(perScenario: ScenarioEvalResult[], gap01: number): number[] {
    const gap = clamp01(gap01);
    const n = perScenario.length;
    if (n === 0) return [];
    if (gap <= 0) {
      const sum = perScenario.reduce((s, r) => s + (Number.isFinite(r.weight) ? r.weight : 0), 0);
      if (sum <= 0) return new Array(n).fill(1 / n);
      return perScenario.map((r) => (r.weight ?? 0) / sum);
    }

    // 按 riskCost 升序排序；rankFactor 越高表示风险越高 → 权重越高。
    const idx = perScenario.map((_, i) => i).sort((a, b) => perScenario[a]!.riskCost - perScenario[b]!.riskCost);
    const base = perScenario.map((r) => (Number.isFinite(r.weight) ? Math.max(0, r.weight) : 0));
    const baseSum = base.reduce((a, b) => a + b, 0);
    const baseNorm = baseSum > 0 ? base.map((w) => w / baseSum) : new Array(n).fill(1 / n);

    const w = new Array(n).fill(0);
    for (let rank = 0; rank < n; rank++) {
      const i = idx[rank]!;
      const rankFactor = (rank + 1) / n; // 0..1
      const tilt = 1 + gap * (rankFactor - 0.5) * 2; // [1-gap, 1+gap]
      w[i] = baseNorm[i]! * Math.max(0, tilt);
    }
    const sum = w.reduce((a, b) => a + b, 0);
    return sum > 0 ? w.map((x) => x / sum) : new Array(n).fill(1 / n);
  }
}

