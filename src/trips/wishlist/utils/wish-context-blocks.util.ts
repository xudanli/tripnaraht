import type { ContextBlock } from '../../../agent/context-engine/types/context-package.types';
import type { TripWishItemRecord } from '../types/trip-wish.types';
import { buildWishAgentSnapshot } from './wish-agent-snapshot.util';
import { buildTripPrivateAnonSummaryText } from './wish-agent-partition.util';

export function buildWishlistContextBlocks(args: {
  tripId: string;
  userId: string;
  userItems: TripWishItemRecord[];
  /** 其他成员的私密愿望（agentEligible）；注入时匿名 */
  othersPrivateItems?: TripWishItemRecord[];
  teamItems: TripWishItemRecord[];
  includePrivate: boolean;
}): ContextBlock[] {
  const { tripId, userId, userItems, teamItems, includePrivate } = args;
  const othersPrivateItems = args.othersPrivateItems ?? [];
  const now = new Date().toISOString();
  const blocks: ContextBlock[] = [];

  if (includePrivate) {
    const privateSnapshot = buildWishAgentSnapshot(tripId, userId, userItems);
    if (privateSnapshot.itemCount > 0) {
      blocks.push({
        key: `WISHLIST_PRIVATE:${userId}`,
        type: 'WISHLIST_PRIVATE',
        text: privateSnapshot.privateSummaryText.replace(
          '【用户愿望',
          '【你的私密愿望',
        ),
        priority: 75,
        visibility: 'private',
        provenance: {
          source: 'db',
          identifier: `trip:${tripId}:wishlist:private:${userId}`,
          timestamp: now,
        },
        data: {
          structured: privateSnapshot.structured,
          itemIds: privateSnapshot.items.map((i) => i.id),
        },
      });
    }

    const anonText = buildTripPrivateAnonSummaryText(othersPrivateItems);
    if (anonText) {
      blocks.push({
        key: `WISHLIST_TRIP_PRIVATE:anon`,
        type: 'WISHLIST_TRIP_PRIVATE',
        text: anonText,
        priority: 74,
        visibility: 'private',
        provenance: {
          source: 'db',
          identifier: `trip:${tripId}:wishlist:private:anonymized`,
          timestamp: now,
        },
        data: {
          itemCount: othersPrivateItems.length,
          itemIds: othersPrivateItems.map((i) => i.id),
        },
      });
    }
  }

  const teamSnapshot = buildWishAgentSnapshot(tripId, userId, teamItems);
  const teamVisible = teamItems.filter(
    (i) => i.status === 'active' && i.agentEligible && i.visibility !== 'private',
  );
  if (teamVisible.length > 0) {
    blocks.push({
      key: 'WISHLIST_TEAM',
      type: 'WISHLIST_TEAM',
      text: teamSnapshot.teamSummaryText,
      priority: 70,
      visibility: 'public',
      provenance: {
        source: 'db',
        identifier: `trip:${tripId}:wishlist:team`,
        timestamp: now,
      },
      data: {
        itemCount: teamVisible.length,
      },
    });
  }

  return blocks;
}
