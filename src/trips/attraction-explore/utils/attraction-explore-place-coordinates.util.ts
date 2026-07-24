import { ICELAND_CANONICAL_POI_COORDS } from '../../../canonical-poi-resolution/fixtures/iceland-poi-coords';
import {
  resolvePlaceCoordinates,
  type PlaceCoordinates,
} from '../../../places/utils/place-coordinates.util';
import { resolveEffectiveIcelandPlaceCoordinates } from '../../../places/utils/iceland-canonical-poi-coords.util';
import { PrismaService } from '../../../prisma/prisma.service';

type PlaceCoordInput = {
  id: number;
  nameCN?: string | null;
  nameEN?: string | null;
  metadata?: unknown;
};

const ICELAND_NAME_COORD_ALIASES: Array<{ pattern: RegExp; coords: PlaceCoordinates }> = [
  { pattern: /gullfoss|黄金瀑布/i, coords: ICELAND_CANONICAL_POI_COORDS['is.gullfoss']! },
  { pattern: /thingvellir|辛格维利尔|þingvellir/i, coords: ICELAND_CANONICAL_POI_COORDS['is.thingvellir']! },
  { pattern: /kerid|凯瑞斯/i, coords: ICELAND_CANONICAL_POI_COORDS['is.kerid_crater']! },
  { pattern: /geysir|间歇泉/i, coords: ICELAND_CANONICAL_POI_COORDS['is.geysir']! },
  { pattern: /hverir|地热区|námaskarð|namaskard/i, coords: { lat: 65.6419, lng: -16.8083 } },
  { pattern: /reykjavik|雷克雅未克/i, coords: { lat: 64.1466, lng: -21.9426 } },
  { pattern: /thorsmork|索斯默克|þórsmörk/i, coords: { lat: 63.683, lng: -19.511 } },
  { pattern: /laugavegur|劳卡吉加/i, coords: { lat: 63.85, lng: -19.35 } },
  { pattern: /sprengisandur|斯普伦吉桑杜尔/i, coords: { lat: 64.85, lng: -18.0 } },
  { pattern: /alftavatn|álftavatn|天鹅湖/i, coords: { lat: 63.857, lng: -19.225 } },
  { pattern: /seljalandsfoss|塞里雅兰/i, coords: ICELAND_CANONICAL_POI_COORDS['is.seljalandsfoss']! },
  { pattern: /skogafoss|斯科加/i, coords: ICELAND_CANONICAL_POI_COORDS['is.skogafoss']! },
  { pattern: /jokulsarlon|杰古沙龙|冰河湖/i, coords: ICELAND_CANONICAL_POI_COORDS['is.jokulsarlon']! },
  { pattern: /reynisfjara|黑沙滩/i, coords: ICELAND_CANONICAL_POI_COORDS['is.reynisfjara']! },
  { pattern: /blue lagoon|蓝湖/i, coords: ICELAND_CANONICAL_POI_COORDS['is.blue_lagoon']! },
];

function resolveIcelandCanonicalPoiId(poiId: string): PlaceCoordinates | null {
  const normalized = poiId.trim().toLowerCase();
  if (ICELAND_CANONICAL_POI_COORDS[normalized]) {
    return ICELAND_CANONICAL_POI_COORDS[normalized]!;
  }
  const suffix = normalized.replace(/^attr_/, '');
  for (const [key, coords] of Object.entries(ICELAND_CANONICAL_POI_COORDS)) {
    if (key.endsWith(suffix) || key.includes(suffix)) return coords;
  }
  return null;
}

export function resolveAttractionExplorePlaceCoordinates(
  place: PlaceCoordInput,
  postgisCoords?: PlaceCoordinates | null,
): PlaceCoordinates | null {
  const fromResolver = resolvePlaceCoordinates(place, postgisCoords);
  if (fromResolver) return fromResolver;

  const effective = resolveEffectiveIcelandPlaceCoordinates({
    id: place.id,
    nameEN: place.nameEN,
    nameCN: place.nameCN,
    metadata: place.metadata,
  });
  if (effective) return { lat: effective.lat, lng: effective.lng };

  const metadata = (place.metadata as Record<string, unknown> | undefined) ?? {};
  if (typeof metadata.poi_id === 'string') {
    const fromPoiId = resolveIcelandCanonicalPoiId(metadata.poi_id);
    if (fromPoiId) return fromPoiId;
  }

  const haystack = [place.nameCN, place.nameEN, metadata.name_is]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ');
  for (const { pattern, coords } of ICELAND_NAME_COORD_ALIASES) {
    if (pattern.test(haystack)) return coords;
  }

  return null;
}

export async function loadPlaceCoordinatesBatch(
  prisma: PrismaService,
  placeIds: number[],
): Promise<Map<number, PlaceCoordinates>> {
  const uniqueIds = [...new Set(placeIds.filter((id) => Number.isFinite(id) && id > 0))];
  const out = new Map<number, PlaceCoordinates>();
  if (uniqueIds.length === 0) return out;

  const postgisRows = await prisma.$queryRaw<Array<{ id: number; lat: number; lng: number }>>`
    SELECT id, ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
    FROM "Place"
    WHERE id = ANY(${uniqueIds}::int[]) AND location IS NOT NULL
  `;
  const postgisById = new Map<number, PlaceCoordinates>();
  for (const row of postgisRows) {
    postgisById.set(row.id, { lat: row.lat, lng: row.lng });
    out.set(row.id, { lat: row.lat, lng: row.lng });
  }

  const missingIds = uniqueIds.filter((id) => !out.has(id));
  if (missingIds.length === 0) return out;

  const places = await prisma.place.findMany({
    where: { id: { in: missingIds } },
    select: { id: true, nameCN: true, nameEN: true, metadata: true },
  });
  for (const place of places) {
    const coords = resolveAttractionExplorePlaceCoordinates(place, postgisById.get(place.id));
    if (coords) out.set(place.id, coords);
  }

  return out;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
