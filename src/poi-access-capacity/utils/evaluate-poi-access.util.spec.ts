import {
  evaluatePoiAccessCapacity,
} from '../utils/evaluate-poi-access.util';
import {
  ICELAND_A_TIER_ACCESS_RULES,
  ICELAND_A_TIER_POI_SLUGS,
} from '../fixtures/is-a-tier.rules';

describe('evaluatePoiAccessCapacity', () => {
  const landmannRules = ICELAND_A_TIER_ACCESS_RULES.filter(
    (r) => r.poiId === ICELAND_A_TIER_POI_SLUGS.LANDMANNALAUGAR,
  );
  const blueLagoonRules = ICELAND_A_TIER_ACCESS_RULES.filter(
    (r) => r.poiId === ICELAND_A_TIER_POI_SLUGS.BLUE_LAGOON,
  );

  it('Landmannalaugar 10:30 夏季无预约 → BLOCKED（停车预约）', () => {
    const result = evaluatePoiAccessCapacity({
      poiId: ICELAND_A_TIER_POI_SLUGS.LANDMANNALAUGAR,
      poiName: 'Landmannalaugar',
      dateISO: '2026-07-15',
      arrivalTime: '10:30',
      rules: landmannRules,
    });
    expect(result.verdict).toBe('RESERVATION_REQUIRED');
    expect(result.bottleneckResource).toBe('PARKING');
    expect(result.bottleneckRuleType).toBe('PARKING_RESERVATION');
    expect(result.planB.length).toBeGreaterThan(0);
  });

  it('Landmannalaugar 08:00 夏季 → FEASIBLE（预约时段外到达）', () => {
    const result = evaluatePoiAccessCapacity({
      poiId: ICELAND_A_TIER_POI_SLUGS.LANDMANNALAUGAR,
      dateISO: '2026-07-15',
      arrivalTime: '08:00',
      rules: landmannRules,
    });
    expect(result.verdict).toBe('FEASIBLE');
  });

  it('Landmannalaugar 10:30 有停车预约 → FEASIBLE', () => {
    const result = evaluatePoiAccessCapacity({
      poiId: ICELAND_A_TIER_POI_SLUGS.LANDMANNALAUGAR,
      dateISO: '2026-07-15',
      arrivalTime: '10:30',
      rules: landmannRules,
      userReservations: [{ resource: 'PARKING', dateISO: '2026-07-15' }],
    });
    expect(result.verdict).toBe('FEASIBLE');
  });

  it('Landmannalaugar 10:30 库存售罄 → BLOCKED', () => {
    const result = evaluatePoiAccessCapacity({
      poiId: ICELAND_A_TIER_POI_SLUGS.LANDMANNALAUGAR,
      dateISO: '2026-07-15',
      arrivalTime: '10:30',
      rules: landmannRules,
      capacitySnapshots: [
        {
          poiId: ICELAND_A_TIER_POI_SLUGS.LANDMANNALAUGAR,
          dateISO: '2026-07-15',
          slotStartTime: '09:00',
          slotEndTime: '16:00',
          remaining: 0,
          soldOut: true,
          signalSource: 'PARKA',
          observedAt: '2026-06-20T08:00:00.000Z',
        },
      ],
    });
    expect(result.verdict).toBe('BLOCKED');
    expect(result.reason).toMatch(/已无可用停车位/);
  });

  it('Landmannalaugar SUV 4x4 → FEASIBLE；SEDAN → BLOCKED（车型）', () => {
    const suv = evaluatePoiAccessCapacity({
      poiId: ICELAND_A_TIER_POI_SLUGS.LANDMANNALAUGAR,
      dateISO: '2026-07-15',
      arrivalTime: '08:00',
      vehicleType: 'SUV',
      rules: landmannRules,
    });
    expect(suv.verdict).toBe('FEASIBLE');

    const sedan = evaluatePoiAccessCapacity({
      poiId: ICELAND_A_TIER_POI_SLUGS.LANDMANNALAUGAR,
      dateISO: '2026-07-15',
      arrivalTime: '08:00',
      vehicleType: 'SEDAN',
      rules: landmannRules,
    });
    expect(sedan.verdict).toBe('BLOCKED');
    expect(sedan.bottleneckRuleType).toBe('VEHICLE_RESTRICTION');
  });

  it('Blue Lagoon 无预约 → BLOCKED', () => {
    const result = evaluatePoiAccessCapacity({
      poiId: ICELAND_A_TIER_POI_SLUGS.BLUE_LAGOON,
      poiName: 'Blue Lagoon',
      dateISO: '2026-08-01',
      arrivalTime: '14:00',
      rules: blueLagoonRules,
    });
    expect(result.verdict).toBe('RESERVATION_REQUIRED');
    expect(result.bottleneckRuleType).toBe('RESERVATION_REQUIRED');
  });

  it('Blue Lagoon 有 POI 预约 → FEASIBLE', () => {
    const result = evaluatePoiAccessCapacity({
      poiId: ICELAND_A_TIER_POI_SLUGS.BLUE_LAGOON,
      dateISO: '2026-08-01',
      arrivalTime: '14:00',
      rules: blueLagoonRules,
      userReservations: [{ resource: 'POI', dateISO: '2026-08-01', slotStartTime: '14:00' }],
    });
    expect(result.verdict).toBe('FEASIBLE');
  });

  it('高拥挤快照 → FEASIBLE_WITH_RISK', () => {
    const result = evaluatePoiAccessCapacity({
      poiId: ICELAND_A_TIER_POI_SLUGS.BLUE_LAGOON,
      dateISO: '2026-08-01',
      arrivalTime: '14:00',
      rules: blueLagoonRules,
      userReservations: [{ resource: 'POI', dateISO: '2026-08-01' }],
      crowdingSnapshot: {
        poiId: ICELAND_A_TIER_POI_SLUGS.BLUE_LAGOON,
        observedAt: '2026-08-01T12:00:00.000Z',
        crowdLevel: 'HIGH',
        predictedWaitP50: 25,
        predictedWaitP90: 40,
        signalSources: ['BOOKING'],
        confidenceScore: 0.85,
      },
    });
    expect(result.verdict).toBe('FEASIBLE_WITH_RISK');
    expect(result.reason).toMatch(/基于预约库存预测/);
    expect(result.predictedWaitP50).toBe(25);
  });

  it('arrivalTime 缺失时不抛错，返回 NEEDS_CONFIRMATION', () => {
    const result = evaluatePoiAccessCapacity({
      poiId: ICELAND_A_TIER_POI_SLUGS.BLUE_LAGOON,
      dateISO: '2026-08-16',
      rules: blueLagoonRules,
    } as any);
    expect(result.verdict).toBe('NEEDS_CONFIRMATION');
    expect(result.reason).toMatch(/无法解析到达时刻/);
  });
});
