import { loadTripPlacePoiEvidenceForAdjust } from './trip-place-poi-evidence.runner';
import type { TripPlacePoiEvidenceHost } from './trip-place-poi-evidence.host';

describe('trip-place-poi-evidence.runner', () => {
  it('returns empty for blank tripId', async () => {
    const host: TripPlacePoiEvidenceHost = { prisma: {} as any };
    await expect(loadTripPlacePoiEvidenceForAdjust(host, '  ')).resolves.toEqual([]);
  });
});
