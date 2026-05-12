import type { WorldModelStrategyLayer } from '../../skills/world/interfaces/unified-world-model.interface';

/**
 * Decision DNA：偏好解释器（纯函数，无副作用）。
 * 封版语义：以 **1.5×** 放大对应轴的 reasoningWeight，表达「性格」而非自动改行程。
 * 与 UserProfile.preferences.decision_dna 映射时，可将连续分数离散到 value_axis。
 */
export type DecisionDnaProfileForStrategy = {
  value_axis?: 'hedonic' | 'frugal' | 'balanced';
  /** 0–1，来自 decision_dna.confidence_score；用于后续扩展混合权重（当前轴乘子仍为 1.5×） */
  confidence?: number;
};

/** MAC 汇总摘要可据此读出不同倾向；与 reasoningWeight 数值一致 */
export const DNA_REASONING_WEIGHT_MULTIPLIER = 1.5;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function cloneStrategyLayer(layer?: WorldModelStrategyLayer): WorldModelStrategyLayer | undefined {
  if (!layer) {
    return undefined;
  }
  return {
    ...layer,
    budgetProposal: layer.budgetProposal ? { ...layer.budgetProposal } : undefined,
    experienceProposal: layer.experienceProposal
      ? { ...layer.experienceProposal }
      : undefined,
    consensusSummary: layer.consensusSummary,
  };
}

/**
 * 对策略层做 DNA 加权（返回新对象，不修改入参）。
 */
export function applyDecisionDnaToStrategyLayers(
  layers: {
    cost?: WorldModelStrategyLayer;
    experience?: WorldModelStrategyLayer;
  },
  dna?: DecisionDnaProfileForStrategy,
): { cost?: WorldModelStrategyLayer; experience?: WorldModelStrategyLayer; hint?: string } {
  if (!dna?.value_axis || dna.value_axis === 'balanced') {
    return {
      cost: cloneStrategyLayer(layers.cost),
      experience: cloneStrategyLayer(layers.experience),
    };
  }

  const cost = cloneStrategyLayer(layers.cost);
  const experience = cloneStrategyLayer(layers.experience);
  const m = DNA_REASONING_WEIGHT_MULTIPLIER;
  let hint: string | undefined;

  if (dna.value_axis === 'hedonic') {
    if (experience?.experienceProposal) {
      experience.experienceProposal = {
        ...experience.experienceProposal,
        reasoningWeight: clamp(
          experience.experienceProposal.reasoningWeight * m,
          0.35,
          0.98,
        ),
      };
    }
    hint =
      '享乐型 DNA：ExperienceStrategyProposal.reasoningWeight ×1.5（封顶），MAC 摘要将偏向高光体验叙事；不自动删减行程。';
  } else if (dna.value_axis === 'frugal') {
    if (cost?.budgetProposal) {
      cost.budgetProposal = {
        ...cost.budgetProposal,
        reasoningWeight: clamp(cost.budgetProposal.reasoningWeight * m, 0.35, 0.98),
      };
    }
    hint =
      '节俭型 DNA：BudgetStrategyProposal.reasoningWeight ×1.5（封顶），MAC 摘要将偏向预算约束叙事；不自动砍项。';
  }

  return { cost, experience, hint };
}
