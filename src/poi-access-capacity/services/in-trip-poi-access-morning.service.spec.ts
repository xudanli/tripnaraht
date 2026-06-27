import { InTripPoiAccessMorningService } from './in-trip-poi-access-morning.service';
import { ICELAND_A_TIER_POI_SLUGS } from '../fixtures/is-a-tier.rules';

describe('InTripPoiAccessMorningService', () => {
  const poiAccess = {
    evaluateBatch: jest.fn(),
  };

  let service: InTripPoiAccessMorningService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InTripPoiAccessMorningService(poiAccess as never);
  });

  it('builds alerts for non-FEASIBLE POI using poiAccessSlug', async () => {
    poiAccess.evaluateBatch.mockResolvedValue([
      {
        poiId: ICELAND_A_TIER_POI_SLUGS.BLUE_LAGOON,
        verdict: 'BLOCKED',
        reason: 'Blue Lagoon：该时段已无可用库存',
        planB: [{ action: 'BOOK_NOW', detail: '改订其他时段' }],
        crowdLevel: 'HIGH',
        predictedWaitP50: 30,
        signalSources: ['BOOKING'],
      },
    ]);

    const alerts = await service.buildAlertsForDay({
      dateISO: '2026-07-15',
      items: [
        {
          id: 'item-bl',
          type: 'POI',
          title: 'Blue Lagoon',
          refundable: true,
          category: 'activity',
          poiAccessSlug: ICELAND_A_TIER_POI_SLUGS.BLUE_LAGOON,
          startTime: '2026-07-15T14:00:00.000Z',
        },
      ],
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0].itemId).toBe('item-bl');
    expect(alerts[0].verdict).toBe('BLOCKED');
    expect(alerts[0].disclosureLabel).toBe('（基于模型推断）');
  });

  it('returns empty when no resolvable POI items', async () => {
    const alerts = await service.buildAlertsForDay({
      dateISO: '2026-07-15',
      items: [
        {
          id: 'item-x',
          type: 'POI',
          title: 'Unknown Place XYZ',
          refundable: true,
          category: 'other',
        },
      ],
    });

    expect(alerts).toEqual([]);
    expect(poiAccess.evaluateBatch).not.toHaveBeenCalled();
  });
});
