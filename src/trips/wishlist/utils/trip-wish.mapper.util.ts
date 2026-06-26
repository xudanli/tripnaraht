import type { TripWishItem } from '@prisma/client';
import type {
  TripWishItemRecord,
  WishCategory,
  WishInputMode,
  WishSourceRef,
  WishStatus,
  WishStructuredHints,
  WishVisibility,
} from '../types/trip-wish.types';
import { normalizeWishCategory } from './wish-category.util';

export function mapTripWishRow(row: TripWishItem): TripWishItemRecord {
  const category = normalizeWishCategory(row.category);
  return {
    id: row.id,
    tripId: row.tripId,
    userId: row.userId,
    category,
    text: row.text,
    importance: row.importance,
    inputMode: row.inputMode as WishInputMode,
    sourceRef: (row.sourceRef as WishSourceRef | null) ?? null,
    visibility: row.visibility as WishVisibility,
    agentEligible: row.agentEligible,
    structuredHints: (row.structuredHints as WishStructuredHints | null) ?? null,
    status: row.status as WishStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
