import type { BudgetViolation, CategoryAllocations } from '../budget-os/types/trip-budget-os.types';
import type { BudgetEvaluationVerdict } from './budget-evaluation.service';
import type { BudgetEvidenceItem } from './budget-optimization.util';

export interface BudgetPlanCompareInput {
  planId: string;
  label?: string;
  estimatedCost: number;
  categoryBreakdown: {
    accommodation: number;
    transportation: number;
    food: number;
    activities: number;
    other: number;
    experience?: number;
  };
}

export interface BudgetPlanCompareRow {
  planId: string;
  label: string;
  estimatedCost: number;
  budgetUsagePercent: number;
  vsIntentDelta: number;
  verdict: BudgetEvaluationVerdict;
  violationCount: number;
  topHotspot?: string;
  categoryBreakdown: BudgetPlanCompareInput['categoryBreakdown'];
}

export interface BudgetPriceEvidenceItem {
  id: string;
  type: 'fx_reference' | 'category_benchmark' | 'structure_allocation';
  title: string;
  content: string;
  reliability: 'high' | 'medium' | 'low';
  source: string;
  category?: string;
}

const FX_REFERENCE: Record<string, string> = {
  CNY: '基准货币',
  USD: '1 USD ≈ 7.2 CNY（估算参考，非实时牌价）',
  EUR: '1 EUR ≈ 7.8 CNY（估算参考，非实时牌价）',
  JPY: '100 JPY ≈ 4.8 CNY（估算参考，非实时牌价）',
};

const CATEGORY_BENCHMARK_ZH: Record<string, string> = {
  accommodation: '住宿通常占结构分配大头；超结构 25% 以上触发 STRUCTURE_MISMATCH',
  transportation: '交通含租车/航班/巴士；可与 structure.transportation 对照',
  food: '餐饮按人天估算；多日自驾可适当上浮',
  experience: '活动/体验对应 actuals.activities 与 structure.experience',
  activities: '活动/体验对应 actuals.activities 与 structure.experience',
  other: '其他含购物、保险等；前端可将 shopping 从 other 比例拆分展示',
};

export function buildPriceEvidence(input: {
  currency: string;
  intentTotal?: number;
  structureAllocations?: CategoryAllocations;
}): BudgetPriceEvidenceItem[] {
  const items: BudgetPriceEvidenceItem[] = [];
  const { currency, intentTotal, structureAllocations } = input;

  if (currency !== 'CNY' && FX_REFERENCE[currency]) {
    items.push({
      id: `price-fx-${currency}`,
      type: 'fx_reference',
      title: `${currency} 汇率参考`,
      content: FX_REFERENCE[currency],
      reliability: 'medium',
      source: 'static.fx_reference',
    });
  }

  if (intentTotal && intentTotal > 0) {
    items.push({
      id: 'price-intent-total',
      type: 'category_benchmark',
      title: 'L1 总预算锚点',
      content: `总预算 ${intentTotal.toFixed(0)} ${currency}，方案对比均相对此值计算使用率`,
      reliability: 'high',
      source: 'trip.budgetConfig.budgetIntent',
    });
  }

  if (structureAllocations) {
    for (const [category, amount] of Object.entries(structureAllocations)) {
      if (amount <= 0) continue;
      items.push({
        id: `price-structure-${category}`,
        type: 'structure_allocation',
        title: `L2 ${category} 分配`,
        content: `${amount.toFixed(0)} ${currency}（${intentTotal ? ((amount / intentTotal) * 100).toFixed(0) : '?'}%）· ${CATEGORY_BENCHMARK_ZH[category] ?? '分类预算参考'}`,
        reliability: 'high',
        source: 'trip.budgetConfig.budgetStructure',
        category,
      });
    }
  }

  return items;
}

const VERDICT_RANK: Record<BudgetEvaluationVerdict, number> = {
  ALLOW: 0,
  NEED_CONFIRM: 1,
  NEED_ADJUST: 2,
  REJECT: 3,
};

export function pickRecommendedPlanId(rows: BudgetPlanCompareRow[]): string | undefined {
  if (rows.length === 0) return undefined;
  const sorted = [...rows].sort((a, b) => {
    const vr = VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict];
    if (vr !== 0) return vr;
    return a.estimatedCost - b.estimatedCost;
  });
  return sorted[0]?.planId;
}

export function formatBudgetProfilePromptBlock(input: {
  intentTotal?: number;
  currency: string;
  dailyBudget?: number;
  spendingPersona?: string;
  structureAllocations?: CategoryAllocations;
  actualsTotalEstimated?: number;
  budgetUsagePercent?: number;
  gateVerdict?: string;
  unpaidCount?: number;
}): string {
  const lines: string[] = ['[系统注入·预算档案]'];
  if (input.intentTotal) {
    lines.push(
      `L1 总预算: ${input.intentTotal.toFixed(0)} ${input.currency}${input.dailyBudget ? `（日均约 ${input.dailyBudget.toFixed(0)}）` : ''}`,
    );
  } else {
    lines.push('L1 总预算: 尚未设置');
  }
  if (input.structureAllocations) {
    const parts = Object.entries(input.structureAllocations)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k} ${v.toFixed(0)}`)
      .join(' · ');
    if (parts) {
      lines.push(`L2 结构: ${parts}${input.spendingPersona ? `（${input.spendingPersona}）` : ''}`);
    }
  }
  if (input.actualsTotalEstimated != null) {
    lines.push(
      `已入库预估: ${input.actualsTotalEstimated.toFixed(0)} ${input.currency}${input.budgetUsagePercent != null ? `，占 L1 ${input.budgetUsagePercent}%` : ''}${input.unpaidCount ? `，${input.unpaidCount} 笔待支付` : ''}`,
    );
  }
  if (input.gateVerdict) {
    lines.push(`最近门控: ${input.gateVerdict}`);
  }
  lines.push('回答预算问题时须与以上 L1/L2/实际费用一致，勿编造未设置的分类上限。');
  return lines.join('\n');
}

export function topHotspotFromViolations(violations: BudgetViolation[]): string | undefined {
  return violations[0]?.message;
}

export function evidenceToPersonaFormat(
  evidence: BudgetEvidenceItem[],
): Array<{ type: string; content: string }> {
  return evidence.map((e) => ({ type: e.type, content: `${e.title}: ${e.content}` }));
}
