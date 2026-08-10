/**
 * Resolve attraction-explore / mobile activity refs to local Place.id.
 * Accepts Place.uuid, googlePlaceId, or Iceland canonical slugs (is.reynisfjara).
 */

import type { PrismaService } from '../../../prisma/prisma.service';
import { getIcelandCanonicalPoiById } from '../../../canonical-poi-resolution/fixtures/iceland-canonical-poi.catalog';
import { ICELAND_CANONICAL_POI_COORDS } from '../../../canonical-poi-resolution/fixtures/iceland-poi-coords';
import { isCanonicalTravelPoiId } from '../../../canonical-poi-resolution/utils/resolve-poi-id-sync.util';
import { ICELAND_POI_SLUG_RESOLVERS } from '../../../poi-access-capacity/fixtures/iceland-poi-registry';

type PlaceHit = {
  id: number;
  nameCN: string;
  nameEN: string | null;
  category: string;
  lat: number | null;
  lng: number | null;
  metadata: Record<string, unknown> | null;
};

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function isSpecificAlias(alias: string): boolean {
  const t = alias.trim();
  if (t.length < 4) return false;
  if (/^(black sand|black sand beach|beach|瀑布|瀑布景点)$/i.test(t)) return false;
  return true;
}

function scoreCanonicalHit(
  row: PlaceHit,
  poiId: string,
  patterns: RegExp[],
  anchor: { lat: number; lng: number } | undefined,
): number {
  const hay = `${row.nameCN} ${row.nameEN ?? ''}`.toLowerCase();
  let score = 0;
  if (row.category === 'ATTRACTION') score += 30;
  for (const p of patterns) {
    if (p.test(hay)) score += 20;
  }
  const core = poiId.replace(/^is\./i, '').replace(/_/g, ' ').toLowerCase();
  if (core && hay.includes(core)) score += 40;
  if (anchor && row.lat != null && row.lng != null) {
    const km = haversineKm(anchor, { lat: row.lat, lng: row.lng });
    if (km <= 3) score += 50;
    else if (km <= 15) score += 20;
    else if (km > 80) score -= 40;
  }
  return score;
}

async function findByCanonicalMetadata(
  prisma: PrismaService,
  poiId: string,
): Promise<PlaceHit | null> {
  const rows = await prisma.$queryRaw<PlaceHit[]>`
    SELECT
      id,
      "nameCN",
      "nameEN",
      category::text as category,
      ST_Y(location::geometry) as lat,
      ST_X(location::geometry) as lng,
      metadata
    FROM "Place"
    WHERE
      metadata->>'canonical_poi_id' = ${poiId}
      OR metadata->>'poi_access_slug' = ${poiId}
      OR metadata->>'poiId' = ${poiId}
    ORDER BY CASE WHEN category = 'ATTRACTION' THEN 0 ELSE 1 END, id ASC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function searchPlacesByHint(prisma: PrismaService, hint: string): Promise<PlaceHit[]> {
  const pattern = `%${hint}%`;
  return prisma.$queryRaw<PlaceHit[]>`
    SELECT
      id,
      "nameCN",
      "nameEN",
      category::text as category,
      ST_Y(location::geometry) as lat,
      ST_X(location::geometry) as lng,
      metadata
    FROM "Place"
    WHERE location IS NOT NULL
      AND (
        "nameEN" ILIKE ${pattern}
        OR "nameCN" ILIKE ${pattern}
      )
    LIMIT 40
  `;
}

async function findByCanonicalNameHints(
  prisma: PrismaService,
  poiId: string,
): Promise<PlaceHit | null> {
  const catalog = getIcelandCanonicalPoiById(poiId);
  const resolver = ICELAND_POI_SLUG_RESOLVERS.find((r) => r.slug === poiId);
  const patterns = resolver?.patterns ?? [];
  const anchor = ICELAND_CANONICAL_POI_COORDS[poiId];

  const hints = [
    catalog?.canonicalName,
    ...(catalog?.aliases ?? []).filter(isSpecificAlias),
    poiId.replace(/^is\./i, '').replace(/_/g, ' '),
  ]
    .filter((h): h is string => Boolean(h && String(h).trim()))
    .map((h) => h.trim());

  const seen = new Set<number>();
  const candidates: PlaceHit[] = [];
  for (const hint of hints.slice(0, 6)) {
    const rows = await searchPlacesByHint(prisma, hint);
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      candidates.push(row);
    }
    if (candidates.length >= 20) break;
  }

  if (candidates.length === 0) return null;

  const ranked = candidates
    .map((row) => ({ row, score: scoreCanonicalHit(row, poiId, patterns, anchor) }))
    .sort((a, b) => b.score - a.score || a.row.id - b.row.id);

  const best = ranked[0];
  if (!best || best.score < 40) return null;
  return best.row;
}

async function stampCanonicalPoiId(
  prisma: PrismaService,
  place: PlaceHit,
  poiId: string,
): Promise<void> {
  const meta = { ...(place.metadata ?? {}) };
  if (meta.canonical_poi_id === poiId && meta.poi_access_slug === poiId) return;
  meta.canonical_poi_id = poiId;
  meta.poi_access_slug = poiId;
  await prisma.$executeRaw`
    UPDATE "Place"
    SET metadata = ${JSON.stringify(meta)}::jsonb, "updatedAt" = NOW()
    WHERE id = ${place.id}
  `;
}

/**
 * Resolve a string ref to Place.id, or null if not found.
 */
export async function resolvePlaceIdFromAttractionRef(
  prisma: PrismaService,
  attractionId: string,
): Promise<number | null> {
  const id = attractionId.trim();
  if (!id) return null;

  const byKey = await prisma.place.findFirst({
    where: { OR: [{ uuid: id }, { googlePlaceId: id }] },
    select: { id: true },
  });
  if (byKey) return byKey.id;

  if (!isCanonicalTravelPoiId(id)) return null;

  const byMeta = await findByCanonicalMetadata(prisma, id);
  if (byMeta) return byMeta.id;

  const byName = await findByCanonicalNameHints(prisma, id);
  if (!byName) return null;

  await stampCanonicalPoiId(prisma, byName, id).catch(() => undefined);
  return byName.id;
}
