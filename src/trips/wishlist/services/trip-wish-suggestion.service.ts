import { Injectable } from '@nestjs/common';
import type { WishCategory, WishSuggestionCard } from '../types/trip-wish.types';

const CARD_TEMPLATES: Record<WishCategory, WishSuggestionCard[]> = {
  destination_route: [
    {
      id: 'card-is-relaxed-pace',
      category: 'destination_route',
      title: '行程留白',
      defaultImportance: 4,
      defaultText: '希望活动安排不要太紧，每天留一些休息和发呆的时间。',
      structuredHints: { pace: 'relaxed', must_avoid: ['tight_schedule'], tags: ['pace_relaxed'] },
    },
    {
      id: 'card-is-golden-route',
      category: 'destination_route',
      title: '经典环岛路线',
      defaultImportance: 4,
      defaultText: '希望覆盖冰岛经典环岛路线，南线 + 斯奈山半岛。',
      structuredHints: { tags: ['ring_road', 'south_coast'] },
    },
  ],
  main_transport: [
    {
      id: 'card-is-flight-comfort',
      category: 'main_transport',
      title: '大交通舒适优先',
      defaultImportance: 3,
      defaultText: '国际段航班尽量选时间合适的，减少红眼和多次中转。',
      structuredHints: { tags: ['flight_comfort'] },
    },
    {
      id: 'card-is-ferry-westman',
      category: 'main_transport',
      title: '渡轮接驳体验',
      defaultImportance: 3,
      defaultText: '如有必要，愿意体验渡轮接驳，把它当作旅程的一部分。',
      structuredHints: { tags: ['ferry'] },
    },
  ],
  accommodation: [
    {
      id: 'card-is-glass-dome',
      category: 'accommodation',
      title: '玻璃屋看极光',
      subtitle: '一晚特别住宿体验',
      defaultImportance: 5,
      defaultText: '想住一晚玻璃屋或透明穹顶房，希望能从床上看到极光。',
      structuredHints: { must_do: ['glass_dome_stay', 'aurora_viewing'], tags: ['aurora_viewing'] },
    },
    {
      id: 'card-is-accom-budget',
      category: 'accommodation',
      title: '住宿预算上限',
      defaultImportance: 4,
      defaultText: '尽量把住宿总预算控制在合理范围，不想给同行者太大经济压力，请 AI  discreetly 参考。',
      structuredHints: {
        soft_constraints: [{ type: 'budget_cap', category: 'accommodation', currency: 'CNY' }],
        tags: ['budget_sensitive'],
      },
    },
  ],
  activities: [
    {
      id: 'card-is-glacier-lagoon',
      category: 'activities',
      title: '冰河湖游船',
      defaultImportance: 4,
      defaultText: '想去杰古沙龙冰河湖，体验冰山与黑沙海岸。',
      structuredHints: { must_do: ['jokulsarlon'], tags: ['glacier'] },
    },
    {
      id: 'card-is-hot-spring',
      category: 'activities',
      title: '地热温泉',
      defaultImportance: 4,
      defaultText: '行程里安排至少一次地热温泉体验，面朝大海或山野泡汤。',
      structuredHints: { must_do: ['hot_spring'], tags: ['hot_spring'] },
    },
    {
      id: 'card-is-group-harmony',
      category: 'activities',
      title: '照顾同行节奏',
      defaultImportance: 3,
      defaultText: '希望行程安排能兼顾同行者的体力和偏好，减少摩擦。',
      structuredHints: { tags: ['group_harmony'] },
    },
  ],
  dining: [
    {
      id: 'card-is-hotdog',
      category: 'dining',
      title: '雷克雅未克网红热狗',
      defaultImportance: 3,
      defaultText: '想在雷克雅未克吃一次网红热狗摊。',
      structuredHints: { must_do: ['reykjavik_hotdog'], tags: ['reykjavik_food'] },
    },
    {
      id: 'card-is-local-seafood',
      category: 'dining',
      title: '本地海鲜',
      defaultImportance: 3,
      defaultText: '想尝试新鲜本地海鲜，接受适度溢价。',
      structuredHints: { tags: ['seafood'] },
    },
  ],
  local_transport: [
    {
      id: 'card-is-self-drive',
      category: 'local_transport',
      title: '环岛自驾',
      defaultImportance: 4,
      defaultText: '希望以自驾为主，灵活停靠风景点。',
      structuredHints: { tags: ['self_drive'] },
    },
    {
      id: 'card-is-no-long-drive',
      category: 'local_transport',
      title: '控制单日驾驶',
      defaultImportance: 4,
      defaultText: '单日驾驶时间不要太长，安全舒适优先。',
      structuredHints: { must_avoid: ['long_drive_days'], tags: ['driving_limit'] },
    },
  ],
  shopping: [
    {
      id: 'card-is-local-wool',
      category: 'shopping',
      title: '冰岛羊毛纪念品',
      defaultImportance: 2,
      defaultText: '想留时间逛逛本地羊毛制品或特色纪念品店。',
      structuredHints: { tags: ['shopping', 'local_craft'] },
    },
  ],
  insurance_visa: [
    {
      id: 'card-is-schengen-visa',
      category: 'insurance_visa',
      title: '申根签证准备',
      defaultImportance: 4,
      defaultText: '希望提前确认签证与入境材料，避免临行前才发现问题。',
      structuredHints: { tags: ['visa', 'schengen'] },
    },
    {
      id: 'card-is-travel-insurance',
      category: 'insurance_visa',
      title: '旅行保险',
      defaultImportance: 3,
      defaultText: '希望配置合适的旅行保险，覆盖自驾和户外活动风险。',
      structuredHints: { tags: ['travel_insurance'] },
    },
  ],
};

@Injectable()
export class TripWishSuggestionService {
  getSuggestedCards(category?: WishCategory, destination?: string): WishSuggestionCard[] {
    const isIceland = !destination || /冰岛|iceland|is\b/i.test(destination);
    const pool: WishSuggestionCard[] = [];

    if (category) {
      pool.push(...(CARD_TEMPLATES[category] ?? []));
    } else {
      for (const cards of Object.values(CARD_TEMPLATES)) {
        pool.push(...cards);
      }
    }

    if (!isIceland) {
      return pool.map((c) => ({
        ...c,
        subtitle: c.subtitle ?? `适用于 ${destination ?? '目的地'}`,
      }));
    }

    return pool.slice(0, category ? 6 : 8);
  }

  findCardById(cardId: string): WishSuggestionCard | null {
    for (const cards of Object.values(CARD_TEMPLATES)) {
      const hit = cards.find((c) => c.id === cardId);
      if (hit) return hit;
    }
    return null;
  }
}
