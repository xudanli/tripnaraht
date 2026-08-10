/**
 * ITINERARY_ADJUST：从绑定 Trip Place 种子化 poi_evidence 宿主。
 */

import type { PrismaService } from '../../prisma/prisma.service';

export interface TripPlacePoiEvidenceHost {
  readonly prisma: PrismaService;
}
