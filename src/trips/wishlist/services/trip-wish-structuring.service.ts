import { Injectable } from '@nestjs/common';
import type { WishCategory, WishStructuredHints } from '../types/trip-wish.types';

@Injectable()
export class TripWishStructuringService {
  /** Rule-based structuring; LLM enrichment can be added later. */
  inferStructuredHints(text: string, category: WishCategory): WishStructuredHints {
    const hints: WishStructuredHints = { tags: [] };
    const lower = text.toLowerCase();

    if (/预算|花费|块钱|万元|元/.test(text)) {
      const amountMatch = text.match(/(\d+(?:\.\d+)?)\s*(万)?\s*元/);
      if (amountMatch) {
        let amount = parseFloat(amountMatch[1]);
        if (amountMatch[2]) amount *= 10000;
        const budgetScope =
          category === 'accommodation' ||
          category === 'local_transport' ||
          category === 'dining' ||
          category === 'shopping'
            ? category
            : 'total';
        hints.soft_constraints = [
          {
            type: 'budget_cap',
            category: budgetScope,
            amount,
            currency: 'CNY',
            note: text.slice(0, 120),
          },
        ];
        hints.tags?.push('budget_sensitive');
      }
    }

    if (
      category === 'destination_route' ||
      /不要太赶|留时间|休息|发呆|松弛|轻松|不紧/.test(text)
    ) {
      hints.pace = 'relaxed';
      hints.must_avoid = ['tight_schedule'];
      hints.tags?.push('pace_relaxed');
    }

    if (/极光|玻璃屋|温泉|徒步|瀑布|冰川|黑沙滩|观鲸/.test(text)) {
      const activities: string[] = [];
      if (/极光/.test(text)) activities.push('aurora_viewing');
      if (/玻璃屋/.test(text)) activities.push('glass_dome_stay');
      if (/温泉/.test(text)) activities.push('hot_spring');
      if (/徒步/.test(text)) activities.push('hiking');
      if (activities.length) {
        hints.must_do = activities;
        hints.tags?.push(...activities);
      }
    }

    if (/别|不要|避免|千万别/.test(text)) {
      hints.must_avoid = [...(hints.must_avoid ?? []), 'user_avoidance'];
      hints.tags?.push('avoidance');
    }

    if (/网红|热狗|雷克雅未克/.test(text) || lower.includes('reykjavik')) {
      hints.tags?.push('reykjavik_food');
    }

    if (!hints.tags?.length) {
      delete hints.tags;
    }

    return hints;
  }
}
