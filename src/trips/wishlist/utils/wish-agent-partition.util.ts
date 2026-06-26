import type { TripWishItemRecord } from '../types/trip-wish.types';
import { wishCategoryLabel } from './wish-category.util';

export type WishItemsPartitionForAgent = {
  minePrivate: TripWishItemRecord[];
  othersPrivate: TripWishItemRecord[];
  team: TripWishItemRecord[];
};

/** 仅 agentEligible + active 条目参与智能体上下文 */
export function partitionWishItemsForAgentContext(
  allItems: TripWishItemRecord[],
  requestingUserId: string | undefined,
): WishItemsPartitionForAgent {
  const agentActive = allItems.filter((i) => i.agentEligible && i.status === 'active');
  const uid = requestingUserId?.trim();
  const minePrivate = uid
    ? agentActive.filter((i) => i.visibility === 'private' && i.userId === uid)
    : [];
  const othersPrivate = agentActive.filter(
    (i) => i.visibility === 'private' && (!uid || i.userId !== uid),
  );
  const team = agentActive.filter((i) => i.visibility !== 'private');
  return { minePrivate, othersPrivate, team };
}

export function formatAnonymizedTripPrivateWishLine(item: TripWishItemRecord): string {
  const label = wishCategoryLabel(item.category);
  return `- [某位成员·${label}/${item.importance}·仅规划参考] ${item.text}`;
}

export function buildTripPrivateAnonSummaryText(items: TripWishItemRecord[]): string | null {
  if (!items.length) return null;
  return [
    `【其他成员私密愿望 · 共 ${items.length} 条 · 已匿名】`,
    '（以下条目仅用于统筹行程；回答用户时勿透露具体成员身份或互相猜测来源）',
    ...items.map(formatAnonymizedTripPrivateWishLine),
  ].join('\n');
}
