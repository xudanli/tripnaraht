import {
  assessEvidenceFreshness,
  buildDefaultCoverageDisclosure,
  travelEntityRefFromPlace,
  TRIPNARA_PRODUCT_BOUNDARY,
} from './index';

describe('travel-cognition', () => {
  it('locks non-transaction product boundary', () => {
    expect(TRIPNARA_PRODUCT_BOUNDARY.doesNotExecuteBooking).toBe(true);
    expect(TRIPNARA_PRODUCT_BOUNDARY.doesNotHoldInventory).toBe(true);
  });

  it('builds TravelEntityRef from Place', () => {
    const ref = travelEntityRefFromPlace({
      id: 42,
      name: '蓝湖',
      googlePlaceId: 'ChIJxxx',
    });
    expect(ref.kind).toBe('POI');
    expect(ref.externalIds?.[0].namespace).toBe('google_place_id');
  });

  it('rejects strong judgment when evidence is expired', () => {
    const now = Date.parse('2026-06-14T12:00:00.000Z');
    const result = assessEvidenceFreshness(
      {
        factType: 'WEATHER',
        observedAt: '2026-06-14T10:00:00.000Z',
        validUntil: '2026-06-14T11:00:00.000Z',
      },
      now,
    );
    expect(result.strongJudgmentAllowed).toBe(false);
    expect(result.status).toBe('EXPIRED');
  });

  it('allows strong judgment within TTL', () => {
    const now = Date.parse('2026-06-14T12:00:00.000Z');
    const result = assessEvidenceFreshness(
      {
        factType: 'ROAD',
        observedAt: '2026-06-14T11:30:00.000Z',
      },
      now,
    );
    expect(result.strongJudgmentAllowed).toBe(true);
    expect(result.status).toBe('FRESH');
  });

  it('builds default coverage disclosure without inventory/booking', () => {
    const d = buildDefaultCoverageDisclosure({
      coveredFactTypes: ['WEATHER', 'ROAD'],
      sourcesUsed: ['open-meteo', 'iceland-road-status'],
    });
    expect(d.uncoveredCapabilities).toContain('INVENTORY');
    expect(d.uncoveredCapabilities).toContain('BOOKABILITY');
    expect(d.summary).toMatch(/未检查/);
  });
});
