import type {
  TripWishItemRecord,
  WishAgentSnapshot,
  WishStructuredHints,
} from '../types/trip-wish.types';
import { wishCategoryLabel } from './wish-category.util';

function mergeStructured(items: TripWishItemRecord[]): WishAgentSnapshot['structured'] {
  const must_do = new Set<string>();
  const must_avoid = new Set<string>();
  const soft_constraints: NonNullable<WishStructuredHints['soft_constraints']> = [];
  const importance_weighted_intents: Record<string, number> = {};

  for (const item of items) {
    if (!item.agentEligible) continue;
    const hints = item.structuredHints;
    hints?.must_do?.forEach((x) => must_do.add(x));
    hints?.must_avoid?.forEach((x) => must_avoid.add(x));
    hints?.soft_constraints?.forEach((c) => soft_constraints.push(c));
    hints?.tags?.forEach((tag) => {
      const weight = item.importance / 5;
      importance_weighted_intents[tag] = Math.max(
        importance_weighted_intents[tag] ?? 0,
        weight,
      );
    });
    if (!hints?.tags?.length) {
      const key = `${item.category}_wish`;
      const weight = item.importance / 5;
      importance_weighted_intents[key] = Math.max(
        importance_weighted_intents[key] ?? 0,
        weight,
      );
    }
  }

  return {
    must_do: [...must_do],
    must_avoid: [...must_avoid],
    soft_constraints,
    importance_weighted_intents,
  };
}

function formatPrivateLine(item: TripWishItemRecord): string {
  const label = wishCategoryLabel(item.category);
  const isBudgetSensitive =
    item.structuredHints?.tags?.includes('budget_sensitive') ||
    item.structuredHints?.soft_constraints?.some((c) => c.type === 'budget_cap');
  const privacy =
    item.visibility === 'private' && isBudgetSensitive
      ? '·仅规划参考'
      : item.visibility === 'private'
        ? '·私密'
        : '';
  return `- [${label}/${item.importance}${privacy}] ${item.text}`;
}

export function buildWishAgentSnapshot(
  tripId: string,
  userId: string,
  items: TripWishItemRecord[],
): WishAgentSnapshot {
  const agentItems = items.filter((i) => i.agentEligible && i.status === 'active');
  const teamItems = agentItems.filter((i) => i.visibility !== 'private');

  const privateSummaryText =
    agentItems.length === 0
      ? '（暂无愿望项）'
      : `【用户愿望 · 共 ${agentItems.length} 条】\n${agentItems.map(formatPrivateLine).join('\n')}`;

  const teamSummaryText =
    teamItems.length === 0
      ? '（团队可见愿望：无）'
      : `【团队可见愿望 · 共 ${teamItems.length} 条】\n${teamItems
          .map((i) => {
            const who = i.visibility === 'signed' ? '署名' : '有人希望';
            return `- [${who}·${wishCategoryLabel(i.category)}/${i.importance}] ${i.text}`;
          })
          .join('\n')}`;

  return {
    tripId,
    userId,
    itemCount: agentItems.length,
    privateSummaryText,
    teamSummaryText,
    structured: mergeStructured(agentItems),
    items: agentItems,
  };
}
