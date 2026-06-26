import type {
  ConsumptionCompatibility,
  MoneyDnaCard,
  SplitMechanismMode,
  SplitMechanismOption,
  SplitSimulationMember,
  SplitSimulationResult,
} from '../types/decision-profiling.types';
import { meanPairwiseSimilarity } from './money-dna-quiz-scorer.util';

export function budgetOverlapPct(cards: MoneyDnaCard[]): number {
  if (cards.length < 2) return 100;
  let totalOverlap = 0;
  let pairs = 0;
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const aMax = cards[i].budgetRangeMax ?? 3000;
      const bMax = cards[j].budgetRangeMax ?? 3000;
      const aMin = cards[i].budgetRangeMin ?? aMax * 0.5;
      const bMin = cards[j].budgetRangeMin ?? bMax * 0.5;
      const overlap = Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin));
      const union = Math.max(aMax, bMax) - Math.min(aMin, bMin) || 1;
      totalOverlap += (overlap / union) * 100;
      pairs++;
    }
  }
  return pairs > 0 ? Math.round(totalOverlap / pairs) : 100;
}

export function paceSyncPct(cards: MoneyDnaCard[]): number {
  if (cards.length < 2) return 100;
  const paces = cards.map((c) => c.consumptionPace);
  const allSame = paces.every((p) => p === paces[0]);
  if (allSame) return 100;
  const hasBalanced = paces.some((p) => p === 'balanced');
  if (hasBalanced) return 65;
  return 35;
}

export function buildCompatibility(cards: MoneyDnaCard[]): ConsumptionCompatibility {
  const budget = budgetOverlapPct(cards);
  const style = Math.round(meanPairwiseSimilarity(cards) * 100);
  const pace = paceSyncPct(cards);
  const overallScore = Math.round(budget * 0.35 + style * 0.4 + pace * 0.25);

  let band: ConsumptionCompatibility['band'] = 'high';
  let bandLabel = '高度兼容';
  if (overallScore < 40) {
    band = 'high_risk';
    bandLabel = '高风险，建议深度对齐';
  } else if (overallScore < 70) {
    band = 'needs_negotiation';
    bandLabel = '需要协商';
  }

  return {
    budgetOverlapPct: budget,
    styleSimilarityPct: style,
    paceSyncPct: pace,
    overallScore,
    band,
    bandLabel,
  };
}

export function recommendSplitMechanisms(
  compatibility: ConsumptionCompatibility,
): SplitMechanismOption[] {
  const { styleSimilarityPct, paceSyncPct, overallScore } = compatibility;

  const options: SplitMechanismOption[] = [
    {
      mode: 'split_aa',
      label: 'AA制（即时了结）',
      description: '每笔消费当场均分，账目清晰。',
      fitScore: Math.round(styleSimilarityPct * 0.5 + overallScore * 0.5),
      rationale: '适合消费风格相近、关系平等的团队。',
    },
    {
      mode: 'rotating_treat',
      label: '轮流请客（人情互惠）',
      description: '按轮次请客，减少每笔结算摩擦。',
      fitScore: Math.round(paceSyncPct * 0.6 + styleSimilarityPct * 0.2 + 20),
      rationale: '适合关系亲密、消费节奏同步的团队。',
    },
    {
      mode: 'proportional',
      label: '按比例分摊',
      description: '按收入或预设比例承担费用。',
      fitScore: overallScore < 55 ? 72 : 45,
      rationale: '适合收入差异显著但关系密切的家庭团。',
    },
    {
      mode: 'hybrid',
      label: '混合模式',
      description: '大交通自理 + 酒店 AA + 餐饮轮流。',
      fitScore: Math.round(100 - styleSimilarityPct * 0.3 + (100 - paceSyncPct) * 0.2),
      rationale: '适合复杂团队，按类别采用不同分摊方式。',
      hybridBreakdown: {
        transportation: 'proportional',
        accommodation: 'split_aa',
        dining: 'rotating_treat',
        activities: 'split_aa',
      },
    },
  ];

  return options.sort((a, b) => b.fitScore - a.fitScore);
}

export function simulateSplit(
  members: Array<{ userId: string; displayName: string }>,
  totalEstimate: number,
  currency = 'CNY',
): SplitSimulationResult {
  const n = members.length || 1;
  const perPerson = Math.round((totalEstimate / n) * 100) / 100;

  const baseMembers: SplitSimulationMember[] = members.map((m) => ({
    userId: m.userId,
    displayName: m.displayName,
    estimatedSpend: perPerson,
  }));

  const rotating = members.map((m, idx) => ({
    userId: m.userId,
    displayName: m.displayName,
    estimatedSpend: Math.round((totalEstimate * (idx === 0 ? 0.45 : 0.55 / Math.max(n - 1, 1))) * 100) / 100,
  }));

  const proportional = members.map((m, idx) => ({
    userId: m.userId,
    displayName: m.displayName,
    estimatedSpend: Math.round((totalEstimate * (0.6 - idx * 0.1)) / n * 100) / 100,
  }));

  const hybrid = members.map((m) => ({
    userId: m.userId,
    displayName: m.displayName,
    estimatedSpend: perPerson,
  }));

  return {
    totalEstimate,
    currency,
    byMode: {
      split_aa: { members: baseMembers, note: '所有共享支出均分' },
      rotating_treat: { members: rotating, note: '首轮请客方承担更多公共餐饮' },
      proportional: { members: proportional, note: '示例比例：按 60/40 承担共享费用' },
      hybrid: {
        members: hybrid,
        note: '大交通各自承担；住宿/活动 AA；餐饮轮流',
      },
    },
  };
}

export function pickRecommendedMode(options: SplitMechanismOption[]): SplitMechanismMode {
  return options[0]?.mode ?? 'split_aa';
}
