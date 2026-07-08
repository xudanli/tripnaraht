import type { ActivityFavoriteItemDto } from '../dto/activity-favorite.dto';

export function buildItemTargetKey(itineraryItemId: string): string {
  return `item:${itineraryItemId}`;
}

export function buildPlaceTargetKey(placeId: number): string {
  return `place:${placeId}`;
}

export function resolveFavoriteTarget(input: {
  itineraryItemId?: string;
  placeId?: number;
}): { targetKey: string; itineraryItemId: string | null; placeId: number | null } {
  if (input.itineraryItemId?.trim()) {
    const id = input.itineraryItemId.trim();
    return { targetKey: buildItemTargetKey(id), itineraryItemId: id, placeId: null };
  }
  if (input.placeId != null && Number.isFinite(input.placeId)) {
    return {
      targetKey: buildPlaceTargetKey(input.placeId),
      itineraryItemId: null,
      placeId: input.placeId,
    };
  }
  throw new Error('MISSING_TARGET');
}

export function mapFavoriteRows(
  rows: Array<{
    targetKey: string;
    itineraryItemId: string | null;
    placeId: number | null;
    createdAt: Date;
  }>,
): ActivityFavoriteItemDto[] {
  return rows.map((row) => ({
    targetKey: row.targetKey,
    itineraryItemId: row.itineraryItemId,
    placeId: row.placeId,
    favoritedAt: row.createdAt.toISOString(),
  }));
}

export function extractFavoriteIdLists(favorites: ActivityFavoriteItemDto[]): {
  itineraryItemIds: string[];
  placeIds: number[];
} {
  const itineraryItemIds: string[] = [];
  const placeIds: number[] = [];
  for (const fav of favorites) {
    if (fav.itineraryItemId) itineraryItemIds.push(fav.itineraryItemId);
    if (fav.placeId != null) placeIds.push(fav.placeId);
  }
  return { itineraryItemIds, placeIds };
}
