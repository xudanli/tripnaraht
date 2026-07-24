import type { PrismaService } from '../../prisma/prisma.service';
import type { GuideHotelCandidateRef } from './guide-itinerary-accommodation.util';

export async function loadGuideHotelCandidateRefs(
  prisma: PrismaService,
  sessionId: string,
): Promise<GuideHotelCandidateRef[]> {
  const rows = await prisma.guideInspirationCandidate.findMany({
    where: { sessionId, candidateType: 'hotel' },
    orderBy: [{ suggestedDay: 'asc' }, { routeOrder: 'asc' }],
  });
  if (rows.length === 0) return [];

  const placeIds = rows.map((r) => r.placeId).filter((id): id is number => id != null);
  const coords = new Map<number, { lat: number; lng: number }>();
  if (placeIds.length > 0) {
    const geoRows = await prisma.$queryRaw<Array<{ id: number; lat: number; lng: number }>>`
      SELECT p.id, ST_Y(p.location::geometry) as lat, ST_X(p.location::geometry) as lng
      FROM "Place" p
      WHERE p.id = ANY(${placeIds}::int[]) AND p.location IS NOT NULL
    `;
    for (const g of geoRows) {
      coords.set(g.id, { lat: g.lat, lng: g.lng });
    }
  }

  return rows.map((r) => {
    const geo = r.placeId ? coords.get(r.placeId) : undefined;
    return {
      id: r.id,
      rawName: r.rawName,
      rawNameEn: r.rawNameEn,
      placeId: r.placeId,
      suggestedDay: r.suggestedDay,
      lat: geo?.lat,
      lng: geo?.lng,
    };
  });
}
