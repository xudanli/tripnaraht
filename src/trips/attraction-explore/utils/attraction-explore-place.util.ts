import type { Place } from '@prisma/client';
import { resolvePlaceCoordinates } from '../../../places/utils/place-coordinates.util';
import type {
  AttractionExplorePlaceMeta,
  AttractionExploreRecommendationItem,
} from '../types/attraction-explore.types';

type PlaceWithCity = Place & { City?: { name?: string | null; countryCode?: string | null } | null };

function readMetadata(place: Place): Record<string, unknown> {
  return (place.metadata as Record<string, unknown> | null) ?? {};
}

function readNestedMetadata(
  metadata: Record<string, unknown>,
  ...paths: string[]
): Record<string, unknown> | undefined {
  let current: unknown = metadata;
  for (const key of paths) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current && typeof current === 'object' ? (current as Record<string, unknown>) : undefined;
}

export function extractPlaceImageUrl(metadata: Record<string, unknown>): string | null {
  const direct = metadata.imageUrl ?? metadata.image ?? metadata.coverImage;
  if (typeof direct === 'string' && direct.trim()) return direct;

  const images = metadata.images;
  if (Array.isArray(images) && images.length > 0) {
    const primary = images.find(
      (img) => img && typeof img === 'object' && (img as { isPrimary?: boolean }).isPrimary,
    ) as { url?: string } | undefined;
    const first = images[0];
    if (primary && typeof primary.url === 'string' && primary.url.trim()) return primary.url;
    if (typeof first === 'string' && first.trim()) return first;
    if (first && typeof first === 'object' && typeof (first as { url?: string }).url === 'string') {
      return (first as { url: string }).url;
    }
  }
  return null;
}

export function extractPlaceMeta(place: Place): AttractionExplorePlaceMeta {
  const metadata = readMetadata(place);
  const time = readNestedMetadata(metadata, 'time');
  const experience = readNestedMetadata(metadata, 'experience');
  const constraints = readNestedMetadata(metadata, 'constraints');
  const capacity = readNestedMetadata(constraints ?? {}, 'capacity');

  const suggestedDwellMinutes =
    (typeof time?.recommendedDuration === 'object' &&
      typeof (time.recommendedDuration as Record<string, unknown>).typical === 'number' &&
      (time.recommendedDuration as Record<string, unknown>).typical) ||
    (typeof metadata.avgVisitDuration === 'number' ? metadata.avgVisitDuration : undefined);

  const physicalRaw =
    experience?.physicalRequirement ??
    experience?.walkingIntensity ??
    metadata.physicalLevel;
  const physicalLevel =
    physicalRaw === 'LOW' || physicalRaw === 'MEDIUM' || physicalRaw === 'HIGH'
      ? physicalRaw
      : typeof physicalRaw === 'number'
        ? physicalRaw >= 4
          ? 'HIGH'
          : physicalRaw >= 2
            ? 'MEDIUM'
            : 'LOW'
        : undefined;

  return {
    suggestedDwellMinutes: typeof suggestedDwellMinutes === 'number' ? suggestedDwellMinutes : undefined,
    detourMinutes:
      typeof metadata.detourMinutes === 'number'
        ? metadata.detourMinutes
        : typeof metadata.detour_minutes === 'number'
          ? metadata.detour_minutes
          : undefined,
    physicalLevel,
    requiresReservation: capacity?.requiresReservation === true,
    distanceFromRouteKm:
      typeof metadata.distanceFromRouteKm === 'number'
        ? metadata.distanceFromRouteKm
        : typeof metadata.distance_from_route_km === 'number'
          ? metadata.distance_from_route_km
          : undefined,
  };
}

export function mapPlaceToRecommendationItem(
  place: PlaceWithCity,
  extras?: {
    badge?: string | null;
    distanceFromRouteKm?: number;
    detourMinutes?: number;
    detourMethod?: string;
    recommendationReasons?: string[];
    score?: number;
  },
): AttractionExploreRecommendationItem {
  const metadata = readMetadata(place);
  const meta = extractPlaceMeta(place);
  if (extras?.distanceFromRouteKm != null) {
    meta.distanceFromRouteKm = extras.distanceFromRouteKm;
  }
  if (extras?.detourMinutes != null) {
    meta.detourMinutes = extras.detourMinutes;
  }
  if (extras?.detourMethod) {
    (meta as AttractionExplorePlaceMeta & { detourMethod?: string }).detourMethod = extras.detourMethod;
  }

  return {
    id: place.id,
    placeId: place.id,
    attractionId: place.uuid,
    name: place.nameCN,
    nameEN: place.nameEN,
    category: String(place.category),
    region: place.City?.name ?? (typeof metadata.region === 'string' ? metadata.region : null),
    description: place.description,
    imageUrl: extractPlaceImageUrl(metadata),
    badge: extras?.badge ?? null,
    meta,
    recommendationReasons: extras?.recommendationReasons,
    score: extras?.score,
  };
}

export function resolvePlaceCoordsOrNull(place: Place): { lat: number; lng: number } | null {
  return resolvePlaceCoordinates(place);
}

export function isIndoorFriendlyPlace(place: Place): boolean {
  const metadata = readMetadata(place);
  const constraints = readNestedMetadata(metadata, 'constraints');
  const weather = readNestedMetadata(constraints ?? {}, 'weatherSensitivity');
  return weather?.indoor === true || weather?.covered === true;
}

function readPlaceNameHaystack(place: Place): string {
  const metadata = readMetadata(place);
  return [place.nameCN, place.nameEN, metadata.name_is]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ');
}

function isCommercialSpaOrBath(name: string): boolean {
  return /蓝湖|blue lagoon|sky lagoon|天空之湖|nature baths|natural baths|nature bath|secret lagoon|laugarvatn|fontana|geo spa|public bath|swimming pool|city thermal|地热浴|温泉浴|天然浴场|自然浴场|自然温泉|n1.*bath/i.test(
    name,
  );
}

function isRainyDayChurch(name: string): boolean {
  if (
    /黑教堂|black church|búðir|budir|vik.*church|维克.*教堂|教堂山|kirkjufell|教会山/i.test(
      name,
    )
  ) {
    return false;
  }
  return /大教堂|hallgrímskirkja|哈尔格林姆斯|kirkja|cathedral|\bchurch\b|教堂/i.test(name);
}

function isRainyDayStrongInclude(place: Place): boolean {
  if (isIndoorFriendlyPlace(place)) return true;

  const metadata = readMetadata(place);
  const experience = readNestedMetadata(metadata, 'experience');
  if (experience?.exposure === 'indoor') return true;

  const name = readPlaceNameHaystack(place);
  if (isCommercialSpaOrBath(name)) return true;
  if (isRainyDayChurch(name)) return true;

  const category = String(place.category ?? '').toUpperCase();
  if (['MUSEUM', 'GALLERY', 'AQUARIUM', 'THEATER', 'CINEMA'].includes(category)) {
    return true;
  }

  return /museum|博物馆|gallery|美术馆|harpa|perlan|珍珠|whale museum|鲸|library|图书馆|national museum|艺术|aquarium|水族|indoor|fríðheimar|fridheimar|greenhouse|番茄|巧克力/i.test(
    name,
  );
}

function isRainyDayExcluded(place: Place): boolean {
  const metadata = readMetadata(place);
  const name = readPlaceNameHaystack(place);
  const canonical = String(metadata.canonicalType ?? metadata.originalCategory ?? '').toLowerCase();

  if (
    /waterfall|glacier|volcano|beach|viewpoint|hiking|trail|highland|crater|lake|geyser|ferry/.test(
      canonical,
    )
  ) {
    return true;
  }

  if (
    /高地|highland|landmannalaugar|f208|sprengisandur|laugavegur|兰德曼纳劳卡|索斯默克|thorsmork|瀑布|foss|waterfall|冰川|glacier|黑沙滩|reynisfjara|钻石冰|jökulsárlón|冰河湖|观鸟|徒步|trail|hik(e|ing)|地热区|hverir|间歇泉|geysir|峡谷|canyon|黑教堂|vik|教堂山|kirkjufell|教会山/i.test(
      name,
    )
  ) {
    return true;
  }

  // 纯湖景/高地名（不含浴场设施关键词）
  if (/^米湖$|mývatn$|myvatn$/i.test(name.trim()) || /\b米湖\b|\bmývatn\b|\bmyvatn\b/i.test(name)) {
    if (!isCommercialSpaOrBath(name)) return true;
  }

  if (/天然温泉|wild hot spring|outdoor spring/i.test(name) && !isCommercialSpaOrBath(name)) {
    return true;
  }

  return false;
}

/** 下雨天也能玩 — 以名称/本体 indoor 信号为准，不用描述里的「温泉」等词误匹配 */
export function isRainyDayFriendlyPlace(place: Place): boolean {
  if (isRainyDayStrongInclude(place)) return true;
  if (isRainyDayExcluded(place)) return false;

  const name = readPlaceNameHaystack(place);
  const metadata = readMetadata(place);
  const tags = [
    ...(Array.isArray(metadata.tags) ? metadata.tags : []),
    ...(Array.isArray(metadata.themeIds) ? metadata.themeIds : []),
  ]
    .map(String)
    .join(' ')
    .toLowerCase();

  return /\bindoor\b|museum|gallery|spa_pool|thermal_bath|culture|history/.test(tags);
}

export function rainyDayFriendlyScore(place: Place): number {
  if (!isRainyDayFriendlyPlace(place)) return -1;
  const name = readPlaceNameHaystack(place);
  let score = typeof place.rating === 'number' ? place.rating : 0;
  if (isIndoorFriendlyPlace(place)) score += 10;
  if (/museum|博物馆|gallery|美术馆|perlan|harpa/i.test(name)) score += 8;
  if (isRainyDayChurch(name)) score += 7;
  if (isCommercialSpaOrBath(name)) score += 6;
  return score;
}

export function isCoreAttraction(place: Place): boolean {
  const metadata = readMetadata(place);
  return metadata.isCoreAttraction === true || metadata.mustSee === true;
}

/**
 * 地名检索强度（0–3）。搜索结果应优先按此排序，否则会淹没在推荐分里。
 * 3=精确全名；2=名称双向包含；1=关键词命中名称；0=未命中名称。
 */
export function scoreAttractionExploreNameMatch(
  place: Place,
  query: string,
  keywords: string[] = [],
): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  const nameCN = (place.nameCN ?? '').trim().toLowerCase();
  const nameEN = (place.nameEN ?? '').trim().toLowerCase();
  if (!nameCN && !nameEN) return 0;

  if (nameCN === q || nameEN === q) return 3;

  if (
    (nameCN && (nameCN.includes(q) || q.includes(nameCN))) ||
    (nameEN && (nameEN.includes(q) || q.includes(nameEN)))
  ) {
    return 2;
  }

  const tokens = [
    ...keywords.map((k) => k.trim().toLowerCase()).filter((k) => k.length >= 2),
    ...q.split(/[\s,，、；;/\-_|]+/).filter((k) => k.length >= 2),
  ];
  const unique = [...new Set(tokens)];
  for (const token of unique) {
    if (nameCN.includes(token) || nameEN.includes(token)) return 1;
  }
  return 0;
}

export function matchesTheme(place: Place, themeId: string): boolean {
  const metadata = readMetadata(place);
  const tags = [
    ...(Array.isArray(metadata.tags) ? metadata.tags.map(String) : []),
    ...(Array.isArray(metadata.themeIds) ? metadata.themeIds.map(String) : []),
  ].map((t) => t.toLowerCase());

  const themeNeedle = themeId.replace(/_/g, ' ').toLowerCase();
  if (tags.some((t) => t.includes(themeNeedle) || themeNeedle.includes(t))) return true;

  switch (themeId) {
    case 'first_time_essentials':
      return isCoreAttraction(place);
    case 'waterfalls':
      return /瀑布|foss|waterfall/i.test(`${place.nameCN} ${place.nameEN ?? ''} ${place.description ?? ''}`);
    case 'glaciers':
      return /冰川|冰河|jökull|glacier|lagoon/i.test(`${place.nameCN} ${place.nameEN ?? ''}`);
    case 'hot_springs':
      return /温泉|地热|lagoon|hot spring|blue lagoon/i.test(`${place.nameCN} ${place.nameEN ?? ''}`);
    case 'highlands':
      return /高地|highland|landmannalaugar|f208/i.test(`${place.nameCN} ${place.nameEN ?? ''} ${JSON.stringify(metadata)}`);
    case 'photography':
      return /photo|摄影|kirkjufell|教会山|黑沙滩|钻石/i.test(`${place.nameCN} ${place.nameEN ?? ''}`);
    case 'culture_history':
      return /museum|博物馆|文化|history/i.test(`${place.nameCN} ${place.nameEN ?? ''}`);
    case 'nature_landscapes':
      return place.category === 'ATTRACTION';
    default:
      return false;
  }
}

export function matchesSuitability(place: Place, suitabilityId: string): boolean {
  const metadata = readMetadata(place);
  const experience = readNestedMetadata(metadata, 'experience');
  const suitableFor = Array.isArray(experience?.suitableFor)
    ? experience!.suitableFor.map(String)
    : [];

  const map: Record<string, string[]> = {
    family: ['FAMILY'],
    couple: ['COUPLE'],
    solo: ['SOLO'],
    seniors: ['SENIOR'],
    adventure_seekers: [],
    relaxed_pace: [],
  };

  const needles = map[suitabilityId] ?? [];
  if (needles.length > 0 && suitableFor.some((s) => needles.includes(s.toUpperCase()))) {
    return true;
  }

  const physical = extractPlaceMeta(place).physicalLevel;
  if (suitabilityId === 'seniors') return physical !== 'HIGH';
  if (suitabilityId === 'adventure_seekers') return physical === 'HIGH' || metadata.isCoreAttraction !== true;
  if (suitabilityId === 'relaxed_pace') return physical !== 'HIGH';
  return true;
}
