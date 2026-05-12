import type { UserIntentState } from '../user-intent/user-intent-state.types';
import type { TravelPersona, TravelPersonaType } from './travel-persona.types';
import { buildTravelPersona } from './persona-presets';

/**
 * 根据长期画像 + 行为记忆 + NL 片段推断人格类型。
 * 纯函数，可单测 / 回放。
 */
export function inferTravelPersonaFromUserIntent(
  userIntent: UserIntentState | undefined,
  hints?: { userInput?: string },
): TravelPersona {
  const uid = userIntent?.userId ?? 'anon';
  const text = (hints?.userInput ?? '').toLowerCase();

  const scores: Record<TravelPersonaType, number> = {
    EXPLORER: 1,
    RELAXER: 0,
    EFFICIENCY_HUNTER: 0,
    FOODIE: 0,
    CULTURE_DEEP_DIVER: 0,
    FREE_SPIRIT: 0,
  };

  // --- NL 显式 ---
  if (/轻松|不要太赶|慢点|悠闲|relax|chill|不累/i.test(text)) scores.RELAXER += 4;
  if (/效率|最优路线|赶时间|压缩|最少路程|顺路/i.test(text)) scores.EFFICIENCY_HUNTER += 4;
  if (/吃|美食|餐厅|米其林|小吃|food/i.test(text)) scores.FOODIE += 3;
  if (/博物馆|人文|深度|历史|艺术|展/i.test(text)) scores.CULTURE_DEEP_DIVER += 3;
  if (/随意|即兴|不走寻常路|随机|惊喜/i.test(text)) scores.FREE_SPIRIT += 3;
  if (/探索|打卡|多走|多看/i.test(text)) scores.EXPLORER += 2;

  if (userIntent) {
    const { longTermProfile: p, behaviorMemory: m } = userIntent;

    // 画像轴
    if (p.preferredPace < 0.42) scores.RELAXER += 3;
    if (p.preferredPace > 0.62) scores.EFFICIENCY_HUNTER += 1.5;
    if (p.preferredPace > 0.58 && p.spontaneityLevel > 0.55) scores.EXPLORER += 2;
    if (p.spontaneityLevel > 0.68) scores.FREE_SPIRIT += 2.5;
    if (p.mobilityTolerance > 0.65) scores.EFFICIENCY_HUNTER += 1;
    if (p.preferredFoodStyle.length >= 2) scores.FOODIE += 2;
    if (p.budgetSensitivity > 0.65) scores.EFFICIENCY_HUNTER += 0.5;

    // 行为模式
    const patterns = m.overridePatterns.join(' ');
    const fatigueHits = (patterns.match(/fatigue/g) || []).length;
    if (fatigueHits >= 2) scores.RELAXER += 3;
    if (patterns.includes('distance_override')) scores.EFFICIENCY_HUNTER += 2;
    if (m.acceptedPlaceIds.length >= 5 && p.preferredFoodStyle.length) scores.FOODIE += 1;
  }

  let best: TravelPersonaType = 'EXPLORER';
  let bestScore = -1;
  (Object.keys(scores) as TravelPersonaType[]).forEach((k) => {
    if (scores[k] > bestScore) {
      bestScore = scores[k];
      best = k;
    }
  });

  return buildTravelPersona(`${uid}:${best}`, best);
}
