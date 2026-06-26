import type { PrismaService } from '../../../prisma/prisma.service';
import type { ContextBlock } from '../../../agent/context-engine/types/context-package.types';
import { buildWishlistContextBlocks } from './wish-context-blocks.util';
import { mapTripWishRow } from './trip-wish.mapper.util';
import { partitionWishItemsForAgentContext } from './wish-agent-partition.util';

/** 活动/体验类推荐问法：须对照愿望单 activities 条目 */
export function isActivityRecommendationQuery(message: string): boolean {
  const m = message.trim();
  if (!m) return false;
  return /推荐.{0,12}(?:活动|体验|游玩|景点|项目)|活动推荐|玩什么|做什么|有什么好玩|体验推荐/i.test(m);
}

export function formatWishlistContextBlocksAsPromptInjection(blocks: ContextBlock[]): string | null {
  if (!blocks.length) return null;
  const parts = blocks.map((b) => b.text.trim()).filter(Boolean);
  if (!parts.length) return null;
  return [
    '[系统注入·行程愿望单（仅供推荐/规划参考；勿向用户复述「系统注入」字样）]',
    ...parts,
  ].join('\n');
}

/**
 * 从 DB 加载行程愿望单供 route_and_run / 轻量咨询注入：
 * - 当前用户私密愿望（全文）
 * - 其他成员私密愿望（agentEligible · 匿名）
 * - 团队可见愿望（匿名/署名）
 */
export async function loadWishlistContextBlocksForAgent(
  prisma: PrismaService,
  tripId: string,
  userId: string | undefined,
): Promise<ContextBlock[]> {
  const tid = tripId.trim();
  if (!tid) return [];

  const rows = await prisma.tripWishItem.findMany({
    where: { tripId: tid, status: 'active' },
    orderBy: { createdAt: 'desc' },
  });
  if (!rows.length) return [];

  const allItems = rows.map(mapTripWishRow);
  const { minePrivate, othersPrivate, team } = partitionWishItemsForAgentContext(
    allItems,
    userId,
  );

  return buildWishlistContextBlocks({
    tripId: tid,
    userId: userId?.trim() ?? 'unknown',
    userItems: minePrivate,
    othersPrivateItems: othersPrivate,
    teamItems: team,
    includePrivate: true,
  });
}

export async function loadWishlistPromptInjectionForAgent(
  prisma: PrismaService,
  tripId: string,
  userId: string | undefined,
): Promise<string | null> {
  const blocks = await loadWishlistContextBlocksForAgent(prisma, tripId, userId);
  return formatWishlistContextBlocksAsPromptInjection(blocks);
}
