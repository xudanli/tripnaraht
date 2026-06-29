import { randomUUID } from 'crypto';
import type { BudgetViolation, CategoryAllocations } from '../budget-os/types/trip-budget-os.types';

export interface BudgetEvidenceItem {
  id: string;
  type: 'intent' | 'structure' | 'category_cost' | 'itinerary_item' | 'violation';
  title: string;
  content: string;
  reliability: 'high' | 'medium' | 'low';
  source: string;
}

export interface BudgetOptimizationProposal {
  id: string;
  type: 'REMOVE' | 'REDUCE' | 'REPLACE';
  action: string;
  impact: string;
  estimatedSavings: number;
  itemId?: string;
  itemName?: string;
  category?: string;
}

type CategoryBreakdown = {
  accommodation: number;
  transportation: number;
  food: number;
  activities: number;
  other: number;
  experience?: number;
};

const CATEGORY_TO_COST: Record<string, string> = {
  accommodation: 'ACCOMMODATION',
  transportation: 'TRANSPORTATION',
  food: 'FOOD',
  experience: 'ACTIVITIES',
  activities: 'ACTIVITIES',
  other: 'OTHER',
};

type TripItemRow = {
  id: string;
  estimatedCost: number | null;
  actualCost: number | null;
  costCategory: string | null;
  type: string;
  Place: { nameCN: string | null; nameEN: string | null } | null;
};

export function mapCategoryToCostCategory(category?: string): string | undefined {
  if (!category) return undefined;
  return CATEGORY_TO_COST[category] ?? category.toUpperCase();
}

export function buildBudgetEvidence(input: {
  tripId: string;
  estimatedCost: number;
  categoryBreakdown: CategoryBreakdown;
  intentTotal: number;
  currency: string;
  violations: BudgetViolation[];
  structureAllocations?: CategoryAllocations;
}): BudgetEvidenceItem[] {
  const { tripId, estimatedCost, categoryBreakdown, intentTotal, currency, violations, structureAllocations } =
    input;
  const evidence: BudgetEvidenceItem[] = [];

  evidence.push({
    id: `ev-intent-${tripId}`,
    type: 'intent',
    title: 'L1 总预算',
    content: `总预算 ${intentTotal.toFixed(0)} ${currency}，方案预估 ${estimatedCost.toFixed(0)} ${currency}`,
    reliability: 'high',
    source: 'trip.budgetConfig.budgetIntent',
  });

  if (structureAllocations) {
    for (const [category, amount] of Object.entries(structureAllocations)) {
      if (amount <= 0) continue;
      const estimated =
        categoryBreakdown[
          category === 'experience' ? 'activities' : (category as keyof CategoryBreakdown)
        ] ??
        categoryBreakdown.experience ??
        0;
      evidence.push({
        id: `ev-structure-${category}`,
        type: 'structure',
        title: `L2 ${category} 分配`,
        content: `结构分配 ${amount.toFixed(0)} ${currency}，方案预估 ${Number(estimated).toFixed(0)} ${currency}`,
        reliability: 'high',
        source: 'trip.budgetConfig.budgetStructure',
      });
    }
  }

  for (const v of violations) {
    evidence.push({
      id: `ev-violation-${randomUUID()}`,
      type: 'violation',
      title: v.type,
      content: v.message,
      reliability: 'high',
      source: 'budget.evaluate',
    });
  }

  return evidence;
}

export function buildOptimizationProposals(input: {
  items: TripItemRow[];
  violations: BudgetViolation[];
  recommendations: Array<{ action: string; impact: string; estimatedSavings: number }>;
  targetSavings: number;
}): BudgetOptimizationProposal[] {
  const proposals: BudgetOptimizationProposal[] = [];
  const usedItemIds = new Set<string>();

  const mismatchCategories = new Set(
    input.violations
      .filter((v) => v.type === 'STRUCTURE_MISMATCH' || v.type === 'CATEGORY_EXCEEDED')
      .map((v) => v.category)
      .filter(Boolean) as string[],
  );

  const rankedItems = [...input.items]
    .map((item) => ({
      item,
      cost: item.estimatedCost ?? item.actualCost ?? 0,
    }))
    .filter((row) => row.cost > 0)
    .sort((a, b) => b.cost - a.cost);

  for (const category of mismatchCategories) {
    const costCategory = mapCategoryToCostCategory(category);
    const categoryItems = rankedItems.filter(
      ({ item }) => !costCategory || item.costCategory === costCategory,
    );
    const top = categoryItems.find(({ item }) => !usedItemIds.has(item.id));
    if (!top) continue;

    const name = top.item.Place?.nameCN ?? top.item.Place?.nameEN ?? '行程项';
    const savings = Math.min(top.cost * 0.25, top.cost);
    proposals.push({
      id: `opt-${randomUUID()}`,
      type: 'REDUCE',
      action: `下调「${name}」预估费用`,
      impact: `缓解 ${category} 分类结构偏差`,
      estimatedSavings: Math.round(savings),
      itemId: top.item.id,
      itemName: name,
      category,
    });
    usedItemIds.add(top.item.id);
  }

  if (input.violations.some((v) => v.type === 'TOTAL_EXCEEDED')) {
    const removable = rankedItems.find(
      ({ item }) =>
        !usedItemIds.has(item.id) &&
        item.type !== 'TRANSIT' &&
        (item.estimatedCost ?? item.actualCost ?? 0) > 0,
    );
    if (removable) {
      const name = removable.item.Place?.nameCN ?? removable.item.Place?.nameEN ?? '行程项';
      proposals.push({
        id: `opt-${randomUUID()}`,
        type: 'REMOVE',
        action: `移除「${name}」`,
        impact: '降低总预估成本',
        estimatedSavings: Math.round(removable.cost),
        itemId: removable.item.id,
        itemName: name,
        category: removable.item.costCategory?.toLowerCase(),
      });
      usedItemIds.add(removable.item.id);
    }
  }

  for (const rec of input.recommendations) {
    if (proposals.length >= 5) break;
    const candidate = rankedItems.find(({ item }) => !usedItemIds.has(item.id));
    if (!candidate) {
      proposals.push({
        id: `opt-${randomUUID()}`,
        type: 'REPLACE',
        action: rec.action,
        impact: rec.impact,
        estimatedSavings: Math.round(rec.estimatedSavings),
      });
      continue;
    }
    const name = candidate.item.Place?.nameCN ?? candidate.item.Place?.nameEN ?? '行程项';
    proposals.push({
      id: `opt-${randomUUID()}`,
      type: 'REPLACE',
      action: rec.action,
      impact: rec.impact,
      estimatedSavings: Math.round(rec.estimatedSavings),
      itemId: candidate.item.id,
      itemName: name,
      category: candidate.item.costCategory?.toLowerCase(),
    });
    usedItemIds.add(candidate.item.id);
  }

  if (proposals.length === 0 && input.targetSavings > 0) {
    const fallback = rankedItems.find(({ item }) => !usedItemIds.has(item.id));
    if (fallback) {
      const name = fallback.item.Place?.nameCN ?? fallback.item.Place?.nameEN ?? '行程项';
      proposals.push({
        id: `opt-${randomUUID()}`,
        type: 'REDUCE',
        action: `下调「${name}」预估费用`,
        impact: '缩小与总预算差距',
        estimatedSavings: Math.round(Math.min(fallback.cost * 0.2, input.targetSavings)),
        itemId: fallback.item.id,
        itemName: name,
      });
    }
  }

  return proposals;
}
