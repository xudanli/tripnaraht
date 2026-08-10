import {
  AddActivityNearbyCategory,
  AddActivityNearbyChip,
} from '../dto/add-activity-nearby.dto';

export function resolveAddActivityNearbyCategory(input: {
  category?: AddActivityNearbyCategory | string;
  chip?: AddActivityNearbyChip | string;
}): AddActivityNearbyCategory {
  const rawCat = String(input.category ?? '').trim().toUpperCase();
  if (rawCat && Object.values(AddActivityNearbyCategory).includes(rawCat as AddActivityNearbyCategory)) {
    return rawCat as AddActivityNearbyCategory;
  }
  const chip = String(input.chip ?? '').trim().toLowerCase();
  switch (chip) {
    case AddActivityNearbyChip.hotel:
      return AddActivityNearbyCategory.HOTEL;
    case AddActivityNearbyChip.gas:
      return AddActivityNearbyCategory.GAS_STATION;
    case AddActivityNearbyChip.supermarket:
      return AddActivityNearbyCategory.SUPERMARKET;
    case AddActivityNearbyChip.indoor:
      return AddActivityNearbyCategory.INDOOR;
    case AddActivityNearbyChip.rest:
      return AddActivityNearbyCategory.REST_AREA;
    case AddActivityNearbyChip.nearby:
      return AddActivityNearbyCategory.ATTRACTION;
    default:
      throw new Error('必须提供 category 或 chip（hotel|gas|supermarket|indoor|rest|nearby）');
  }
}

/** 各类别默认半径（米）— 冰岛自驾稀疏场景 */
export function defaultRadiusForAddActivityCategory(category: AddActivityNearbyCategory): number {
  switch (category) {
    case AddActivityNearbyCategory.GAS_STATION:
    case AddActivityNearbyCategory.SUPERMARKET:
      return 20000;
    case AddActivityNearbyCategory.HOTEL:
    case AddActivityNearbyCategory.INDOOR:
    case AddActivityNearbyCategory.REST_AREA:
      return 15000;
    case AddActivityNearbyCategory.RESTAURANT:
    case AddActivityNearbyCategory.ATTRACTION:
    default:
      return 10000;
  }
}

export function extractNearbyCoverImageUrl(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const direct = metadata.imageUrl ?? metadata.image ?? metadata.coverImage;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const images = metadata.images;
  if (Array.isArray(images) && images.length > 0) {
    const primary = images.find(
      (img) => img && typeof img === 'object' && (img as { isPrimary?: boolean }).isPrimary,
    ) as { url?: string } | undefined;
    if (primary && typeof primary.url === 'string' && primary.url.trim()) return primary.url.trim();
    const first = images[0];
    if (typeof first === 'string' && first.trim()) return first.trim();
    if (first && typeof first === 'object' && typeof (first as { url?: string }).url === 'string') {
      const url = (first as { url: string }).url.trim();
      if (url) return url;
    }
  }
  return null;
}

/** SQL 片段：是否有可用封面图（用于 ORDER BY；0=有图优先） */
export const SQL_HAS_PLACE_IMAGE = `CASE WHEN COALESCE(NULLIF(p.metadata->>'imageUrl',''), NULLIF(p.metadata->>'image',''), NULLIF(p.metadata->>'coverImage','')) IS NOT NULL THEN 0 WHEN jsonb_typeof(p.metadata->'images')='array' AND jsonb_array_length(p.metadata->'images')>0 AND COALESCE(p.metadata->'images'->0->>'url', p.metadata->'images'->>0, '')<>'' THEN 0 ELSE 1 END`;
